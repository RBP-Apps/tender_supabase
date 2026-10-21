'use client'

import React, { useState } from 'react'
import {
  Award,
  X,
  CheckCircle2,
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
  Sparkles,
  ShieldCheck,
  FileDown,
  AlertCircle,
} from 'lucide-react'
import {
  SampleDocumentItem,
  Stage,
  Status,
  Tender,
  WorkOrderData,
  WorkOrderHistoryEntry,
} from '@/types/tender'
import { downloadWorkOrderAgreementDocx } from '@/lib/work-order-docx'

interface WorkOrderModalProps {
  tender: Tender
  mode?: 'action' | 'edit' | 'view'
  onClose: () => void
  onSave: (updatedTender: Tender) => Promise<void> | void
}

export function WorkOrderModal({
  tender,
  mode = 'action',
  onClose,
  onSave,
}: WorkOrderModalProps) {
  const [currentMode, setCurrentMode] = useState<'action' | 'edit' | 'view'>(mode)
  const isViewOnly = currentMode === 'view'
  const [activeTab, setActiveTab] = useState<'form' | 'history'>('form')

  const existingData = tender.workOrder

  // 1. Work Order Details & Document
  const [workOrderDoc, setWorkOrderDoc] = useState<SampleDocumentItem | null>(() => {
    return existingData?.workOrderDoc || null
  })
  const [workOrderNumber, setWorkOrderNumber] = useState<string>(() => {
    return existingData?.workOrderNumber || `WO/${tender.authority.slice(0, 4).toUpperCase()}/${new Date().getFullYear()}/${tender.id.slice(-4)}`
  })
  const [workOrderDate, setWorkOrderDate] = useState<string>(() => {
    return existingData?.workOrderDate || new Date().toISOString().slice(0, 10)
  })
  const [contractValue, setContractValue] = useState<string>(() => {
    return existingData?.contractValue || tender.negotiation?.negotiatedPrice || tender.financialOpenCheck?.ourBidPrice || tender.value || ''
  })

  // 2. AI Terms & Conditions Summary
  const [aiSummary, setAiSummary] = useState<string>(() => {
    return existingData?.aiSummary || ''
  })
  const [isAiSummaryLoading, setIsAiSummaryLoading] = useState(false)
  const [aiSummarySuccess, setAiSummarySuccess] = useState('')

  // 3. Bank Guarantee (BG) Details & Document
  const [bgDoc, setBgDoc] = useState<SampleDocumentItem | null>(() => {
    return existingData?.bgDoc || null
  })
  const [bgAmount, setBgAmount] = useState<string>(() => {
    return existingData?.bgAmount || ''
  })
  const [bgBankName, setBgBankName] = useState<string>(() => {
    return existingData?.bgBankName || 'State Bank of India'
  })
  const [bgNumber, setBgNumber] = useState<string>(() => {
    return existingData?.bgNumber || ''
  })
  const [bgValidity, setBgValidity] = useState<string>(() => {
    return existingData?.bgValidity || ''
  })

  // 4. Affidavit / Agreement Requirements & AI Generation
  const [affidavitRequirements, setAffidavitRequirements] = useState<string>(() => {
    return existingData?.affidavitRequirements || ''
  })
  const [generatedAgreement, setGeneratedAgreement] = useState<string>(() => {
    return existingData?.generatedAgreement || ''
  })
  const [isAgreementGenerating, setIsAgreementGenerating] = useState(false)
  const [agreementSuccess, setAgreementSuccess] = useState('')
  const [isDownloadingDocx, setIsDownloadingDocx] = useState(false)

  // 5. Remarks & Stage Finalization
  const [remarks, setRemarks] = useState<string>(() => {
    return existingData?.remarks || ''
  })
  const [markCompleted, setMarkCompleted] = useState<boolean>(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  // History entries
  const historyEntries: WorkOrderHistoryEntry[] = React.useMemo(() => {
    return Array.isArray(existingData?.history) ? [...existingData.history] : []
  }, [existingData])

  // Handle Work Order Document Upload
  const handleWorkOrderFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setFormError('')
    if (file.size > 30 * 1024 * 1024) {
      setFormError('Work Order file size exceeds 30 MB limit.')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const docItem: SampleDocumentItem = {
        id: `wo-doc-${Date.now()}`,
        name: file.name,
        size: file.size,
        type: file.type || 'application/pdf',
        uploadedAt: new Date().toISOString(),
        dataUrl: reader.result as string,
        source: 'manual-upload',
      }
      setWorkOrderDoc(docItem)
    }
    reader.readAsDataURL(file)
  }

  // Handle Bank Guarantee Document Upload
  const handleBgFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setFormError('')
    if (file.size > 30 * 1024 * 1024) {
      setFormError('BG file size exceeds 30 MB limit.')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const docItem: SampleDocumentItem = {
        id: `bg-doc-${Date.now()}`,
        name: file.name,
        size: file.size,
        type: file.type || 'application/pdf',
        uploadedAt: new Date().toISOString(),
        dataUrl: reader.result as string,
        source: 'manual-upload',
      }
      setBgDoc(docItem)
    }
    reader.readAsDataURL(file)
  }

  // AI Terms & Conditions Summary Trigger
  const handleGenerateAiSummary = async () => {
    setIsAiSummaryLoading(true)
    setAiSummarySuccess('')
    try {
      const res = await fetch('/api/ai-work-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'summary',
          tender,
          contractValue,
          workOrderNumber,
        }),
      })
      const data = await res.json()
      if (data.summary) {
        setAiSummary(data.summary)
        setAiSummarySuccess(data.source === 'ai' ? 'AI Summary generated successfully!' : 'Summary generated from tender records.')
        setTimeout(() => setAiSummarySuccess(''), 4000)
      } else {
        setFormError('Failed to generate summary.')
      }
    } catch (err: any) {
      setFormError('Error connecting to AI service.')
    } finally {
      setIsAiSummaryLoading(false)
    }
  }

  // AI Agreement Generation Trigger
  const handleGenerateAgreement = async () => {
    setIsAgreementGenerating(true)
    setAgreementSuccess('')
    try {
      const res = await fetch('/api/ai-work-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'agreement',
          tender,
          requirements: affidavitRequirements,
          contractValue,
          workOrderNumber,
        }),
      })
      const data = await res.json()
      if (data.agreement) {
        setGeneratedAgreement(data.agreement)
        setAgreementSuccess(data.source === 'ai' ? 'Agreement drafted with AI successfully!' : 'Standard agreement generated.')
        setTimeout(() => setAgreementSuccess(''), 4000)
      } else {
        setFormError('Failed to draft agreement.')
      }
    } catch (err: any) {
      setFormError('Error drafting agreement.')
    } finally {
      setIsAgreementGenerating(false)
    }
  }

  // Word Document (.docx) Download Handler
  const handleDownloadDocx = async () => {
    if (!generatedAgreement.trim()) {
      setFormError('Please generate or enter the agreement text first.')
      return
    }

    try {
      setIsDownloadingDocx(true)
      await downloadWorkOrderAgreementDocx(tender, generatedAgreement, workOrderNumber)
    } catch (err: any) {
      alert('Error exporting Word document: ' + (err?.message || err))
    } finally {
      setIsDownloadingDocx(false)
    }
  }

  // Handle Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isViewOnly) return

    setIsSubmitting(true)

    try {
      const now = new Date()
      const nowIso = now.toISOString()
      const todayDate = nowIso.slice(0, 10)

      const newHistoryEntry: WorkOrderHistoryEntry = {
        id: `wo-hist-${Date.now()}`,
        tenderId: tender.id,
        workOrderDoc,
        workOrderNumber: workOrderNumber.trim(),
        workOrderDate,
        contractValue: contractValue.trim(),
        aiSummary: aiSummary.trim(),
        bgDoc,
        bgAmount: bgAmount.trim(),
        bgBankName: bgBankName.trim(),
        bgNumber: bgNumber.trim(),
        bgValidity,
        affidavitRequirements: affidavitRequirements.trim(),
        generatedAgreement: generatedAgreement.trim(),
        remarks: remarks.trim(),
        submittedAt: nowIso,
        submittedBy: tender.owner || 'Admin',
        completedAt: nowIso,
      }

      const updatedHistory = [newHistoryEntry, ...historyEntries]

      const workOrderData: WorkOrderData = {
        workOrderDoc,
        workOrderNumber: workOrderNumber.trim(),
        workOrderDate,
        contractValue: contractValue.trim(),
        aiSummary: aiSummary.trim(),
        bgDoc,
        bgAmount: bgAmount.trim(),
        bgBankName: bgBankName.trim(),
        bgNumber: bgNumber.trim(),
        bgValidity,
        affidavitRequirements: affidavitRequirements.trim(),
        generatedAgreement: generatedAgreement.trim(),
        remarks: remarks.trim(),
        submittedAt: nowIso,
        submittedBy: tender.owner || 'Admin',
        completedAt: nowIso,
        history: updatedHistory,
      }

      // Final status of tender
      const newStatus: Status = markCompleted ? 'Completed' : 'Ready'

      const updatedTender: Tender = {
        ...tender,
        stage: 'Work Order',
        status: newStatus,
        remarks: remarks.trim() || tender.remarks,
        actual_date: todayDate,
        workOrder: workOrderData,
      }

      await onSave(updatedTender)
      onClose()
    } catch (err: any) {
      console.error('Failed to save Work Order stage:', err)
      setFormError('Failed to save details: ' + (err?.message || 'Unknown error'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-5xl my-6 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* 1. MODAL HEADER */}
        <div className="bg-gradient-to-r from-amber-700 via-yellow-700 to-amber-900 px-6 py-4 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-md border border-white/20">
              <Award className="w-6 h-6 text-yellow-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded text-amber-100">
                  Stage 11
                </span>
                <span className="text-xs text-amber-200 font-mono">Tender ID: {tender.id}</span>
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight">
                Work Order &amp; Contract Execution
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isViewOnly && (
              <button
                type="button"
                onClick={() => setCurrentMode('edit')}
                className="px-3 py-1.5 text-xs font-semibold bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all flex items-center gap-1.5 border border-white/20"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit Details
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 2. TENDER CONTEXT BANNER */}
        <div className="bg-amber-50/70 border-b border-amber-200/80 px-6 py-2.5 flex items-center justify-between text-xs text-slate-700 shrink-0 flex-wrap gap-2">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Building className="w-3.5 h-3.5 text-amber-700" />
              <span className="font-semibold text-slate-800">{tender.authority}</span>
              <span className="text-slate-500">({tender.department})</span>
            </div>
            <div className="h-3 w-px bg-amber-300" />
            <div className="text-slate-600 truncate max-w-md" title={tender.title}>
              {tender.title}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-500">Contract Value:</span>
            <span className="font-bold text-amber-800">
              {contractValue || tender.value || 'To be specified'}
            </span>
          </div>
        </div>

        {/* 3. TABS (FORM vs HISTORY) */}
        <div className="flex border-b border-slate-200 px-6 bg-slate-50/80 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('form')}
            className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition-all ${
              activeTab === 'form'
                ? 'border-amber-600 text-amber-700 bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="w-4 h-4" />
            Work Order Form &amp; Documents
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition-all ${
              activeTab === 'history'
                ? 'border-amber-600 text-amber-700 bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <HistoryIcon className="w-4 h-4" />
            Audit History &amp; Versions
            {historyEntries.length > 0 && (
              <span className="px-1.5 py-0.2 bg-amber-100 text-amber-800 rounded-full text-[10px] font-bold">
                {historyEntries.length}
              </span>
            )}
          </button>
        </div>

        {/* 4. MODAL BODY */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-slate-50/30">
          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{formError}</span>
            </div>
          )}

          {activeTab === 'form' ? (
            <form id="work-order-form" onSubmit={handleSubmit} className="space-y-6">
              
              {/* SECTION 1: WORK ORDER DETAILS & UPLOAD */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <Award className="w-4 h-4 text-amber-600" />
                    <h3 className="text-sm font-bold text-slate-800">
                      1. Work Order Details &amp; Document Upload
                    </h3>
                  </div>
                  <span className="text-[11px] text-slate-500 font-medium">
                    Upload official client award letter or work order
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Work Order Number <span className="text-amber-600">*</span>
                    </label>
                    <input
                      type="text"
                      disabled={isViewOnly}
                      value={workOrderNumber}
                      onChange={(e) => setWorkOrderNumber(e.target.value)}
                      placeholder="e.g. WO/DISCOM/2026/045"
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-slate-100 font-mono"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Work Order Issue Date <span className="text-amber-600">*</span>
                    </label>
                    <input
                      type="date"
                      disabled={isViewOnly}
                      value={workOrderDate}
                      onChange={(e) => setWorkOrderDate(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-slate-100"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Contract Value (INR)
                    </label>
                    <input
                      type="text"
                      disabled={isViewOnly}
                      value={contractValue}
                      onChange={(e) => setContractValue(e.target.value)}
                      placeholder="e.g. ₹ 4,85,00,000"
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-slate-100"
                    />
                  </div>
                </div>

                {/* Work Order Document Upload Dropzone */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Work Order Document (PDF, DOCX, Images)
                  </label>
                  {workOrderDoc ? (
                    <div className="flex items-center justify-between p-3 bg-amber-50/60 border border-amber-200 rounded-xl">
                      <div className="flex items-center gap-3 truncate">
                        <div className="p-2 bg-amber-100 text-amber-800 rounded-lg shrink-0">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div className="truncate">
                          <p className="text-xs font-bold text-slate-800 truncate">
                            {workOrderDoc.name}
                          </p>
                          <p className="text-[10px] text-slate-500">
                            {workOrderDoc.size ? `${(workOrderDoc.size / 1024).toFixed(1)} KB` : 'Uploaded'} • {new Date(workOrderDoc.uploadedAt).toLocaleString('en-IN')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {workOrderDoc.dataUrl && (
                          <a
                            href={workOrderDoc.dataUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 bg-white hover:bg-slate-100 text-slate-700 rounded-lg border border-slate-200 text-xs flex items-center gap-1 font-medium transition-all"
                            title="Open Document"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            View
                          </a>
                        )}
                        {!isViewOnly && (
                          <button
                            type="button"
                            onClick={() => setWorkOrderDoc(null)}
                            className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg border border-red-200 text-xs transition-all"
                            title="Remove Document"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    !isViewOnly && (
                      <label className="border-2 border-dashed border-slate-300 hover:border-amber-500 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer bg-slate-50/50 hover:bg-amber-50/30 transition-all group">
                        <Upload className="w-6 h-6 text-slate-400 group-hover:text-amber-600 mb-1" />
                        <span className="text-xs font-bold text-slate-700 group-hover:text-amber-800">
                          Click to upload Work Order Document
                        </span>
                        <span className="text-[10px] text-slate-400 mt-0.5">
                          Supports PDF, DOCX, PNG, JPG up to 30 MB
                        </span>
                        <input
                          type="file"
                          accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                          onChange={handleWorkOrderFileUpload}
                          className="hidden"
                        />
                      </label>
                    )
                  )}
                </div>
              </div>

              {/* SECTION 2: AI TERMS & CONDITIONS SUMMARY */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-600" />
                    <h3 className="text-sm font-bold text-slate-800">
                      2. AI Summary of Terms &amp; Conditions
                    </h3>
                  </div>
                  {!isViewOnly && (
                    <button
                      type="button"
                      disabled={isAiSummaryLoading}
                      onClick={handleGenerateAiSummary}
                      className="px-3 py-1.5 text-xs font-bold bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-700 hover:to-yellow-700 text-white rounded-lg shadow-sm flex items-center gap-1.5 transition-all disabled:opacity-50"
                    >
                      {isAiSummaryLoading ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Extracting Summary via AI...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5" />
                          Generate AI Terms Summary
                        </>
                      )}
                    </button>
                  )}
                </div>

                {aiSummarySuccess && (
                  <p className="text-xs text-green-700 bg-green-50 px-3 py-1.5 rounded-lg border border-green-200 font-medium">
                    {aiSummarySuccess}
                  </p>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Applicable Terms &amp; Conditions Summary (AI Generated / Editable)
                  </label>
                  <textarea
                    rows={6}
                    disabled={isViewOnly}
                    value={aiSummary}
                    onChange={(e) => setAiSummary(e.target.value)}
                    placeholder="Click 'Generate AI Terms Summary' above to auto-read tender scope, delivery milestones, warranty, payment schedules, and penalty clauses..."
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-slate-100 leading-relaxed font-sans"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    AI synthesizes scope, timelines, LD liquidated damages, payment terms, and warranty requirements.
                  </p>
                </div>
              </div>

              {/* SECTION 3: BANK GUARANTEE (BG) */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <h3 className="text-sm font-bold text-slate-800">
                      3. Performance Bank Guarantee (BG / PBG)
                    </h3>
                  </div>
                  <span className="text-[11px] text-slate-500 font-medium">
                    Record PBG details &amp; upload instrument
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      BG Amount (INR)
                    </label>
                    <input
                      type="text"
                      disabled={isViewOnly}
                      value={bgAmount}
                      onChange={(e) => setBgAmount(e.target.value)}
                      placeholder="e.g. ₹ 24,25,000"
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-slate-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Issuing Bank Name
                    </label>
                    <input
                      type="text"
                      disabled={isViewOnly}
                      value={bgBankName}
                      onChange={(e) => setBgBankName(e.target.value)}
                      placeholder="e.g. State Bank of India"
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-slate-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      BG Reference Number
                    </label>
                    <input
                      type="text"
                      disabled={isViewOnly}
                      value={bgNumber}
                      onChange={(e) => setBgNumber(e.target.value)}
                      placeholder="e.g. 00021BG20260012"
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-slate-100 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      BG Validity / Expiry Date
                    </label>
                    <input
                      type="date"
                      disabled={isViewOnly}
                      value={bgValidity}
                      onChange={(e) => setBgValidity(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-slate-100"
                    />
                  </div>
                </div>

                {/* BG Document Upload Dropzone */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Bank Guarantee Document Instrument
                  </label>
                  {bgDoc ? (
                    <div className="flex items-center justify-between p-3 bg-emerald-50/60 border border-emerald-200 rounded-xl">
                      <div className="flex items-center gap-3 truncate">
                        <div className="p-2 bg-emerald-100 text-emerald-800 rounded-lg shrink-0">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div className="truncate">
                          <p className="text-xs font-bold text-slate-800 truncate">
                            {bgDoc.name}
                          </p>
                          <p className="text-[10px] text-slate-500">
                            {bgDoc.size ? `${(bgDoc.size / 1024).toFixed(1)} KB` : 'Uploaded'} • {new Date(bgDoc.uploadedAt).toLocaleString('en-IN')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {bgDoc.dataUrl && (
                          <a
                            href={bgDoc.dataUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 bg-white hover:bg-slate-100 text-slate-700 rounded-lg border border-slate-200 text-xs flex items-center gap-1 font-medium transition-all"
                            title="Open BG Document"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            View
                          </a>
                        )}
                        {!isViewOnly && (
                          <button
                            type="button"
                            onClick={() => setBgDoc(null)}
                            className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg border border-red-200 text-xs transition-all"
                            title="Remove Document"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    !isViewOnly && (
                      <label className="border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer bg-slate-50/50 hover:bg-emerald-50/30 transition-all group">
                        <Upload className="w-6 h-6 text-slate-400 group-hover:text-emerald-600 mb-1" />
                        <span className="text-xs font-bold text-slate-700 group-hover:text-emerald-800">
                          Click to upload Bank Guarantee Document
                        </span>
                        <span className="text-[10px] text-slate-400 mt-0.5">
                          Supports scanned BG PDF or images up to 30 MB
                        </span>
                        <input
                          type="file"
                          accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                          onChange={handleBgFileUpload}
                          className="hidden"
                        />
                      </label>
                    )
                  )}
                </div>
              </div>

              {/* SECTION 4: AFFIDAVIT / CONTRACT AGREEMENT */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-600" />
                    <h3 className="text-sm font-bold text-slate-800">
                      4. Affidavit &amp; Contract Agreement Drafting
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    {!isViewOnly && (
                      <button
                        type="button"
                        disabled={isAgreementGenerating}
                        onClick={handleGenerateAgreement}
                        className="px-3 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm flex items-center gap-1.5 transition-all disabled:opacity-50"
                      >
                        {isAgreementGenerating ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Drafting Agreement...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3.5 h-3.5" />
                            Generate Agreement via AI
                          </>
                        )}
                      </button>
                    )}
                    {generatedAgreement.trim() && (
                      <button
                        type="button"
                        disabled={isDownloadingDocx}
                        onClick={handleDownloadDocx}
                        className="px-3 py-1.5 text-xs font-bold bg-slate-800 hover:bg-slate-900 text-white rounded-lg shadow-sm flex items-center gap-1.5 transition-all"
                        title="Download Word Document"
                      >
                        {isDownloadingDocx ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <FileDown className="w-3.5 h-3.5 text-emerald-400" />
                        )}
                        Download as Word (.docx)
                      </button>
                    )}
                  </div>
                </div>

                {agreementSuccess && (
                  <p className="text-xs text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200 font-medium">
                    {agreementSuccess}
                  </p>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Your Specific Requirements &amp; Custom Clauses
                  </label>
                  <textarea
                    rows={3}
                    disabled={isViewOnly}
                    value={affidavitRequirements}
                    onChange={(e) => setAffidavitRequirements(e.target.value)}
                    placeholder="Enter custom requirements (e.g. 5-year warranty, payment release in 3 tranches, delivery at central warehouse, exemption clauses, force majeure specifics)..."
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    AI will blend your requirements with the tender details into a formal legal agreement ready for stamping and execution.
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700">
                      Editable Affidavit / Agreement Document
                    </label>
                    {generatedAgreement.trim() && (
                      <span className="text-[10px] text-slate-400">
                        {generatedAgreement.split('\n').length} paragraphs • Ready for export
                      </span>
                    )}
                  </div>
                  <textarea
                    rows={8}
                    disabled={isViewOnly}
                    value={generatedAgreement}
                    onChange={(e) => setGeneratedAgreement(e.target.value)}
                    placeholder="Click 'Generate Agreement via AI' to draft the complete formal agreement text here. You can manually edit or refine any clauses before downloading."
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 font-mono text-slate-800 leading-relaxed"
                  />
                </div>
              </div>

              {/* SECTION 5: REMARKS & WORKFLOW STATUS */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                  <Database className="w-4 h-4 text-slate-600" />
                  <h3 className="text-sm font-bold text-slate-800">
                    5. Execution Remarks &amp; Completion Status
                  </h3>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Final Remarks / Notes
                  </label>
                  <textarea
                    rows={2}
                    disabled={isViewOnly}
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="Enter any work order acceptance remarks, commencement date notes, or department interactions..."
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-slate-100"
                  />
                </div>

                {!isViewOnly && (
                  <div className="pt-2">
                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={markCompleted}
                        onChange={(e) => setMarkCompleted(e.target.checked)}
                        className="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500"
                      />
                      <span className="text-xs font-semibold text-slate-800">
                        Mark Tender Workflow as Completed &amp; Fully Executed
                      </span>
                    </label>
                  </div>
                )}
              </div>

            </form>
          ) : (
            /* TAB 2: AUDIT HISTORY */
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <HistoryIcon className="w-4 h-4 text-amber-600" />
                    Work Order Audit Trail &amp; Version History
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Records of work order details, bank guarantee instruments, and generated agreement versions.
                  </p>
                </div>
                <span className="text-xs font-semibold bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full">
                  {historyEntries.length} Records
                </span>
              </div>

              {historyEntries.length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
                  <Award className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-bold text-slate-700">No History Records Yet</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                    When you save work order details, uploaded documents, and AI agreements, an immutable audit entry will be recorded here.
                  </p>
                </div>
              ) : (
                historyEntries.map((entry, idx) => (
                  <div
                    key={entry.id || idx}
                    className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4 hover:border-amber-300 transition-colors"
                  >
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-800 text-xs font-bold flex items-center justify-center">
                          #{historyEntries.length - idx}
                        </span>
                        <span className="text-xs font-bold text-slate-800">
                          Work Order: {entry.workOrderNumber || 'Not specified'}
                        </span>
                        <span className="text-xs text-slate-400">•</span>
                        <span className="text-xs text-slate-500">
                          Date: {entry.workOrderDate || 'N/A'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-500">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>{new Date(entry.submittedAt).toLocaleString('en-IN')}</span>
                        <span className="text-slate-300">|</span>
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-medium text-slate-700">{entry.submittedBy}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      {/* Work Order Info */}
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Contract Value:</span>
                          <span className="font-bold text-slate-800">
                            {entry.contractValue || '—'}
                          </span>
                        </div>
                        {entry.workOrderDoc && (
                          <div className="flex items-center justify-between pt-1 border-t border-slate-200">
                            <span className="text-slate-500">WO Document:</span>
                            {entry.workOrderDoc.dataUrl ? (
                              <a
                                href={entry.workOrderDoc.dataUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-800 font-semibold underline flex items-center gap-1"
                              >
                                <Eye className="w-3 h-3" />
                                {entry.workOrderDoc.name}
                              </a>
                            ) : (
                              <span className="font-medium text-slate-700">{entry.workOrderDoc.name}</span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Bank Guarantee Info */}
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">BG Amount &amp; Bank:</span>
                          <span className="font-bold text-slate-800">
                            {entry.bgAmount || '—'} {entry.bgBankName ? `(${entry.bgBankName})` : ''}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">BG Number / Validity:</span>
                          <span className="font-mono text-slate-700">
                            {entry.bgNumber || '—'} {entry.bgValidity ? `• ${entry.bgValidity}` : ''}
                          </span>
                        </div>
                        {entry.bgDoc && (
                          <div className="flex items-center justify-between pt-1 border-t border-slate-200">
                            <span className="text-slate-500">BG Instrument:</span>
                            {entry.bgDoc.dataUrl ? (
                              <a
                                href={entry.bgDoc.dataUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-emerald-600 hover:text-emerald-800 font-semibold underline flex items-center gap-1"
                              >
                                <Eye className="w-3 h-3" />
                                {entry.bgDoc.name}
                              </a>
                            ) : (
                              <span className="font-medium text-slate-700">{entry.bgDoc.name}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* AI Summary in History */}
                    {entry.aiSummary && (
                      <div className="p-3 bg-amber-50/50 rounded-lg border border-amber-100 text-xs">
                        <span className="font-bold text-amber-900 block mb-1">
                          Terms &amp; Conditions Summary:
                        </span>
                        <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">
                          {entry.aiSummary}
                        </p>
                      </div>
                    )}

                    {/* Agreement in History */}
                    {entry.generatedAgreement && (
                      <div className="p-3 bg-blue-50/50 rounded-lg border border-blue-100 text-xs flex items-center justify-between flex-wrap gap-2">
                        <div>
                          <span className="font-bold text-blue-900">
                            Contract Agreement Draft
                          </span>
                          <p className="text-[11px] text-slate-500">
                            {entry.generatedAgreement.slice(0, 120)}...
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => downloadWorkOrderAgreementDocx(tender, entry.generatedAgreement!, entry.workOrderNumber)}
                          className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 rounded border border-slate-200 text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer"
                        >
                          <FileDown className="w-3.5 h-3.5 text-blue-600" />
                          Download Word (.docx)
                        </button>
                      </div>
                    )}

                    {/* Remarks in History */}
                    {entry.remarks && (
                      <div className="text-xs text-slate-600 pt-2 border-t border-slate-100">
                        <span className="font-semibold text-slate-700">Remarks: </span>
                        <span>{entry.remarks}</span>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* 5. MODAL FOOTER */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-slate-400" />
            <span>Connected to Supabase Database &amp; Storage</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
            >
              {isViewOnly ? 'Close' : 'Cancel'}
            </button>

            {!isViewOnly && activeTab === 'form' && (
              <button
                type="submit"
                form="work-order-form"
                disabled={isSubmitting}
                className="px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-700 hover:to-yellow-700 rounded-xl shadow-md hover:shadow-lg flex items-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving to Database...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Save &amp; Finalize Work Order
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
