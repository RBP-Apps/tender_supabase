import { NextResponse } from 'next/server'
import { createOpenAI } from '@ai-sdk/openai'
import { generateText, Output } from 'ai'
import { z } from 'zod'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const runtime = 'nodejs'
export const maxDuration = 90

const NOT_FOUND = 'Not Found in Tender Document'

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}

// OpenAI strict mode: every field required, empty string when not stated
const technicalOpenCheckSchema = z.object({
  openingDate: z.string().describe('Technical bid opening date as YYYY-MM-DD, or empty string if not stated'),
  openingTime: z.string().describe(`Technical bid opening time exactly as stated, or "${NOT_FOUND}"`),
  openingVenueOrPortal: z.string().describe('Venue / portal of technical bid opening, or empty string'),
  openingSummary: z.string().describe('2-3 sentence opening procedure summary'),
  evaluationDate: z.string().describe('Technical bid evaluation date as YYYY-MM-DD, or empty string if not stated'),
  evaluationTime: z.string().describe(`Technical bid evaluation time exactly as stated, or "${NOT_FOUND}"`),
  evaluationVenue: z.string().describe(`Evaluation venue, or "${NOT_FOUND}"`),
  evaluationCriteria: z.string().describe('Technical evaluation criteria points'),
  complianceConditions: z.string().describe('Key mandatory compliance conditions'),
  openingSourceText: z.string().describe('Verbatim row/clause the opening date was read from, incl. page or corrigendum ref, or empty string'),
  evaluationSourceText: z.string().describe('Verbatim row/clause the evaluation date was read from, or empty string'),
})

/**
 * Normalizes dates like DD-MM-YYYY, DD/MM/YYYY, DD.MM.YY, 26-Oct-2026, 26th October 2026,
 * October 26, 2026 or YYYY-MM-DD into YYYY-MM-DD. Returns '' when the value is not a real date.
 */
function normalizeDate(raw?: string): string {
  if (!raw) return ''
  // PDF text layers often space out separators and digits: "26 - 10 - 2026", "2 3 .10 .2026"
  const trimmed = raw.trim().replace(/\s*([-/.])\s*/g, '$1').replace(/(\d)\s(?=\d)/g, '$1')
  const build = (y: string, m: string, d: string) => {
    const year = y.length === 2 ? `20${y}` : y
    const mm = m.padStart(2, '0')
    const dd = d.padStart(2, '0')
    const n = Number(year)
    if (n < 2000 || n > 2100 || Number(mm) < 1 || Number(mm) > 12 || Number(dd) < 1 || Number(dd) > 31) return ''
    return `${year}-${mm}-${dd}`
  }

  // YYYY-MM-DD
  let m = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (m) return build(m[1], m[2], m[3])

  // DD-MM-YYYY / DD/MM/YYYY / DD.MM.YYYY (Indian tenders are day-first)
  m = trimmed.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})\b/)
  if (m) return build(m[3], m[2], m[1])

  // 26-Oct-2026 / 26th October, 2026 / 26 Oct 26
  m = trimmed.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s\-/.,]*([A-Za-z]{3,9})\.?[\s\-/.,]*(\d{4}|\d{2})\b/)
  if (m && MONTHS[m[2].slice(0, 3).toLowerCase()]) return build(m[3], MONTHS[m[2].slice(0, 3).toLowerCase()], m[1])

  // October 26, 2026
  m = trimmed.match(/^([A-Za-z]{3,9})\.?\s*(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/)
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()]) return build(m[3], MONTHS[m[1].slice(0, 3).toLowerCase()], m[2])

  return ''
}

const DATE_RE =
  /\b(\d\s?\d\s?\d\s?\d\s*[-/.]\s*\d(?:\s?\d)?\s*[-/.]\s*\d(?:\s?\d)?|\d(?:\s?\d)?\s*[-/.]\s*\d(?:\s?\d)?\s*[-/.]\s*(?:\d\s?\d\s?\d\s?\d|\d\s?\d)|\d{1,2}(?:st|nd|rd|th)?[\s\-/.,]*(?:jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?[\s\-/.,]*(?:\d{4}|\d{2})|(?:jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})\b/i
const TIME_RE =
  /\b(\d{1,2}\s*[:.]\s*\d{2}\s*(?:[AaPp]\.?\s?[Mm]\.?|hrs?\.?|hours)?(?:\s*(?:\(IST\)|IST))?(?:\s*onwards)?|\d{1,2}\s*(?:[AaPp]\.?\s?[Mm]\.?)(?:\s*onwards)?)/i

/** PDF text layers split words ("T echnical", "o f"): let every letter run tolerate one stray space. */
function looseWords(source: string, flags: string): RegExp {
  return new RegExp(source.replace(/(?<!\\)[a-z]{2,}/g, w => w.split('').join('\\s?')), flags)
}

const OPENING_KEY_RE = looseWords(
  String.raw`(?:opening|open(?:ed)?)\s+(?:date\s*(?:and|&)\s*time\s+)?of\s+(?:the\s+)?(?:online\s+|e[-\s]?)?(?:technical|techno[-\s]?commercial|cover[-\s]?(?:1|i|a)\b|envelope[-\s]?(?:1|i|a)\b|part[-\s]?(?:1|i|a)\b|pre[-\s]?qualification)|(?:technical|techno[-\s]?commercial)\s+(?:bids?|envelopes?|proposals?|cover)\s*(?:\(\s*cover[-\s]?\w+\s*\)\s*)?(?:opening|will\s+be\s+opened|to\s+be\s+opened|shall\s+be\s+opened)`,
  'gi'
)
const EVALUATION_KEY_RE = looseWords(
  String.raw`(?:evaluation|scrutiny)\s+of\s+(?:the\s+)?(?:technical|techno[-\s]?commercial)\s+(?:bids?|proposals?|envelopes?)|(?:technical|techno[-\s]?commercial)\s+(?:bids?\s+)?(?:evaluation|scrutiny)`,
  'gi'
)
// Another milestone starting inside the window means the date there belongs to that event, not ours
const OPENING_STOP_RE =
  /\b(?:last\s+date|submission|pre[-\s]?bid|opening\s+of\s+(?:the\s+)?(?:financial|price|commercial)|(?:financial|price|commercial)\s+bids?\s+opening|sale\s+of|download|bid\s+start|publish|evaluation|scrutiny)\b/i
const EVALUATION_STOP_RE = /\b(?:last\s+date|submission|pre[-\s]?bid|opening\s+of|opening)\b/i

/** Every date written anywhere in the text, normalized to YYYY-MM-DD. */
function datesIn(text: string): Set<string> {
  const found = new Set<string>()
  for (const m of text.matchAll(new RegExp(DATE_RE.source, 'gi'))) {
    const d = normalizeDate(m[1])
    if (d) found.add(d)
  }
  return found
}

/** "02 :00   PM" -> "02:00 PM" */
function tidyTime(raw: string): string {
  return raw.replace(/\s*([:.])\s*/, '$1').replace(/\s+/g, ' ').trim()
}

/** Finds the date/time stated right after a milestone label in the extracted PDF text. */
function findMilestone(text: string, keyRe: RegExp, stopRe: RegExp) {
  keyRe.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = keyRe.exec(text))) {
    const labelEnd = match.index + match[0].length
    let windowText = text.slice(labelEnd, labelEnd + 220)
    const stop = windowText.search(stopRe)
    if (stop >= 0) windowText = windowText.slice(0, stop)
    const dateMatch = windowText.match(DATE_RE)
    const date = dateMatch ? normalizeDate(dateMatch[1]) : ''
    if (!dateMatch || !date) continue
    const dateEnd = (dateMatch.index || 0) + dateMatch[0].length
    const timeMatch =
      windowText.slice(dateEnd, dateEnd + 60).match(TIME_RE) || windowText.slice(0, dateMatch.index || 0).match(TIME_RE)
    return {
      date,
      time: timeMatch ? tidyTime(timeMatch[1]) : '',
      source: (match[0] + windowText).replace(/\s+/g, ' ').trim().slice(0, 200),
    }
  }
  return null
}

/** Reads the uploaded PDF from a data URL, raw base64 or a stored http(s) file URL. */
async function resolvePdfBytes(candidate: unknown): Promise<Uint8Array | null> {
  if (!candidate || typeof candidate !== 'string') return null
  try {
    if (/^https?:\/\//i.test(candidate)) {
      const res = await fetch(candidate)
      if (!res.ok) return null
      const buf = new Uint8Array(await res.arrayBuffer())
      return buf.length > 0 ? buf : null
    }
    const parts = candidate.split(',')
    const base64 = parts.length > 1 ? parts[1] : parts[0]
    const buffer = Buffer.from(base64, 'base64')
    return buffer.length > 0 ? new Uint8Array(buffer) : null
  } catch (decodeErr) {
    console.warn('Failed to resolve tender PDF:', decodeErr)
    return null
  }
}

/**
 * Bundled into .next, pdf.js resolves its worker next to the chunk, fails, and caches that failure for the
 * whole process. Load node_modules' copy natively instead (its worker resolves beside it), falling back to
 * the bundled build with an explicit worker path.
 */
async function loadPdfjs(): Promise<any> {
  const buildDir = path.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'legacy', 'build')
  const nativeEntry = path.join(buildDir, 'pdf.mjs')
  if (fs.existsSync(nativeEntry)) {
    try {
      return await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ pathToFileURL(nativeEntry).href)
    } catch (err) {
      console.warn('Native pdf.js load failed, using bundled build:', err)
    }
  }
  const pdfjsLib: any = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const workerPath = [path.join(buildDir, 'pdf.worker.mjs'), path.join(process.cwd(), 'public', 'pdfjs', 'pdf.worker.min.mjs')].find(
    p => fs.existsSync(p)
  )
  if (workerPath) pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href
  return pdfjsLib
}

/** Extracts the text layer of every page (tables included) with page markers. */
async function extractPdfText(pdfBytes: Uint8Array): Promise<{ text: string; pageCount: number; emptyPages: number }> {
  try {
    const pdfjsLib = await loadPdfjs()
    // pdf.js may detach the buffer it is given; keep the original for the AI file attachment
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBytes) }).promise
    let text = ''
    let emptyPages = 0
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const tc = await page.getTextContent()
      const pageText = tc.items.map((it: any) => (it.str || '') + (it.hasEOL ? '\n' : ' ')).join('')
      if (pageText.replace(/\s/g, '').length < 20) emptyPages++
      text += `\n--- PAGE ${i} ---\n${pageText}`
    }
    return { text, pageCount: doc.numPages, emptyPages }
  } catch (parseErr) {
    console.warn('Technical open check PDF text parsing warning:', parseErr)
    return { text: '', pageCount: 0, emptyPages: 0 }
  }
}

/** Keeps the schedule / key-dates passages so the model sees them as plain text even in long tenders. */
function scheduleSnippets(text: string): string {
  const re = /technical|techno[-\s]?commercial|cover[-\s]?(?:1|i)\b|schedule\s+of|key\s+dates|critical\s+dates|important\s+dates|tender\s+(?:schedule|programme|calendar)|bid\s+opening|evaluation|corrigendum|addendum/gi
  const ranges: Array<[number, number]> = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const start = Math.max(0, m.index - 300)
    const end = Math.min(text.length, m.index + 700)
    const last = ranges[ranges.length - 1]
    if (last && start <= last[1]) last[1] = Math.max(last[1], end)
    else ranges.push([start, end])
  }
  let out = ''
  for (const [s, e] of ranges) {
    if (out.length > 30000) break
    out += `\n...\n${text.slice(s, e)}`
  }
  return out.trim()
}

type CorrigendumOverride = { date: string; time: string; ref: string }

/** Latest corrigendum revision of a milestone (corrigenda are applied in issue order). */
function corrigendumOverride(corrigenda: any[], keyRe: RegExp): CorrigendumOverride | null {
  if (!Array.isArray(corrigenda) || corrigenda.length === 0) return null
  const ordered = [...corrigenda].sort((a, b) =>
    String(a?.issueDate || a?.uploadedAt || '').localeCompare(String(b?.issueDate || b?.uploadedAt || ''))
  )
  let result: CorrigendumOverride | null = null
  for (const corr of ordered) {
    for (const change of corr?.changes || []) {
      const label = `${change?.description || ''} ${change?.originalValue || ''}`
      keyRe.lastIndex = 0
      if (!keyRe.test(label)) continue
      const revised = String(change?.revisedValue || '')
      const dateMatch = revised.match(DATE_RE)
      const date = dateMatch ? normalizeDate(dateMatch[1]) : ''
      if (!dateMatch || !date) continue
      const timeMatch = revised.replace(dateMatch[0], ' ').match(TIME_RE)
      result = { date, time: timeMatch ? tidyTime(timeMatch[1]) : '', ref: corr?.corrigendumNo || 'Corrigendum' }
    }
  }
  return result
}

/** Model answers like "Not mentioned" / "N/A" are treated as absent. */
function cleanTime(t?: string): string {
  const v = (t || '').trim()
  return !v || /not\s+found|not\s+(?:stated|mentioned|specified|available)|^n\/?a$/i.test(v) ? '' : v
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { tender, pdfDataUrl, fileName, customQuery } = body

    if (!tender) {
      return NextResponse.json({ error: 'Tender object is required.' }, { status: 400 })
    }

    const title = tender.title || 'Government Tender'
    const authority = tender.authority || 'Tendering Authority'
    const dept = tender.department || 'Department'
    const bid = tender.bid || {}
    const rfsNo = bid.rfsNo || 'N/A'
    const corrigenda: any[] = Array.isArray(tender.corrigenda) ? tender.corrigenda : []

    // 1. Resolve the uploaded tender PDF (never a sample file: dates must come from THIS tender)
    const pdfBytes = await resolvePdfBytes(pdfDataUrl || tender.tenderDoc?.dataUrl)
    const activeFileName = fileName || tender.tenderDoc?.name || 'Tender_Document.pdf'

    if (!pdfBytes) {
      return NextResponse.json(
        { success: false, error: 'No tender PDF is attached to this tender. Upload the tender PDF and try again.' },
        { status: 400 }
      )
    }

    const { text: pdfText, pageCount, emptyPages } = await extractPdfText(pdfBytes)
    // Pages without a text layer are scanned images; the model reads them visually (OCR) from the attached PDF
    const isScanned = pageCount > 0 && emptyPages / pageCount > 0.5

    // Deterministic reading of the schedule table; backs up the AI answer
    const textOpening = pdfText ? findMilestone(pdfText, OPENING_KEY_RE, OPENING_STOP_RE) : null
    const textEvaluation = pdfText ? findMilestone(pdfText, EVALUATION_KEY_RE, EVALUATION_STOP_RE) : null
    const corrOpening = corrigendumOverride(corrigenda, OPENING_KEY_RE)
    const corrEvaluation = corrigendumOverride(corrigenda, EVALUATION_KEY_RE)

    const corrigendumText = corrigenda
      .map((c: any) =>
        [
          `${c?.corrigendumNo || 'Corrigendum'} (issued ${c?.issueDate || 'date not stated'})`,
          ...(c?.changes || []).map(
            (ch: any) => `- ${ch?.description || ch?.type || ''}: "${ch?.originalValue || ''}" -> "${ch?.revisedValue || ''}"`
          ),
        ].join('\n')
      )
      .join('\n\n')

    // 2. AI Extraction using OpenAI with the actual PDF document
    const apiKey = process.env.OPENAI_API_KEY
    let aiData: z.infer<typeof technicalOpenCheckSchema> | null = null
    if (apiKey) {
      try {
        const openai = createOpenAI({ apiKey })
        const modelName = process.env.OPENAI_MODEL || 'gpt-4o'
        const snippets = scheduleSnippets(pdfText)

        const promptText = `
You are an expert AI procurement specialist analyzing an official Indian government tender document (NIT, RFP, RfS).
Read the ENTIRE attached tender document page by page, including scanned pages (read them visually), tables, the Schedule of Events / Key Dates / Critical Dates table, the NIT notice, annexures and any corrigendum or addendum pages.

Extract the following details with 100% precision:

1. OPENING OF TECHNICAL BID:
- Identify the exact milestone row or clause for "Opening of Technical Bid", "Technical Bid Opening", "Opening of e-Technical Bid", "Techno-Commercial Bid Opening", or "Opening of Technical Envelope (Cover-1 / Envelope-A / Part-I)".
- Extract the exact Date. Format strictly as YYYY-MM-DD (Indian dates are day-first: 05/11/2026 = 2026-11-05).
- Extract the exact Time as stated in the document (e.g. "12:00 PM Onwards", "15:00 Hrs", "12:00 PM").
- Extract the exact Opening Venue / Portal (e.g. Conference Hall address, e-Procurement portal URL, or Authority HO).
- CRITICAL WARNING: DO NOT use the bid submission deadline date or time (such as "Submission of Online Bid", "Period of availability of bidding document", "Last date of bid submission"), the pre-bid meeting, document sale, or the financial/price bid opening. The Technical Bid Opening is a distinct, separate event.
- If no technical bid opening date is stated, return "openingDate": "" and "openingTime": "${NOT_FOUND}". Never guess.

2. EVALUATION OF TECHNICAL BID:
- Search the document specifically for an event or milestone row labeled "Evaluation of Technical bid", "Technical Bid Evaluation", or "Technical Bid Scrutiny".
- If the document EXPLICITLY specifies an Evaluation Date: format strictly as YYYY-MM-DD.
- If the document EXPLICITLY specifies an Evaluation Time: format as stated (e.g. "12:00 PM Onwards").
- If the document EXPLICITLY specifies an Evaluation Venue: return the venue text.
- CRITICAL REQUIREMENT: If the tender document DOES NOT explicitly state a date or time for technical bid evaluation, you MUST return:
  "evaluationDate": "",
  "evaluationTime": "${NOT_FOUND}",
  "evaluationVenue": "${NOT_FOUND}"
  DO NOT guess, assume, or invent an evaluation date/time, and DO NOT copy the opening date into it.

3. CORRIGENDUM PRIORITY:
- If a corrigendum / addendum (inside the PDF or listed below) revises the technical bid opening or evaluation date/time, return the LATEST revised value, not the original.

4. OPENING SUMMARY & PROTOCOL:
- 2-3 concise sentences detailing the opening procedure, presence of bidder representatives, decryption of online bids, and role of the Tender Committee.

5. TECHNICAL EVALUATION CRITERIA:
- Extract detailed evaluation criteria: technical compliance, testing parameters, scoring points, BIS/ISO compliance, and eligibility scrutiny.

6. APPLICABLE TECHNICAL CONDITIONS & RESPONSIVENESS:
- Key mandatory conditions: OEM authorization (MAF), NABL accredited lab test report, BIS license validity, past supply experience, turnover compliance.

7. SOURCE:
- In openingSourceText / evaluationSourceText quote the row or clause each date was read from (with page number or corrigendum no.), or "" if not found.

Context:
Tender Title: ${title}
Tendering Authority: ${authority} (${dept})
RFS / NIT Ref: ${rfsNo}
Bid submission deadline (do NOT return this as the opening date unless the document states opening at that time): ${tender.due || 'unknown'} ${bid.bidDeadlineTime || ''}
${corrigendumText ? `\nCorrigenda recorded for this tender (latest applicable value wins):\n${corrigendumText}\n` : ''}
${snippets ? `\nText layer of the schedule / key-dates passages of the PDF (the full PDF is also attached):\n"""\n${snippets}\n"""\n` : ''}
${customQuery ? `User Instruction: ${customQuery}` : ''}
`

        const { output } = await generateText({
          model: openai(modelName),
          system: 'You extract precise technical bid opening and evaluation schedules strictly from Indian government tenders. Only report values the document actually states.',
          output: Output.object({ schema: technicalOpenCheckSchema }),
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: promptText },
                { type: 'file', data: pdfBytes, mediaType: 'application/pdf', filename: activeFileName },
              ],
            },
          ],
        })
        aiData = output
      } catch (aiErr: any) {
        console.warn('AI Technical Open Check extraction fallback:', aiErr?.message || aiErr)
      }
    }

    // 3. Resolve both schedules: corrigendum revision > AI reading of the PDF > schedule-table text match
    // With a readable text layer, an AI date must literally occur in the tender / corrigenda (no inferred dates)
    const sourceDates = datesIn(`${pdfText}\n${corrigendumText}`)
    const verified = (d: string) => (d && (isScanned || sourceDates.size === 0 || sourceDates.has(d)) ? d : '')
    const aiOpeningDate = verified(normalizeDate(aiData?.openingDate))
    const aiEvaluationDate = verified(normalizeDate(aiData?.evaluationDate))

    const openingDate = corrOpening?.date || aiOpeningDate || textOpening?.date || ''
    const openingTime =
      (corrOpening ? corrOpening.time : '') ||
      (aiOpeningDate && openingDate === aiOpeningDate ? cleanTime(aiData?.openingTime) : '') ||
      (textOpening && openingDate === textOpening.date ? textOpening.time : '') ||
      NOT_FOUND

    const evaluationDate = corrEvaluation?.date || aiEvaluationDate || textEvaluation?.date || ''
    const evaluationTime =
      (corrEvaluation ? corrEvaluation.time : '') ||
      (aiEvaluationDate && evaluationDate === aiEvaluationDate ? cleanTime(aiData?.evaluationTime) : '') ||
      (textEvaluation && evaluationDate === textEvaluation.date ? textEvaluation.time : '') ||
      NOT_FOUND

    const schedule = {
      openingDate,
      openingTime,
      evaluationDate,
      evaluationTime,
      openingSource: corrOpening ? corrOpening.ref : aiData?.openingSourceText || textOpening?.source || '',
      evaluationSource: corrEvaluation ? corrEvaluation.ref : aiData?.evaluationSourceText || textEvaluation?.source || '',
      isScanned,
    }

    if (aiData) {
      return NextResponse.json({ success: true, data: { ...aiData, ...schedule }, source: 'ai' })
    }

    // 4. Resilient Heuristic Fallback (dates only from the document text / corrigenda, never assumed)
    const fallbackData = {
      ...schedule,
      openingVenueOrPortal: `e-Procurement Portal / Conference Hall of ${authority} (${dept})`,
      openingSummary: `Technical Bids (Cover-1) will be opened online by the designated Evaluation Committee. Bid decrypting keys and technical documents submitted online will be scrutinized in accordance with the Tender Guidelines.`,
      evaluationVenue: NOT_FOUND,
      evaluationCriteria: [
        `1. Preliminary Scrutiny: Verification of EMD submission, Tender Processing Fee, and Power of Attorney.`,
        `2. Technical Specifications Compliance: Complete adherence to technical specs for ${title.slice(0, 70)}.`,
        `3. Quality Standards: Mandatory Type Test Reports from NABL accredited lab & BIS certification.`,
        `4. OEM Authorization: Valid Manufacturer Authorization Form (MAF) in specified format.`,
        `5. Non-Blacklisting & Responsiveness: Valid affidavit affirming non-debarment by Central/State entities.`,
      ].join('\n'),
      complianceConditions: [
        `• Full technical compliance to parameters without deviations.`,
        `• Submission of valid test certificates conforming to IS/IEC standards.`,
        `• Valid OEM MAF backing supply and warranty commitments.`,
        `• Minimum scoring / responsiveness as evaluated by the Tender Scrutiny Committee.`,
      ].join('\n'),
    }

    return NextResponse.json({ success: true, data: fallbackData, source: 'heuristic' })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error processing technical open check' }, { status: 500 })
  }
}
