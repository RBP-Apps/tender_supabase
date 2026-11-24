import { NextResponse } from 'next/server'
import { createOpenAI } from '@ai-sdk/openai'
import { generateObject } from 'ai'
import { z } from 'zod'
import { DocumentPageChunk } from '@/types/document-understanding'
import { loadTenderEvidence, hybridRetrieve, mapSectionChunks, documentClauseExtracts, DOC_CLAUSE_RULES, findDocumentDemand } from '@/lib/tender-evidence'
import { ensureDocumentIndexed, pagesToChunks } from '@/lib/document-index-store'
import { retrieveContextForQuery } from '@/lib/document-retrieval-engine'
import { normQuote, quoteOnPage } from '@/lib/document-verifier'
import { UsageTracker } from '@/lib/ai-usage'

export const runtime = 'nodejs'
export const maxDuration = 300

const statusEnum = z.enum(['Pass', 'Fail', 'Pending', 'Under Review'])
const situationEnum = z.enum([
  'requirement-not-in-tender',
  'document-not-uploaded',
  'document-unreadable',
  'requirement-not-satisfied',
  'requirement-satisfied',
  'needs-manual-review',
])

const criteriaDetailSchema = z.object({
  criteriaName: z.string().describe('Criteria name, e.g. "Annual Financial Turnover", "Past Technical Experience", "Statutory & Tax Registrations"'),
  status: statusEnum,
  tenderRequirement: z.string().describe('The requirement exactly as written in the tender, or "Not specified in the tender document"'),
  tenderSourceDocument: z.string().describe('Document name from the "DOCUMENT" header where the requirement appears, or ""'),
  tenderSourcePage: z.string().describe('Physical PDF page number from the "PAGE: X" header where the requirement appears, or "N/A"'),
  tenderSourceQuote: z.string().describe('Verbatim quote of the tender clause copied character-for-character, or "" if not in the tender'),
  userSubmitted: z.string().describe('What the bidder document actually shows (value + document name + page), or "Not uploaded" / "Unreadable"'),
  bidderSourceQuote: z.string().describe('Verbatim text from the bidder document that shows the submitted value, or ""'),
  comparisonResult: z.string().describe('Requirement vs submitted comparison with numbers, e.g. "Submitted ₹5.20 Cr ≥ required ₹4.50 Cr"'),
  evidenceSituation: situationEnum,
  rejectionReason: z.string().nullable().describe('Specific rejection reason if status is Fail, else null'),
  isMandatory: z.boolean().describe('True if this is a mandatory pre-qualification gate per the tender'),
})

const checkSchema = z.object({
  status: statusEnum,
  required: z.string(),
  submitted: z.string(),
  notes: z.string(),
  shortfallOrSurplus: z.string().nullable(),
})

const eligibilitySchema = z.object({
  status: z.enum(['Eligible', 'Not Eligible', 'Partially Eligible', 'Insufficient Information']),
  summary: z.string().describe('Concise high-level summary of the eligibility outcome'),
  overallReasoning: z.string().describe('3-5 sentences of reasoning based only on the evidence'),
  conclusion: z.string().describe('Final verdict and why'),
  matchedCriteria: z.array(z.string()),
  failedCriteria: z.array(z.string()),
  missingRequirements: z.array(z.string()),
  insufficientInfoNotes: z.string().nullable(),
  criteriaBreakdown: z.array(criteriaDetailSchema).describe('One row for EVERY individual eligibility requirement found in the tender'),
  turnoverCheck: checkSchema,
  experienceCheck: checkSchema,
  documentsCheck: z.object({
    status: statusEnum,
    notes: z.string(),
    missingDocs: z.array(z.string()),
  }),
})

type Eligibility = z.infer<typeof eligibilitySchema>
type Row = Eligibility['criteriaBreakdown'][number]

const SLOTS = [
  { key: 'turnoverDoc', label: 'Turnover Document', query: 'turnover revenue financial year audited balance sheet CA certificate UDIN net worth' },
  { key: 'experienceDoc', label: 'Experience Document', query: 'work order completion certificate commissioning capacity value similar work experience' },
  { key: 'vendorRegDoc', label: 'Vendor Registration', query: 'registration certificate GST PAN vendor enlistment validity' },
  { key: 'otherDoc', label: 'Other Document', query: 'certificate registration undertaking affidavit' },
] as const

const TENDER_ELIGIBILITY_QUERIES = [
  'eligibility criteria qualification requirements bidder must',
  'average annual turnover financial capacity net worth crore lakh financial year',
  'technical experience similar work completed commissioned capacity work order',
  'documents required to be submitted registration certificate GST PAN',
  'pre-qualification criteria qualifying requirements',
  'पात्रता मापदंड टर्नओवर अनुभव',
]

const MAX_DOC_TEXT_CHARS = 10000

function pagesText(chunks: DocumentPageChunk[]): string {
  return chunks
    .map(
      c =>
        `=== [DOCUMENT: "${c.docName}" | PAGE: ${c.pageNumber}${c.totalPages ? ` of ${c.totalPages}` : ''}${
          c.extractionMethod && c.extractionMethod !== 'text' ? ` | read by: ${c.extractionMethod}` : ''
        }] ===\n${c.content}`
    )
    .join('\n\n')
}

/**
 * Result when the AI evaluation cannot run. It never passes a criterion:
 * an attached file is not proof that a requirement is met.
 */
function manualReviewResult(reason: string, submittedAudit: Array<{ slot: string; name?: string; situation: string }>): Eligibility {
  const rows: Row[] = submittedAudit.map(s => ({
    criteriaName: s.slot,
    status: s.situation === 'Not uploaded' ? 'Pending' : 'Under Review',
    tenderRequirement: 'Not evaluated – AI evaluation unavailable',
    tenderSourceDocument: '',
    tenderSourcePage: 'N/A',
    tenderSourceQuote: '',
    userSubmitted: s.name ? `${s.name} (${s.situation})` : s.situation,
    bidderSourceQuote: '',
    comparisonResult: 'Not compared – manual verification required.',
    evidenceSituation: s.situation === 'Not uploaded' ? 'document-not-uploaded' : 'needs-manual-review',
    rejectionReason: null,
    isMandatory: false,
  }))
  const check = { status: 'Under Review' as const, required: 'Not evaluated', submitted: 'Not evaluated', notes: reason, shortfallOrSurplus: null }
  return {
    status: 'Insufficient Information',
    summary: `AI eligibility evaluation could not be completed: ${reason} No criterion has been marked as passed.`,
    overallReasoning: 'The tender requirements and bidder documents were not compared, so no eligibility conclusion can be drawn.',
    conclusion: 'MANUAL VERIFICATION REQUIRED.',
    matchedCriteria: [],
    failedCriteria: [],
    missingRequirements: submittedAudit.filter(s => s.situation === 'Not uploaded').map(s => s.slot),
    insufficientInfoNotes: reason,
    criteriaBreakdown: rows,
    turnoverCheck: check,
    experienceCheck: check,
    documentsCheck: { status: 'Under Review', notes: reason, missingDocs: [] },
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { tender, submittedData } = body

    if (!tender) {
      return NextResponse.json({ error: 'Tender object is required.' }, { status: 400 })
    }

    const apiKey = process.env.OPENAI_API_KEY
    const usage = new UsageTracker()
    const warnings: string[] = []

    // ── 1. TENDER evidence: this tender's own document + corrigenda (text / OCR / Vision) ─
    const evidence = await loadTenderEvidence(tender, { usage, timeBudgetMs: 150000 })
    warnings.push(...evidence.warnings)
    if (evidence.incomplete) {
      return NextResponse.json(
        {
          error: `The tender document is still being read (${evidence.statusText}). Please run the verification again in a moment.`,
          pending: true,
          usage: usage.toJSON(),
        },
        { status: 409 }
      )
    }
    const tenderChunks = evidence.chunks
    const tenderDocStatus = evidence.statusText
    const readableTender = tenderChunks.filter(c => !c.content.startsWith('[EXTRACTION FAILED'))
    const tenderTextAvailable = readableTender.reduce((n, c) => n + c.charCount, 0) > 200

    // Union of hybrid retrievals for each eligibility facet, in page order
    let tenderClausesContext = ''
    if (tenderChunks.length) {
      const picked = new Map<string, DocumentPageChunk>()
      const results = await Promise.all(
        TENDER_ELIGIBILITY_QUERIES.map(q =>
          hybridRetrieve({ tenderId: String(tender.id), docs: evidence.docs, chunks: tenderChunks, query: q, maxTokens: 8000, usage, warnings })
        )
      )
      for (const r of results) {
        for (const c of r.retrievedChunks) picked.set(c.id, c)
      }
      // Tender map: the pages the whole-tender pass assigned to eligibility / documents checklist
      for (const c of mapSectionChunks(tenderChunks, ['eligibility', 'checklist'], evidence.docs, 6)) picked.set(c.id, c)
      if (picked.size < 5 && tenderChunks.length > 0) {
        const fallbackPages = tenderChunks
          .filter(c => /turnover|experience|eligibility|annual|crore|bidder/i.test(c.content) || (c.pageNumber && c.pageNumber <= 15))
          .slice(0, 15)
        for (const c of fallbackPages) {
          if (!picked.has(c.id)) {
            picked.set(c.id, c)
          }
        }
      }

      const ordered = Array.from(picked.values()).sort((a, b) =>
        a.docName === b.docName ? (a.pageNumber || 0) - (b.pageNumber || 0) : a.docName.localeCompare(b.docName)
      )
      let budget = 25000
      const kept: DocumentPageChunk[] = []
      for (const c of ordered) {
        if (budget - c.charCount < 0) {
          warnings.push('Some matching tender pages were left out of the AI prompt (size limit).')
          break
        }
        kept.push(c)
        budget -= c.charCount
      }
      tenderClausesContext = pagesText(kept)
      const clauseExtracts = documentClauseExtracts(tenderChunks, evidence.docs)
      if (clauseExtracts) tenderClausesContext += `

[DOCUMENT CLAUSES – where the tender asks the bidder for a named document; each is a separate criterion]
${clauseExtracts}`
    }

    // ── 2. BIDDER documents (indexed under this tender, role "bidder": OCR + Vision for scans) ──
    const submittedAudit: Array<{ slot: string; name?: string; situation: string; pagesRead?: number }> = []
    const bidderTextBlocks: string[] = []
    const bidderChunks: DocumentPageChunk[] = []

    const slotDocs: Array<{ label: string; query: string; doc: any }> = SLOTS.map(s => ({
      label: s.label,
      query: s.query,
      doc: submittedData?.[s.key],
    }))
    if (Array.isArray(submittedData?.otherDocs)) {
      const seen = new Set(slotDocs.map(s => s.doc?.dataUrl).filter(Boolean))
      submittedData.otherDocs
        .filter((d: any) => d && !seen.has(d.dataUrl))
        .forEach((d: any, i: number) =>
          slotDocs.push({ label: d.referenceNote ? `Other: ${d.referenceNote}` : `Other Document ${i + 2}`, query: 'certificate registration', doc: d })
        )
    }

    // Process all bidder documents in parallel for high performance
    const processedSlots = await Promise.all(
      slotDocs.map(async slot => {
        const doc = slot.doc
        if (!doc) {
          return {
            audit: { slot: slot.label, situation: 'Not uploaded' },
            textBlock: `--- ${slot.label}: NOT UPLOADED ---`,
            chunks: [] as DocumentPageChunk[],
          }
        }
        const name: string = doc.name || slot.label
        if (!doc.dataUrl) {
          return {
            audit: { slot: slot.label, name, situation: 'Uploaded but could not be read (file content not stored)' },
            textBlock: `--- ${slot.label}: "${name}" UPLOADED BUT UNREADABLE (file content not stored) ---`,
            chunks: [] as DocumentPageChunk[],
          }
        }
        try {
          const indexed = await ensureDocumentIndexed({
            tenderId: String(tender.id),
            role: 'bidder',
            docName: name,
            source: doc.dataUrl,
            mimeType: doc.type,
            usage,
            timeBudgetMs: 60000,
          })
          if (indexed.status === 'failed' && !indexed.pages.length) {
            return {
              audit: { slot: slot.label, name, situation: `Uploaded but could not be read (${indexed.error})` },
              textBlock: `--- ${slot.label}: "${name}" UPLOADED BUT UNREADABLE (${indexed.error}) ---`,
              chunks: [] as DocumentPageChunk[],
            }
          }
          const chunks = pagesToChunks(indexed, indexed.pages)
          const readable = chunks.filter(c => !c.content.startsWith('[EXTRACTION FAILED'))
          if (!readable.length) {
            return {
              audit: {
                slot: slot.label,
                name,
                situation: `Uploaded but unreadable – no text result (${indexed.pageCount} page(s))`,
                pagesRead: indexed.pageCount,
              },
              textBlock: `--- ${slot.label}: "${name}" UPLOADED BUT UNREADABLE ---`,
              chunks: [] as DocumentPageChunk[],
            }
          }
          let text = pagesText(readable)
          if (text.length > MAX_DOC_TEXT_CHARS) {
            const r = retrieveContextForQuery(slot.query, readable, MAX_DOC_TEXT_CHARS / 4)
            text = pagesText(r.retrievedChunks)
          }
          return {
            audit: { slot: slot.label, name, situation: `Read (${indexed.pageCount} page(s))`, pagesRead: indexed.pageCount },
            textBlock: `--- ${slot.label}: "${name}" (${indexed.pageCount} page(s)) ---\n${text}`,
            chunks,
          }
        } catch (docErr: any) {
          return {
            audit: { slot: slot.label, name, situation: `Read error (${docErr?.message || 'failed'})` },
            textBlock: `--- ${slot.label}: "${name}" UNREADABLE ---`,
            chunks: [] as DocumentPageChunk[],
          }
        }
      })
    )

    for (const p of processedSlots) {
      submittedAudit.push(p.audit)
      bidderTextBlocks.push(p.textBlock)
      bidderChunks.push(...p.chunks)
    }

    // ── 3. OpenAI evaluation, strictly grounded in the evidence above ───────────────────
    const storedReqs = `
TENDER FMS RECORD (auto-filled earlier; may be wrong – use only to cross-check, the tender text below is authoritative):
- Tender ID: ${tender.id} | Title: "${tender.title}" | Authority: ${tender.authority || 'N/A'}
- Stored Turnover Requirement: ${tender.bid?.turnoverRequirement || tender.turnoverRequirement || 'Not recorded'}
- Stored Experience Requirement: ${tender.bid?.experienceRequirement || tender.experienceRequirement || 'Not recorded'}
- Stored Technical Requirement: ${tender.bid?.technicalRequirement || 'Not recorded'}`

    const systemPrompt = `You are the "Tender Eligibility Evaluator". You compare a tender's eligibility requirements with the bidder's submitted documents.

ABSOLUTE RULES:
1. Tender requirements come ONLY from "TENDER DOCUMENT – ELIGIBILITY PASSAGES". Copy each requirement verbatim into tenderRequirement and tenderSourceQuote, and give the DOCUMENT name and PAGE number from the "=== [DOCUMENT … | PAGE: X" header. If a requirement is not in those passages, use evidenceSituation "requirement-not-in-tender", tenderSourceQuote "" and never invent a threshold (no assumed turnover, years, capacity, GST or certificate requirements).
2. Bidder facts come ONLY from "BIDDER DOCUMENTS" text. File names and user remarks are NOT evidence of values. Copy the bidder text that shows each value into bidderSourceQuote.
3. Keep these situations separate (evidenceSituation):
   - requirement-not-in-tender: the tender does not state this requirement
   - document-not-uploaded: no document was uploaded for it
   - document-unreadable: a document was uploaded but could not be read
   - requirement-not-satisfied: document read and value is below / does not meet the requirement
   - requirement-satisfied: document read and value meets the requirement (show the numbers)
   - needs-manual-review: anything ambiguous, low-quality scan, conflicting, or a value read only by Vision without OCR confirmation
4. Status "Pass" only for requirement-satisfied. "Fail" only for requirement-not-satisfied or document-not-uploaded for a mandatory requirement. Otherwise "Pending" or "Under Review".
5. Overall status:
   - "Eligible": every mandatory requirement found in the tender is requirement-satisfied.
   - "Not Eligible": at least one mandatory requirement is requirement-not-satisfied (proven shortfall).
   - "Partially Eligible": some mandatory requirements satisfied, others missing documents.
   - "Insufficient Information": the tender requirements could not be read, or key bidder documents are unreadable / ambiguous.
6. If two tender clauses give different values (e.g. original vs corrigendum), report both with pages and do not choose one unless the tender states precedence.
7. A requirement spread over several pages (e.g. a table continued on the next page) must include rows from ALL those pages.
8. DOCUMENT CLAUSES ARE SEPARATE CRITERIA. Whenever the passages say the bidder must submit / attach / upload a document (e.g. BIS licence, test reports, MAF / manufacturer authorisation, registration, GST/PAN, affidavit, undertaking, ISO, experience or financial certificates), create ONE criteria row per such document (criteriaName = the document, tenderSourceQuote = the clause line, isMandatory = true when the tender says must/shall/mandatory/compulsory). Do not merge them into the turnover or experience rows and do not skip them. If ONE clause asks for several documents (e.g. "test reports and valid BIS licence") make a SEPARATE row for each document, with the same clause as its quote. Read the "[DOCUMENT CLAUSES …]" extracts line by line: every extract that demands a bidder document (BIS licence, MAF / manufacturer authorisation, test report, GST/PAN, affidavit …) must appear as its own row, and none may be left out. Judge each against the bidder documents (requirement-satisfied only with a verified bidder quote; document-not-uploaded if no matching bidder document).`

    const userText = `TENDER DOCUMENT STATUS: ${tenderDocStatus}

TENDER DOCUMENT – ELIGIBILITY PASSAGES (authoritative):
${tenderClausesContext || '(No tender text available – requirements cannot be verified from the document.)'}
${storedReqs}

BIDDER DOCUMENTS:
${bidderTextBlocks.join('\n\n')}

USER REMARKS (context only, not evidence): "${submittedData?.remarks || 'None'}"

Produce the structured eligibility evaluation. List EVERY individual eligibility requirement found in the tender passages in criteriaBreakdown.`

    let ai: Eligibility
    let aiFailed = false
    if (!apiKey) {
      ai = manualReviewResult('AI service is not configured (OPENAI_API_KEY missing).', submittedAudit)
      aiFailed = true
    } else {
      try {
        const openai = createOpenAI({ apiKey })
        const model = process.env.OPENAI_MODEL || 'gpt-4o'
        const result = await generateObject({
          model: openai(model),
          schema: eligibilitySchema,
          system: systemPrompt,
          prompt: userText,
          temperature: 0,
        })
        usage.add('chat', model, result.usage as any)
        ai = result.object
      } catch (aiErr: any) {
        console.warn('Eligibility AI call failed, using verified criteria audit:', aiErr?.message || aiErr)
        // No stand-in data: a hard-coded result from another tender must never be shown as this tender's.
        ai = manualReviewResult(`The AI evaluation failed (${String(aiErr?.message || aiErr).slice(0, 160)}). Please retry.`, submittedAudit)
        aiFailed = true
      }
    }
    if (aiFailed) warnings.push('AI evaluation did not run – result is "Insufficient Information" and every criterion needs manual verification.')

    // ── 4. Deterministic verification of every quote against the original pages ─────────
    const allTenderNorm = normQuote(readableTender.map(c => c.content).join('\n'))
    const bidderNorm = normQuote(bidderChunks.map(c => c.content).join('\n'))
    const tenderQuoteOnCitedPage = (row: Row): boolean => {
      const q = row.tenderSourceQuote?.trim()
      if (!q || !tenderTextAvailable) return false
      const pageNums = String(row.tenderSourcePage || '').match(/\d+/g)?.map(Number) || []
      return readableTender.some(
        c =>
          pageNums.includes(c.pageNumber || -1) &&
          (!row.tenderSourceDocument || c.docName === row.tenderSourceDocument) &&
          quoteOnPage(q, c.content)
      )
    }

    const breakdown = (ai.criteriaBreakdown || []).map(row => {
      const quoteOk = tenderQuoteOnCitedPage(row)
      const bq = row.bidderSourceQuote?.trim() || ''
      const bidderOk = !!bq && (bidderChunks.some(c => quoteOnPage(bq, c.content)) || bidderNorm.includes(normQuote(bq)))
      const r: any = { ...row, tenderQuoteVerified: quoteOk, bidderQuoteVerified: bidderOk }
      const notes: string[] = []
      if (row.tenderSourceQuote?.trim() && !quoteOk) {
        notes.push(
          allTenderNorm.includes(normQuote(row.tenderSourceQuote))
            ? `the tender quote exists but not on the cited page ${row.tenderSourcePage}`
            : 'the quoted tender clause was not found in the extracted tender text'
        )
      }
      if (row.status === 'Pass' && !row.tenderSourceQuote?.trim()) notes.push('no tender clause was quoted')
      if (row.status === 'Pass' && !bq) notes.push('no bidder evidence quote was given')
      if (bq && !bidderOk) notes.push('the bidder evidence quote was not found in the bidder documents')
      const decisive = row.status === 'Pass' || (row.status === 'Fail' && row.evidenceSituation === 'requirement-not-satisfied')
      if (decisive && notes.length > 0) {
        r.status = 'Under Review'
        r.evidenceSituation = 'needs-manual-review'
        r.comparisonResult = `${row.comparisonResult} [System: ${notes.join('; ')} – manual verification required.]`
      }
      return r
    })

    // Deterministic safety net: a document the tender demands (BIS, MAF, test reports) can never be
    // dropped by the model. If no row covers it, add one built from the tender page + bidder text.
    if (tenderTextAvailable) {
      for (const rule of DOC_CLAUSE_RULES) {
        const coveredRows = breakdown.filter((r: any) => rule.tender.test(`${r.criteriaName || ''} ${r.tenderRequirement || ''}`))
        if (coveredRows.length) {
          // The model said "not uploaded" although an uploaded file visibly contains this document -> correct it.
          const hit0 = bidderChunks.find(c => rule.bidder.test(c.content))
          for (const r of coveredRows as any[]) {
            if (!hit0 || r.evidenceSituation !== 'document-not-uploaded') continue
            const t0 = hit0.content.replace(/\s+/g, ' ')
            const at0 = t0.match(rule.bidder)?.index ?? 0
            const q0 = t0.slice(Math.max(0, at0 - 40), at0 + 160).trim()
            if (!bidderChunks.some(c => quoteOnPage(q0, c.content))) continue
            r.status = 'Pass'
            r.evidenceSituation = 'requirement-satisfied'
            r.userSubmitted = `${hit0.docName}, Page ${hit0.pageNumber}`
            r.bidderSourceQuote = q0
            r.bidderQuoteVerified = true
            r.rejectionReason = null
            r.comparisonResult = `${rule.name} found in the uploaded document (presence verified from its text; approval / validity still to be confirmed by a person).`
          }
          continue
        }
        const demand = findDocumentDemand(readableTender, evidence.docs, rule)
        if (!demand) continue
        const hit = bidderChunks.find(c => rule.bidder.test(c.content))
        let bidderQuote = ''
        if (hit) {
          const t = hit.content.replace(/\s+/g, ' ')
          const mm = t.match(rule.bidder)
          const at = mm?.index ?? 0
          bidderQuote = t.slice(Math.max(0, at - 40), at + 160).trim()
        }
        const bidderOk = !!bidderQuote && bidderChunks.some(c => quoteOnPage(bidderQuote, c.content))
        breakdown.push({
          criteriaName: rule.name,
          status: bidderOk ? 'Pass' : demand.mandatory ? 'Fail' : 'Pending',
          tenderRequirement: demand.quote,
          tenderSourceDocument: demand.docName,
          tenderSourcePage: String(demand.page),
          tenderSourceQuote: demand.quote,
          userSubmitted: bidderOk ? `${hit!.docName}, Page ${hit!.pageNumber}` : 'Not uploaded',
          bidderSourceQuote: bidderQuote,
          comparisonResult: bidderOk ? `${rule.name} found in the uploaded document.` : `No uploaded document contains a ${rule.name}.`,
          evidenceSituation: bidderOk ? 'requirement-satisfied' : 'document-not-uploaded',
          rejectionReason: bidderOk ? null : `${rule.name} demanded by the tender but not uploaded`,
          isMandatory: demand.mandatory,
          tenderQuoteVerified: true,
          bidderQuoteVerified: bidderOk,
        })
      }
    }

    const unverifiedQuotes = breakdown.filter((r: any) => r.tenderSourceQuote && !r.tenderQuoteVerified).length
    if (unverifiedQuotes > 0) {
      warnings.push(`${unverifiedQuotes} tender requirement quote(s) returned by the AI were not found on the cited tender page.`)
    }

    let status: Eligibility['status'] = ai.status
    const mandatory = breakdown.filter((r: any) => r.isMandatory)
    const mandatoryPass = mandatory.filter((r: any) => r.status === 'Pass').length
    const provenFail = mandatory.some((r: any) => r.status === 'Fail' && r.evidenceSituation === 'requirement-not-satisfied')

    if (!tenderTextAvailable) {
      status = 'Insufficient Information'
      warnings.push('The tender document text was not available, so requirements could not be verified against the tender.')
    } else if (status === 'Eligible' && (mandatory.length === 0 || mandatoryPass < mandatory.length)) {
      status = provenFail ? 'Not Eligible' : 'Insufficient Information'
    } else if (status === 'Not Eligible' && !provenFail) {
      status = mandatoryPass > 0 ? 'Partially Eligible' : 'Insufficient Information'
    }

    // Score is a computed ratio (mandatory criteria verified as passing), not a model guess.
    // If the model flagged none as mandatory, score over every requirement that the tender actually states.
    // every criterion the tender actually states counts (a verified non-mandatory document must not be ignored)
    const scored = breakdown.filter((r: any) => r.evidenceSituation !== 'requirement-not-in-tender')
    const scoredPass = scored.filter((r: any) => r.status === 'Pass').length
    const score = scored.length ? Math.round((scoredPass / scored.length) * 100) : 0
    const scoreDetail = `${scoredPass} of ${scored.length} tender requirement(s) verified as met`

    const finalSummary =
      status !== ai.status
        ? `${ai.summary} [System adjustment: result changed from "${ai.status}" to "${status}" because the evidence could not be fully verified against the original documents.]`
        : ai.summary
    console.info('[ai-verify-eligibility] usage', JSON.stringify(usage.toJSON()))

    return NextResponse.json({
      success: true,
      verification: {
        ...ai,
        status,
        score,
        scoreDetail,
        summary: finalSummary,
        criteriaBreakdown: breakdown,
        insufficientInfoNotes: [ai.insufficientInfoNotes, ...warnings].filter(Boolean).join(' ') || undefined,
        evidenceAudit: {
          tenderDocument: tenderDocStatus,
          submittedDocuments: submittedAudit,
          warnings,
        },
        aiEvaluationRan: !aiFailed,
        verifiedAt: new Date().toISOString(),
        tenderRequirements: {
          turnover: ai.turnoverCheck?.required,
          experience: ai.experienceCheck?.required,
        },
      },
      usage: usage.toJSON(),
    })
  } catch (err: any) {
    console.error('Error in ai-verify-eligibility route:', err)
    return NextResponse.json(
      { error: 'Failed to verify eligibility.', details: err?.message || 'Internal error' },
      { status: 500 }
    )
  }
}
