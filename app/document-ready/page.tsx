'use client'

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FileText,
  Files,
  FolderArchive,
  Layers,
  Pencil,
  Search,
  Wallet,
  ShieldCheck,
  CreditCard,
  Building,
  Image as ImageIcon,
  FileSpreadsheet,
  UploadCloud,
} from 'lucide-react'
import { useTenders } from '@/context/TenderContext'
import { Status, Tender } from '@/types/tender'
import { MasterDocumentDossierModal } from '@/components/modals/MasterDocumentDossierModal'
import { AllDocumentsSummaryModal } from '@/components/modals/AllDocumentsSummaryModal'
import { collectAllTenderDocuments } from '@/lib/document-ready-collector'

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

export default function DocumentReadyPage() {
  const { tenders, updateTender, advanceStage, notify } = useTenders()
  const router = useRouter()
  const [tab, setTab] = useState<'pending' | 'completed'>('pending')
  const [query, setQuery] = useState('')

  // Modal state matching Document Upload in portal (Action, Edit, or View mode)
  const [modal, setModal] = useState<{
    tender: Tender
    mode: 'action' | 'edit' | 'view'
  } | null>(null)

  // Direct modal trigger for All Documents Summary (.docx)
  const [allDocsModalTender, setAllDocsModalTender] = useState<Tender | null>(null)

  // Pending: Tenders currently in Document Ready stage that haven't been completed/advanced
  const pendingTenders = useMemo(() => {
    return tenders.filter(
      t => t.stage === 'Document Ready' && !t.documentReady?.completedAt
    )
  }, [tenders])

  // Completed / History: Tenders where Document Ready is completed or advanced to later stages
  const completedTenders = useMemo(() => {
    const postStages = [
      'Document Upload in portal',
      'Submit in website',
      'Technical Open Check',
      'Financial Open Check',
      'AOC / Negotiation',
      'Work Order',
    ]
    return tenders.filter(
      t =>
        !!t.documentReady?.completedAt ||
        postStages.includes(t.stage) ||
        (t.stage !== 'Document Ready' && !!t.documentReady)
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
        t.emdReady?.utrNumber?.toLowerCase().includes(q) ||
        t.stage.toLowerCase().includes(q)
    )
  }, [tab, pendingTenders, completedTenders, query])

  const handleSaveModal = (updated: Tender) => {
    updateTender(updated.id, updated)
    notify(`Document Ready dossier for "${updated.title}" updated and saved.`)
    setModal(null)
  }

  const handleAdvanceModal = (updated: Tender) => {
    updateTender(updated.id, updated)
    advanceStage(
      updated.id,
      'Document Upload in portal',
      'Ready',
      'All 21 statutory checklist documents verified and compiled into Master Dossier.'
    )
    notify(
      `Tender "${updated.title}" dossier approved. Advanced to Stage 06 (Document Upload in portal).`
    )
    setModal(null)
    router.push('/document-upload-in-portal')
  }

  return (
    <section className="page">
      {/* Page Heading */}
      <div className="page-heading">
        <div>
          <p className="eyebrow">WORKFLOW STAGE 05</p>
          <h1>Document Ready</h1>
          <p>
            Consolidated Master Document Dossier matching the official tender checklist requirements.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Link href="/emd-ready" className="secondary-button text-xs">
            Previous: EMD Ready
          </Link>
          <Link href="/document-upload-in-portal" className="secondary-button text-xs">
            Next: Document Upload in portal
          </Link>
          <div className="badge badge-blue py-2 px-3 text-xs font-semibold">
            {pendingTenders.length} Pending Review
          </div>
        </div>
      </div>

      {/* Main List Card */}
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
              placeholder="Search by tender title, ID, authority, department, UTR number..."
            />
          </div>
        </div>

        {/* Table (Strictly contained horizontal scroll inside table-wrap) */}
        <div className="table-wrap">
          {filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon-box">
                <FileCheck2 />
              </div>
              <h3>
                {tab === 'completed'
                  ? 'No completed Document Ready dossiers yet'
                  : 'No tenders pending in Document Ready stage'}
              </h3>
              <p>
                {tab === 'completed'
                  ? 'Tenders with approved dossiers will be archived here.'
                  : 'Tenders completed in Stage 04 (EMD Ready) automatically appear here for final document verification.'}
              </p>
              {tab === 'pending' && (
                <Link href="/emd-ready" className="primary-button">
                  Check EMD Ready Stage
                </Link>
              )}
            </div>
          ) : (
            <table style={{ minWidth: tab === 'completed' ? '1450px' : '1150px' }}>
              <thead>
                <tr>
                  <th className="action-col">Action</th>
                  <th>Tender</th>
                  <th>Checklist Points</th>
                  <th>Verified Documents</th>
                  <th>EMD Payment Proof</th>
                  <th>Dossier Remarks</th>
                  <th>Stage & Status</th>
                  <th>Due Date</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => {
                  const checklist =
                    t.documentReady?.checklist || t.portalUpload?.checklist || []
                  const totalChecklist = checklist.length || 21
                  const readyCount = checklist.filter(c => c.checked).length || 21
                  const docsCount =
                    t.documentReady?.checklistDocs?.length ||
                    t.portalUpload?.documents?.length ||
                    totalChecklist

                  const emd = t.emdReady

                  return (
                    <tr key={t.id}>
                      {/* 1. Action Column */}
                      <td className="action-col">
                        <div className="action-group">
                          {tab === 'pending' ? (
                            <>
                              <button
                                className="table-action font-semibold"
                                title="Review checklist points and compile master document dossier"
                                onClick={() => setModal({ tender: t, mode: 'action' })}
                              >
                                Action <ArrowRight />
                              </button>
                              <button
                                className="table-action font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200"
                                title="All Documents Summary (Combined Word file with Master Signature & Seal)"
                                onClick={() => setAllDocsModalTender(t)}
                              >
                                <FileText className="w-3.5 h-3.5 text-blue-600" />
                                <span>Summary (.docx)</span>
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                className="table-action"
                                title="View document dossier and verified checklist"
                                onClick={() => setModal({ tender: t, mode: 'view' })}
                              >
                                View Details
                              </button>

                              <button
                                className="table-action font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200"
                                title="All Documents Summary (Combined Word file with Master Signature & Seal)"
                                onClick={() => setAllDocsModalTender(t)}
                              >
                                <FileText className="w-3.5 h-3.5 text-blue-600" />
                                <span>Summary (.docx)</span>
                              </button>

                              <button
                                className="icon-action text-amber-600 hover:text-amber-800 hover:bg-amber-50"
                                title="Edit Document Ready dossier and files"
                                onClick={() => setModal({ tender: t, mode: 'edit' })}
                              >
                                <Pencil />
                              </button>
                            </>
                          )}
                        </div>
                      </td>

                      {/* 2. Tender Details */}
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

                      {/* 3. Checklist Points */}
                      <td>
                        <div className="min-w-[150px] max-w-[210px]">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="font-bold text-slate-900 text-xs">
                              {totalChecklist} Checklist Points
                            </span>
                            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                              {readyCount} Ready
                            </span>
                          </div>
                          <small className="text-slate-400 block truncate text-[10px]">
                            NIT Page 5 · Statutory Checklist
                          </small>
                        </div>
                      </td>

                      {/* 4. Verified Documents */}
                      <td>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-900 text-xs px-2.5 py-1 rounded bg-blue-50 text-blue-800 border border-blue-200 whitespace-nowrap flex items-center gap-1.5">
                            <FileCheck2 className="w-3.5 h-3.5 text-blue-600" />
                            {docsCount} Attached
                          </span>
                        </div>
                      </td>

                      {/* 5. EMD Payment Proof */}
                      <td>
                        <div className="min-w-[140px] max-w-[200px]">
                          {emd?.utrNumber ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="font-mono font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded text-xs whitespace-nowrap w-fit">
                                UTR: {emd.utrNumber}
                              </span>
                              <small className="text-slate-500 text-[11px] font-medium">
                                {emd.amount ? `₹${emd.amount}` : 'EMD Verified'} · {emd.date || 'Paid'}
                              </small>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-xs italic">— EMD Pending —</span>
                          )}
                        </div>
                      </td>

                      {/* 6. Dossier Remarks */}
                      <td>
                        <div className="min-w-[130px] max-w-[200px]">
                          {t.documentReady?.remarks || t.remarks ? (
                            <p
                              className="text-xs text-slate-700 leading-relaxed truncate"
                              title={t.documentReady?.remarks || t.remarks}
                            >
                              {t.documentReady?.remarks || t.remarks}
                            </p>
                          ) : (
                            <span className="text-slate-400 text-xs italic">— None —</span>
                          )}
                        </div>
                      </td>

                      {/* 7. Stage & Status */}
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

                      {/* 8. Due Date */}
                      <td>
                        <span className="text-xs font-medium text-slate-700 whitespace-nowrap">
                          {dueLabel(t.due)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Document Ready Modal (Action, Edit, or View mode matching Portal Upload Modal) */}
      {modal && (
        <MasterDocumentDossierModal
          tender={modal.tender}
          mode={modal.mode}
          onClose={() => setModal(null)}
          onSave={handleSaveModal}
          onAdvance={modal.mode === 'action' ? handleAdvanceModal : undefined}
        />
      )}

      {/* All Documents Summary Modal (Word .docx View, Edit, Update, Delete & Master Signature/Seal) */}
      {allDocsModalTender && (
        <AllDocumentsSummaryModal
          tender={allDocsModalTender}
          onClose={() => setAllDocsModalTender(null)}
          onSave={updated => {
            updateTender(updated.id, updated)
            notify(`All Documents Summary for "${updated.title}" updated and saved.`)
            setAllDocsModalTender(null)
          }}
        />
      )}
    </section>
  )
}
