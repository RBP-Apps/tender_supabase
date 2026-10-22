'use client'

import React, { useState, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import {
  X,
  Download,
  FileText,
  FileCheck2,
  Trash2,
  Pencil,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Plus,
  Save,
  CheckCircle2,
  AlertCircle,
  Eye,
  Settings,
  Layers,
  FileEdit,
  Loader2,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  Building,
  CheckSquare,
  Square,
  Bold,
  Italic,
  Underline,
  List,
  Heading,
} from 'lucide-react'
import {
  Tender,
  PortalChecklistItem,
  PortalUploadDocumentItem,
  CompanyDocumentItem,
} from '@/types/tender'
import { useTenders } from '@/context/TenderContext'
import {
  CombinedDocumentItem,
  generateInitialCombinedDocs,
  downloadCombinedDocx,
  buildCombinedDocxBlob,
} from '@/lib/combined-word-builder'
import { formatFileSize } from '@/lib/document-ready-collector'

export interface AllDocumentsSummaryModalProps {
  tender: Tender
  checklist?: PortalChecklistItem[]
  documents?: PortalUploadDocumentItem[]
  onClose: () => void
  onSave?: (updatedTender: Tender) => void
}

export function AllDocumentsSummaryModal({
  tender,
  checklist = tender.documentReady?.checklist || tender.portalUpload?.checklist || [],
  documents = [
    ...(tender.documentReady?.checklistDocs || []),
    ...(tender.portalUpload?.documents || []),
  ],
  onClose,
  onSave,
}: AllDocumentsSummaryModalProps) {
  const { companyDocs, updateTender, notify } = useTenders()

  // 1. Compiled Documents State
  const [docItems, setDocItems] = useState<CombinedDocumentItem[]>(() => {
    return generateInitialCombinedDocs(tender, checklist, documents)
  })

  // 2. Master Signature & Seal Selection State (strictly sourced from companyDocs)
  const [applySignatureAndSeal, setApplySignatureAndSeal] = useState<boolean>(true)
  const [applySignature, setApplySignature] = useState<boolean>(true)
  const [applySeal, setApplySeal] = useState<boolean>(true)

  // 3. View Mode: 'word-view' (A4 Word pages) | 'list-view' (compact manager)
  const [viewMode, setViewMode] = useState<'word-view' | 'list-view'>('word-view')

  // 4. Editing state for a specific document
  const [editingDocId, setEditingDocId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editRemarks, setEditRemarks] = useState('')
  const [editContentHtml, setEditContentHtml] = useState('')

  // 5. Download loading state
  const [isDownloading, setIsDownloading] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Active (included) documents
  const activeDocs = useMemo(() => {
    return docItems.filter(d => d.included).sort((a, b) => a.order - b.order)
  }, [docItems])

  const excludedDocs = useMemo(() => {
    return docItems.filter(d => !d.included)
  }, [docItems])

  // Master Signature & Seal availability
  const hasMasterSignature = Boolean(companyDocs.signatureDoc?.dataUrl || companyDocs.signatureDoc?.name)
  const hasMasterSeal = Boolean(companyDocs.sealDoc?.dataUrl || companyDocs.sealDoc?.name)

  // Open Edit Mode for a document
  const handleStartEdit = (doc: CombinedDocumentItem) => {
    setEditingDocId(doc.id)
    setEditTitle(doc.title)
    setEditRemarks(doc.remarks || '')
    setEditContentHtml(doc.contentHtml)
  }

  // Update Document Changes
  const handleUpdateDocument = () => {
    if (!editingDocId) return

    setDocItems(prev =>
      prev.map(item => {
        if (item.id === editingDocId) {
          return {
            ...item,
            title: editTitle.trim() || item.title,
            remarks: editRemarks.trim(),
            contentHtml: editContentHtml,
          }
        }
        return item
      })
    )

    setEditingDocId(null)
    notify(`Document "${editTitle || 'Item'}" updated successfully.`)
  }

  // Cancel Edit
  const handleCancelEdit = () => {
    setEditingDocId(null)
  }

  // Delete / Exclude Document from Word dossier
  const handleDeleteDocument = (id: string) => {
    const target = docItems.find(d => d.id === id)
    setDocItems(prev =>
      prev.map(item => (item.id === id ? { ...item, included: false } : item))
    )
    if (editingDocId === id) setEditingDocId(null)
    notify(`Document "${target?.title || 'Document'}" removed from Word summary.`)
  }

  // Restore Excluded Document
  const handleRestoreDocument = (id: string) => {
    setDocItems(prev =>
      prev.map(item => (item.id === id ? { ...item, included: true } : item))
    )
    notify(`Document restored to Word summary.`)
  }

  // Move document Up
  const handleMoveUp = (index: number) => {
    if (index <= 0) return
    const currentActive = [...activeDocs]
    const temp = currentActive[index - 1]
    currentActive[index - 1] = currentActive[index]
    currentActive[index] = temp

    // Reassign order
    const updatedOrderMap = new Map<string, number>()
    currentActive.forEach((doc, idx) => updatedOrderMap.set(doc.id, idx + 1))

    setDocItems(prev =>
      prev.map(doc => {
        const newOrder = updatedOrderMap.get(doc.id)
        return newOrder !== undefined ? { ...doc, order: newOrder } : doc
      })
    )
  }

  // Move document Down
  const handleMoveDown = (index: number) => {
    if (index >= activeDocs.length - 1) return
    const currentActive = [...activeDocs]
    const temp = currentActive[index + 1]
    currentActive[index + 1] = currentActive[index]
    currentActive[index] = temp

    const updatedOrderMap = new Map<string, number>()
    currentActive.forEach((doc, idx) => updatedOrderMap.set(doc.id, idx + 1))

    setDocItems(prev =>
      prev.map(doc => {
        const newOrder = updatedOrderMap.get(doc.id)
        return newOrder !== undefined ? { ...doc, order: newOrder } : doc
      })
    )
  }

  // Download Genuine Word Document (.docx)
  const handleDownloadDocx = async () => {
    setIsDownloading(true)
    try {
      await downloadCombinedDocx({
        tender,
        documents: docItems,
        applySignature: applySignatureAndSeal && applySignature && hasMasterSignature,
        applySeal: applySignatureAndSeal && applySeal && hasMasterSeal,
        signatureDoc: companyDocs.signatureDoc,
        sealDoc: companyDocs.sealDoc,
      })
      notify(`Word document (.docx) downloaded successfully!`)
    } catch (err) {
      console.error('Failed to generate Word document:', err)
      notify('Failed to generate Word document. Please try again.')
    } finally {
      setIsDownloading(false)
    }
  }

  // Save changes back to tender state
  const handleSaveToTender = () => {
    const updatedTender: Tender = {
      ...tender,
      documentReady: {
        ...(tender.documentReady || { checklist: [] }),
        combinedWordSummary: {
          documents: docItems,
          applySignature,
          applySeal,
          lastGeneratedAt: new Date().toISOString(),
        },
      },
    }

    if (onSave) {
      onSave(updatedTender)
    } else {
      updateTender(tender.id, updatedTender)
    }

    setSaveSuccess(true)
    setTimeout(() => setSaveSuccess(false), 2500)
    notify(`All Documents Summary saved to tender dossier.`)
  }

  return (
    <div className="fixed inset-0 z-60 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-2 md:p-5 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-6xl h-[94vh] flex flex-col overflow-hidden">
        {/* Top Header */}
        <div className="p-4 md:p-5 border-b border-slate-200 bg-gradient-to-r from-blue-900 via-slate-900 to-indigo-950 text-white flex items-start justify-between gap-4 flex-shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-300 bg-blue-500/20 border border-blue-400/30 px-2.5 py-0.5 rounded-full flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" />
                STAGE 05 · ALL DOCUMENTS SUMMARY
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300 bg-emerald-500/20 border border-emerald-400/30 px-2.5 py-0.5 rounded-full">
                Single Word Dossier (.docx)
              </span>
              <span className="text-xs text-slate-300">
                Tender ID: <strong className="font-mono text-white">{tender.id}</strong>
              </span>
            </div>
            <h2 className="text-base md:text-xl font-bold text-white leading-snug">
              All Documents Summary · Combined Word File (.docx)
            </h2>
            <p className="text-xs text-slate-300 mt-0.5">
              {tender.title} · <strong className="text-white">{tender.authority}</strong>
            </p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Download Word Document Button */}
            <button
              type="button"
              onClick={handleDownloadDocx}
              disabled={isDownloading || activeDocs.length === 0}
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs py-2 px-3.5 rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              title="Download compiled Word document (.docx) with all pages and Master Signature & Seal"
            >
              {isDownloading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span>{isDownloading ? 'Generating .docx...' : 'Download Word File (.docx)'}</span>
            </button>

            {/* Save Dossier Changes */}
            <button
              type="button"
              onClick={handleSaveToTender}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs py-2 px-3 rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
              title="Save all edits to tender"
            >
              <Save className="w-4 h-4" />
              <span>{saveSuccess ? 'Saved!' : 'Save Summary'}</span>
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="Close Summary"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Master Signature & Seal Selection Bar (Strictly sourced from Master Settings) */}
        <div className="px-4 md:px-6 py-3 border-b border-slate-200 bg-slate-50/95 flex-shrink-0 space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 font-bold text-xs text-slate-900 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={applySignatureAndSeal}
                  onChange={e => setApplySignatureAndSeal(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                />
                <span className="flex items-center gap-1.5 text-blue-900">
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                  Har Page Ke Last Mein Signature And Seal Add Karo
                </span>
              </label>
              <span className="text-[11px] text-slate-500 hidden md:inline">
                (Word document ke har page ke footer mein apply hoga)
              </span>
            </div>

            {/* View Mode Toggle: Word Multi-Page vs Compact List */}
            <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-slate-300">
              <button
                type="button"
                onClick={() => setViewMode('word-view')}
                className={`text-xs font-semibold px-2.5 py-1 rounded-md transition-colors flex items-center gap-1.5 ${
                  viewMode === 'word-view'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Word Pages View ({activeDocs.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list-view')}
                className={`text-xs font-semibold px-2.5 py-1 rounded-md transition-colors flex items-center gap-1.5 ${
                  viewMode === 'list-view'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Documents Manager ({docItems.length})</span>
              </button>
            </div>
          </div>

          {/* Master Signature & Seal Selection Cards */}
          {applySignatureAndSeal && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              {/* Card 1: Master Authorised Signatory */}
              <div
                className={`border rounded-xl p-2.5 flex items-center justify-between gap-3 text-xs transition-all ${
                  applySignature && hasMasterSignature
                    ? 'bg-blue-50/70 border-blue-300'
                    : 'bg-white border-slate-200 opacity-90'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <input
                    type="checkbox"
                    id="apply-sig"
                    disabled={!hasMasterSignature}
                    checked={applySignature && hasMasterSignature}
                    onChange={e => setApplySignature(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                  />
                  <div className="min-w-0">
                    <label htmlFor="apply-sig" className="font-bold text-slate-800 block cursor-pointer">
                      Authorised Signatory
                    </label>
                    {hasMasterSignature ? (
                      <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-slate-600 truncate">
                        <span className="font-semibold text-blue-900 truncate">
                          {companyDocs.signatureDoc?.value || 'Authorised Signatory'}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          ({companyDocs.signatureDoc?.name})
                        </span>
                        <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded">
                          Master
                        </span>
                      </div>
                    ) : (
                      <p className="text-[11px] text-amber-700 mt-0.5 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3 text-amber-600" />
                        <span>Master section mein signature uploaded nahi hai.</span>
                        <Link href="/settings" className="underline font-bold text-blue-700">
                          Master Settings
                        </Link>
                      </p>
                    )}
                  </div>
                </div>

                {/* Thumbnail Preview */}
                {companyDocs.signatureDoc?.dataUrl && (
                  <div className="w-14 h-9 rounded border border-slate-300 bg-white p-0.5 flex items-center justify-center overflow-hidden flex-shrink-0">
                    <img
                      src={companyDocs.signatureDoc.dataUrl}
                      alt="Sign"
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                )}
              </div>

              {/* Card 2: Master Company Seal / Stamp */}
              <div
                className={`border rounded-xl p-2.5 flex items-center justify-between gap-3 text-xs transition-all ${
                  applySeal && hasMasterSeal
                    ? 'bg-blue-50/70 border-blue-300'
                    : 'bg-white border-slate-200 opacity-90'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <input
                    type="checkbox"
                    id="apply-seal"
                    disabled={!hasMasterSeal}
                    checked={applySeal && hasMasterSeal}
                    onChange={e => setApplySeal(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                  />
                  <div className="min-w-0">
                    <label htmlFor="apply-seal" className="font-bold text-slate-800 block cursor-pointer">
                      Company Seal / Stamp
                    </label>
                    {hasMasterSeal ? (
                      <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-slate-600 truncate">
                        <span className="font-semibold text-blue-900 truncate">
                          {companyDocs.sealDoc?.value || 'Official Company Seal'}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          ({companyDocs.sealDoc?.name})
                        </span>
                        <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded">
                          Master
                        </span>
                      </div>
                    ) : (
                      <p className="text-[11px] text-amber-700 mt-0.5 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3 text-amber-600" />
                        <span>Master section mein seal uploaded nahi hai.</span>
                        <Link href="/settings" className="underline font-bold text-blue-700">
                          Master Settings
                        </Link>
                      </p>
                    )}
                  </div>
                </div>

                {/* Thumbnail Preview */}
                {companyDocs.sealDoc?.dataUrl && (
                  <div className="w-10 h-10 rounded border border-slate-300 bg-white p-0.5 flex items-center justify-center overflow-hidden flex-shrink-0">
                    <img
                      src={companyDocs.sealDoc.dataUrl}
                      alt="Seal"
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          <p className="text-[11px] text-slate-500 italic">
            * Signature aur seal wahi use hoti hain jo Master section mein uploaded hain. Yahan alag se upload option nahi hai.
          </p>
        </div>

        {/* Modal Main Content Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-100">
          {/* Excluded Documents Alert Notice */}
          {excludedDocs.length > 0 && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 text-amber-800">
                <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <span>
                  <strong>{excludedDocs.length} Document(s)</strong> deleted / excluded from Word summary:
                  {' ' + excludedDocs.map(d => d.title).join(', ')}
                </span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {excludedDocs.map(d => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => handleRestoreDocument(d.id)}
                    className="text-[11px] font-bold text-blue-700 bg-white border border-blue-200 hover:bg-blue-50 px-2 py-0.5 rounded cursor-pointer flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Restore {d.title.slice(0, 15)}...</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* VIEW MODE 1: WORD MULTI-PAGE VIEW (Visual A4 Sheets with Page Breaks & Footers) */}
          {viewMode === 'word-view' && (
            <div className="space-y-8 max-w-4xl mx-auto">
              {activeDocs.map((doc, idx) => {
                const isFirst = idx === 0
                const isLast = idx === activeDocs.length - 1

                return (
                  <div
                    key={doc.id}
                    className="bg-white rounded-xl shadow-lg border border-slate-300 overflow-hidden relative flex flex-col"
                  >
                    {/* Word Page Action Ribbon */}
                    <div className="px-4 py-2 bg-slate-800 text-white flex items-center justify-between gap-3 text-xs flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-blue-300 bg-blue-500/20 px-2 py-0.5 rounded border border-blue-400/30 font-mono text-[11px]">
                          PAGE {idx + 1} OF {activeDocs.length}
                        </span>
                        <strong className="text-white truncate max-w-md">{doc.title}</strong>
                        {doc.envelope && (
                          <span className="text-[10px] text-slate-300 font-semibold bg-white/10 px-1.5 py-0.2 rounded hidden sm:inline">
                            {doc.envelope}
                          </span>
                        )}
                      </div>

                      {/* Action Buttons: Edit, Delete, Reorder */}
                      <div className="flex items-center gap-1.5">
                        {/* Move Up */}
                        <button
                          type="button"
                          disabled={isFirst}
                          onClick={() => handleMoveUp(idx)}
                          className="p-1 rounded text-slate-300 hover:text-white hover:bg-white/10 disabled:opacity-30 cursor-pointer"
                          title="Move Page Up"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>

                        {/* Move Down */}
                        <button
                          type="button"
                          disabled={isLast}
                          onClick={() => handleMoveDown(idx)}
                          className="p-1 rounded text-slate-300 hover:text-white hover:bg-white/10 disabled:opacity-30 cursor-pointer"
                          title="Move Page Down"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>

                        <div className="w-[1px] h-3.5 bg-slate-600 mx-1" />

                        {/* Edit Button */}
                        <button
                          type="button"
                          onClick={() => handleStartEdit(doc)}
                          className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-2.5 py-1 rounded-md text-[11px] flex items-center gap-1 cursor-pointer transition-colors"
                          title="Edit Document text and formatting"
                        >
                          <Pencil className="w-3 h-3" />
                          <span>Edit</span>
                        </button>

                        {/* Delete Button */}
                        <button
                          type="button"
                          onClick={() => handleDeleteDocument(doc.id)}
                          className="bg-rose-600 hover:bg-rose-500 text-white font-semibold px-2 py-1 rounded-md text-[11px] flex items-center gap-1 cursor-pointer transition-colors"
                          title="Delete / Exclude this document from Word file"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>

                    {/* Word Page Content Body (Rendered HTML) */}
                    <div className="p-6 md:p-8 space-y-4 min-h-[460px] flex-1">
                      <div
                        className="prose max-w-none text-slate-800 text-sm leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: doc.contentHtml }}
                      />
                    </div>

                    {/* Bottom of EVERY Page: Master Signature and Seal Footer */}
                    {applySignatureAndSeal && (
                      <div className="mx-6 md:mx-8 mb-6 pt-4 border-t-2 border-slate-200 flex items-end justify-between gap-4 text-xs bg-slate-50/60 p-4 rounded-xl border">
                        {/* Left: Company Seal */}
                        <div className="flex items-center gap-3">
                          {applySeal && hasMasterSeal && companyDocs.sealDoc?.dataUrl && (
                            <img
                              src={companyDocs.sealDoc.dataUrl}
                              alt="Master Seal"
                              className="w-14 h-14 object-contain rounded border border-slate-200 bg-white p-0.5 shadow-2xs"
                            />
                          )}
                          <div>
                            <span className="font-bold text-slate-900 block text-[11px] uppercase tracking-wide">
                              Company Seal & Stamp
                            </span>
                            <span className="text-[11px] text-slate-600 italic block">
                              {companyDocs.sealDoc?.value || 'ROTOMAG ENERTEC LIMITED'}
                            </span>
                            <span className="text-[10px] text-emerald-700 font-bold">
                              ✓ Master Stamped
                            </span>
                          </div>
                        </div>

                        {/* Page Number Center */}
                        <div className="text-center hidden sm:block">
                          <span className="text-[11px] font-mono text-slate-400">
                            — Page {idx + 1} of {activeDocs.length} —
                          </span>
                        </div>

                        {/* Right: Authorised Signatory */}
                        <div className="text-right flex flex-col items-end">
                          {applySignature && hasMasterSignature && companyDocs.signatureDoc?.dataUrl && (
                            <img
                              src={companyDocs.signatureDoc.dataUrl}
                              alt="Master Signature"
                              className="h-10 max-w-[140px] object-contain rounded bg-white p-0.5 mb-1"
                            />
                          )}
                          <span className="font-bold text-slate-900 block text-[11px] uppercase tracking-wide">
                            For Rotomag Enertec Limited
                          </span>
                          <span className="text-[11px] font-bold text-blue-900 block">
                            {companyDocs.signatureDoc?.value || 'Authorised Signatory'}
                          </span>
                          <span className="text-[10px] text-slate-500 italic block">
                            Authorised Signatory
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* VIEW MODE 2: COMPACT LIST & PAGE MANAGER */}
          {viewMode === 'list-view' && (
            <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-800">
                    Compiled Documents Sequence ({activeDocs.length} Active / {docItems.length} Total)
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Each item forms a distinct page in the combined Word document (.docx). You can edit, update, reorder or delete any page.
                  </p>
                </div>
              </div>

              <div className="divide-y divide-slate-200">
                {docItems.map((doc, idx) => {
                  const activeIndex = activeDocs.findIndex(d => d.id === doc.id)
                  const isFirst = activeIndex === 0
                  const isLast = activeIndex === activeDocs.length - 1

                  return (
                    <div
                      key={doc.id}
                      className={`p-3.5 flex items-center justify-between gap-3 text-xs transition-colors ${
                        doc.included ? 'hover:bg-slate-50' : 'bg-slate-100/70 opacity-60'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span
                          className={`w-7 h-7 rounded-lg font-bold flex items-center justify-center flex-shrink-0 text-xs ${
                            doc.included
                              ? 'bg-blue-100 text-blue-800 border border-blue-200'
                              : 'bg-slate-200 text-slate-500'
                          }`}
                        >
                          {doc.included ? activeIndex + 1 : '—'}
                        </span>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <strong className="text-slate-900 font-semibold truncate">
                              {doc.title}
                            </strong>
                            {doc.envelope && (
                              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 border border-slate-200">
                                {doc.envelope}
                              </span>
                            )}
                            {!doc.included && (
                              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-rose-100 text-rose-800 border border-rose-200">
                                Excluded / Deleted
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                            File: {doc.fileName} {doc.clauseOrPageRef ? `· ${doc.clauseOrPageRef}` : ''}
                          </p>
                        </div>
                      </div>

                      {/* Row Actions */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {doc.included ? (
                          <>
                            <button
                              type="button"
                              disabled={isFirst}
                              onClick={() => handleMoveUp(activeIndex)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200 disabled:opacity-30 cursor-pointer"
                              title="Move Up"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={isLast}
                              onClick={() => handleMoveDown(activeIndex)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200 disabled:opacity-30 cursor-pointer"
                              title="Move Down"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleStartEdit(doc)}
                              className="secondary-button text-xs py-1 px-2.5 flex items-center gap-1 cursor-pointer"
                              title="Edit text"
                            >
                              <Pencil className="w-3 h-3" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteDocument(doc.id)}
                              className="text-rose-600 hover:text-rose-800 hover:bg-rose-50 p-1.5 rounded-lg cursor-pointer"
                              title="Delete from Word summary"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleRestoreDocument(doc.id)}
                            className="primary-button text-xs py-1 px-2.5 flex items-center gap-1 cursor-pointer"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Restore</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 md:p-5 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3 flex-shrink-0 flex-wrap">
          <div className="text-xs text-slate-600 flex items-center gap-3 flex-wrap">
            <span className="flex items-center gap-1.5 font-bold text-slate-800">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              {activeDocs.length} Documents compiled into Word dossier (.docx)
            </span>
            <span>·</span>
            <span>
              Signature: {applySignature && hasMasterSignature ? '✓ Enabled' : 'Off'}
            </span>
            <span>·</span>
            <span>Seal: {applySeal && hasMasterSeal ? '✓ Enabled' : 'Off'}</span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="secondary-button text-xs py-2 px-4 cursor-pointer"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleDownloadDocx}
              disabled={isDownloading || activeDocs.length === 0}
              className="primary-button text-xs py-2 px-4.5 bg-blue-600 hover:bg-blue-700 flex items-center gap-2 cursor-pointer shadow-sm"
            >
              {isDownloading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span>Download Word File (.docx)</span>
            </button>
          </div>
        </div>
      </div>

      {/* INLINE DOCUMENT EDITOR MODAL (Edit & Update Requirement) */}
      {editingDocId && (
        <div className="fixed inset-0 z-70 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 md:p-6">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Editor Header */}
            <div className="px-5 py-4 border-b border-slate-200 bg-slate-900 text-white flex items-center justify-between gap-3 flex-shrink-0">
              <div>
                <span className="text-[10px] font-bold text-blue-300 uppercase tracking-wider block">
                  EDIT DOCUMENT IN WORD DOSSIER
                </span>
                <h3 className="text-sm md:text-base font-bold text-white truncate max-w-md">
                  {editTitle}
                </h3>
              </div>
              <button
                type="button"
                onClick={handleCancelEdit}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Editor Fields */}
            <div className="flex-1 overflow-y-auto p-5 md:p-6 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Document Title:
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Document Remarks / Compliance Notes:
                </label>
                <input
                  type="text"
                  value={editRemarks}
                  onChange={e => setEditRemarks(e.target.value)}
                  placeholder="e.g. Duly verified against tender specification clause 4.1"
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700 block">
                    Document Content (Formatted HTML / Text):
                  </label>
                  <span className="text-[10px] text-slate-500">
                    Supports tables, headings, and formatted statements
                  </span>
                </div>
                <textarea
                  rows={14}
                  value={editContentHtml}
                  onChange={e => setEditContentHtml(e.target.value)}
                  className="w-full font-mono text-xs border border-slate-300 rounded-lg p-3 text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-500 leading-relaxed"
                />
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-600 flex-shrink-0" />
                <span>
                  Updates made here will be reflected instantly in the Word document (.docx) and stamped with Master Signature & Seal.
                </span>
              </div>
            </div>

            {/* Editor Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2.5 flex-shrink-0">
              <button
                type="button"
                onClick={handleCancelEdit}
                className="secondary-button text-xs py-2 px-4 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUpdateDocument}
                className="primary-button text-xs py-2 px-5 bg-blue-600 hover:bg-blue-700 flex items-center gap-1.5 font-bold cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>Update Document</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
