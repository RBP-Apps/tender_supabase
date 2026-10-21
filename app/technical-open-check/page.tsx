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
  Settings2,
  Sparkles,
  XCircle,
  AlertOctagon,
} from 'lucide-react'
import { Tender } from '@/types/tender'
import { useTenders } from '@/context/TenderContext'
import { TechnicalOpenCheckModal } from '@/components/modals/TechnicalOpenCheckModal'

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

export default function TechnicalOpenCheckPage() {
  const { tenders, updateTender, deleteTender, notify } = useTenders()
  const [tab, setTab] = useState<'pending' | 'completed'>('pending')
  const [query, setQuery] = useState('')

  const [modalState, setModalState] = useState<{
    tender: Tender
    mode: 'action' | 'edit' | 'view'
  } | null>(null)

  const stageTenders = useMemo(() => {
    return tenders.filter(t => t.stage === 'Technical Open Check')
  }, [tenders])

  // Completed / History: Tenders where technicalOpenCheck is recorded or advanced to later stages
  const completedTenders = useMemo(() => {
    const postStages = ['Financial Open Check', 'Negotiation', 'Work Order']
    return tenders.filter(
      t =>
        (t.stage === 'Technical Open Check' && (t.status === 'Completed' || !!t.technicalOpenCheck?.status)) ||
        postStages.includes(t.stage) ||
        (t.stage !== 'Technical Open Check' && !!t.technicalOpenCheck)
    )
  }, [tenders])

  // Pending: Tenders currently in Technical Open Check that haven't been evaluated
  const pendingTenders = useMemo(() => {
    return tenders.filter(
      t =>
        t.stage === 'Technical Open Check' &&
        t.status !== 'Completed' &&
        !t.technicalOpenCheck?.status
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
        t.technicalOpenCheck?.remarks?.toLowerCase().includes(q) ||
        t.technicalOpenCheck?.status?.toLowerCase().includes(q) ||
        t.technicalOpenCheck?.evaluationCriteria?.toLowerCase().includes(q)
    )
  }, [pendingTenders, completedTenders, tab, query])

  const handleSaveModal = (updated: Tender) => {
    updateTender(updated.id, updated)
    notify(`Tender ${updated.id} Technical Open Check saved to Supabase`)
    setModalState(null)
  }

  return (
    <section className="page">
      {/* 1. PAGE HEADING */}
      <div className="page-heading">
        <div>
          <p className="eyebrow">WORKFLOW STAGE 08</p>
          <h1>8. Technical Open Check</h1>
          <p>
            AI-assisted technical bid opening schedules, technical evaluation criteria extraction, qualification status, and complete audit history.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Link href="/submit-in-website" className="secondary-button text-xs">
            Previous: Submit in website
          </Link>
          <Link href="/financial-open-check" className="secondary-button text-xs">
            Next: Financial Open Check
          </Link>
          <div className="badge badge-blue py-2 px-3 text-xs font-semibold">
            {stageTenders.length} Active in Stage
          </div>
        </div>
      </div>

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
              placeholder="Search by tender, ID, status (Qualified/Disqualified), or remarks..."
            />
          </div>
        </div>

        {/* 3. DEDICATED TABLE WITH TAILORED STAGE COLUMNS */}
        <div className="table-wrap">
          {filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon-box">
                <Settings2 />
              </div>
              <h3>
                {tab === 'completed'
                  ? 'No Technical Open Check evaluations recorded yet'
                  : 'No tenders pending Technical Open Check'}
              </h3>
              <p>
                {tab === 'completed'
                  ? 'Tenders with evaluated technical bids and recorded qualification status will appear here.'
                  : 'Tenders submitted in Stage 07 (Submit in website) automatically advance here for Technical Open Check.'}
              </p>
              {tab === 'pending' && (
                <Link href="/submit-in-website" className="primary-button">
                  Check Submit in website Stage
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
                      <th style={{ minWidth: 160 }}>Technical Status</th>
                      <th style={{ minWidth: 170 }}>Opening Schedule</th>
                      <th style={{ minWidth: 240 }}>Evaluation Criteria</th>
                      <th style={{ minWidth: 220 }}>Remarks</th>
                      <th style={{ minWidth: 150 }}>Evaluated Date</th>
                      <th style={{ minWidth: 140 }}>Current Stage</th>
                    </>
                  ) : (
                    <>
                      <th style={{ minWidth: 150 }}>Department</th>
                      <th style={{ minWidth: 130 }}>Estimated Value</th>
                      <th style={{ minWidth: 160 }}>Opening Schedule</th>
                      <th style={{ minWidth: 140 }}>Stage &amp; Status</th>
                      <th style={{ minWidth: 110 }}>Due Date</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => {
                  const toc = t.technicalOpenCheck
                  const status = toc?.status || 'Pending'

                  let statusBadge = (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                      <Clock className="w-3.5 h-3.5" />
                      Pending Open
                    </span>
                  )
                  if (status === 'Qualified') {
                    statusBadge = (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Qualified
                      </span>
                    )
                  } else if (status === 'Disqualified') {
                    statusBadge = (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                        <XCircle className="w-3.5 h-3.5" />
                        Disqualified
                      </span>
                    )
                  } else if (status === 'Tender Cancelled') {
                    statusBadge = (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300">
                        <AlertOctagon className="w-3.5 h-3.5" />
                        Tender Cancelled
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
                              className="table-action font-semibold"
                              title="Process Technical Open Check & AI extraction"
                              onClick={() => setModalState({ tender: t, mode: 'action' })}
                            >
                              Check <ArrowRight />
                            </button>
                          ) : (
                            <>
                              <button
                                className="icon-action text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                                title="View evaluation details and history"
                                onClick={() => setModalState({ tender: t, mode: 'view' })}
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                className="icon-action text-amber-600 hover:text-amber-800 hover:bg-amber-50"
                                title="Edit technical check details"
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
                          {/* 1. Status */}
                          <td>{statusBadge}</td>

                          {/* 2. Opening & Evaluation Schedule */}
                          <td>
                            <div className="text-xs space-y-1">
                              <div>
                                <span className="font-semibold text-slate-800 block">
                                  Open: {toc?.openingDate || '—'}
                                </span>
                                {toc?.openingTime && (
                                  <span className="text-slate-500 text-[11px] block">
                                    {toc.openingTime}
                                  </span>
                                )}
                              </div>
                              {toc?.evaluationDate && (
                                <div className="pt-1 border-t border-slate-100">
                                  <span className="text-[10px] text-indigo-700 font-bold block uppercase">
                                    Eval: {toc.evaluationDate}
                                  </span>
                                  {toc?.evaluationTime && toc.evaluationTime !== 'Not Found in Tender Document' && (
                                    <span className="text-slate-500 text-[11px] block">
                                      {toc.evaluationTime}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>

                          {/* 3. Evaluation Criteria */}
                          <td>
                            <div className="text-xs text-slate-700 max-w-[240px]">
                              <p className="line-clamp-2" title={toc?.evaluationCriteria || '—'}>
                                {toc?.evaluationCriteria || <span className="italic text-slate-400">— None recorded —</span>}
                              </p>
                            </div>
                          </td>

                          {/* 4. Remarks */}
                          <td>
                            <ExpandableRemarkCell text={toc?.remarks} />
                          </td>

                          {/* 5. Evaluated Date */}
                          <td>
                            <div className="text-xs text-slate-600">
                              <div className="flex items-center gap-1 text-slate-700 font-medium">
                                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                {toc?.submittedAt
                                  ? new Date(toc.submittedAt).toLocaleDateString('en-IN', {
                                      day: '2-digit',
                                      month: 'short',
                                      year: 'numeric',
                                    })
                                  : '—'}
                              </div>
                              <span className="text-[10px] text-slate-400">
                                By {toc?.submittedBy || t.owner || 'Admin'}
                              </span>
                            </div>
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
                          <td>
                            <div className="text-xs text-slate-600 truncate max-w-[160px]">
                              {t.department || '—'}
                            </div>
                          </td>

                          <td>
                            <div className="text-xs font-semibold text-slate-800">
                              {t.value || '—'}
                            </div>
                          </td>

                          <td>
                            <div className="text-xs text-slate-700">
                              <span className="font-medium block">
                                {t.bid?.bidDeadlineDate || t.due?.slice(0, 10) || 'Scheduled'}
                              </span>
                              <span className="text-[11px] text-slate-500">
                                {t.bid?.bidDeadlineTime || '15:30 Hrs'}
                              </span>
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

      {/* 4. TECHNICAL OPEN CHECK MODAL */}
      {modalState && (
        <TechnicalOpenCheckModal
          tender={modalState.tender}
          mode={modalState.mode}
          onClose={() => setModalState(null)}
          onSave={handleSaveModal}
        />
      )}
    </section>
  )
}
