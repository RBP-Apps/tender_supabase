import {
  Tender,
  EligibilityDocument,
  SampleDocumentItem,
  CorrigendumRecord,
  BankAccountDetails,
  PortalChecklistItem,
} from '@/types/tender'

export type DocumentCategory =
  | 'portal-checklist'
  | 'tender-notice'
  | 'corrigendum'
  | 'eligibility'
  | 'sample'
  | 'emd-payment'
  | 'generated-bid'
  | 'additional'

export type FileTypeGroup = 'pdf' | 'doc' | 'image' | 'text' | 'other'

export interface CollectedDocument {
  id: string
  title: string
  category: DocumentCategory
  categoryLabel: string
  stageOrigin: string
  fileName: string
  fileType: string
  fileTypeGroup: FileTypeGroup
  fileSize?: number
  uploadedAt: string
  dataUrl?: string
  source: 'auto-fetched' | 'manual-upload' | 'system-generated' | 'bid-details'
  sourceLabel: string
  referenceNote?: string
  remarks?: string
  metadata?: Record<string, any>
  letterContent?: any
  // Dynamic checklist properties
  checklistItemId?: string
  slNo?: number
  envelope?: string
  requirement?: string
  isMandatory?: boolean
  isAttached?: boolean
  clauseOrPageRef?: string
}

export interface DocumentDossierSummary {
  tenderId: string
  tenderTitle: string
  authority: string
  stage: string
  status: string
  totalCount: number
  pdfCount: number
  imageCount: number
  docCount: number
  otherCount: number
  categories: {
    portalChecklist: CollectedDocument[]
    tenderNotice: CollectedDocument[]
    corrigendum: CollectedDocument[]
    eligibility: CollectedDocument[]
    sample: CollectedDocument[]
    emdPayment: CollectedDocument[]
    generatedBid: CollectedDocument[]
    additional: CollectedDocument[]
  }
  checklistTitle?: string
  totalChecklistCount?: number
  attachedChecklistCount?: number
  remarks: {
    eligibility?: string
    sample?: string
    emd?: string
    general?: string
  }
  emdDetails?: {
    amount: string
    amountSource?: string
    utrNumber: string
    date: string
    departmentAccount?: BankAccountDetails
    selfAccount?: BankAccountDetails
    remarks?: string
  }
  hasTenderNotice: boolean
  hasEligibilityDocs: boolean
  hasSampleDocs: boolean
  hasEmdPayment: boolean
}

export function detectFileTypeGroup(fileName: string, mimeType?: string): FileTypeGroup {
  const n = (fileName || '').toLowerCase()
  const m = (mimeType || '').toLowerCase()

  if (n.endsWith('.pdf') || m.includes('pdf')) return 'pdf'
  if (n.endsWith('.doc') || n.endsWith('.docx') || m.includes('word') || m.includes('officedocument'))
    return 'doc'
  if (
    n.match(/\.(jpg|jpeg|png|webp|gif|bmp|svg)$/) ||
    m.includes('image')
  )
    return 'image'
  if (n.endsWith('.txt') || m.includes('text/plain')) return 'text'
  return 'other'
}

export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Consolidates all documents, files, images, PDFs, Word docs, texts,
 * and transaction records across all stages for a tender.
 */
export function collectAllTenderDocuments(tender: Tender): DocumentDossierSummary {
  const docs: CollectedDocument[] = []

  // 1. STAGE 1: TENDER NOTICE & TENDER PDF
  if (tender.tenderDoc) {
    docs.push({
      id: tender.tenderDoc.id || `tender-notice-${tender.id}`,
      title: 'Tender Notice / NIT Document',
      category: 'tender-notice',
      categoryLabel: 'Tender Notice (Stage 01)',
      stageOrigin: 'Tender Details',
      fileName: tender.tenderDoc.name,
      fileType: tender.tenderDoc.type || 'application/pdf',
      fileTypeGroup: detectFileTypeGroup(tender.tenderDoc.name, tender.tenderDoc.type),
      fileSize: tender.tenderDoc.size,
      uploadedAt: tender.tenderDoc.uploadedAt || tender.createdAt || new Date().toISOString(),
      dataUrl: tender.tenderDoc.dataUrl,
      source: 'manual-upload',
      sourceLabel: 'Uploaded Tender NIT',
      referenceNote: `Tender ID: ${tender.id} · Authority: ${tender.authority}`,
      metadata: {
        rfsNo: tender.bid?.rfsNo,
        authorityFullName: tender.bid?.authorityFullName || tender.authority,
        estimatedValue: tender.value,
        due: tender.due,
        tenderFee: tender.bid?.tenderFeePerPackage,
      },
    })
  } else if (tender.bid?.rfsNo || tender.id) {
    const rfsName = tender.bid?.rfsNo
      ? `NIT_RfS_${tender.bid.rfsNo.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`
      : `Tender_Notice_${tender.id}.pdf`
    docs.push({
      id: `tender-notice-${tender.id}`,
      title: 'Tender Notice / NIT Document',
      category: 'tender-notice',
      categoryLabel: 'Tender Notice (Stage 01)',
      stageOrigin: 'Tender Details',
      fileName: rfsName,
      fileType: 'application/pdf',
      fileTypeGroup: 'pdf',
      uploadedAt: tender.createdAt || tender.bid?.rfsDate || new Date().toISOString(),
      source: 'auto-fetched',
      sourceLabel: 'NIT Notice Ref',
      referenceNote: `Tender ID: ${tender.id} · Authority: ${tender.authority}`,
      metadata: {
        rfsNo: tender.bid?.rfsNo,
        authorityFullName: tender.bid?.authorityFullName || tender.authority,
        estimatedValue: tender.value,
        due: tender.due,
        tenderFee: tender.bid?.tenderFeePerPackage,
      },
    })
  }

  // 2. STAGE 2: CORRIGENDA
  if (tender.corrigenda && tender.corrigenda.length > 0) {
    tender.corrigenda.forEach((corr: CorrigendumRecord, idx: number) => {
      docs.push({
        id: `corr-${corr.id || idx}`,
        title: corr.corrigendumNo || `Corrigendum No. ${idx + 1}`,
        category: 'corrigendum',
        categoryLabel: 'Corrigendum Amendments (Stage 02)',
        stageOrigin: 'Corrigendum',
        fileName: corr.fileName || `Corrigendum_${idx + 1}.pdf`,
        fileType: 'application/pdf',
        fileTypeGroup: 'pdf',
        uploadedAt: corr.uploadedAt || new Date().toISOString(),
        source: 'manual-upload',
        sourceLabel: 'Uploaded Corrigendum',
        referenceNote: corr.overview || `${corr.changes?.length || 0} amendment changes recorded`,
        remarks: corr.overview,
        metadata: {
          issueDate: corr.issueDate,
          tenderRef: corr.tenderRef,
          changes: corr.changes,
        },
      })
    })
  }

  // 3. STAGE 3: ELIGIBILITY CHECK DOCUMENTS
  if (tender.eligibilityCheck) {
    const ec = tender.eligibilityCheck
    const addEligibilityDoc = (
      doc: EligibilityDocument | null | undefined,
      docType: string,
      fieldKey: string
    ) => {
      if (!doc) return
      docs.push({
        id: `eligibility-${fieldKey}`,
        title: docType,
        category: 'eligibility',
        categoryLabel: 'Eligibility Verification (Stage 03)',
        stageOrigin: 'Eligibility Check',
        fileName: doc.name,
        fileType: doc.type || 'application/octet-stream',
        fileTypeGroup: detectFileTypeGroup(doc.name, doc.type),
        fileSize: doc.size,
        uploadedAt: doc.uploadedAt || ec.completedAt || new Date().toISOString(),
        dataUrl: doc.dataUrl,
        source: 'manual-upload',
        sourceLabel: 'Verified in Eligibility',
        referenceNote: `Field: ${docType}`,
        remarks: ec.remarks,
        letterContent: doc.letterContent,
      })
    }

    addEligibilityDoc(ec.turnoverDoc, 'Annual Financial Turnover Certificate', 'turnover')
    addEligibilityDoc(ec.experienceDoc, 'Experience / Work Completion Certificate', 'experience')
    addEligibilityDoc(ec.vendorRegDoc, 'Vendor / Department Registration Certificate', 'vendorReg')
    addEligibilityDoc(ec.otherDoc, 'Other Statutory Eligibility Documents', 'other')
  }

  // 4. STAGE 4: SAMPLE DETAILS DOCUMENTS
  if (tender.sampleDetails) {
    const sd = tender.sampleDetails
    const addSampleDoc = (
      item: SampleDocumentItem | null | undefined,
      docType: string,
      fieldKey: string
    ) => {
      if (!item) return
      docs.push({
        id: `sample-${item.id || fieldKey}`,
        title: docType,
        category: 'sample',
        categoryLabel: 'Sample Details & Testing (Stage 04)',
        stageOrigin: 'Sample Details',
        fileName: item.name,
        fileType: item.type || 'application/octet-stream',
        fileTypeGroup: detectFileTypeGroup(item.name, item.type),
        fileSize: item.size,
        uploadedAt: item.uploadedAt || sd.completedAt || new Date().toISOString(),
        dataUrl: item.dataUrl,
        source: item.source === 'auto-fetched' ? 'auto-fetched' : 'manual-upload',
        sourceLabel: item.source === 'auto-fetched' ? 'Auto-Fetched' : 'Stage 04 Submission',
        referenceNote: item.referenceNote || `Field: ${docType}`,
        remarks: sd.remarks,
        letterContent: item.letterContent,
      })
    }

    addSampleDoc(sd.mafLetter, 'Manufacturer Authorization Form (MAF Letter)', 'maf')
    addSampleDoc(sd.testReport, 'Laboratory Test & Quality Report', 'test')
    addSampleDoc(sd.bisCertificate, 'BIS / ISO Standard Certificate', 'bis')
    addSampleDoc(sd.productSample, 'Product Sample Specification / Photo', 'sample')

    if (sd.otherDocs && sd.otherDocs.length > 0) {
      sd.otherDocs.forEach((od, idx) => {
        addSampleDoc(od, `Additional Technical Document (${od.name})`, `other-${idx}`)
      })
    }
  }

  // 5. STAGE 5: EMD READY PAYMENT & BANK ACCOUNTS
  if (tender.emdReady) {
    const emd = tender.emdReady
    const emdDocTitle = `EMD Payment Receipt (${emd.utrNumber || 'UTR Verification'})`
    docs.push({
      id: `emd-receipt-${tender.id}`,
      title: emdDocTitle,
      category: 'emd-payment',
      categoryLabel: 'EMD Payment & Bank Guarantee (Stage 05)',
      stageOrigin: 'EMD Ready',
      fileName: `EMD_Payment_${emd.utrNumber || tender.id}.pdf`,
      fileType: 'application/pdf',
      fileTypeGroup: 'pdf',
      uploadedAt: emd.date || emd.completedAt || new Date().toISOString(),
      source: 'auto-fetched',
      sourceLabel: 'Verified EMD Record',
      referenceNote: `UTR: ${emd.utrNumber} · Amount: ${emd.amount} · Date: ${emd.date}`,
      remarks: emd.remarks,
      metadata: {
        amount: emd.amount,
        amountSource: emd.amountSource,
        utrNumber: emd.utrNumber,
        date: emd.date,
        departmentAccount: emd.departmentAccount,
        selfAccount: emd.selfAccount,
      },
    })
  }

  // 6. SYSTEM-GENERATED BID SUBMISSION DOCUMENTS
  const standardGeneratedDocs = [
    {
      id: 'gen-checklist',
      title: 'Bid Submission Checklist & Index',
      fileName: `Checklist_${tender.id}.pdf`,
    },
    {
      id: 'gen-bid-formats',
      title: 'Company Letterhead Bid Formats (1, 2, 6, 7, 9, 10, 12)',
      fileName: `Bid_Formats_${tender.id}.pdf`,
    },
    {
      id: 'gen-emd-bg',
      title: 'EMD Bank Guarantee Annexure-K',
      fileName: `Annexure_K_EMD_${tender.id}.pdf`,
    },
    {
      id: 'gen-stamp-paper',
      title: 'Stamp Paper Affidavits (Format-5, Annexures D, H, E)',
      fileName: `Stamp_Affidavits_${tender.id}.pdf`,
    },
    {
      id: 'gen-envelope-stickers',
      title: 'Envelope Covers & Master Submission Stickers',
      fileName: `Envelope_Stickers_${tender.id}.pdf`,
    },
  ]

  standardGeneratedDocs.forEach(g => {
    docs.push({
      id: `${g.id}-${tender.id}`,
      title: g.title,
      category: 'generated-bid',
      categoryLabel: 'Auto-Generated Submission Documents',
      stageOrigin: 'System Generator',
      fileName: g.fileName,
      fileType: 'application/pdf',
      fileTypeGroup: 'pdf',
      uploadedAt: new Date().toISOString(),
      source: 'system-generated',
      sourceLabel: 'Standard Bid Template',
      referenceNote: 'Auto-compiled with tender parameters and company letterhead',
    })
  })

  // 6b. ADDITIONAL / CUSTOM UPLOADED DOCUMENTS IN DOCUMENT READY
  if (tender.documentReady?.customDocs && tender.documentReady.customDocs.length > 0) {
    tender.documentReady.customDocs.forEach(item => {
      docs.push({
        id: `custom-${item.id}`,
        title: item.referenceNote || item.name,
        category: 'additional',
        categoryLabel: 'Additional Uploaded Documents (Document Ready)',
        stageOrigin: 'Document Ready',
        fileName: item.name,
        fileType: item.type || 'application/octet-stream',
        fileTypeGroup: detectFileTypeGroup(item.name, item.type),
        fileSize: item.size,
        uploadedAt: item.uploadedAt || new Date().toISOString(),
        dataUrl: item.dataUrl,
        source: 'manual-upload',
        sourceLabel: 'Uploaded in Document Ready',
        referenceNote: item.referenceNote,
        remarks: tender.documentReady?.remarks,
        letterContent: item.letterContent,
      })
    })
  }

  // Group by category
  const categories = {
    tenderNotice: docs.filter(d => d.category === 'tender-notice'),
    corrigendum: docs.filter(d => d.category === 'corrigendum'),
    eligibility: docs.filter(d => d.category === 'eligibility'),
    sample: docs.filter(d => d.category === 'sample'),
    emdPayment: docs.filter(d => d.category === 'emd-payment'),
    generatedBid: docs.filter(d => d.category === 'generated-bid'),
    additional: docs.filter(d => d.category === 'additional'),
  }

  // Counts by file type
  const pdfCount = docs.filter(d => d.fileTypeGroup === 'pdf').length
  const imageCount = docs.filter(d => d.fileTypeGroup === 'image').length
  const docCount = docs.filter(d => d.fileTypeGroup === 'doc').length
  const otherCount = docs.filter(d => d.fileTypeGroup === 'text' || d.fileTypeGroup === 'other').length

  return {
    tenderId: tender.id,
    tenderTitle: tender.title,
    authority: tender.authority,
    stage: tender.stage,
    status: tender.status,
    totalCount: docs.length,
    pdfCount,
    imageCount,
    docCount,
    otherCount,
    categories,
    remarks: {
      eligibility: tender.eligibilityCheck?.remarks,
      sample: tender.sampleDetails?.remarks,
      emd: tender.emdReady?.remarks,
      general: tender.remarks,
    },
    emdDetails: tender.emdReady
      ? {
          amount: tender.emdReady.amount,
          amountSource: tender.emdReady.amountSource,
          utrNumber: tender.emdReady.utrNumber,
          date: tender.emdReady.date,
          departmentAccount: tender.emdReady.departmentAccount,
          selfAccount: tender.emdReady.selfAccount,
          remarks: tender.emdReady.remarks,
        }
      : undefined,
    hasTenderNotice: categories.tenderNotice.length > 0,
    hasEligibilityDocs: categories.eligibility.length > 0,
    hasSampleDocs: categories.sample.length > 0,
    hasEmdPayment: categories.emdPayment.length > 0,
  }
}
