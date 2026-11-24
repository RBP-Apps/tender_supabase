import { generateText, NoObjectGeneratedError, Output } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { NextResponse } from 'next/server'
import { tenderExtractionSchema } from '@/lib/tender-extraction-schema'
import { buildTenderMap } from '@/lib/tender-map'
import { extractPdfPageTexts, validateAndFillExtraction, normalizeExtraction } from '@/lib/tender-validation-agent'

export const runtime = 'nodejs'
export const maxDuration = 300

const MAX_PDF_BYTES = 25 * 1024 * 1024
// Used only when OPENAI_MODEL is not set in .env.local (must be a model that accepts PDF input).
const DEFAULT_MODEL = 'gpt-4o'

const INSTRUCTIONS =
  'You extract structured data from Indian government tender documents (NIT / RfS / RFP / bid documents). ' +
  'Read the entire uploaded tender PDF, including all tables, annexures, eligibility criteria, financial conditions, technical specifications, and corrigenda. ' +
  'Only report values the document actually states; use null (or an empty array) for anything not present. Never guess, invent, or insert sample data. ' +
  'EMD / earnest money is ONLY the earnest-money amount stated for it (e.g. Rs 5,00,000 = 5 Lakh). Never add the tender/bid document fee or GST to it, even when the tender says both are paid in one NEFT/RTGS transaction. Convert every date to YYYY-MM-DD. Convert EMD amounts to Rs. Lakh (e.g. Rs. 92,00,000 = 92). Only report beneficiary bank details that belong to the authority (the payee). ' +
  'For GST Section: automatically extract applicable GST rates, GST amounts, and relevant GST conditions for the tender fee and contract with appropriate context. ' +
  'For Tender Fee + GST: calculate Total = Tender Fee + Applicable GST Amount. If the document states fee is inclusive of GST, use that amount without adding GST again. Clearly distinguish base tender fee, GST amount, and total amount. Do not assume a GST rate if not specified in the document. ' +
  'For Test Report Compliance: provide a concise 3-5 line summary of exact test report requirements, standards (IS/IEC), accredited labs (NABL), report validity, and compliance conditions. ' +
  'For MAF Requirement: provide a concise 3-5 line summary of Manufacturer Authorization Form format, eligibility, validity, signatures/stamps, or "Not Required" if the document confirms this. ' +
  'For Experience Filed (Exact Requirement): preserve exact wording, numbers, percentages, project values, and eligibility conditions verbatim from the tender clauses. ' +
  'For Turn Over (Turnover): preserve exact turnover criteria verbatim, distinguishing average annual turnover (MAAT) from individual year requirements.'

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'OPENAI_API_KEY is not configured on the server. Add it to .env.local and restart the app.' },
      { status: 500 }
    )
  }

  let file: File | null = null
  try {
    const form = await request.formData()
    const entry = form.get('file')
    file = entry instanceof File ? entry : null
  } catch {
    return NextResponse.json({ error: 'Invalid upload.' }, { status: 400 })
  }

  if (!file) return NextResponse.json({ error: 'No PDF file uploaded.' }, { status: 400 })
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: 'Only PDF files are supported.' }, { status: 400 })
  }
  if (file.size > MAX_PDF_BYTES) {
    return NextResponse.json({ error: 'PDF is larger than 25 MB.' }, { status: 413 })
  }

  const openai = createOpenAI({ apiKey })
  const data = new Uint8Array(await file.arrayBuffer())

  try {
    const modelName = process.env.OPENAI_MODEL || DEFAULT_MODEL
    const { output } = await generateText({
      model: openai(modelName),
      system: INSTRUCTIONS,
      output: Output.object({ schema: tenderExtractionSchema }),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extract the tender details from this document.' },
            { type: 'file', data, mediaType: 'application/pdf', filename: file.name },
          ],
        },
      ],
    })
    // Validation agent: cross-check against the PDF text, recover empty fields with
    // page-level proof, and report what is still missing. Never blocks pass-1 data.
    try {
      normalizeExtraction(output)
      const pages = await extractPdfPageTexts(data)
      const { extraction, report } = await validateAndFillExtraction({
        extraction: output,
        pages,
        model: openai(process.env.OPENAI_VALIDATION_MODEL || modelName),
      })
      return NextResponse.json({ data: extraction, validation: report, tenderMap: buildTenderMap(pages) })
    } catch (vErr) {
      console.warn('[extract-tender] validation agent failed, returning pass-1 data:', vErr)
      return NextResponse.json({ data: output, validation: null })
    }
  } catch (err) {
    if (NoObjectGeneratedError.isInstance(err)) {
      return NextResponse.json(
        { error: 'The model could not extract structured data from this PDF. Please fill the fields manually.' },
        { status: 502 }
      )
    }
    const message = err instanceof Error ? err.message : 'OpenAI request failed.'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
