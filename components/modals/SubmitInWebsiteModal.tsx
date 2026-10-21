'use client'

import React, { useState } from 'react'
import {
  Globe,
  X,
  CheckCircle2,
  Clock,
  Database,
  Building,
  Calendar,
  Layers,
  ArrowRight,
  Send,
  Loader2,
  History as HistoryIcon,
  Pencil,
  FileText,
  User,
} from 'lucide-react'
import {
  Stage,
  Status,
  SubmitInWebsiteData,
  SubmitInWebsiteHistoryEntry,
  Tender,
} from '@/types/tender'

interface SubmitInWebsiteModalProps {
  tender: Tender
  mode?: 'action' | 'edit' | 'view'
  onClose: () => void
  onSave: (updatedTender: Tender) => Promise<void> | void
}

export function SubmitInWebsiteModal({
  tender,
  mode = 'action',
  onClose,
  onSave,
}: SubmitInWebsiteModalProps) {
  const [currentMode, setCurrentMode] = useState<'action' | 'edit' | 'view'>(mode)
  const isViewOnly = currentMode === 'view'

  // Active Tab: Form or History
  const [activeTab, setActiveTab] = useState<'form' | 'history'>('form')

  // 1. Tender Category: Online Tender | Online and Offline Tender
  const [tenderCategory, setTenderCategory] = useState<'Online Tender' | 'Online and Offline Tender'>(() => {
    if (tender.submitInWebsite?.tenderCategory) {
      return tender.submitInWebsite.tenderCategory
    }
    if (tender.submitInWebsite?.onlineOffline === 'No') {
      return 'Online and Offline Tender'
    }
    return 'Online Tender'
  })

  // 2. Status (Required): Yes – Submitted | No – Pending
  const [status, setStatus] = useState<'Yes – Submitted' | 'No – Pending'>(() => {
    const raw = tender.submitInWebsite?.status
    if (raw === 'Yes – Submitted' || raw === 'Yes') return 'Yes – Submitted'
    if (raw === 'No – Pending' || raw === 'No') return 'No – Pending'
    return tender.status === 'Completed' || tender.status === 'Submitted'
      ? 'Yes – Submitted'
      : 'No – Pending'
  })

  // 3. Remark (Text field)
  const [remarks, setRemarks] = useState<string>(() => {
    return tender.submitInWebsite?.remarks || tender.remarks || ''
  })

  // Advance to next stage option when status is Yes – Submitted
  const [advanceStage, setAdvanceStage] = useState<boolean>(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Previous submission history list
  const historyEntries: SubmitInWebsiteHistoryEntry[] = React.useMemo(() => {
    const list: SubmitInWebsiteHistoryEntry[] = Array.isArray(tender.submitInWebsite?.history)
      ? [...tender.submitInWebsite.history]
      : []

    // If there is an existing submission record that isn't yet in history, include it
    if (
      tender.submitInWebsite?.submittedAt &&
      !list.some(h => h.submittedAt === tender.submitInWebsite?.submittedAt)
    ) {
      list.unshift({
        id: `legacy-${tender.id}`,
        tenderId: tender.id,
        tenderCategory:
          tender.submitInWebsite.tenderCategory ||
          (tender.submitInWebsite.onlineOffline === 'No'
            ? 'Online and Offline Tender'
            : 'Online Tender'),
        status:
          tender.submitInWebsite.status === 'Yes' ||
          tender.submitInWebsite.status === 'Yes – Submitted'
            ? 'Yes – Submitted'
            : 'No – Pending',
        remarks: tender.submitInWebsite.remarks || '',
        submittedAt: tender.submitInWebsite.submittedAt,
        submittedBy: tender.submitInWebsite.submittedBy || tender.owner || 'Admin',
        completedAt: tender.submitInWebsite.completedAt,
      })
    }
    return list
  }, [tender])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isViewOnly) return
    setIsSubmitting(true)

    try {
      const now = new Date()
      const nowIso = now.toISOString()
      const todayDate = nowIso.slice(0, 10)
      const isSubmitted = status === 'Yes – Submitted'

      const newHistoryEntry: SubmitInWebsiteHistoryEntry = {
        id: `sub-hist-${Date.now()}`,
        tenderId: tender.id,
        tenderCategory,
        status,
        remarks: remarks.trim(),
        submittedAt: nowIso,
        submittedBy: tender.owner || 'Admin',
        completedAt: isSubmitted ? nowIso : undefined,
      }

      const updatedHistory = [newHistoryEntry, ...historyEntries.filter(h => !h.id.startsWith('legacy-'))]

      const submitData: SubmitInWebsiteData = {
        tenderCategory,
        onlineOffline: tenderCategory === 'Online and Offline Tender' ? 'No' : 'Yes',
        status,
        remarks: remarks.trim(),
        submittedAt: nowIso,
        submittedBy: tender.owner || 'Admin',
        completedAt: isSubmitted ? nowIso : undefined,
        history: updatedHistory,
      }

      // Next stage is Stage 07: Technical Open Check if user advances
      const nextStage: Stage =
        isSubmitted && advanceStage ? 'Technical Open Check' : tender.stage
      const newStatus: Status = isSubmitted
        ? advanceStage
          ? 'Ready'
          : 'Completed'
        : 'In Progress'

      const updatedTender: Tender = {
        ...tender,
        stage: nextStage,
        status: newStatus,
        remarks: remarks.trim() || tender.remarks,
        actual_date: isSubmitted ? todayDate : tender.actual_date,
        submitInWebsite: submitData,
      }

      await onSave(updatedTender)
      onClose()
    } catch (err) {
      console.error('Error saving submit in website data:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 md:p-6 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden animate-scale-in my-auto">
        {/* 1. MODAL HEADER */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/80 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-md">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-slate-900">
                  {currentMode === 'view'
                    ? 'Website Submission Details & History'
                    : currentMode === 'edit'
                    ? 'Edit Website Submission'
                    : 'Submit in Website – Process'}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                  Stage 06
                </span>
                {tender.submitInWebsite?.status && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                      tender.submitInWebsite.status === 'Yes – Submitted' || tender.submitInWebsite.status === 'Yes'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}
                  >
                    {tender.submitInWebsite.status}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                <span className="font-mono font-bold text-slate-700">{tender.id}</span> • {tender.title.slice(0, 52)}...
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

        {/* 2. TENDER CONTEXT BANNER */}
        <div className="px-6 py-2.5 bg-blue-50/50 border-b border-blue-100/70 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 flex-shrink-0">
          <div className="flex items-center gap-1.5">
            <Building className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
            <span className="font-semibold text-slate-800">{tender.authority}</span>
            <span>({tender.department})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <span>
              Due: <strong className="text-slate-800">{tender.due || 'No date'}</strong>
            </span>
          </div>
        </div>

        {/* 3. TABS (SUBMISSION FORM vs SUBMISSION HISTORY) */}
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
            <span>Submission Details</span>
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

        {/* 4. MODAL SCROLLABLE BODY */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'form' ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* FIELD 1: TENDER CATEGORY (2 OPTIONS) */}
              <div>
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                  1. Tender Category <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Option 1: Online Tender */}
                  <button
                    type="button"
                    disabled={isViewOnly}
                    onClick={() => setTenderCategory('Online Tender')}
                    className={`p-3.5 rounded-xl border text-left flex items-start justify-between transition-all cursor-pointer disabled:cursor-default ${
                      tenderCategory === 'Online Tender'
                        ? 'border-blue-600 bg-blue-50/70 ring-2 ring-blue-500/20 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <Globe className="w-4 h-4 text-blue-600" />
                        <span className="text-sm font-bold text-slate-900">Online Tender</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                        Submitted online via e-Procurement portal / website (e.g. GeM, CPPP).
                      </p>
                    </div>
                    <div
                      className={`w-4 h-4 rounded-full border flex items-center justify-center mt-0.5 flex-shrink-0 ${
                        tenderCategory === 'Online Tender'
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-slate-300'
                      }`}
                    >
                      {tenderCategory === 'Online Tender' && (
                        <div className="w-1.5 h-1.5 rounded-full bg-white" />
                      )}
                    </div>
                  </button>

                  {/* Option 2: Online and Offline Tender */}
                  <button
                    type="button"
                    disabled={isViewOnly}
                    onClick={() => setTenderCategory('Online and Offline Tender')}
                    className={`p-3.5 rounded-xl border text-left flex items-start justify-between transition-all cursor-pointer disabled:cursor-default ${
                      tenderCategory === 'Online and Offline Tender'
                        ? 'border-indigo-600 bg-indigo-50/70 ring-2 ring-indigo-500/20 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <Layers className="w-4 h-4 text-indigo-600" />
                        <span className="text-sm font-bold text-slate-900">Online and Offline Tender</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                        Submitted online on portal along with physical hardcopy bid to department.
                      </p>
                    </div>
                    <div
                      className={`w-4 h-4 rounded-full border flex items-center justify-center mt-0.5 flex-shrink-0 ${
                        tenderCategory === 'Online and Offline Tender'
                          ? 'border-indigo-600 bg-indigo-600 text-white'
                          : 'border-slate-300'
                      }`}
                    >
                      {tenderCategory === 'Online and Offline Tender' && (
                        <div className="w-1.5 h-1.5 rounded-full bg-white" />
                      )}
                    </div>
                  </button>
                </div>
              </div>

              {/* FIELD 2: STATUS (REQUIRED: 2 OPTIONS) */}
              <div>
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                  2. Status <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Option 1: Yes – Submitted */}
                  <button
                    type="button"
                    disabled={isViewOnly}
                    onClick={() => setStatus('Yes – Submitted')}
                    className={`p-3.5 rounded-xl border text-left flex items-start justify-between transition-all cursor-pointer disabled:cursor-default ${
                      status === 'Yes – Submitted'
                        ? 'border-emerald-600 bg-emerald-50/70 ring-2 ring-emerald-500/20 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span className="text-sm font-bold text-slate-900">Yes – Submitted</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                        Bid has been successfully submitted and confirmed on the website/portal.
                      </p>
                    </div>
                    <div
                      className={`w-4 h-4 rounded-full border flex items-center justify-center mt-0.5 flex-shrink-0 ${
                        status === 'Yes – Submitted'
                          ? 'border-emerald-600 bg-emerald-600 text-white'
                          : 'border-slate-300'
                      }`}
                    >
                      {status === 'Yes – Submitted' && (
                        <div className="w-1.5 h-1.5 rounded-full bg-white" />
                      )}
                    </div>
                  </button>

                  {/* Option 2: No – Pending */}
                  <button
                    type="button"
                    disabled={isViewOnly}
                    onClick={() => setStatus('No – Pending')}
                    className={`p-3.5 rounded-xl border text-left flex items-start justify-between transition-all cursor-pointer disabled:cursor-default ${
                      status === 'No – Pending'
                        ? 'border-amber-500 bg-amber-50/70 ring-2 ring-amber-500/20 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-amber-500" />
                        <span className="text-sm font-bold text-slate-900">No – Pending</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                        Bid submission is still pending or awaiting final verification/token.
                      </p>
                    </div>
                    <div
                      className={`w-4 h-4 rounded-full border flex items-center justify-center mt-0.5 flex-shrink-0 ${
                        status === 'No – Pending'
                          ? 'border-amber-500 bg-amber-500 text-white'
                          : 'border-slate-300'
                      }`}
                    >
                      {status === 'No – Pending' && (
                        <div className="w-1.5 h-1.5 rounded-full bg-white" />
                      )}
                    </div>
                  </button>
                </div>
              </div>

              {/* FIELD 3: REMARK */}
              <div>
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
                  3. Remark
                </label>
                <textarea
                  rows={3}
                  disabled={isViewOnly}
                  value={remarks}
                  onChange={e => setRemarks(e.target.value)}
                  placeholder="Enter remarks (e.g. portal acknowledgment token GEM/2026/B/..., DSC encryption verified, physical copy dispatched via speed post...)"
                  className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white focus:bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all resize-none text-slate-800 placeholder:text-slate-400 disabled:bg-slate-100 disabled:cursor-default"
                />
              </div>

              {/* OPTIONAL ADVANCE STAGE TOGGLE WHEN STATUS IS YES - SUBMITTED */}
              {status === 'Yes – Submitted' && !isViewOnly && (
                <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span className="text-emerald-900 font-medium">
                      Advance to next stage: <strong>Stage 07 • Technical Open Check</strong>
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

              {/* QUICK RECENT SUBMISSION SUMMARY (IF EXISTS) */}
              {historyEntries.length > 0 && (
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <HistoryIcon className="w-3.5 h-3.5 text-blue-600" />
                      Last Recorded Submission
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveTab('history')}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-800 underline cursor-pointer"
                    >
                      View All History ({historyEntries.length})
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Tender Category</span>
                      <strong className="text-slate-800 block truncate">{historyEntries[0].tenderCategory}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Status</span>
                      <span
                        className={`inline-block px-1.5 py-0.2 rounded font-bold text-[10px] border ${
                          historyEntries[0].status === 'Yes – Submitted' || historyEntries[0].status === 'Yes'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}
                      >
                        {historyEntries[0].status}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Submission Date</span>
                      <span className="text-slate-700 font-mono text-[11px] block">
                        {new Date(historyEntries[0].submittedAt).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Submitted By</span>
                      <span className="text-slate-700 block truncate">{historyEntries[0].submittedBy || 'Admin'}</span>
                    </div>
                  </div>
                </div>
              )}
            </form>
          ) : (
            /* SUBMISSION HISTORY TAB */
            <div className="space-y-3.5">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <HistoryIcon className="w-4 h-4 text-blue-600" />
                    Submission History Log ({historyEntries.length})
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Complete audit trail of all website submissions recorded for this tender.
                  </p>
                </div>
              </div>

              {historyEntries.length === 0 ? (
                <div className="text-center py-10 bg-slate-50 rounded-xl border border-slate-200 p-6">
                  <HistoryIcon className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-slate-700">No submission history recorded yet.</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Complete the submission form to record your first audit log entry.
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
                            className={`text-xs font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                              entry.tenderCategory === 'Online and Offline Tender'
                                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                : 'bg-blue-50 text-blue-700 border-blue-200'
                            }`}
                          >
                            <Globe className="w-3 h-3" />
                            {entry.tenderCategory}
                          </span>
                          <span
                            className={`text-xs font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1 ${
                              entry.status === 'Yes – Submitted' || entry.status === 'Yes'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                            }`}
                          >
                            {entry.status === 'Yes – Submitted' || entry.status === 'Yes' ? (
                              <CheckCircle2 className="w-3 h-3" />
                            ) : (
                              <Clock className="w-3 h-3" />
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
                          Submitted by: <strong className="text-slate-700">{entry.submittedBy || 'Admin'}</strong>
                        </span>
                        {entry.completedAt && (
                          <span className="text-emerald-700 font-medium">✔ Completed & Verified</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 5. MODAL FOOTER */}
        <div className="p-4 md:p-5 border-t border-slate-200 bg-slate-50/80 flex items-center justify-between gap-3 flex-shrink-0 flex-wrap">
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 font-medium">
            <Database className="w-3.5 h-3.5 text-emerald-600" />
            <span>Connects to Supabase Database</span>
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
                <span>Edit Submission</span>
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
                    <span>Save & Process</span>
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
