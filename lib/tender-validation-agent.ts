// Server-only. "Validation agent" for tender auto-fill.
//
// Pass 1 (route) reads the whole PDF in one shot. On big tenders that pass
// silently leaves fields null (addressee, fee, technical components, ...).
// This agent then:
//   1. checks every field the bid documents need (same list as missingDocFields),
//   2. for each still-empty field finds the relevant pages in the PDF text layer,
//   3. asks the model ONLY about those fields, with a verbatim quote + page,
//   4. accepts a value only if the quote really exists on the cited page,
//   5. returns a report: filled-by-pass1 / recovered / still-missing (+ page proof).
import { generateText, Output } from 'ai'
import { z } from 'zod'
import type { LanguageModel } from 'ai'
import { loadPdfjsNative } from '@/lib/server-pdf'
import { quoteOnPage } from '@/lib/document-verifier'
import { buildTenderMap } from '@/lib/tender-map'
import type { TenderExtraction } from '@/lib/tender-extraction-schema'

export interface PageText {
  page: number
  text: string
}

export type FieldStatus = 'filled' | 'recovered' | 'missing'

export interface FieldReport {
  key: string
  label: string
  status: FieldStatus
  page?: number
  evidence?: string
}

export interface ValidationReport {
  checked: number
  filled: number
  recovered: number
  missing: number
  fields: FieldReport[]
  scanned: boolean // PDF has no text layer -> only pass 1 result, cannot cross-check
  notes: string[]
}

interface FieldSpec {
  key: string
  label: string
  /** question handed to the model for this field */
  ask: string
  /** words used to locate candidate pages */
  keywords: string[]
}

const SCALAR_FIELDS: FieldSpec[] = [
  { key: 'rfsNo', label: 'RfS / Tender No.', ask: 'Tender / NIT / RfS / bid reference number', keywords: ['tender no', 'nit no', 'rfs no', 'bid no', 'reference no', 'no.'] },
  { key: 'rfsDate', label: 'RfS / Tender Date', ask: 'Date of the tender notice, formatted YYYY-MM-DD', keywords: ['dated', 'date of issue', 'issue date', 'notice'] },
  { key: 'workName', label: 'Name of Work', ask: 'Full name / scope of work exactly as written', keywords: ['name of work', 'subject', 'supply of', 'rate contract', 'scope of work'] },
  { key: 'authorityFullName', label: 'Authority Full Name', ask: 'Full legal name of the issuing authority', keywords: ['agency', 'corporation', 'limited', 'department', 'authority', 'board'] },
  { key: 'addresseeDesignation', label: 'Addressee Designation', ask: 'Officer/designation to whom bids and covering letters are addressed (e.g. text after "To," such as "The Chief Executive Officer" or "The CE")', keywords: ['to,', 'to ,', 'the ce', 'chief executive', 'managing director', 'the director', 'addressed to', 'executive engineer', 'superintending', 'general manager', 'dear sir'] },
  { key: 'authorityAddress', label: 'Authority Address', ask: 'Full postal address where bids are submitted / of the authority office', keywords: ['address', 'near', 'road', 'raipur', 'pin', 'office of', 'submitted at', 'h.o.'] },
  { key: 'tenderFeePerPackage', label: 'Tender Fee per Package', ask: 'Tender / bid document / processing fee amount in rupees (digits only with commas). Only if an actual amount is stated.', keywords: ['tender fee', 'bid document fee', 'document fee', 'processing fee', 'cost of tender', 'cost of bid', 'tender cost', 'non refundable', 'non-refundable'] },
  { key: 'jurisdiction', label: 'Jurisdiction', ask: 'City whose courts have exclusive jurisdiction over disputes', keywords: ['jurisdiction', 'courts at', 'court of', 'arbitration', 'legal proceedings'] },
  { key: 'bidDeadlineDate', label: 'Bid Deadline Date', ask: 'Last date of bid submission, formatted YYYY-MM-DD', keywords: ['last date', 'due date', 'submission of bid', 'bid submission', 'closing date', 'deadline'] },
  { key: 'bidDeadlineTime', label: 'Bid Deadline Time', ask: 'Bid submission deadline time, e.g. "17:00 Hrs."', keywords: ['last date', 'due date', 'closing', 'hrs', 'pm', 'up to'] },
  { key: 'bidValidityDays', label: 'Bid Validity (days)', ask: 'Bid validity period in days, digits only', keywords: ['validity', 'valid for', 'remain valid'] },
  { key: 'testReportCompliance', label: 'Test Report requirement', ask: 'Concise 3-5 line summary of test report requirements (standards, lab accreditation, validity)', keywords: ['test report', 'nabl', 'test certificate', 'type test', 'accredited'] },
  { key: 'mafRequirement', label: 'MAF requirement', ask: 'Concise 3-5 line summary of Manufacturer Authorization Form requirements, or "Not Required" only if clearly confirmed', keywords: ['maf', 'manufacturer authori', 'authorization form', 'oem'] },
  { key: 'experienceRequirement', label: 'Experience requirement', ask: 'Experience eligibility requirement, verbatim as far as possible', keywords: ['experience', 'similar work', 'completed', 'past performance'] },
  { key: 'turnoverRequirement', label: 'Turnover requirement', ask: 'Turnover eligibility requirement, verbatim as far as possible', keywords: ['turnover', 'turn over', 'net worth', 'financial year', 'annual'] },
]

const COMPONENT_KEYWORDS = ['make', 'approved make', 'bis', 'is 14286', 'iec 61215', 'standard', 'technical specification', 'technical specification of', 'specification of', 'almm', 'specification', 'compliance', 'acdb', 'dcdb', 'cable', 'earthing', 'schedule of', 'bill of quantit']
const EMD_KEYWORDS = ['emd', 'earnest money', 'bid security', 'lakh', 'rs.']
const BANK_KEYWORDS = ['ifsc', 'account no', 'bank', 'neft', 'rtgs', 'beneficiary']

/** Read the text layer page by page (no OCR). Empty array if it cannot be read. */
export async function extractPdfPageTexts(bytes: Uint8Array): Promise<PageText[]> {
  try {
    const pdfjs = await loadPdfjsNative()
    const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, verbosity: 0 }).promise
    const pages: PageText[] = []
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      pages.push({ page: i, text: content.items.map((it: any) => ('str' in it ? it.str : '')).join(' ').replace(/\s+/g, ' ').trim() })
    }
    return pages
  } catch (err) {
    console.warn('[validation-agent] could not read PDF text layer:', err)
    return []
  }
}

const isBlank = (v: unknown) => v == null || (typeof v === 'string' && !v.trim())

/** Which checked fields are still empty after pass 1. */
function emptyFieldKeys(x: TenderExtraction): { scalars: FieldSpec[]; components: boolean; emd: boolean; bank: boolean; packages: boolean } {
  const scalars = SCALAR_FIELDS.filter(f => isBlank((x as any)[f.key]))
  const b = x.beneficiaryBank
  return {
    scalars,
    components: !x.technicalComponents?.length,
    packages: !x.packages?.length,
    emd: !!x.packages?.length && x.packages.some(p => isBlank(p.emdLakh)),
    bank: !b || isBlank(b.accountNo) || isBlank(b.ifsc),
  }
}

/** Top pages by keyword hits (plus neighbours), capped so the prompt stays small. */
function pickPages(pages: PageText[], keywords: string[], max = 6): PageText[] {
  const scored = pages
    .map(p => {
      const t = p.text.toLowerCase()
      let score = 0
      for (const k of keywords) {
        let idx = t.indexOf(k)
        let n = 0
        while (idx !== -1 && n < 5) {
          n++
          idx = t.indexOf(k, idx + k.length)
        }
        score += n
      }
      return { p, score }
    })
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map(s => s.p)
  return scored.sort((a, b) => a.page - b.page)
}

const recoverySchema = z.object({
  fields: z.array(
    z.object({
      key: z.string(),
      value: z.string().nullable().describe('Value copied/derived ONLY from the pages, or null if the pages do not state it'),
      page: z.number().nullable().describe('PDF page number holding the evidence'),
      quote: z.string().nullable().describe('Short VERBATIM quote (<=300 chars) from that page proving the value'),
    })
  ),
  technicalComponents: z
    .array(z.object({ item: z.string(), make: z.string(), compliance: z.string() }))
    .describe('Main equipment / material items the tender asks the bidder to supply, from its technical specification or schedule pages. item = item name. make = the make/OEM only if the tender names one, otherwise exactly "As per tender specification". compliance = required standard (IS/IEC/BIS) or specification clause stated for that item, else "As per tender specification". Empty if the pages list no items.'),
  componentsPage: z.number().nullable(),
  componentsQuote: z.string().nullable(),
  packages: z
    .array(z.object({ code: z.string(), region: z.string(), rfx: z.string(), emdLakh: z.string() }))
    .describe('Packages/lots with EMD in Rs. Lakh (digits only). Empty if not stated.'),
  packagesPage: z.number().nullable(),
  packagesQuote: z.string().nullable(),
  beneficiaryBank: z
    .object({
      accountHolder: z.string().nullable(),
      bankName: z.string().nullable(),
      branch: z.string().nullable(),
      accountNo: z.string().nullable(),
      ifsc: z.string().nullable(),
      accountType: z.string().nullable(),
    })
    .nullable(),
  bankPage: z.number().nullable(),
  bankQuote: z.string().nullable(),
})

const AGENT_SYSTEM =
  'You are a strict validation agent for Indian government tenders. You are given text of selected PDF pages and a list of fields that an earlier pass failed to fill. ' +
  'Fill a field ONLY if the pages state it. Never guess, never use general knowledge, never invent sample data; otherwise return null / empty. ' +
  'For every value give the page number and a short VERBATIM quote from that page. Dates -> YYYY-MM-DD. EMD -> Rs. Lakh digits only.'

/**
 * Cross-check pass-1 output against the PDF text and recover what is missing.
 * Returns the merged extraction plus a per-field report. Never throws.
 */
export async function validateAndFillExtraction(opts: {
  extraction: TenderExtraction
  pages: PageText[]
  model: LanguageModel
  onUsage?: (usage: any) => void
}): Promise<{ extraction: TenderExtraction; report: ValidationReport }> {
  const { pages, model } = opts
  const x: TenderExtraction = JSON.parse(JSON.stringify(opts.extraction))
  const readable = pages.filter(p => p.text.length > 30)
  const notes: string[] = []
  const reports: FieldReport[] = []

  const tenderMap = buildTenderMap(readable)
  const before = emptyFieldKeys(x)
  const scanned = readable.length === 0
  const checkedSpecs = SCALAR_FIELDS

  for (const f of checkedSpecs) {
    if (!before.scalars.includes(f)) reports.push({ key: f.key, label: f.label, status: 'filled' })
  }
  const compLabel = 'Technical Components (Format-12)'
  const pkgLabel = 'Package(s)'
  const emdLabel = 'EMD amount for every Package'
  const bankLabel = 'Beneficiary bank (Account No / IFSC)'
  if (!before.components) reports.push({ key: 'technicalComponents', label: compLabel, status: 'filled' })
  if (!before.packages && !before.emd) reports.push({ key: 'packages', label: pkgLabel, status: 'filled' })
  if (!before.bank) reports.push({ key: 'beneficiaryBank', label: bankLabel, status: 'filled' })

  const nothingMissing = !before.scalars.length && !before.components && !before.packages && !before.emd && !before.bank
  if (scanned) notes.push('PDF has no readable text layer (scanned). Fields could not be cross-checked against page text.')

  if (!scanned && !nothingMissing) {
    const keywords = new Set<string>()
    before.scalars.forEach(f => f.keywords.forEach(k => keywords.add(k)))
    if (before.components) COMPONENT_KEYWORDS.forEach(k => keywords.add(k))
    if (before.packages || before.emd) EMD_KEYWORDS.forEach(k => keywords.add(k))
    if (before.bank) BANK_KEYWORDS.forEach(k => keywords.add(k))

    // The agent works in small batches of fields so each prompt only carries its own pages.
    type Job = { label: string; keys: FieldSpec[]; components?: boolean; packages?: boolean; bank?: boolean; keywords: string[] }
    const jobs: Job[] = []
    const group = (keys: FieldSpec[], label: string) => keys.length && jobs.push({ label, keys, keywords: keys.flatMap(k => k.keywords) })
    group(before.scalars.filter(f => ['rfsNo', 'rfsDate', 'workName', 'authorityFullName', 'addresseeDesignation', 'authorityAddress', 'jurisdiction'].includes(f.key)), 'identity')
    group(before.scalars.filter(f => ['tenderFeePerPackage', 'bidDeadlineDate', 'bidDeadlineTime', 'bidValidityDays'].includes(f.key)), 'fee-dates')
    group(before.scalars.filter(f => ['testReportCompliance', 'mafRequirement', 'experienceRequirement', 'turnoverRequirement'].includes(f.key)), 'eligibility')
    if (before.components) jobs.push({ label: 'components', keys: [], components: true, keywords: COMPONENT_KEYWORDS })
    if (before.packages || before.emd) jobs.push({ label: 'packages', keys: [], packages: true, keywords: EMD_KEYWORDS })
    if (before.bank) jobs.push({ label: 'bank', keys: [], bank: true, keywords: BANK_KEYWORDS })

    const recoveredScalar = new Map<string, FieldReport>()
    let compReport: FieldReport | null = null
    let pkgReport: FieldReport | null = null
    let bankReport: FieldReport | null = null
    const pageText = (n: number | null | undefined) => readable.find(p => p.page === n)?.text || ''

    await Promise.all(
      jobs.map(async job => {
        // keep page 1-2 (cover / NIT summary) as context for identity jobs
        let chosen = pickPages(readable, job.keywords, 6)
        // Tender map pages for this job (EMD/fee/bank/dates/spec) join the keyword pages
        const mapKeys = job.packages || job.bank ? (['emdFee'] as const) : job.components ? (['technicalSpec'] as const) : job.label === 'fee-dates' ? (['emdFee', 'datesSubmission'] as const) : []
        if (mapKeys.length) {
          const extra = new Set(mapKeys.flatMap(k => tenderMap.sections[k].pages.slice(0, 4)))
          chosen = [...chosen, ...readable.filter(p => extra.has(p.page) && !chosen.includes(p))].sort((a, b) => a.page - b.page).slice(0, 9)
        }
        if (job.label === 'identity' || job.label === 'fee-dates') {
          const head = readable.slice(0, 3)
          chosen = [...head, ...chosen.filter(c => !head.includes(c))]
        }
        if (!chosen.length) return
        const ask = [
          ...job.keys.map(k => `- key "${k.key}": ${k.ask}`),
          job.components ? '- technicalComponents: the main equipment/material items to be supplied (from technical specification / schedule pages) with named make if any (else "As per tender specification") and the required standard (IS/IEC/BIS)' : '',
          job.packages ? '- packages: package/lot code, region, rfx no., EMD in Rs. Lakh' : '',
          job.bank ? '- beneficiaryBank: authority bank account for EMD/fee payment (payee only)' : '',
        ].filter(Boolean).join('\n')
        const text = chosen.map(p => `=== PAGE ${p.page} ===\n${p.text.slice(0, 6000)}`).join('\n\n')
        try {
          const { output, usage } = await generateText({
            model,
            system: AGENT_SYSTEM,
            output: Output.object({ schema: recoverySchema }),
            prompt: `Fill ONLY these fields (leave everything else empty/null):\n${ask}\n\nPAGES:\n${text}`,
          })
          opts.onUsage?.(usage)

          for (const f of output.fields || []) {
            const spec = job.keys.find(k => k.key === f.key)
            if (!spec || isBlank(f.value) || !f.quote || !f.page) continue
            if (!quoteOnPage(f.quote, pageText(f.page))) continue // unverifiable -> rejected
            ;(x as any)[spec.key] = f.value!.trim()
            recoveredScalar.set(spec.key, { key: spec.key, label: spec.label, status: 'recovered', page: f.page, evidence: f.quote })
          }
          if (job.components && output.technicalComponents?.length && output.componentsQuote && output.componentsPage && quoteOnPage(output.componentsQuote, pageText(output.componentsPage))) {
            x.technicalComponents = output.technicalComponents
            compReport = { key: 'technicalComponents', label: compLabel, status: 'recovered', page: output.componentsPage, evidence: output.componentsQuote }
          }
          if (job.packages && output.packages?.length && output.packagesQuote && output.packagesPage && quoteOnPage(output.packagesQuote, pageText(output.packagesPage))) {
            if (!x.packages?.length) x.packages = output.packages
            else {
              // keep pass-1 packages, only fill their empty EMD
              x.packages = x.packages.map((p, i) => (isBlank(p.emdLakh) ? { ...p, emdLakh: output.packages[i]?.emdLakh || output.packages[0]?.emdLakh || '' } : p))
            }
            pkgReport = { key: 'packages', label: emdLabel, status: 'recovered', page: output.packagesPage, evidence: output.packagesQuote }
          }
          if (job.bank && output.beneficiaryBank && output.bankQuote && output.bankPage && quoteOnPage(output.bankQuote, pageText(output.bankPage))) {
            const cur = x.beneficiaryBank || ({} as any)
            const nb: any = { ...cur }
            for (const k of ['accountHolder', 'bankName', 'branch', 'accountNo', 'ifsc', 'accountType'] as const) {
              if (isBlank(nb[k]) && !isBlank((output.beneficiaryBank as any)[k])) nb[k] = (output.beneficiaryBank as any)[k]
            }
            x.beneficiaryBank = nb
            bankReport = { key: 'beneficiaryBank', label: bankLabel, status: 'recovered', page: output.bankPage, evidence: output.bankQuote }
          }
        } catch (err: any) {
          notes.push(`Validation job "${job.label}" failed: ${String(err?.message || err).slice(0, 120)}`)
        }
      })
    )

    for (const f of before.scalars) {
      reports.push(recoveredScalar.get(f.key) || { key: f.key, label: f.label, status: 'missing' })
    }
    if (before.components) reports.push(compReport || { key: 'technicalComponents', label: compLabel, status: 'missing' })
    if (before.packages || before.emd) reports.push(pkgReport || { key: 'packages', label: before.packages ? pkgLabel : emdLabel, status: 'missing' })
    if (before.bank) reports.push(bankReport || { key: 'beneficiaryBank', label: bankLabel, status: 'missing' })
  } else if (!nothingMissing) {
    // scanned PDF: nothing to cross-check against
    for (const f of before.scalars) reports.push({ key: f.key, label: f.label, status: 'missing' })
    if (before.components) reports.push({ key: 'technicalComponents', label: compLabel, status: 'missing' })
    if (before.packages || before.emd) reports.push({ key: 'packages', label: before.packages ? pkgLabel : emdLabel, status: 'missing' })
    if (before.bank) reports.push({ key: 'beneficiaryBank', label: bankLabel, status: 'missing' })
  }

  // Deterministic clean-up of formats the documents depend on.
  normalizeExtraction(x)

  const count = (s: FieldStatus) => reports.filter(r => r.status === s).length
  return {
    extraction: x,
    report: { checked: reports.length, filled: count('filled'), recovered: count('recovered'), missing: count('missing'), fields: reports, scanned, notes },
  }
}

/** "17:00:00" -> "17:00 Hrs.", digits-only days/EMD, ISO dates only. */
export function normalizeExtraction(x: TenderExtraction) {
  // The model sometimes writes the literal word from the prompt ("Null", "N/A") instead of a real null.
  const EMPTYISH = /^\s*(null|none|n\/a|na|nil|not\s+(mentioned|specified|available|applicable|found)|-+)\s*\.?\s*$/i
  for (const k of Object.keys(x) as (keyof TenderExtraction)[]) {
    const v: any = (x as any)[k]
    if (typeof v === 'string' && EMPTYISH.test(v)) (x as any)[k] = null
  }
  if (x.bidDeadlineTime) {
    const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(x.bidDeadlineTime.trim())
    if (m) x.bidDeadlineTime = `${m[1].padStart(2, '0')}:${m[2]} Hrs.`
  }
  if (x.bidValidityDays) {
    const m = /\d+/.exec(x.bidValidityDays)
    x.bidValidityDays = m ? m[0] : x.bidValidityDays
  }
  if (x.packages) x.packages = x.packages.map(p => ({ ...p, emdLakh: (p.emdLakh || '').replace(/[^\d.]/g, '') }))
  if (x.rfsDate && !/^\d{4}-\d{2}-\d{2}$/.test(x.rfsDate)) x.rfsDate = null
  if (x.bidDeadlineDate && !/^\d{4}-\d{2}-\d{2}$/.test(x.bidDeadlineDate)) x.bidDeadlineDate = null
}
