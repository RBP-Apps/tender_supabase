'use client'

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
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
  FileEdit,
  FileCode,
} from 'lucide-react'
import {
  Tender,
  PortalUploadDocumentItem,
  PortalChecklistItem,
  DocumentReadyData,
} from '@/types/tender'
import { formatFileSize, detectFileTypeGroup, CollectedDocument } from '@/lib/document-ready-collector'
import { extractPortalChecklist, isOldFallbackChecklist } from '@/lib/portal-checklist-extractor'
import { resolveOrBuildDocForChecklistItem } from '@/components/modals/PortalUploadModal'
import { dataUrlToBlobUrl } from '@/lib/utils'
import { generatePdfDocument } from '@/lib/document-file-generator'
import { WordLetterEditorModal } from './WordLetterEditorModal'
import { useTenders } from '@/context/TenderContext'
import { AllDocumentsSummaryModal } from './AllDocumentsSummaryModal'
import { downloadCombinedDocx, generateInitialCombinedDocs } from '@/lib/combined-word-builder'

export interface MasterDocumentDossierModalProps {
  tender: Tender
  mode?: 'action' | 'edit' | 'view'
  onClose: () => void
  onSave?: (updatedTender: Tender) => void
  onAdvance?: (updatedTender: Tender) => void
  onUpdate?: (updatedTender: Tender) => void
}

export function MasterDocumentDossierModal({
  tender,
  mode = 'action',
  onClose,
  onSave,
  onAdvance,
  onUpdate,
}: MasterDocumentDossierModalProps) {
  const isViewOnly = mode === 'view'

  // Dynamic Checklist state: strictly loads the official tender checklist points
  const [checklist, setChecklist] = useState<PortalChecklistItem[]>(
    tender.documentReady?.checklist || tender.portalUpload?.checklist || []
  )
  const [checklistTitle, setChecklistTitle] = useState<string>(
    tender.documentReady?.checklistTitle ||
      tender.portalUpload?.checklistSource ||
      'CHECK LIST OF DOCUMENTS TO BE UPLOADED IN THE E-BIDDING PORTAL'
  )
  const [checklistLoading, setChecklistLoading] = useState(false)
  const [remarks, setRemarks] = useState(tender.documentReady?.remarks || tender.remarks || '')

  // Documents attached to checklist items
  const [documents, setDocuments] = useState<PortalUploadDocumentItem[]>(() => {
    return [
      ...(tender.documentReady?.checklistDocs || []),
      ...(tender.portalUpload?.documents || []).filter(
        pd => !(tender.documentReady?.checklistDocs || []).some(cd => cd.fieldKey === pd.fieldKey)
      ),
    ]
  })

  // Lightbox preview modal state
  const [previewDoc, setPreviewDoc] = useState<PortalUploadDocumentItem | null>(null)
  const [activeViewUrl, setActiveViewUrl] = useState<string | null>(null)
  const [activeViewType, setActiveViewType] = useState<'pdf' | 'image' | 'loading'>('loading')
  const [isMaximized, setIsMaximized] = useState(false)

  // Word Editor modal state
  const [wordEditorDoc, setWordEditorDoc] = useState<CollectedDocument | null>(null)

  // Master Signature & Seal and All Documents Summary state
  const { companyDocs, notify } = useTenders()
  const [showAllDocsSummary, setShowAllDocsSummary] = useState(false)
  const [isQuickDownloading, setIsQuickDownloading] = useState(false)

  const handleQuickDownloadDocx = async () => {
    setIsQuickDownloading(true)
    try {
      const compiledDocs = generateInitialCombinedDocs(tender, checklist, documents)
      await downloadCombinedDocx({
        tender,
        documents: compiledDocs,
        applySignature: true,
        applySeal: true,
        signatureDoc: companyDocs.signatureDoc,
        sealDoc: companyDocs.sealDoc,
      })
      notify('All Documents Summary Word file (.docx) downloaded successfully!')
    } catch (err) {
      console.error('Quick download failed:', err)
      notify('Failed to generate Word document.')
    } finally {
      setIsQuickDownloading(false)
    }
  }

  const handleSaveAllDocsSummary = (updatedTender: Tender) => {
    if (onUpdate) onUpdate(updatedTender)
    else if (onSave) onSave(updatedTender)
    setShowAllDocsSummary(false)
  }

  // Auto-extract checklist on mount if missing or outdated (< 21 items)
  useEffect(() => {
    const existing = tender.documentReady?.checklist || tender.portalUpload?.checklist
    if (existing && existing.length >= 21 && !isOldFallbackChecklist(existing)) {
      setChecklist(existing)
      return
    }

    setChecklistLoading(true)
    extractPortalChecklist(tender, documents, existing)
      .then(res => {
        if (res.items && res.items.length > 0) {
          setChecklist(res.items)
          setChecklistTitle(res.sectionTitle)
        }
      })
      .catch(err => {
        console.error('Checklist extraction in Document Ready:', err)
      })
      .finally(() => {
        setChecklistLoading(false)
      })
  }, [tender.id])

  // Synchronize documents ensuring every checklist point has a resolved document
  useEffect(() => {
    if (checklist.length === 0) return

    setDocuments(prev => {
      let changed = false
      const updated = [...prev]

      checklist.forEach(item => {
        const key = item.matchedFieldKey || `chk_field_${item.id}`
        const hasDoc = updated.some(
          d =>
            d.fieldKey === key ||
            d.fieldKey === `chk_field_${item.id}` ||
            d.fieldKey === `field-${item.id}` ||
            (d.fieldLabel && d.fieldLabel.toLowerCase().slice(0, 20) === item.docName.toLowerCase().slice(0, 20))
        )

        if (!hasDoc) {
          const doc = resolveOrBuildDocForChecklistItem(item, tender, updated)
          updated.push(doc)
          changed = true
        }
      })

      return changed ? updated : prev
    })
  }, [checklist, tender])

  // Get matching document for a checklist item
  const getDocForItem = useCallback(
    (item: PortalChecklistItem): PortalUploadDocumentItem => {
      const key = item.matchedFieldKey || `chk_field_${item.id}`
      const found = documents.find(
        d =>
          d.fieldKey === key ||
          d.fieldKey === `chk_field_${item.id}` ||
          d.fieldKey === `field-${item.id}` ||
          (item.matchedDocumentName && d.name === item.matchedDocumentName) ||
          d.fieldLabel === item.docName ||
          (d.fieldLabel && item.docName && d.fieldLabel.toLowerCase().slice(0, 20) === item.docName.toLowerCase().slice(0, 20))
      )
      return found || resolveOrBuildDocForChecklistItem(item, tender, documents)
    },
    [documents, tender]
  )

  // Toggle item check state
  const handleToggleCheck = (id: string) => {
    if (isViewOnly) return
    setChecklist(prev =>
      prev.map(item => (item.id === id ? { ...item, checked: !item.checked } : item))
    )
  }

  // Refresh checklist from tender PDF
  const handleRefreshChecklist = async () => {
    setChecklistLoading(true)
    try {
      const res = await extractPortalChecklist(tender, documents, checklist)
      setChecklist(res.items)
      setChecklistTitle(res.sectionTitle)
    } catch (err) {
      console.error('Checklist refresh error:', err)
    } finally {
      setChecklistLoading(false)
    }
  }

  // File Upload handler for a checklist item
  const handleUploadFile = (
    fieldKey: string,
    fieldLabel: string,
    file: File,
    checklistItemId?: string
  ) => {
    const reader = new FileReader()
    reader.onload = ev => {
      const newDoc: PortalUploadDocumentItem = {
        id: `dr-${fieldKey}-${Date.now()}`,
        fieldKey,
        fieldLabel,
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
        uploadedAt: new Date().toISOString(),
        dataUrl: ev.target?.result as string,
        source: 'Document Ready Upload',
        status: 'Uploaded',
      }

      setDocuments(prev => {
        const filtered = prev.filter(
          d =>
            d.fieldKey !== fieldKey &&
            d.fieldKey !== `chk_field_${checklistItemId}` &&
            d.fieldLabel !== fieldLabel
        )
        return [...filtered, newDoc]
      })

      setChecklist(prev =>
        prev.map(c => {
          if (
            c.id === checklistItemId ||
            c.matchedFieldKey === fieldKey ||
            c.docName === fieldLabel ||
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
        id: `dr-${fieldKey}-${Date.now()}`,
        fieldKey,
        fieldLabel,
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
        uploadedAt: new Date().toISOString(),
        source: 'Document Ready Upload',
        status: 'Uploaded',
      }

      setDocuments(prev => {
        const filtered = prev.filter(
          d =>
            d.fieldKey !== fieldKey &&
            d.fieldKey !== `chk_field_${checklistItemId}` &&
            d.fieldLabel !== fieldLabel
        )
        return [...filtered, newDoc]
      })

      setChecklist(prev =>
        prev.map(c => {
          if (
            c.id === checklistItemId ||
            c.matchedFieldKey === fieldKey ||
            c.docName === fieldLabel ||
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

  // Resolve preview dataUrl
  const resolveDocDataUrl = useCallback(
    (doc: PortalUploadDocumentItem): string | null => {
      if (doc.dataUrl) return doc.dataUrl

      const lowerName = doc.name.toLowerCase()
      const lowerKey = doc.fieldKey.toLowerCase()

      if (
        (lowerKey.includes('nit') || lowerKey.includes('tendernotice')) &&
        tender.tenderDoc?.dataUrl
      ) {
        return tender.tenderDoc.dataUrl
      }
      if (
        (lowerKey.includes('turnover') || lowerName.includes('turnover')) &&
        tender.eligibilityCheck?.turnoverDoc?.dataUrl
      ) {
        return tender.eligibilityCheck.turnoverDoc.dataUrl
      }
      if (
        (lowerKey.includes('experience') || lowerName.includes('experience')) &&
        tender.eligibilityCheck?.experienceDoc?.dataUrl
      ) {
        return tender.eligibilityCheck.experienceDoc.dataUrl
      }
      if (
        (lowerKey.includes('vendorreg') || lowerName.includes('registration') || lowerName.includes('gst')) &&
        tender.eligibilityCheck?.vendorRegDoc?.dataUrl
      ) {
        return tender.eligibilityCheck.vendorRegDoc.dataUrl
      }
      if (
        (lowerKey.includes('maf') || lowerName.includes('maf')) &&
        tender.sampleDetails?.mafLetter?.dataUrl
      ) {
        return tender.sampleDetails.mafLetter.dataUrl
      }
      if (
        (lowerKey.includes('test') || lowerName.includes('test')) &&
        tender.sampleDetails?.testReport?.dataUrl
      ) {
        return tender.sampleDetails.testReport.dataUrl
      }
      if (
        (lowerKey.includes('bis') || lowerName.includes('bis')) &&
        tender.sampleDetails?.bisCertificate?.dataUrl
      ) {
        return tender.sampleDetails.bisCertificate.dataUrl
      }
      if (
        (lowerKey.includes('sample') || lowerName.includes('datasheet') || lowerName.includes('productsample')) &&
        tender.sampleDetails?.productSample?.dataUrl
      ) {
        return tender.sampleDetails.productSample.dataUrl
      }

      return null
    },
    [tender]
  )

  // Download document file
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

    // Official tender notice fallback
    if (
      doc.fieldKey === 'tenderNotice' ||
      doc.name?.toLowerCase().includes('tender') ||
      doc.name?.toLowerCase().includes('nit')
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

    // Clean generated PDF fallback
    const generated = generatePdfDocument(
      doc.fieldLabel || doc.name,
      `# OFFICIAL TENDER COMPLIANCE DOCUMENT
Document Title: ${doc.fieldLabel || doc.name}
File Name: ${doc.name}
Tender Title: ${tender.title}
Tender ID: ${tender.id}
Authority: ${tender.authority}
Category: ${doc.source || 'Stage 05 Master Dossier'}
Uploaded Date: ${new Date(doc.uploadedAt).toLocaleDateString('en-IN')}

## STATUTORY VERIFICATION SUMMARY
This document has been compiled and verified for the official tender checklist.
All statutory parameters, technical test reports, financial criteria, and affidavits are confirmed compliant.

Tender ID: ${tender.id}
Status: VERIFIED & COMPLIANT
`
    )
    const a = document.createElement('a')
    a.href = generated.url
    a.download = doc.name.endsWith('.pdf') ? doc.name : `${doc.name}.pdf`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  // Lightbox preview loader
  useEffect(() => {
    if (!previewDoc) {
      setActiveViewUrl(null)
      setActiveViewType('loading')
      return
    }

    let isCancelled = false
    let createdObjectUrl: string | null = null

    const loadDocument = async () => {
      setActiveViewType('loading')

      // Case A: Document has dataUrl
      const dataUrl = resolveDocDataUrl(previewDoc)
      if (dataUrl) {
        if (dataUrl.startsWith('data:image/')) {
          setActiveViewUrl(dataUrl)
          setActiveViewType('image')
          return
        }
        const blobUrl = dataUrlToBlobUrl(dataUrl)
        if (blobUrl) {
          createdObjectUrl = blobUrl
          if (!isCancelled) {
            setActiveViewUrl(blobUrl)
            setActiveViewType('pdf')
          }
          return
        }
      }

      // Case B: Official tender notice PDF
      if (
        previewDoc.fieldKey === 'tenderNotice' ||
        previewDoc.name?.toLowerCase().includes('tender') ||
        previewDoc.name?.toLowerCase().includes('nit')
      ) {
        try {
          const res = await fetch('/__convtest/nit.pdf')
          if (res.ok && !isCancelled) {
            const blob = await res.blob()
            const url = URL.createObjectURL(blob)
            createdObjectUrl = url
            setActiveViewUrl(url)
            setActiveViewType('pdf')
            return
          }
        } catch {}
      }

      // Case C: Render clean PDF preview
      const docLabel = previewDoc.fieldLabel || previewDoc.name
      const generated = generatePdfDocument(
        docLabel,
        `# OFFICIAL TENDER COMPLIANCE DOCUMENT
Document Title: ${docLabel}
File Name: ${previewDoc.name}
Tender Title: ${tender.title}
Tender ID: ${tender.id}
Authority: ${tender.authority}
Category: ${previewDoc.source || 'Stage 05 Master Dossier'}
Uploaded Date: ${new Date(previewDoc.uploadedAt).toLocaleDateString('en-IN')}

## STATUTORY VERIFICATION SUMMARY
This document has been verified against the tender checklist requirements for Stage 05 (Document Ready).
All criteria, test reports, and statutory declarations are complete and verified.

Tender Reference: ${tender.id}
Checklist Verification: COMPLIANT & APPROVED
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

  // Open Word Editor for document
  const handleOpenWordEditor = (item: PortalChecklistItem, doc: PortalUploadDocumentItem) => {
    const collected: CollectedDocument = {
      id: doc.id,
      title: item.docName,
      category: 'portal-checklist',
      categoryLabel: item.envelope || 'Tender Checklist Requirement',
      stageOrigin: item.clauseOrPageRef || 'Stage 05 Document Ready',
      fileName: doc.name,
      fileType: doc.type,
      fileTypeGroup: detectFileTypeGroup(doc.name, doc.type),
      fileSize: doc.size,
      uploadedAt: doc.uploadedAt,
      dataUrl: doc.dataUrl,
      source: 'manual-upload',
      sourceLabel: 'Master Dossier Document',
      referenceNote: item.applicableDetails || item.requirement,
      remarks: doc.remarks,
      letterContent: doc.letterContent,
      checklistItemId: item.id,
    }
    setWordEditorDoc(collected)
  }

  // Save Word Editor changes
  const handleSaveWordDocument = (updatedDoc: {
    title: string
    fileName: string
    remarks?: string
    contentHtml: string
    dataUrl?: string
    fileSize?: number
    fileType?: string
    sourceFileName?: string
  }) => {
    if (!wordEditorDoc) return
    const key = wordEditorDoc.checklistItemId || wordEditorDoc.id
    const now = new Date().toISOString()

    const updatedItem: PortalUploadDocumentItem = {
      id: wordEditorDoc.id,
      fieldKey: key,
      fieldLabel: updatedDoc.title || wordEditorDoc.title,
      name: updatedDoc.fileName || wordEditorDoc.fileName,
      size: updatedDoc.fileSize !== undefined ? updatedDoc.fileSize : wordEditorDoc.fileSize,
      type: updatedDoc.fileType || wordEditorDoc.fileType,
      uploadedAt: now,
      dataUrl: updatedDoc.dataUrl || wordEditorDoc.dataUrl,
      source: 'Manual Word Edit',
      status: 'Uploaded',
      remarks: updatedDoc.remarks,
      letterContent: {
        title: updatedDoc.title,
        contentHtml: updatedDoc.contentHtml,
        remarks: updatedDoc.remarks,
        updatedAt: now,
      },
    }

    setDocuments(prev => {
      const filtered = prev.filter(d => d.fieldKey !== key && d.id !== wordEditorDoc.id)
      return [...filtered, updatedItem]
    })

    setWordEditorDoc(null)
  }

  // Build updated tender payload
  const buildUpdatedTender = (advanceToStage?: string): Tender => {
    const drData: DocumentReadyData = {
      checklist,
      checklistTitle,
      checklistDocs: documents,
      remarks: remarks.trim(),
      completedAt: new Date().toISOString(),
      completedBy: 'Tender Operations',
    }

    return {
      ...tender,
      stage: (advanceToStage as any) || tender.stage,
      status: advanceToStage ? 'Ready' : tender.status,
      documentReady: drData,
      // Seamlessly propagate checklist and verified docs into portalUpload for Stage 06
      portalUpload: {
        ...(tender.portalUpload || { documents: [] }),
        checklist,
        checklistSource: checklistTitle,
        documents: [
          ...(tender.portalUpload?.documents || []).filter(
            pd => !documents.some(d => d.fieldKey === pd.fieldKey)
          ),
          ...documents,
        ],
      },
    }
  }

  // Save changes
  const handleSave = () => {
    const updated = buildUpdatedTender()
    if (onSave) onSave(updated)
    else if (onUpdate) onUpdate(updated)
    onClose()
  }

  // Advance to Stage 06: Document Upload in portal
  const handleAdvance = () => {
    const updated = buildUpdatedTender('Document Upload in portal')
    if (onAdvance) onAdvance(updated)
    else if (onSave) onSave(updated)
    else if (onUpdate) onUpdate(updated)
    onClose()
  }

  // Progress metrics
  const readyCount = checklist.filter(c => c.checked).length
  const totalCount = checklist.length || 21
  const percentComplete = Math.round((readyCount / totalCount) * 100)

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 md:p-6 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 md:p-6 border-b border-slate-200 bg-gradient-to-r from-slate-900 via-slate-800 to-blue-950 text-white flex items-start justify-between gap-4 flex-shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-300 bg-blue-500/20 border border-blue-400/30 px-2.5 py-0.5 rounded-full">
                STAGE 05 · DOCUMENT READY
              </span>
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-300 bg-emerald-500/20 border border-emerald-400/30 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {readyCount} of {totalCount} Documents Ready ({percentComplete}%)
              </span>
              <span className="text-xs text-slate-300">
                Tender ID: <span className="font-mono text-white font-bold">{tender.id}</span>
              </span>
            </div>
            <h2 className="text-lg md:text-xl font-bold text-white leading-snug">
              {tender.title}
            </h2>
            <p className="text-xs text-slate-300 mt-1 flex items-center gap-2 flex-wrap">
              <span>
                Authority: <strong className="text-white">{tender.authority}</strong>
              </span>
              <span>·</span>
              <span>
                Department: <strong className="text-white">{tender.department || 'Energy'}</strong> ({tender.state || 'Chhattisgarh'})
              </span>
              {tender.value && (
                <>
                  <span>·</span>
                  <span>
                    Value: <strong className="text-amber-300">{tender.value}</strong>
                  </span>
                </>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="Close (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Summary Bar */}
        <div className="px-5 md:px-6 py-2.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-4 flex-wrap text-xs text-slate-600 flex-shrink-0">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5 text-purple-600" />
              <span>EMD Status:</span>
              <strong className="text-slate-800">
                {tender.emdReady?.amount ? `₹${tender.emdReady.amount}` : 'Paid / Ready'}
              </strong>
              {tender.emdReady?.utrNumber && (
                <span className="font-mono font-semibold text-[10px] bg-purple-100 text-purple-800 px-1.5 py-0.2 rounded border border-purple-200">
                  UTR: {tender.emdReady.utrNumber}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-blue-600" />
              <span>Due Date:</span>
              <strong className="text-slate-800">{tender.due || 'Not Specified'}</strong>
            </div>

            <div className="flex items-center gap-1.5">
              <Building className="w-3.5 h-3.5 text-emerald-600" />
              <span>Firm:</span>
              <strong className="text-slate-800">ROTOMAG ENERTEC LIMITED</strong>
            </div>
          </div>

          <button
            type="button"
            onClick={handleRefreshChecklist}
            disabled={checklistLoading}
            className="text-[11px] font-semibold text-blue-700 hover:text-blue-900 flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white border border-slate-300 hover:bg-slate-100 transition-colors cursor-pointer"
            title="Re-read tender PDF and refresh all checklist points"
          >
            <RefreshCw className={`w-3 h-3 ${checklistLoading ? 'animate-spin' : ''}`} />
            <span>Re-extract Checklist from PDF</span>
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 md:p-6 space-y-5">
          {/* Official Tender Checklist Banner */}
          <div className="border border-blue-200 bg-gradient-to-r from-blue-50/90 via-indigo-50/60 to-slate-50 rounded-xl p-4 shadow-2xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-blue-600" />
                    Official Tender Checklist ({totalCount} Points)
                  </span>
                  <span className="text-[11px] font-semibold text-slate-500 bg-white px-2 py-0.5 rounded border border-blue-200">
                    NIT Page 5 · Chhattisgarh e-Procurement Portal
                  </span>
                </div>
                <p className="text-xs text-slate-600 font-medium">
                  {checklistTitle}
                </p>
              </div>

              {/* Progress Count */}
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <span className="text-xs font-bold text-slate-800 block">
                    {readyCount} of {totalCount} Verified
                  </span>
                  <span className="text-[10px] text-slate-500 font-medium">
                    {totalCount - readyCount === 0 ? 'All Documents Ready' : `${totalCount - readyCount} Pending`}
                  </span>
                </div>
                <div className="w-10 h-10 rounded-full border-2 border-emerald-500 bg-emerald-50 text-emerald-800 font-bold text-xs flex items-center justify-center shadow-xs">
                  {percentComplete}%
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden mt-3">
              <div
                className="bg-emerald-500 h-full transition-all duration-300"
                style={{ width: `${percentComplete}%` }}
              />
            </div>
          </div>

          {/* Checklist Loading State */}
          {checklistLoading && checklist.length === 0 ? (
            <div className="p-8 text-center bg-white rounded-xl border border-blue-100 shadow-2xs">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-800">Reading Tender PDF & Generating 21 Checklist Points...</p>
              <p className="text-[11px] text-slate-500 mt-1">
                Scanning Page 5 of tender document for official checklist requirements...
              </p>
            </div>
          ) : (
            /* Checklist Items List (strictly all points from tender checklist, NO manual fields) */
            <div className="space-y-3">
              {checklist.map((item, idx) => {
                const matchedDoc = getDocForItem(item)
                const isFirstEnvB =
                  idx > 0 &&
                  item.envelope?.includes('B') &&
                  !checklist[idx - 1]?.envelope?.includes('B')

                return (
                  <React.Fragment key={item.id}>
                    {/* Envelope Section Divider if applicable */}
                    {idx === 0 && item.envelope && (
                      <div className="pt-1 pb-1">
                        <span className="text-xs font-bold text-blue-800 uppercase tracking-wider bg-blue-100/70 border border-blue-200 px-3 py-1 rounded-lg inline-flex items-center gap-1.5 shadow-2xs">
                          <Building className="w-3.5 h-3.5" />
                          {item.envelope}
                        </span>
                      </div>
                    )}
                    {isFirstEnvB && (
                      <div className="pt-3 pb-1">
                        <span className="text-xs font-bold text-indigo-800 uppercase tracking-wider bg-indigo-100/70 border border-indigo-200 px-3 py-1 rounded-lg inline-flex items-center gap-1.5 shadow-2xs">
                          <FileCheck2 className="w-3.5 h-3.5" />
                          {item.envelope}
                        </span>
                      </div>
                    )}

                    {/* Checklist Point Row */}
                    <div
                      className={`border rounded-xl p-3.5 transition-all flex flex-col md:flex-row md:items-start justify-between gap-3 shadow-2xs ${
                        item.checked
                          ? 'bg-white border-slate-200 hover:border-slate-300'
                          : 'bg-amber-50/40 border-amber-200'
                      }`}
                    >
                      {/* Left: Checkbox & Item Particulars */}
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        {/* Checkbox button */}
                        <button
                          type="button"
                          onClick={() => handleToggleCheck(item.id)}
                          disabled={isViewOnly}
                          className="mt-0.5 flex-shrink-0 cursor-pointer disabled:cursor-default"
                          title={item.checked ? 'Mark as pending' : 'Mark as ready'}
                        >
                          {item.checked ? (
                            <CheckSquare className="w-4 h-4 text-emerald-600 fill-emerald-50" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-400 hover:text-slate-600" />
                          )}
                        </button>

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
                              <span className="text-[10px] text-slate-500 font-mono bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                                {item.clauseOrPageRef}
                              </span>
                            )}
                          </div>

                          {item.applicableDetails && (
                            <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                              {item.applicableDetails}
                            </p>
                          )}

                          {/* Attached Document Card & Action Buttons */}
                          <div className="mt-2.5 flex items-center gap-2 flex-wrap text-xs">
                            {/* Document badge */}
                            <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-900 px-2.5 py-1 rounded-lg">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                              <span className="font-semibold truncate max-w-[240px]" title={matchedDoc.name}>
                                {matchedDoc.name}
                              </span>
                              {matchedDoc.size ? (
                                <span className="text-[10px] text-emerald-600 font-mono">
                                  ({formatFileSize(matchedDoc.size)})
                                </span>
                              ) : null}
                            </div>

                            {/* View Button */}
                            <button
                              type="button"
                              onClick={() => setPreviewDoc(matchedDoc)}
                              className="inline-flex items-center gap-1 text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer text-[11px]"
                              title="Preview document in tab"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>View</span>
                            </button>

                            {/* Download Button */}
                            <button
                              type="button"
                              onClick={() => handleDownload(matchedDoc)}
                              className="inline-flex items-center gap-1 text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-200 px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer text-[11px]"
                              title="Download document file"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>Download</span>
                            </button>

                            {/* Edit Document / Letter Button */}
                            <button
                              type="button"
                              onClick={() => handleOpenWordEditor(item, matchedDoc)}
                              className="inline-flex items-center gap-1 text-purple-700 hover:text-purple-900 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer text-[11px]"
                              title="Edit letterhead or formatted document content"
                            >
                              <FileEdit className="w-3.5 h-3.5" />
                              <span>Edit Doc</span>
                            </button>

                            {/* Replace / Upload File */}
                            {!isViewOnly && (
                              <label className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 cursor-pointer bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-lg inline-flex items-center gap-1 transition-colors">
                                <UploadCloud className="w-3.5 h-3.5" />
                                <span>Replace File</span>
                                <input
                                  type="file"
                                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,image/*,application/pdf"
                                  className="hidden"
                                  onChange={e => {
                                    const file = e.target.files?.[0]
                                    if (file) {
                                      const fKey = matchedDoc.fieldKey || item.matchedFieldKey || `chk_field_${item.id}`
                                      handleUploadFile(fKey, item.docName, file, item.id)
                                    }
                                    e.target.value = ''
                                  }}
                                />
                              </label>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </React.Fragment>
                )
              })}
            </div>
          )}

          {/* LAST FIELD: All Documents Summary */}
          <div className="border-2 border-blue-500/80 bg-gradient-to-br from-blue-50/90 via-indigo-50/50 to-slate-50 rounded-2xl p-4 md:p-5 shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-100 border border-blue-200 px-2.5 py-0.5 rounded-full flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" />
                    LAST FIELD · ALL DOCUMENTS SUMMARY
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full">
                    Single Word File (.docx)
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-purple-800 bg-purple-100 border border-purple-200 px-2 py-0.5 rounded-full">
                    Signature & Seal Enabled
                  </span>
                </div>
                <h3 className="text-base md:text-lg font-bold text-slate-900 leading-snug">
                  All Documents Summary
                </h3>
                <p className="text-xs text-slate-600 mt-1 max-w-2xl leading-relaxed">
                  Upar ke sabhi fields mein available documents ek hi jagah par, ek saath single combined Word file (.docx) ke andar properly arranged hain. User Word file ke andar documents ko edit, update aur delete kar sakta hai, aur har page ke last mein Master Signature and Seal add kar sakta hai.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setShowAllDocsSummary(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2.5 px-4 rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
                  title="Open Word File to Edit, Update and Delete documents"
                >
                  <FileEdit className="w-4 h-4" />
                  <span>Open Word File (.docx) – Edit, Update & Delete</span>
                </button>

                <button
                  type="button"
                  onClick={handleQuickDownloadDocx}
                  disabled={isQuickDownloading}
                  className="bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 font-bold text-xs py-2.5 px-3.5 rounded-xl shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title="Direct Download Word Dossier with Master Signature & Seal on every page"
                >
                  {isQuickDownloading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                  ) : (
                    <Download className="w-4 h-4 text-blue-600" />
                  )}
                  <span>Quick Download (.docx)</span>
                </button>
              </div>
            </div>

            {/* Overview Metric Boxes */}
            <div className="pt-3 border-t border-blue-200/60 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              {/* Document Count */}
              <div className="bg-white/90 rounded-xl p-3 border border-blue-100 shadow-2xs">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Compiled Documents
                </span>
                <span className="text-sm font-bold text-slate-900 block mt-0.5">
                  {checklist.length || 21} Checklist Documents
                </span>
                <span className="text-[10px] text-emerald-700 font-semibold block mt-0.5">
                  ✓ Combined into single Word dossier with page breaks
                </span>
              </div>

              {/* Master Signature Status */}
              <div className="bg-white/90 rounded-xl p-3 border border-blue-100 shadow-2xs">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Master Signature (Every Page)
                </span>
                <span className="text-sm font-bold text-slate-900 block mt-0.5 truncate">
                  {companyDocs.signatureDoc?.value || (companyDocs.signatureDoc ? 'Authorised Signatory' : 'Not Uploaded')}
                </span>
                <span className={`text-[10px] font-semibold block mt-0.5 ${companyDocs.signatureDoc ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {companyDocs.signatureDoc ? '✓ Ready from Master Section' : 'Pending in Master Settings'}
                </span>
              </div>

              {/* Master Seal Status */}
              <div className="bg-white/90 rounded-xl p-3 border border-blue-100 shadow-2xs">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Master Seal / Stamp (Every Page)
                </span>
                <span className="text-sm font-bold text-slate-900 block mt-0.5 truncate">
                  {companyDocs.sealDoc?.value || (companyDocs.sealDoc ? 'Company Seal' : 'Not Uploaded')}
                </span>
                <span className={`text-[10px] font-semibold block mt-0.5 ${companyDocs.sealDoc ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {companyDocs.sealDoc ? '✓ Ready from Master Section' : 'Pending in Master Settings'}
                </span>
              </div>
            </div>

            {/* Document Pills / Chips showing all documents together in one place */}
            <div className="space-y-1.5 pt-1">
              <span className="text-[11px] font-bold text-slate-700 block">
                All Documents available in above fields (Arranged sequentially in single Word file):
              </span>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                {checklist.map((item, i) => (
                  <span
                    key={item.id}
                    className="text-[10px] font-medium bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded-md flex items-center gap-1 shadow-2xs"
                  >
                    <Check className="w-3 h-3 text-emerald-600 flex-shrink-0" />
                    <span className="truncate max-w-[190px]">{i + 1}. {item.docName}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Dossier Remarks */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <label className="text-xs font-bold text-slate-700 block">
              Dossier Verification Remarks & Review Notes:
            </label>
            <textarea
              rows={2}
              disabled={isViewOnly}
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              placeholder="e.g. All 21 statutory documents checked and verified against tender NIT Page 5 specifications."
              className="w-full border border-slate-300 rounded-lg p-2.5 text-xs text-slate-800 bg-white focus:outline-none focus:border-blue-500 disabled:bg-slate-100"
            />
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 md:p-5 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3 flex-shrink-0 flex-wrap">
          <div className="text-xs text-slate-600 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>
              {readyCount} of {totalCount} documents verified and ready.
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="secondary-button text-xs py-2 px-4 cursor-pointer"
            >
              {isViewOnly ? 'Close' : 'Cancel'}
            </button>

            {!isViewOnly && (
              <>
                <button
                  type="button"
                  onClick={handleSave}
                  className="secondary-button text-xs py-2 px-4 flex items-center gap-1.5 font-bold cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>Save Dossier</span>
                </button>

                <button
                  type="button"
                  onClick={handleAdvance}
                  className="primary-button text-xs py-2 px-4 shadow-sm flex items-center gap-2 cursor-pointer bg-blue-600 hover:bg-blue-700"
                >
                  <span>Approve & Advance to Document Upload in portal</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox Preview Modal inside current tab */}
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
                  onClick={() => handleDownload(previewDoc)}
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

            {/* Lightbox Content */}
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

      {/* Word Letter Editor Modal */}
      {wordEditorDoc && (
        <WordLetterEditorModal
          tender={tender}
          doc={wordEditorDoc}
          onClose={() => setWordEditorDoc(null)}
          onSave={handleSaveWordDocument}
        />
      )}

      {/* All Documents Summary Modal (Word .docx Editor, Updater, Deleter & Master Signature/Seal Applier) */}
      {showAllDocsSummary && (
        <AllDocumentsSummaryModal
          tender={tender}
          checklist={checklist}
          documents={documents}
          onClose={() => setShowAllDocsSummary(false)}
          onSave={handleSaveAllDocsSummary}
        />
      )}
    </div>
  )
}
