'use client'

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  Building,
  Calendar,
  CheckCircle2,
  Clock,
  Clock3,
  Eye,
  FileText,
  Globe,
  History as HistoryIcon,
  Layers,
  Pencil,
  Search,
} from 'lucide-react'
import { Stage, Status, Tender } from '@/types/tender'
import { useTenders } from '@/context/TenderContext'
import { SubmitInWebsiteModal } from '@/components/modals/SubmitInWebsiteModal'
import { TenderModal } from '@/components/modals/TenderModal'

function statusTone(status: Status) {
  switch (status) {
    case 'Ready':
    case 'Completed':
      return 'badge-green'
    case 'At Risk':
      return 'badge-red'
    case 'Submitted':
      return 'badge-blue'
    case 'In Progress':
    default:
      return 'badge-amber'
  }
}

function dueLabel(date: string) {
  if (!date) return 'No date'
  const days = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000)
  if (days < 0) return 'Overdue'
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}

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

export default function SubmitInWebsitePage() {
  const { tenders, masters, updateTender, deleteTender, notify } = useTenders()
  const router = useRouter()
  const [tab, setTab] = useState<'pending' | 'completed'>('pending')
  const [query, setQuery] = useState('')

  // State for SubmitInWebsiteModal (Action, Edit, or View)
  const [modalState, setModalState] = useState<{
    tender: Tender
    mode: 'action' | 'edit' | 'view'
  } | null>(null)

  // State for basic TenderModal (if opened)
  const [basicEditTender, setBasicEditTender] = useState<Tender | null>(null)

  const stageTenders = useMemo(() => {
    return tenders.filter(t => t.stage === 'Submit in website')
  }, [tenders])

  // Completed / History: Tenders where submitInWebsite is done or advanced to later stages
  const completedTenders = useMemo(() => {
    const postStages = ['Technical Open Check', 'Financial Open Check']
    return tenders.filter(
      t =>
        (t.stage === 'Submit in website' &&
          (t.status === 'Completed' ||
            t.submitInWebsite?.status === 'Yes – Submitted' ||
            t.submitInWebsite?.status === 'Yes')) ||
        postStages.includes(t.stage) ||
        (t.stage !== 'Submit in website' && !!t.submitInWebsite)
    )
  }, [tenders])

  // Pending: Tenders currently in Submit in website stage that haven't been completed
  const pendingTenders = useMemo(() => {
    return tenders.filter(
      t =>
        t.stage === 'Submit in website' &&
        t.status !== 'Completed' &&
        t.submitInWebsite?.status !== 'Yes – Submitted' &&
        t.submitInWebsite?.status !== 'Yes'
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
        t.submitInWebsite?.remarks?.toLowerCase().includes(q) ||
        t.submitInWebsite?.tenderCategory?.toLowerCase().includes(q)
    )
  }, [pendingTenders, completedTenders, tab, query])

  const handleSaveSubmit = (updated: Tender) => {
    updateTender(updated.id, updated)
    notify(`Tender ${updated.id} submission details saved to Database`)
    setModalState(null)
  }

  const handleSaveBasicEdit = (saved: Tender) => {
    updateTender(saved.id, saved)
    setBasicEditTender(null)
    router.push(`/tender-documents/${encodeURIComponent(saved.id)}`)
  }

  return (
    <section className="page">
      {/* 1. PAGE HEADING */}
      <div className="page-heading">
        <div>
          <p className="eyebrow">WORKFLOW STAGE 07</p>
          <h1>7. Submit in website</h1>
          <p>
            Submit final bid online or offline, record tender category &amp; submission status, and maintain complete audit history.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Link href="/document-upload-in-portal" className="secondary-button text-xs">
            Previous: Document Upload in portal
          </Link>
          <Link href="/technical-open-check" className="secondary-button text-xs">
            Next: Technical Open Check
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
              placeholder="Search by tender, ID, category, status, or remarks..."
            />
          </div>
        </div>

        {/* 3. DEDICATED TABLE WITH TAILORED STAGE COLUMNS */}
        <div className="table-wrap">
          {filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon-box">
                <Globe />
              </div>
              <h3>
                {tab === 'completed'
                  ? 'No completed website submissions recorded yet'
                  : 'No tenders pending in Submit in website'}
              </h3>
              <p>
                {tab === 'completed'
                  ? 'Tenders with submitted bids and verified tokens will appear here in the history log.'
                  : "Tenders approved in Stage 06 (Document Upload in portal) automatically advance here for final website submission."}
              </p>
              {tab === 'pending' && (
                <Link href="/document-upload-in-portal" className="primary-button">
                  Check Document Upload in portal Stage
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
                      <th style={{ minWidth: 170 }}>1. Tender Category</th>
                      <th style={{ minWidth: 150 }}>2. Status</th>
                      <th style={{ minWidth: 220 }}>3. Remark</th>
                      <th style={{ minWidth: 160 }}>Submission Date</th>
                      <th style={{ minWidth: 140 }}>Current Stage</th>
                      <th style={{ minWidth: 110 }}>Due Date</th>
                    </>
                  ) : (
                    <>
                      <th style={{ minWidth: 150 }}>Department</th>
                      <th style={{ minWidth: 120 }}>State</th>
                      <th style={{ minWidth: 130 }}>Estimated Value</th>
                      <th style={{ minWidth: 140 }}>Stage &amp; Status</th>
                      <th style={{ minWidth: 110 }}>Due Date</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => {
                  const sw = t.submitInWebsite
                  const tenderCat =
                    sw?.tenderCategory ||
                    (sw?.onlineOffline === 'No' ? 'Online and Offline Tender' : 'Online Tender')
                  const subStatus = sw?.status || (t.status === 'Completed' ? 'Yes – Submitted' : 'No – Pending')
                  const isSubmitted = subStatus === 'Yes – Submitted' || subStatus === 'Yes'

                  return (
                    <tr key={t.id}>
                      {/* Action Column */}
                      <td className="action-col">
                        <div className="action-group">
                          {tab === 'pending' ? (
                            <button
                              className="table-action font-semibold"
                              title="Process website submission and record tender category"
                              onClick={() => setModalState({ tender: t, mode: 'action' })}
                            >
                              Process <ArrowRight />
                            </button>
                          ) : (
                            <>
                              {/* View Details & History button */}
                              <button
                                className="icon-action text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                                title="View submission details and audit history"
                                onClick={() => setModalState({ tender: t, mode: 'view' })}
                              >
                                <Eye className="w-4 h-4" />
                              </button>

                              {/* Edit details button */}
                              <button
                                className="icon-action text-amber-600 hover:text-amber-800 hover:bg-amber-50"
                                title="Edit submission category, status, and remarks"
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
                          <small className="text-slate-500 font-mono text-[11px] block mt-0.5">
                            {t.id} · {t.authority} {t.value ? `· ${t.value}` : ''}
                          </small>
                        </div>
                      </td>

                      {/* Completed / History Tab Specific Columns */}
                      {tab === 'completed' ? (
                        <>
                          {/* 1. Tender Category */}
                          <td>
                            <div className="min-w-[150px]">
                              <span
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${
                                  tenderCat === 'Online and Offline Tender'
                                    ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                    : 'bg-blue-50 text-blue-700 border-blue-200'
                                }`}
                              >
                                {tenderCat === 'Online and Offline Tender' ? (
                                  <Layers className="w-3.5 h-3.5" />
                                ) : (
                                  <Globe className="w-3.5 h-3.5" />
                                )}
                                {tenderCat}
                              </span>
                            </div>
                          </td>

                          {/* 2. Status */}
                          <td>
                            <div className="min-w-[130px]">
                              <span
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${
                                  isSubmitted
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                    : 'bg-amber-50 text-amber-800 border-amber-200'
                                }`}
                              >
                                {isSubmitted ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                ) : (
                                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                                )}
                                {subStatus}
                              </span>
                            </div>
                          </td>

                          {/* 3. Remark */}
                          <td>
                            <ExpandableRemarkCell text={sw?.remarks} />
                          </td>

                          {/* 4. Submission Date */}
                          <td>
                            <div className="min-w-[140px] text-xs">
                              {sw?.submittedAt ? (
                                <>
                                  <span className="font-semibold text-slate-800 block">
                                    {new Date(sw.submittedAt).toLocaleDateString('en-IN', {
                                      day: '2-digit',
                                      month: 'short',
                                      year: 'numeric',
                                    })}
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-mono block">
                                    {new Date(sw.submittedAt).toLocaleTimeString('en-IN', {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </span>
                                </>
                              ) : (
                                <span className="text-slate-400 italic">—</span>
                              )}
                            </div>
                          </td>

                          {/* 5. Stage & Status */}
                          <td>
                            <div className="flex flex-col gap-1 min-w-[120px]">
                              <span className="font-semibold text-slate-800 text-xs whitespace-nowrap">
                                {t.stage}
                              </span>
                              <span className={`badge ${statusTone(t.status)} whitespace-nowrap w-fit`}>
                                {t.status}
                              </span>
                            </div>
                          </td>

                          {/* 6. Due Date */}
                          <td>
                            <span className="text-xs font-medium text-slate-700 whitespace-nowrap">
                              {dueLabel(t.due)}
                            </span>
                          </td>
                        </>
                      ) : (
                        /* Pending Action Columns */
                        <>
                          <td>{t.department}</td>
                          <td>{t.state}</td>
                          <td>{t.value || '—'}</td>
                          <td>
                            <div className="flex flex-col gap-1">
                              <span className="font-semibold text-slate-800 text-xs whitespace-nowrap">
                                {t.stage}
                              </span>
                              <span className={`badge ${statusTone(t.status)} whitespace-nowrap w-fit`}>
                                {t.status}
                              </span>
                            </div>
                          </td>
                          <td>
                            <span className="text-xs font-medium text-slate-700 whitespace-nowrap">
                              {dueLabel(t.due)}
                            </span>
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

      {/* 4. SUBMIT IN WEBSITE MODAL (Action, Edit, or View mode) */}
      {modalState && (
        <SubmitInWebsiteModal
          tender={modalState.tender}
          mode={modalState.mode}
          onClose={() => setModalState(null)}
          onSave={handleSaveSubmit}
        />
      )}

      {/* 5. BASIC TENDER DETAILS EDIT MODAL */}
      {basicEditTender && (
        <TenderModal
          mode="edit"
          tender={basicEditTender}
          masters={masters}
          onClose={() => setBasicEditTender(null)}
          onSave={handleSaveBasicEdit}
        />
      )}
    </section>
  )
}
