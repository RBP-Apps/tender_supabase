import { SampleDocumentItem, Tender, TechnicalComponent } from '@/types/tender'

export interface AutoFetchResult {
  mafLetter: SampleDocumentItem | null
  testReport: SampleDocumentItem | null
  bisCertificate: SampleDocumentItem | null
  productSample: SampleDocumentItem | null
  otherDocs: SampleDocumentItem[]
  candidates: {
    mafLetter: SampleDocumentItem[]
    testReport: SampleDocumentItem[]
    bisCertificate: SampleDocumentItem[]
    productSample: SampleDocumentItem[]
    otherDocs: SampleDocumentItem[]
  }
  matchReasons: {
    mafLetter?: string
    testReport?: string
    bisCertificate?: string
    productSample?: string
  }
  detectedContext: {
    makes: string[]
    standards: string[]
    items: string[]
  }
}

interface SourceFileEntry {
  id: string
  name: string
  size?: number
  type?: string
  dataUrl?: string
  origin: string
  uploadedAt: string
}

/**
 * Extracts all documents associated with the given tender across New Tender and Eligibility Check modules.
 * Strictly guarantees that ONLY documents belonging to this tender are collected.
 */
export function extractTenderSourceDocuments(tender: Tender): SourceFileEntry[] {
  const files: SourceFileEntry[] = []

  // 1. Documents from New Tender Creation (NIT / Tender Document)
  if (tender.tenderDoc) {
    files.push({
      id: tender.tenderDoc.id || `nit-${tender.id}`,
      name: tender.tenderDoc.name,
      size: tender.tenderDoc.size,
      type: tender.tenderDoc.type,
      dataUrl: tender.tenderDoc.dataUrl,
      origin: 'New Tender: Official NIT Document',
      uploadedAt: tender.tenderDoc.uploadedAt || tender.createdAt || new Date().toISOString(),
    })
  }

  // 2. Corrigenda Documents from New Tender
  if (tender.corrigenda && tender.corrigenda.length > 0) {
    tender.corrigenda.forEach((c, idx) => {
      if (c.fileName) {
        files.push({
          id: c.id || `corr-${tender.id}-${idx}`,
          name: c.fileName,
          type: 'application/pdf',
          origin: `New Tender: Corrigendum (${c.corrigendumNo || `No. ${idx + 1}`})`,
          uploadedAt: c.uploadedAt || new Date().toISOString(),
        })
      }
    })
  }

  // 3. Documents from Eligibility Check Stage
  const ec = tender.eligibilityCheck
  if (ec) {
    if (ec.vendorRegDoc?.name) {
      files.push({
        id: `elig-vendorReg-${tender.id}`,
        name: ec.vendorRegDoc.name,
        size: ec.vendorRegDoc.size,
        type: ec.vendorRegDoc.type,
        dataUrl: ec.vendorRegDoc.dataUrl,
        origin: 'Eligibility Check: Vendor / Dept Registration',
        uploadedAt: ec.vendorRegDoc.uploadedAt || ec.completedAt || new Date().toISOString(),
      })
    }
    if (ec.experienceDoc?.name) {
      files.push({
        id: `elig-experience-${tender.id}`,
        name: ec.experienceDoc.name,
        size: ec.experienceDoc.size,
        type: ec.experienceDoc.type,
        dataUrl: ec.experienceDoc.dataUrl,
        origin: 'Eligibility Check: Experience / Work Completion',
        uploadedAt: ec.experienceDoc.uploadedAt || ec.completedAt || new Date().toISOString(),
      })
    }
    if (ec.turnoverDoc?.name) {
      files.push({
        id: `elig-turnover-${tender.id}`,
        name: ec.turnoverDoc.name,
        size: ec.turnoverDoc.size,
        type: ec.turnoverDoc.type,
        dataUrl: ec.turnoverDoc.dataUrl,
        origin: 'Eligibility Check: Turnover Certificate',
        uploadedAt: ec.turnoverDoc.uploadedAt || ec.completedAt || new Date().toISOString(),
      })
    }
    if (ec.otherDoc?.name) {
      files.push({
        id: `elig-other-${tender.id}`,
        name: ec.otherDoc.name,
        size: ec.otherDoc.size,
        type: ec.otherDoc.type,
        dataUrl: ec.otherDoc.dataUrl,
        origin: 'Eligibility Check: Other Documents',
        uploadedAt: ec.otherDoc.uploadedAt || ec.completedAt || new Date().toISOString(),
      })
    }
  }

  return files
}

/**
 * Synchronous multi-parameter heuristic matcher.
 * Uses technical components, document names, origins, and standard patterns.
 * Strictly adheres to rule: Never populate a missing field with an unrelated document.
 */
export function autoFetchSampleDetails(tender: Tender): AutoFetchResult {
  const result: AutoFetchResult = {
    mafLetter: null,
    testReport: null,
    bisCertificate: null,
    productSample: null,
    otherDocs: [],
    candidates: {
      mafLetter: [],
      testReport: [],
      bisCertificate: [],
      productSample: [],
      otherDocs: [],
    },
    matchReasons: {},
    detectedContext: {
      makes: [],
      standards: [],
      items: [],
    },
  }

  // 1. Detect technical context from TenderBidDetails
  const components: TechnicalComponent[] = tender.bid?.technicalComponents || []
  const makes: string[] = []
  const standards: string[] = []
  const items: string[] = []

  components.forEach(c => {
    if (c.make && c.make.trim()) makes.push(c.make.trim())
    if (c.compliance && c.compliance.trim()) standards.push(c.compliance.trim())
    if (c.item && c.item.trim()) items.push(c.item.trim())
  })

  result.detectedContext = {
    makes: Array.from(new Set(makes)),
    standards: Array.from(new Set(standards)),
    items: Array.from(new Set(items)),
  }

  // 2. If Sample Details were already saved for this tender, prioritize those existing verified items
  if (tender.sampleDetails) {
    const sd = tender.sampleDetails
    if (sd.mafLetter) {
      result.mafLetter = sd.mafLetter
      result.candidates.mafLetter.push(sd.mafLetter)
      result.matchReasons.mafLetter = 'Previously saved in Sample Details'
    }
    if (sd.testReport) {
      result.testReport = sd.testReport
      result.candidates.testReport.push(sd.testReport)
      result.matchReasons.testReport = 'Previously saved in Sample Details'
    }
    if (sd.bisCertificate) {
      result.bisCertificate = sd.bisCertificate
      result.candidates.bisCertificate.push(sd.bisCertificate)
      result.matchReasons.bisCertificate = 'Previously saved in Sample Details'
    }
    if (sd.productSample) {
      result.productSample = sd.productSample
      result.candidates.productSample.push(sd.productSample)
      result.matchReasons.productSample = 'Previously saved in Sample Details'
    }
    if (sd.otherDocs?.length) {
      result.otherDocs = [...sd.otherDocs]
      result.candidates.otherDocs.push(...sd.otherDocs)
    }
  }

  // 3. Scan all source documents from New Tender & Eligibility Check
  const sourceDocs = extractTenderSourceDocuments(tender)
  const makesLower = result.detectedContext.makes.map(m => m.toLowerCase())
  const standardsLower = result.detectedContext.standards.map(s => s.toLowerCase())

  for (const doc of sourceDocs) {
    const nameLower = doc.name.toLowerCase()

    // Financial turnover certificates must NEVER match technical sample categories!
    if (
      nameLower.includes('turnover') ||
      nameLower.includes('balance_sheet') ||
      nameLower.includes('profit_loss') ||
      nameLower.includes('audited_ca') ||
      nameLower.includes('net_worth')
    ) {
      continue
    }

    // Helper to construct SampleDocumentItem
    const createItem = (
      reason: string,
      confidence: 'high' | 'medium'
    ): SampleDocumentItem => ({
      id: doc.id,
      name: doc.name,
      size: doc.size,
      type: doc.type,
      uploadedAt: doc.uploadedAt,
      dataUrl: doc.dataUrl,
      source: 'auto-fetched',
      referenceNote: `Linked from ${doc.origin}`,
      matchReason: reason,
      matchConfidence: confidence,
    })

    // Match 1: MAF Letter
    // Keywords: maf, authoriz, oem, manufacturer, dealership OR matches identified makes
    const hasMake = makesLower.some(m => nameLower.includes(m))
    const isMafKeyword =
      nameLower.includes('maf') ||
      nameLower.includes('authoriz') ||
      nameLower.includes('oem') ||
      nameLower.includes('manufacturer')
    
    if (isMafKeyword || (hasMake && (nameLower.includes('letter') || nameLower.includes('form')))) {
      const matchedMake = result.detectedContext.makes.find(m => nameLower.includes(m.toLowerCase()))
      const reason = matchedMake
        ? `Matched OEM Authorization for make: ${matchedMake} (${doc.origin})`
        : `Matched Manufacturer Authorization Form (${doc.origin})`
      
      const item = createItem(reason, matchedMake ? 'high' : 'medium')
      result.candidates.mafLetter.push(item)
      if (!result.mafLetter) {
        result.mafLetter = item
        result.matchReasons.mafLetter = reason
      }
      continue
    }

    // Match 2: Test Report
    // Keywords: test, lab, type_test, nabl, erda, cpri, testing, inspection, report
    const hasStandard = standardsLower.some(s => nameLower.includes(s))
    const isTestKeyword =
      nameLower.includes('test') ||
      nameLower.includes('lab') ||
      nameLower.includes('type_test') ||
      nameLower.includes('testing') ||
      nameLower.includes('nabl') ||
      nameLower.includes('erda') ||
      nameLower.includes('cpri') ||
      nameLower.includes('inspection_report')

    if (isTestKeyword || hasStandard) {
      const reason = hasStandard
        ? `Matched Type Test Report complying with standard: ${result.detectedContext.standards.find(s => nameLower.includes(s.toLowerCase()))} (${doc.origin})`
        : `Matched Laboratory / Type Test Report (${doc.origin})`

      const item = createItem(reason, 'high')
      result.candidates.testReport.push(item)
      if (!result.testReport) {
        result.testReport = item
        result.matchReasons.testReport = reason
      }
      continue
    }

    // Match 3: BIS Certificate
    // Keywords: bis, crs, standard, is_, isi, iso, license, compulsory_reg
    const isBisKeyword =
      nameLower.includes('bis') ||
      nameLower.includes('crs') ||
      nameLower.includes('is_') ||
      nameLower.includes('isi') ||
      nameLower.includes('registration_scheme') ||
      nameLower.includes('bis_license')

    if (isBisKeyword) {
      const reason = `Matched BIS / CRS Compliance Certificate (${doc.origin})`
      const item = createItem(reason, 'high')
      result.candidates.bisCertificate.push(item)
      if (!result.bisCertificate) {
        result.bisCertificate = item
        result.matchReasons.bisCertificate = reason
      }
      continue
    }

    // Match 4: Product Sample
    // Keywords: sample, product_sample, courier, dispatch, receipt, pod, tracking, photo
    const isSampleKeyword =
      nameLower.includes('sample') ||
      nameLower.includes('courier') ||
      nameLower.includes('dispatch') ||
      nameLower.includes('pod') ||
      nameLower.includes('receipt') ||
      nameLower.includes('tracking') ||
      nameLower.includes('sample_photo')

    if (isSampleKeyword) {
      const reason = `Matched Product Sample Submission / Courier Receipt (${doc.origin})`
      const item = createItem(reason, 'high')
      result.candidates.productSample.push(item)
      if (!result.productSample) {
        result.productSample = item
        result.matchReasons.productSample = reason
      }
      continue
    }

    // Remaining non-matching documents added to candidates.otherDocs
    if (!nameLower.includes('turnover') && !nameLower.includes('experience')) {
      const otherItem = createItem(`Additional document from ${doc.origin}`, 'medium')
      result.candidates.otherDocs.push(otherItem)
    }
  }

  // Populate missing explanations
  if (!result.mafLetter) {
    result.matchReasons.mafLetter = 'Document Not Found in New Tender or Eligibility Check records'
  }
  if (!result.testReport) {
    result.matchReasons.testReport = 'Document Not Found in New Tender or Eligibility Check records'
  }
  if (!result.bisCertificate) {
    result.matchReasons.bisCertificate = 'Document Not Found in New Tender or Eligibility Check records'
  }
  if (!result.productSample) {
    result.matchReasons.productSample = 'Document Not Found in New Tender or Eligibility Check records'
  }

  return result
}

/**
 * Asynchronous Auto-Fetch incorporating OpenAI-based semantic analysis
 * when available, with immediate fallback to deterministic matching.
 */
export async function autoFetchSampleDetailsWithAI(tender: Tender): Promise<AutoFetchResult> {
  const localResult = autoFetchSampleDetails(tender)
  const sourceDocs = extractTenderSourceDocuments(tender)

  if (sourceDocs.length === 0) {
    return localResult
  }

  try {
    const res = await fetch('/api/ai-fetch-sample-docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenderTitle: tender.title,
        authority: tender.authority,
        technicalComponents: tender.bid?.technicalComponents || [],
        documents: sourceDocs.map(d => ({
          id: d.id,
          name: d.name,
          origin: d.origin,
          type: d.type,
          size: d.size,
        })),
      }),
    })

    if (!res.ok) return localResult
    const json = await res.json()
    if (!json.success || !json.data) return localResult

    const aiData = json.data
    const docMap = new Map(sourceDocs.map(d => [d.id, d]))

    // Refine MAF Letter from AI
    if (aiData.mafLetterMatch?.documentId && docMap.has(aiData.mafLetterMatch.documentId)) {
      const d = docMap.get(aiData.mafLetterMatch.documentId)!
      localResult.mafLetter = {
        id: d.id,
        name: d.name,
        size: d.size,
        type: d.type,
        uploadedAt: d.uploadedAt,
        dataUrl: d.dataUrl,
        source: 'auto-fetched',
        referenceNote: `AI Verified from ${d.origin}`,
        matchReason: aiData.mafLetterMatch.reason,
        matchConfidence: aiData.mafLetterMatch.confidence || 'high',
      }
      localResult.matchReasons.mafLetter = aiData.mafLetterMatch.reason
    }

    // Refine Test Report from AI
    if (aiData.testReportMatch?.documentId && docMap.has(aiData.testReportMatch.documentId)) {
      const d = docMap.get(aiData.testReportMatch.documentId)!
      localResult.testReport = {
        id: d.id,
        name: d.name,
        size: d.size,
        type: d.type,
        uploadedAt: d.uploadedAt,
        dataUrl: d.dataUrl,
        source: 'auto-fetched',
        referenceNote: `AI Verified from ${d.origin}`,
        matchReason: aiData.testReportMatch.reason,
        matchConfidence: aiData.testReportMatch.confidence || 'high',
      }
      localResult.matchReasons.testReport = aiData.testReportMatch.reason
    }

    // Refine BIS Certificate from AI
    if (aiData.bisCertificateMatch?.documentId && docMap.has(aiData.bisCertificateMatch.documentId)) {
      const d = docMap.get(aiData.bisCertificateMatch.documentId)!
      localResult.bisCertificate = {
        id: d.id,
        name: d.name,
        size: d.size,
        type: d.type,
        uploadedAt: d.uploadedAt,
        dataUrl: d.dataUrl,
        source: 'auto-fetched',
        referenceNote: `AI Verified from ${d.origin}`,
        matchReason: aiData.bisCertificateMatch.reason,
        matchConfidence: aiData.bisCertificateMatch.confidence || 'high',
      }
      localResult.matchReasons.bisCertificate = aiData.bisCertificateMatch.reason
    }

    // Refine Product Sample from AI
    if (aiData.productSampleMatch?.documentId && docMap.has(aiData.productSampleMatch.documentId)) {
      const d = docMap.get(aiData.productSampleMatch.documentId)!
      localResult.productSample = {
        id: d.id,
        name: d.name,
        size: d.size,
        type: d.type,
        uploadedAt: d.uploadedAt,
        dataUrl: d.dataUrl,
        source: 'auto-fetched',
        referenceNote: `AI Verified from ${d.origin}`,
        matchReason: aiData.productSampleMatch.reason,
        matchConfidence: aiData.productSampleMatch.confidence || 'high',
      }
      localResult.matchReasons.productSample = aiData.productSampleMatch.reason
    }

    return localResult
  } catch (err) {
    console.warn('AI matching fallback to heuristic:', err)
    return localResult
  }
}
