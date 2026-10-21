'use client'

import React, { useState } from 'react'
import {
  Zap,
  X,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Calendar,
  Building,
  ArrowRight,
  Loader2,
  History as HistoryIcon,
  Pencil,
  FileText,
  User,
  Database,
  TrendingDown,
  Award,
} from 'lucide-react'
import {
  FinancialOpenCheckData,
  FinancialOpenCheckHistoryEntry,
  FinancialRanking,
  Stage,
  Status,
  Tender,
} from '@/types/tender'

interface FinancialOpenCheckModalProps {
  tender: Tender
  mode?: 'action' | 'edit' | 'view'
  onClose: () => void
  onSave: (updatedTender: Tender) => Promise<void> | void
}

export function FinancialOpenCheckModal({
  tender,
  mode = 'action',
  onClose,
  onSave,
}: FinancialOpenCheckModalProps) {
  const [currentMode, setCurrentMode] = useState<'action' | 'edit' | 'view'>(mode)
  const isViewOnly = currentMode === 'view'
  const [activeTab, setActiveTab] = useState<'form' | 'history'>('form')

  const existingData = tender.financialOpenCheck

  // 1. Check if previous stage (Technical Open Check) is Qualified
  const techStatus = tender.technicalOpenCheck?.status
  const isQualified = techStatus === 'Qualified'

  // 2. Ranking: L1 | L2 | L3 | L4 | Other
  const [ranking, setRanking] = useState<FinancialRanking>(() => {
    return existingData?.ranking || 'L1'
  })

  // 3. Financial Price Details
  const [l1BidderName, setL1BidderName] = useState<string>(() => {
    return existingData?.l1BidderName || (ranking === 'L1' ? 'Our Firm (L1)' : '')
  })
  const [l1Price, setL1Price] = useState<string>(() => {
    return existingData?.l1Price || tender.value || ''
  })
  const [ourBidPrice, setOurBidPrice] = useState<string>(() => {
    return existingData?.ourBidPrice || tender.value || ''
  })
  const [priceVariance, setPriceVariance] = useState<string>(() => {
    return existingData?.priceVariance || ''
  })
  const [openingDate, setOpeningDate] = useState<string>(() => {
    return existingData?.openingDate || new Date().toISOString().slice(0, 10)
  })

  // 4. Remark
  const [remarks, setRemarks] = useState<string>(() => {
    return existingData?.remarks || ''
  })

  const [advanceStage, setAdvanceStage] = useState<boolean>(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // History entries
  const historyEntries: FinancialOpenCheckHistoryEntry[] = React.useMemo(() => {
    return Array.isArray(existingData?.history) ? [...existingData.history] : []
  }, [existingData])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isViewOnly || !isQualified) return
    setIsSubmitting(true)

    try {
      const now = new Date()
      const nowIso = now.toISOString()
      const todayDate = nowIso.slice(0, 10)

      const newHistoryEntry: FinancialOpenCheckHistoryEntry = {
        id: `foc-hist-${Date.now()}`,
        tenderId: tender.id,
        ranking,
        l1BidderName,
        l1Price,
        ourBidPrice,
        priceVariance,
        openingDate,
        remarks: remarks.trim(),
        submittedAt: nowIso,
        submittedBy: tender.owner || 'Admin',
        completedAt: nowIso,
      }

      const updatedHistory = [newHistoryEntry, ...historyEntries]

      const financialData: FinancialOpenCheckData = {
        ranking,
        l1BidderName,
        l1Price,
        ourBidPrice,
        priceVariance,
        openingDate,
        remarks: remarks.trim(),
        submittedAt: nowIso,
        submittedBy: tender.owner || 'Admin',
        completedAt: nowIso,
        history: updatedHistory,
      }

      // Next stage is Stage 10: Negotiation if advanceStage is checked
      const nextStage: Stage = advanceStage ? 'Negotiation' : tender.stage
      const newStatus: Status = advanceStage ? 'Ready' : 'Completed'

      const updatedTender: Tender = {
        ...tender,
        stage: nextStage,
        status: newStatus,
        remarks: remarks.trim() || tender.remarks,
        actual_date: todayDate,
        financialOpenCheck: financialData,
      }

      await onSave(updatedTender)
      onClose()
    } catch (err) {
      console.error('Error saving financial open check data:', err)
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
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-600 text-white flex items-center justify-center shadow-md">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-slate-900">
                  {currentMode === 'view'
                    ? 'Financial Open Check – Details & History'
                    : currentMode === 'edit'
                    ? 'Edit Financial Open Check'
                    : 'Stage 09 • Financial Open Check'}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                  Stage 09
                </span>
                {existingData?.ranking && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Rank: {existingData.ranking}
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

        {/* 3. QUALIFIED ACCESS CHECK BANNER */}
        {!isQualified && (
          <div className="px-6 py-3 bg-rose-50 border-b border-rose-200 flex items-start gap-2.5 text-rose-900 text-xs">
            <Lock className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Stage Access Locked</p>
              <p className="text-rose-700 mt-0.5">
                Financial Open Check tabhi accessible hoga jab previous stage (Technical Open Check) ka status <strong>Qualified</strong> ho. Abhi is tender ka status <strong>{techStatus || 'Pending Technical Check'}</strong> hai.
              </p>
            </div>
          </div>
        )}

        {/* 4. TABS */}
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
            <span>Price Bid &amp; Ranking</span>
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

        {/* 5. SCROLLABLE BODY */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'form' ? (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* FIELD 1: RANKING / STATUS (L1, L2, L3, L4, Other) */}
              <div>
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                  1. Financial Evaluation Ranking (Status / L1-L2) <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                  {(['L1', 'L2', 'L3', 'L4', 'Other'] as FinancialRanking[]).map(r => (
                    <button
                      key={r}
                      type="button"
                      disabled={isViewOnly || !isQualified}
                      onClick={() => {
                        setRanking(r)
                        if (r === 'L1') setL1BidderName('Our Firm (L1 Lowest)')
                      }}
                      className={`p-3 rounded-xl border text-center transition-all cursor-pointer disabled:cursor-default ${
                        ranking === r
                          ? r === 'L1'
                            ? 'border-emerald-600 bg-emerald-50 ring-2 ring-emerald-500/20 text-emerald-950 font-bold shadow-xs'
                            : 'border-blue-600 bg-blue-50 ring-2 ring-blue-500/20 text-blue-950 font-bold shadow-xs'
                          : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-center gap-1 mb-1">
                        {r === 'L1' && <Award className="w-4 h-4 text-emerald-600" />}
                        <span className="text-base font-extrabold">{r}</span>
                      </div>
                      <p className="text-[10px] text-slate-500">
                        {r === 'L1' ? 'Lowest Bidder' : `${r} Position`}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* FIELD 2: LOWEST QUOTED PRICE & BID DETAILS */}
              <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 space-y-3.5">
                <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                  <TrendingDown className="w-4 h-4 text-emerald-600" />
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    2. Lowest Quoted Price &amp; Financial Comparison
                  </h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Lowest Quoted Price (L1 Amount) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      disabled={isViewOnly || !isQualified}
                      value={l1Price}
                      onChange={e => setL1Price(e.target.value)}
                      placeholder="e.g. ₹ 2,85,00,000"
                      required
                      className="w-full text-xs sm:text-sm px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-blue-500 text-slate-800 font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      L1 Bidder Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      disabled={isViewOnly || !isQualified}
                      value={l1BidderName}
                      onChange={e => setL1BidderName(e.target.value)}
                      placeholder="e.g. Name of L1 Firm"
                      required
                      className="w-full text-xs sm:text-sm px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-blue-500 text-slate-800"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Our Quoted Price
                    </label>
                    <input
                      type="text"
                      disabled={isViewOnly || !isQualified}
                      value={ourBidPrice}
                      onChange={e => setOurBidPrice(e.target.value)}
                      placeholder="e.g. ₹ 2,85,00,000"
                      className="w-full text-xs sm:text-sm px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-blue-500 text-slate-800 font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Price Variance / Gap
                    </label>
                    <input
                      type="text"
                      disabled={isViewOnly || !isQualified}
                      value={priceVariance}
                      onChange={e => setPriceVariance(e.target.value)}
                      placeholder="e.g. 0% (Match) or +2.4%"
                      className="w-full text-xs sm:text-sm px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-blue-500 text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Opening Date
                    </label>
                    <input
                      type="date"
                      disabled={isViewOnly || !isQualified}
                      value={openingDate}
                      onChange={e => setOpeningDate(e.target.value)}
                      className="w-full text-xs sm:text-sm px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-blue-500 text-slate-800"
                    />
                  </div>
                </div>
              </div>

              {/* FIELD 3: MANUAL REMARK */}
              <div>
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
                  3. Remark
                </label>
                <textarea
                  rows={2}
                  disabled={isViewOnly || !isQualified}
                  value={remarks}
                  onChange={e => setRemarks(e.target.value)}
                  placeholder="Enter manual remarks regarding commercial scrutiny, price differences, reverse auction results..."
                  className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white focus:bg-white focus:outline-none focus:border-blue-500 transition-all resize-none text-slate-800"
                />
              </div>

              {/* ADVANCE TO STAGE 10 TOGGLE */}
              {isQualified && !isViewOnly && (
                <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span className="text-emerald-900 font-medium">
                      Advance to next stage: <strong>Stage 10 • Negotiation</strong>
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
                    Financial Evaluation History Log ({historyEntries.length})
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Audit trail of all recorded financial bid opening results.
                  </p>
                </div>
              </div>

              {historyEntries.length === 0 ? (
                <div className="text-center py-10 bg-slate-50 rounded-xl border border-slate-200 p-6">
                  <HistoryIcon className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-slate-700">No financial bid history recorded yet.</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Record financial opening details to build the audit log.
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
                              entry.ranking === 'L1'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-blue-50 text-blue-700 border-blue-200'
                            }`}
                          >
                            Rank: {entry.ranking}
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

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-100 my-2">
                        <div>
                          <span className="text-[10px] text-slate-400 block">Lowest (L1) Price</span>
                          <strong className="text-slate-800">{entry.l1Price}</strong>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">L1 Bidder</span>
                          <span className="text-slate-700 block truncate">{entry.l1BidderName}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">Our Quoted Price</span>
                          <span className="text-slate-700">{entry.ourBidPrice || '—'}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">Variance</span>
                          <span className="text-slate-700">{entry.priceVariance || '—'}</span>
                        </div>
                      </div>

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

        {/* 6. FOOTER */}
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
                <span>Edit Financials</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting || !isQualified}
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
