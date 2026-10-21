'use client'

import React, { useState } from 'react'
import {
  Settings2,
  X,
  CheckCircle2,
  XCircle,
  AlertOctagon,
  Calendar,
  Clock,
  Sparkles,
  Database,
  Building,
  Layers,
  ArrowRight,
  Loader2,
  History as HistoryIcon,
  Pencil,
  FileText,
  User,
  Globe,
  Info,
  Upload,
  FileUp,
} from 'lucide-react'
import {
  Stage,
  Status,
  TechnicalOpenCheckData,
  TechnicalOpenCheckHistoryEntry,
  TechnicalOpenStatus,
  Tender,
} from '@/types/tender'

interface TechnicalOpenCheckModalProps {
  tender: Tender
  mode?: 'action' | 'edit' | 'view'
  onClose: () => void
  onSave: (updatedTender: Tender) => Promise<void> | void
}

export function TechnicalOpenCheckModal({
  tender,
  mode = 'action',
  onClose,
  onSave,
}: TechnicalOpenCheckModalProps) {
  const [currentMode, setCurrentMode] = useState<'action' | 'edit' | 'view'>(mode)
  const isViewOnly = currentMode === 'view'
  const [activeTab, setActiveTab] = useState<'form' | 'history'>('form')

  const existingData = tender.technicalOpenCheck

  // 1. Technical Bid Opening Details (Extracted from actual tender PDF, NOT submission deadline)
  const [openingDate, setOpeningDate] = useState<string>(() => {
    return existingData?.openingDate || ''
  })
  const [openingTime, setOpeningTime] = useState<string>(() => {
    return existingData?.openingTime || ''
  })
  const [openingVenueOrPortal, setOpeningVenueOrPortal] = useState<string>(() => {
    return existingData?.openingVenueOrPortal || ''
  })
  const [openingSummary, setOpeningSummary] = useState<string>(() => {
    return existingData?.openingSummary || ''
  })

  // 2. Evaluation of Technical Bid Details
  const [evaluationDate, setEvaluationDate] = useState<string>(() => {
    return existingData?.evaluationDate || ''
  })
  const [evaluationTime, setEvaluationTime] = useState<string>(() => {
    return existingData?.evaluationTime || ''
  })
  const [evaluationVenue, setEvaluationVenue] = useState<string>(() => {
    return existingData?.evaluationVenue || ''
  })
  const [evaluationCriteria, setEvaluationCriteria] = useState<string>(() => {
    return existingData?.evaluationCriteria || ''
  })
  const [complianceConditions, setComplianceConditions] = useState<string>(() => {
    return existingData?.complianceConditions || ''
  })

  // 3. Status (Required): Qualified | Disqualified | Tender Cancelled
  const [status, setStatus] = useState<TechnicalOpenStatus>(() => {
    return existingData?.status || 'Qualified'
  })

  // 4. Manual Remark: Must NOT have any prefilled or AI-generated text. Field initially empty.
  const [remarks, setRemarks] = useState<string>(() => {
    return existingData?.remarks || ''
  })

  // 5. Optional custom PDF upload for analysis if user wishes to specify an alternate or corrigendum PDF
  const [customPdf, setCustomPdf] = useState<{ name: string; dataUrl: string; size: number } | null>(null)

  const [advanceStage, setAdvanceStage] = useState<boolean>(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isAiLoading, setIsAiLoading] = useState(false)
  const [aiSuccessMsg, setAiSuccessMsg] = useState('')

  // History entries
  const historyEntries: TechnicalOpenCheckHistoryEntry[] = React.useMemo(() => {
    return Array.isArray(existingData?.history) ? [...existingData.history] : []
  }, [existingData])

  // Handle optional custom PDF upload
  const handlePdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setCustomPdf({
        name: file.name,
        dataUrl: reader.result as string,
        size: file.size,
      })
      setAiSuccessMsg(`Selected file "${file.name}". Click 'AI Auto-Fetch' to extract dates.`)
    }
    reader.readAsDataURL(file)
  }

  // AI Auto-Fetch Technical Bid Opening & Evaluation Details from actual uploaded Tender PDF
  const handleAutoFetchAi = async () => {
    setIsAiLoading(true)
    setAiSuccessMsg('')
    try {
      const activeDataUrl = customPdf?.dataUrl || tender.tenderDoc?.dataUrl
      const activeFileName = customPdf?.name || tender.tenderDoc?.name || 'Tender_Document.pdf'

      // The PDF goes once as pdfDataUrl; don't send its base64 a second time inside tender.tenderDoc
      const { tenderDoc, ...tenderMeta } = tender
      const res = await fetch('/api/ai-technical-open-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tender: { ...tenderMeta, tenderDoc: tenderDoc ? { ...tenderDoc, dataUrl: undefined } : tenderDoc },
          pdfDataUrl: activeDataUrl,
          fileName: activeFileName,
        }),
      })
      const result = await res.json()
      if (result.success && result.data) {
        // 1. Opening of Technical Bid (exact from PDF / latest corrigendum, or blank / "Not Found in Tender Document")
        setOpeningDate(result.data.openingDate || '')
        setOpeningTime(result.data.openingTime || 'Not Found in Tender Document')
        if (result.data.openingVenueOrPortal) setOpeningVenueOrPortal(result.data.openingVenueOrPortal)
        if (result.data.openingSummary) setOpeningSummary(result.data.openingSummary)

        // 2. Evaluation of Technical Bid (exact from PDF, or blank / "Not Found in Tender Document")
        setEvaluationDate(result.data.evaluationDate || '')
        setEvaluationTime(result.data.evaluationTime || 'Not Found in Tender Document')
        if (result.data.evaluationVenue) {
          setEvaluationVenue(result.data.evaluationVenue)
        }

        if (result.data.evaluationCriteria) setEvaluationCriteria(result.data.evaluationCriteria)
        if (result.data.complianceConditions) setComplianceConditions(result.data.complianceConditions)

        // 3. User Remark: STRICTLY LEAVE REMARKS UNTOUCHED (User manually enters remark)
        const missing = [
          !result.data.openingDate && 'Technical Bid Opening date',
          !result.data.evaluationDate && 'Technical Bid Evaluation date',
        ].filter(Boolean)
        setAiSuccessMsg(
          (result.source === 'ai'
            ? 'AI extracted actual technical bid opening and evaluation schedule from Tender PDF.'
            : 'Extracted opening and evaluation details from document.') +
            (missing.length ? ` ${missing.join(' and ')} not found in tender document.` : '')
        )
      } else {
        setAiSuccessMsg(result.error || 'Could not auto-extract details. Please enter date and time manually.')
      }
    } catch (err) {
      console.error('Error fetching technical open check AI details:', err)
      setAiSuccessMsg('Error reading document with AI.')
    } finally {
      setIsAiLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isViewOnly) return
    setIsSubmitting(true)

    try {
      const now = new Date()
      const nowIso = now.toISOString()
      const todayDate = nowIso.slice(0, 10)
      const isQualified = status === 'Qualified'

      const newHistoryEntry: TechnicalOpenCheckHistoryEntry = {
        id: `toc-hist-${Date.now()}`,
        tenderId: tender.id,
        status,
        openingDate,
        openingTime,
        openingVenueOrPortal,
        openingSummary,
        evaluationDate,
        evaluationTime,
        evaluationVenue,
        evaluationCriteria,
        complianceConditions,
        remarks: remarks.trim(),
        submittedAt: nowIso,
        submittedBy: tender.owner || 'Admin',
        completedAt: isQualified ? nowIso : undefined,
      }

      const updatedHistory = [newHistoryEntry, ...historyEntries]

      const technicalData: TechnicalOpenCheckData = {
        status,
        openingDate,
        openingTime,
        openingVenueOrPortal,
        openingSummary,
        evaluationDate,
        evaluationTime,
        evaluationVenue,
        evaluationCriteria,
        complianceConditions,
        remarks: remarks.trim(),
        submittedAt: nowIso,
        submittedBy: tender.owner || 'Admin',
        completedAt: isQualified ? nowIso : undefined,
        history: updatedHistory,
      }

      // Next stage is Stage 09: Financial Open Check (only if Qualified)
      let nextStage: Stage = tender.stage
      let newTenderStatus: Status = tender.status

      if (isQualified) {
        if (advanceStage) {
          nextStage = 'Financial Open Check'
          newTenderStatus = 'Ready'
        } else {
          newTenderStatus = 'Completed'
        }
      } else if (status === 'Disqualified') {
        newTenderStatus = 'At Risk'
      } else if (status === 'Tender Cancelled') {
        newTenderStatus = 'Completed'
      }

      const updatedTender: Tender = {
        ...tender,
        stage: nextStage,
        status: newTenderStatus,
        remarks: remarks.trim() || tender.remarks,
        actual_date: isQualified ? todayDate : tender.actual_date,
        technicalOpenCheck: technicalData,
      }

      await onSave(updatedTender)
      onClose()
    } catch (err) {
      console.error('Error saving technical open check data:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const activeDocName = customPdf?.name || tender.tenderDoc?.name || 'Tender Document'
  const hasDocAvailable = !!(customPdf?.dataUrl || tender.tenderDoc?.dataUrl)

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 md:p-6 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden animate-scale-in my-auto">
        {/* 1. HEADER */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/80 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 text-white flex items-center justify-center shadow-md">
              <Settings2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-slate-900">
                  {currentMode === 'view'
                    ? 'Technical Open Check – Details & History'
                    : currentMode === 'edit'
                    ? 'Edit Technical Open Check'
                    : 'Stage 8: Technical Open Check'}
                </h3>
                <span className="badge badge-slate text-[10px] font-mono font-bold">
                  {tender.id}
                </span>
                <span className="badge badge-blue text-[10px] font-semibold">
                  Stage 08
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">
                {tender.title}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isViewOnly && (
              <button
                type="button"
                onClick={() => setCurrentMode('edit')}
                className="secondary-button text-xs py-1.5 px-3 flex items-center gap-1.5"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Edit</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="icon-button"
              aria-label="Close modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 2. TENDER SUMMARY STRIP */}
        <div className="bg-blue-50/50 border-b border-blue-100/60 px-6 py-2.5 flex items-center justify-between gap-4 text-xs flex-wrap flex-shrink-0">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-slate-600 flex items-center gap-1.5">
              <Building className="w-3.5 h-3.5 text-blue-600" />
              <strong>Authority:</strong> {tender.authority}
            </span>
            <span className="text-slate-600 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-blue-600" />
              <strong>Department:</strong> {tender.department || '—'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-500">Value:</span>
            <strong className="text-slate-800 font-bold">{tender.value || '—'}</strong>
          </div>
        </div>

        {/* 3. TABS HEADER */}
        <div className="flex items-center gap-1 px-6 border-b border-slate-200 bg-white flex-shrink-0 pt-3">
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
            <span>Technical Evaluation</span>
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
              
              {/* AI AUTO-FETCH BANNER WITH ATTACHED DOCUMENT CONTEXT */}
              {!isViewOnly && (
                <div className="p-3.5 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl space-y-2.5">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-blue-600 flex-shrink-0" />
                      <div>
                        <p className="text-xs font-bold text-blue-900">
                          AI Technical Bid Date &amp; Schedule Extraction
                        </p>
                        <p className="text-[11px] text-blue-700">
                          AI reads the actual uploaded tender PDF to fetch exact Technical Bid Opening &amp; Evaluation dates and times.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleAutoFetchAi}
                      disabled={isAiLoading}
                      className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {isAiLoading ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Reading Tender PDF...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>AI Auto-Fetch from PDF</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Document Source Bar & Upload Trigger */}
                  <div className="pt-2 border-t border-blue-200/60 flex items-center justify-between gap-3 text-xs flex-wrap">
                    <div className="flex items-center gap-1.5 text-blue-950 font-medium truncate max-w-md">
                      <FileText className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span className="text-slate-500">Document:</span>
                      <span className="font-semibold text-slate-800 truncate" title={activeDocName}>
                        {activeDocName}
                      </span>
                      {hasDocAvailable ? (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 font-bold">
                          Attached
                        </span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 font-bold">
                          Default Sample
                        </span>
                      )}
                    </div>

                    <label className="text-[11px] font-bold text-blue-600 hover:text-blue-800 cursor-pointer flex items-center gap-1 hover:underline">
                      <FileUp className="w-3.5 h-3.5" />
                      <span>{hasDocAvailable ? 'Upload / Change PDF' : 'Upload Tender PDF'}</span>
                      <input
                        type="file"
                        accept=".pdf"
                        onChange={handlePdfUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              )}

              {aiSuccessMsg && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span>{aiSuccessMsg}</span>
                </div>
              )}

              {/* SECTION 1: OPENING OF TECHNICAL BID */}
              <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 space-y-3.5">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-blue-600" />
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      1. Opening of Technical Bid
                    </h4>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    Exact date &amp; time of Technical Bid Opening
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Opening Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      disabled={isViewOnly}
                      value={openingDate}
                      onChange={e => setOpeningDate(e.target.value)}
                      required
                      className="w-full text-xs sm:text-sm px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-blue-500 text-slate-800"
                    />
                    {!openingDate && (
                      <span className="text-[10px] text-slate-400 mt-0.5 block">
                        Select date or use 'AI Auto-Fetch' to extract from tender PDF
                      </span>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Opening Time
                    </label>
                    <div className="relative">
                      <Clock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        disabled={isViewOnly}
                        value={openingTime}
                        onChange={e => setOpeningTime(e.target.value)}
                        placeholder="e.g. 12:00 PM Onwards or 15:30 Hrs"
                        className="w-full text-xs sm:text-sm pl-8 pr-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-blue-500 text-slate-800"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Opening Venue / Portal
                  </label>
                  <input
                    type="text"
                    disabled={isViewOnly}
                    value={openingVenueOrPortal}
                    onChange={e => setOpeningVenueOrPortal(e.target.value)}
                    placeholder="e.g. CREDA Conference Hall, Raipur / https://eproc.cgstate.gov.in"
                    className="w-full text-xs sm:text-sm px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-blue-500 text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Opening Summary &amp; Protocol
                  </label>
                  <textarea
                    rows={2}
                    disabled={isViewOnly}
                    value={openingSummary}
                    onChange={e => setOpeningSummary(e.target.value)}
                    placeholder="Details of opening committee, bid decryption status, presence of bidder representatives..."
                    className="w-full text-xs sm:text-sm px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-blue-500 text-slate-800 resize-none"
                  />
                </div>
              </div>

              {/* SECTION 2: EVALUATION OF TECHNICAL BID */}
              <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 space-y-3.5">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-indigo-600" />
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      2. Evaluation of Technical Bid
                    </h4>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    Schedule, criteria &amp; applicable conditions
                  </span>
                </div>

                {/* Technical Evaluation Date & Time Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Evaluation Date
                    </label>
                    <input
                      type="date"
                      disabled={isViewOnly}
                      value={evaluationDate}
                      onChange={e => setEvaluationDate(e.target.value)}
                      className="w-full text-xs sm:text-sm px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-blue-500 text-slate-800"
                    />
                    {!evaluationDate && (
                      <span className="text-[10px] text-slate-400 mt-0.5 block italic">
                        Leave blank if not found in tender document
                      </span>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Evaluation Time
                    </label>
                    <div className="relative">
                      <Clock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        disabled={isViewOnly}
                        value={evaluationTime}
                        onChange={e => setEvaluationTime(e.target.value)}
                        placeholder="e.g. 12:00 PM Onwards or Not Found in Tender Document"
                        className="w-full text-xs sm:text-sm pl-8 pr-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-blue-500 text-slate-800"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Evaluation Venue / Location
                  </label>
                  <input
                    type="text"
                    disabled={isViewOnly}
                    value={evaluationVenue}
                    onChange={e => setEvaluationVenue(e.target.value)}
                    placeholder="e.g. CREDA Conference Hall, CREDA HO, Raipur"
                    className="w-full text-xs sm:text-sm px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-blue-500 text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Technical Evaluation Criteria &amp; Scoring Summary
                  </label>
                  <textarea
                    rows={3}
                    disabled={isViewOnly}
                    value={evaluationCriteria}
                    onChange={e => setEvaluationCriteria(e.target.value)}
                    placeholder="Scrutiny of technical compliance, specifications checklist, scoring points, sample testing marks..."
                    className="w-full text-xs sm:text-sm px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-blue-500 text-slate-800 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Applicable Technical Conditions &amp; Responsiveness
                  </label>
                  <textarea
                    rows={2}
                    disabled={isViewOnly}
                    value={complianceConditions}
                    onChange={e => setComplianceConditions(e.target.value)}
                    placeholder="Key mandatory conditions (OEM authorization, Type Test Report validity, BIS certificate, past credentials)..."
                    className="w-full text-xs sm:text-sm px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-blue-500 text-slate-800 resize-none"
                  />
                </div>
              </div>

              {/* SECTION 3: STATUS (REQUIRED: 3 OPTIONS) */}
              <div>
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                  3. Status <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Option 1: Qualified */}
                  <button
                    type="button"
                    disabled={isViewOnly}
                    onClick={() => setStatus('Qualified')}
                    className={`p-3.5 rounded-xl border text-left flex items-start justify-between transition-all cursor-pointer disabled:cursor-default ${
                      status === 'Qualified'
                        ? 'border-emerald-600 bg-emerald-50/70 ring-2 ring-emerald-500/20 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span className="text-sm font-bold text-slate-900">Qualified</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                        Technical bid is fully compliant &amp; eligible for Price Bid opening.
                      </p>
                    </div>
                    <div
                      className={`w-4 h-4 rounded-full border flex items-center justify-center mt-0.5 flex-shrink-0 ${
                        status === 'Qualified'
                          ? 'border-emerald-600 bg-emerald-600 text-white'
                          : 'border-slate-300'
                      }`}
                    >
                      {status === 'Qualified' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                  </button>

                  {/* Option 2: Disqualified */}
                  <button
                    type="button"
                    disabled={isViewOnly}
                    onClick={() => setStatus('Disqualified')}
                    className={`p-3.5 rounded-xl border text-left flex items-start justify-between transition-all cursor-pointer disabled:cursor-default ${
                      status === 'Disqualified'
                        ? 'border-rose-600 bg-rose-50/70 ring-2 ring-rose-500/20 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <XCircle className="w-4 h-4 text-rose-600" />
                        <span className="text-sm font-bold text-slate-900">Disqualified</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                        Non-responsive or failed minimum technical criteria.
                      </p>
                    </div>
                    <div
                      className={`w-4 h-4 rounded-full border flex items-center justify-center mt-0.5 flex-shrink-0 ${
                        status === 'Disqualified'
                          ? 'border-rose-600 bg-rose-600 text-white'
                          : 'border-slate-300'
                      }`}
                    >
                      {status === 'Disqualified' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                  </button>

                  {/* Option 3: Tender Cancelled */}
                  <button
                    type="button"
                    disabled={isViewOnly}
                    onClick={() => setStatus('Tender Cancelled')}
                    className={`p-3.5 rounded-xl border text-left flex items-start justify-between transition-all cursor-pointer disabled:cursor-default ${
                      status === 'Tender Cancelled'
                        ? 'border-slate-600 bg-slate-100 ring-2 ring-slate-500/20 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <AlertOctagon className="w-4 h-4 text-slate-600" />
                        <span className="text-sm font-bold text-slate-900">Tender Cancelled</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                        Tender annulled or retendered by the department.
                      </p>
                    </div>
                    <div
                      className={`w-4 h-4 rounded-full border flex items-center justify-center mt-0.5 flex-shrink-0 ${
                        status === 'Tender Cancelled'
                          ? 'border-slate-600 bg-slate-600 text-white'
                          : 'border-slate-300'
                      }`}
                    >
                      {status === 'Tender Cancelled' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                  </button>
                </div>
              </div>

              {/* SECTION 4: REMARK (INITIALLY EMPTY, USER ENTERS MANUALLY) */}
              <div>
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
                  4. Remark
                </label>
                <textarea
                  rows={2}
                  disabled={isViewOnly}
                  value={remarks}
                  onChange={e => setRemarks(e.target.value)}
                  placeholder="Enter manual remarks regarding technical bid evaluation, committee observations, sample verification..."
                  className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white focus:bg-white focus:outline-none focus:border-blue-500 transition-all resize-none text-slate-800"
                />
              </div>

              {/* ADVANCE TO STAGE 09 TOGGLE WHEN QUALIFIED */}
              {status === 'Qualified' && !isViewOnly && (
                <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span className="text-emerald-900 font-medium">
                      Advance tender to <strong>Stage 09 (Financial Open Check)</strong> upon save
                    </span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={advanceStage}
                      onChange={e => setAdvanceStage(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600" />
                  </label>
                </div>
              )}

              {/* FOOTER ACTIONS */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-100 flex-wrap gap-3">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                  <Database className="w-3.5 h-3.5 text-blue-600" />
                  <span>Saves to Supabase &amp; Audit Trail</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="secondary-button text-xs py-2 px-4 cursor-pointer"
                  >
                    Cancel
                  </button>
                  {!isViewOnly && (
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="primary-button text-xs py-2 px-5 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Saving to Database...</span>
                        </>
                      ) : (
                        <>
                          <span>Save &amp; Process</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </form>
          ) : (
            /* TAB 2: AUDIT HISTORY */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Technical Open Check Audit Trail
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Immutable history of technical evaluation, committee remarks, and qualification status.
                  </p>
                </div>
                <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full">
                  {historyEntries.length} Event{historyEntries.length === 1 ? '' : 's'}
                </span>
              </div>

              {historyEntries.length === 0 ? (
                <div className="text-center py-10 bg-slate-50 rounded-xl border border-slate-200 p-6">
                  <HistoryIcon className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-slate-700">No evaluation history recorded yet.</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Save technical evaluation details to record the first audit log.
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
                            className={`text-xs font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1 ${
                              entry.status === 'Qualified'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : entry.status === 'Disqualified'
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : 'bg-slate-100 text-slate-700 border-slate-300'
                            }`}
                          >
                            {entry.status === 'Qualified' ? (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            ) : entry.status === 'Disqualified' ? (
                              <XCircle className="w-3.5 h-3.5" />
                            ) : (
                              <AlertOctagon className="w-3.5 h-3.5" />
                            )}
                            {entry.status}
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

                      {/* Opening Details in History */}
                      {entry.openingDate && (
                        <div className="text-xs text-slate-600 mb-1 flex items-center gap-2 flex-wrap">
                          <span>Opening: <strong className="text-slate-800">{entry.openingDate}</strong> {entry.openingTime ? `at ${entry.openingTime}` : ''}</span>
                          {entry.openingVenueOrPortal && (
                            <span className="text-slate-500">({entry.openingVenueOrPortal})</span>
                          )}
                        </div>
                      )}

                      {/* Evaluation Details in History */}
                      {(entry.evaluationDate || entry.evaluationTime) && (
                        <div className="text-xs text-slate-600 mb-1 flex items-center gap-2 flex-wrap">
                          <span>Evaluation: <strong className="text-slate-800">{entry.evaluationDate || 'Scheduled'}</strong> {entry.evaluationTime && entry.evaluationTime !== 'Not Found in Tender Document' ? `at ${entry.evaluationTime}` : ''}</span>
                          {entry.evaluationVenue && entry.evaluationVenue !== 'Not Found in Tender Document' && (
                            <span className="text-slate-500">({entry.evaluationVenue})</span>
                          )}
                        </div>
                      )}

                      {entry.remarks ? (
                        <div className="mt-2 text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-slate-700 leading-relaxed">
                          <span className="font-semibold text-slate-800 block text-[11px] mb-0.5">Remark:</span>
                          {entry.remarks}
                        </div>
                      ) : (
                        <div className="mt-1 text-[11px] text-slate-400 italic">No remarks entered.</div>
                      )}

                      <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3 text-slate-400" />
                          Evaluated by: <strong className="text-slate-700">{entry.submittedBy || 'Admin'}</strong>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
