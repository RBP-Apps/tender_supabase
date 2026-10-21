'use client'

import React, { useState, useMemo } from 'react'
import Link from 'next/link'
import {
  X,
  FileText,
  FileCheck2,
  Download,
  Eye,
  CheckCircle2,
  Calendar,
  Building,
  CreditCard,
  Hash,
  Landmark,
  ArrowRight,
  ExternalLink,
  Layers,
  Sparkles,
  ShieldCheck,
  FileCode,
  Image as ImageIcon,
  FileSpreadsheet,
  AlertCircle,
  Copy,
  Check,
  UploadCloud,
  Pencil,
  Trash2,
  Plus,
  Save,
  FileEdit,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import {
  Tender,
  SampleDocumentItem,
  EligibilityDocument,
  PortalUploadDocumentItem,
  PortalChecklistItem,
} from '@/types/tender'
import {
  collectAllTenderDocuments,
  CollectedDocument,
  DocumentCategory,
  FileTypeGroup,
  formatFileSize,
  detectFileTypeGroup,
} from '@/lib/document-ready-collector'
import { WordLetterEditorModal } from './WordLetterEditorModal'
import { dataUrlToBlobUrl } from '@/lib/utils'
import { extractPortalChecklist, isOldFallbackChecklist } from '@/lib/portal-checklist-extractor'

interface MasterDocumentDossierModalProps {
  tender: Tender
  onClose: () => void
  onAdvance?: (tender: Tender) => void
  onUpdate?: (updatedTender: Tender) => void
}

export function MasterDocumentDossierModal({
  tender,
  onClose,
  onAdvance,
  onUpdate,
}: MasterDocumentDossierModalProps) {
  const dossier = useMemo(() => collectAllTenderDocuments(tender), [tender])
  const [activeCategory, setActiveCategory] = useState<DocumentCategory | 'all'>('portal-checklist')
  const [copiedUtr, setCopiedUtr] = useState(false)
  const [previewDoc, setPreviewDoc] = useState<CollectedDocument | null>(null)
  const [checklistLoading, setChecklistLoading] = useState(false)

  const checklistFileInputRef = React.useRef<HTMLInputElement | null>(null)
  const [targetChecklistDoc, setTargetChecklistDoc] = useState<CollectedDocument | null>(null)

  // Auto-extract or upgrade dynamic checklist from PDF if not yet extracted
  React.useEffect(() => {
    const existing = tender.documentReady?.checklist || tender.portalUpload?.checklist
    if (existing && existing.length > 0 && !isOldFallbackChecklist(existing)) {
      return
    }

    setChecklistLoading(true)
    extractPortalChecklist(tender, tender.portalUpload?.documents || [], existing)
      .then(res => {
        if (res.items && res.items.length > 0) {
          const updated: Tender = {
            ...tender,
            documentReady: {
              ...(tender.documentReady || {}),
              checklist: res.items,
              checklistTitle: res.sectionTitle,
              checklistSource: res.source,
            },
            portalUpload: {
              ...(tender.portalUpload || { documents: [] }),
              checklist: res.items,
              checklistSource: res.sectionTitle,
            },
          }
          onUpdate?.(updated)
        }
      })
      .catch(err => {
        console.warn('Checklist extraction in Document Ready:', err)
      })
      .finally(() => {
        setChecklistLoading(false)
      })
  }, [tender.id])

  const handleRefreshChecklist = async () => {
    setChecklistLoading(true)
    try {
      const res = await extractPortalChecklist(
        tender,
        tender.portalUpload?.documents || [],
        tender.documentReady?.checklist
      )
      if (res.items && res.items.length > 0) {
        const updated: Tender = {
          ...tender,
          documentReady: {
            ...(tender.documentReady || {}),
            checklist: res.items,
            checklistTitle: res.sectionTitle,
            checklistSource: res.source,
          },
          portalUpload: {
            ...(tender.portalUpload || { documents: [] }),
            checklist: res.items,
            checklistSource: res.sectionTitle,
          },
        }
        onUpdate?.(updated)
      }
    } catch (err) {
      console.error('Refresh checklist error:', err)
    } finally {
      setChecklistLoading(false)
    }
  }

  const handleAttachChecklistFile = (doc: CollectedDocument) => {
    setTargetChecklistDoc(doc)
    if (checklistFileInputRef.current) {
      checklistFileInputRef.current.value = ''
      checklistFileInputRef.current.click()
    }
  }

  const onChecklistFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!targetChecklistDoc) return
    handleNativeFileSelect(e, fileData => {
      const updated: Tender = { ...tender }
      const key = targetChecklistDoc.checklistItemId || targetChecklistDoc.id.replace('chk-', '')
      const newUploadItem: PortalUploadDocumentItem = {
        id: `chk-doc-${Date.now()}`,
        fieldKey: key,
        fieldLabel: targetChecklistDoc.title,
        name: fileData.name,
        size: fileData.size,
        type: fileData.type,
        dataUrl: fileData.dataUrl,
        uploadedAt: new Date().toISOString(),
        source: 'manual-upload',
        status: 'Uploaded',
        remarks: targetChecklistDoc.referenceNote,
      }

      const dr = { ...(updated.documentReady || {}) }
      dr.checklistDocs = [
        ...(dr.checklistDocs || []).filter(d => d.fieldKey !== key),
        newUploadItem,
      ]
      updated.documentReady = dr

      const pu = { ...(updated.portalUpload || { documents: [] }) }
      pu.documents = [
        ...(pu.documents || []).filter(d => d.fieldKey !== key),
        newUploadItem,
      ]
      updated.portalUpload = pu

      onUpdate?.(updated)
      setTargetChecklistDoc(null)
    })
  }

  // Sub-modals state
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [editDocModal, setEditDocModal] = useState<CollectedDocument | null>(null)
  const [editDetailsOpen, setEditDetailsOpen] = useState(false)
  const [wordEditorDoc, setWordEditorDoc] = useState<CollectedDocument | null>(null)

  // State for Upload New Document Modal
  const [newDocFile, setNewDocFile] = useState<{
    name: string
    size?: number
    type?: string
    dataUrl?: string
  } | null>(null)
  const [newDocTitle, setNewDocTitle] = useState('')
  const [newDocCategory, setNewDocCategory] = useState<DocumentCategory>('additional')
  const [newDocRemarks, setNewDocRemarks] = useState('')

  // State for Edit/Replace Existing Document Modal
  const [replaceFile, setReplaceFile] = useState<{
    name: string
    size?: number
    type?: string
    dataUrl?: string
  } | null>(null)
  const [editDocTitle, setEditDocTitle] = useState('')
  const [editDocRemarks, setEditDocRemarks] = useState('')

  // State for Edit Tender Details & Remarks
  const [tenderEditForm, setTenderEditForm] = useState({
    title: tender.title,
    authority: tender.authority,
    value: tender.value || '',
    due: tender.due || '',
    utrNumber: tender.emdReady?.utrNumber || '',
    emdAmount: tender.emdReady?.amount || '',
    emdDate: tender.emdReady?.date || '',
    emdRemarks: tender.emdReady?.remarks || '',
    eligibilityRemarks: tender.eligibilityCheck?.remarks || '',
    sampleRemarks: tender.sampleDetails?.remarks || '',
    generalRemarks: tender.remarks || '',
  })

  const filteredDocs = useMemo(() => {
    if (activeCategory === 'portal-checklist') {
      return dossier.categories.portalChecklist
    }
    if (activeCategory === 'all') {
      return [
        ...dossier.categories.portalChecklist,
        ...dossier.categories.tenderNotice,
        ...dossier.categories.corrigendum,
        ...dossier.categories.eligibility,
        ...dossier.categories.sample,
        ...dossier.categories.emdPayment,
        ...dossier.categories.generatedBid,
        ...(dossier.categories.additional || []),
      ]
    }
    switch (activeCategory) {
      case 'tender-notice':
        return [...dossier.categories.tenderNotice, ...dossier.categories.corrigendum]
      case 'eligibility':
        return dossier.categories.eligibility
      case 'sample':
        return dossier.categories.sample
      case 'emd-payment':
        return dossier.categories.emdPayment
      case 'generated-bid':
        return dossier.categories.generatedBid
      case 'additional':
        return dossier.categories.additional || []
      default:
        return []
    }
  }, [activeCategory, dossier])

  const handleCopyUtr = (utr: string) => {
    navigator.clipboard.writeText(utr)
    setCopiedUtr(true)
    setTimeout(() => setCopiedUtr(false), 2000)
  }

  // Handle native file selection
  const handleNativeFileSelect = (
    e: React.ChangeEvent<HTMLInputElement>,
    callback: (fileData: { name: string; size?: number; type?: string; dataUrl?: string }) => void
  ) => {
    const rawFile = e.target.files?.[0]
    if (!rawFile) return

    if (rawFile.size < 6 * 1024 * 1024) {
      const reader = new FileReader()
      reader.onload = ev => {
        callback({
          name: rawFile.name,
          size: rawFile.size,
          type: rawFile.type || 'application/octet-stream',
          dataUrl: ev.target?.result as string,
        })
      }
      reader.readAsDataURL(rawFile)
    } else {
      callback({
        name: rawFile.name,
        size: rawFile.size,
        type: rawFile.type || 'application/octet-stream',
      })
    }
    e.target.value = ''
  }

  // Save New Document
  const handleSaveNewDocument = () => {
    if (!newDocFile && !newDocTitle.trim()) return
    const updated: Tender = { ...tender }
    const now = new Date().toISOString()
    const docItem: SampleDocumentItem = {
      id: `doc-${Date.now()}`,
      name: newDocFile?.name || `${newDocTitle}.pdf`,
      size: newDocFile?.size || 0,
      type: newDocFile?.type || 'application/pdf',
      dataUrl: newDocFile?.dataUrl,
      uploadedAt: now,
      source: 'manual-upload',
      referenceNote: newDocTitle || newDocFile?.name || 'Uploaded Document',
    }

    if (newDocCategory === 'eligibility') {
      const ec = { ...(updated.eligibilityCheck || {}) }
      ec.otherDoc = {
        name: docItem.name,
        size: docItem.size,
        type: docItem.type,
        uploadedAt: now,
        dataUrl: docItem.dataUrl,
      }
      if (newDocRemarks) ec.remarks = newDocRemarks
      updated.eligibilityCheck = ec
    } else if (newDocCategory === 'sample') {
      const sd = { ...(updated.sampleDetails || {}) }
      sd.otherDocs = [...(sd.otherDocs || []), docItem]
      if (newDocRemarks) sd.remarks = newDocRemarks
      updated.sampleDetails = sd
    } else {
      const dr = { ...(updated.documentReady || {}) }
      dr.customDocs = [...(dr.customDocs || []), docItem]
      if (newDocRemarks) dr.remarks = newDocRemarks
      updated.documentReady = dr
    }

    onUpdate?.(updated)
    setNewDocFile(null)
    setNewDocTitle('')
    setNewDocRemarks('')
    setUploadModalOpen(false)
  }

  // Save Replaced/Edited Document
  const handleSaveReplaceDoc = () => {
    if (!editDocModal) return
    const updated: Tender = { ...tender }
    const docId = editDocModal.id

    // Check Eligibility
    if (docId.startsWith('eligibility-')) {
      const field = docId.replace('eligibility-', '')
      const ec = { ...(updated.eligibilityCheck || {}) }
      const newFileObj: EligibilityDocument = {
        name: replaceFile ? replaceFile.name : editDocModal.fileName,
        size: replaceFile ? replaceFile.size : editDocModal.fileSize,
        type: replaceFile ? replaceFile.type : editDocModal.fileType,
        uploadedAt: new Date().toISOString(),
        dataUrl: replaceFile ? replaceFile.dataUrl : editDocModal.dataUrl,
      }
      if (field === 'turnover') ec.turnoverDoc = newFileObj
      else if (field === 'experience') ec.experienceDoc = newFileObj
      else if (field === 'vendorReg') ec.vendorRegDoc = newFileObj
      else if (field === 'other') ec.otherDoc = newFileObj
      if (editDocRemarks) ec.remarks = editDocRemarks
      updated.eligibilityCheck = ec
    }
    // Check Sample
    else if (docId.startsWith('sample-')) {
      const sd = { ...(updated.sampleDetails || {}) }
      const newSampleItem: SampleDocumentItem = {
        id: editDocModal.id,
        name: replaceFile ? replaceFile.name : editDocModal.fileName,
        size: replaceFile ? replaceFile.size : editDocModal.fileSize,
        type: replaceFile ? replaceFile.type : editDocModal.fileType,
        uploadedAt: new Date().toISOString(),
        dataUrl: replaceFile ? replaceFile.dataUrl : editDocModal.dataUrl,
        source: 'manual-upload',
        referenceNote: editDocTitle || editDocModal.title,
      }
      if (docId === 'sample-maf') sd.mafLetter = newSampleItem
      else if (docId === 'sample-test') sd.testReport = newSampleItem
      else if (docId === 'sample-bis') sd.bisCertificate = newSampleItem
      else if (docId === 'sample-sample') sd.productSample = newSampleItem
      else {
        // otherDocs
        sd.otherDocs = (sd.otherDocs || []).map(od =>
          od.name === editDocModal.fileName ? newSampleItem : od
        )
      }
      if (editDocRemarks) sd.remarks = editDocRemarks
      updated.sampleDetails = sd
    }
    // Check Custom Docs in Document Ready
    else if (docId.startsWith('custom-')) {
      const dr = { ...(updated.documentReady || {}) }
      const newSampleItem: SampleDocumentItem = {
        id: editDocModal.id,
        name: replaceFile ? replaceFile.name : editDocModal.fileName,
        size: replaceFile ? replaceFile.size : editDocModal.fileSize,
        type: replaceFile ? replaceFile.type : editDocModal.fileType,
        uploadedAt: new Date().toISOString(),
        dataUrl: replaceFile ? replaceFile.dataUrl : editDocModal.dataUrl,
        source: 'manual-upload',
        referenceNote: editDocTitle || editDocModal.title,
      }
      dr.customDocs = (dr.customDocs || []).map(cd =>
        cd.id === editDocModal.id.replace('custom-', '') || cd.name === editDocModal.fileName
          ? newSampleItem
          : cd
      )
      if (editDocRemarks) dr.remarks = editDocRemarks
      updated.documentReady = dr
    }
    // Check Checklist Documents
    else if (docId.startsWith('chk-')) {
      const cleanKey = editDocModal.checklistItemId || docId.replace('chk-', '')
      const newFileObj: PortalUploadDocumentItem = {
        id: editDocModal.id,
        fieldKey: cleanKey,
        fieldLabel: editDocTitle || editDocModal.title,
        name: replaceFile ? replaceFile.name : editDocModal.fileName,
        size: replaceFile ? replaceFile.size : editDocModal.fileSize,
        type: replaceFile ? replaceFile.type : editDocModal.fileType,
        uploadedAt: new Date().toISOString(),
        dataUrl: replaceFile ? replaceFile.dataUrl : editDocModal.dataUrl,
        source: 'manual-upload',
        status: 'Uploaded',
        remarks: editDocRemarks,
      }
      const dr = { ...(updated.documentReady || {}) }
      dr.checklistDocs = [
        ...(dr.checklistDocs || []).filter(d => d.fieldKey !== cleanKey),
        newFileObj,
      ]
      updated.documentReady = dr

      const pu = { ...(updated.portalUpload || { documents: [] }) }
      pu.documents = [
        ...(pu.documents || []).filter(d => d.fieldKey !== cleanKey),
        newFileObj,
      ]
      updated.portalUpload = pu
    }

    onUpdate?.(updated)
    setEditDocModal(null)
    setReplaceFile(null)
    setEditDocTitle('')
    setEditDocRemarks('')
  }

  // Delete/Remove Document
  const handleDeleteDoc = (doc: CollectedDocument) => {
    if (!window.confirm(`Are you sure you want to remove document "${doc.title}"?`)) return
    const updated: Tender = { ...tender }
    const docId = doc.id

    if (docId.startsWith('eligibility-')) {
      const field = docId.replace('eligibility-', '')
      const ec = { ...(updated.eligibilityCheck || {}) }
      if (field === 'turnover') ec.turnoverDoc = null
      else if (field === 'experience') ec.experienceDoc = null
      else if (field === 'vendorReg') ec.vendorRegDoc = null
      else if (field === 'other') ec.otherDoc = null
      updated.eligibilityCheck = ec
    } else if (docId.startsWith('sample-')) {
      const sd = { ...(updated.sampleDetails || {}) }
      if (docId === 'sample-maf') sd.mafLetter = null
      else if (docId === 'sample-test') sd.testReport = null
      else if (docId === 'sample-bis') sd.bisCertificate = null
      else if (docId === 'sample-sample') sd.productSample = null
      else {
        sd.otherDocs = (sd.otherDocs || []).filter(od => od.name !== doc.fileName)
      }
      updated.sampleDetails = sd
    } else if (docId.startsWith('custom-')) {
      const dr = { ...(updated.documentReady || {}) }
      dr.customDocs = (dr.customDocs || []).filter(
        cd => cd.id !== doc.id.replace('custom-', '') && cd.name !== doc.fileName
      )
      updated.documentReady = dr
    } else if (docId.startsWith('chk-')) {
      const cleanKey = doc.checklistItemId || docId.replace('chk-', '')
      const dr = { ...(updated.documentReady || {}) }
      dr.checklistDocs = (dr.checklistDocs || []).filter(d => d.fieldKey !== cleanKey)
      updated.documentReady = dr

      const pu = { ...(updated.portalUpload || { documents: [] }) }
      pu.documents = (pu.documents || []).filter(d => d.fieldKey !== cleanKey)
      updated.portalUpload = pu
    }

    onUpdate?.(updated)
  }

  // Save Tender Details & Remarks Edit
  const handleSaveTenderDetails = () => {
    const updated: Tender = {
      ...tender,
      title: tenderEditForm.title.trim() || tender.title,
      authority: tenderEditForm.authority.trim() || tender.authority,
      value: tenderEditForm.value.trim() || tender.value,
      due: tenderEditForm.due || tender.due,
      remarks: tenderEditForm.generalRemarks,
    }

    if (updated.emdReady) {
      updated.emdReady = {
        ...updated.emdReady,
        utrNumber: tenderEditForm.utrNumber.trim() || updated.emdReady.utrNumber,
        amount: tenderEditForm.emdAmount.trim() || updated.emdReady.amount,
        date: tenderEditForm.emdDate || updated.emdReady.date,
        remarks: tenderEditForm.emdRemarks,
      }
    }

    if (updated.eligibilityCheck) {
      updated.eligibilityCheck = {
        ...updated.eligibilityCheck,
        remarks: tenderEditForm.eligibilityRemarks,
      }
    }

    if (updated.sampleDetails) {
      updated.sampleDetails = {
        ...updated.sampleDetails,
        remarks: tenderEditForm.sampleRemarks,
      }
    }

    onUpdate?.(updated)
    setEditDetailsOpen(false)
  }

  const handleDownload = (doc: CollectedDocument) => {
    if (doc.dataUrl) {
      const a = document.createElement('a')
      a.href = doc.dataUrl
      a.download = doc.fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      return
    }

    const content = `DOCUMENT DOSSIER RECORD
=====================================================
Tender Title  : ${tender.title}
Tender ID     : ${tender.id}
Authority     : ${tender.authority}
Stage         : ${tender.stage}

Document Title: ${doc.title}
Category      : ${doc.categoryLabel}
File Name     : ${doc.fileName}
File Type     : ${doc.fileType}
Source        : ${doc.sourceLabel}
Uploaded At   : ${doc.uploadedAt}
Reference Note: ${doc.referenceNote || 'N/A'}
Remarks       : ${doc.remarks || 'None'}
=====================================================
This document record was verified and registered in the Tender FMS workflow.
`
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = doc.fileName.endsWith('.txt') ? doc.fileName : `${doc.fileName}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Open Word Document Editor Modal (opens the actual document!)
  const handleOpenWordEditor = (doc: CollectedDocument) => {
    setWordEditorDoc(doc)
  }

  // Persist Word Document changes back to tender state
  const handleSaveWordDocument = (updatedDoc: {
    title: string
    fileName: string
    remarks?: string
    contentHtml: string
    dataUrl?: string
    fileSize?: number
    fileType?: string
    sourceFileName?: string
    conversionMethod?: string
  }) => {
    if (!wordEditorDoc) return
    const updated: Tender = { ...tender }
    const targetDoc = wordEditorDoc
    const docId = targetDoc.id
    const now = new Date().toISOString()
    const letterContent = {
      title: updatedDoc.title,
      contentHtml: updatedDoc.contentHtml,
      remarks: updatedDoc.remarks,
      updatedAt: now,
      // Marks content converted from the attached original so it is only reused for that same file
      ...(updatedDoc.sourceFileName
        ? {
            generatedBy: 'file-conversion',
            sourceFileName: updatedDoc.sourceFileName,
            conversionMethod: updatedDoc.conversionMethod,
          }
        : {}),
    }

    // 1. If it came from Stage 03 Eligibility Check
    if (docId.startsWith('eligibility-')) {
      const field = docId.replace('eligibility-', '')
      const ec = { ...(updated.eligibilityCheck || {}) }
      const updatedFileObj: EligibilityDocument = {
        name: updatedDoc.fileName || targetDoc.fileName,
        size: updatedDoc.fileSize !== undefined ? updatedDoc.fileSize : targetDoc.fileSize,
        type: updatedDoc.fileType || targetDoc.fileType,
        uploadedAt: now,
        dataUrl: updatedDoc.dataUrl || targetDoc.dataUrl,
        letterContent,
      }

      if (field === 'turnover') ec.turnoverDoc = updatedFileObj
      else if (field === 'experience') ec.experienceDoc = updatedFileObj
      else if (field === 'vendorReg') ec.vendorRegDoc = updatedFileObj
      else if (field === 'other') ec.otherDoc = updatedFileObj

      if (updatedDoc.remarks) ec.remarks = updatedDoc.remarks
      updated.eligibilityCheck = ec
    }
    // 2. If it came from Stage 04 Sample Details
    else if (docId.startsWith('sample-')) {
      const field = docId.replace('sample-', '')
      const sd = { ...(updated.sampleDetails || {}) }
      const updatedSampleItem: SampleDocumentItem = {
        id: targetDoc.id,
        name: updatedDoc.fileName || targetDoc.fileName,
        size: updatedDoc.fileSize !== undefined ? updatedDoc.fileSize : targetDoc.fileSize,
        type: updatedDoc.fileType || targetDoc.fileType,
        uploadedAt: now,
        dataUrl: updatedDoc.dataUrl || targetDoc.dataUrl,
        source: 'manual-upload',
        referenceNote: updatedDoc.title || targetDoc.title,
        letterContent,
      }

      if (field === 'maf') sd.mafLetter = updatedSampleItem
      else if (field === 'test') sd.testReport = updatedSampleItem
      else if (field === 'bis') sd.bisCertificate = updatedSampleItem
      else if (field === 'sample') sd.productSample = updatedSampleItem
      else {
        sd.otherDocs = (sd.otherDocs || []).map(od =>
          od.name === targetDoc.fileName ? updatedSampleItem : od
        )
      }
      if (updatedDoc.remarks) sd.remarks = updatedDoc.remarks
      updated.sampleDetails = sd
    }
    // 3. If it came from Stage 05 Document Ready Custom/Uploaded Docs
    else if (docId.startsWith('custom-')) {
      const cleanId = docId.replace('custom-', '')
      const dr = { ...(updated.documentReady || {}) }
      const updatedItem: SampleDocumentItem = {
        id: cleanId,
        name: updatedDoc.fileName || targetDoc.fileName,
        size: updatedDoc.fileSize !== undefined ? updatedDoc.fileSize : targetDoc.fileSize,
        type: updatedDoc.fileType || targetDoc.fileType,
        uploadedAt: now,
        dataUrl: updatedDoc.dataUrl || targetDoc.dataUrl,
        source: 'manual-upload',
        referenceNote: updatedDoc.title || targetDoc.title,
        letterContent,
      }

      dr.customDocs = (dr.customDocs || []).map(cd =>
        cd.id === cleanId || cd.name === targetDoc.fileName ? updatedItem : cd
      )
      if (updatedDoc.remarks) dr.remarks = updatedDoc.remarks
      updated.documentReady = dr
    }
    // 3b. If it came from Checklist Item
    else if (docId.startsWith('chk-')) {
      const cleanKey = targetDoc.checklistItemId || docId.replace('chk-', '')
      const updatedItem: PortalUploadDocumentItem = {
        id: targetDoc.id,
        fieldKey: cleanKey,
        fieldLabel: updatedDoc.title || targetDoc.title,
        name: updatedDoc.fileName || targetDoc.fileName,
        size: updatedDoc.fileSize !== undefined ? updatedDoc.fileSize : targetDoc.fileSize,
        type: updatedDoc.fileType || targetDoc.fileType,
        uploadedAt: now,
        dataUrl: updatedDoc.dataUrl || targetDoc.dataUrl,
        source: 'manual-upload',
        status: 'Uploaded',
        remarks: updatedDoc.remarks,
        letterContent,
      }
      const dr = { ...(updated.documentReady || {}) }
      dr.checklistDocs = [
        ...(dr.checklistDocs || []).filter(d => d.fieldKey !== cleanKey),
        updatedItem,
      ]
      updated.documentReady = dr

      const pu = { ...(updated.portalUpload || { documents: [] }) }
      pu.documents = [
        ...(pu.documents || []).filter(d => d.fieldKey !== cleanKey),
        updatedItem,
      ]
      updated.portalUpload = pu
    }
    // 4. Default: Record in customDocs
    else {
      const dr = { ...(updated.documentReady || {}) }
      const updatedItem: SampleDocumentItem = {
        id: `doc-${Date.now()}`,
        name: updatedDoc.fileName || targetDoc.fileName,
        size: updatedDoc.fileSize !== undefined ? updatedDoc.fileSize : targetDoc.fileSize,
        type: updatedDoc.fileType || targetDoc.fileType,
        uploadedAt: now,
        dataUrl: updatedDoc.dataUrl || targetDoc.dataUrl,
        source: 'manual-upload',
        referenceNote: updatedDoc.title || targetDoc.title,
        letterContent,
      }
      dr.customDocs = [...(dr.customDocs || []), updatedItem]
      updated.documentReady = dr
    }

    onUpdate?.(updated)
    setWordEditorDoc(null)
  }

  const getFileBadge = (group: FileTypeGroup) => {
    switch (group) {
      case 'pdf':
        return (
          <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 font-bold text-[10px] flex items-center gap-1">
            <FileText className="w-3 h-3" /> PDF
          </span>
        )
      case 'doc':
        return (
          <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 font-bold text-[10px] flex items-center gap-1">
            <FileSpreadsheet className="w-3 h-3" /> DOC
          </span>
        )
      case 'image':
        return (
          <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-700 font-bold text-[10px] flex items-center gap-1">
            <ImageIcon className="w-3 h-3" /> IMG
          </span>
        )
      case 'text':
        return (
          <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-bold text-[10px] flex items-center gap-1">
            <FileCode className="w-3 h-3" /> TXT
          </span>
        )
      default:
        return (
          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-bold text-[10px] flex items-center gap-1">
            <FileText className="w-3 h-3" /> FILE
          </span>
        )
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 md:p-6 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 md:p-6 border-b border-slate-200 bg-slate-50 flex items-start justify-between gap-4 flex-shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-700 bg-blue-100/80 px-2.5 py-0.5 rounded-full">
                STAGE 05 · DOCUMENT READY
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 bg-emerald-100/80 px-2.5 py-0.5 rounded-full">
                {dossier.totalCount} Documents & Records Fetched
              </span>
              <span className="text-xs font-semibold text-slate-500">
                Tender ID: <span className="font-mono text-slate-800 font-bold">{tender.id}</span>
              </span>
            </div>
            <h2 className="text-lg md:text-xl font-bold text-slate-900 leading-snug">
              {tender.title}
            </h2>
            <p className="text-xs text-slate-600 mt-1 flex items-center gap-2 flex-wrap">
              <span>
                Authority: <strong className="text-slate-800">{tender.authority}</strong>
              </span>
              <span>•</span>
              <span>
                Estimated Value: <strong className="text-slate-800">{tender.value || 'N/A'}</strong>
              </span>
              <span>•</span>
              <span>
                Submission Due: <strong className="text-slate-800">{tender.due || 'N/A'}</strong>
              </span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Quick Upload PDF / Add Document Button */}
            <button
              onClick={() => {
                setNewDocFile(null)
                setNewDocTitle('')
                setNewDocRemarks('')
                setUploadModalOpen(true)
              }}
              className="primary-button text-xs py-1.5 px-3 flex items-center gap-1.5 shadow-sm"
              title="Upload new PDF, Word, or image file into dossier"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>Upload PDF / Document</span>
            </button>

            {/* Edit Tender Details & Remarks Button */}
            <button
              onClick={() => {
                setTenderEditForm({
                  title: tender.title,
                  authority: tender.authority,
                  value: tender.value || '',
                  due: tender.due || '',
                  utrNumber: tender.emdReady?.utrNumber || '',
                  emdAmount: tender.emdReady?.amount || '',
                  emdDate: tender.emdReady?.date || '',
                  emdRemarks: tender.emdReady?.remarks || '',
                  eligibilityRemarks: tender.eligibilityCheck?.remarks || '',
                  sampleRemarks: tender.sampleDetails?.remarks || '',
                  generalRemarks: tender.remarks || '',
                })
                setEditDetailsOpen(true)
              }}
              className="secondary-button text-xs py-1.5 px-3 flex items-center gap-1.5"
              title="Edit tender parameters, UTR, and stage remarks"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>Edit Details</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Categories Bar */}
        <div className="px-5 md:px-6 pt-3 pb-2 border-b border-slate-200 bg-white flex items-center gap-2 overflow-x-auto scrollbar-none flex-shrink-0">
          {/* 1. Official Tender Checklist Tab (Dynamic from tender NIT) */}
          <button
            onClick={() => setActiveCategory('portal-checklist')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
              activeCategory === 'portal-checklist'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-blue-700 bg-blue-50/70 hover:bg-blue-100/70 border border-blue-200'
            }`}
          >
            {checklistLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
            ) : (
              <span>📋</span>
            )}
            <span>Official Tender Checklist ({dossier.categories.portalChecklist?.length || 0})</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                activeCategory === 'portal-checklist'
                  ? 'bg-white/20 text-white'
                  : (dossier.attachedChecklistCount || 0) >= (dossier.totalChecklistCount || 1)
                  ? 'bg-emerald-200 text-emerald-900'
                  : 'bg-blue-200 text-blue-900'
              }`}
            >
              {dossier.attachedChecklistCount || 0}/{dossier.totalChecklistCount || 0} Ready
            </span>
          </button>

          <button
            onClick={() => setActiveCategory('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              activeCategory === 'all'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            All Documents ({dossier.totalCount})
          </button>

          <button
            onClick={() => setActiveCategory('tender-notice')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              activeCategory === 'tender-notice'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Tender & Corrigenda ({dossier.categories.tenderNotice.length + dossier.categories.corrigendum.length})
          </button>

          <button
            onClick={() => setActiveCategory('eligibility')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              activeCategory === 'eligibility'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Eligibility Docs ({dossier.categories.eligibility.length})
          </button>

          <button
            onClick={() => setActiveCategory('sample')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              activeCategory === 'sample'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Sample Details ({dossier.categories.sample.length})
          </button>

          <button
            onClick={() => setActiveCategory('emd-payment')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              activeCategory === 'emd-payment'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            EMD Payment Proof ({dossier.categories.emdPayment.length})
          </button>

          <button
            onClick={() => setActiveCategory('generated-bid')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              activeCategory === 'generated-bid'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Generated Bid Formats ({dossier.categories.generatedBid.length})
          </button>

          {dossier.categories.additional && dossier.categories.additional.length > 0 && (
            <button
              onClick={() => setActiveCategory('additional')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                activeCategory === 'additional'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Additional Uploads ({dossier.categories.additional.length})
            </button>
          )}
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 md:p-6 space-y-6">
          {/* Dynamic Checklist Status & Quick Actions Banner */}
          <div className="border border-blue-200 bg-linear-to-r from-blue-50/90 via-indigo-50/70 to-slate-50 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-2xs">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-bold text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-blue-600" />
                  Dynamic Submission Checklist
                </span>
                <span className="text-xs font-semibold text-slate-500">
                  Section: <strong className="text-slate-800">{dossier.checklistTitle || 'E-Bidding Portal Checklist'}</strong>
                </span>
              </div>
              <p className="text-xs text-slate-600">
                {dossier.totalChecklistCount || 0} statutory document fields generated according to this tender's requirements.
              </p>
              {/* Progress bar */}
              <div className="flex items-center gap-2 pt-1 max-w-md">
                <div className="flex-1 bg-slate-200 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-emerald-500 h-full transition-all duration-300"
                    style={{
                      width: `${
                        dossier.totalChecklistCount
                          ? Math.round(
                              ((dossier.attachedChecklistCount || 0) / dossier.totalChecklistCount) * 100
                            )
                          : 0
                      }%`,
                    }}
                  />
                </div>
                <span className="text-[11px] font-bold text-slate-700 whitespace-nowrap">
                  {dossier.attachedChecklistCount || 0} / {dossier.totalChecklistCount || 0} Attached (
                  {dossier.totalChecklistCount
                    ? Math.round(
                        ((dossier.attachedChecklistCount || 0) / dossier.totalChecklistCount) * 100
                      )
                    : 0}
                  %)
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={handleRefreshChecklist}
                disabled={checklistLoading}
                className="secondary-button text-xs py-1.5 px-3 flex items-center gap-1.5"
                title="Re-scan tender NIT PDF to refresh checklist"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${checklistLoading ? 'animate-spin text-blue-600' : ''}`} />
                <span>{checklistLoading ? 'Extracting from PDF...' : 'Refresh from PDF'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setNewDocFile(null)
                  setNewDocTitle('')
                  setNewDocCategory('additional')
                  setUploadModalOpen(true)
                }}
                className="primary-button text-xs py-1.5 px-3 flex items-center gap-1.5 shadow-xs"
                title="Upload document to this dossier"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Upload Document</span>
              </button>
            </div>
          </div>

          {/* Key Text / EMD / Remarks Summary Banner */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* EMD Reference Box */}
            <div className="border border-purple-200 bg-purple-50/70 rounded-xl p-3.5 relative group">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-bold text-purple-900 uppercase tracking-wider flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-purple-700" />
                  EMD Verification
                </span>
                <span className="font-bold text-xs text-purple-900 px-2 py-0.5 rounded bg-purple-200/80">
                  {dossier.emdDetails?.amount || 'EMD ₹ N/A'}
                </span>
              </div>
              <div className="space-y-1 text-xs text-purple-950/80 mt-2">
                <div className="flex items-center justify-between">
                  <span className="text-purple-900/70">UTR Number:</span>
                  <div className="flex items-center gap-1 font-mono font-bold text-purple-900">
                    <span>{dossier.emdDetails?.utrNumber || '—'}</span>
                    {dossier.emdDetails?.utrNumber && (
                      <button
                        onClick={() => handleCopyUtr(dossier.emdDetails!.utrNumber)}
                        className="text-purple-600 hover:text-purple-900"
                        title="Copy UTR"
                      >
                        {copiedUtr ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-purple-900/70">Payment Date:</span>
                  <span className="font-medium text-purple-900">{dossier.emdDetails?.date || '—'}</span>
                </div>
                {dossier.emdDetails?.departmentAccount?.bankName && (
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-purple-900/70">Dept Bank:</span>
                    <span className="font-medium text-purple-900 truncate max-w-[150px]">
                      {dossier.emdDetails.departmentAccount.bankName} ({dossier.emdDetails.departmentAccount.accountNo})
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Eligibility & Sample Remarks Box */}
            <div className="border border-blue-200 bg-blue-50/70 rounded-xl p-3.5">
              <span className="text-[11px] font-bold text-blue-900 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-700" />
                Stage Audit Remarks
              </span>
              <div className="space-y-2 text-xs text-blue-950/80">
                <div>
                  <span className="text-[10px] font-bold text-blue-700 block uppercase">Eligibility Note:</span>
                  <p className="text-slate-700 text-xs italic line-clamp-2">
                    {dossier.remarks.eligibility || 'No specific eligibility remark recorded.'}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-blue-700 block uppercase">Sample Note:</span>
                  <p className="text-slate-700 text-xs italic line-clamp-2">
                    {dossier.remarks.sample || 'No specific sample details remark recorded.'}
                  </p>
                </div>
              </div>
            </div>

            {/* Quick Bid Document Generator Banner */}
            <div className="border border-emerald-200 bg-emerald-50/70 rounded-xl p-3.5 flex flex-col justify-between">
              <div>
                <span className="text-[11px] font-bold text-emerald-900 uppercase tracking-wider flex items-center gap-1.5 mb-1">
                  <FileCheck2 className="w-3.5 h-3.5 text-emerald-700" />
                  Auto-Generated Bid Set
                </span>
                <p className="text-[11px] text-emerald-950/80 leading-relaxed">
                  5 official annexures, affidavits, checklist & stickers compiled from company letterhead and tender parameters.
                </p>
              </div>

              <Link
                href={`/tender-documents/${encodeURIComponent(tender.id)}`}
                className="mt-3 inline-flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-800 bg-white border border-emerald-300 hover:bg-emerald-100/60 rounded-lg py-1.5 px-3 transition-colors shadow-sm"
              >
                Open Full Bid Document Viewer <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
          </div>

          {/* Documents Grid */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-600" />
                Consolidated Documents ({filteredDocs.length})
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setNewDocFile(null)
                    setNewDocTitle('')
                    setNewDocRemarks('')
                    setUploadModalOpen(true)
                  }}
                  className="text-xs font-semibold text-blue-700 hover:text-blue-900 flex items-center gap-1 px-2.5 py-1 rounded bg-blue-50 border border-blue-200 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Upload File
                </button>
              </div>
            </div>

            {filteredDocs.length === 0 ? (
              <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
                <AlertCircle className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-700">No documents found in this category.</p>
                <p className="text-[11px] text-slate-500 mt-1 mb-3">
                  Upload a PDF or document directly to add it to this dossier.
                </p>
                <button
                  type="button"
                  onClick={() => setUploadModalOpen(true)}
                  className="primary-button text-xs py-1.5 px-3 inline-flex"
                >
                  <UploadCloud className="w-3.5 h-3.5" /> Upload PDF / Document
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {filteredDocs.map(doc => {
                  const isChecklistItem = doc.category === 'portal-checklist'
                  const isModifiable =
                    doc.category === 'eligibility' ||
                    doc.category === 'sample' ||
                    doc.category === 'additional' ||
                    (doc.category === 'portal-checklist' && doc.isAttached)

                  return (
                    <div
                      key={doc.id}
                      className={`border rounded-xl p-3.5 bg-white transition-all flex flex-col justify-between gap-3 group ${
                        isChecklistItem && !doc.isAttached
                          ? 'border-amber-200 bg-amber-50/20 hover:border-amber-300'
                          : 'border-slate-200 hover:border-blue-300 hover:shadow-md'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <div className="mt-0.5">{getFileBadge(doc.fileTypeGroup)}</div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {isChecklistItem && doc.envelope && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                                  {doc.envelope}
                                </span>
                              )}
                              {isChecklistItem && (
                                <span
                                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                    doc.isMandatory
                                      ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                                  }`}
                                >
                                  {doc.requirement || (doc.isMandatory ? 'Mandatory' : 'Conditional')}
                                </span>
                              )}
                            </div>
                            <strong className="block text-xs font-bold text-slate-900 truncate mt-0.5" title={doc.title}>
                              {doc.title}
                            </strong>
                            <span
                              className={`block text-[11px] truncate max-w-[260px] font-mono mt-0.5 ${
                                doc.isAttached ? 'text-slate-500' : 'text-amber-700 font-semibold'
                              }`}
                              title={doc.fileName}
                            >
                              {doc.fileName}
                            </span>
                          </div>
                        </div>

                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                            isChecklistItem
                              ? doc.isAttached
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-900'
                              : doc.source === 'auto-fetched'
                              ? 'bg-blue-100 text-blue-800'
                              : doc.source === 'system-generated'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {isChecklistItem
                            ? doc.isAttached
                              ? '✓ Attached / Ready'
                              : '⚠️ Action Required'
                            : doc.sourceLabel}
                        </span>
                      </div>

                      {/* Metadata & reference */}
                      <div className="text-[11px] text-slate-500 bg-slate-50 rounded-lg p-2 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-slate-600">Origin / Clause:</span>
                          <span className="font-semibold text-slate-800 truncate max-w-[200px]" title={doc.stageOrigin}>
                            {doc.stageOrigin}
                          </span>
                        </div>
                        {doc.isAttached && (
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-slate-600">File Size:</span>
                            <span>{formatFileSize(doc.fileSize)}</span>
                          </div>
                        )}
                        {doc.referenceNote && (
                          <p className="text-[10px] text-slate-600 italic line-clamp-2 border-t border-slate-200/60 pt-1 mt-1">
                            Ref: {doc.referenceNote}
                          </p>
                        )}
                      </div>

                      {/* Unattached Checklist Requirement Quick Action */}
                      {isChecklistItem && !doc.isAttached && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs flex items-center justify-between gap-2">
                          <span className="text-[11px] text-amber-900 font-medium">Attach document for submission packet:</span>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <button
                              type="button"
                              onClick={() => handleAttachChecklistFile(doc)}
                              className="primary-button text-[11px] py-1 px-2.5 flex items-center gap-1 shadow-xs"
                              title="Attach file directly"
                            >
                              <UploadCloud className="w-3.5 h-3.5" /> Upload File
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenWordEditor(doc)}
                              className="secondary-button text-[11px] py-1 px-2 flex items-center gap-1"
                              title="Create in Word Letter Editor"
                            >
                              <FileEdit className="w-3.5 h-3.5 text-indigo-600" /> Word
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Card Actions: Preview, Download, Edit/Replace, Remove */}
                      <div className="flex items-center justify-between pt-1 border-t border-slate-100 gap-2">
                        <div className="flex items-center gap-1.5">
                          {isModifiable && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditDocModal(doc)
                                setReplaceFile(null)
                                setEditDocTitle(doc.title)
                                setEditDocRemarks(doc.remarks || '')
                              }}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors border border-amber-200"
                              title="Edit title or upload replacement PDF/file"
                            >
                              <Pencil className="w-3 h-3" /> Edit / Replace
                            </button>
                          )}

                          {isModifiable && (
                            <button
                              type="button"
                              onClick={() => handleDeleteDoc(doc)}
                              className="inline-flex items-center gap-1 p-1 text-xs font-semibold text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Remove document"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap justify-end">
                          {doc.isAttached && (
                            <>
                              <button
                                type="button"
                                onClick={() => setPreviewDoc(doc)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                              >
                                <Eye className="w-3.5 h-3.5" /> Preview
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDownload(doc)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                              >
                                <Download className="w-3.5 h-3.5" /> Download
                              </button>
                            </>
                          )}

                          <button
                            type="button"
                            onClick={() => handleOpenWordEditor(doc)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors shadow-sm"
                            title="Convert the attached file into an editable Word document or create official letter"
                          >
                            <FileEdit className="w-3.5 h-3.5 text-indigo-600" /> Word / Edit
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 md:p-5 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3 flex-shrink-0 flex-wrap">
          <div className="text-xs text-slate-600 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>
              All <strong className="text-slate-900">{dossier.totalCount} documents</strong> ready for submission packet.
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="secondary-button text-xs py-2 px-4"
            >
              Close Dossier
            </button>

            {onAdvance && (
              <button
                type="button"
                onClick={() => onAdvance(tender)}
                className="primary-button text-xs py-2 px-4 shadow-sm"
              >
                Approve & Advance to Next Stage (Document Upload in portal)
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Hidden File Input for Direct Checklist Attachment */}
      <input
        type="file"
        ref={checklistFileInputRef}
        onChange={onChecklistFileSelected}
        className="hidden"
        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.txt"
      />

      {/* 1. UPLOAD NEW PDF / DOCUMENT MODAL */}
      {uploadModalOpen && (
        <div className="fixed inset-0 z-60 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start justify-between pb-3 border-b border-slate-200 mb-4">
              <div>
                <h4 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <UploadCloud className="w-5 h-5 text-blue-600" />
                  Upload PDF / Document
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Attach an additional document, affidavit, or replacement file to this tender dossier.
                </p>
              </div>
              <button
                onClick={() => setUploadModalOpen(false)}
                className="p-1 rounded text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Document Title / Description */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Document Title / Description <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newDocTitle}
                  onChange={e => setNewDocTitle(e.target.value)}
                  placeholder="e.g. Supplementary Turnover Affidavit / Revised Spec"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Category Dropdown */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Target Stage Category
                </label>
                <select
                  value={newDocCategory}
                  onChange={e => setNewDocCategory(e.target.value as DocumentCategory)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500 bg-white"
                >
                  <option value="portal-checklist">Official Tender Checklist Requirement</option>
                  <option value="additional">Additional Document (Document Ready)</option>
                  <option value="eligibility">Eligibility Verification Document</option>
                  <option value="sample">Sample Details & Technical Testing</option>
                </select>
              </div>

              {/* File Upload Box */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Upload File (PDF / Word / Image) <span className="text-red-500">*</span>
                </label>
                {newDocFile ? (
                  <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-5 h-5 text-blue-600 flex-shrink-0" />
                      <div className="min-w-0">
                        <span className="text-xs font-semibold text-slate-800 block truncate" title={newDocFile.name}>
                          {newDocFile.name}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {formatFileSize(newDocFile.size)}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setNewDocFile(null)}
                      className="text-red-500 hover:text-red-700 p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <label className="border-2 border-dashed border-slate-300 hover:border-blue-400 hover:bg-blue-50/40 rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all">
                    <UploadCloud className="w-7 h-7 text-slate-400" />
                    <span className="text-xs font-semibold text-slate-700">Click to choose PDF or document</span>
                    <span className="text-[11px] text-slate-400">PDF, DOC, DOCX, PNG, JPG (All files accepted)</span>
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      className="hidden"
                      onChange={e => handleNativeFileSelect(e, f => setNewDocFile(f))}
                    />
                  </label>
                )}
              </div>

              {/* Remarks / Reference Note */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Remarks / Audit Reference
                </label>
                <textarea
                  rows={2}
                  value={newDocRemarks}
                  onChange={e => setNewDocRemarks(e.target.value)}
                  placeholder="Enter audit note, reason for upload, or reference..."
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setUploadModalOpen(false)}
                className="secondary-button text-xs py-2 px-3.5"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!newDocFile && !newDocTitle.trim()}
                onClick={handleSaveNewDocument}
                className="primary-button text-xs py-2 px-4 shadow-sm"
              >
                Save Document to Dossier
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. EDIT / REPLACE DOCUMENT MODAL */}
      {editDocModal && (
        <div className="fixed inset-0 z-60 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start justify-between pb-3 border-b border-slate-200 mb-4">
              <div>
                <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block">
                  {editDocModal.categoryLabel}
                </span>
                <h4 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Pencil className="w-4 h-4 text-amber-600" />
                  Edit / Replace Document
                </h4>
              </div>
              <button
                onClick={() => setEditDocModal(null)}
                className="p-1 rounded text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Document Title
                </label>
                <input
                  type="text"
                  value={editDocTitle}
                  onChange={e => setEditDocTitle(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Current File vs Replace File */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Upload Replacement File (PDF / Word / Image)
                </label>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg mb-2">
                  <span className="text-[10px] text-slate-500 font-bold uppercase block">Current Document:</span>
                  <p className="text-xs font-semibold text-slate-800 font-mono truncate">{editDocModal.fileName}</p>
                </div>

                {replaceFile ? (
                  <div className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-300 rounded-lg">
                    <div className="flex items-center gap-2 min-w-0">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                      <div className="min-w-0">
                        <span className="text-xs font-semibold text-slate-800 block truncate" title={replaceFile.name}>
                          {replaceFile.name} (New)
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {formatFileSize(replaceFile.size)}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setReplaceFile(null)}
                      className="text-red-500 hover:text-red-700 p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <label className="border-2 border-dashed border-slate-300 hover:border-blue-400 hover:bg-blue-50/40 rounded-xl p-3 flex items-center justify-center gap-2 cursor-pointer transition-all">
                    <UploadCloud className="w-4 h-4 text-slate-500" />
                    <span className="text-xs font-semibold text-slate-700">Upload New PDF to Replace</span>
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      className="hidden"
                      onChange={e => handleNativeFileSelect(e, f => setReplaceFile(f))}
                    />
                  </label>
                )}
              </div>

              {/* Remarks */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Audit Remarks / Notes
                </label>
                <textarea
                  rows={2}
                  value={editDocRemarks}
                  onChange={e => setEditDocRemarks(e.target.value)}
                  placeholder="Enter audit notes or explanation..."
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditDocModal(null)}
                className="secondary-button text-xs py-2 px-3.5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveReplaceDoc}
                className="primary-button text-xs py-2 px-4 shadow-sm"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. EDIT TENDER DETAILS & AUDIT REMARKS MODAL */}
      {editDetailsOpen && (
        <div className="fixed inset-0 z-60 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-xl w-full p-6 max-h-[88vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start justify-between pb-3 border-b border-slate-200 mb-4 flex-shrink-0">
              <div>
                <h4 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Pencil className="w-4 h-4 text-blue-600" />
                  Edit Dossier Parameters & Remarks
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Update tender parameters, UTR reference, or audit remarks directly in Document Ready.
                </p>
              </div>
              <button
                onClick={() => setEditDetailsOpen(false)}
                className="p-1 rounded text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {/* General Tender Info */}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs font-bold text-slate-700 block mb-1">Tender Title</label>
                  <input
                    type="text"
                    value={tenderEditForm.title}
                    onChange={e => setTenderEditForm({ ...tenderEditForm, title: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500 font-semibold"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Authority</label>
                  <input
                    type="text"
                    value={tenderEditForm.authority}
                    onChange={e => setTenderEditForm({ ...tenderEditForm, authority: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Estimated Value</label>
                  <input
                    type="text"
                    value={tenderEditForm.value}
                    onChange={e => setTenderEditForm({ ...tenderEditForm, value: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* EMD Section */}
              <div className="p-3.5 bg-purple-50/60 border border-purple-200 rounded-xl space-y-3">
                <span className="text-xs font-bold text-purple-900 block flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-purple-700" />
                  EMD Payment Parameters
                </span>
                <div className="grid grid-cols-3 gap-2.5">
                  <div>
                    <label className="text-[11px] font-semibold text-purple-900 block mb-1">EMD Amount</label>
                    <input
                      type="text"
                      value={tenderEditForm.emdAmount}
                      onChange={e => setTenderEditForm({ ...tenderEditForm, emdAmount: e.target.value })}
                      placeholder="e.g. ₹ 5 Lakh"
                      className="w-full bg-white border border-purple-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-purple-900 block mb-1">UTR Number</label>
                    <input
                      type="text"
                      value={tenderEditForm.utrNumber}
                      onChange={e => setTenderEditForm({ ...tenderEditForm, utrNumber: e.target.value })}
                      placeholder="e.g. UTR1298402"
                      className="w-full bg-white border border-purple-200 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold uppercase"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-purple-900 block mb-1">Payment Date</label>
                    <input
                      type="date"
                      value={tenderEditForm.emdDate}
                      onChange={e => setTenderEditForm({ ...tenderEditForm, emdDate: e.target.value })}
                      className="w-full bg-white border border-purple-200 rounded-lg px-2.5 py-1.5 text-xs"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-purple-900 block mb-1">EMD Audit Remark</label>
                  <input
                    type="text"
                    value={tenderEditForm.emdRemarks}
                    onChange={e => setTenderEditForm({ ...tenderEditForm, emdRemarks: e.target.value })}
                    placeholder="EMD payment notes / reference"
                    className="w-full bg-white border border-purple-200 rounded-lg px-2.5 py-1.5 text-xs"
                  />
                </div>
              </div>

              {/* Stage Remarks */}
              <div className="space-y-2.5">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Eligibility Check Remark
                  </label>
                  <input
                    type="text"
                    value={tenderEditForm.eligibilityRemarks}
                    onChange={e => setTenderEditForm({ ...tenderEditForm, eligibilityRemarks: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Sample Details Remark
                  </label>
                  <input
                    type="text"
                    value={tenderEditForm.sampleRemarks}
                    onChange={e => setTenderEditForm({ ...tenderEditForm, sampleRemarks: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    General / Dossier Remark
                  </label>
                  <textarea
                    rows={2}
                    value={tenderEditForm.generalRemarks}
                    onChange={e => setTenderEditForm({ ...tenderEditForm, generalRemarks: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500 resize-none"
                  />
                </div>
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-slate-200 flex justify-end gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => setEditDetailsOpen(false)}
                className="secondary-button text-xs py-2 px-3.5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveTenderDetails}
                className="primary-button text-xs py-2 px-4 shadow-sm"
              >
                Save All Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. FILE PREVIEW SUB-MODAL */}
      {previewDoc && (
        <div className="fixed inset-0 z-60 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-2xl w-full p-5 max-h-[85vh] flex flex-col">
            <div className="flex items-start justify-between pb-3 border-b border-slate-200">
              <div>
                <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block">
                  {previewDoc.categoryLabel}
                </span>
                <h4 className="text-base font-bold text-slate-900">{previewDoc.title}</h4>
                <p className="text-xs text-slate-500 font-mono">{previewDoc.fileName}</p>
              </div>
              <button
                onClick={() => setPreviewDoc(null)}
                className="p-1 rounded text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4">
              {previewDoc.dataUrl && previewDoc.fileTypeGroup === 'image' ? (
                <div className="text-center">
                  <img
                    src={previewDoc.dataUrl}
                    alt={previewDoc.fileName}
                    className="max-h-[50vh] mx-auto rounded-lg shadow-sm border border-slate-200 object-contain"
                  />
                </div>
              ) : previewDoc.dataUrl && previewDoc.fileTypeGroup === 'pdf' ? (
                <div className="w-full flex-1 min-h-[500px] h-[65vh] rounded-xl overflow-hidden border border-slate-200 bg-white shadow-sm flex flex-col">
                  <iframe
                    src={dataUrlToBlobUrl(previewDoc.dataUrl)}
                    title={previewDoc.fileName}
                    className="w-full h-full border-0 rounded-xl"
                  />
                </div>
              ) : (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs font-mono space-y-2">
                  <div className="border-b border-slate-200 pb-2">
                    <span className="text-slate-400 block text-[10px]">DOCUMENT HEADER:</span>
                    <strong className="text-slate-800">{previewDoc.title}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">ORIGIN WORKFLOW:</span>
                    <span>{previewDoc.stageOrigin} ({previewDoc.sourceLabel})</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">RECORDED AT:</span>
                    <span>{new Date(previewDoc.uploadedAt).toLocaleString()}</span>
                  </div>
                  {previewDoc.referenceNote && (
                    <div>
                      <span className="text-slate-400 block text-[10px]">REFERENCE / EXTRACTED DATA:</span>
                      <span>{previewDoc.referenceNote}</span>
                    </div>
                  )}
                  {previewDoc.remarks && (
                    <div>
                      <span className="text-slate-400 block text-[10px]">AUDIT REMARKS:</span>
                      <span className="italic text-slate-700">{previewDoc.remarks}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-200 flex justify-end gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setPreviewDoc(null)}
                className="secondary-button text-xs py-1.5 px-3"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => handleDownload(previewDoc)}
                className="primary-button text-xs py-1.5 px-3"
              >
                <Download className="w-3.5 h-3.5" /> Download File
              </button>
              <button
                type="button"
                onClick={() => {
                  const docToEdit = previewDoc
                  setPreviewDoc(null)
                  handleOpenWordEditor(docToEdit)
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm"
              >
                <FileEdit className="w-3.5 h-3.5" /> Word / Edit Document
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Official Word / Editable Document Letter Editor Modal */}
      {wordEditorDoc && (
        <WordLetterEditorModal
          tender={tender}
          doc={wordEditorDoc}
          onClose={() => setWordEditorDoc(null)}
          onSave={handleSaveWordDocument}
        />
      )}
    </div>
  )
}
