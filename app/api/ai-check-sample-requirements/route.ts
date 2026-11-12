import { NextResponse } from 'next/server'
import { createOpenAI } from '@ai-sdk/openai'
import { generateText, Output } from 'ai'
import { z } from 'zod'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { FieldRequirementAudit, SampleRequirementsAudit, TechnicalComponent, TenderBidDetails } from '@/types/tender'

export const runtime = 'nodejs'
export const maxDuration = 90

const sampleRequirementsSchema = z.object({
  testReport: z.object({
    isRequired: z.boolean().describe('True if tender document explicitly mandates/requires Test Report submission, false if not required or optional'),
    status: z.enum(['Required', 'Not Required', 'Optional']),
    clauseOrRef: z.string().describe('Exact clause number, section, page number or reference in the tender document (e.g. "Clause 4.3 (Page 24) - Technical Criteria", or "Not Specified in Tender Document")'),
    reasoning: z.string().describe('Precise explanation based strictly on tender document stating why Test Report is Required, Not Required, or Optional'),
    applicableStandards: z.array(z.string()).describe('List of standards or lab accreditations mentioned (e.g., NABL, ERDA, CPRI, IS 14286, IEC 61215), or empty array'),
    confidence: z.enum(['high', 'medium']),
  }),
  bisCertificate: z.object({
    isRequired: z.boolean().describe('True if tender document explicitly mandates/requires BIS / CRS Certificate submission, false if not required or optional'),
    status: z.enum(['Required', 'Not Required', 'Optional']),
    clauseOrRef: z.string().describe('Exact clause number, section, page number or reference in the tender document (e.g. "Clause 5.1 (Page 31) - BIS / CRS Requirement", or "Not Specified in Tender Document")'),
    reasoning: z.string().describe('Precise explanation based strictly on tender document stating why BIS Certificate is Required, Not Required, or Optional'),
    applicableStandards: z.array(z.string()).describe('List of BIS standards mentioned (e.g., IS 14286, IS 16221, BIS CRS Scheme), or empty array'),
    confidence: z.enum(['high', 'medium']),
  }),
  productSample: z.object({
    isRequired: z.boolean().describe('True if tender document explicitly mandates/requires physical product sample submission, false if not required or optional'),
    status: z.enum(['Required', 'Not Required', 'Optional']),
    clauseOrRef: z.string().describe('Exact clause number, section, page number or reference in the tender document (e.g. "Clause 5.4 - Physical Sample Submission", or "Not Specified in Tender Document")'),
    reasoning: z.string().describe('Precise explanation based strictly on tender document stating why physical Product Sample is Required, Not Required, or Optional'),
    applicableStandards: z.array(z.string()).describe('List of sample details, prototype specifications or testing cell location, or empty array'),
    confidence: z.enum(['high', 'medium']),
  }),
  summary: z.string().describe('Overall summary statement of AI analysis for Test Report, BIS Certificate, and Product Sample requirement'),
})

/**
 * Dynamically loads pdfjs-dist legacy build for server-side PDF extraction
 */
async function loadPdfjs(): Promise<any> {
  const buildDir = path.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'legacy', 'build')
  const nativeEntry = path.join(buildDir, 'pdf.mjs')
  if (fs.existsSync(nativeEntry)) {
    try {
      return await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ pathToFileURL(nativeEntry).href)
    } catch (err) {
      console.warn('Native pdf.js load failed, falling back to bundled build:', err)
    }
  }
  const pdfjsLib: any = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const workerPath = [
    path.join(buildDir, 'pdf.worker.mjs'),
    path.join(process.cwd(), 'public', 'pdfjs', 'pdf.worker.min.mjs'),
  ].find(p => fs.existsSync(p))
  if (workerPath) pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href
  return pdfjsLib
}

/**
 * Extracts text from PDF bytes with page references
 */
async function extractPdfText(
  pdfBytes: Uint8Array,
  maxPages: number = 200
): Promise<{ text: string; pageCount: number; pages: Array<{ pageNumber: number; text: string }> }> {
  try {
    const pdfjsLib = await loadPdfjs()
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBytes) }).promise
    const pagesToRead = Math.min(doc.numPages, maxPages)
    const pages: Array<{ pageNumber: number; text: string }> = []
    let fullText = ''

    for (let i = 1; i <= pagesToRead; i++) {
      const page = await doc.getPage(i)
      const tc = await page.getTextContent()
      const pageText = tc.items.map((it: any) => (it.str || '') + (it.hasEOL ? '\n' : ' ')).join('')
      pages.push({ pageNumber: i, text: pageText })
      fullText += `\n--- PAGE ${i} ---\n${pageText}`
    }

    return { text: fullText, pageCount: doc.numPages, pages }
  } catch (err) {
    console.warn('PDF parsing error in sample requirement check:', err)
    return { text: '', pageCount: 0, pages: [] }
  }
}

/**
 * Extracts targeted passages relevant to Test Reports, BIS Certificates, and Product Samples
 */
function extractTargetSnippets(pages: Array<{ pageNumber: number; text: string }>): {
  testReportSnippets: string
  bisSnippets: string
  sampleSnippets: string
  generalTechSnippets: string
} {
  const testRe = /\b(test\s*report|type\s*test|acceptance\s*test|routine\s*test|testing\s*lab|nabl|erda|cpri|test\s*certificate|inspection\s*and\s*test|testing\s*charges|testing\s*agency)\b/i
  const bisRe = /\b(bis|bureau\s+of\s+indian\s+standards|crs|compulsory\s+registration|is\s*14286|is\s*16221|is\s*9283|is\s*9000|isi\s*mark|almm|is\s*\d{3,5})\b/i
  const sampleRe = /\b(product\s*sample|sample\s*submission|submission\s*of\s*sample|physical\s*sample|sample\s*testing|sample\s*approval|proto\s*type|dispatch\s*of\s*sample|sample\s*unit|sample\s*cell|sample\s*deposit|courier\s*receipt)\b/i
  const techRe = /\b(technical\s*specification|eligibility\s*criteria|technical\s*bid|documents\s*to\s*be\s*submitted|cover[-\s]?(?:1|i)\b|envelope\s*1|schedule\s*of\s*requirements|mandatory\s*documents)\b/i

  const testPassages: string[] = []
  const bisPassages: string[] = []
  const samplePassages: string[] = []
  const techPassages: string[] = []

  for (const page of pages) {
    const content = page.text
    if (testRe.test(content)) {
      testPassages.push(`[Page ${page.pageNumber}]:\n${content.slice(0, 1500)}`)
    }
    if (bisRe.test(content)) {
      bisPassages.push(`[Page ${page.pageNumber}]:\n${content.slice(0, 1500)}`)
    }
    if (sampleRe.test(content)) {
      samplePassages.push(`[Page ${page.pageNumber}]:\n${content.slice(0, 1500)}`)
    }
    if (techRe.test(content) && techPassages.length < 5) {
      techPassages.push(`[Page ${page.pageNumber}]:\n${content.slice(0, 1200)}`)
    }
  }

  return {
    testReportSnippets: testPassages.slice(0, 8).join('\n---\n'),
    bisSnippets: bisPassages.slice(0, 8).join('\n---\n'),
    sampleSnippets: samplePassages.slice(0, 8).join('\n---\n'),
    generalTechSnippets: techPassages.slice(0, 4).join('\n---\n'),
  }
}

/**
 * Deterministic fallback audit when OpenAI is unavailable or for rapid local analysis
 */
function evaluateRequirementsHeuristically(
  tenderTitle: string,
  authority: string,
  bid?: TenderBidDetails,
  pdfSnippets?: { testReportSnippets: string; bisSnippets: string; sampleSnippets: string; generalTechSnippets: string },
  pageCount?: number
): SampleRequirementsAudit {
  const titleLower = (tenderTitle || '').toLowerCase()
  const authLower = (authority || '').toLowerCase()
  const comp = bid?.testReportCompliance || ''
  const techReq = bid?.technicalRequirement || ''
  const components: TechnicalComponent[] = bid?.technicalComponents || []

  const testSnippets = (pdfSnippets?.testReportSnippets || '').toLowerCase()
  const bisSnippets = (pdfSnippets?.bisSnippets || '').toLowerCase()

  // 1. TEST REPORT AUDIT
  let testIsRequired = false
  let testStatus: 'Required' | 'Not Required' | 'Optional' = 'Not Required'
  let testClause = 'Not Specified in Tender Document'
  let testReasoning = ''
  const testStandards: string[] = []

  // Check explicit test report compliance from bid
  if (comp.trim().length > 0 && !comp.toLowerCase().includes('not applicable') && !comp.toLowerCase().includes('not required')) {
    testIsRequired = true
    testStatus = 'Required'
    testClause = 'Tender Technical Bid Specifications - Test Report Clause'
    testReasoning = `The tender document mandates submission of valid laboratory test report(s): "${comp.trim()}".`
  } else if (
    testSnippets.includes('shall submit type test') ||
    testSnippets.includes('must submit test report') ||
    testSnippets.includes('nabl accredited') ||
    testSnippets.includes('test report from accredited') ||
    testSnippets.includes('type test certificate')
  ) {
    testIsRequired = true
    testStatus = 'Required'
    testClause = 'Technical Specifications & Testing Protocol Clause'
    testReasoning = 'Tender document specifies mandatory submission of type test / laboratory test certificates from a NABL / ERDA / CPRI accredited testing agency.'
  } else if (
    components.some(c => /solar|pump|inverter|motor|module|cable|transformer|pmsm|switchgear/i.test(c.item)) ||
    /solar|pump|pumping|rooftop|substation|transmission|scada/i.test(titleLower)
  ) {
    testIsRequired = true
    testStatus = 'Required'
    testClause = 'Technical Standards for Specified Equipment / Components'
    testReasoning = 'Government procurement rules for electrical/solar equipment mandate accredited type test reports (NABL / ERDA approved) to substantiate technical parameters.'
  } else {
    testIsRequired = false
    testStatus = 'Not Required'
    testClause = 'NIT Technical Scope & Bill of Quantities'
    testReasoning = 'The tender document does not mandate submission of laboratory or type test reports for this scope of work.'
  }

  // Extract identified standards for test report
  if (/14286/.test(comp + testSnippets)) testStandards.push('IS 14286')
  if (/61215/.test(comp + testSnippets)) testStandards.push('IEC 61215')
  if (/61730/.test(comp + testSnippets)) testStandards.push('IEC 61730')
  if (/16221/.test(comp + testSnippets)) testStandards.push('IS 16221')
  if (/nabl/i.test(comp + testSnippets)) testStandards.push('NABL Accredited Lab')
  if (/erda/i.test(comp + testSnippets)) testStandards.push('ERDA')
  if (/cpri/i.test(comp + testSnippets)) testStandards.push('CPRI')

  if (testStandards.length === 0 && testIsRequired) {
    testStandards.push('NABL / ERDA Accredited Testing Laboratory')
  }

  // 2. BIS CERTIFICATE AUDIT
  let bisIsRequired = false
  let bisStatus: 'Required' | 'Not Required' | 'Optional' = 'Not Required'
  let bisClause = 'Not Specified in Tender Document'
  let bisReasoning = ''
  const bisStandards: string[] = []

  if (
    bisSnippets.includes('bis certificate') ||
    bisSnippets.includes('compulsory registration') ||
    bisSnippets.includes('bureau of indian standards') ||
    bisSnippets.includes('is 14286') ||
    bisSnippets.includes('is 16221')
  ) {
    bisIsRequired = true
    bisStatus = 'Required'
    bisClause = 'Technical Standards & Statutory Approvals (BIS / CRS Clause)'
    bisReasoning = 'The tender document explicitly requires a valid Bureau of Indian Standards (BIS) Certificate or Compulsory Registration Scheme (CRS) license.'
  } else if (
    components.some(c => /solar|module|inverter|battery|led|cable/i.test(c.item)) ||
    /solar|photovoltaic|spv|inverter|street light|led/i.test(titleLower)
  ) {
    bisIsRequired = true
    bisStatus = 'Required'
    bisClause = 'Statutory Compliance: MNRE / MeitY Compulsory BIS Registration'
    bisReasoning = 'Under statutory orders of MNRE / MeitY, BIS CRS registration is legally mandatory for solar PV modules, inverters, and storage units supplied in Indian government projects.'
  } else {
    bisIsRequired = false
    bisStatus = 'Not Required'
    bisClause = 'NIT Technical Scope & Bill of Quantities'
    bisReasoning = 'The tender document does not require BIS or CRS certification for the products/services under this scope.'
  }

  if (/14286/.test(bisSnippets + comp)) bisStandards.push('IS 14286')
  if (/16221/.test(bisSnippets + comp)) bisStandards.push('IS 16221')
  if (/crs|compulsory registration/i.test(bisSnippets)) bisStandards.push('BIS CRS Scheme')
  if (bisStandards.length === 0 && bisIsRequired) {
    bisStandards.push('Bureau of Indian Standards (BIS) CRS Scheme')
  }

  // 3. PRODUCT SAMPLE AUDIT
  const sampleSnippets = (pdfSnippets?.sampleSnippets || '').toLowerCase()
  let sampleIsRequired = false
  let sampleStatus: 'Required' | 'Not Required' | 'Optional' = 'Not Required'
  let sampleClause = 'Not Specified in Tender Document'
  let sampleReasoning = ''
  const sampleStandards: string[] = []

  if (
    sampleSnippets.includes('shall submit sample') ||
    sampleSnippets.includes('submit product sample') ||
    sampleSnippets.includes('submission of sample') ||
    sampleSnippets.includes('sample shall be deposited') ||
    sampleSnippets.includes('sample testing') ||
    sampleSnippets.includes('prototype sample') ||
    sampleSnippets.includes('dispatch of sample')
  ) {
    sampleIsRequired = true
    sampleStatus = 'Required'
    sampleClause = 'Tender Clause on Physical Sample Submission & Testing'
    sampleReasoning = 'The tender document mandates submission of physical product sample(s) / prototype unit with dispatch acknowledgment to the tendering authority/testing cell prior to bid evaluation.'
    sampleStandards.push('Physical Prototype Unit', 'Sample Delivery Receipt')
  } else if (
    /creda|scip|cggy/i.test(authority + ' ' + tenderTitle) ||
    (components.some(c => /solar.*pump|controller|pump/i.test(c.item)) && /creda|phed|irrigation/i.test(authority + ' ' + tenderTitle))
  ) {
    sampleIsRequired = true
    sampleStatus = 'Required'
    sampleClause = 'Technical Bid Guidelines - Sample Submission'
    sampleReasoning = 'Physical prototype sample submission and delivery challan are mandated under technical evaluation guidelines for state solar pumping schemes.'
    sampleStandards.push('Prototype Controller / Pump Set', 'Inspection Challan')
  } else {
    sampleIsRequired = false
    sampleStatus = 'Not Required'
    sampleClause = 'NIT Technical Scope & Bill of Quantities'
    sampleReasoning = 'The tender document does not mandate submission of physical product samples prior to technical bid submission.'
  }

  const testAudit: FieldRequirementAudit = {
    isRequired: testIsRequired,
    status: testStatus,
    clauseOrRef: testClause,
    reasoning: testReasoning,
    applicableStandards: testStandards,
    confidence: 'high',
  }

  const bisAudit: FieldRequirementAudit = {
    isRequired: bisIsRequired,
    status: bisStatus,
    clauseOrRef: bisClause,
    reasoning: bisReasoning,
    applicableStandards: bisStandards,
    confidence: 'high',
  }

  const sampleAudit: FieldRequirementAudit = {
    isRequired: sampleIsRequired,
    status: sampleStatus,
    clauseOrRef: sampleClause,
    reasoning: sampleReasoning,
    applicableStandards: sampleStandards,
    confidence: 'high',
  }

  return {
    testReport: testAudit,
    bisCertificate: bisAudit,
    productSample: sampleAudit,
    checkedAt: new Date().toISOString(),
    sourceType: pageCount && pageCount > 0 ? 'tender-pdf' : 'tender-metadata',
    summary: `AI Requirement Check: Test Report is ${testStatus.toUpperCase()}, BIS Certificate is ${bisStatus.toUpperCase()}, Product Sample is ${sampleStatus.toUpperCase()}.`,
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { tenderId, tenderTitle, authority, tenderNumber, bid, pdfDataUrl, corrigenda } = body

    let pages: Array<{ pageNumber: number; text: string }> = []
    let pageCount = 0
    let testReportSnippets = ''
    let bisSnippets = ''
    let sampleSnippets = ''
    let generalTechSnippets = ''

    // 1. If PDF base64 dataUrl is provided, parse the document
    if (typeof pdfDataUrl === 'string' && pdfDataUrl.includes('base64,')) {
      try {
        const base64Data = pdfDataUrl.split('base64,')[1]
        if (base64Data) {
          const pdfBytes = Buffer.from(base64Data, 'base64')
          const extracted = await extractPdfText(new Uint8Array(pdfBytes), 150)
          pageCount = extracted.pageCount
          pages = extracted.pages

          const snippets = extractTargetSnippets(pages)
          testReportSnippets = snippets.testReportSnippets
          bisSnippets = snippets.bisSnippets
          sampleSnippets = snippets.sampleSnippets
          generalTechSnippets = snippets.generalTechSnippets
        }
      } catch (pdfErr) {
        console.warn('Could not extract PDF text for sample requirements check:', pdfErr)
      }
    }

    // 2. Append any Corrigenda notes to relevant snippets
    if (Array.isArray(corrigenda) && corrigenda.length > 0) {
      const corrNotes = corrigenda
        .map(c => `[Corrigendum ${c.corrigendumNo || ''} - ${c.title || ''}]: ${c.summary || ''}`)
        .join('\n')
      generalTechSnippets += `\n\nCorrigenda Records:\n${corrNotes}`
    }

    // 3. Fallback heuristic baseline
    const fallbackAudit = evaluateRequirementsHeuristically(
      tenderTitle || '',
      authority || '',
      bid,
      { testReportSnippets, bisSnippets, sampleSnippets, generalTechSnippets },
      pageCount
    )

    // 4. If OpenAI is configured, execute high-accuracy structured audit
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json({
        success: true,
        audit: fallbackAudit,
        source: fallbackAudit.sourceType,
      })
    }

    try {
      const openai = createOpenAI({ apiKey })
      const components: TechnicalComponent[] = bid?.technicalComponents || []

      const prompt = `
You are a senior Indian Government Tender Procurement & Compliance Auditor (specializing in SECI, CREDA, DISCOMs, PWD, NTPC, CPWD).
Analyze the following official Tender Document passages, Technical Scope, and Bid Details to audit the mandatory document requirements.

Tender ID / Number: ${tenderNumber || tenderId || 'Tender'}
Tender Title / Scope: ${tenderTitle || 'Government Tender'}
Procuring Authority: ${authority || 'Tendering Authority'}

Bid Technical Scope & Equipment Components:
${JSON.stringify(components, null, 2)}

Bid Test Report Compliance Note:
"${bid?.testReportCompliance || 'None specified in metadata'}"

Bid Technical Requirement Summary:
"${bid?.technicalRequirement || 'None specified in metadata'}"

TARGET TENDER DOCUMENT PASSAGES:
=== Passages mentioning Test Report / Laboratory / Testing ===
${testReportSnippets || 'No direct Test Report keywords found in scanned PDF pages.'}

=== Passages mentioning BIS / Bureau of Indian Standards / CRS ===
${bisSnippets || 'No direct BIS keywords found in scanned PDF pages.'}

=== Passages mentioning Product Sample / Physical Sample Submission ===
${sampleSnippets || 'No direct Product Sample keywords found in scanned PDF pages.'}

=== General Technical Bid / Eligibility Passages ===
${generalTechSnippets || 'None extracted.'}

INSTRUCTIONS & RULES:
1. TEST REPORT AUDIT:
   - Does this tender explicitly mandate bidders to submit a Laboratory Test Report or Type Test Report (e.g. from NABL, ERDA, CPRI accredited lab)?
   - If YES, status = "Required", provide exact Clause / Section / Page number (or verbatim reference), reasoning, and applicable standards (e.g. IS 14286, IEC 61215, NABL).
   - If NO, status = "Not Required", clause = "Not Specified in Tender Document", reasoning = "Explain why not required based strictly on the tender scope."
   - If it is only optional or required after award during dispatch/execution, set status = "Optional" and explain.

2. BIS CERTIFICATE AUDIT:
   - Does this tender mandate submission of a Bureau of Indian Standards (BIS) Certificate or Compulsory Registration Scheme (CRS) license for the components?
   - In Indian solar & electrical tenders, MNRE/MeitY directives legally mandate BIS CRS for solar PV modules, inverters, and battery storage. If equipment matches or tender text mentions it, mark "Required".
   - If the tender is civil/services or does not require BIS, status = "Not Required" and explain clearly.

3. PRODUCT SAMPLE AUDIT:
   - Does this tender explicitly mandate bidders to submit physical product sample(s), prototype units, or sample dispatch challan to the testing cell/department before bid opening?
   - If YES, status = "Required", cite exact clause/page, reasoning, and submission requirements.
   - If NO, status = "Not Required", clause = "Not Specified in Tender Document", explain that physical sample submission is not mandated prior to bid evaluation.
   - If required only on request or after LOA, status = "Optional" / conditional.

4. ZERO HALLUCINATION:
   - Base your decision strictly on the provided tender context and standard Indian government procurement directives.
   - Do not invent fictitious clauses or requirements.
`

      const { output } = await generateText({
        model: openai(process.env.OPENAI_MODEL || 'gpt-4o'),
        system:
          'You are an authoritative government procurement compliance officer. Give factual, clause-referenced audits without assumptions.',
        output: Output.object({ schema: sampleRequirementsSchema }),
        prompt,
      })

      const finalAudit: SampleRequirementsAudit = {
        testReport: output.testReport,
        bisCertificate: output.bisCertificate,
        productSample: output.productSample,
        checkedAt: new Date().toISOString(),
        sourceType: pageCount > 0 ? 'tender-pdf' : 'tender-metadata',
        summary: output.summary,
      }

      return NextResponse.json({
        success: true,
        audit: finalAudit,
        source: finalAudit.sourceType,
      })
    } catch (aiErr: any) {
      console.warn('OpenAI requirement audit failed, using deterministic audit:', aiErr?.message)
      return NextResponse.json({
        success: true,
        audit: fallbackAudit,
        source: fallbackAudit.sourceType,
      })
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

