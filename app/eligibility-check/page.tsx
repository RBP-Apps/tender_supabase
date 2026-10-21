'use client'

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  FileCheck,
  FileText,
  Pencil,
  Search,
} from 'lucide-react'
import { useTenders } from '@/context/TenderContext'
import { Status, Tender } from '@/types/tender'
import { EligibilityCheckModal } from '@/components/modals/EligibilityCheckModal'
import { TenderModal } from '@/components/modals/TenderModal'
import { DocumentPreviewModal } from '@/components/common/DocumentPreviewModal'

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

function formatBytes(bytes?: number) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getFileBadge(name?: string, type?: string) {
  const n = (name || '').toLowerCase()
  if (n.endsWith('.pdf') || type?.includes('pdf')) {
    return <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-bold text-[10px]">PDF</span>
  }
  if (n.endsWith('.doc') || n.endsWith('.docx') || type?.includes('word')) {
    return <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-bold text-[10px]">DOC</span>
  }
  if (n.match(/\.(jpg|jpeg|png|webp|bmp|gif)$/) || type?.includes('image')) {
    return <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-bold text-[10px]">IMG</span>
  }
  return <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-bold text-[10px]">FILE</span>
}

function renderDocCell(
  rawDoc?: any,
  criteria?: string | null,
  onPreview?: (doc: { name: string; size?: number; type?: string; dataUrl?: string }) => void
) {
  let doc: { name: string; size?: number; type?: string; dataUrl?: string } | null = null

  if (rawDoc) {
    if (typeof rawDoc === 'object' && rawDoc.name) {
      doc = rawDoc
    } else if (typeof rawDoc === 'string') {
      if (rawDoc.startsWith('{')) {
        try {
          doc = JSON.parse(rawDoc)
        } catch {
          doc = { name: 'document', dataUrl: rawDoc }
        }
      } else {
        doc = { name: rawDoc.split('/').pop()?.split('?')[0] || 'document', dataUrl: rawDoc }
      }
    }
  }

  if (!doc) {
    return (
      <div className="flex flex-col gap-1 min-w-[140px] max-w-[220px]">
        <span className="text-slate-400 text-xs italic">— Not Attached —</span>
        {criteria && (
          <div
            className="text-[10px] bg-slate-50 text-slate-600 px-2 py-0.5 rounded border border-slate-200 truncate"
            title={criteria}
          >
            <span className="font-semibold text-slate-700">Req:</span> {criteria}
          </div>
        )}
      </div>
    )
  }

  const handlePreview = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (doc && doc.dataUrl && onPreview) {
      onPreview(doc)
    }
  }

  return (
    <div className="flex flex-col gap-1 min-w-[140px] max-w-[220px]">
      <div className="p-2 bg-slate-50/80 border border-slate-200 rounded-lg text-xs">
        <div className="flex items-center gap-1.5 min-w-0">
          {getFileBadge(doc.name, doc.type)}
          <span
            className={`font-semibold text-xs truncate ${doc.dataUrl ? 'text-slate-800 hover:text-blue-700 cursor-pointer' : 'text-slate-800'}`}
            title={doc.name}
            onClick={handlePreview}
          >
            {doc.name}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 mt-1.5 text-[10px] text-slate-500">
          <span>{doc.size ? formatBytes(doc.size) : 'File'}</span>
          {doc.dataUrl ? (
            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={handlePreview}
                className="text-blue-600 hover:text-blue-800 font-bold underline inline-flex items-center gap-0.5 cursor-pointer"
                title="View / Inspect Document"
              >
                <Eye className="w-3 h-3" /> View
              </button>
              <a
                href={doc.dataUrl}
                download={doc.name}
                className="text-slate-600 hover:text-slate-900 font-medium underline inline-flex items-center gap-0.5"
                target="_blank"
                rel="noreferrer"
                onClick={e => e.stopPropagation()}
                title="Download Document"
              >
                <Download className="w-3 h-3" /> Download
              </a>
            </div>
          ) : null}
        </div>
      </div>
      {criteria && (
        <div
          className="text-[10px] bg-teal-50 text-teal-800 px-2 py-0.5 rounded border border-teal-200 truncate"
          title={criteria}
        >
          <span className="font-semibold text-teal-900">Req:</span> {criteria}
        </div>
      )}
    </div>
  )
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
      <p className={`text-slate-700 leading-relaxed ${expanded ? 'whitespace-pre-wrap break-words' : 'line-clamp-2'}`} title={clean}>
        {clean}
      </p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-[10px] text-blue-600 hover:text-blue-800 font-semibold underline mt-0.5"
        >
          {expanded ? 'Show Less' : 'Show Full'}
        </button>
      )}
    </div>
  )
}

export default function EligibilityCheckPage() {
  const { tenders, masters, updateTender, deleteTender, notify } = useTenders()
  const router = useRouter()
  const [tab, setTab] = useState<'pending' | 'completed'>('pending')
  const [query, setQuery] = useState('')

  // Eligibility Verification Modal state
  const [verifyModal, setVerifyModal] = useState<{
    tender: Tender
    mode: 'verify' | 'view'
  } | null>(null)

  // Tender Edit Modal state
  const [editModalTender, setEditModalTender] = useState<Tender | null>(null)

  // Document Preview Modal state
  const [previewDoc, setPreviewDoc] = useState<{
    name: string
    dataUrl?: string
    type?: string
    size?: number
  } | null>(null)

  // Pending: Tenders from Tender Details that are in Eligibility Check and haven't completed verification
  const pendingTenders = useMemo(() => {
    return tenders.filter(
      t => t.stage === 'Eligibility Check' && !t.eligibilityCheck?.completedAt
    )
  }, [tenders])

  // Completed / History: Tenders that have completed eligibility check verification
  const completedTenders = useMemo(() => {
    return tenders.filter(
      t => !!t.eligibilityCheck?.completedAt || (t.stage !== 'Eligibility Check' && !!t.eligibilityCheck)
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
        t.department.toLowerCase().includes(q)
    )
  }, [tab, pendingTenders, completedTenders, query])

  const handleCompleteVerification = (updatedTender: Tender) => {
    updateTender(updatedTender.id, updatedTender)
    setVerifyModal(null)
    notify(
      `Eligibility check updated for "${updatedTender.title}". All documents and remarks saved.`
    )
  }

  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">WORKFLOW STAGE 01</p>
          <h1>Eligibility Check</h1>
          <p>
            Verify turnover, experience certificates, and qualification documents.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/tender-details" className="secondary-button text-xs">
            View Tender Details
          </Link>
          <div className="badge badge-blue py-2 px-3 text-xs font-semibold">
            {pendingTenders.length} Pending Verification
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
              placeholder="Search by tender title, ID, authority..."
            />
          </div>
        </div>

        {/* Table */}
        <div className="table-wrap">
          {filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon-box">
                <FileCheck />
              </div>
              <h3>{tab === 'completed' ? 'No completed records yet' : 'No pending tenders in Eligibility Check'}</h3>
              <p>
                {tab === 'completed'
                  ? 'Tenders verified with Turnover, Experience, and Supporting documents will be archived here.'
                  : 'New tenders created in Tender Details automatically appear here for eligibility verification.'}
              </p>
              {tab === 'pending' && completedTenders.length > 0 ? (
                <div className="mt-4 flex flex-col sm:flex-row items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => setTab('completed')}
                    className="secondary-button text-xs font-semibold"
                  >
                    View Completed / History ({completedTenders.length})
                  </button>
                  <Link href="/sample-details" className="primary-button text-xs font-semibold">
                    Go to Stage 02: Sample Details
                  </Link>
                </div>
              ) : tab === 'pending' ? (
                <Link href="/tender-details" className="primary-button mt-2">
                  Go to Tender Details
                </Link>
              ) : null}
            </div>
          ) : (
            <table style={{ minWidth: tab === 'completed' ? '1420px' : '960px' }}>
              <thead>
                <tr>
                  <th className="action-col">Action</th>
                  <th>Tender</th>
                  {tab === 'completed' ? (
                    <>
                      <th style={{ minWidth: 200 }}>1. Turnover Document</th>
                      <th style={{ minWidth: 200 }}>2. Experience Document</th>
                      <th style={{ minWidth: 190 }}>3. Other Documents</th>
                      <th style={{ minWidth: 220 }}>4. Remarks & Notes</th>
                      <th style={{ minWidth: 140 }}>Verified On</th>
                      <th style={{ minWidth: 140 }}>Stage & Status</th>
                    </>
                  ) : (
                    <>
                      <th>Department</th>
                      <th>State</th>
                      <th>Turnover Requirement</th>
                      <th>Experience Requirement</th>
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
                            title="Verify eligibility documents (Turnover, Experience, Other Docs, Remarks)"
                            onClick={() => setVerifyModal({ tender: t, mode: 'verify' })}
                          >
                            Action <ArrowRight />
                          </button>
                        ) : (
                          <>
                            <button
                              className="table-action"
                              title="View submitted eligibility verification documents"
                              onClick={() => setVerifyModal({ tender: t, mode: 'view' })}
                            >
                              View Docs
                            </button>

                            {/* Stage Specific Edit - Only in Completed / History */}
                            <button
                              className="icon-action text-amber-600 hover:text-amber-800"
                              title="Edit Eligibility Check documents (Turnover, Experience, Other Docs, Remarks)"
                              onClick={() => setVerifyModal({ tender: t, mode: 'verify' })}
                            >
                              <Pencil />
                            </button>
                          </>
                        )}

                        {/* Bid documents */}
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

                    {/* Columns depending on Pending vs History */}
                    {tab === 'completed' ? (
                      <>
                        <td>
                          {renderDocCell(
                            t.eligibilityCheck?.turnoverDoc,
                            t.bid?.turnoverRequirement || t.turnoverRequirement || (t.bid?.financialRequirementCr ? `₹ ${t.bid.financialRequirementCr} Cr` : null),
                            setPreviewDoc
                          )}
                        </td>
                        <td>
                          {renderDocCell(
                            t.eligibilityCheck?.experienceDoc,
                            t.bid?.experienceRequirement || t.experienceRequirement,
                            setPreviewDoc
                          )}
                        </td>
                        <td>
                          {renderDocCell(
                            t.eligibilityCheck?.otherDoc || t.eligibilityCheck?.vendorRegDoc,
                            null,
                            setPreviewDoc
                          )}
                        </td>

                        <td>
                          <ExpandableRemarkCell text={t.eligibilityCheck?.remarks} />
                        </td>

                        <td>
                          <span className="text-xs text-slate-600 font-medium whitespace-nowrap">
                            {t.eligibilityCheck?.completedAt
                              ? new Date(t.eligibilityCheck.completedAt).toLocaleString('en-IN', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : 'Verified'}
                          </span>
                        </td>

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
                          <span className="text-xs text-slate-700 block truncate max-w-[180px]" title={t.bid?.turnoverRequirement || t.turnoverRequirement || '—'}>
                            {t.bid?.turnoverRequirement || t.turnoverRequirement || (t.bid?.financialRequirementCr ? `₹ ${t.bid.financialRequirementCr} Cr` : '—')}
                          </span>
                        </td>
                        <td>
                          <span className="text-xs text-slate-700 block truncate max-w-[180px]" title={t.bid?.experienceRequirement || t.experienceRequirement || '—'}>
                            {t.bid?.experienceRequirement || t.experienceRequirement || '—'}
                          </span>
                        </td>
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

      {/* Verification Modal */}
      {verifyModal && (
        <EligibilityCheckModal
          tender={verifyModal.tender}
          mode={verifyModal.mode}
          onClose={() => setVerifyModal(null)}
          onComplete={handleCompleteVerification}
        />
      )}

      {/* Edit Tender Modal */}
      {editModalTender && (
        <TenderModal
          mode="edit"
          tender={editModalTender}
          masters={masters}
          onClose={() => setEditModalTender(null)}
          onSave={saved => {
            updateTender(saved.id, saved)
            setEditModalTender(null)
          }}
        />
      )}

      {/* High-Resolution Document Inspection Modal */}
      {previewDoc && (
        <DocumentPreviewModal
          document={previewDoc}
          onClose={() => setPreviewDoc(null)}
        />
      )}
    </section>
  )
}
