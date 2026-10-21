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
  Globe,
  Layers,
  Pencil,
  Search,
  UploadCloud,
  FolderArchive,
  CreditCard,
  Building,
} from 'lucide-react'
import { useTenders } from '@/context/TenderContext'
import { Status, Tender } from '@/types/tender'
import { PortalUploadModal } from '@/components/modals/PortalUploadModal'

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

export default function DocumentUploadInPortalPage() {
  const { tenders, updateTender, deleteTender, advanceStage, notify } = useTenders()
  const router = useRouter()
  const [tab, setTab] = useState<'pending' | 'completed'>('pending')
  const [query, setQuery] = useState('')

  // Portal Upload Modal state (used for Action, Edit, and View)
  const [portalModal, setPortalModal] = useState<{
    tender: Tender
    mode: 'action' | 'edit' | 'view'
  } | null>(null)

  // Pending: Tenders currently in Document Upload in portal stage that haven't been completed
  const pendingTenders = useMemo(() => {
    return tenders.filter(
      t => t.stage === 'Document Upload in portal' && !t.portalUpload?.completedAt
    )
  }, [tenders])

  // Completed / History: Tenders where portal upload is done or advanced to later stages
  const completedTenders = useMemo(() => {
    const postStages = [
      'Submit in website',
      'Technical Open Check',
      'Financial Open Check',
    ]
    return tenders.filter(
      t =>
        !!t.portalUpload?.completedAt ||
        postStages.includes(t.stage) ||
        (t.stage !== 'Document Upload in portal' && !!t.portalUpload)
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
        t.portalUpload?.portalName?.toLowerCase().includes(q) ||
        t.portalUpload?.ackNumber?.toLowerCase().includes(q)
    )
  }, [tab, pendingTenders, completedTenders, query])

  const handleSaveModal = (updated: Tender) => {
    updateTender(updated.id, updated)
    notify(`Portal upload details for "${updated.title}" updated and saved.`)
    setPortalModal(null)
  }

  const handleAdvanceModal = (updated: Tender) => {
    updateTender(updated.id, updated)
    advanceStage(
      updated.id,
      'Submit in website',
      'Ready',
      'Documents successfully uploaded and verified on portal.'
    )
    notify(
      `Tender "${updated.title}" documents uploaded to portal. Advanced to Stage 07 (Submit in website).`
    )
    setPortalModal(null)
    router.push('/submit-in-website')
  }

  return (
    <section className="page">
      {/* Page Heading */}
      <div className="page-heading">
        <div>
          <p className="eyebrow">WORKFLOW STAGE 06</p>
          <h1>Document Upload in portal</h1>
          <p>
            Upload compliance covers, technical bid files, DSC encryption, and pre-submission validation on the portal.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Link href="/document-ready" className="secondary-button text-xs">
            Previous: Document Ready
          </Link>
          <Link href="/submit-in-website" className="secondary-button text-xs">
            Next: Submit in website
          </Link>
          <div className="badge badge-blue py-2 px-3 text-xs font-semibold">
            {pendingTenders.length} Pending Upload
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
              placeholder="Search by tender title, ID, authority, portal name, acknowledgment no..."
            />
          </div>
        </div>

        {/* Table (Strictly contained horizontal scroll inside table-wrap) */}
        <div className="table-wrap">
          {filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon-box">
                <Globe />
              </div>
              <h3>
                {tab === 'completed'
                  ? 'No completed portal upload records yet'
                  : 'No tenders pending in Document Upload in portal'}
              </h3>
              <p>
                {tab === 'completed'
                  ? 'Tenders with uploaded portal documents and acknowledgment numbers will be archived here.'
                  : 'Tenders approved in Stage 05 (Document Ready) automatically advance here for portal document uploads.'}
              </p>
              {tab === 'pending' && (
                <Link href="/document-ready" className="primary-button">
                  Check Document Ready Stage
                </Link>
              )}
            </div>
          ) : (
            <table style={{ minWidth: tab === 'completed' ? '1450px' : '1100px' }}>
              <thead>
                <tr>
                  <th className="action-col">Action</th>
                  <th>Tender</th>
                  <th>Portal Name</th>
                  <th>Acknowledgment / Ref No</th>
                  <th>Uploaded Documents</th>
                  <th>Upload Date</th>
                  <th>Portal Remarks</th>
                  <th>Stage & Status</th>
                  <th>Due Date</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => {
                  const portal = t.portalUpload
                  const docsCount = portal?.documents?.length || 0

                  return (
                    <tr key={t.id}>
                      {/* 1. Action Column */}
                      <td className="action-col">
                        <div className="action-group">
                          {tab === 'pending' ? (
                            <button
                              className="table-action font-semibold"
                              title="Manually fill fields and upload documents to portal"
                              onClick={() => setPortalModal({ tender: t, mode: 'action' })}
                            >
                              Action <ArrowRight />
                            </button>
                          ) : (
                            <>
                              <button
                                className="table-action"
                                title="View portal submission details and documents"
                                onClick={() => setPortalModal({ tender: t, mode: 'view' })}
                              >
                                View Details
                              </button>

                              {/* Stage Specific Edit (Opens Document Upload in portal Edit modal directly!) - Only in Completed / History */}
                              <button
                                className="icon-action text-amber-600 hover:text-amber-800 hover:bg-amber-50"
                                title="Edit Document Upload in portal fields and documents"
                                onClick={() => setPortalModal({ tender: t, mode: 'edit' })}
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

                      {/* 3. Portal Name */}
                      <td>
                        <div className="min-w-[140px] max-w-[200px]">
                          <span className="font-semibold text-slate-800 text-xs block truncate" title={portal?.portalName}>
                            {portal?.portalName || 'Central e-Procurement (CPPP)'}
                          </span>
                          <small className="text-slate-400 block truncate text-[10px]">
                            {portal?.portalUrl || 'https://eprocure.gov.in'}
                          </small>
                        </div>
                      </td>

                      {/* 4. Acknowledgment / Ref No */}
                      <td>
                        {portal?.ackNumber ? (
                          <span className="font-mono font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded text-xs whitespace-nowrap">
                            {portal.ackNumber}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs italic">— Not Assigned —</span>
                        )}
                      </td>

                      {/* 5. Uploaded Documents */}
                      <td>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-900 text-xs px-2 py-1 rounded bg-blue-50 text-blue-800 border border-blue-200 whitespace-nowrap flex items-center gap-1">
                            <UploadCloud className="w-3 h-3 text-blue-600" />
                            {docsCount > 0 ? `${docsCount} Uploaded` : '0 Uploaded'}
                          </span>
                        </div>
                      </td>

                      {/* 6. Upload Date */}
                      <td>
                        <span className="text-xs text-slate-700 font-medium whitespace-nowrap">
                          {portal?.uploadDate || '—'}
                        </span>
                      </td>

                      {/* 7. Portal Remarks */}
                      <td>
                        <div className="min-w-[130px] max-w-[200px]">
                          {portal?.remarks ? (
                            <p className="text-xs text-slate-700 leading-relaxed truncate" title={portal.remarks}>
                              {portal.remarks}
                            </p>
                          ) : (
                            <span className="text-slate-400 text-xs italic">— None —</span>
                          )}
                        </div>
                      </td>

                      {/* 8. Stage & Status */}
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

                      {/* 9. Due Date */}
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

      {/* Document Upload in portal Modal (Action, Edit, or View mode) */}
      {portalModal && (
        <PortalUploadModal
          tender={portalModal.tender}
          mode={portalModal.mode}
          onClose={() => setPortalModal(null)}
          onSave={handleSaveModal}
          onAdvance={portalModal.mode === 'action' ? handleAdvanceModal : undefined}
        />
      )}
    </section>
  )
}
