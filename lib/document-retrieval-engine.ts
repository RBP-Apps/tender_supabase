import { DocumentPageChunk, DocumentSourceCitation } from '@/types/document-understanding'

export interface RetrievalResult {
  formattedContext: string
  retrievedChunks: DocumentPageChunk[]
  candidateSources: DocumentSourceCitation[]
  conflicts: Array<{
    field: string
    values: Array<{ source: string; value: string }>
  }>
  totalDocumentPagesAnalyzed: number
  totalChunksAnalyzed: number
}

// Common stopwords to filter out for higher retrieval precision
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'and', 'or', 'not', 'no', 'but', 'if', 'what', 'which',
  'who', 'whom', 'this', 'that', 'these', 'those', 'there', 'their', 'they',
  'it', 'its', 'as', 'can', 'could', 'should', 'would', 'will', 'shall',
  'me', 'my', 'we', 'our', 'you', 'your', 'he', 'she', 'him', 'her',
  'kya', 'hai', 'kaise', 'hoga', 'mein', 'par', 'se', 'ko', 'aur', 'ya',
  'batao', 'dikhaye', 'de', 'do', 'chahiye', 'kar', 'karo', 'hona', 'tha',
])

/**
 * Tokenize and normalize query text
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s\u0900-\u097F\-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP_WORDS.has(t))
}

/**
 * Extract numeric and date entities from query
 */
function extractQueryEntities(query: string): {
  isNumericQuery: boolean
  isDateQuery: boolean
  isEligibilityQuery: boolean
  isBoqQuery: boolean
  numbers: string[]
  identifiers: string[]
} {
  const q = query.toLowerCase()
  const isNumericQuery =
    /(?:cost|value|amount|price|turnover|rate|emd|pbg|fee|budget|rupees|rs|inr|crore|lakh|percentage|%|penalty|kitna|kitne|paisa|karch)/i.test(
      q
    )
  const isDateQuery =
    /(?:date|deadline|due|time|schedule|submission|extension|opening|corrigendum|kab|tarikh)/i.test(
      q
    )
  const isEligibilityQuery =
    /(?:eligibility|qualification|criteria|experience|turnover|ca|certificate|maf|iso|nabl|bis|requirement|patrata)/i.test(
      q
    )
  const isBoqQuery =
    /(?:boq|bill of quantity|items|specification|qty|quantity|rates|price schedule|sheet)/i.test(
      q
    )

  const numbers = query.match(/\b\d+(?:[,\.]\d+)?\b/g) || []
  const identifiers =
    query.match(/\b[A-Z0-9_\-\/]{3,20}\b/g) || []

  return {
    isNumericQuery,
    isDateQuery,
    isEligibilityQuery,
    isBoqQuery,
    numbers,
    identifiers,
  }
}

/**
 * Calculate match score for a chunk against user query
 */
function scoreChunk(
  chunk: DocumentPageChunk,
  queryTokens: string[],
  fullQuery: string,
  entities: ReturnType<typeof extractQueryEntities>
): number {
  let score = 0
  const contentLower = chunk.content.toLowerCase()
  const titleLower = (chunk.sectionTitle || '').toLowerCase()

  // 1. Exact phrase matching in content or title
  if (fullQuery.length > 5 && contentLower.includes(fullQuery.toLowerCase())) {
    score += 80
  }

  // 2. Keyword frequency & match
  for (const token of queryTokens) {
    if (titleLower.includes(token)) {
      score += 15 // Heavy boost for section title match
    }

    // Count occurrences in content (capped to avoid repetition bias)
    let count = 0
    let pos = contentLower.indexOf(token)
    while (pos !== -1 && count < 6) {
      count++
      pos = contentLower.indexOf(token, pos + token.length)
    }
    score += count * 4
  }

  // 3. Entity boosts
  // Numeric boost: if query asks for numbers, boost chunks with currency, digits, and totals
  if (entities.isNumericQuery) {
    if (/(?:Rs\.?|INR|₹|\bcrore\b|\blakh\b|\btotal\b|\bcost\b|\bamount\b)/i.test(chunk.content)) {
      score += 25
    }
    if (chunk.hasTables) {
      score += 20
    }
  }

  // Date boost: if query asks for dates, boost chunks with dates & deadlines
  if (entities.isDateQuery) {
    if (/\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b|\b(?:due date|deadline|submission date)\b/i.test(chunk.content)) {
      score += 30
    }
  }

  // Eligibility boost
  if (entities.isEligibilityQuery) {
    if (/(?:turnover|experience|qualification|eligibility criteria|past performance|audited)/i.test(chunk.content)) {
      score += 25
    }
  }

  // BOQ / Sheet boost
  if (entities.isBoqQuery && chunk.docType === 'excel') {
    score += 30
  }

  // 4. Identifier / tender number boost
  for (const id of entities.identifiers) {
    if (chunk.content.includes(id)) {
      score += 40
    }
  }

  // 5. Keyword array match from parser
  if (Array.isArray(chunk.keywords)) {
    for (const kw of chunk.keywords) {
      if (queryTokens.includes(kw.toLowerCase())) {
        score += 8
      }
    }
  }

  return score
}

/**
 * Detect potential conflicting figures across different pages or corrigenda
 */
function detectConflicts(chunks: DocumentPageChunk[]): Array<{
  field: string
  values: Array<{ source: string; value: string }>
}> {
  const conflicts: Array<{ field: string; values: Array<{ source: string; value: string }> }> = []

  // Check for differing EMD or Submission Date across pages/chunks
  const dateMap: Array<{ source: string; date: string }> = []
  const amountMap: Array<{ source: string; amount: string }> = []

  for (const chunk of chunks) {
    const src = `${chunk.docName}${chunk.pageNumber ? ` (Page ${chunk.pageNumber})` : ''}${chunk.sheetName ? ` (Sheet ${chunk.sheetName})` : ''}`

    // Look for deadline dates
    const dateMatches = chunk.content.match(/(?:due date|submission deadline|last date)[\s\:\-]+([^\n,]{5,40})/i)
    if (dateMatches) {
      dateMap.push({ source: src, date: dateMatches[1].trim() })
    }

    // Look for EMD amounts
    const emdMatches = chunk.content.match(/(?:EMD|Earnest Money)[\s\:\-]+([^\n,]{3,35})/i)
    if (emdMatches) {
      amountMap.push({ source: src, amount: emdMatches[1].trim() })
    }
  }

  // Check if multiple distinct dates exist
  const uniqueDates = Array.from(new Set(dateMap.map(d => d.date)))
  if (uniqueDates.length > 1) {
    conflicts.push({
      field: 'Bid Submission Deadline / Due Date',
      values: dateMap.map(d => ({ source: d.source, value: d.date })),
    })
  }

  // Check if multiple distinct EMD amounts exist
  const uniqueAmounts = Array.from(new Set(amountMap.map(a => a.amount)))
  if (uniqueAmounts.length > 1) {
    conflicts.push({
      field: 'EMD Amount / Deposit',
      values: amountMap.map(a => ({ source: a.source, value: a.amount })),
    })
  }

  return conflicts
}

/**
 * Retrieve top relevant chunks and format grounded context for LLM
 */
export function retrieveContextForQuery(
  query: string,
  allChunks: DocumentPageChunk[],
  maxTokens: number = 25000
): RetrievalResult {
  if (allChunks.length === 0) {
    return {
      formattedContext: '',
      retrievedChunks: [],
      candidateSources: [],
      conflicts: [],
      totalDocumentPagesAnalyzed: 0,
      totalChunksAnalyzed: 0,
    }
  }

  const queryTokens = tokenize(query)
  const entities = extractQueryEntities(query)

  // Score all chunks
  const scoredChunks = allChunks.map(chunk => ({
    chunk,
    score: scoreChunk(chunk, queryTokens, query, entities),
  }))

  // Sort descending by score
  scoredChunks.sort((a, b) => b.score - a.score)

  // Select top chunks with Proximity Windowing (include adjacent pages for continuous reading)
  const selectedChunkIds = new Set<string>()
  const selectedChunks: DocumentPageChunk[] = []
  const maxChars = maxTokens * 4 // Rough estimate: 1 token ~= 4 chars
  let accumulatedChars = 0

  // 1. Pick top matches
  const topMatches = scoredChunks.slice(0, 20)

  for (const item of topMatches) {
    if (accumulatedChars >= maxChars) break
    if (item.score <= 0 && selectedChunks.length >= 5) break

    const ch = item.chunk
    if (!selectedChunkIds.has(ch.id)) {
      selectedChunkIds.add(ch.id)
      selectedChunks.push(ch)
      accumulatedChars += ch.charCount

      // Proximity Windowing: If this chunk is from a multi-page PDF, pull adjacent pages
      if (ch.docType === 'pdf' && ch.pageNumber && ch.totalPages && ch.totalPages > 1) {
        const prevPageNum = ch.pageNumber - 1
        const nextPageNum = ch.pageNumber + 1

        if (prevPageNum >= 1 && accumulatedChars < maxChars) {
          const prevChunk = allChunks.find(
            c => c.docName === ch.docName && c.pageNumber === prevPageNum
          )
          if (prevChunk && !selectedChunkIds.has(prevChunk.id)) {
            selectedChunkIds.add(prevChunk.id)
            selectedChunks.push(prevChunk)
            accumulatedChars += prevChunk.charCount
          }
        }

        if (nextPageNum <= ch.totalPages && accumulatedChars < maxChars) {
          const nextChunk = allChunks.find(
            c => c.docName === ch.docName && c.pageNumber === nextPageNum
          )
          if (nextChunk && !selectedChunkIds.has(nextChunk.id)) {
            selectedChunkIds.add(nextChunk.id)
            selectedChunks.push(nextChunk)
            accumulatedChars += nextChunk.charCount
          }
        }
      }
    }
  }

  // Sort selected chunks by document name and page number for linear reading continuity
  selectedChunks.sort((a, b) => {
    if (a.docName !== b.docName) return a.docName.localeCompare(b.docName)
    if (a.pageNumber && b.pageNumber) return a.pageNumber - b.pageNumber
    if (a.rowStart && b.rowStart) return a.rowStart - b.rowStart
    return 0
  })

  // Format context with explicit unambiguous boundaries
  let contextOutput = '### EXTRACTED GROUND-TRUTH DOCUMENT SECTIONS (Strict Source Coordinates):\n\n'

  const candidateSources: DocumentSourceCitation[] = []

  for (const chunk of selectedChunks) {
    let header = `=== [DOCUMENT: "${chunk.docName}"`
    if (chunk.pageNumber) {
      header += ` | PAGE: ${chunk.pageNumber}${chunk.totalPages ? ` of ${chunk.totalPages}` : ''}`
    }
    if (chunk.sheetName) {
      header += ` | SHEET: "${chunk.sheetName}"`
    }
    if (chunk.cellRange) {
      header += ` | CELLS: ${chunk.cellRange}`
    }
    if (chunk.sectionTitle) {
      header += ` | SECTION: "${chunk.sectionTitle}"`
    }
    if (chunk.isScanned) {
      header += ` | OCR / Scanned Page`
    }
    header += `] ===`

    contextOutput += `${header}\n${chunk.content}\n\n`

    candidateSources.push({
      docName: chunk.docName,
      pageNumber: chunk.pageNumber,
      sheetName: chunk.sheetName,
      cellRef: chunk.cellRange,
      sectionTitle: chunk.sectionTitle,
      snippet: chunk.content.slice(0, 200).replace(/\n+/g, ' '),
    })
  }

  // Detect conflicts across selected chunks
  const conflicts = detectConflicts(selectedChunks)
  if (conflicts.length > 0) {
    contextOutput += '### ⚠️ SYSTEM NOTICE: POTENTIAL CONFLICTING REFERENCES DETECTED IN DOCUMENTS:\n'
    for (const c of conflicts) {
      contextOutput += `- **${c.field}** has different values across documents:\n`
      for (const val of c.values) {
        contextOutput += `  * ${val.source}: "${val.value}"\n`
      }
    }
    contextOutput += 'Rule: YOU MUST REPORT BOTH VALUES AND THEIR EXACT PAGES. NEVER GUESS OR PICK ONE VALUE ON YOUR OWN.\n\n'
  }

  // Calculate unique document pages covered
  const uniquePages = new Set(
    allChunks.filter(c => c.pageNumber).map(c => `${c.docName}-p${c.pageNumber}`)
  )

  return {
    formattedContext: contextOutput,
    retrievedChunks: selectedChunks,
    candidateSources,
    conflicts,
    totalDocumentPagesAnalyzed: uniquePages.size || allChunks.length,
    totalChunksAnalyzed: allChunks.length,
  }
}

