'use client'

import React, { useState } from 'react'
import {
  Handshake,
  X,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Upload,
  FileText,
  Calendar,
  Building,
  ArrowRight,
  Loader2,
  History as HistoryIcon,
  Pencil,
  Eye,
  Trash2,
  Database,
  User,
  Paperclip,
} from 'lucide-react'
import {
  NegotiationData,
  NegotiationHistoryEntry,
  NegotiationStatus,
  SampleDocumentItem,
  Stage,
  Status,
  Tender,
} from '@/types/tender'

interface NegotiationModalProps {
  tender: Tender
  mode?: 'action' | 'edit' | 'view'
  onClose: () => void
  onSave: (updatedTender: Tender) => Promise<void> | void
}

export function NegotiationModal({
  tender,
  mode = 'action',
  onClose,
  onSave,
}: NegotiationModalProps) {
  const [currentMode, setCurrentMode] = useState<'action' | 'edit' | 'view'>(mode)
  const isViewOnly = currentMode === 'view'
  const [activeTab, setActiveTab] = useState<'form' | 'history'>('form')

  const existingData = tender.negotiation

  // 1. Status: Yes | No | Not Applicable
  const [status, setStatus] = useState<NegotiationStatus>(() => {
    return existingData?.status || 'Yes'
  })

  // 2. Attached Letter Document
  const [letterDoc, setLetterDoc] = useState<SampleDocumentItem | null>(() => {
    return existingData?.letterDoc || null
  })

  // 3. Negotiated Details
  const [negotiatedPrice, setNegotiatedPrice] = useState<string>(() => {
    return existingData?.negotiatedPrice || tender.financialOpenCheck?.ourBidPrice || tender.value || ''
  })
  const [meetingDate, setMeetingDate] = useState<string>(() => {
    return existingData?.meetingDate || new Date().toISOString().slice(0, 10)
  })

  // 4. Remark
  const [remarks, setRemarks] = useState<string>(() => {
    return existingData?.remarks || ''
  })

  const [advanceStage, setAdvanceStage] = useState<boolean>(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [uploadError, setUploadError] = useState('')

  // History entries
  const historyEntries: NegotiationHistoryEntry[] = React.useMemo(() => {
    return Array.isArray(existingData?.history) ? [...existingData.history] : []
  }, [existingData])

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadError('')
    if (file.size > 25 * 1024 * 1024) {
      setUploadError('File size exceeds 25 MB limit.')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const docItem: SampleDocumentItem = {
        id: `neg-doc-${Date.now()}`,
        name: file.name,
        size: file.size,
        type: file.type || 'application/pdf',
        uploadedAt: new Date().toISOString(),
        dataUrl: reader.result as string,
        source: 'manual-upload',
      }
      setLetterDoc(docItem)
    }
    reader.readAsDataURL(file)
  }

  const handleRemoveDoc = () => {
    setLetterDoc(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isViewOnly) return

    // Attached letter is required when Yes or No is selected
    if ((status === 'Yes' || status === 'No') && !letterDoc) {
      setUploadError('Please attach the negotiation or confirmation letter.')
      return
    }

    setIsSubmitting(true)

    try {
      const now = new Date()
      const nowIso = now.toISOString()
      const todayDate = nowIso.slice(0, 10)

      const newHistoryEntry: NegotiationHistoryEntry = {
        id: `neg-hist-${Date.now()}`,
        tenderId: tender.id,
        status,
        letterDoc,
        negotiatedPrice: status === 'Yes' ? negotiatedPrice : undefined,
        meetingDate,
        remarks: remarks.trim(),
        submittedAt: nowIso,
        submittedBy: tender.owner || 'Admin',
        completedAt: nowIso,
      }

      const updatedHistory = [newHistoryEntry, ...historyEntries]

      const negotiationData: NegotiationData = {
        status,
        letterDoc,
        negotiatedPrice: status === 'Yes' ? negotiatedPrice : undefined,
        meetingDate,
        remarks: remarks.trim(),
        submittedAt: nowIso,
        submittedBy: tender.owner || 'Admin',
        completedAt: nowIso,
        history: updatedHistory,
      }

      // Next stage is Stage 11: Work Order
      const nextStage: Stage = advanceStage ? 'Work Order' : tender.stage
      const newStatus: Status = advanceStage ? 'Ready' : 'Completed'

      const updatedTender: Tender = {
        ...tender,
        stage: nextStage,
        status: newStatus,
        remarks: remarks.trim() || tender.remarks,
        actual_date: todayDate,
        negotiation: negotiationData,
      }

      await onSave(updatedTender)
      onClose()
    } catch (err) {
      console.error('Error saving negotiation data:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 md:p-6 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden animate-scale-in my-auto">
        {/* 1. HEADER */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/80 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center shadow-md">
              <Handshake className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-slate-900">
                  {currentMode === 'view'
                    ? 'Negotiation – Details & History'
                    : currentMode === 'edit'
                    ? 'Edit Negotiation'
                    : 'Stage 10 • Negotiation'}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                  Stage 10
                </span>
                {existingData?.status && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                      existingData.status === 'Yes'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : existingData.status === 'No'
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-slate-100 text-slate-700 border-slate-300'
                    }`}
                  >
                    Negotiation: {existingData.status}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                <span className="font-mono font-bold text-slate-700">{tender.id}</span> • {tender.title.slice(0, 50)}...
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 2. CONTEXT BANNER */}
        <div className="px-6 py-2.5 bg-blue-50/50 border-b border-blue-100/70 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 flex-shrink-0">
          <div className="flex items-center gap-1.5">
            <Building className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
            <span className="font-semibold text-slate-800">{tender.authority}</span>
            <span>({tender.department})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <span>
              Estimated: <strong className="text-slate-800">{tender.value || 'N/A'}</strong>
            </span>
          </div>
        </div>

        {/* 3. TABS */}
        <div className="flex items-center border-b border-slate-200 bg-slate-50/50 px-6 pt-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('form')}
            className={`pb-2.5 px-3.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'form'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Negotiation Details</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`pb-2.5 px-3.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'history'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <HistoryIcon className="w-3.5 h-3.5" />
            <span>Submission History</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                historyEntries.length > 0 ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-600'
              }`}
            >
              {historyEntries.length}
            </span>
          </button>
        </div>

        {/* 4. SCROLLABLE BODY */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'form' ? (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* FIELD 1: STATUS (YES | NO | NOT APPLICABLE) */}
              <div>
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                  1. Status <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Option 1: Yes */}
                  <button
                    type="button"
                    disabled={isViewOnly}
                    onClick={() => {
                      setStatus('Yes')
                      setUploadError('')
                    }}
                    className={`p-3.5 rounded-xl border text-left flex items-start justify-between transition-all cursor-pointer disabled:cursor-default ${
                      status === 'Yes'
                        ? 'border-purple-600 bg-purple-50/70 ring-2 ring-purple-500/20 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-purple-600" />
                        <span className="text-sm font-bold text-slate-900">Yes – Negotiated</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                        Negotiations took place; requires attached letter/revised offer.
                      </p>
                    </div>
                    <div
                      className={`w-4 h-4 rounded-full border flex items-center justify-center mt-0.5 flex-shrink-0 ${
                        status === 'Yes' ? 'border-purple-600 bg-purple-600 text-white' : 'border-slate-300'
                      }`}
                    >
                      {status === 'Yes' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                  </button>

                  {/* Option 2: No */}
                  <button
                    type="button"
                    disabled={isViewOnly}
                    onClick={() => {
                      setStatus('No')
                      setUploadError('')
                    }}
                    className={`p-3.5 rounded-xl border text-left flex items-start justify-between transition-all cursor-pointer disabled:cursor-default ${
                      status === 'No'
                        ? 'border-amber-600 bg-amber-50/70 ring-2 ring-amber-500/20 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <XCircle className="w-4 h-4 text-amber-600" />
                        <span className="text-sm font-bold text-slate-900">No – No Negotiation</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                        No negotiation held; final pricing confirmed as per bid.
                      </p>
                    </div>
                    <div
                      className={`w-4 h-4 rounded-full border flex items-center justify-center mt-0.5 flex-shrink-0 ${
                        status === 'No' ? 'border-amber-600 bg-amber-600 text-white' : 'border-slate-300'
                      }`}
                    >
                      {status === 'No' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                  </button>

                  {/* Option 3: Not Applicable */}
                  <button
                    type="button"
                    disabled={isViewOnly}
                    onClick={() => {
                      setStatus('Not Applicable')
                      setUploadError('')
                    }}
                    className={`p-3.5 rounded-xl border text-left flex items-start justify-between transition-all cursor-pointer disabled:cursor-default ${
                      status === 'Not Applicable'
                        ? 'border-slate-600 bg-slate-100 ring-2 ring-slate-500/20 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <HelpCircle className="w-4 h-4 text-slate-600" />
                        <span className="text-sm font-bold text-slate-900">Not Applicable</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                        Negotiation stage not applicable; attachment optional.
                      </p>
                    </div>
                    <div
                      className={`w-4 h-4 rounded-full border flex items-center justify-center mt-0.5 flex-shrink-0 ${
                        status === 'Not Applicable' ? 'border-slate-600 bg-slate-600 text-white' : 'border-slate-300'
                      }`}
                    >
                      {status === 'Not Applicable' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                  </button>
                </div>
              </div>

              {/* FIELD 2: ATTACHED LETTER (SHOWN WHEN YES OR NO IS SELECTED) */}
              {(status === 'Yes' || status === 'No') && (
                <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <div className="flex items-center gap-2">
                      <Paperclip className="w-4 h-4 text-purple-600" />
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                        2. Attached Letter <span className="text-red-500">*</span>
                      </h4>
                    </div>
                    <span className="text-[10px] text-slate-500">
                      Supports PDF, PNG, JPG, DOCX
                    </span>
                  </div>

                  {letterDoc ? (
                    <div className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between gap-3 shadow-2xs">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center font-bold text-xs">
                          DOC
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-800 truncate max-w-xs">{letterDoc.name}</p>
                          <p className="text-[10px] text-slate-400">
                            {letterDoc.size ? `${(letterDoc.size / 1024).toFixed(1)} KB` : 'Uploaded'} •{' '}
                            {new Date(letterDoc.uploadedAt).toLocaleDateString('en-IN')}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {letterDoc.dataUrl && (
                          <a
                            href={letterDoc.dataUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            title="View Document"
                          >
                            <Eye className="w-4 h-4" />
                          </a>
                        )}
                        {!isViewOnly && (
                          <button
                            type="button"
                            onClick={handleRemoveDoc}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            title="Remove Document"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div>
                      {!isViewOnly ? (
                        <label className="border-2 border-dashed border-slate-300 hover:border-purple-500 rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer bg-white transition-all">
                          <Upload className="w-6 h-6 text-purple-600 mb-1.5" />
                          <span className="text-xs font-bold text-slate-800">
                            Click to upload Negotiation / Confirmation Letter
                          </span>
                          <span className="text-[11px] text-slate-400 mt-0.5">
                            Upload PDF, Image, or DOCX (Max 25 MB)
                          </span>
                          <input
                            type="file"
                            accept=".pdf,image/*,.docx,.doc"
                            onChange={handleFileUpload}
                            className="hidden"
                          />
                        </label>
                      ) : (
                        <div className="p-4 bg-white border border-slate-200 rounded-xl text-center text-xs text-slate-400 italic">
                          No attached letter uploaded.
                        </div>
                      )}
                    </div>
                  )}

                  {uploadError && (
                    <p className="text-xs text-rose-600 font-semibold">{uploadError}</p>
                  )}
                </div>
              )}

              {/* NEGOTIATION PRICE & MEETING DATE (WHEN YES) */}
              {status === 'Yes' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Final Negotiated Contract Price
                    </label>
                    <input
                      type="text"
                      disabled={isViewOnly}
                      value={negotiatedPrice}
                      onChange={e => setNegotiatedPrice(e.target.value)}
                      placeholder="e.g. ₹ 2,80,00,000"
                      className="w-full text-xs sm:text-sm px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-blue-500 text-slate-800 font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Negotiation Meeting Date
                    </label>
                    <input
                      type="date"
                      disabled={isViewOnly}
                      value={meetingDate}
                      onChange={e => setMeetingDate(e.target.value)}
                      className="w-full text-xs sm:text-sm px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-blue-500 text-slate-800"
                    />
                  </div>
                </div>
              )}

              {/* FIELD 3: REMARK */}
              <div>
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
                  3. Remark
                </label>
                <textarea
                  rows={2}
                  disabled={isViewOnly}
                  value={remarks}
                  onChange={e => setRemarks(e.target.value)}
                  placeholder="Enter manual remarks regarding negotiation meeting, committee discussions, discounts granted..."
                  className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white focus:bg-white focus:outline-none focus:border-blue-500 transition-all resize-none text-slate-800"
                />
              </div>

              {/* ADVANCE TO STAGE 11 TOGGLE */}
              {!isViewOnly && (
                <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span className="text-emerald-900 font-medium">
                      Advance to next stage: <strong>Stage 11 • Work Order</strong>
                    </span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={advanceStage}
                      onChange={e => setAdvanceStage(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>
              )}
            </form>
          ) : (
            /* HISTORY TAB */
            <div className="space-y-3.5">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <HistoryIcon className="w-4 h-4 text-blue-600" />
                    Negotiation History Log ({historyEntries.length})
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Audit trail of all recorded negotiation decisions for this tender.
                  </p>
                </div>
              </div>

              {historyEntries.length === 0 ? (
                <div className="text-center py-10 bg-slate-50 rounded-xl border border-slate-200 p-6">
                  <HistoryIcon className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-slate-700">No negotiation history recorded yet.</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Submit negotiation status to record your first audit log entry.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {historyEntries.map((entry, idx) => (
                    <div
                      key={entry.id || idx}
                      className="border border-slate-200 bg-white rounded-xl p-4 shadow-2xs hover:border-slate-300 transition-all"
                    >
                      <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                            #{historyEntries.length - idx}
                          </span>
                          <span className="text-xs font-mono font-bold text-slate-900">
                            {entry.tenderId || tender.id}
                          </span>
                          <span
                            className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${
                              entry.status === 'Yes'
                                ? 'bg-purple-50 text-purple-700 border-purple-200'
                                : entry.status === 'No'
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-slate-100 text-slate-700 border-slate-300'
                            }`}
                          >
                            Status: {entry.status}
                          </span>
                        </div>

                        <div className="text-[11px] text-slate-500 font-mono">
                          {entry.submittedAt
                            ? new Date(entry.submittedAt).toLocaleString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '—'}
                        </div>
                      </div>

                      {entry.letterDoc && (
                        <div className="my-2 p-2 bg-slate-50 rounded-lg border border-slate-100 flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1.5 font-medium text-slate-800">
                            <Paperclip className="w-3.5 h-3.5 text-purple-600" />
                            {entry.letterDoc.name}
                          </span>
                          {entry.letterDoc.dataUrl && (
                            <a
                              href={entry.letterDoc.dataUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 text-[11px] font-semibold underline"
                            >
                              View File
                            </a>
                          )}
                        </div>
                      )}

                      {entry.negotiatedPrice && (
                        <div className="text-xs text-slate-700 my-1">
                          Negotiated Price: <strong className="text-slate-900">{entry.negotiatedPrice}</strong>
                        </div>
                      )}

                      {entry.remarks ? (
                        <div className="text-xs text-slate-700 mt-1">
                          <span className="font-semibold text-slate-800 block text-[11px]">Remark:</span>
                          {entry.remarks}
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-400 italic">No remarks entered.</div>
                      )}

                      <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3 text-slate-400" />
                          Recorded by: <strong className="text-slate-700">{entry.submittedBy || 'Admin'}</strong>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 5. FOOTER */}
        <div className="p-4 md:p-5 border-t border-slate-200 bg-slate-50/80 flex items-center justify-between gap-3 flex-shrink-0 flex-wrap">
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 font-medium">
            <Database className="w-3.5 h-3.5 text-emerald-600" />
            <span>Saves to Supabase Database</span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-semibold transition-colors cursor-pointer"
            >
              {isViewOnly ? 'Close' : 'Cancel'}
            </button>

            {isViewOnly ? (
              <button
                type="button"
                onClick={() => setCurrentMode('edit')}
                className="px-4 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Edit Negotiation</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving to Database...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Save &amp; Process</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
