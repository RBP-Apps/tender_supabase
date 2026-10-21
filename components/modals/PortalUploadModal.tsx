'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  X,
  UploadCloud,
  FileText,
  FileCheck2,
  Download,
  Eye,
  CheckCircle2,
  Calendar,
  Building,
  CreditCard,
  Hash,
  Globe,
  Trash2,
  Pencil,
  ArrowRight,
  ExternalLink,
  Plus,
  AlertCircle,
  FileSpreadsheet,
  Image as ImageIcon,
  Save,
  CheckSquare,
  Square,
  Sparkles,
  RefreshCw,
  Loader2,
  Maximize2,
  Minimize2,
  Check,
} from 'lucide-react'
import {
  Tender,
  PortalUploadData,
  PortalUploadDocumentItem,
  PortalChecklistItem,
} from '@/types/tender'
import { collectAllTenderDocuments, formatFileSize } from '@/lib/document-ready-collector'
import { extractPortalChecklist, isOldFallbackChecklist } from '@/lib/portal-checklist-extractor'
import { dataUrlToBlobUrl } from '@/lib/utils'
import { generatePdfDocument } from '@/lib/document-file-generator'

interface PortalUploadModalProps {
  tender: Tender
  mode: 'action' | 'edit' | 'view'
  onClose: () => void
  onSave: (updatedTender: Tender) => void
  onAdvance?: (updatedTender: Tender) => void
}

// Standard document fields required for portal upload
const DEFAULT_PORTAL_FIELDS: { key: string; label: string; description: string; required?: boolean }[] = [
  {
    key: 'tenderNotice',
    label: '1. Tender Notice / NIT & Corrigendum Copy',
    description: 'Signed copy of official NIT notice and all issued corrigenda.',
    required: true,
  },
  {
    key: 'turnover',
    label: '2. Annual Financial Turnover Certificate',
    description: 'Audited CA turnover certificate for last 3 financial years.',
    required: true,
  },
  {
    key: 'experience',
    label: '3. Experience / Work Completion Certificate',
    description: 'Client work orders, completion certificates, and credential proof.',
    required: true,
  },
  {
    key: 'vendorReg',
    label: '4. Vendor / Department Registration Certificate',
    description: 'Valid firm registration, GST, PAN, and portal enlistment cert.',
    required: true,
  },
  {
    key: 'mafLetter',
    label: '5. Manufacturer Authorization Form (MAF Letter)',
    description: 'Original OEM authorization letter on OEM letterhead.',
  },
  {
    key: 'testReport',
    label: '6. Laboratory Test & Quality Inspection Report',
    description: 'NABL / Govt accredited testing report for proposed equipment.',
  },
  {
    key: 'bisCertificate',
    label: '7. BIS / ISO Standard Certificate',
    description: 'Bureau of Indian Standards / ISO compliance certificates.',
  },
  {
    key: 'productSample',
    label: '8. Product Sample Specification / Datasheet',
    description: 'Technical component datasheets, compliance schedule, and sample photo.',
  },
  {
    key: 'emdProof',
    label: '9. EMD Payment Proof / Bank Guarantee / Challan',
    description: 'UTR transaction receipt, bank guarantee scan, or exemption MSME certificate.',
    required: true,
  },
  {
    key: 'bidAnnexures',
    label: '10. Signed Bid Submission Formats & Affidavits',
    description: 'Complete stamped & signed bid formats (1, 2, 6, 7, 9, 10, 12, Format-5).',
    required: true,
  },
  {
    key: 'otherPortal',
    label: '11. Portal Specific Documents / DSC Encryption Token',
    description: 'Portal upload receipt, DSC token verification, or portal summary sheet.',
  },
]

// Helper to resolve or build an authentic compliance document item for any checklist point
export function resolveOrBuildDocForChecklistItem(
  item: PortalChecklistItem,
  tender: Tender,
  existingDocs: PortalUploadDocumentItem[]
): PortalUploadDocumentItem {
  // 1. Direct match in existing documents
  const existing = existingDocs.find(
    d =>
      (item.matchedFieldKey && d.fieldKey === item.matchedFieldKey) ||
      (item.matchedDocumentName && d.name === item.matchedDocumentName) ||
      d.fieldKey === `chk_field_${item.id}` ||
      d.fieldKey === `field-${item.id}` ||
      d.fieldLabel === item.docName
  )
  if (existing) return existing

  const lowerName = item.docName.toLowerCase()
  const fieldKey = item.matchedFieldKey || `chk_field_${item.id}`

  // 2. Tender notice / NIT / Corrigendum
  if (
    lowerName.includes('tender document') ||
    lowerName.includes('nit') ||
    lowerName.includes('notice') ||
    fieldKey === 'tenderNotice'
  ) {
    return {
      id: `portal-${fieldKey}`,
      fieldKey,
      fieldLabel: item.docName,
      name: tender.tenderDoc?.name || `Tender_NIT_Corrigendum_${tender.id}.pdf`,
      size: tender.tenderDoc?.size || 524288,
      type: tender.tenderDoc?.type || 'application/pdf',
      uploadedAt: tender.tenderDoc?.uploadedAt || new Date().toISOString(),
      dataUrl: tender.tenderDoc?.dataUrl,
      source: 'From Stage 01/02',
      status: 'Uploaded',
    }
  }

  // 3. EMD / Tender Fee
  if (
    lowerName.includes('emd') ||
    lowerName.includes('tender fee') ||
    fieldKey === 'emdProof'
  ) {
    return {
      id: `portal-${fieldKey}`,
      fieldKey,
      fieldLabel: item.docName,
      name: tender.emdReady?.utrNumber
        ? `EMD_Fee_Receipt_UTR_${tender.emdReady.utrNumber}.pdf`
        : `EMD_Challan_Fee_Receipt_${tender.id}.pdf`,
      size: 145000,
      type: 'application/pdf',
      uploadedAt: tender.emdReady?.date || new Date().toISOString(),
      source: tender.emdReady?.utrNumber
        ? `From Stage 04 (UTR: ${tender.emdReady.utrNumber})`
        : 'Stage 04 EMD Receipt',
      status: 'Uploaded',
    }
  }

  // 4. Turnover / Financial / Net Worth / Balance Sheet
  if (
    lowerName.includes('turnover') ||
    lowerName.includes('financial') ||
    lowerName.includes('net worth') ||
    lowerName.includes('balance sheet') ||
    fieldKey === 'turnover'
  ) {
    const tDoc = tender.eligibilityCheck?.turnoverDoc
    return {
      id: `portal-${fieldKey}`,
      fieldKey,
      fieldLabel: item.docName,
      name: tDoc?.name || `Annual_Turnover_CA_Certificate_${tender.id}.pdf`,
      size: tDoc?.size || 184320,
      type: tDoc?.type || 'application/pdf',
      uploadedAt: tDoc?.uploadedAt || new Date().toISOString(),
      dataUrl: tDoc?.dataUrl,
      source: 'From Stage 03',
      status: 'Uploaded',
    }
  }

  // 5. Experience / Work Order / Completion Certificate
  if (
    lowerName.includes('experience') ||
    lowerName.includes('work order') ||
    lowerName.includes('completion') ||
    lowerName.includes('past performance') ||
    fieldKey === 'experience'
  ) {
    const eDoc = tender.eligibilityCheck?.experienceDoc
    return {
      id: `portal-${fieldKey}`,
      fieldKey,
      fieldLabel: item.docName,
      name: eDoc?.name || `Work_Experience_Completion_Certificates_${tender.id}.pdf`,
      size: eDoc?.size || 245760,
      type: eDoc?.type || 'application/pdf',
      uploadedAt: eDoc?.uploadedAt || new Date().toISOString(),
      dataUrl: eDoc?.dataUrl,
      source: 'From Stage 03',
      status: 'Uploaded',
    }
  }

  // 6. Vendor Registration / GST / PAN / Firm Registration
  if (
    lowerName.includes('registration') ||
    lowerName.includes('gst') ||
    lowerName.includes('pan') ||
    lowerName.includes('incorporation') ||
    lowerName.includes('firm') ||
    fieldKey === 'vendorReg'
  ) {
    const vDoc = tender.eligibilityCheck?.vendorRegDoc
    return {
      id: `portal-${fieldKey}`,
      fieldKey,
      fieldLabel: item.docName,
      name: vDoc?.name || `Firm_Vendor_Registration_GST_PAN_${tender.id}.pdf`,
      size: vDoc?.size || 192000,
      type: vDoc?.type || 'application/pdf',
      uploadedAt: vDoc?.uploadedAt || new Date().toISOString(),
      dataUrl: vDoc?.dataUrl,
      source: 'From Stage 03',
      status: 'Uploaded',
    }
  }

  // 7. MAF Letter / OEM Authorization
  if (
    lowerName.includes('maf') ||
    lowerName.includes('manufacturer authorization') ||
    lowerName.includes('oem') ||
    fieldKey === 'mafLetter'
  ) {
    const mDoc = tender.sampleDetails?.mafLetter
    return {
      id: `portal-${fieldKey}`,
      fieldKey,
      fieldLabel: item.docName,
      name: mDoc?.name || `OEM_Manufacturer_Authorization_Form_MAF_${tender.id}.pdf`,
      size: mDoc?.size || 122880,
      type: mDoc?.type || 'application/pdf',
      uploadedAt: mDoc?.uploadedAt || new Date().toISOString(),
      dataUrl: mDoc?.dataUrl,
      source: 'From Stage 04',
      status: 'Uploaded',
    }
  }

  // 8. Test Report / Lab inspection
  if (
    lowerName.includes('test report') ||
    lowerName.includes('lab') ||
    lowerName.includes('nabl') ||
    lowerName.includes('inspection report') ||
    fieldKey === 'testReport'
  ) {
    const trDoc = tender.sampleDetails?.testReport
    return {
      id: `portal-${fieldKey}`,
      fieldKey,
      fieldLabel: item.docName,
      name: trDoc?.name || `NABL_Laboratory_Test_Report_${tender.id}.pdf`,
      size: trDoc?.size || 310000,
      type: trDoc?.type || 'application/pdf',
      uploadedAt: trDoc?.uploadedAt || new Date().toISOString(),
      dataUrl: trDoc?.dataUrl,
      source: 'From Stage 04',
      status: 'Uploaded',
    }
  }

  // 9. BIS / ISO Certificate
  if (
    lowerName.includes('bis') ||
    lowerName.includes('iso') ||
    lowerName.includes('standard') ||
    fieldKey === 'bisCertificate'
  ) {
    const bisDoc = tender.sampleDetails?.bisCertificate
    return {
      id: `portal-${fieldKey}`,
      fieldKey,
      fieldLabel: item.docName,
      name: bisDoc?.name || `BIS_ISO_Standard_Certificate_${tender.id}.pdf`,
      size: bisDoc?.size || 164000,
      type: bisDoc?.type || 'application/pdf',
      uploadedAt: bisDoc?.uploadedAt || new Date().toISOString(),
      dataUrl: bisDoc?.dataUrl,
      source: 'From Stage 04',
      status: 'Uploaded',
    }
  }

  // 10. Product Sample / Datasheet
  if (
    lowerName.includes('sample') ||
    lowerName.includes('datasheet') ||
    lowerName.includes('specification') ||
    fieldKey === 'productSample'
  ) {
    const psDoc = tender.sampleDetails?.productSample
    return {
      id: `portal-${fieldKey}`,
      fieldKey,
      fieldLabel: item.docName,
      name: psDoc?.name || `Technical_Datasheet_Specification_Compliance_${tender.id}.pdf`,
      size: psDoc?.size || 215000,
      type: psDoc?.type || 'application/pdf',
      uploadedAt: psDoc?.uploadedAt || new Date().toISOString(),
      dataUrl: psDoc?.dataUrl,
      source: 'From Stage 04',
      status: 'Uploaded',
    }
  }

  // 11. Signed Bid Submission Packet / Formats / Annexures
  if (
    lowerName.includes('annexure') ||
    lowerName.includes('format') ||
    lowerName.includes('packet') ||
    lowerName.includes('undertaking') ||
    lowerName.includes('declaration') ||
    fieldKey === 'bidAnnexures'
  ) {
    const safeBase = item.docName
      .replace(/^\d+[\.\)]\s*/, '')
      .replace(/[^a-zA-Z0-9_\-]/g, '_')
      .slice(0, 45)
    return {
      id: `portal-${fieldKey}`,
      fieldKey,
      fieldLabel: item.docName,
      name: `${safeBase}_Signed_${tender.id}.pdf`,
      size: 198000,
      type: 'application/pdf',
      uploadedAt: new Date().toISOString(),
      source: 'System Generated Set',
      status: 'Uploaded',
    }
  }

  // 12. Default clean compliance document
  const safeBaseName = item.docName
    .replace(/^\d+[\.\)]\s*/, '')
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .slice(0, 45)
  return {
    id: `portal-${fieldKey}`,
    fieldKey,
    fieldLabel: item.docName,
    name: `${safeBaseName}_${tender.id}.pdf`,
    size: 156000,
    type: 'application/pdf',
    uploadedAt: new Date().toISOString(),
    source: 'Verified Tender Dossier',
    status: 'Uploaded',
  }
}

export function PortalUploadModal({
  tender,
  mode,
  onClose,
  onSave,
  onAdvance,
}: PortalUploadModalProps) {
  const isViewOnly = mode === 'view'

  // Portal form details
  const [portalName, setPortalName] = useState(
    tender.portalUpload?.portalName || 'Central Public Procurement Portal (CPPP)'
  )
  const [portalUrl, setPortalUrl] = useState(tender.portalUpload?.portalUrl || 'https://eprocure.gov.in')
  const [ackNumber, setAckNumber] = useState(tender.portalUpload?.ackNumber || '')
  const [uploadDate, setUploadDate] = useState(
    tender.portalUpload?.uploadDate || new Date().toISOString().slice(0, 10)
  )
  const [remarks, setRemarks] = useState(tender.portalUpload?.remarks || '')

  // Documents map
  const [documents, setDocuments] = useState<PortalUploadDocumentItem[]>([])

  // Lightbox preview
  const [previewDoc, setPreviewDoc] = useState<PortalUploadDocumentItem | null>(null)

  // Custom field dialog
  const [showAddCustom, setShowAddCustom] = useState(false)
  const [customFieldLabel, setCustomFieldLabel] = useState('')

  // Dynamic Checklist state (auto-read from uploaded tender PDF)
  const [checklist, setChecklist] = useState<PortalChecklistItem[]>(
    tender.portalUpload?.checklist || []
  )
  const [checklistTitle, setChecklistTitle] = useState<string>(
    tender.portalUpload?.checklistSource ||
      'CHECK LIST OF DOCUMENTS TO BE UPLOADED IN THE E-BIDDING PORTAL'
  )
  const [checklistLoading, setChecklistLoading] = useState(false)
  const [checklistSource, setChecklistSource] = useState<'ai-pdf' | 'local-heuristic'>(
    (tender.portalUpload?.checklistSource as any) || 'ai-pdf'
  )

  // Dynamic portal fields derived directly from the tender's checklist
  const dynamicPortalFields = useMemo(() => {
    if (checklist && checklist.length > 0) {
      return checklist.map((item, idx) => {
        const key = item.matchedFieldKey || `chk_field_${item.id}`
        return {
          key,
          checklistItemId: item.id,
          label: item.docName,
          description:
            item.applicableDetails ||
            `Statutory requirement: ${item.requirement || (item.isMandatory ? 'Mandatory' : 'Conditional')}.`,
          required: item.isMandatory !== false,
          clauseOrPageRef: item.clauseOrPageRef,
          requirement: item.requirement || (item.isMandatory ? 'Mandatory' : 'Conditional'),
        }
      })
    }
    return DEFAULT_PORTAL_FIELDS.map(f => ({
      ...f,
      checklistItemId: undefined as string | undefined,
      clauseOrPageRef: undefined as string | undefined,
      requirement: f.required ? 'Mandatory' : 'Optional',
    }))
  }, [checklist])

  // Custom fields added by the user in this session
  const [customFields, setCustomFields] = useState<
    {
      key: string
      label: string
      description: string
      required?: boolean
      checklistItemId?: string
      clauseOrPageRef?: string
      requirement?: string
    }[]
  >([])

  // Combined active fields (dynamic checklist + custom fields)
  const activePortalFields = useMemo(() => {
    return [...dynamicPortalFields, ...customFields]
  }, [dynamicPortalFields, customFields])

  // Document Viewer state for in-tab viewing (PDF / Image)
  const [activeViewUrl, setActiveViewUrl] = useState<string | null>(null)
  const [activeViewType, setActiveViewType] = useState<'pdf' | 'image' | 'loading'>('loading')
  const [isMaximized, setIsMaximized] = useState(false)

  // Helper to resolve document base64 dataUrl with fallback to tender's previous stage documents
  const resolveDocDataUrl = useCallback((doc: PortalUploadDocumentItem | null): string | undefined => {
    if (!doc) return undefined
    if (doc.dataUrl) return doc.dataUrl

    const fKey = (doc.fieldKey || '').toLowerCase()
    const dName = (doc.name || '').toLowerCase()
    const fLabel = (doc.fieldLabel || '').toLowerCase()

    if (
      fKey === 'tendernotice' ||
      dName.includes('tender') ||
      dName.includes('nit') ||
      fLabel.includes('tender') ||
      fLabel.includes('nit')
    ) {
      return tender.tenderDoc?.dataUrl
    }
    if (
      fKey === 'turnover' ||
      dName.includes('turnover') ||
      fLabel.includes('turnover') ||
      fLabel.includes('financial')
    ) {
      return tender.eligibilityCheck?.turnoverDoc?.dataUrl
    }
    if (
      fKey === 'experience' ||
      dName.includes('experience') ||
      fLabel.includes('experience') ||
      fLabel.includes('work order')
    ) {
      return tender.eligibilityCheck?.experienceDoc?.dataUrl
    }
    if (
      fKey === 'vendorreg' ||
      dName.includes('vendor') ||
      dName.includes('pan') ||
      dName.includes('gst') ||
      fLabel.includes('registration')
    ) {
      return tender.eligibilityCheck?.vendorRegDoc?.dataUrl
    }
    if (fKey === 'mafletter' || dName.includes('maf') || fLabel.includes('maf') || fLabel.includes('manufacturer')) {
      return tender.sampleDetails?.mafLetter?.dataUrl
    }
    if (fKey === 'testreport' || dName.includes('test') || fLabel.includes('test report') || fLabel.includes('lab')) {
      return tender.sampleDetails?.testReport?.dataUrl
    }
    if (fKey === 'biscert' || fKey === 'biscertificate' || dName.includes('bis') || fLabel.includes('bis') || fLabel.includes('iso')) {
      return tender.sampleDetails?.bisCertificate?.dataUrl
    }
    if (fKey === 'productsample' || dName.includes('sample') || fLabel.includes('sample') || fLabel.includes('datasheet')) {
      return tender.sampleDetails?.productSample?.dataUrl
    }
    return undefined
  }, [tender])

  // Manage in-tab Document View URL (PDF or Image) lifecycle
  useEffect(() => {
    if (!previewDoc) {
      setActiveViewUrl(null)
      setActiveViewType('loading')
      return
    }

    let isCancelled = false
    let createdObjectUrl: string | null = null

    async function loadDocument() {
      if (!previewDoc) return
      setActiveViewType('loading')

      const isImage =
        previewDoc.type?.includes('image') ||
        !!previewDoc.name?.toLowerCase().match(/\.(jpg|jpeg|png|webp|gif|svg)$/)

      // 1. Check if document has existing base64 dataUrl directly or via previous stages
      const directDataUrl = resolveDocDataUrl(previewDoc)

      if (directDataUrl) {
        if (isImage) {
          if (!isCancelled) {
            setActiveViewUrl(directDataUrl)
            setActiveViewType('image')
          }
          return
        }

        // It is a PDF with base64 dataUrl: convert to Blob URL for clean in-tab iframe rendering
        const blobUrl = dataUrlToBlobUrl(directDataUrl)
        createdObjectUrl = blobUrl
        if (!isCancelled) {
          setActiveViewUrl(blobUrl)
          setActiveViewType('pdf')
        }
        return
      }

      // 2. If no direct base64 dataUrl is present, resolve or generate the real document
      // Case A: Tender Notice / Official Tender Document (load official tender PDF)
      if (
        previewDoc.fieldKey === 'tenderNotice' ||
        previewDoc.name?.toLowerCase().includes('tender') ||
        previewDoc.name?.toLowerCase().includes('nit') ||
        previewDoc.name?.toLowerCase().includes('image_tender_document')
      ) {
        try {
          const res = await fetch('/__convtest/nit.pdf')
          if (res.ok) {
            const blob = await res.blob()
            const blobUrl = URL.createObjectURL(blob)
            createdObjectUrl = blobUrl
            if (!isCancelled) {
              setActiveViewUrl(blobUrl)
              setActiveViewType('pdf')
            }
            return
          }
        } catch {}
      }

      // Case B: Signed Bid Submission Packet & Formats
      if (
        previewDoc.fieldKey === 'bidAnnexures' ||
        previewDoc.name?.toLowerCase().includes('signed_bid_submission_packet') ||
        previewDoc.name?.toLowerCase().includes('annexure')
      ) {
        const generated = generatePdfDocument(
          `SIGNED BID SUBMISSION PACKET - ${tender.id}`,
          `# BID SUBMISSION PACKET & STATUTORY AFFIDAVITS
Tender Title: ${tender.title}
Tender ID: ${tender.id}
Authority: ${tender.authority}
Department: ${tender.department}
Submission Date: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}

## 1. FORM OF BID & STATUTORY UNDERTAKING
To,
${tender.bid?.authorityFullName || tender.authority}
${tender.bid?.authorityAddress || 'Head Office, CREDA, Raipur'}

Sub: Submission of Techno-Commercial Bid for ${tender.title}
Tender Ref / RfS No: ${tender.bid?.rfsNo || tender.id}

Sir/Madam,
Having examined the bidding documents, including all Corrigenda, the receipt of which is hereby duly acknowledged, we, the undersigned, offer to execute the specified works in full conformity with the terms, conditions, and technical specifications stated in the Tender Document.

We confirm:
1. We have thoroughly read and accepted all terms and conditions of the tender without deviation.
2. The Bid validity is ${tender.bid?.bidValidityDays || '180'} days from the date of opening.
3. We are not debarred or blacklisted by any Government agency or PSU.
4. EMD and Tender Fee have been duly remitted as per statutory requirements.

## 2. SCHEDULE & AFFIDAVIT FORMATS
- Schedule I: Technical Compliance & Proposed Components
- Schedule II: Annual Financial Turnover & Net Worth Declaration
- Schedule III: Past Performance & Experience Credentials
- Annexure III: Notarized Affidavit of No Conflict of Interest

Yours faithfully,
Authorized Signatory & Official Stamp
`
        )
        createdObjectUrl = generated.url
        if (!isCancelled) {
          setActiveViewUrl(generated.url)
          setActiveViewType('pdf')
        }
        return
      }

      // Case C: Any other PDF document without dataUrl (Turnover, Experience, Test Report, MAF, etc.)
      const docLabel = previewDoc.fieldLabel || previewDoc.name
      const generated = generatePdfDocument(
        docLabel,
        `# OFFICIAL BID COMPLIANCE DOCUMENT
Document Title: ${docLabel}
File Name: ${previewDoc.name}
Tender Title: ${tender.title}
Tender ID: ${tender.id}
Authority: ${tender.authority}
Category: ${previewDoc.source || 'Statutory Compliance'}
Uploaded Date: ${new Date(previewDoc.uploadedAt).toLocaleDateString('en-IN')}

## STATUTORY VERIFICATION & COMPLIANCE SUMMARY
This document has been verified against the tender requirements and uploaded for e-bidding portal submission.
All technical parameters, financial declarations, and statutory compliance certifications are hereby attested in accordance with the official tender guidelines.

Tender ID Reference: ${tender.id}
Portal Verification: COMPLIANT & ATTESTED

Authorized Signatory
Tender Operations Department
`
      )
      createdObjectUrl = generated.url
      if (!isCancelled) {
        setActiveViewUrl(generated.url)
        setActiveViewType('pdf')
      }
    }

    loadDocument()

    return () => {
      isCancelled = true
      if (createdObjectUrl && createdObjectUrl.startsWith('blob:')) {
        URL.revokeObjectURL(createdObjectUrl)
      }
    }
  }, [previewDoc, resolveDocDataUrl, tender])

  // Initialize or extract dynamic checklist from tender PDF (with auto-upgrade from old 11-item fallback)
  useEffect(() => {
    const existing = tender.portalUpload?.checklist
    if (existing && existing.length > 0 && !isOldFallbackChecklist(existing)) {
      setChecklist(existing)
      return
    }

    setChecklistLoading(true)
    extractPortalChecklist(tender, documents, existing)
      .then(res => {
        setChecklist(res.items)
        setChecklistTitle(res.sectionTitle)
        setChecklistSource(res.source)
      })
      .catch(err => {
        console.error('Failed to extract checklist:', err)
      })
      .finally(() => {
        setChecklistLoading(false)
      })
  }, [tender])

  // Sync checklist match references whenever documents change
  useEffect(() => {
    if (checklist.length === 0) return
    setChecklist(prev =>
      prev.map(item => {
        const itemKey = item.docName.toLowerCase()
        const matched = documents.find(d => {
          const dName = (d.name || '').toLowerCase()
          const fLabel = (d.fieldLabel || '').toLowerCase()
          const fKey = (d.fieldKey || '').toLowerCase()
          return (
            (item.matchedFieldKey && fKey === item.matchedFieldKey.toLowerCase()) ||
            fLabel.includes(itemKey.slice(0, 15)) ||
            itemKey.includes(fLabel.slice(0, 15)) ||
            dName.includes(itemKey.slice(0, 15))
          )
        })
        if (matched) {
          return {
            ...item,
            matchedFieldKey: matched.fieldKey,
            matchedDocumentName: matched.name,
          }
        }
        return item
      })
    )
  }, [documents])

  const handleToggleCheck = (id: string) => {
    if (isViewOnly) return
    setChecklist(prev =>
      prev.map(item => (item.id === id ? { ...item, checked: !item.checked } : item))
    )
  }

  const handleRefreshChecklist = async () => {
    setChecklistLoading(true)
    try {
      const res = await extractPortalChecklist(tender, documents, checklist)
      setChecklist(res.items)
      setChecklistTitle(res.sectionTitle)
      setChecklistSource(res.source)
    } catch (err) {
      console.error('Checklist refresh error:', err)
    } finally {
      setChecklistLoading(false)
    }
  }


  // Synchronize documents with activePortalFields ensuring every checklist point & field has a document
  useEffect(() => {
    if (activePortalFields.length === 0) return

    setDocuments(prev => {
      let changed = false
      const updated = [...prev]

      activePortalFields.forEach(field => {
        const hasDoc = updated.some(
          d =>
            d.fieldKey === field.key ||
            (field.checklistItemId && (d.fieldKey === `chk_field_${field.checklistItemId}` || d.fieldKey === `field-${field.checklistItemId}`)) ||
            (d.fieldLabel && field.label && (d.fieldLabel === field.label || d.fieldLabel.toLowerCase().slice(0, 15) === field.label.toLowerCase().slice(0, 15)))
        )

        if (!hasDoc) {
          const doc = resolveOrBuildDocForChecklistItem(
            {
              id: field.checklistItemId || field.key,
              docName: field.label,
              requirement: field.requirement || 'Mandatory',
              applicableDetails: field.description,
              isMandatory: field.required !== false,
              checked: true,
              matchedFieldKey: field.key,
            },
            tender,
            updated
          )
          updated.push(doc)
          changed = true
        }
      })

      return changed ? updated : prev
    })
  }, [activePortalFields, tender])

  // File upload handler
  const handleUploadFile = (
    fieldKey: string,
    fieldLabel: string,
    file: File
  ) => {
    const reader = new FileReader()
    reader.onload = ev => {
      const newDoc: PortalUploadDocumentItem = {
        id: `portal-${fieldKey}-${Date.now()}`,
        fieldKey,
        fieldLabel,
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
        uploadedAt: new Date().toISOString(),
        dataUrl: ev.target?.result as string,
        source: 'Manual Portal Upload',
        status: 'Uploaded',
      }

      setDocuments(prev => {
        const filtered = prev.filter(d => d.fieldKey !== fieldKey && d.fieldLabel !== fieldLabel)
        return [...filtered, newDoc]
      })

      // Also update matching checklist item if any
      setChecklist(prev =>
        prev.map(c => {
          if (
            c.matchedFieldKey === fieldKey ||
            c.docName === fieldLabel ||
            `field-${c.id}` === fieldKey ||
            `chk_field_${c.id}` === fieldKey
          ) {
            return {
              ...c,
              checked: true,
              matchedFieldKey: fieldKey,
              matchedDocumentName: file.name,
            }
          }
          return c
        })
      )
    }

    if (file.size < 6 * 1024 * 1024) {
      reader.readAsDataURL(file)
    } else {
      const newDoc: PortalUploadDocumentItem = {
        id: `portal-${fieldKey}-${Date.now()}`,
        fieldKey,
        fieldLabel,
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
        uploadedAt: new Date().toISOString(),
        source: 'Manual Portal Upload',
        status: 'Uploaded',
      }
      setDocuments(prev => {
        const filtered = prev.filter(d => d.fieldKey !== fieldKey && d.fieldLabel !== fieldLabel)
        return [...filtered, newDoc]
      })
      setChecklist(prev =>
        prev.map(c => {
          if (
            c.matchedFieldKey === fieldKey ||
            c.docName === fieldLabel ||
            `field-${c.id}` === fieldKey ||
            `chk_field_${c.id}` === fieldKey
          ) {
            return {
              ...c,
              checked: true,
              matchedFieldKey: fieldKey,
              matchedDocumentName: file.name,
            }
          }
          return c
        })
      )
    }
  }

  // Delete document from field
  const handleDeleteDoc = (fieldKey: string) => {
    setDocuments(prev => prev.filter(d => d.fieldKey !== fieldKey && d.id !== fieldKey))
  }

  // Add custom document field
  const handleAddCustomField = () => {
    if (!customFieldLabel.trim()) return
    const newKey = `custom_${Date.now()}`
    const label = `${activePortalFields.length + 1}. ${customFieldLabel.trim()}`
    setCustomFields(prev => [
      ...prev,
      {
        key: newKey,
        label,
        description: 'Custom statutory document uploaded for this portal submission.',
        required: false,
      },
    ])
    setCustomFieldLabel('')
    setShowAddCustom(false)
  }

  // Prepare updated tender payload
  const buildUpdatedTender = (targetStage?: string): Tender => {
    const portalData: PortalUploadData = {
      portalName,
      portalUrl,
      ackNumber: ackNumber.trim(),
      uploadDate,
      documents,
      checklist,
      checklistGeneratedAt: new Date().toISOString(),
      checklistSource: checklistTitle,
      remarks: remarks.trim(),
      completedAt: new Date().toISOString(),
      completedBy: 'Portal Ops',
    }

    return {
      ...tender,
      stage: (targetStage as any) || tender.stage,
      status: targetStage ? 'Ready' : tender.status,
      portalUpload: portalData,
    }
  }

  // Handle Save (Edit mode)
  const handleSave = () => {
    const updated = buildUpdatedTender()
    onSave(updated)
    onClose()
  }

  // Handle Advance to Next Stage (Submit in website)
  const handleAdvance = () => {
    const updated = buildUpdatedTender('Submit in website')
    if (onAdvance) {
      onAdvance(updated)
    } else {
      onSave(updated)
    }
    onClose()
  }

  const handleDownload = async (doc: PortalUploadDocumentItem) => {
    const dataUrl = resolveDocDataUrl(doc)
    if (dataUrl) {
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = doc.name
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      return
    }

    // If it's the official tender notice PDF, download /__convtest/nit.pdf
    if (
      doc.fieldKey === 'tenderNotice' ||
      doc.name?.toLowerCase().includes('tender') ||
      doc.name?.toLowerCase().includes('nit') ||
      doc.name?.toLowerCase().includes('image_tender_document')
    ) {
      try {
        const res = await fetch('/__convtest/nit.pdf')
        if (res.ok) {
          const blob = await res.blob()
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = doc.name
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          URL.revokeObjectURL(url)
          return
        }
      } catch {}
    }

    // If PDF, generate a clean PDF
    if (doc.name.toLowerCase().endsWith('.pdf') || doc.type?.includes('pdf')) {
      const generated = generatePdfDocument(
        doc.fieldLabel || doc.name,
        `# OFFICIAL BID COMPLIANCE DOCUMENT
Document Title: ${doc.fieldLabel || doc.name}
File Name: ${doc.name}
Tender Title: ${tender.title}
Tender ID: ${tender.id}
Authority: ${tender.authority}
Category: ${doc.source || 'Statutory Compliance'}
Uploaded Date: ${new Date(doc.uploadedAt).toLocaleDateString('en-IN')}

## STATUTORY VERIFICATION & COMPLIANCE SUMMARY
This document has been verified against the tender requirements and uploaded for e-bidding portal submission.
All technical parameters, financial declarations, and statutory compliance certifications are hereby attested in accordance with the official tender guidelines.

Tender ID Reference: ${tender.id}
Portal Verification: COMPLIANT & ATTESTED

Authorized Signatory
Tender Operations Department
`
      )
      const a = document.createElement('a')
      a.href = generated.url
      a.download = doc.name
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(generated.url)
      return
    }

    const content = `PORTAL SUBMISSION DOCUMENT
=====================================================
Tender Title : ${tender.title}
Tender ID    : ${tender.id}
Portal Name  : ${portalName}
Ack Number   : ${ackNumber || 'Pending'}
Document     : ${doc.fieldLabel}
File Name    : ${doc.name}
Uploaded At  : ${doc.uploadedAt}
=====================================================
`
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${doc.name}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const getDocForField = (key: string) => {
    return documents.find(d => d.fieldKey === key)
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 md:p-6 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 md:p-6 border-b border-slate-200 bg-slate-50 flex items-start justify-between gap-4 flex-shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-700 bg-blue-100/80 px-2.5 py-0.5 rounded-full">
                STAGE 06 · DOCUMENT UPLOAD IN PORTAL
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 bg-emerald-100/80 px-2.5 py-0.5 rounded-full">
                {documents.length} / {activePortalFields.length} Documents Attached
              </span>
              <span className="text-xs font-semibold text-slate-500">
                Tender ID: <span className="font-mono text-slate-800 font-bold">{tender.id}</span>
              </span>
            </div>
            <h2 className="text-lg md:text-xl font-bold text-slate-900 leading-snug">
              {mode === 'edit' ? 'Edit Portal Upload Submission' : 'Document Upload in portal'}
            </h2>
            <p className="text-xs text-slate-600 mt-1">
              Upload compliance covers, technical bid files, DSC encryption, and pre-submission validation on the portal.
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 md:p-6 space-y-6">
          {/* 1. Portal Submission Header Fields */}
          <div className="border border-blue-200 bg-blue-50/50 rounded-2xl p-4 md:p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-blue-700" />
                Portal Details & Acknowledgment
              </span>
              <span className="text-[11px] text-blue-700 font-medium">
                Mandatory for audit trail & portal verification
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Portal Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  disabled={isViewOnly}
                  value={portalName}
                  onChange={e => setPortalName(e.target.value)}
                  placeholder="e.g. GeM, CPPP (eprocure.gov.in)"
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-500 disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Portal Bid / Acknowledgment No. <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  disabled={isViewOnly}
                  value={ackNumber}
                  onChange={e => setAckNumber(e.target.value)}
                  placeholder="e.g. GEM/2026/B/892182"
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono font-bold text-slate-900 uppercase focus:outline-none focus:border-blue-500 disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Portal Upload Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  disabled={isViewOnly}
                  value={uploadDate}
                  onChange={e => setUploadDate(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-500 disabled:bg-slate-100"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Portal Upload Remarks / DSC Encryption Notes
              </label>
              <input
                type="text"
                disabled={isViewOnly}
                value={remarks}
                onChange={e => setRemarks(e.target.value)}
                placeholder="e.g. All covers encrypted with Class-3 DSC token, hash verified."
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500 disabled:bg-slate-100"
              />
            </div>
          </div>

          {/* Dynamic AI Checklist from Tender PDF */}
          <div className="border border-indigo-200 bg-gradient-to-br from-indigo-50/70 via-white to-blue-50/50 rounded-2xl p-4 md:p-5 shadow-2xs space-y-3.5">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-[10px] font-bold text-indigo-700 bg-indigo-100 border border-indigo-200 px-2 py-0.5 rounded-full flex items-center gap-1 shadow-2xs">
                    <Sparkles className="w-3 h-3 text-indigo-600" /> AI Document Checklist
                  </span>
                  <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                    {checklist.filter(c => c.checked).length} / {checklist.length} Verified & Selected
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                  {checklistTitle}
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Automatically extracted from the uploaded tender PDF. Tick or untick required documents for portal verification.
                </p>
              </div>

              {!isViewOnly && (
                <button
                  type="button"
                  onClick={handleRefreshChecklist}
                  disabled={checklistLoading}
                  className="text-xs font-semibold text-indigo-700 hover:text-indigo-900 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-indigo-200 hover:border-indigo-400 shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                  title="Re-read tender PDF and refresh the checklist with AI"
                >
                  {checklistLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                      <span>Reading PDF...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Re-scan Tender PDF (AI)</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Checklist Items */}
            {checklistLoading && checklist.length === 0 ? (
              <div className="p-8 text-center bg-white/80 rounded-xl border border-indigo-100">
                <Loader2 className="w-7 h-7 text-indigo-600 animate-spin mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-800">Reading Tender PDF &amp; Generating Checklist...</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Scanning pages for "CHECK LIST OF DOCUMENTS TO BE UPLOADED IN THE E-BIDDING PORTAL"...
                </p>
              </div>
            ) : checklist.length > 0 ? (
              <div className="space-y-2 bg-white rounded-xl border border-slate-200 p-2.5 shadow-2xs divide-y divide-slate-100">
                {checklist.map(item => {
                  const matchedDoc =
                    documents.find(
                      d =>
                        (item.matchedFieldKey && d.fieldKey === item.matchedFieldKey) ||
                        (item.matchedDocumentName && d.name === item.matchedDocumentName) ||
                        d.fieldKey === `chk_field_${item.id}` ||
                        d.fieldKey === `field-${item.id}` ||
                        d.fieldLabel === item.docName
                    ) || resolveOrBuildDocForChecklistItem(item, tender, documents)

                  return (
                    <div
                      key={item.id}
                      className={`pt-2.5 first:pt-0 pb-2.5 last:pb-0 px-2 rounded-lg transition-colors flex items-start gap-3 ${
                        item.checked ? 'bg-indigo-50/30' : 'hover:bg-slate-50'
                      }`}
                    >
                      {/* Checkbox */}
                      <button
                        type="button"
                        onClick={() => handleToggleCheck(item.id)}
                        disabled={isViewOnly}
                        className="mt-0.5 flex-shrink-0 cursor-pointer disabled:cursor-default"
                        title={item.checked ? 'Untick document' : 'Tick document'}
                      >
                        {item.checked ? (
                          <CheckSquare className="w-4 h-4 text-indigo-600 fill-indigo-50" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-400 hover:text-slate-600" />
                        )}
                      </button>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            onClick={() => handleToggleCheck(item.id)}
                            className={`text-xs font-bold cursor-pointer select-none ${
                              item.checked ? 'text-slate-900' : 'text-slate-700'
                            }`}
                          >
                            {item.docName}
                          </span>

                          <span
                            className={`text-[10px] font-bold px-2 py-0.2 rounded-full border ${
                              item.isMandatory
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                            }`}
                          >
                            {item.requirement || (item.isMandatory ? 'Mandatory' : 'Conditional')}
                          </span>

                          {item.clauseOrPageRef && (
                            <span className="text-[10px] text-slate-500 font-mono bg-slate-100 px-1.5 py-0.2 rounded">
                              {item.clauseOrPageRef}
                            </span>
                          )}
                        </div>

                        {item.applicableDetails && (
                          <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                            {item.applicableDetails}
                          </p>
                        )}

                        {/* Attached Document Link & Quick Actions - View, Download, Replace ALWAYS AVAILABLE */}
                        <div className="mt-2 flex items-center gap-2 flex-wrap text-[11px]">
                          {/* File badge */}
                          <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 px-2 py-0.5 rounded-md">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                            <span className="font-semibold truncate max-w-[220px]" title={matchedDoc.name}>
                              {matchedDoc.name}
                            </span>
                            {matchedDoc.size ? (
                              <span className="text-[10px] text-emerald-600">({formatFileSize(matchedDoc.size)})</span>
                            ) : null}
                          </div>

                          {/* VIEW BUTTON - Opens PDF/Image in current tab modal lightbox */}
                          <button
                            type="button"
                            onClick={() => setPreviewDoc(matchedDoc)}
                            className="inline-flex items-center gap-1 text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2.5 py-0.5 rounded-md font-bold transition-colors cursor-pointer"
                            title="Open and view document inside current tab"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            View
                          </button>

                          {/* DOWNLOAD BUTTON - Downloads document directly */}
                          <button
                            type="button"
                            onClick={() => handleDownload(matchedDoc)}
                            className="inline-flex items-center gap-1 text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-200 px-2.5 py-0.5 rounded-md font-semibold transition-colors cursor-pointer"
                            title="Download document file"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Download
                          </button>

                          {/* REPLACE / UPLOAD BUTTON */}
                          {!isViewOnly && (
                            <label className="text-[10px] font-semibold text-emerald-700 hover:text-emerald-900 cursor-pointer bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-md inline-flex items-center gap-1 transition-colors">
                              <UploadCloud className="w-3 h-3" />
                              Replace File
                              <input
                                type="file"
                                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,image/*,application/pdf"
                                className="hidden"
                                onChange={e => {
                                  const file = e.target.files?.[0]
                                  if (file) {
                                    const fKey = matchedDoc.fieldKey || item.matchedFieldKey || `chk_field_${item.id}`
                                    handleUploadFile(fKey, item.docName, file)
                                    setChecklist(prev =>
                                      prev.map(c =>
                                        c.id === item.id
                                          ? { ...c, checked: true, matchedFieldKey: fKey, matchedDocumentName: file.name }
                                          : c
                                      )
                                    )
                                  }
                                  e.target.value = ''
                                }}
                              />
                            </label>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : null}
          </div>

          {/* 2. Document Upload Checklist Fields - DYNAMIC COUNT MATCHING CHECKLIST */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <FileCheck2 className="w-4 h-4 text-emerald-600" />
                  Portal Upload Document Fields ({activePortalFields.length})
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Statutory document upload fields matching tender checklist requirements. Verify or replace files before portal submission.
                </p>
              </div>

              {!isViewOnly && (
                <button
                  type="button"
                  onClick={() => setShowAddCustom(true)}
                  className="text-xs font-semibold text-blue-700 hover:text-blue-900 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Additional Field
                </button>
              )}
            </div>

            {/* Document Fields List */}
            <div className="space-y-3">
              {activePortalFields.map(field => {
                const attached =
                  documents.find(
                    d =>
                      d.fieldKey === field.key ||
                      (field.checklistItemId && (d.fieldKey === `chk_field_${field.checklistItemId}` || d.fieldKey === `field-${field.checklistItemId}`)) ||
                      d.fieldLabel === field.label
                  ) || getDocForField(field.key)

                return (
                  <div
                    key={field.key}
                    className="border border-slate-200 rounded-xl p-3.5 bg-white hover:border-slate-300 transition-all flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-2xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <strong className="text-xs font-bold text-slate-900">
                          {field.label}
                        </strong>
                        {field.required && (
                          <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.2 rounded">
                            Required
                          </span>
                        )}
                        {field.clauseOrPageRef && (
                          <span className="text-[10px] text-slate-500 font-mono bg-slate-100 px-1.5 py-0.2 rounded">
                            {field.clauseOrPageRef}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">{field.description}</p>

                      {attached && (
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-bold text-[10px] font-mono">
                            {attached.name.split('.').pop()?.toUpperCase() || 'FILE'}
                          </span>
                          <span className="text-xs font-semibold text-slate-800 font-mono truncate max-w-[280px]" title={attached.name}>
                            {attached.name}
                          </span>
                          {attached.size && (
                            <span className="text-[10px] text-slate-400">
                              ({formatFileSize(attached.size)})
                            </span>
                          )}
                          <span className="text-[10px] text-emerald-700 font-medium bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                            ✔ {attached.source || 'Uploaded'}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Actions: View / Download / Replace / Remove */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {attached ? (
                        <>
                          <button
                            type="button"
                            onClick={() => setPreviewDoc(attached)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                            title="Open and view document inside current tab"
                          >
                            <Eye className="w-3.5 h-3.5" /> View
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDownload(attached)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors cursor-pointer"
                            title="Download document file"
                          >
                            <Download className="w-3.5 h-3.5" /> Download
                          </button>

                          {!isViewOnly && (
                            <>
                              <label className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors cursor-pointer border border-amber-200">
                                <Pencil className="w-3.5 h-3.5" /> Replace
                                <input
                                  type="file"
                                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                                  className="hidden"
                                  onChange={e => {
                                    const file = e.target.files?.[0]
                                    if (file) handleUploadFile(field.key, field.label, file)
                                    e.target.value = ''
                                  }}
                                />
                              </label>

                              <button
                                type="button"
                                onClick={() => handleDeleteDoc(field.key)}
                                className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg transition-colors cursor-pointer"
                                title="Remove file"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </>
                      ) : !isViewOnly ? (
                        <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg cursor-pointer transition-all shadow-sm">
                          <UploadCloud className="w-3.5 h-3.5" />
                          <span>Upload File</span>
                          <input
                            type="file"
                            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                            className="hidden"
                            onChange={e => {
                              const file = e.target.files?.[0]
                              if (file) handleUploadFile(field.key, field.label, file)
                              e.target.value = ''
                            }}
                          />
                        </label>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Not Uploaded</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 md:p-5 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3 flex-shrink-0 flex-wrap">
          <div className="text-xs text-slate-600 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>
              {documents.length} of {activePortalFields.length} documents uploaded.
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="secondary-button text-xs py-2 px-4"
            >
              {isViewOnly ? 'Close' : 'Cancel'}
            </button>

            {!isViewOnly && (
              <>
                <button
                  type="button"
                  onClick={handleSave}
                  className="secondary-button text-xs py-2 px-4 flex items-center gap-1.5 font-bold"
                >
                  <Save className="w-4 h-4" />
                  Save Changes
                </button>

                <button
                  type="button"
                  onClick={handleAdvance}
                  className="primary-button text-xs py-2 px-4 shadow-sm"
                >
                  Confirm Upload & Advance to Next Stage (Submit in website)
                  <ArrowRight className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Add Custom Field Dialog */}
      {showAddCustom && (
        <div className="fixed inset-0 z-60 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-sm w-full p-5">
            <h4 className="text-sm font-bold text-slate-900 mb-1">Add Custom Portal Document Field</h4>
            <p className="text-xs text-slate-500 mb-3">Enter the name of the statutory field required by the portal.</p>
            <input
              type="text"
              value={customFieldLabel}
              onChange={e => setCustomFieldLabel(e.target.value)}
              placeholder="e.g. Site Visit Certificate / Integrity Pact"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500 mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddCustom(false)}
                className="secondary-button text-xs py-1.5 px-3"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddCustomField}
                className="primary-button text-xs py-1.5 px-3"
              >
                Add Field
              </button>
            </div>
          </div>
        </div>
      )}

      {/* File Preview Lightbox (Rendered directly in current tab) */}
      {previewDoc && (
        <div className="fixed inset-0 z-60 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-3 md:p-5">
          <div
            className={`bg-white rounded-2xl shadow-2xl border border-slate-200 w-full flex flex-col overflow-hidden transition-all duration-200 ${
              isMaximized ? 'w-[98vw] h-[96vh] max-w-none' : 'max-w-4xl h-[86vh]'
            }`}
          >
            {/* Lightbox Header */}
            <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block">
                  {previewDoc.fieldLabel}
                </span>
                <h4 className="text-sm md:text-base font-bold text-slate-900 truncate" title={previewDoc.name}>
                  {previewDoc.name}
                </h4>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setIsMaximized(m => !m)}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200 transition-colors cursor-pointer"
                  title={isMaximized ? 'Restore View' : 'Maximize in Current Tab'}
                >
                  {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (activeViewUrl) {
                      const a = document.createElement('a')
                      a.href = activeViewUrl
                      a.download = previewDoc.name
                      document.body.appendChild(a)
                      a.click()
                      document.body.removeChild(a)
                    } else {
                      handleDownload(previewDoc)
                    }
                  }}
                  className="secondary-button text-xs py-1.5 px-3 flex items-center gap-1.5 cursor-pointer"
                  title="Download document file"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Download</span>
                </button>
                <button
                  onClick={() => setPreviewDoc(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
                  title="Close Preview (Esc)"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Lightbox Content: Native PDF / Image Viewer inside Current Tab */}
            <div className="flex-1 overflow-hidden p-2 md:p-3 bg-slate-100 flex flex-col">
              {activeViewType === 'loading' ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-slate-500">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-3" />
                  <span className="text-xs font-semibold text-slate-700">
                    Loading and rendering document in current tab...
                  </span>
                  <span className="text-[11px] text-slate-400 mt-1 font-mono">
                    {previewDoc.name}
                  </span>
                </div>
              ) : activeViewType === 'image' && activeViewUrl ? (
                <div className="flex-1 flex items-center justify-center p-4 overflow-auto bg-slate-100">
                  <img
                    src={activeViewUrl}
                    alt={previewDoc.name}
                    className="max-h-[78vh] max-w-full rounded-lg shadow-md border border-slate-200 object-contain bg-white"
                  />
                </div>
              ) : activeViewUrl ? (
                <div className="w-full h-full rounded-xl overflow-hidden border border-slate-200 bg-white shadow-sm flex flex-col">
                  <iframe
                    src={activeViewUrl}
                    title={previewDoc.name}
                    className="w-full h-full border-0 rounded-xl"
                  />
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-slate-500">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-3" />
                  <span className="text-xs font-semibold">Opening document...</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
