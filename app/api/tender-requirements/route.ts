import { NextResponse } from 'next/server'
import { createOpenAI } from '@ai-sdk/openai'
import { generateObject } from 'ai'
import { z } from 'zod'
import { loadTenderEvidence, hybridRetrieve } from '@/lib/tender-evidence'
import { getIndexMetadata, setIndexMetadata } from '@/lib/document-index-store'
import { quoteOnPage } from '@/lib/document-verifier'
import { UsageTracker } from '@/lib/ai-usage'
import { DocumentPageChunk } from '@/types/document-understanding'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * Tender-specific eligibility document checklist (proposal F).
 * Replaces the static CREDA checklist: every item comes from THIS tender's own
 * document/corrigenda and carries a page number + verbatim quote that is checked
 * against that page. Cached on the tender's document index.
 *
 * Body: { tender, refresh?: boolean }
 */

const itemSchema = z.object({
  documentName: z.string().describe('Name of the document the bidder must submit, as the tender words it'),
  requirement: z.enum(['MANDATORY', 'REQUIRED', 'CONDITIONAL']).describe('CONDITIONAL when it applies only to some bidders (e.g. MSE, dealer, startup)'),
  condition: z.string().describe('The condition for CONDITIONAL items, else ""'),
  sourceDocument: z.string().describe('Document name from the "DOCUMENT" header'),
  pageNumber: z.number().describe('Physical PDF page number from the "PAGE: X" header'),
  clauseOrSection: z.string().describe('Clause / section / checklist point as printed, or ""'),
  description: z.string().describe('One short line on what must be submitted'),
  evidenceQuote: z.string().describe('Verbatim text copied from that page demanding this document'),
})
const checklistSchema = z.object({ items: z.array(itemSchema) })

const QUERIES = [
  'documents to be submitted by the bidder eligibility qualification checklist',
  'check list of documents to be uploaded envelope pre-qualification technical bid',
  'certificate copy to be enclosed PAN GST registration affidavit undertaking',
  'turnover certificate net worth audited balance sheet CA certificate ITR',
  'experience certificate work order completion performance certificate',
  'दस्तावेज़ सूची पात्रता प्रमाण पत्र',
]

function companyDocKey(name: string): 'networthDoc' | 'turnoverDoc' | 'experienceDoc' | null {
  if (/net\s*-?\s*worth/i.test(name)) return 'networthDoc'
  if (/turn\s*-?\s*over/i.test(name)) return 'turnoverDoc'
  if (/experience|completion|work order|performance certificate/i.test(name)) return 'experienceDoc'
  return null
}

export async function POST(request: Request) {
  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }
  const tender = body?.tender
  if (!tender?.id) return NextResponse.json({ error: 'tender is required.' }, { status: 400 })

  const usage = new UsageTracker()
  const warnings: string[] = []
  const evidence = await loadTenderEvidence(tender, { usage, timeBudgetMs: 150000 })
  warnings.push(...evidence.warnings)
  if (evidence.incomplete) {
    return NextResponse.json({ pending: true, error: `Tender document is still being read (${evidence.statusText}).` }, { status: 409 })
  }
  if (!evidence.chunks.length) {
    return NextResponse.json({
      items: [],
      evidenceStatus: evidence.statusText,
      warnings: [...warnings, 'No tender document text is available, so no checklist could be extracted.'],
      usage: usage.toJSON(),
    })
  }

  // Cache: keyed by the exact set of documents read (a replaced file invalidates it)
  const signature = evidence.docs.map(d => `${d.role}:${d.docHash}`).sort().join('|')
  const cacheHolder = evidence.docs.find(d => d.role === 'tender' && d.persisted && d.indexId)
  if (cacheHolder && !body.refresh) {
    try {
      const meta = await getIndexMetadata(cacheHolder.indexId!)
      const cached = meta.eligibilityChecklist
      if (cached?.signature === signature && Array.isArray(cached.items)) {
        return NextResponse.json({ items: cached.items, evidenceStatus: evidence.statusText, warnings, cached: true, usage: usage.toJSON() })
      }
    } catch {}
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'OPENAI_API_KEY is not configured; the checklist cannot be extracted.' }, { status: 503 })
  }

  const picked = new Map<string, DocumentPageChunk>()
  const results = await Promise.all(
    QUERIES.map(q =>
      hybridRetrieve({ tenderId: String(tender.id), docs: evidence.docs, chunks: evidence.chunks, query: q, maxTokens: 7000, usage, warnings })
    )
  )
  for (const r of results) {
    r.retrievedChunks.forEach(c => picked.set(c.id, c))
  }
  if (picked.size < 5 && evidence.chunks.length > 0) {
    const fallbackPages = evidence.chunks
      .filter(c => /checklist|eligibility|turnover|experience|documents\s*to\s*be\s*submitted|annexure|bidder/i.test(c.content) || (c.pageNumber && c.pageNumber <= 20))
      .slice(0, 15)
    for (const c of fallbackPages) {
      if (!picked.has(c.id)) {
        picked.set(c.id, c)
      }
    }
  }

  const pages = Array.from(picked.values()).sort((a, b) =>
    a.docName === b.docName ? (a.pageNumber || 0) - (b.pageNumber || 0) : a.docName.localeCompare(b.docName)
  )
  let context = ''
  for (const c of pages) {
    const block = `=== [DOCUMENT: "${c.docName}" | PAGE: ${c.pageNumber}] ===\n${c.content}\n\n`
    if (context.length + block.length > 28000) {
      warnings.push('Some candidate pages were left out of the extraction (size limit).')
      break
    }
    context += block
  }

  let items: z.infer<typeof itemSchema>[] = []
  try {
    const openai = createOpenAI({ apiKey })
    const model = process.env.OPENAI_MODEL || 'gpt-4o'
    const res = await generateObject({
      model: openai(model),
      schema: checklistSchema,
      temperature: 0,
      system:
        'You extract the list of documents a bidder must submit for eligibility / pre-qualification, ONLY from the tender passages given. ' +
        'Never add documents that are common in other tenders but not demanded here. Every item needs the PAGE number from its header and a verbatim quote from that page. ' +
        'If a corrigendum changes the list, follow the corrigendum and mention it in description. Do not duplicate items.',
      prompt: `TENDER PASSAGES:\n${context}\n\nExtract the eligibility / pre-qualification document checklist.`,
    })
    usage.add('extract', model, res.usage as any)
    items = res.object.items || []
  } catch (e: any) {
    warnings.push(`AI checklist model note (${e?.message || e}); using verified tender criteria fallback.`)
  }

  const readable = evidence.chunks.filter(c => !c.content.startsWith('[EXTRACTION FAILED'))
  let out: any[] = []

  if (items.length > 0) {
    out = items.map((it, i) => {
      const page = readable.find(c => c.pageNumber === it.pageNumber && (!it.sourceDocument || c.docName === it.sourceDocument))
      const quoteVerified = !!page && !!it.evidenceQuote && quoteOnPage(it.evidenceQuote, page.content)
      return {
        sNo: i + 1,
        documentName: it.documentName,
        requirement: it.requirement,
        clauseOrSection: [it.clauseOrSection, it.condition ? `(${it.condition})` : ''].filter(Boolean).join(' ') || '—',
        pageNumber: `Page ${it.pageNumber}${it.sourceDocument ? ` – ${it.sourceDocument}` : ''}`,
        description: it.description,
        evidenceQuote: it.evidenceQuote,
        quoteVerified,
        matchingCompanyDocKey: companyDocKey(it.documentName),
      }
    })
  }

  // No hard-coded fallback list: it belonged to a different (CREDA solar) tender. If the AI
  // returned nothing the UI shows an empty state and the user can re-scan.
  if (!out.length) warnings.push('No eligibility documents could be extracted from this tender. Use Re-scan, or add documents manually.')

  const unverified = out.filter(o => !o.quoteVerified).length
  if (unverified) warnings.push(`${unverified} checklist item(s) could not be verified on their cited page – check them manually.`)

  if (cacheHolder) {
    try {
      await setIndexMetadata(cacheHolder.indexId!, 'eligibilityChecklist', { signature, items: out, extractedAt: new Date().toISOString() })
    } catch (e: any) {
      warnings.push(`Checklist could not be cached: ${e?.message || e}`)
    }
  }
  console.info('[tender-requirements] usage', JSON.stringify(usage.toJSON()))
  return NextResponse.json({ items: out, evidenceStatus: evidence.statusText, warnings, cached: false, usage: usage.toJSON() })
}
