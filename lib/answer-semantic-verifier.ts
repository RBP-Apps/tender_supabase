// Server-only. Independent OpenAI verification pass (proposal E).
//
// Runs only when the deterministic checks cannot decide:
//   • the answer cites valid pages but contains no machine-checkable fact
//     (no amount/date/percentage/quote), or
//   • the answer says "not found" although passages were retrieved
//     (checks whether the evidence was actually missed).
//
// A separate call reads the ORIGINAL page text and must return a verbatim quote
// per claim; every quote is then checked deterministically on that page. The
// model's own opinion is never accepted without a matching quote.

import { generateObject } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { z } from 'zod'
import { DocumentPageChunk, DocumentVerificationResult } from '@/types/document-understanding'
import { quoteOnPage } from '@/lib/document-verifier'
import { UsageTracker } from '@/lib/ai-usage'

const claimSchema = z.object({
  claims: z.array(
    z.object({
      claim: z.string().describe('One factual statement made in the ANSWER'),
      supported: z.boolean().describe('True only if the EVIDENCE explicitly states it'),
      pageNumber: z.number().describe('PAGE number of the evidence passage, or 0 if unsupported'),
      quote: z.string().describe('Verbatim text copied from that page that supports the claim, or ""'),
    })
  ),
})

const missedSchema = z.object({
  answerPresent: z.boolean().describe('True only if the EVIDENCE explicitly contains the answer to the QUESTION'),
  pageNumber: z.number().describe('PAGE number where it appears, or 0'),
  quote: z.string().describe('Verbatim text copied from that page, or ""'),
})

function evidenceBlock(chunks: DocumentPageChunk[], maxChars = 60000): string {
  let out = ''
  for (const c of chunks) {
    const block = `=== [DOCUMENT: "${c.docName}" | PAGE: ${c.pageNumber ?? '-'}] ===\n${c.content}\n\n`
    if (out.length + block.length > maxChars) break
    out += block
  }
  return out
}

export async function runSemanticVerification(params: {
  question: string
  answer: string
  deterministic: DocumentVerificationResult
  retrieved: DocumentPageChunk[]
  usage?: UsageTracker
}): Promise<DocumentVerificationResult> {
  const det = params.deterministic
  const apiKey = process.env.OPENAI_API_KEY
  const model = process.env.OPENAI_MODEL || 'gpt-4o'

  const needsClaimCheck = det.status === 'verified' && (det.factChecks ?? 0) === 0
  const needsMissedCheck = det.status === 'evidence-not-found' && params.retrieved.length > 0
  if (!needsClaimCheck && !needsMissedCheck) return det
  if (!apiKey) {
    return {
      ...det,
      ...(needsClaimCheck ? { status: 'not-verified' as const, isVerified: false } : {}),
      semanticCheck: { ran: false, verdict: 'error', notes: 'Semantic verification unavailable (no API key).' },
    }
  }

  const openai = createOpenAI({ apiKey })
  const system =
    'You are an independent auditor. You did NOT write the answer. Judge it ONLY against the EVIDENCE text provided (original tender pages). ' +
    'Never use outside knowledge. Quotes must be copied character-for-character from the evidence.'

  try {
    if (needsClaimCheck) {
      const pages = det.citedChunks && det.citedChunks.length ? det.citedChunks : params.retrieved
      const res = await generateObject({
        model: openai(model),
        schema: claimSchema,
        temperature: 0,
        system,
        prompt: `QUESTION:\n${params.question}\n\nANSWER TO AUDIT:\n${params.answer}\n\nEVIDENCE:\n${evidenceBlock(pages)}\n\nList every factual claim in the ANSWER (ignore source lines and pleasantries) and decide if the EVIDENCE explicitly supports it.`,
      })
      params.usage?.add('verify', model, res.usage as any)
      const claims = res.object.claims
      if (!claims.length) {
        return { ...det, semanticCheck: { ran: true, verdict: 'no-claims', notes: 'No factual claims to audit.' } }
      }
      const problems: string[] = []
      for (const c of claims) {
        const page = pages.find(p => p.pageNumber === c.pageNumber)
        const quoteOk = !!page && !!c.quote && quoteOnPage(c.quote, page.content)
        if (!c.supported) problems.push(`Not supported by the cited pages: "${c.claim}"`)
        else if (!quoteOk) problems.push(`Supporting quote for "${c.claim}" could not be found on page ${c.pageNumber || '?'}.`)
      }
      if (problems.length === 0) {
        return {
          ...det,
          confidence: 'high',
          semanticCheck: { ran: true, verdict: 'supported', notes: `${claims.length} claim(s) confirmed with verbatim quotes.` },
          auditNotes: `${det.auditNotes} Independent check: ${claims.length} claim(s) confirmed with verbatim quotes.`,
        }
      }
      const someOk = problems.length < claims.length
      return {
        ...det,
        status: 'not-verified',
        isVerified: false,
        confidence: 'low',
        unverifiedClaims: [...(det.unverifiedClaims || []), ...problems].slice(0, 10),
        semanticCheck: {
          ran: true,
          verdict: someOk ? 'partially-supported' : 'unsupported',
          notes: `${problems.length} of ${claims.length} claim(s) not confirmed.`,
        },
      }
    }

    // needsMissedCheck
    const res = await generateObject({
      model: openai(model),
      schema: missedSchema,
      temperature: 0,
      system,
      prompt: `QUESTION:\n${params.question}\n\nAn assistant answered that this information is NOT in the document.\n\nEVIDENCE:\n${evidenceBlock(params.retrieved)}\n\nDoes the EVIDENCE explicitly contain the answer?`,
    })
    params.usage?.add('verify', model, res.usage as any)
    const o = res.object
    const page = params.retrieved.find(p => p.pageNumber === o.pageNumber)
    if (o.answerPresent && page && o.quote && quoteOnPage(o.quote, page.content)) {
      return {
        ...det,
        status: 'not-verified',
        isVerified: false,
        confidence: 'low',
        unverifiedClaims: [
          ...(det.unverifiedClaims || []),
          `The answer says "not found", but page ${o.pageNumber} of "${page.docName}" may contain it: "${o.quote.slice(0, 200)}"`,
        ],
        semanticCheck: { ran: true, verdict: 'missed-evidence', notes: `Possible missed evidence on page ${o.pageNumber}.` },
      }
    }
    return {
      ...det,
      semanticCheck: { ran: true, verdict: 'supported', notes: 'Independent check found no answer in the retrieved pages.' },
    }
  } catch (e: any) {
    // Failure is reported; an unconfirmed text-only answer is not marked verified.
    return {
      ...det,
      ...(needsClaimCheck ? { status: 'not-verified' as const, isVerified: false, confidence: 'low' as const } : {}),
      unverifiedClaims: [...(det.unverifiedClaims || []), `Independent verification failed: ${e?.message || e}`],
      semanticCheck: { ran: false, verdict: 'error', notes: e?.message || String(e) },
    }
  }
}
