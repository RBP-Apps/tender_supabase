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
  Handshake,
  History as HistoryIcon,
  Pencil,
  Search,
  XCircle,
  HelpCircle,
  Paperclip,
} from 'lucide-react'
import { Tender } from '@/types/tender'
import { useTenders } from '@/context/TenderContext'
import { NegotiationModal } from '@/components/modals/NegotiationModal'

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

export default function NegotiationPage() {
  const { tenders, updateTender, deleteTender, notify } = useTenders()
  const [tab, setTab] = useState<'pending' | 'completed'>('pending')
  const [query, setQuery] = useState('')

  const [modalState, setModalState] = useState<{
    tender: Tender
    mode: 'action' | 'edit' | 'view'
  } | null>(null)

  const stageTenders = useMemo(() => {
    return tenders.filter(t => t.stage === 'Negotiation')
  }, [tenders])

  // Completed / History: Tenders where negotiation is recorded or advanced to Work Order
  const completedTenders = useMemo(() => {
    const postStages = ['Work Order']
    return tenders.filter(
      t =>
        (t.stage === 'Negotiation' && (t.status === 'Completed' || !!t.negotiation?.status)) ||
        postStages.includes(t.stage) ||
        (t.stage !== 'Negotiation' && !!t.negotiation)
    )
  }, [tenders])

  // Pending: Tenders currently in Negotiation that haven't been evaluated
  const pendingTenders = useMemo(() => {
    return tenders.filter(
      t =>
        t.stage === 'Negotiation' &&
        t.status !== 'Completed' &&
        !t.negotiation?.status
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
        t.negotiation?.remarks?.toLowerCase().includes(q) ||
        t.negotiation?.status?.toLowerCase().includes(q) ||
        t.negotiation?.negotiatedPrice?.toLowerCase().includes(q)
    )
  }, [pendingTenders, completedTenders, tab, query])

  const handleSaveModal = (updated: Tender) => {
    updateTender(updated.id, updated)
    notify(`Tender ${updated.id} Negotiation details saved to Supabase`)
    setModalState(null)
  }

  return (
    <section className="page">
      {/* 1. PAGE HEADING */}
      <div className="page-heading">
        <div>
          <p className="eyebrow">WORKFLOW STAGE 10</p>
          <h1>10. Negotiation</h1>
          <p>
            Record commercial negotiation sessions, upload mandatory correspondence letters, update revised contract prices, and log audit history.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Link href="/financial-open-check" className="secondary-button text-xs">
            Previous: Financial Open Check
          </Link>
          <Link href="/work-order" className="secondary-button text-xs">
            Next: Work Order
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
              placeholder="Search by tender, ID, status (Yes/No/NA), or remarks..."
            />
          </div>
        </div>

        {/* 3. DEDICATED TABLE WITH TAILORED STAGE COLUMNS */}
        <div className="table-wrap">
          {filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon-box">
                <Handshake />
              </div>
              <h3>
                {tab === 'completed'
                  ? 'No negotiation records found yet'
                  : 'No tenders pending in Negotiation'}
              </h3>
              <p>
                {tab === 'completed'
                  ? 'Tenders with completed negotiation letters and price revisions will appear here.'
                  : 'Tenders evaluated in Stage 09 (Financial Open Check) automatically advance here for negotiation recording.'}
              </p>
              {tab === 'pending' && (
                <Link href="/financial-open-check" className="primary-button">
                  Check Financial Open Check Stage
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
                      <th style={{ minWidth: 160 }}>Negotiation Status</th>
                      <th style={{ minWidth: 190 }}>Attached Letter</th>
                      <th style={{ minWidth: 170 }}>Negotiated Price</th>
                      <th style={{ minWidth: 140 }}>Meeting Date</th>
                      <th style={{ minWidth: 220 }}>Remarks</th>
                      <th style={{ minWidth: 140 }}>Current Stage</th>
                    </>
                  ) : (
                    <>
                      <th style={{ minWidth: 140 }}>Our Quoted Price</th>
                      <th style={{ minWidth: 140 }}>Financial Rank</th>
                      <th style={{ minWidth: 150 }}>Department</th>
                      <th style={{ minWidth: 140 }}>Stage &amp; Status</th>
                      <th style={{ minWidth: 110 }}>Due Date</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => {
                  const neg = t.negotiation
                  const status = neg?.status || 'Pending'

                  let statusBadge = (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Yes – Negotiated
                    </span>
                  )
                  if (status === 'No') {
                    statusBadge = (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                        <XCircle className="w-3.5 h-3.5" />
                        No – As Quoted
                      </span>
                    )
                  } else if (status === 'Not Applicable') {
                    statusBadge = (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300">
                        <HelpCircle className="w-3.5 h-3.5" />
                        Not Applicable
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
                              title="Record negotiation status & letter"
                              onClick={() => setModalState({ tender: t, mode: 'action' })}
                            >
                              Negotiate <ArrowRight />
                            </button>
                          ) : (
                            <>
                              <button
                                className="icon-action text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                                title="View negotiation details & history"
                                onClick={() => setModalState({ tender: t, mode: 'view' })}
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                className="icon-action text-amber-600 hover:text-amber-800 hover:bg-amber-50"
                                title="Edit negotiation details"
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

                          {/* 2. Attached Letter */}
                          <td>
                            {neg?.letterDoc ? (
                              <div className="flex items-center gap-2 text-xs">
                                <Paperclip className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                {neg.letterDoc.dataUrl ? (
                                  <a
                                    href={neg.letterDoc.dataUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:text-blue-800 font-medium underline truncate max-w-[150px]"
                                    title={neg.letterDoc.name}
                                  >
                                    {neg.letterDoc.name}
                                  </a>
                                ) : (
                                  <span className="text-slate-700 truncate max-w-[150px]">
                                    {neg.letterDoc.name}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400 italic">Not required / None</span>
                            )}
                          </td>

                          {/* 3. Negotiated Price */}
                          <td>
                            <div className="text-xs">
                              <span className="font-bold text-slate-800 block">
                                {neg?.negotiatedPrice || t.financialOpenCheck?.ourBidPrice || t.value || '—'}
                              </span>
                              <span className="text-[11px] text-slate-500">
                                {status === 'Yes' ? 'Agreed price' : 'Quoted price'}
                              </span>
                            </div>
                          </td>

                          {/* 4. Meeting Date */}
                          <td>
                            <div className="text-xs text-slate-600 flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5 text-slate-400" />
                              <span>{neg?.meetingDate || '—'}</span>
                            </div>
                          </td>

                          {/* 5. Remarks */}
                          <td>
                            <ExpandableRemarkCell text={neg?.remarks} />
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
                            <div className="text-xs font-semibold text-slate-800">
                              {t.financialOpenCheck?.ourBidPrice || t.value || '—'}
                            </div>
                          </td>

                          <td>
                            <span className="badge badge-blue text-[11px] font-semibold">
                              {t.financialOpenCheck?.ranking ? `Rank: ${t.financialOpenCheck.ranking}` : 'Evaluated'}
                            </span>
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

      {/* 4. NEGOTIATION MODAL */}
      {modalState && (
        <NegotiationModal
          tender={modalState.tender}
          mode={modalState.mode}
          onClose={() => setModalState(null)}
          onSave={handleSaveModal}
        />
      )}
    </section>
  )
}
