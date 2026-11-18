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
  /** Pages that had no extractable text (reported to the model and the UI) */
  unreadablePages?: Array<{ docName: string; pageNumber?: number }>
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
  targetPageNumbers: number[]
  targetClauses: string[]
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

  // Extract explicit page number references (e.g., "Page 45", "pg. 12")
  const pageMatches = q.match(/\b(?:page|pg\.?|page no\.?)\s*(\d+)\b/g) || []
  const targetPageNumbers = pageMatches
    .map(m => {
      const d = m.match(/\d+/)
      return d ? parseInt(d[0], 10) : null
    })
    .filter((n): n is number => n !== null)

  // Extract explicit clause or section references (e.g., "clause 4.2", "section 3", "annexure a")
  const clauseMatches = q.match(/\b(?:clause|section|para|annexure|schedule|table)\s*([0-9]+(?:\.[0-9]+)*|[a-z0-9]+)/gi) || []
  const targetClauses = clauseMatches.map(c => c.trim())

  return {
    isNumericQuery,
    isDateQuery,
    isEligibilityQuery,
    isBoqQuery,
    numbers,
    identifiers,
    targetPageNumbers,
    targetClauses,
  }
}

/**
 * Domain synonyms so a question phrased differently from the tender still
 * reaches the right clause (lexical expansion only; no invented content).
 */
const QUERY_EXPANSIONS: Record<string, string[]> = {
  turnover: ['turnover', 'maat', 'annual', 'financial', 'revenue'],
  emd: ['emd', 'earnest', 'bid security', 'security deposit'],
  experience: ['experience', 'similar', 'completed', 'work order', 'commissioning'],
  eligibility: ['eligibility', 'qualification', 'qualifying', 'criteria', 'pre-qualification'],
  fee: ['fee', 'cost', 'tender fee', 'document fee', 'processing'],
  deadline: ['deadline', 'last date', 'due date', 'submission', 'closing'],
  pbg: ['pbg', 'performance', 'guarantee', 'security'],
  gst: ['gst', 'goods and services tax', 'tax'],
  maf: ['maf', 'manufacturer', 'authorization', 'authorisation', 'oem'],
  networth: ['net worth', 'networth', 'net-worth'],
  patrata: ['eligibility', 'qualification'],
}

/** Query terms with weights: the user's own words 1.0, synonyms 0.3. */
function expandQueryTokens(tokens: string[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const t of tokens) out.set(t, 1)
  for (const t of tokens) {
    for (const [key, syns] of Object.entries(QUERY_EXPANSIONS)) {
      if (t === key || syns.includes(t)) {
        syns.forEach(s =>
          s.split(/\s+/).forEach(w => {
            if (w.length > 1 && !STOP_WORDS.has(w) && !out.has(w)) out.set(w, 0.3)
          })
        )
      }
    }
  }
  return out
}

const isUnreadable = (c: DocumentPageChunk) => c.content.startsWith('[EXTRACTION FAILED')
/** Unreadable (scanned) pages may still carry a partial text layer / OCR text */
const hasPartialText = (c: DocumentPageChunk) =>
  /\[(Digital text layer on this page|DIGITAL TEXT LAYER|OCR TEXT|VISION TRANSCRIPTION)/.test(c.content)

/**
 * Okapi BM25 index over the chunks of the CURRENT request only (the uploaded
 * documents), so evidence can never come from another tender.
 */
function buildBm25(chunks: DocumentPageChunk[]) {
  const docs = chunks.map(c => {
    const tokens = tokenize(`${c.sectionTitle || ''} ${c.clauseOrRef || ''} ${c.content}`)
    const tf = new Map<string, number>()
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1)
    return { tf, len: tokens.length }
  })
  const N = docs.length || 1
  const avgLen = docs.reduce((s, d) => s + d.len, 0) / N || 1
  const df = new Map<string, number>()
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) || 0) + 1)

  const k1 = 1.2
  const b = 0.75
  return (idx: number, queryTokens: Map<string, number>): number => {
    const d = docs[idx]
    let s = 0
    for (const [q, w] of queryTokens) {
      const f = d.tf.get(q)
      if (!f) continue
      const n = df.get(q) || 0
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5))
      s += w * idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / avgLen)))
    }
    return s
  }
}

/**
 * Calculate match score for a chunk: BM25 relevance plus explicit-reference
 * boosts (page / clause / identifiers the user actually typed).
 */
function scoreChunk(
  chunk: DocumentPageChunk,
  bm25: number,
  fullQuery: string,
  entities: ReturnType<typeof extractQueryEntities>
): number {
  // Fully unreadable pages carry no text; partly-scanned pages keep their digital text searchable.
  if (isUnreadable(chunk) && !hasPartialText(chunk)) return 0
  let score = bm25
  const contentLower = chunk.content.toLowerCase()
  const titleLower = (chunk.sectionTitle || '').toLowerCase()

  // Explicit page number the user asked about
  if (chunk.pageNumber && entities.targetPageNumbers.includes(chunk.pageNumber)) {
    score += 50
  }

  // Explicit clause / section reference the user asked about
  for (const tc of entities.targetClauses) {
    const tcl = tc.toLowerCase()
    if (chunk.clauseOrRef && chunk.clauseOrRef.toLowerCase().includes(tcl)) score += 20
    if (titleLower.includes(tcl) || contentLower.includes(tcl)) score += 10
  }

  // Exact phrase match of the whole question
  if (fullQuery.length > 8 && contentLower.includes(fullQuery.toLowerCase())) {
    score += 15
  }

  // Identifiers / tender numbers typed by the user
  for (const id of entities.identifiers) {
    if (chunk.content.includes(id)) score += 8
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
export interface RetrievalOptions {
  /**
   * Vector-search similarities (chunk id → cosine similarity) for the same
   * chunks. When given, BM25 and vector rankings are combined with Reciprocal
   * Rank Fusion so a page can be found by exact terms OR by meaning.
   */
  semanticScores?: Map<string, number>
  /** Minimum cosine similarity for a vector hit to count on its own */
  minSimilarity?: number
}

const RRF_K = 60

export function retrieveContextForQuery(
  query: string,
  allChunks: DocumentPageChunk[],
  maxTokens: number = 25000,
  options: RetrievalOptions = {}
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

  const queryTokens = expandQueryTokens(tokenize(query))
  const entities = extractQueryEntities(query)
  const bm25 = buildBm25(allChunks)

  // Lexical (BM25 + explicit page/clause boosts) scores
  let scoredChunks = allChunks.map((chunk, idx) => ({
    chunk,
    score: scoreChunk(chunk, bm25(idx, queryTokens), query, entities),
  }))
  scoredChunks.sort((a, b) => b.score - a.score)

  // Hybrid: fuse lexical and vector rankings (Reciprocal Rank Fusion)
  const sem = options.semanticScores
  if (sem && sem.size > 0) {
    const minSim = options.minSimilarity ?? 0.25
    const lexRank = new Map<string, number>()
    scoredChunks.filter(s => s.score > 0).forEach((s, i) => lexRank.set(s.chunk.id, i + 1))
    const semRank = new Map<string, number>()
    Array.from(sem.entries())
      .filter(([, v]) => v >= minSim)
      .sort((a, b) => b[1] - a[1])
      .forEach(([id], i) => semRank.set(id, i + 1))
    scoredChunks = allChunks
      .map(chunk => {
        if (isUnreadable(chunk) && !hasPartialText(chunk)) return { chunk, score: 0 }
        const l = lexRank.get(chunk.id)
        const s = semRank.get(chunk.id)
        // ×1000 keeps fused scores on a readable scale; explicit page requests still win
        let fused = (l ? 1 / (RRF_K + l) : 0) + (s ? 1 / (RRF_K + s) : 0)
        if (chunk.pageNumber && entities.targetPageNumbers.includes(chunk.pageNumber)) fused += 1 / RRF_K
        return { chunk, score: fused * 1000 }
      })
      .sort((a, b) => b.score - a.score)
  }

  // Pages that carry no text are reported, never silently ignored.
  const unreadableChunks = allChunks.filter(isUnreadable)
  const topScore = scoredChunks[0]?.score || 0
  const fusedMode = !!(sem && sem.size > 0)

  // Select top chunks with Proximity Windowing (include adjacent pages for continuous reading)
  const selectedChunkIds = new Set<string>()
  const selectedChunks: DocumentPageChunk[] = []
  const maxChars = maxTokens * 4 // Rough estimate: 1 token ~= 4 chars
  let accumulatedChars = 0

  // 1. Pick top matches
  const topMatches = scoredChunks.slice(0, 14)
  let rank = 0

  for (const item of topMatches) {
    if (accumulatedChars >= maxChars) break
    // Only relevant evidence: drop zero-score chunks and long-tail matches far
    // below the best hit (they were what produced off-topic "evidence").
    if (item.score <= 0) break
    // RRF scores are compressed (1/61 … 1/80), so use a rank cap instead of a ratio there
    if (fusedMode ? selectedChunks.length >= 10 : selectedChunks.length >= 6 && item.score < topScore * 0.3) break
    item.chunk.relevanceScore = Math.round(item.score * 100) / 100
    rank++

    const ch = item.chunk
    if (!selectedChunkIds.has(ch.id)) {
      selectedChunkIds.add(ch.id)
      selectedChunks.push(ch)
      accumulatedChars += ch.charCount

      // Proximity windowing for the strongest hits only: tables and clauses often
      // continue on the next/previous page.
      if (rank <= 4 && ch.docType === 'pdf' && ch.pageNumber && ch.totalPages && ch.totalPages > 1) {
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
    if (chunk.clauseOrRef) {
      header += ` | CLAUSE: "${chunk.clauseOrRef}"`
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
      clauseOrRef: chunk.clauseOrRef,
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

  if (selectedChunks.length === 0) {
    contextOutput +=
      '(No passage in the uploaded document(s) matched this question. Treat the information as NOT FOUND unless it appears in a scanned page listed below.)\n\n'
  }

  if (unreadableChunks.length > 0) {
    const byDoc = new Map<string, number[]>()
    for (const c of unreadableChunks) {
      const arr = byDoc.get(c.docName) || []
      if (c.pageNumber) arr.push(c.pageNumber)
      byDoc.set(c.docName, arr)
    }
    contextOutput += '### ⚠️ EXTRACTION STATUS: PAGES THAT COULD NOT BE READ\n'
    for (const [doc, pages] of byDoc) {
      contextOutput += `- "${doc}": page(s) ${pages.join(', ') || 'unknown'} have NO extracted text (scanned without OCR result, parse error, or page limit).\n`
    }
    contextOutput +=
      'Rule: if the answer could be on these pages and is not in the text above, reply "Document Extraction Incomplete – Manual Verification Required." and name the unreadable pages. Never guess their content.\n\n'
  }

  // Calculate unique document pages covered
  const uniquePages = new Set(
    allChunks.filter(c => c.pageNumber).map(c => `${c.docName}-p${c.pageNumber}`)
  )

  return {
    unreadablePages: unreadableChunks.map(c => ({ docName: c.docName, pageNumber: c.pageNumber })),
    formattedContext: contextOutput,
    retrievedChunks: selectedChunks,
    candidateSources,
    conflicts,
    totalDocumentPagesAnalyzed: uniquePages.size || allChunks.length,
    totalChunksAnalyzed: allChunks.length,
  }
}

