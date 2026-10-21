import { NextResponse } from 'next/server'
import { createOpenAI } from '@ai-sdk/openai'
import { generateText, Output } from 'ai'
import { z } from 'zod'

export const runtime = 'nodejs'
export const maxDuration = 60

const aiMatchingSchema = z.object({
  mafLetterMatch: z.object({
    documentId: z.string().nullable().describe('ID of the document matching MAF Letter, or null if none'),
    confidence: z.enum(['high', 'medium', 'low', 'none']),
    reason: z.string().describe('Reason for matching or not finding the MAF Letter'),
  }),
  testReportMatch: z.object({
    documentId: z.string().nullable().describe('ID of the document matching Test Report, or null if none'),
    confidence: z.enum(['high', 'medium', 'low', 'none']),
    reason: z.string().describe('Reason for matching or not finding the Test Report'),
  }),
  bisCertificateMatch: z.object({
    documentId: z.string().nullable().describe('ID of the document matching BIS Certificate, or null if none'),
    confidence: z.enum(['high', 'medium', 'low', 'none']),
    reason: z.string().describe('Reason for matching or not finding the BIS Certificate'),
  }),
  productSampleMatch: z.object({
    documentId: z.string().nullable().describe('ID of the document matching Product Sample, or null if none'),
    confidence: z.enum(['high', 'medium', 'low', 'none']),
    reason: z.string().describe('Reason for matching or not finding the Product Sample'),
  }),
  summary: z.string().describe('Brief summary of AI document identification'),
})

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { tenderTitle, authority, technicalComponents, documents } = body

    if (!Array.isArray(documents) || documents.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          mafLetterMatch: { documentId: null, confidence: 'none', reason: 'No source documents available in tender records.' },
          testReportMatch: { documentId: null, confidence: 'none', reason: 'No source documents available in tender records.' },
          bisCertificateMatch: { documentId: null, confidence: 'none', reason: 'No source documents available in tender records.' },
          productSampleMatch: { documentId: null, confidence: 'none', reason: 'No source documents available in tender records.' },
          summary: 'No documents provided for AI matching.',
        },
      })
    }

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      // Return gracefully if no API key configured; client-side heuristic will handle it
      return NextResponse.json({
        success: false,
        error: 'OPENAI_API_KEY not configured, falling back to local heuristic matcher.',
      })
    }

    const openai = createOpenAI({ apiKey })
    const prompt = `
You are an expert procurement and tender verification AI assistant for Indian Government tenders (e.g. SECI, DISCOMs, PWD, NTPC).
Analyze the following tender metadata and list of available documents uploaded in previous modules (New Tender and Eligibility Check).

Tender Title: ${tenderTitle || 'Tender'}
Authority: ${authority || 'Tendering Authority'}
Technical Scope & Equipment Components:
${JSON.stringify(technicalComponents || [], null, 2)}

Available Documents from New Tender & Eligibility Check:
${JSON.stringify(documents, null, 2)}

RULES:
1. Match EXACTLY which document corresponds to each of the 4 required Sample Details fields:
   - MAF Letter (Manufacturer Authorization Form / OEM authorization)
   - Test Report (Laboratory / Type Test Report / NABL / ERDA / CPRI compliance)
   - BIS Certificate (Bureau of Indian Standards / CRS certificate / IS compliance)
   - Product Sample (Sample courier receipt, physical sample photograph, dispatch slip)
2. CRITICAL: Do NOT match unrelated documents!
   - For example: Annual Turnover certificate, CA balance sheet, generic GST/PAN cards must NEVER be matched as Test Reports or MAF Letters.
3. If no document genuinely matches a required field, set documentId to null and confidence to "none".
4. State a concise, professional reason for each match or missing status.
`

    const { output } = await generateText({
      model: openai(process.env.OPENAI_MODEL || 'gpt-4o'),
      system: 'You are an AI document verification auditor. Strictly match documents to categories or declare them not found.',
      output: Output.object({ schema: aiMatchingSchema }),
      prompt,
    })

    return NextResponse.json({
      success: true,
      data: output,
    })
  } catch (err: any) {
    console.warn('AI matching API error, client heuristic will serve as fallback:', err?.message)
    return NextResponse.json(
      {
        success: false,
        error: err?.message || 'AI document matching failed',
      },
      { status: 200 } // Return 200 so frontend can cleanly fall back
    )
  }
}
