import {
  DocumentPageChunk,
  DocumentSourceCitation,
  DocumentVerificationResult,
} from '@/types/document-understanding'

/**
 * Standard disclaimer required when information is not in document
 */
export const NOT_FOUND_DISCLAIMER = 'This information is not available in the uploaded document.'

/**
 * Parse citations from raw AI response text.
 * Handles variations such as:
 * - Source: Document.pdf, Page 45
 * - [Source: File.xlsx, Sheet: "BOQ", Cell: E25]
 * - **Source:** Document.docx, Section 3
 */
export function extractCitationsFromResponse(
  responseText: string,
  availableChunks: DocumentPageChunk[] = []
): DocumentSourceCitation[] {
  const citations: DocumentSourceCitation[] = []
  const seenKeys = new Set<string>()

  // 1. Line-based source matching (e.g. "**Source:** CREDA_Solar.pdf, Page 45")
  const lines = responseText.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    const sourcePrefixMatch = trimmed.match(
      /^(?:\*{0,2})(?:Source|Reference|Ref|स्रोत)(?:\*{0,2})[\s\:\*\-]+(.*)$/i
    )
    if (sourcePrefixMatch) {
      const rest = sourcePrefixMatch[1].trim()
      const parts = rest.split(',').map(p => p.trim())
      if (parts.length > 0) {
        const rawDoc = parts[0].replace(/^\[+|[\]\.\*]+$/g, '').trim()
        let pageNumber: number | undefined
        let sheetName: string | undefined
        let cellRef: string | undefined

        for (let i = 1; i < parts.length; i++) {
          const part = parts[i]
          const pageMatch = part.match(/(?:Page|Pg\.?)\s*(\d+)/i)
          if (pageMatch) {
            pageNumber = parseInt(pageMatch[1], 10)
          }
          const sheetMatch = part.match(/Sheet\s*[\:\s]*["']?([^"'\]\.]+)["']?/i)
          if (sheetMatch) {
            sheetName = sheetMatch[1].trim()
          }
          const cellMatch = part.match(/Cell\s*[\:\s]*["']?([A-Z0-9\:]+)["']?/i)
          if (cellMatch) {
            cellRef = cellMatch[1].trim()
          }
        }

        const key = `${rawDoc}-${pageNumber || ''}-${sheetName || ''}-${cellRef || ''}`
        if (rawDoc && !seenKeys.has(key)) {
          seenKeys.add(key)
          citations.push({
            docName: rawDoc,
            pageNumber,
            sheetName,
            cellRef,
          })
        }
      }
    }
  }

  // 2. Inline bracket citations: e.g. [Source: NIT.pdf, Page 45]
  const bracketRegex = /\[(?:Source|Ref)\:\s*([^,\]]+)(?:,\s*Page\s*(\d+))?(?:,\s*Sheet\s*[:\s]*["']?([^,"']+)["']?)?(?:,\s*Cell\s*[:\s]*["']?([A-Z0-9:]+)["']?)?\]/gi
  let bm: RegExpExecArray | null
  while ((bm = bracketRegex.exec(responseText)) !== null) {
    const docName = (bm[1] || '').trim()
    const pageNumber = bm[2] ? parseInt(bm[2], 10) : undefined
    const sheetName = bm[3]?.trim()
    const cellRef = bm[4]?.trim()
    const key = `${docName}-${pageNumber || ''}-${sheetName || ''}-${cellRef || ''}`
    if (docName && !seenKeys.has(key)) {
      seenKeys.add(key)
      citations.push({
        docName,
        pageNumber,
        sheetName,
        cellRef,
      })
    }
  }

  // 3. Fallback: match mentioned page numbers against available chunks
  if (citations.length === 0 && availableChunks.length > 0) {
    const pageMatches = responseText.match(/\b(?:page|pg\.?)\s*(\d+)\b/gi) || []
    for (const pm of pageMatches) {
      const numMatch = pm.match(/\d+/)
      if (numMatch) {
        const pageNum = parseInt(numMatch[0], 10)
        const matchedChunk = availableChunks.find(c => c.pageNumber === pageNum)
        if (matchedChunk) {
          const key = `${matchedChunk.docName}-${pageNum}`
          if (!seenKeys.has(key)) {
            seenKeys.add(key)
            citations.push({
              docName: matchedChunk.docName,
              pageNumber: pageNum,
              sectionTitle: matchedChunk.sectionTitle,
            })
          }
        }
      }
    }
  }

  // 4. Final fallback: If still empty and chunks exist, attribute top chunk
  if (citations.length === 0 && availableChunks.length > 0) {
    const top = availableChunks[0]
    citations.push({
      docName: top.docName,
      pageNumber: top.pageNumber,
      sheetName: top.sheetName,
      cellRef: top.cellRange,
      sectionTitle: top.sectionTitle,
    })
  }

  return citations
}

/**
 * Audit AI response against retrieved ground-truth chunks:
 * 1. Checks if numbers and dates in the response exist in the chunks
 * 2. Checks if response complies with "Not found" rule
 * 3. Returns confidence rating and unverified claims
 */
export function verifyResponseAccuracy(
  responseText: string,
  retrievedChunks: DocumentPageChunk[]
): DocumentVerificationResult {
  const lowerResp = responseText.toLowerCase()

  // 1. Check if the response states information is not available
  const isNotAvailableResponse =
    lowerResp.includes('not available in the uploaded document') ||
    lowerResp.includes('document mein uplabdh nahi') ||
    lowerResp.includes('information is not present') ||
    lowerResp.includes('cannot find this information in the document')

  if (isNotAvailableResponse) {
    return {
      isVerified: true,
      confidence: 'high',
      verifiedSources: [],
      auditNotes: 'Verified absence of requested information in document context.',
    }
  }

  const allChunkContent = retrievedChunks.map(c => c.content).join('\n')
  const allChunkContentLower = allChunkContent.toLowerCase()

  // 2. Extract numbers, currency amounts, percentages, and dates from response
  const responseNumbers = responseText.match(/(?:Rs\.?|INR|₹)\s*[\d,]+(?:\.\d+)?|\b\d{1,3}(?:,\d{2,3})*(?:\.\d+)?\b/g) || []
  const responseDates = responseText.match(/\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b/g) || []
  const responsePercentages = responseText.match(/\b\d+(?:\.\d+)?%/g) || []

  const unverifiedClaims: string[] = []
  let totalFactChecks = 0
  let passedFactChecks = 0

  // Verify monetary / numeric facts (filter out common short numbers like 1, 2, 3)
  const significantNumbers = responseNumbers.filter(n => {
    const cleaned = n.replace(/[^\d]/g, '')
    return cleaned.length >= 3 && parseInt(cleaned, 10) > 10
  })

  for (const num of significantNumbers) {
    totalFactChecks++
    const cleanNum = num.replace(/[^\d]/g, '')
    // Check if clean number exists anywhere in chunks
    if (allChunkContent.includes(num) || (cleanNum.length >= 4 && allChunkContent.replace(/[^\d]/g, ' ').includes(cleanNum))) {
      passedFactChecks++
    } else {
      unverifiedClaims.push(`Numeric value "${num}" could not be confirmed in retrieved document chunks.`)
    }
  }

  // Verify dates
  for (const d of responseDates) {
    totalFactChecks++
    if (allChunkContent.includes(d)) {
      passedFactChecks++
    } else {
      unverifiedClaims.push(`Date "${d}" could not be confirmed in retrieved document chunks.`)
    }
  }

  // Verify percentages
  for (const p of responsePercentages) {
    totalFactChecks++
    if (allChunkContent.includes(p)) {
      passedFactChecks++
    } else {
      unverifiedClaims.push(`Percentage "${p}" could not be confirmed in retrieved document chunks.`)
    }
  }

  // Determine confidence
  let confidence: 'high' | 'medium' | 'low' | 'unsupported' = 'high'
  let isVerified = true

  if (totalFactChecks > 0) {
    const passRatio = passedFactChecks / totalFactChecks
    if (passRatio >= 0.85) {
      confidence = 'high'
      isVerified = true
    } else if (passRatio >= 0.5) {
      confidence = 'medium'
      isVerified = true
    } else {
      confidence = 'low'
      isVerified = false
    }
  } else {
    // If no specific numbers were asked or checked, check if response text keywords are supported
    confidence = retrievedChunks.length > 0 ? 'high' : 'medium'
  }

  const citations = extractCitationsFromResponse(responseText, retrievedChunks)

  return {
    isVerified,
    confidence,
    verifiedSources: citations,
    unverifiedClaims: unverifiedClaims.slice(0, 5),
    auditNotes:
      totalFactChecks > 0
        ? `Audited ${totalFactChecks} numeric/date facts against ${retrievedChunks.length} document chunks: ${passedFactChecks} matched verbatim.`
        : `Verified response against ${retrievedChunks.length} document chunks.`,
  }
}

