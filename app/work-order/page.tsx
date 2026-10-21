'use client'

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  Award,
  Building,
  Calendar,
  CheckCircle2,
  Clock,
  Eye,
  FileDown,
  FileText,
  History as HistoryIcon,
  Pencil,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { Tender } from '@/types/tender'
import { useTenders } from '@/context/TenderContext'
import { WorkOrderModal } from '@/components/modals/WorkOrderModal'
import { downloadWorkOrderAgreementDocx } from '@/lib/work-order-docx'

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

export default function WorkOrderPage() {
  const { tenders, updateTender, deleteTender, notify } = useTenders()
  const [tab, setTab] = useState<'pending' | 'completed'>('pending')
  const [query, setQuery] = useState('')

  const [modalState, setModalState] = useState<{
    tender: Tender
    mode: 'action' | 'edit' | 'view'
  } | null>(null)

  const stageTenders = useMemo(() => {
    return tenders.filter(t => t.stage === 'Work Order')
  }, [tenders])

  // Completed / History: Tenders where workOrder is recorded or tender is Completed
  const completedTenders = useMemo(() => {
    return tenders.filter(
      t =>
        (t.stage === 'Work Order' && (t.status === 'Completed' || !!t.workOrder?.workOrderNumber)) ||
        (t.status === 'Completed' && !!t.workOrder)
    )
  }, [tenders])

  // Pending: Tenders in Work Order stage that haven't finalized
  const pendingTenders = useMemo(() => {
    return tenders.filter(
      t =>
        t.stage === 'Work Order' &&
        t.status !== 'Completed' &&
        !t.workOrder?.workOrderNumber
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
        t.workOrder?.remarks?.toLowerCase().includes(q) ||
        t.workOrder?.workOrderNumber?.toLowerCase().includes(q) ||
        t.workOrder?.bgBankName?.toLowerCase().includes(q) ||
        t.workOrder?.bgNumber?.toLowerCase().includes(q)
    )
  }, [pendingTenders, completedTenders, tab, query])

  const handleSaveModal = (updated: Tender) => {
    updateTender(updated.id, updated)
    notify(`Tender ${updated.id} Work Order details saved to Supabase`)
    setModalState(null)
  }

  const handleDownloadAgreement = async (t: Tender) => {
    const agreementText = t.workOrder?.generatedAgreement
    if (!agreementText) {
      alert('No generated agreement found. Open the modal to generate one via AI.')
      return
    }
    await downloadWorkOrderAgreementDocx(t, agreementText, t.workOrder?.workOrderNumber)
  }

  return (
    <section className="page">
      {/* 1. PAGE HEADING */}
      <div className="page-heading">
        <div>
          <p className="eyebrow">WORKFLOW STAGE 11</p>
          <h1>11. Work Order</h1>
          <p>
            Official work order document repository, AI terms &amp; conditions summary, Bank Guarantee (PBG) instruments, and automated Word (.docx) contract agreement drafting.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Link href="/negotiation" className="secondary-button text-xs">
            Previous: Negotiation
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
              placeholder="Search by tender, ID, Work Order #, Bank Guarantee, or remarks..."
            />
          </div>
        </div>

        {/* 3. DEDICATED TABLE WITH TAILORED STAGE COLUMNS */}
        <div className="table-wrap">
          {filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon-box">
                <Award />
              </div>
              <h3>
                {tab === 'completed'
                  ? 'No executed Work Orders recorded yet'
                  : 'No tenders pending Work Order'}
              </h3>
              <p>
                {tab === 'completed'
                  ? 'Tenders with uploaded work orders, bank guarantees, and finalized contract agreements will appear here.'
                  : 'Tenders completed in Stage 10 (Negotiation) advance here for work order execution and contract agreement drafting.'}
              </p>
              {tab === 'pending' && (
                <Link href="/negotiation" className="primary-button">
                  Check Negotiation Stage
                </Link>
              )}
            </div>
          ) : (
            <table style={{ minWidth: tab === 'completed' ? '1460px' : '980px' }}>
              <thead>
                <tr>
                  <th className="action-col">Action</th>
                  <th>Tender</th>
                  {tab === 'completed' ? (
                    <>
                      <th style={{ minWidth: 170 }}>Work Order &amp; Date</th>
                      <th style={{ minWidth: 150 }}>Contract Value</th>
                      <th style={{ minWidth: 160 }}>WO Document</th>
                      <th style={{ minWidth: 200 }}>Bank Guarantee (PBG)</th>
                      <th style={{ minWidth: 180 }}>Agreement (.docx)</th>
                      <th style={{ minWidth: 200 }}>Remarks</th>
                      <th style={{ minWidth: 120 }}>Status</th>
                    </>
                  ) : (
                    <>
                      <th style={{ minWidth: 140 }}>Contract Value</th>
                      <th style={{ minWidth: 160 }}>Negotiated Status</th>
                      <th style={{ minWidth: 150 }}>Department</th>
                      <th style={{ minWidth: 140 }}>Stage &amp; Status</th>
                      <th style={{ minWidth: 110 }}>Due Date</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => {
                  const wo = t.workOrder

                  return (
                    <tr key={t.id}>
                      {/* Action Column */}
                      <td className="action-col">
                        <div className="action-group">
                          {tab === 'pending' ? (
                            <button
                              className="table-action font-semibold"
                              title="Process Work Order, BG, & AI Agreement"
                              onClick={() => setModalState({ tender: t, mode: 'action' })}
                            >
                              Execute <ArrowRight />
                            </button>
                          ) : (
                            <>
                              <button
                                className="icon-action text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                                title="View work order details & audit history"
                                onClick={() => setModalState({ tender: t, mode: 'view' })}
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                className="icon-action text-amber-600 hover:text-amber-800 hover:bg-amber-50"
                                title="Edit work order details"
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
                          {/* 1. Work Order # & Date */}
                          <td>
                            <div className="text-xs">
                              <span className="font-bold text-slate-800 font-mono block truncate max-w-[160px]" title={wo?.workOrderNumber}>
                                {wo?.workOrderNumber || '—'}
                              </span>
                              <span className="text-[11px] text-slate-500">
                                Issued: {wo?.workOrderDate || '—'}
                              </span>
                            </div>
                          </td>

                          {/* 2. Contract Value */}
                          <td>
                            <div className="text-xs font-bold text-amber-800">
                              {wo?.contractValue || t.negotiation?.negotiatedPrice || t.value || '—'}
                            </div>
                          </td>

                          {/* 3. WO Document */}
                          <td>
                            {wo?.workOrderDoc ? (
                              <div className="flex items-center gap-1.5 text-xs">
                                <FileText className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                                {wo.workOrderDoc.dataUrl ? (
                                  <a
                                    href={wo.workOrderDoc.dataUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-amber-800 hover:text-amber-950 font-medium underline truncate max-w-[140px]"
                                    title={wo.workOrderDoc.name}
                                  >
                                    {wo.workOrderDoc.name}
                                  </a>
                                ) : (
                                  <span className="text-slate-700 truncate max-w-[140px]">
                                    {wo.workOrderDoc.name}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400 italic">None uploaded</span>
                            )}
                          </td>

                          {/* 4. Bank Guarantee (PBG) */}
                          <td>
                            <div className="text-xs">
                              <div className="flex items-center gap-1 font-semibold text-slate-800">
                                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                <span>{wo?.bgAmount || '—'}</span>
                              </div>
                              <span className="text-[11px] text-slate-500 block truncate max-w-[180px]" title={`${wo?.bgBankName} - ${wo?.bgNumber}`}>
                                {wo?.bgBankName} {wo?.bgNumber ? `(${wo.bgNumber})` : ''}
                              </span>
                            </div>
                          </td>

                          {/* 5. Agreement & Word Download */}
                          <td>
                            {wo?.generatedAgreement ? (
                              <button
                                type="button"
                                onClick={() => handleDownloadAgreement(t)}
                                className="px-2.5 py-1 text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg border border-blue-200 flex items-center gap-1.5 transition-all cursor-pointer"
                                title="Download Agreement Word Document (.docx)"
                              >
                                <FileDown className="w-3.5 h-3.5 text-blue-600" />
                                Export Word (.docx)
                              </button>
                            ) : (
                              <span className="text-xs text-slate-400 italic">Not drafted</span>
                            )}
                          </td>

                          {/* 6. Remarks */}
                          <td>
                            <ExpandableRemarkCell text={wo?.remarks} />
                          </td>

                          {/* 7. Status */}
                          <td>
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              Executed
                            </span>
                          </td>
                        </>
                      ) : (
                        <>
                          <td>
                            <div className="text-xs font-semibold text-slate-800">
                              {t.negotiation?.negotiatedPrice || t.financialOpenCheck?.ourBidPrice || t.value || '—'}
                            </div>
                          </td>

                          <td>
                            <span className="badge badge-blue text-[11px] font-semibold">
                              {t.negotiation?.status ? `Negotiated: ${t.negotiation.status}` : 'Pending WO'}
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

      {/* 4. WORK ORDER MODAL */}
      {modalState && (
        <WorkOrderModal
          tender={modalState.tender}
          mode={modalState.mode}
          onClose={() => setModalState(null)}
          onSave={handleSaveModal}
        />
      )}
    </section>
  )
}
