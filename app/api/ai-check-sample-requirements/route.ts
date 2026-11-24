import { NextResponse } from 'next/server'
import { createOpenAI } from '@ai-sdk/openai'
import { generateText, Output } from 'ai'
import { z } from 'zod'
import { loadTenderEvidence, hybridRetrieve } from '@/lib/tender-evidence'
import { quoteOnPage } from '@/lib/document-verifier'
import { UsageTracker } from '@/lib/ai-usage'
import { DocumentPageChunk } from '@/types/document-understanding'
import {
  FieldRequirementAudit,
  MasterRequirementStatus,
  RequirementVerificationStatus,
  SampleRequirementsAudit,
  TechnicalComponent,
  TenderBidDetails,
} from '@/types/tender'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * Master System Prompt Document Item Schema
 * Conforms to Section 10 of the Master System Prompt
 */
const masterRequirementItemSchema = z.object({
  isRequired: z
    .boolean()
    .describe('True if tender document explicitly mandates/requires submission, false if not required or optional'),
  status: z
    .enum(['MANDATORY', 'OPTIONAL', 'NOT REQUIRED', 'CONDITIONAL', 'UNCLEAR', 'MANUAL VERIFICATION REQUIRED', 'DOCUMENT INCOMPLETE'])
    .describe(
      'Strict status: MANDATORY (explicitly required), OPTIONAL (optional), NOT REQUIRED (no requirement found), CONDITIONAL (applies under specific condition), MANUAL VERIFICATION REQUIRED (unclear/ambiguous/requires manual check), DOCUMENT INCOMPLETE'
    ),
  documentName: z.string().describe('Source tender document name or title'),
  questionOrRequirement: z.string().describe('Exact question or requirement being evaluated'),
  finalAnswer: z.string().describe('Direct, clear, concise factual answer strictly grounded in document'),
  originalDocumentEvidence: z
    .string()
    .describe(
      'Exact verbatim extract or quotation from the document. If missing, return exactly "NOT AVAILABLE IN THE PROVIDED DOCUMENT."'
    ),
  pageNumber: z
    .string()
    .describe('Physical PDF page number where evidence is found (e.g. "Page 14" or "Pages 14, 22"), or "Not Available"'),
  clauseOrSection: z
    .string()
    .describe('Exact clause number and section heading, or "Not Specified in Tender Document"'),
  detailedExplanation: z
    .string()
    .describe('Detailed explanation based exclusively on the original document text, without external assumptions'),
  missingInformation: z
    .string()
    .describe('Details of any missing information, unreadable pages, or "None" if complete'),
  verificationStatus: z
    .enum(['VERIFIED_FROM_DOCUMENT', 'NOT_AVAILABLE', 'UNABLE_TO_VERIFY', 'PARTIALLY_VERIFIED'])
    .describe('Verification status against uploaded document'),
  finalRecommendation: z
    .string()
    .describe('Actionable recommendation for bidder based strictly on tender clause'),
  applicableStandards: z
    .array(z.string())
    .describe('List of standards, accreditations or equipment models explicitly cited in document'),
  confidence: z.enum(['high', 'medium', 'low']),
  bulletPoints: z.array(z.string()).describe('Clear bullet points breaking down each key condition or requirement rule for bidder'),
  importantNotes: z.array(z.string()).describe('Critical compliance warnings or consequences for non-submission'),
  corrigendumNote: z.string().nullable().describe('Corrigendum/amendment changes modifying schedule, dates, locations, or requirements'),
  requiredDocumentSummary: z.string().nullable().describe('Concise description of required document or physical item to submit'),
})

const otherDocumentItemSchema = z.object({
  sNo: z.number().describe('Serial number (1, 2, 3...)'),
  documentName: z.string().describe('Name of document required (e.g. PAN Card, GST Registration, Bidder Undertaking, Non-Blacklisting Self Declaration, etc.)'),
  requirement: z.string().describe('Requirement condition: Mandatory, Required, Dealer/Distributor ke liye, Manufacturer ke liye, or specific condition'),
  clauseOrSection: z.string().nullable().describe('Clause or section reference if found in checklist/NIT'),
  pageNumber: z.string().nullable().describe('Page number where requested'),
  description: z.string().nullable().describe('Short note or description of requirement'),
  evidenceQuote: z.string().describe('Verbatim text copied from the tender page that demands this document'),
})

const masterRequirementsAuditSchema = z.object({
  mafLetter: masterRequirementItemSchema,
  testReport: masterRequirementItemSchema,
  bisCertificate: masterRequirementItemSchema,
  productSample: masterRequirementItemSchema,
  otherDocuments: z.array(otherDocumentItemSchema).describe('List of other mandatory/required documents demanded in tender checklist, cover 1, eligibility criteria, or Section 1'),
  summary: z.string().describe('Executive summary of the document requirement audits'),
})

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { tenderId, tenderTitle, authority, tenderNumber, bid, pdfDataUrl, corrigenda, customDocumentName } = body

    const usage = new UsageTracker()
    let mafSnippets = ''
    let testReportSnippets = ''
    let bisSnippets = ''
    let sampleSnippets = ''
    let generalTechSnippets = ''

    const DEFAULT_PDF = 'Image_Module_Tender_11f1aec243f3da04a696b42e99c9ac7b.pdf'
    const tenderDocSrc =
      pdfDataUrl ||
      (customDocumentName ? `/docs/${customDocumentName}` : undefined) ||
      `/docs/${DEFAULT_PDF}`
    const tenderDocName = customDocumentName || DEFAULT_PDF

    // 1. This tender's OWN document + its corrigenda, from the shared page index
    //    (pdf.js text, OCR eng+hin, OpenAI Vision). No other tender's file is ever used.
    const tenderLike = {
      id: tenderId,
      tenderDoc: { name: tenderDocName, dataUrl: tenderDocSrc },
      corrigenda: Array.isArray(corrigenda) ? corrigenda : [],
    }
    const evidenceWarnings: string[] = []
    const evidence = tenderId
      ? await loadTenderEvidence(tenderLike, { usage, timeBudgetMs: 150000 })
      : { docs: [], chunks: [] as DocumentPageChunk[], warnings: ['No tender id supplied.'], incomplete: false, statusText: 'No tender id.' }
    evidenceWarnings.push(...evidence.warnings)
    if (evidence.incomplete) {
      return NextResponse.json(
        { success: false, pending: true, error: `The tender document is still being read (${evidence.statusText}). Please retry in a moment.` },
        { status: 409 }
      )
    }
    const evidenceChunks = evidence.chunks
    const readableChunks = evidenceChunks.filter(c => !c.content.startsWith('[EXTRACTION FAILED'))
    const tenderDocs = evidence.docs.filter(d => d.role === 'tender')
    const pageCount = tenderDocs.reduce((n, d) => n + (d.pageCount || 0), 0)
    const totalExtractedChars = readableChunks.reduce((n, c) => n + c.content.replace(/\s+/g, '').length, 0)
    const docDisplayName = tenderDocs[0]?.docName || customDocumentName || tenderTitle || 'Tender document'

    const block = (chunks: DocumentPageChunk[]) =>
      chunks
        .map(c => `=== [DOCUMENT: "${c.docName}" | PAGE: ${c.pageNumber}${c.extractionMethod && c.extractionMethod !== 'text' ? ` | read by: ${c.extractionMethod}` : ''}] ===\n${c.content}`)
        .join('\n\n')
    const facet = async (query: string, maxTokens = 7000) =>
      evidenceChunks.length
        ? block(
            (await hybridRetrieve({ tenderId: String(tenderId), docs: evidence.docs, chunks: evidenceChunks, query, maxTokens, usage, warnings: evidenceWarnings }))
              .retrievedChunks
          )
        : ''
    mafSnippets = await facet('manufacturer authorization form MAF OEM authorisation letter dealer distributor')
    testReportSnippets = await facet('test report laboratory NABL type test certificate testing accredited')
    bisSnippets = await facet('BIS certificate bureau of indian standards CRS registration ISI licence')
    sampleSnippets = await facet('sample submission inspection of samples physical sample prototype')
    generalTechSnippets = await facet('documents to be submitted checklist envelope technical bid mandatory documents annexure', 9000)

    // Direct clause fallback: ensure snippets are never empty when evidence chunks exist
    if (evidenceChunks.length > 0) {
      const testRe = /\b(test\s*report|type\s*test|acceptance\s*test|routine\s*test|testing\s*lab|nabl|erda|cpri|test\s*certificate|inspection\s*and\s*test|testing\s*charges|testing\s*agency)\b/i
      const bisRe = /\b(bis|bureau\s+of\s+indian\s+standards|crs|compulsory\s+registration|is\s*14286|is\s*16221|is\s*9283|is\s*9000|isi\s*mark|almm|is\s*\d{3,5})\b/i
      const sampleRe = /\b(product\s*sample|sample\s*submission|submission\s*of\s*sample|physical\s*sample|sample\s*testing|sample\s*approval|proto\s*type|dispatch\s*of\s*sample|sample\s*unit|sample\s*cell|sample\s*deposit|courier\s*receipt)\b/i
      const mafRe = /\b(maf|manufacturer\s*authori[zs]ation|oem\s*authori[zs]ation|authori[zs]ation\s*letter|annexure\s*[a-z0-9]+)\b/i

      const directTest = evidenceChunks.filter(c => testRe.test(c.content)).map(c => `=== [DOCUMENT: "${c.docName}" | PAGE: ${c.pageNumber}] ===\n${c.content.slice(0, 2000)}`).slice(0, 10).join('\n\n')
      const directBis = evidenceChunks.filter(c => bisRe.test(c.content)).map(c => `=== [DOCUMENT: "${c.docName}" | PAGE: ${c.pageNumber}] ===\n${c.content.slice(0, 2000)}`).slice(0, 10).join('\n\n')
      const directSample = evidenceChunks.filter(c => sampleRe.test(c.content)).map(c => `=== [DOCUMENT: "${c.docName}" | PAGE: ${c.pageNumber}] ===\n${c.content.slice(0, 2000)}`).slice(0, 10).join('\n\n')
      const directMaf = evidenceChunks.filter(c => mafRe.test(c.content)).map(c => `=== [DOCUMENT: "${c.docName}" | PAGE: ${c.pageNumber}] ===\n${c.content.slice(0, 2000)}`).slice(0, 10).join('\n\n')

      if (!testReportSnippets || testReportSnippets.length < 100) testReportSnippets = directTest
      else if (directTest) testReportSnippets += `\n\n${directTest}`

      if (!bisSnippets || bisSnippets.length < 100) bisSnippets = directBis
      else if (directBis) bisSnippets += `\n\n${directBis}`

      if (!sampleSnippets || sampleSnippets.length < 100) sampleSnippets = directSample
      else if (directSample) sampleSnippets += `\n\n${directSample}`

      if (!mafSnippets || mafSnippets.length < 100) mafSnippets = directMaf
      else if (directMaf) mafSnippets += `\n\n${directMaf}`
    }

    // 3. Verification for Scanned / Incomplete / Unreadable Documents
    const isDocumentIncompleteOrScanned = pageCount > 0 && totalExtractedChars < 50
    if (isDocumentIncompleteOrScanned) {
      const buildIncompleteAuditItem = (reqTitle: string, question: string): FieldRequirementAudit => ({
        isRequired: false,
        status: 'MANUAL VERIFICATION REQUIRED',
        masterStatus: 'MANUAL VERIFICATION REQUIRED',
        documentName: docDisplayName,
        questionOrRequirement: question,
        finalAnswer: 'MANUAL VERIFICATION REQUIRED: The uploaded PDF is a scanned image document without selectable text layer.',
        originalDocumentEvidence: 'UNABLE TO VERIFY FROM THE PROVIDED DOCUMENT.',
        pageNumber: `Pages 1 to ${pageCount}`,
        clauseOrSection: 'Not Readable (Scanned Image PDF)',
        detailedExplanation: `The source document "${docDisplayName}" has ${pageCount} pages, but contains no embedded text layer. Relevant tender clauses and specifications require manual inspection.`,
        missingInformation: `Text layer missing. All ${pageCount} pages appear to be scanned image bitmaps without OCR text.`,
        verificationStatus: 'UNABLE_TO_VERIFY',
        finalRecommendation: 'Inspect physical tender documents or high-resolution page scans for manual verification.',
        clauseOrRef: 'Document Incomplete / Scanned',
        reasoning: 'Scanned image PDF without selectable text.',
        applicableStandards: [],
        confidence: 'low',
      })

      const incompleteAudit: SampleRequirementsAudit = {
        mafLetter: buildIncompleteAuditItem('MAF Letter', 'Is Manufacturer Authorization Form (MAF) mandatory?'),
        testReport: buildIncompleteAuditItem('Test Report', 'Is Laboratory Test Report mandatory?'),
        bisCertificate: buildIncompleteAuditItem('BIS Certificate', 'Is BIS / CRS Certificate mandatory?'),
        productSample: buildIncompleteAuditItem('Product Sample', 'Is Physical Product Sample submission mandatory?'),
        otherDocuments: [],
        checkedAt: new Date().toISOString(),
        sourceType: 'tender-pdf',
        summary: `MANUAL VERIFICATION REQUIRED: "${docDisplayName}" contains ${pageCount} scanned pages. Physical document verification required.`,
        documentName: docDisplayName,
        totalPagesAnalyzed: pageCount,
        issuingAuthority: authority,
        tenderNumber: tenderNumber || tenderId,
        verificationQuality: 'UNABLE_TO_VERIFY',
      }

      return NextResponse.json({
        success: true,
        audit: incompleteAudit,
        source: incompleteAudit.sourceType,
      })
    }

    // 4. When the AI audit cannot run, return an explicit UNABLE_TO_VERIFY audit.
    //    (The former keyword "heuristic" filled in clauses, pages and quotes from a
    //    different CREDA tender whenever a keyword matched – fabricated evidence.)
    const unverifiedItem = (question: string, reason: string): FieldRequirementAudit => ({
      isRequired: false,
      status: 'MANUAL VERIFICATION REQUIRED',
      masterStatus: 'MANUAL VERIFICATION REQUIRED',
      documentName: docDisplayName,
      questionOrRequirement: question,
      finalAnswer: `MANUAL VERIFICATION REQUIRED: ${reason}`,
      originalDocumentEvidence: 'UNABLE TO VERIFY FROM THE PROVIDED DOCUMENT.',
      pageNumber: 'N/A',
      clauseOrSection: 'Not verified',
      verificationStatus: 'UNABLE_TO_VERIFY',
      finalRecommendation: 'Check this requirement in the original tender document.',
      clauseOrRef: 'Not verified',
      reasoning: reason,
      applicableStandards: [],
      confidence: 'low',
    })
    const buildUnverifiedAudit = (reason: string): SampleRequirementsAudit => ({
      mafLetter: unverifiedItem('Is Manufacturer Authorization Form (MAF) mandatory?', reason),
      testReport: unverifiedItem('Is Laboratory Test Report mandatory?', reason),
      bisCertificate: unverifiedItem('Is BIS / CRS Certificate mandatory?', reason),
      productSample: unverifiedItem('Is Physical Product Sample submission mandatory?', reason),
      otherDocuments: [],
      checkedAt: new Date().toISOString(),
      sourceType: pageCount > 0 ? 'tender-pdf' : 'tender-metadata',
      summary: `MANUAL VERIFICATION REQUIRED: ${reason}`,
      documentName: docDisplayName,
      totalPagesAnalyzed: pageCount,
      issuingAuthority: authority,
      tenderNumber: tenderNumber || tenderId,
      verificationQuality: 'UNABLE_TO_VERIFY',
    })

    if (pageCount === 0) {
      const audit = buildUnverifiedAudit('The tender document for this tender could not be loaded, so no requirement can be verified.')
      return NextResponse.json({ success: true, audit, source: audit.sourceType })
    }

    // 5. If OpenAI is configured, execute high-accuracy structured audit with Master System Prompt
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      const audit = buildUnverifiedAudit('AI service is not configured (OPENAI_API_KEY missing).')
      return NextResponse.json({ success: true, audit, source: audit.sourceType })
    }

    try {
      const openai = createOpenAI({ apiKey })
      const components: TechnicalComponent[] = bid?.technicalComponents || []

      const masterSystemPrompt = `
# MASTER SYSTEM PROMPT: ADVANCED PDF READING, UNDERSTANDING & EVIDENCE-BASED ANSWERING ENGINE

## 1. YOUR ROLE
You are an Advanced AI Document Intelligence and PDF Analysis Engine.
Your primary responsibility is to read, understand, analyze, interpret, and answer questions based exclusively on the original documents uploaded by the user.
You must behave like a professional document analyst who carefully reads every relevant page before answering.
Your goal is not to generate answers quickly. Your goal is to generate accurate, complete, evidence-supported answers.
ACCURACY IS MORE IMPORTANT THAN SPEED OR ANSWER COMPLETENESS.

## 2. ORIGINAL UPLOADED DOCUMENT IS THE ONLY SOURCE OF TRUTH
You must follow these rules strictly:
1. Use the uploaded PDF and other explicitly provided source documents as the primary source of truth.
2. Never assume information that is not present in the uploaded documents.
3. Never use your general knowledge to invent document-specific facts.
4. Never add information simply because it is commonly used in the relevant industry.
5. Never modify the meaning of the original document.
6. Never replace missing information with estimated or assumed information.
7. If the document does not contain the requested information, clearly state that it is not found.
8. If multiple documents are provided, analyze their contents separately and identify any contradictions.

## 3. COMPLETE PDF READING PROCESS
- Preserve row and column relationships in tables.
- Check cross-references and annexures.
- Compare extracted facts with original text.
- Never claim that complete PDF was analyzed if pages could not be processed.

## 4. STRICT ANTI-HALLUCINATION RULES
You must NEVER:
- Invent facts, figures, dates, names, or reference numbers.
- Generate imaginary clauses or page numbers.
- Assume that a document is mandatory without evidence.
- Assume that a document is not required without sufficient document coverage.
- Generate fake certificates or approvals.
- Generate imaginary laboratory test results.
- Generate PASS or FAIL results without an actual test report.
- Invent BIS license numbers or validity status.
- Invent NABL accreditation.
- Invent ALMM approval.
- Invent product sample submission status.
- Invent dispatch dates, courier receipts, or inspection acknowledgements.
- Present AI-generated content as an officially issued document.

If information is unavailable, return:
"NOT AVAILABLE IN THE PROVIDED DOCUMENT."

If the information cannot be reliably verified, return:
"UNABLE TO VERIFY FROM THE PROVIDED DOCUMENT."

## 5. TENDER DOCUMENT ANALYSIS RULES
For each document requirement, assign one of the following statuses:
- MANDATORY: The tender explicitly requires the document.
- NOT REQUIRED: The relevant complete tender sections have been checked and no applicable submission requirement exists.
- CONDITIONAL: The document is required only when a specific condition applies.
- UNCLEAR: The available evidence is insufficient to determine the requirement.
- DOCUMENT INCOMPLETE: Relevant pages, annexures, or referenced documents are missing or unreadable.

Important distinctions:
- Technical standard mentioned DOES NOT automatically mean a separate certificate must be submitted.
- Product compliance DOES NOT automatically mean a test report must be uploaded.
- General regulatory requirements MUST NOT automatically be classified as tender-specific submission requirements.
- A recommendation is not the same as a mandatory requirement.
- A condition applicable only to selected bidders must not be classified as universally mandatory.

## 6. EXACT EVIDENCE AND SOURCE REFERENCES
Every important conclusion must be supported by original document evidence:
- Original statement or exact relevant extract (verbatim quotation)
- Physical PDF page number (e.g. "Page 14" or "Pages 14, 22")
- Clause number and Section name
- Source document name
`

      const userPrompt = `
DOCUMENT METADATA:
Document Name: ${docDisplayName}
Total Pages Analyzed: ${pageCount > 0 ? pageCount : 'Metadata Only (No PDF attached)'}
Tender Reference / ID: ${tenderNumber || tenderId || 'Tender'}
Procuring Authority: ${authority || 'Tendering Authority'}

Bid Technical Scope & Equipment Components:
${JSON.stringify(components, null, 2)}

Bid Test Report Compliance Note from User / Portal:
"${bid?.testReportCompliance || 'None specified in metadata'}"

Bid Technical Requirement Summary:
"${bid?.technicalRequirement || 'None specified in metadata'}"

=== EXTRACTED ORIGINAL TENDER DOCUMENT PASSAGES ===
[Passages mentioning Manufacturer Authorization Form (MAF) / OEM Letter]:
${mafSnippets || 'No direct MAF / OEM authorization keywords found in extracted PDF pages.'}

[Passages mentioning Laboratory / Type Test Report / NABL / Testing]:
${testReportSnippets || 'No direct Test Report keywords found in extracted PDF pages.'}

[Passages mentioning BIS / Bureau of Indian Standards / CRS Scheme / ISI]:
${bisSnippets || 'No direct BIS keywords found in extracted PDF pages.'}

[Passages mentioning Product Sample / Physical Sample Submission / Prototype]:
${sampleSnippets || 'No direct Product Sample keywords found in extracted PDF pages.'}

[General Technical Bid / Mandatory Submission Passages]:
${generalTechSnippets || 'None extracted.'}

TASK:
Independently analyze the 4 document requirements:
1. MAF Letter (Manufacturer Authorization Form / OEM Letter for specified makes)
2. Test Report (Laboratory / Type Test Report from NABL / ERDA / CPRI accredited laboratory)
3. BIS Certificate (Bureau of Indian Standards / CRS Scheme / Compulsory Registration)
4. Product Sample (Physical prototype unit submission / sample testing / testing cell receipt)

Follow all rules of the MASTER SYSTEM PROMPT. Ground every field strictly in the extracted passages. If not in the document, return "NOT AVAILABLE IN THE PROVIDED DOCUMENT." Never invent clauses or page numbers.
`

      const model = process.env.OPENAI_MODEL || 'gpt-4o'
      const { output, usage: genUsage } = await generateText({
        model: openai(model),
        system: masterSystemPrompt,
        output: Output.object({ schema: masterRequirementsAuditSchema }),
        prompt: userPrompt,
      })

      usage.add('extract', model, genUsage as any)

      // Deterministic check: is the quoted evidence really on the cited page?
      const quoteVerified = (quote: string | undefined, pageRef: string | undefined): boolean => {
        const q = (quote || '').trim()
        if (!q || /NOT AVAILABLE|UNABLE TO VERIFY/i.test(q)) return false
        const pagesCited = String(pageRef || '').match(/\d+/g)?.map(Number) || []
        const pool = pagesCited.length ? readableChunks.filter(c => pagesCited.includes(c.pageNumber || -1)) : []
        return pool.some(c => quoteOnPage(q, c.content))
      }

      // Normalize output into FieldRequirementAudit with backwards compatibility
      const formatFieldAudit = (rawItem: any): FieldRequirementAudit => {
        const item = { ...rawItem }
        const hasEvidence = item.originalDocumentEvidence && !/NOT AVAILABLE|UNABLE TO VERIFY/i.test(item.originalDocumentEvidence)
        if (hasEvidence && !quoteVerified(item.originalDocumentEvidence, item.pageNumber)) {
          item.verificationStatus = 'UNABLE_TO_VERIFY'
          item.confidence = 'low'
          item.missingInformation = `${item.missingInformation && item.missingInformation !== 'None' ? `${item.missingInformation} ` : ''}[System: the quoted evidence was not found on the cited page (${item.pageNumber}). Verify manually.]`
          if (item.status === 'MANDATORY' || item.status === 'NOT REQUIRED') item.status = 'MANUAL VERIFICATION REQUIRED'
        }
        if (item.verificationStatus === 'VERIFIED_FROM_DOCUMENT' && !hasEvidence) item.verificationStatus = 'UNABLE_TO_VERIFY'
        const isReq = item.status === 'MANDATORY' || item.status === 'CONDITIONAL'
        // Map master status to legacy status ('Required' | 'Not Required' | 'Optional')
        const legacyStatus: 'Required' | 'Not Required' | 'Optional' =
          item.status === 'MANDATORY'
            ? 'Required'
            : item.status === 'NOT REQUIRED'
            ? 'Not Required'
            : 'Optional'

        return {
          isRequired: isReq,
          status: legacyStatus,
          masterStatus: item.status as MasterRequirementStatus,
          documentName: item.documentName || docDisplayName,
          questionOrRequirement: item.questionOrRequirement,
          finalAnswer: item.finalAnswer,
          originalDocumentEvidence: item.originalDocumentEvidence,
          pageNumber: item.pageNumber,
          clauseOrSection: item.clauseOrSection,
          detailedExplanation: item.detailedExplanation,
          missingInformation: item.missingInformation,
          verificationStatus: item.verificationStatus,
          finalRecommendation: item.finalRecommendation,
          applicableStandards: item.applicableStandards || [],
          confidence: item.confidence || 'high',
          clauseOrRef: item.clauseOrSection || 'Not Specified',
          reasoning: item.detailedExplanation || item.finalAnswer,
          bulletPoints: item.bulletPoints && item.bulletPoints.length > 0 ? item.bulletPoints : undefined,
          importantNotes: item.importantNotes && item.importantNotes.length > 0 ? item.importantNotes : undefined,
          corrigendumNote: item.corrigendumNote || undefined,
          requiredDocumentSummary: item.requiredDocumentSummary || undefined,
        }
      }

      const finalAudit: SampleRequirementsAudit = {
        mafLetter: formatFieldAudit(output.mafLetter),
        testReport: formatFieldAudit(output.testReport),
        bisCertificate: formatFieldAudit(output.bisCertificate),
        productSample: formatFieldAudit(output.productSample),
        otherDocuments: (output.otherDocuments || []).map((d: any) => ({
          ...d,
          clauseOrSection: d.clauseOrSection ?? undefined,
          pageNumber: d.pageNumber ?? undefined,
          description: d.description ?? undefined,
          quoteVerified: quoteVerified(d.evidenceQuote, d.pageNumber),
        })),
        checkedAt: new Date().toISOString(),
        sourceType: pageCount > 0 ? 'tender-pdf' : 'tender-metadata',
        summary: output.summary,
        documentName: docDisplayName,
        totalPagesAnalyzed: pageCount,
        issuingAuthority: authority,
        tenderNumber: tenderNumber || tenderId,
        verificationQuality: pageCount > 0 ? 'HIGH_CONFIDENCE_GROUNDED' : 'HEURISTIC_FALLBACK',
        evidenceStatus: evidence.statusText,
        evidenceWarnings,
      }
      console.info('[ai-check-sample-requirements] usage', JSON.stringify(usage.toJSON()))

      return NextResponse.json({
        success: true,
        audit: finalAudit,
        source: finalAudit.sourceType,
        usage: usage.toJSON(),
      })
    } catch (aiErr: any) {
      console.error('OpenAI requirement audit failed:', aiErr?.message)
      const audit = buildUnverifiedAudit(`The AI audit failed (${aiErr?.message || 'error'}). Please retry.`)
      return NextResponse.json({ success: true, audit, source: audit.sourceType })
    }
  } catch (err: any) {
    console.error('Fatal error in ai-check-sample-requirements API:', err)
    return NextResponse.json(
      {
        success: false,
        error: err?.message || 'Failed to check sample requirements with AI',
      },
      { status: 500 }
    )
  }
}
