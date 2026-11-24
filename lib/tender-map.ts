// Server-only. "Tender map": ONE pass over the whole tender text that records which pages
// belong to which section, plus an index of the annexures / prescribed formats.
// Every section (eligibility, EMD/fee, checklist, sample/test, technical spec, formats)
// can then read the right pages instead of re-guessing with its own keywords.
// Deterministic (no model call): fast, free and every entry points to a real page.
import type { PageText } from '@/lib/tender-validation-agent'

export type SectionKey = 'eligibility' | 'emdFee' | 'checklist' | 'sampleTest' | 'technicalSpec' | 'datesSubmission' | 'paymentTerms' | 'documentClauses'

export interface AnnexureEntry {
  label: string // e.g. "Annexure-03"
  number: number
  title: string
  page: number
  pages: number[] // the format may run over consecutive pages
}

export interface TenderMap {
  pageCount: number
  readablePages: number
  scanned: boolean
  sections: Record<SectionKey, { pages: number[]; hits: number }>
  annexures: AnnexureEntry[]
}

const SECTION_KEYWORDS: Record<SectionKey, string[]> = {
  eligibility: ['eligibility', 'eligible bidder', 'turnover', 'net worth', 'similar work', 'experience', 'licence', 'license', 'registration', 'debarred', 'blacklist', 'qualification'],
  emdFee: ['earnest money', 'emd', 'bid document fee', 'tender fee', 'neft', 'rtgs', 'transaction', 'bank guarantee'],
  checklist: ['check list', 'checklist', 'documents to be uploaded', 'documents to be submitted', 'envelope', 'scanned copy', 'cover-1', 'cover 1'],
  sampleTest: ['test report', 'type test', 'nabl', 'sample', 'bis', 'iso', 'manufacturer authori', 'maf', 'oem'],
  technicalSpec: ['technical specification', 'specification of', 'as per is', 'iec', 'make', 'gauge', 'mm', 'rating'],
  datesSubmission: ['last date', 'due date', 'pre-bid', 'opening of', 'submission of bid', 'validity of bid'],
  documentClauses: ['bis licen', 'valid bis', 'test report', 'manufacturer authori', 'maf', 'authori', 'copy of', 'certified copy', 'gst', 'pan card', 'affidavit', 'undertaking', 'shall submit', 'to be submitted', 'must submit', 'enclose', 'attached', 'nabl', 'almm', 'licence', 'license'],
  paymentTerms: ['payment terms', 'payment shall', 'advance', 'security deposit', 'performance guarantee', 'liquidated damage', 'warranty'],
}

const count = (text: string, k: string) => {
  let n = 0
  let i = text.indexOf(k)
  while (i !== -1 && n < 8) {
    n++
    i = text.indexOf(k, i + k.length)
  }
  return n
}

export function buildTenderMap(pages: PageText[]): TenderMap {
  const readable = pages.filter(p => p.text.length > 30)
  const sections = {} as TenderMap['sections']
  for (const key of Object.keys(SECTION_KEYWORDS) as SectionKey[]) {
    const scored = readable
      .map(p => {
        const t = p.text.toLowerCase()
        const hits = SECTION_KEYWORDS[key].reduce((n, k) => n + count(t, k), 0)
        return { page: p.page, hits }
      })
      .filter(s => s.hits >= 3)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, key === 'documentClauses' ? 14 : 8)
    sections[key] = { pages: scored.map(s => s.page).sort((a, b) => a - b), hits: scored.reduce((n, s) => n + s.hits, 0) }
  }

  // Annexure index: a page "opens" an annexure when the label sits at the top of the page text.
  const found = new Map<number, AnnexureEntry>()
  for (const p of readable) {
    if ((p.text.toLowerCase().match(/annexure/g) || []).length > 6) continue // table of contents / list page
    const head = p.text.slice(0, 260)
    const m = head.match(/annexure[\s\-–:]*0?(\d{1,2})\b\s*[:\-–]*\s*([^.]{3,90})/i)
    if (!m) continue
    const number = Number(m[1])
    if (found.has(number)) {
      found.get(number)!.pages.push(p.page)
      continue
    }
    found.set(number, { label: `Annexure-${String(number).padStart(2, '0')}`, number, title: m[2].replace(/\s+/g, ' ').trim(), page: p.page, pages: [p.page] })
  }

  return {
    pageCount: pages.length,
    readablePages: readable.length,
    scanned: readable.length === 0,
    sections,
    annexures: [...found.values()].sort((a, b) => a.number - b.number),
  }
}

/** Pages for an annexure named in free text ("Annexure-03", "annexure 3"), if the map knows it. */
export function annexurePages(map: TenderMap, text: string): number[] {
  const n = text.match(/annexure[\s\-–:]*0?(\d{1,2})\b/i)?.[1]
  if (!n) return []
  return map.annexures.find(a => a.number === Number(n))?.pages || []
}
