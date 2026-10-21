'use client'

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  Building,
  Calendar,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  History as HistoryIcon,
  Pencil,
  Search,
  Zap,
  XCircle,
  Lock,
  DollarSign,
  AlertTriangle,
} from 'lucide-react'
import { Tender } from '@/types/tender'
import { useTenders } from '@/context/TenderContext'
import { FinancialOpenCheckModal } from '@/components/modals/FinancialOpenCheckModal'

function ExpandableRemarkCell({ text }: { text?: string | null }) {
  const [expanded, setExpanded] = useState(false)
  if (!text || !text.trim()) {
    return <span className="text-slate-400 text-xs italic">— None —</span>
  }
  const clean = text.trim()
  const isLong = clean.length > 70

  return (
    <div className="min-w-[160px] max-w-[240px] text-xs">
      <p
        className={`text-slate-700 leading-relaxed ${
          expanded ? 'whitespace-pre-wrap break-words' : 'line-clamp-2'
        }`}
        title={clean}
      >
        {clean}
      </p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-[10px] text-blue-600 hover:text-blue-800 font-semibold underline mt-0.5 cursor-pointer"
        >
          {expanded ? 'Show Less' : 'Show Full'}
        </button>
      )}
    </div>
  )
}

export default function FinancialOpenCheckPage() {
  const { tenders, updateTender, deleteTender, notify } = useTenders()
  const [tab, setTab] = useState<'pending' | 'completed'>('pending')
  const [query, setQuery] = useState('')

  const [modalState, setModalState] = useState<{
    tender: Tender
    mode: 'action' | 'edit' | 'view'
  } | null>(null)

  const [lockedAlert, setLockedAlert] = useState<string | null>(null)

  const stageTenders = useMemo(() => {
    return tenders.filter(t => t.stage === 'Financial Open Check')
  }, [tenders])

  // Completed / History: Tenders where financialOpenCheck is recorded or advanced to Negotiation/Work Order
  const completedTenders = useMemo(() => {
    const postStages = ['Negotiation', 'Work Order']
    return tenders.filter(
      t =>
        (t.stage === 'Financial Open Check' && (t.status === 'Completed' || !!t.financialOpenCheck?.ranking)) ||
        postStages.includes(t.stage) ||
        (t.stage !== 'Financial Open Check' && !!t.financialOpenCheck)
    )
  }, [tenders])

  // Pending: Tenders currently in Financial Open Check that haven't been evaluated
  const pendingTenders = useMemo(() => {
    return tenders.filter(
      t =>
        t.stage === 'Financial Open Check' &&
        t.status !== 'Completed' &&
        !t.financialOpenCheck?.ranking
    )
  }, [tenders])

  const filtered = useMemo(() => {
    const list = tab === 'completed' ? completedTenders : pendingTenders

    if (!query.trim()) return list
    const q = query.toLowerCase()
    return list.filter(
      t =>
        t.title.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q) ||
        t.authority.toLowerCase().includes(q) ||
        t.department.toLowerCase().includes(q) ||
        t.remarks?.toLowerCase().includes(q) ||
        t.financialOpenCheck?.remarks?.toLowerCase().includes(q) ||
        t.financialOpenCheck?.ranking?.toLowerCase().includes(q) ||
        t.financialOpenCheck?.l1BidderName?.toLowerCase().includes(q) ||
        t.financialOpenCheck?.l1Price?.toLowerCase().includes(q)
    )
  }, [pendingTenders, completedTenders, tab, query])

  const handleSaveModal = (updated: Tender) => {
    updateTender(updated.id, updated)
    notify(`Tender ${updated.id} Financial Open Check saved to Supabase`)
    setModalState(null)
  }

  const handleOpenAction = (t: Tender) => {
    const isQualified = t.technicalOpenCheck?.status === 'Qualified'
    if (!isQualified) {
      setLockedAlert(
        `Tender ${t.id} cannot proceed to Financial Open Check because its Technical Open Check status is '${t.technicalOpenCheck?.status || 'Not Evaluated'}'. Only tenders marked as 'Qualified' in Stage 08 can enter Financial Open Check.`
      )
      return
    }
    setModalState({ tender: t, mode: 'action' })
  }

  return (
    <section className="page">
      {/* 1. PAGE HEADING */}
      <div className="page-heading">
        <div>
          <p className="eyebrow">WORKFLOW STAGE 09</p>
          <h1>9. Financial Open Check</h1>
          <p>
            Evaluate commercial price bids, record L1/L2/L3 rankings, lowest quoted prices, price variances, and audit history.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Link href="/technical-open-check" className="secondary-button text-xs">
            Previous: Technical Open Check
          </Link>
          <Link href="/negotiation" className="secondary-button text-xs">
            Next: Negotiation
          </Link>
          <div className="badge badge-blue py-2 px-3 text-xs font-semibold">
            {stageTenders.length} Active in Stage
          </div>
        </div>
      </div>

      {lockedAlert && (
        <div className="mb-4 p-4 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-900 flex items-start justify-between gap-3 shadow-sm">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <strong className="block text-amber-950 font-bold mb-0.5">
                Stage Prerequisite Required
              </strong>
              <span>{lockedAlert}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setLockedAlert(null)}
            className="text-amber-700 hover:text-amber-950 font-bold px-2 py-0.5 rounded cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 2. LIST CARD WITH TABS & FILTERS */}
      <div className="card list-card">
        <div className="tabs">
          <button
            className={tab === 'pending' ? 'tab active' : 'tab'}
            onClick={() => setTab('pending')}
          >
            Pending Action <span>{pendingTenders.length}</span>
          </button>
          <button
            className={tab === 'completed' ? 'tab active' : 'tab'}
            onClick={() => setTab('completed')}
          >
            Completed / History <span>{completedTenders.length}</span>
          </button>
        </div>

        <div className="filters-bar">
          <div className="search-box">
            <Search />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by tender, ID, ranking (L1/L2), bidder name, or remarks..."
            />
          </div>
        </div>

        {/* 3. DEDICATED TABLE WITH TAILORED STAGE COLUMNS */}
        <div className="table-wrap">
          {filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon-box">
                <Zap />
              </div>
              <h3>
                {tab === 'completed'
                  ? 'No Financial Open Check evaluations recorded yet'
                  : 'No tenders pending Financial Open Check'}
              </h3>
              <p>
                {tab === 'completed'
                  ? 'Tenders with completed commercial evaluation and L1/L2 ranking will appear here in the history log.'
                  : 'Tenders that qualify in Stage 08 (Technical Open Check) automatically advance here for price bid opening.'}
              </p>
              {tab === 'pending' && (
                <Link href="/technical-open-check" className="primary-button">
                  Check Technical Open Check Stage
                </Link>
              )}
            </div>
          ) : (
            <table style={{ minWidth: tab === 'completed' ? '1380px' : '980px' }}>
              <thead>
                <tr>
                  <th className="action-col">Action</th>
                  <th>Tender</th>
                  {tab === 'completed' ? (
                    <>
                      <th style={{ minWidth: 120 }}>Ranking</th>
                      <th style={{ minWidth: 180 }}>L1 Lowest Quoted Price</th>
                      <th style={{ minWidth: 180 }}>Our Bid &amp; Variance</th>
                      <th style={{ minWidth: 150 }}>Opening Date</th>
                      <th style={{ minWidth: 220 }}>Remarks</th>
                      <th style={{ minWidth: 140 }}>Current Stage</th>
                    </>
                  ) : (
                    <>
                      <th style={{ minWidth: 160 }}>Technical Status</th>
                      <th style={{ minWidth: 140 }}>Estimated Value</th>
                      <th style={{ minWidth: 150 }}>Department</th>
                      <th style={{ minWidth: 140 }}>Stage &amp; Status</th>
                      <th style={{ minWidth: 110 }}>Due Date</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => {
                  const foc = t.financialOpenCheck
                  const isQualified = t.technicalOpenCheck?.status === 'Qualified'
                  const rank = foc?.ranking || 'L1'

                  let rankBadge = (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                      Rank: L1 (Lowest)
                    </span>
                  )
                  if (rank === 'L2') {
                    rankBadge = (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200">
                        Rank: L2
                      </span>
                    )
                  } else if (rank !== 'L1') {
                    rankBadge = (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-800 border border-slate-300">
                        Rank: {rank}
                      </span>
                    )
                  }

                  return (
                    <tr key={t.id}>
                      {/* Action Column */}
                      <td className="action-col">
                        <div className="action-group">
                          {tab === 'pending' ? (
                            <button
                              className={`table-action font-semibold ${
                                !isQualified ? 'opacity-70 cursor-not-allowed bg-slate-100 text-slate-600 border-slate-300' : ''
                              }`}
                              title={
                                isQualified
                                  ? 'Record Financial Open Check evaluation'
                                  : 'Locked: Requires Technical Open Check to be Qualified'
                              }
                              onClick={() => handleOpenAction(t)}
                            >
                              {!isQualified ? (
                                <>
                                  <Lock className="w-3.5 h-3.5 text-amber-600" />
                                  Locked
                                </>
                              ) : (
                                <>
                                  Evaluate <ArrowRight />
                                </>
                              )}
                            </button>
                          ) : (
                            <>
                              <button
                                className="icon-action text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                                title="View financial evaluation details & history"
                                onClick={() => setModalState({ tender: t, mode: 'view' })}
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                className="icon-action text-amber-600 hover:text-amber-800 hover:bg-amber-50"
                                title="Edit financial details"
                                onClick={() => setModalState({ tender: t, mode: 'edit' })}
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                            </>
                          )}

                        </div>
                      </td>

                      {/* Tender Name & ID */}
                      <td>
                        <div className="tender-name min-w-[200px] max-w-[280px]">
                          <strong className="block text-slate-900 truncate" title={t.title}>
                            {t.title}
                          </strong>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-slate-400 font-mono text-[11px]">
                              {t.id}
                            </span>
                            <span className="text-slate-300">•</span>
                            <span className="text-slate-600 text-[11px] truncate" title={t.authority}>
                              {t.authority}
                            </span>
                          </div>
                        </div>
                      </td>

                      {tab === 'completed' ? (
                        <>
                          {/* 1. Ranking */}
                          <td>{rankBadge}</td>

                          {/* 2. Lowest Quoted Price & Bidder */}
                          <td>
                            <div className="text-xs">
                              <span className="font-bold text-slate-800 block">
                                {foc?.l1Price || '—'}
                              </span>
                              <span className="text-slate-500 text-[11px] truncate block max-w-[170px]" title={foc?.l1BidderName}>
                                {foc?.l1BidderName || 'Bidder not recorded'}
                              </span>
                            </div>
                          </td>

                          {/* 3. Our Bid Price & Variance */}
                          <td>
                            <div className="text-xs">
                              <span className="font-semibold text-slate-800 block">
                                {foc?.ourBidPrice || t.value || '—'}
                              </span>
                              {foc?.priceVariance ? (
                                <span className="text-[11px] text-amber-600 font-medium">
                                  Gap: {foc.priceVariance}
                                </span>
                              ) : (
                                <span className="text-[11px] text-slate-400">Direct match</span>
                              )}
                            </div>
                          </td>

                          {/* 4. Opening Date */}
                          <td>
                            <div className="text-xs text-slate-600 flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5 text-slate-400" />
                              <span>{foc?.openingDate || '—'}</span>
                            </div>
                          </td>

                          {/* 5. Remarks */}
                          <td>
                            <ExpandableRemarkCell text={foc?.remarks} />
                          </td>

                          {/* 6. Current Stage */}
                          <td>
                            <span className="badge badge-blue text-[11px] font-semibold whitespace-nowrap">
                              {t.stage}
                            </span>
                          </td>
                        </>
                      ) : (
                        <>
                          {/* Technical Qualification status */}
                          <td>
                            {isQualified ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Tech Qualified
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200" title="Must be Qualified in Stage 08">
                                <Lock className="w-3 h-3 text-amber-600" />
                                {t.technicalOpenCheck?.status || 'Pending Tech Check'}
                              </span>
                            )}
                          </td>

                          <td>
                            <div className="text-xs font-semibold text-slate-800">
                              {t.value || '—'}
                            </div>
                          </td>

                          <td>
                            <div className="text-xs text-slate-600 truncate max-w-[160px]">
                              {t.department || '—'}
                            </div>
                          </td>

                          <td>
                            <span className="badge badge-amber text-[11px] font-semibold">
                              {t.status}
                            </span>
                          </td>

                          <td>
                            <div className="text-xs text-slate-600">
                              {t.due ? new Date(t.due).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* 4. FINANCIAL OPEN CHECK MODAL */}
      {modalState && (
        <FinancialOpenCheckModal
          tender={modalState.tender}
          mode={modalState.mode}
          onClose={() => setModalState(null)}
          onSave={handleSaveModal}
        />
      )}
    </section>
  )
}
