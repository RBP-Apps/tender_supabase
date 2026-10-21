import { generateText, NoObjectGeneratedError, Output } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { NextResponse } from 'next/server'
import { corrigendumExtractionSchema } from '@/lib/corrigendum-extraction-schema'

export const runtime = 'nodejs'
export const maxDuration = 120

const MAX_PDF_BYTES = 25 * 1024 * 1024
const DEFAULT_MODEL = 'gpt-6-astra'

const INSTRUCTIONS =
  'You are an expert Indian government tender analyst specializing in processing Tender Corrigenda, Amendments, Addenda, and Clarifications. ' +
  'A corrigendum is an official document released after the original tender to modify dates, extend deadlines, clarify specifications, or adjust conditions. ' +
  'Read the entire uploaded PDF carefully, including tables, annexures, and serial-numbered points. ' +
  '1. Extract the Corrigendum Number / Title (e.g., "Corrigendum-1", "Amendment No. 2"), issue date (formatted YYYY-MM-DD), and the tender reference number quoted in the document. ' +
  '2. Identify ALL changes, modifications, extensions, corrections, and clarifications. DO NOT stop after the first change; extract every single item. ' +
  '3. Distinguish clearly between the Original Value / Condition and the Revised Value / Condition. If the original value is not mentioned in the text, use the provided Current Tender details or state "As per original NIT". ' +
  '4. Map changes to standard tender fields where applicable (e.g. "due" for submission deadline date, "bidDeadlineTime" for submission time, "corrigendumRef" for corrigendum title/date, "tenderFeePerPackage", "financialRequirementCr", "technicalRequirement", "value", etc.). Use "none" for non-scalar clauses, technical clarifications, or general condition updates. ' +
  '5. Flag high-impact changes (deadlines, EMD, eligibility, technical specs) as isCritical: true. ' +
  '6. Never hallucinate or invent changes that are not in the document.'

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'OPENAI_API_KEY is not configured on the server. Add it to .env.local and restart the app.' },
      { status: 500 }
    )
  }

  let file: File | null = null
  let currentTenderContext = ''

  try {
    const form = await request.formData()
    const entry = form.get('file')
    file = entry instanceof File ? entry : null

    const tenderJson = form.get('currentTender')
    if (typeof tenderJson === 'string' && tenderJson.trim()) {
      try {
        const parsed = JSON.parse(tenderJson)
        currentTenderContext =
          `CURRENT TENDER RECORD (for comparison):\n` +
          `- Tender Ref / RfS No: ${parsed.rfsNo || 'Not specified'}\n` +
          `- Tender Date: ${parsed.rfsDate || 'Not specified'}\n` +
          `- Title / Work Name: ${parsed.title || parsed.workName || 'Not specified'}\n` +
          `- Issuing Authority: ${parsed.authority || parsed.authorityFullName || 'Not specified'}\n` +
          `- Current Submission Deadline Date: ${parsed.due || 'Not specified'}\n` +
          `- Current Submission Deadline Time: ${parsed.bidDeadlineTime || 'Not specified'}\n` +
          `- Current Estimated Value: ${parsed.value || 'Not specified'}\n` +
          `- Current Tender Fee: ${parsed.tenderFeePerPackage || 'Not specified'}\n` +
          `- Current Financial Requirement: ${parsed.financialRequirementCr ? `${parsed.financialRequirementCr} Cr` : 'Not specified'}\n` +
          `- Current Technical Requirement: ${parsed.technicalRequirement || 'Not specified'}\n` +
          `- Current Corrigendum Note: ${parsed.corrigendum || 'None'}\n`
      } catch {
        // Ignore JSON parse failure
      }
    }
  } catch {
    return NextResponse.json({ error: 'Invalid upload format.' }, { status: 400 })
  }

  if (!file) return NextResponse.json({ error: 'No Corrigendum PDF file uploaded.' }, { status: 400 })
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: 'Only PDF files are supported.' }, { status: 400 })
  }
  if (file.size > MAX_PDF_BYTES) {
    return NextResponse.json({ error: 'PDF is larger than 25 MB.' }, { status: 413 })
  }

  const openai = createOpenAI({ apiKey })
  const data = new Uint8Array(await file.arrayBuffer())

  const userPrompt = currentTenderContext
    ? `${currentTenderContext}\n\n` +
      `Read the attached Corrigendum / Amendment PDF carefully. Extract the corrigendum details and compare every change against the Current Tender Record above. Identify all revisions, deadline extensions, EMD alterations, revised clauses, and clarifications.`
    : 'Read the attached Corrigendum / Amendment PDF. Extract the corrigendum number, publication date, reference tender, and every change, deadline extension, and clarification.'

  try {
    const { output } = await generateText({
      model: openai(process.env.OPENAI_MODEL || DEFAULT_MODEL),
      system: INSTRUCTIONS,
      output: Output.object({ schema: corrigendumExtractionSchema }),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: userPrompt },
            { type: 'file', data, mediaType: 'application/pdf', filename: file.name },
          ],
        },
      ],
    })
    return NextResponse.json({ data: output })
  } catch (err) {
    if (NoObjectGeneratedError.isInstance(err)) {
      return NextResponse.json(
        { error: 'The model could not extract structured changes from this Corrigendum PDF. Please review the document manually.' },
        { status: 502 }
      )
    }
    const message = err instanceof Error ? err.message : 'Corrigendum extraction failed.'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
