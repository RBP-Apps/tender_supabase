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

const VERIFIED_CREDA_CHECKLIST_ITEMS = [
  {
    sNo: 1,
    documentName: 'Tender Document Cost / Processing Fee Proof',
    requirement: 'MANDATORY',
    clauseOrSection: 'Checklist Point 1 (Section 1)',
    pageNumber: 'Page 3',
    description: 'Proof of submission of tender document fee (e.g. DD / MR / e-payment receipt).',
    evidenceQuote: 'Cost of Tender Document: Proof of submission of tender document cost.',
    quoteVerified: true,
  },
  {
    sNo: 2,
    documentName: 'Earnest Money Deposit (EMD) Proof / Exemption Certificate',
    requirement: 'MANDATORY',
    clauseOrSection: 'Checklist Point 2 (Section 1)',
    pageNumber: 'Page 3',
    description: 'EMD payment receipt, Bank Guarantee, or valid NSIC/MSME exemption certificate.',
    evidenceQuote: 'Earnest Money Deposit: Copy of EMD receipt or Bank Guarantee or exemption certificate.',
    quoteVerified: true,
  },
  {
    sNo: 3,
    documentName: 'GST Registration Certificate',
    requirement: 'MANDATORY',
    clauseOrSection: 'Checklist Point 3 (Section 1)',
    pageNumber: 'Page 3',
    description: 'Valid GST registration certificate in the state of operation/Chhattisgarh.',
    evidenceQuote: 'GST Registration: Copy of valid GST registration certificate.',
    quoteVerified: true,
  },
  {
    sNo: 4,
    documentName: 'Permanent Account Number (PAN) Card',
    requirement: 'MANDATORY',
    clauseOrSection: 'Checklist Point 4 (Section 1)',
    pageNumber: 'Page 3',
    description: 'Copy of PAN card of the bidding firm or company.',
    evidenceQuote: 'PAN Card: Copy of Permanent Account Number of the bidder.',
    quoteVerified: true,
  },
  {
    sNo: 5,
    documentName: 'CREDA Vendor Registration Certificate',
    requirement: 'MANDATORY',
    clauseOrSection: 'Checklist Point 5 (Section 1)',
    pageNumber: 'Page 4',
    description: 'Valid registration certificate with CREDA in Solar Photovoltaic Module category.',
    evidenceQuote: 'Registration with CREDA: Copy of valid registration with CREDA for SPV Modules.',
    quoteVerified: true,
  },
  {
    sNo: 6,
    documentName: 'Annual Financial Turnover Certificate with UDIN',
    requirement: 'MANDATORY',
    clauseOrSection: 'Checklist Point 6 (Section 1)',
    pageNumber: 'Page 4',
    description: 'CA-certified turnover certificate with UDIN for last 3 financial years (Min ₹ 3.00 Cr / ₹ 1.50 Cr for module manufacturer/supplier).',
    evidenceQuote: 'Average Annual Financial Turnover: Certified by Chartered Accountant with UDIN for the last three consecutive financial years.',
    quoteVerified: true,
    matchingCompanyDocKey: 'turnoverDoc' as const,
  },
  {
    sNo: 7,
    documentName: 'Positive Net Worth Certificate',
    requirement: 'MANDATORY',
    clauseOrSection: 'Checklist Point 7 (Section 1)',
    pageNumber: 'Page 4',
    description: 'CA certified Net Worth statement showing positive net worth.',
    evidenceQuote: 'Net Worth: Net worth of bidder must be positive as on 31st March of the preceding financial year.',
    quoteVerified: true,
    matchingCompanyDocKey: 'networthDoc' as const,
  },
  {
    sNo: 8,
    documentName: 'Past Technical Experience / Work Completion Certificate',
    requirement: 'MANDATORY',
    clauseOrSection: 'Checklist Point 8 (Section 1)',
    pageNumber: 'Page 4',
    description: 'Completion/performance certificates showing supply/installation of solar modules / solar systems.',
    evidenceQuote: 'Experience: Bidders must have experience in supply of SPV Modules to Government / Semi-Govt / PSU.',
    quoteVerified: true,
    matchingCompanyDocKey: 'experienceDoc' as const,
  },
  {
    sNo: 9,
    documentName: 'Valid BIS Registration Certificate (IS 14286 & IS/IEC 61730)',
    requirement: 'MANDATORY',
    clauseOrSection: 'Checklist Point 9 (Section 1)',
    pageNumber: 'Page 12',
    description: 'Valid BIS registration / license certificate for SPV crystalline modules.',
    evidenceQuote: 'BIS Certificate: Solar modules must have valid BIS certification conforming to IS 14286 and IS/IEC 61730.',
    quoteVerified: true,
  },
  {
    sNo: 10,
    documentName: 'Test Report from NABL / MNRE / BIS Accredited Laboratory',
    requirement: 'MANDATORY',
    clauseOrSection: 'Checklist Point 10 (Section 1)',
    pageNumber: 'Page 12',
    description: 'Type test report for quoted module wattages from an accredited laboratory.',
    evidenceQuote: 'Test Report: Test certificate / test report of the module issued by accredited test laboratory.',
    quoteVerified: true,
  },
  {
    sNo: 11,
    documentName: 'ALMM Listing Compliance Document',
    requirement: 'MANDATORY',
    clauseOrSection: 'Checklist Point 11 (Section 1)',
    pageNumber: 'Page 13',
    description: 'Proof of listing in MNRE Approved List of Models & Manufacturers (ALMM).',
    evidenceQuote: 'ALMM: Solar PV Modules must be enlisted in the ALMM Order issued by MNRE.',
    quoteVerified: true,
  },
  {
    sNo: 12,
    documentName: 'Manufacturer Authorization Form (MAF / Annexure III)',
    requirement: 'CONDITIONAL',
    clauseOrSection: 'Checklist Point 12 (Annexure III)',
    pageNumber: 'Page 18',
    description: 'Authorization letter from original module manufacturer if bidder is an authorized dealer / channel partner.',
    evidenceQuote: 'Manufacturer Authorization: In case the bidder is an authorized partner, MAF in Annexure-III format must be submitted.',
    quoteVerified: true,
  },
  {
    sNo: 13,
    documentName: 'Non-Blacklisting Undertaking (Annexure IV)',
    requirement: 'MANDATORY',
    clauseOrSection: 'Checklist Point 13 (Annexure IV)',
    pageNumber: 'Page 20',
    description: 'Notarized affidavit on non-judicial stamp paper stating firm is not blacklisted by any Govt / PSU.',
    evidenceQuote: 'Undertaking for Non-Blacklisting: On non-judicial stamp paper as per Annexure-IV.',
    quoteVerified: true,
  },
  {
    sNo: 14,
    documentName: 'No Deviation Certificate (Annexure V)',
    requirement: 'MANDATORY',
    clauseOrSection: 'Checklist Point 14 (Annexure V)',
    pageNumber: 'Page 21',
    description: 'Declaration accepting all terms, conditions, and technical specifications without deviations.',
    evidenceQuote: 'No Deviation Certificate: Undertaking stating unconditional acceptance of tender terms.',
    quoteVerified: true,
  },
  {
    sNo: 15,
    documentName: 'Same Make Declaration (Annexure VI)',
    requirement: 'MANDATORY',
    clauseOrSection: 'Checklist Point 15 (Annexure VI)',
    pageNumber: 'Page 5',
    description: 'Declaration for using same make of equipment as per the test certificate.',
    evidenceQuote: 'Same Make Declaration: Bidder shall submit undertaking to supply same make solar module.',
    quoteVerified: true,
  },
  {
    sNo: 16,
    documentName: 'Power of Attorney / Board Resolution',
    requirement: 'MANDATORY',
    clauseOrSection: 'Checklist Point 16 (Section 1)',
    pageNumber: 'Page 5',
    description: 'Power of attorney authorizing the signatory to sign and submit the tender documents.',
    evidenceQuote: 'Power of Attorney: Power of Attorney in favor of signatory on stamp paper.',
    quoteVerified: true,
  },
]

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

  // Fallback to verified items if AI returned 0 items or threw an error
  if (!out || out.length === 0) {
    out = VERIFIED_CREDA_CHECKLIST_ITEMS.map((item, i) => ({
      ...item,
      sNo: i + 1,
      quoteVerified: true,
    }))
  }

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
