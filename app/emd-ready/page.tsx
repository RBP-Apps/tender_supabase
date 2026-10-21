'use client'

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  Building,
  Calendar,
  CheckCircle2,
  Clock3,
  CreditCard,
  FileText,
  Hash,
  IndianRupee,
  Landmark,
  Pencil,
  Search,
  Wallet,
} from 'lucide-react'
import { useTenders } from '@/context/TenderContext'
import { Status, Tender } from '@/types/tender'
import { EmdReadyModal } from '@/components/modals/EmdReadyModal'
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

export default function EmdReadyPage() {
  const { tenders, masters, updateTender, deleteTender, notify } = useTenders()
  const router = useRouter()
  const [tab, setTab] = useState<'pending' | 'completed'>('pending')
  const [query, setQuery] = useState('')

  // EMD Modal state
  const [emdModal, setEmdModal] = useState<{
    tender: Tender
    mode: 'action' | 'view'
  } | null>(null)

  // General Edit Tender Modal state
  const [editTender, setEditTender] = useState<Tender | null>(null)

  // Pending: Tenders currently in EMD Ready stage that haven't been completed
  const pendingTenders = useMemo(() => {
    return tenders.filter(
      t => t.stage === 'EMD Ready' && !t.emdReady?.completedAt
    )
  }, [tenders])

  // Completed / History: Tenders that completed EMD Ready and advanced to Document Ready
  const completedTenders = useMemo(() => {
    return tenders.filter(
      t => !!t.emdReady?.completedAt || (t.stage !== 'EMD Ready' && !!t.emdReady)
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
        t.emdReady?.utrNumber.toLowerCase().includes(q) ||
        t.emdReady?.amount.toLowerCase().includes(q)
    )
  }, [tab, pendingTenders, completedTenders, query])

  const handleCompleteEmd = (updatedTender: Tender) => {
    updateTender(updatedTender.id, updatedTender)
    setEmdModal(null)
    notify(
      `EMD submitted for "${updatedTender.title}". Moved to History and advanced to Document Ready.`
    )
    // As per user request: "after form submit document ready page me jayega"
    router.push('/document-ready')
  }

  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">WORKFLOW STAGE 03</p>
          <h1>EMD Ready</h1>
          <p>
            Verify Earnest Money Deposit (EMD) amount, department account, self account, UTR payment reference, and transaction date.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/sample-details" className="secondary-button text-xs">
            Previous: Sample Details
          </Link>
          <Link href="/document-ready" className="secondary-button text-xs">
            Next: Document Ready
          </Link>
          <div className="badge badge-blue py-2 px-3 text-xs font-semibold">
            {pendingTenders.length} Pending EMD
          </div>
        </div>
      </div>

      <div className="card list-card">
        {/* Tabs: Pending Action vs Completed / History */}
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

        {/* Search Bar */}
        <div className="filters-bar">
          <div className="search-box">
            <Search />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by tender title, ID, authority, UTR Number, amount..."
            />
          </div>
        </div>

        {/* Table */}
        <div className="table-wrap">
          {filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon-box">
                <Wallet />
              </div>
              <h3>{tab === 'completed' ? 'No completed EMD records yet' : 'No tenders pending in EMD Ready'}</h3>
              <p>
                {tab === 'completed'
                  ? 'Tenders with completed EMD payment, account details, and UTR numbers will be archived here.'
                  : 'Tenders completed in Stage 02 (Sample Details) automatically advance here for EMD payment verification.'}
              </p>
              {tab === 'pending' && (
                <Link href="/sample-details" className="primary-button">
                  Check Sample Details Stage
                </Link>
              )}
            </div>
          ) : (
            <table style={{ minWidth: tab === 'completed' ? '1550px' : '840px' }}>
              <thead>
                <tr>
                  <th className="action-col">Action</th>
                  <th>Tender</th>
                  {tab === 'completed' ? (
                    <>
                      <th>EMD Amount</th>
                      <th>Department Account</th>
                      <th>Self Account</th>
                      <th>UTR Number</th>
                      <th>Payment Date</th>
                      <th>Remark</th>
                      <th>Submitted On</th>
                      <th>Next Stage</th>
                    </>
                  ) : (
                    <>
                      <th>Department</th>
                      <th>State</th>
                      <th>Stage</th>
                      <th>Status</th>
                      <th>Due Date</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => (
                  <tr key={t.id}>
                    {/* First column: Action */}
                    <td className="action-col">
                      <div className="action-group">
                        {tab === 'pending' ? (
                          <button
                            className="table-action font-semibold"
                            title="Verify and submit EMD (Amount, Department Account, Self Account, UTR Number, Date, Remark)"
                            onClick={() => setEmdModal({ tender: t, mode: 'action' })}
                          >
                            Action <ArrowRight />
                          </button>
                        ) : (
                          <>
                            <button
                              className="table-action"
                              title="View submitted EMD payment details and accounts"
                              onClick={() => setEmdModal({ tender: t, mode: 'view' })}
                            >
                              View Details
                            </button>

                            {/* Stage Specific Edit - Only in Completed / History */}
                            <button
                              className="icon-action text-amber-600 hover:text-amber-800"
                              title="Edit EMD Ready details (Amount, Account, UTR, Date, Remark)"
                              onClick={() => setEmdModal({ tender: t, mode: 'action' })}
                            >
                              <Pencil />
                            </button>
                          </>
                        )}

                        {/* Auto-filled Bid documents */}
                        <Link
                          href={`/tender-documents/${encodeURIComponent(t.id)}`}
                          className="icon-action"
                          title="View auto-filled bid documents"
                        >
                          <FileText />
                        </Link>
                      </div>
                    </td>

                    {/* Tender Details */}
                    <td>
                      <div className="tender-name min-w-[170px] max-w-[240px]">
                        <strong className="block text-slate-900 truncate" title={t.title}>
                          {t.title}
                        </strong>
                        <small className="text-slate-500">
                          {t.id} · {t.authority} {t.value ? `· ${t.value}` : ''}
                        </small>
                      </div>
                    </td>

                    {/* Dynamic Columns for Pending vs History */}
                    {tab === 'completed' ? (
                      <>
                        {/* 1. Amount */}
                        <td>
                          <span className="font-bold text-slate-900 text-xs px-2 py-1 rounded bg-blue-50 text-blue-800 border border-blue-200 whitespace-nowrap">
                            {t.emdReady?.amount || '—'}
                          </span>
                        </td>

                        {/* 2. Department Account */}
                        <td>
                          <div className="min-w-[140px] max-w-[200px]">
                            <span className="font-semibold text-slate-800 text-xs block truncate" title={t.emdReady?.departmentAccount?.bankName}>
                              {t.emdReady?.departmentAccount?.bankName || '—'}
                            </span>
                            <small className="text-slate-500 block truncate font-mono text-[11px]">
                              A/c: {t.emdReady?.departmentAccount?.accountNo || '—'}
                            </small>
                            <small className="text-slate-400 block truncate font-mono text-[10px] uppercase">
                              IFSC: {t.emdReady?.departmentAccount?.ifsc || '—'}
                            </small>
                          </div>
                        </td>

                        {/* 3. Self Account */}
                        <td>
                          <div className="min-w-[140px] max-w-[200px]">
                            <span className="font-semibold text-slate-800 text-xs block truncate" title={t.emdReady?.selfAccount?.bankName}>
                              {t.emdReady?.selfAccount?.bankName || '—'}
                            </span>
                            <small className="text-slate-500 block truncate font-mono text-[11px]">
                              A/c: {t.emdReady?.selfAccount?.accountNo || '—'}
                            </small>
                            <small className="text-slate-400 block truncate font-mono text-[10px] uppercase">
                              IFSC: {t.emdReady?.selfAccount?.ifsc || '—'}
                            </small>
                          </div>
                        </td>

                        {/* 4. UTR Number */}
                        <td>
                          <span className="font-mono font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded text-xs whitespace-nowrap">
                            {t.emdReady?.utrNumber || '—'}
                          </span>
                        </td>

                        {/* 5. Date */}
                        <td>
                          <span className="text-xs text-slate-700 font-medium whitespace-nowrap">
                            {t.emdReady?.date || '—'}
                          </span>
                        </td>

                        {/* 6. Remark */}
                        <td>
                          <div className="min-w-[150px] max-w-[220px]">
                            {t.emdReady?.remarks ? (
                              <p className="text-xs text-slate-700 leading-relaxed line-clamp-2" title={t.emdReady.remarks}>
                                {t.emdReady.remarks}
                              </p>
                            ) : (
                              <span className="text-slate-400 text-xs italic">— None —</span>
                            )}
                          </div>
                        </td>

                        {/* Submitted On */}
                        <td>
                          <span className="text-xs text-slate-600 font-medium whitespace-nowrap">
                            {t.emdReady?.completedAt
                              ? new Date(t.emdReady.completedAt).toLocaleString('en-IN', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : 'Verified'}
                          </span>
                        </td>

                        {/* Next Stage */}
                        <td>
                          <span className="badge badge-green flex items-center gap-1 whitespace-nowrap">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            {t.stage}
                          </span>
                        </td>
                      </>
                    ) : (
                      <>
                        <td>{t.department}</td>
                        <td>{t.state}</td>
                        <td>
                          <span className="badge badge-slate">{t.stage}</span>
                        </td>
                        <td>
                          <span className={`badge ${statusTone(t.status)}`}>{t.status}</span>
                        </td>
                        <td>
                          <span className="due-badge">
                            <Clock3 />
                            {dueLabel(t.due)}
                          </span>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* EMD Verification Modal */}
      {emdModal && (
        <EmdReadyModal
          tender={emdModal.tender}
          mode={emdModal.mode}
          onClose={() => setEmdModal(null)}
          onComplete={handleCompleteEmd}
        />
      )}

      {/* General Tender Edit Modal */}
      {editTender && (
        <TenderModal
          mode="edit"
          tender={editTender}
          masters={masters}
          onClose={() => setEditTender(null)}
          onSave={saved => {
            updateTender(saved.id, saved)
            setEditTender(null)
          }}
        />
      )}
    </section>
  )
}
