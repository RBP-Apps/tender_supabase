import {
  DocumentPageChunk,
  DocumentSourceCitation,
  DocumentVerificationResult,
} from '@/types/document-understanding'

/**
 * Standard reply when the uploaded document does not contain the answer.
 */
export const NOT_FOUND_DISCLAIMER = 'Information Not Found in the Uploaded Tender Document.'

/**
 * Standard reply when the answer may sit on pages whose text could not be extracted.
 */
export const EXTRACTION_INCOMPLETE_DISCLAIMER =
  'Document Extraction Incomplete – Manual Verification Required.'

/**
 * Recognised "not found" phrasings (current + legacy wording + Hindi/Hinglish).
 */
export const RECOGNIZED_NOT_FOUND_STRINGS = [
  'information not found in the uploaded tender document',
  'information not found in uploaded tender document',
  'this information is not available in the provided document',
  'the requested information is not available in the uploaded document',
  'this information is not available in the uploaded document',
  'the requested information is not available in the provided document',
  'not available in the provided document',
  'not available in the uploaded document',
  'document mein uplabdh nahi',
  'दस्तावेज़ में उपलब्ध नहीं',
]

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ')

/** Normalisation used for quote matching (case, quotes, punctuation, table pipes). */
export const normQuote = (s: string) =>
  s
    .toLowerCase()
    .replace(/[“”"'`’‘]/g, '')
    .replace(/[^a-z0-9ऀ-ॿ.%₹]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Is `quote` present on this page? Exact (normalised) match, ellipsis fragments,
 * or – because table cells reflow during extraction – ≥90% word coverage on the
 * page with every number of the quote present.
 */
export function quoteOnPage(quote: string, pageText: string): boolean {
  const q = normQuote(quote.replace(/\.{3}|…/g, ' '))
  if (q.length < 10) return false
  const pn = normQuote(pageText)
  const parts = quote.split(/\.{3}|…/).map(normQuote).filter(p => p.length >= 10)
  if (parts.length > 0 && parts.every(p => pn.includes(p))) return true
  const words = Array.from(new Set(q.split(' ').filter(w => w.length >= 3)))
  if (words.length < 4) return false
  const pageWords = new Set(pn.split(' '))
  const hit = words.filter(w => pageWords.has(w)).length / words.length
  const nums = q.match(/\d+(?:\.\d+)?/g) || []
  return hit >= 0.9 && nums.every(n => pageWords.has(n) || pn.includes(n))
}

/** Remove thousands separators (Indian & western) so 50,00,000 == 5000000 */
const stripDigitSeparators = (s: string) => s.replace(/(\d),(?=\d{2,3}\b)/g, '$1')

/** Amount + Indian unit, e.g. "1.5 Crore", "50 Lakh", "2 Cr." */
const UNIT_AMOUNT_RE = /(\d+(?:\.\d+)?)\s*(crores?|cr\b\.?|lakhs?|lacs?|lac\b)/gi
const unitFamily = (u: string) => (/^c/i.test(u) ? 'crore' : 'lakh')

function collectUnitAmounts(text: string): Set<string> {
  const out = new Set<string>()
  for (const m of stripDigitSeparators(text).matchAll(UNIT_AMOUNT_RE)) {
    out.add(`${parseFloat(m[1])}-${unitFamily(m[2])}`)
  }
  return out
}

/** Canonical date key: d-m-yyyy, so 10.09.2026 == 10/09/2026 == 10-9-2026 */
function dateKey(d: string): string | null {
  const m = d.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/)
  if (!m) return null
  const y = m[3].length === 2 ? `20${m[3]}` : m[3]
  return `${parseInt(m[1], 10)}-${parseInt(m[2], 10)}-${y}`
}

function collectDateKeys(text: string): Set<string> {
  const keys = new Set<string>()
  for (const d of text.match(/\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b/g) || []) {
    const k = dateKey(d)
    if (k) keys.add(k)
  }
  return keys
}

/** Loose document-name match ("NIT.pdf" vs "NIT", case/space-insensitive) */
function sameDoc(a: string, b: string): boolean {
  const n = (x: string) => x.toLowerCase().replace(/\.[a-z0-9]{2,5}$/, '').replace(/[^a-z0-9ऀ-ॿ]/g, '')
  const na = n(a)
  const nb = n(b)
  return !!na && !!nb && (na === nb || na.includes(nb) || nb.includes(na))
}

/**
 * Parse citations from raw AI response text. Handles:
 * - Source: Document.pdf, Page 45
 * - [Source: File.xlsx, Sheet: "BOQ", Cell: E25]
 * - **Source:** Document.docx, Section 3
 * - Pages 12, 14 and 45
 *
 * Never invents a citation: if the answer cites nothing, nothing is returned.
 */
export function extractCitationsFromResponse(
  responseText: string,
  availableChunks: DocumentPageChunk[] = []
): DocumentSourceCitation[] {
  const citations: DocumentSourceCitation[] = []
  const seenKeys = new Set<string>()
  const push = (c: DocumentSourceCitation) => {
    const key = `${c.docName}-${c.pageNumber || ''}-${c.sheetName || ''}-${c.cellRef || ''}`
    if (c.docName && !seenKeys.has(key)) {
      seenKeys.add(key)
      citations.push(c)
    }
  }

  // 1. Line-based "Source:" / "Source Document:" lines
  const lines = responseText.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim().replace(/^[-*>\s]+/, '')
    const m = trimmed.match(
      /^(?:\*{0,2})(?:Source(?: Document)?|Reference|Ref|स्रोत)(?:\*{0,2})\s*[:\-]\s*(?:\*{0,2})\s*(.*)$/i
    )
    if (!m) continue
    const rest = m[1].trim()
    const parts = rest.split(',').map(p => p.trim())
    const rawDoc = parts[0].replace(/^\[+|[\]\.\*]+$/g, '').replace(/^["']|["']$/g, '').trim()
    let sheetName: string | undefined
    let cellRef: string | undefined
    const pages: number[] = []
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i]
      const pm = part.match(/(?:Pages?|Pg\.?)\s*([\d\s,&and\-–]+)/i)
      if (pm) pm[1].match(/\d+/g)?.forEach(n => pages.push(parseInt(n, 10)))
      else if (/^\d+$/.test(part) && pages.length > 0) pages.push(parseInt(part, 10))
      const sm = part.match(/Sheet\s*[:\s]*["']?([^"'\]\.]+)["']?/i)
      if (sm) sheetName = sm[1].trim()
      const cm = part.match(/Cell\s*[:\s]*["']?([A-Z0-9:]+)["']?/i)
      if (cm) cellRef = cm[1].trim()
    }
    if (pages.length === 0) push({ docName: rawDoc, sheetName, cellRef })
    for (const p of pages) push({ docName: rawDoc, pageNumber: p, sheetName, cellRef })
  }

  // 2. Inline bracket citations: [Source: NIT.pdf, Page 45]
  const bracketRegex =
    /\[(?:Source|Ref)\:\s*([^,\]]+)(?:,\s*Page\s*(\d+))?(?:,\s*Sheet\s*[:\s]*["']?([^,"']+)["']?)?(?:,\s*Cell\s*[:\s]*["']?([A-Z0-9:]+)["']?)?\]/gi
  let bm: RegExpExecArray | null
  while ((bm = bracketRegex.exec(responseText)) !== null) {
    push({
      docName: (bm[1] || '').trim(),
      pageNumber: bm[2] ? parseInt(bm[2], 10) : undefined,
      sheetName: bm[3]?.trim(),
      cellRef: bm[4]?.trim(),
    })
  }

  // 3. "Page N" mentions, mapped to the retrieved chunk carrying that page
  if (availableChunks.length > 0) {
    const pageMatches = responseText.match(/\b(?:page|pg\.?)\s*(?:no\.?\s*)?(\d+)\b/gi) || []
    for (const pm of pageMatches) {
      const pageNum = parseInt(pm.match(/\d+/)![0], 10)
      const already = citations.some(c => c.pageNumber === pageNum)
      if (already) continue
      const matched = availableChunks.find(c => c.pageNumber === pageNum)
      push({
        docName: matched?.docName || '(unknown document)',
        pageNumber: pageNum,
        sectionTitle: matched?.sectionTitle,
      })
    }
  }

  return citations
}

/**
 * Deterministic answer-to-evidence audit:
 * 1. Every cited page must be one of the pages actually retrieved for this question.
 * 2. Every amount / number / date / percentage in the answer must appear in the
 *    retrieved evidence (and preferably on a cited page).
 * 3. A factual answer with no valid citation is NOT verified.
 */
export function verifyResponseAccuracy(
  responseText: string,
  retrievedChunks: DocumentPageChunk[]
): DocumentVerificationResult {
  const lowerResp = norm(responseText)

  const isNotFound = RECOGNIZED_NOT_FOUND_STRINGS.some(s => lowerResp.includes(s))
  const isExtractionIncomplete = lowerResp.includes('document extraction incomplete')

  const citations = extractCitationsFromResponse(responseText, retrievedChunks)
  const unverifiedClaims: string[] = []

  // ---- 1. Citation validity -------------------------------------------------
  const validCitedChunks: DocumentPageChunk[] = []
  for (const c of citations) {
    if (c.pageNumber === undefined) {
      // Section / sheet level citation: must at least reference a retrieved document
      const docHit = retrievedChunks.find(ch => sameDoc(ch.docName, c.docName))
      if (docHit) {
        const sheetHits = c.sheetName
          ? retrievedChunks.filter(ch => sameDoc(ch.docName, c.docName) && ch.sheetName === c.sheetName)
          : []
        validCitedChunks.push(...(sheetHits.length ? sheetHits : []))
      } else if (retrievedChunks.length > 0) {
        unverifiedClaims.push(`Cited document "${c.docName}" was not part of the retrieved evidence.`)
      }
      continue
    }
    const hit = retrievedChunks.find(
      ch => ch.pageNumber === c.pageNumber && (c.docName === '(unknown document)' || sameDoc(ch.docName, c.docName))
    )
    if (hit) {
      validCitedChunks.push(hit)
      c.snippet = hit.content.slice(0, 300).replace(/\s+/g, ' ')
      c.sectionTitle = c.sectionTitle || hit.sectionTitle
      c.clauseOrRef = hit.clauseOrRef
      if (hit.content.startsWith('[EXTRACTION FAILED')) {
        unverifiedClaims.push(`Page ${c.pageNumber} is cited but it is (partly) scanned; its image content was not machine-read.`)
      }
    } else {
      unverifiedClaims.push(
        `Cited page ${c.pageNumber}${c.docName !== '(unknown document)' ? ` of "${c.docName}"` : ''} was not among the pages retrieved for this question; the reference cannot be verified.`
      )
    }
  }

  if (isNotFound || isExtractionIncomplete) {
    return {
      isVerified: unverifiedClaims.length === 0,
      status: isNotFound ? 'evidence-not-found' : 'extraction-incomplete',
      confidence: isNotFound ? 'high' : 'low',
      verifiedSources: citations,
      unverifiedClaims,
      auditNotes: isNotFound
        ? `Answer states the information is not in the document. ${retrievedChunks.length} candidate passage(s) were retrieved and shown to the model.`
        : 'Answer reports that part of the document could not be extracted.',
    }
  }

  // ---- 2. Fact checks --------------------------------------------------------
  // A fact counts as supported only when it is on a page the answer cites.
  // Facts present elsewhere in the retrieved text are reported, not accepted.
  const rawAll = retrievedChunks.map(c => c.content).join('\n')
  const rawCited = validCitedChunks.map(c => c.content).join('\n')
  const evidenceAll = stripDigitSeparators(rawAll)
  const evidenceCited = stripDigitSeparators(rawCited)
  const evidenceDates = collectDateKeys(rawAll)
  const citedDates = collectDateKeys(rawCited)
  const allUnitAmounts = collectUnitAmounts(rawAll)
  const citedUnitAmounts = collectUnitAmounts(rawCited)
  const pagesContaining = (test: (t: string) => boolean) =>
    retrievedChunks
      .filter(c => test(c.content))
      .map(c => c.pageNumber)
      .filter(Boolean)
      .slice(0, 5)
      .join(', ')

  // Strip the citation lines themselves so page numbers are not "facts"
  const answerBody = responseText
    .split(/\r?\n/)
    .filter(l => !/^\s*[-*>]*\s*\**\s*(source|reference|ref|page number|स्रोत)/i.test(l))
    .join('\n')
    .replace(/\b(?:page|pg\.?|pages)\s*[\d,\s&and\-–]+/gi, ' ')
    .replace(/\b(?:clause|section|annexure|schedule|format)\s*[\w.\-]+/gi, ' ')

  let totalFactChecks = 0
  let passedFactChecks = 0
  let passedOnCitedPage = 0

  const record = (label: string, inAll: boolean, inCited: boolean, where: string) => {
    totalFactChecks++
    if (inAll) passedFactChecks++
    if (inCited) passedOnCitedPage++
    if (!inAll) unverifiedClaims.push(`${label} does not appear in the retrieved tender text.`)
    else if (!inCited)
      unverifiedClaims.push(`${label} is not on the cited page(s)${where ? `; it appears on page(s) ${where}` : ''}.`)
  }

  // Dates
  const answerDates = answerBody.match(/\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b/g) || []
  for (const d of answerDates) {
    const k = dateKey(d)
    record(`Date "${d}"`, !!k && evidenceDates.has(k), !!k && citedDates.has(k), k ? pagesContaining(t => collectDateKeys(t).has(k)) : '')
  }
  const bodyNoDates = answerBody.replace(/\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b/g, ' ')

  // Amounts with Indian units (Crore / Lakh) – checked as number + unit
  for (const m of stripDigitSeparators(bodyNoDates).matchAll(UNIT_AMOUNT_RE)) {
    const key = `${parseFloat(m[1])}-${unitFamily(m[2])}`
    record(`Amount "${m[0].trim()}"`, allUnitAmounts.has(key), citedUnitAmounts.has(key), pagesContaining(t => collectUnitAmounts(t).has(key)))
  }
  const bodyNoUnits = stripDigitSeparators(bodyNoDates).replace(UNIT_AMOUNT_RE, ' ')

  // Percentages
  for (const p of bodyNoUnits.match(/\b\d+(?:\.\d+)?\s?%/g) || []) {
    const num = p.replace(/\s|%/g, '')
    const re = new RegExp(`(?:^|[^\\d.])${num.replace('.', '\\.')}\\s?(?:%|per\\s?cent|percent)`, 'i')
    record(`Percentage "${p}"`, re.test(evidenceAll), re.test(evidenceCited), pagesContaining(t => re.test(t)))
  }
  const bodyNoPct = bodyNoUnits.replace(/\b\d+(?:\.\d+)?\s?%/g, ' ')

  // Other significant numbers (>= 3 digits, or decimals like 4.50)
  const numbers = bodyNoPct.match(/\b\d+(?:\.\d+)?\b/g) || []
  const seen = new Set<string>()
  for (const raw of numbers) {
    const n = raw.replace(/\.0+$/, '')
    const significant = n.replace('.', '').length >= 3 || n.includes('.')
    if (!significant || seen.has(n)) continue
    // Ignore bare years – they rarely carry the claim and appear everywhere
    if (/^(19|20)\d{2}$/.test(n)) continue
    seen.add(n)
    const re = new RegExp(`(?:^|[^\\d.])${n.replace('.', '\\.')}(?:\\.0+)?(?![\\d])`)
    record(`Value "${raw}"`, re.test(evidenceAll), re.test(evidenceCited), pagesContaining(t => re.test(stripDigitSeparators(t))))
  }

  // Quoted "Supporting Evidence" must be copied verbatim from the cited page(s)
  const allNorm = normQuote(rawAll)
  for (const m of responseText.matchAll(/["“]([^"”\n]{20,400})["”]/g)) {
    if (normQuote(m[1]).length < 15) continue
    const parts = m[1].split(/\.{3}|…/).map(normQuote).filter(p => p.length >= 10)
    const inCited = validCitedChunks.some(c => quoteOnPage(m[1], c.content))
    const inAll =
      inCited || retrievedChunks.some(c => quoteOnPage(m[1], c.content)) || (parts.length > 0 && parts.every(p => allNorm.includes(p)))
    const short = m[1].length > 70 ? `${m[1].slice(0, 67)}…` : m[1]
    record(`Quoted evidence "${short}"`, inAll, inCited, '')
  }

  // ---- 3. Verdict ------------------------------------------------------------
  const hasValidCitation = validCitedChunks.length > 0
  const allFactsFound = passedOnCitedPage === totalFactChecks
  const citationProblems = citations.length - validCitedChunks.length > 0

  let status: DocumentVerificationResult['status']
  let confidence: DocumentVerificationResult['confidence']
  if (retrievedChunks.length === 0) {
    status = 'not-verified'
    confidence = 'unsupported'
    unverifiedClaims.push('No document evidence was retrieved for this question.')
  } else if (!hasValidCitation) {
    status = 'not-verified'
    confidence = 'low'
    unverifiedClaims.push('The answer does not cite a page that was retrieved from the uploaded document.')
  } else if (allFactsFound && !citationProblems) {
    // Evidence from machine-read scans (OCR / Vision without an exact text layer,
    // or Vision rows OCR could not confirm) is labelled separately.
    const scanned = validCitedChunks.some(
      c =>
        ['ocr', 'vision', 'ocr+vision'].includes(c.extractionMethod || '') ||
        (c.qualityFlags || []).some(f => f === 'vision-extra-content-unconfirmed' || f === 'vision-only-unconfirmed' || f === 'low-ocr-confidence')
    )
    status = scanned ? 'verified-scanned' : 'verified'
    // No numeric fact to check = citation verified, content not machine-checkable.
    confidence = totalFactChecks === 0 ? 'medium' : 'high'
  } else {
    status = 'not-verified'
    confidence = passedFactChecks > 0 ? 'low' : 'unsupported'
  }

  return {
    isVerified: status === 'verified' || status === 'verified-scanned',
    status,
    confidence,
    factChecks: totalFactChecks,
    citedChunks: validCitedChunks,
    verifiedSources: citations,
    unverifiedClaims: unverifiedClaims.slice(0, 8),
    auditNotes:
      `Checked ${citations.length} citation(s) (${validCitedChunks.length} valid) and ${totalFactChecks} number/date/percentage fact(s) ` +
      `against ${retrievedChunks.length} retrieved passage(s): ${passedFactChecks} found in evidence, ${passedOnCitedPage} on the cited page(s).`,
  }
}
