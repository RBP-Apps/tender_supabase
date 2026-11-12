'use client'

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  FileCheck,
  FileText,
  Info,
  Loader2,
  Pencil,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react'
import { useTenders } from '@/context/TenderContext'
import { AIEligibilityVerification, Status, Tender } from '@/types/tender'
import { EligibilityCheckModal } from '@/components/modals/EligibilityCheckModal'
import { TenderModal } from '@/components/modals/TenderModal'
import { DocumentPreviewModal } from '@/components/common/DocumentPreviewModal'
import { TenderNumberBadge } from '@/components/ui/TenderNumberBadge'

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

function renderAiEligibilityCell(
  aiVerification?: AIEligibilityVerification,
  onViewReport?: () => void,
  onRunCheck?: () => void,
  isRunning?: boolean
) {
  if (!aiVerification) {
    return (
      <div className="flex flex-col gap-1 items-start min-w-[140px]">
        <span className="text-xs text-slate-400 italic">— Pending AI Check —</span>
        {onRunCheck && (
          <button
            type="button"
            disabled={isRunning}
            onClick={e => {
              e.stopPropagation()
              onRunCheck()
            }}
            className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold underline inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
          >
            {isRunning ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" /> Verifying...
              </>
            ) : (
              <>
                <Sparkles className="w-3 h-3 text-indigo-500" /> Verify with AI
              </>
            )}
          </button>
        )}
      </div>
    )
  }

  const isEligible = aiVerification.status === 'Eligible'
  const isPartially = aiVerification.status === 'Partially Eligible'

  return (
    <div className="flex flex-col gap-1.5 items-start min-w-[150px]">
      <div className="flex items-center gap-1.5">
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold shadow-2xs ${
            isEligible
              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
              : isPartially
              ? 'bg-amber-100 text-amber-800 border border-amber-300'
              : 'bg-rose-100 text-rose-800 border border-rose-300'
          }`}
        >
          {isEligible ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          ) : isPartially ? (
            <Clock3 className="w-3.5 h-3.5 text-amber-600" />
          ) : (
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
          )}
          {aiVerification.status}
        </span>
        {aiVerification.score !== undefined && (
          <span className="text-[10px] font-semibold text-slate-500">
            {aiVerification.score}%
          </span>
        )}
      </div>

      <p className="text-[11px] text-slate-600 line-clamp-1 max-w-[190px]" title={aiVerification.summary}>
        {aiVerification.summary}
      </p>

      {onViewReport && (
        <button
          type="button"
          onClick={e => {
            e.stopPropagation()
            onViewReport()
          }}
          className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold underline inline-flex items-center gap-1 cursor-pointer"
        >
          <Sparkles className="w-3 h-3 text-indigo-500" /> View Detailed Reasoning
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

  // AI Report Modal state
  const [reportTender, setReportTender] = useState<Tender | null>(null)
  const [runningAiTenderId, setRunningAiTenderId] = useState<string | null>(null)

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

  const handleRunAiFromHistory = async (tenderToVerify: Tender) => {
    setRunningAiTenderId(tenderToVerify.id)
    try {
      const res = await fetch('/api/ai-verify-eligibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tender: tenderToVerify,
          pdfDataUrl: tenderToVerify.tenderDoc?.dataUrl,
          submittedData: {
            turnoverDoc: tenderToVerify.eligibilityCheck?.turnoverDoc,
            experienceDoc: tenderToVerify.eligibilityCheck?.experienceDoc,
            vendorRegDoc: tenderToVerify.eligibilityCheck?.vendorRegDoc,
            otherDoc: tenderToVerify.eligibilityCheck?.otherDoc,
            remarks: tenderToVerify.eligibilityCheck?.remarks || '',
          },
        }),
      })
      const data = await res.json()
      if (data.success && data.verification) {
        const updatedTender: Tender = {
          ...tenderToVerify,
          eligibilityCheck: {
            ...tenderToVerify.eligibilityCheck,
            aiVerification: data.verification,
          },
        }
        updateTender(updatedTender.id, updatedTender)
        notify(`AI Verification completed: "${data.verification.status}" for tender ${tenderToVerify.id}`)
      } else {
        throw new Error(data?.error || 'Verification failed')
      }
    } catch (e: any) {
      notify(`Verification failed: ${e?.message || 'Error'}`)
    } finally {
      setRunningAiTenderId(null)
    }
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
            <table style={{ minWidth: tab === 'completed' ? '1620px' : '960px' }}>
              <thead>
                <tr>
                  <th className="action-col">Action</th>
                  <th>Tender</th>
                  {tab === 'completed' ? (
                    <>
                      <th style={{ minWidth: 200 }}>1. Turnover Document</th>
                      <th style={{ minWidth: 200 }}>2. Experience Document</th>
                      <th style={{ minWidth: 190 }}>3. Other Documents</th>
                      <th style={{ minWidth: 210 }}>4. Remarks & Notes</th>
                      <th style={{ minWidth: 190 }}>5. AI Eligibility Result</th>
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
                        <div className="mb-1 flex items-center gap-1.5 flex-wrap">
                          <TenderNumberBadge id={t.id} />
                          {t.value && (
                            <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/80">
                              {t.value}
                            </span>
                          )}
                        </div>
                        <strong className="block text-slate-900 truncate text-xs" title={t.title}>
                          {t.title}
                        </strong>
                        <small className="text-slate-500 text-[11px] block mt-0.5">
                          {t.authority}
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

                        {/* 5. AI Eligibility Result */}
                        <td>
                          {renderAiEligibilityCell(
                            t.eligibilityCheck?.aiVerification,
                            () => setReportTender(t),
                            () => handleRunAiFromHistory(t),
                            runningAiTenderId === t.id
                          )}
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

      {/* AI Eligibility Audit Report Modal */}
      {reportTender && reportTender.eligibilityCheck?.aiVerification && (
        <div className="modal-backdrop">
          <div className="modal modal-wide" style={{ maxWidth: '640px' }}>
            <div className="modal-head border-b border-slate-100 pb-3">
              <div>
                <p className="eyebrow flex items-center gap-1.5 text-indigo-600 font-bold">
                  <Sparkles className="w-3.5 h-3.5" /> AI ELIGIBILITY AUDIT REPORT
                </p>
                <h2 className="text-base font-bold text-slate-900 mt-0.5">
                  {reportTender.title}
                </h2>
                <div className="flex items-center gap-2 mt-1">
                  <TenderNumberBadge id={reportTender.id} />
                  <span className="text-xs text-slate-500">· {reportTender.authority}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReportTender(null)}
                title="Close"
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[calc(85vh-120px)] overflow-y-auto text-xs">
              {/* Status Banner */}
              {(() => {
                const ai = reportTender.eligibilityCheck!.aiVerification!
                const isEligible = ai.status === 'Eligible'
                const isPartially = ai.status === 'Partially Eligible'
                return (
                  <div
                    className={`p-4 rounded-xl border flex items-start gap-3 shadow-xs ${
                      isEligible
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                        : isPartially
                        ? 'bg-amber-50 border-amber-300 text-amber-950'
                        : 'bg-rose-50 border-rose-300 text-rose-950'
                    }`}
                  >
                    <div
                      className={`p-2 rounded-full text-white mt-0.5 ${
                        isEligible ? 'bg-emerald-600' : isPartially ? 'bg-amber-600' : 'bg-rose-600'
                      }`}
                    >
                      {isEligible ? (
                        <CheckCircle2 className="w-5 h-5" />
                      ) : isPartially ? (
                        <Clock3 className="w-5 h-5" />
                      ) : (
                        <AlertTriangle className="w-5 h-5" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm font-bold uppercase tracking-wide">
                          AI Verification Verdict: {ai.status}
                        </h3>
                        <span className="px-2 py-0.5 rounded-full bg-white/90 font-bold border border-slate-200 text-xs shadow-2xs">
                          Compliance Score: {ai.score}%
                        </span>
                      </div>
                      <p className="mt-1 leading-relaxed opacity-95 text-xs font-medium">
                        {ai.summary}
                      </p>
                      <div className="mt-2 text-[10px] opacity-70">
                        Verified On: {new Date(ai.verifiedAt).toLocaleString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                  </div>
                )
              })()}

              {/* 1. Overall Reasoning Narrative */}
              {reportTender.eligibilityCheck?.aiVerification?.overallReasoning && (
                <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1 shadow-2xs">
                  <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                    Overall Eligibility Reasoning:
                  </h4>
                  <p className="text-slate-700 leading-relaxed text-[11px]">
                    {reportTender.eligibilityCheck.aiVerification.overallReasoning}
                  </p>
                </div>
              )}

              {/* 2. Matched Criteria (Why Eligible) */}
              {reportTender.eligibilityCheck?.aiVerification?.matchedCriteria &&
                reportTender.eligibilityCheck.aiVerification.matchedCriteria.length > 0 && (
                  <div className="p-3.5 rounded-lg bg-emerald-50/70 border border-emerald-200 text-xs space-y-1.5 shadow-2xs">
                    <h4 className="font-bold text-emerald-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      Matched Criteria (Why Eligible):
                    </h4>
                    <ul className="space-y-1 pl-4 list-disc text-emerald-800 text-[11px]">
                      {reportTender.eligibilityCheck.aiVerification.matchedCriteria.map((m, idx) => (
                        <li key={idx} className="leading-snug">
                          {m}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

              {/* 3. Failed Criteria & Rejection Reasons (Why Not Eligible) */}
              {reportTender.eligibilityCheck?.aiVerification?.failedCriteria &&
                reportTender.eligibilityCheck.aiVerification.failedCriteria.length > 0 && (
                  <div className="p-3.5 rounded-lg bg-rose-50/80 border border-rose-200 text-xs space-y-1.5 shadow-2xs">
                    <h4 className="font-bold text-rose-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                      Failed Criteria & Rejection Reasons (Why Not Eligible):
                    </h4>
                    <ul className="space-y-1 pl-4 list-disc text-rose-800 text-[11px]">
                      {reportTender.eligibilityCheck.aiVerification.failedCriteria.map((f, idx) => (
                        <li key={idx} className="leading-snug font-medium">
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

              {/* 4. Missing Documents & Incomplete Requirements (Why Partially Eligible) */}
              {reportTender.eligibilityCheck?.aiVerification?.missingRequirements &&
                reportTender.eligibilityCheck.aiVerification.missingRequirements.length > 0 && (
                  <div className="p-3.5 rounded-lg bg-amber-50/80 border border-amber-200 text-xs space-y-1.5 shadow-2xs">
                    <h4 className="font-bold text-amber-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                      <Clock3 className="w-3.5 h-3.5 text-amber-600" />
                      Missing Documents & Incomplete Requirements:
                    </h4>
                    <ul className="space-y-1 pl-4 list-disc text-amber-800 text-[11px]">
                      {reportTender.eligibilityCheck.aiVerification.missingRequirements.map((mis, idx) => (
                        <li key={idx} className="leading-snug">
                          {mis}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

              {/* 5. Side-by-Side Comparison: Tender Requirement vs User Submitted Details */}
              <div className="space-y-2">
                <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <FileCheck className="w-3.5 h-3.5 text-indigo-600" />
                  Tender Requirement vs User Submitted Details Comparison
                </h4>

                {reportTender.eligibilityCheck?.aiVerification?.criteriaBreakdown &&
                reportTender.eligibilityCheck.aiVerification.criteriaBreakdown.length > 0 ? (
                  <div className="border border-slate-200 rounded-lg overflow-hidden bg-white text-xs shadow-2xs">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-[11px]">
                        <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold">
                          <tr>
                            <th className="p-2.5 min-w-[130px]">Criteria</th>
                            <th className="p-2.5 min-w-[160px]">Tender Requirement</th>
                            <th className="p-2.5 min-w-[160px]">User Submitted Details</th>
                            <th className="p-2.5 min-w-[80px]">Status</th>
                            <th className="p-2.5 min-w-[180px]">Comparison / Rejection Reason</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {reportTender.eligibilityCheck.aiVerification.criteriaBreakdown.map((row, rIdx) => (
                            <tr key={rIdx} className="hover:bg-slate-50/60">
                              <td className="p-2.5 font-bold text-slate-800">
                                {row.criteriaName}
                                {row.isMandatory && (
                                  <span className="ml-1 text-[9px] px-1 py-0.2 rounded bg-slate-100 text-slate-600 font-normal">
                                    Mandatory
                                  </span>
                                )}
                              </td>
                              <td className="p-2.5 text-slate-600 leading-tight">
                                {row.tenderRequirement}
                              </td>
                              <td className="p-2.5 text-slate-800 font-medium leading-tight">
                                {row.userSubmitted}
                              </td>
                              <td className="p-2.5">
                                <span
                                  className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${
                                    row.status === 'Pass'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : row.status === 'Fail'
                                      ? 'bg-rose-100 text-rose-800'
                                      : 'bg-amber-100 text-amber-800'
                                  }`}
                                >
                                  {row.status}
                                </span>
                              </td>
                              <td className="p-2.5 text-slate-700 leading-tight">
                                {row.rejectionReason ? (
                                  <span className="text-rose-700 font-medium">
                                    {row.rejectionReason}
                                  </span>
                                ) : (
                                  <span>{row.comparisonResult}</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  /* Fallback to 3 check cards if breakdown array is not present */
                  (() => {
                    const ai = reportTender.eligibilityCheck!.aiVerification!
                    return (
                      <div className="space-y-2">
                        {/* 1. Turnover */}
                        <div className="p-3 rounded-lg border border-slate-200 bg-white space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900">1. Annual Financial Turnover</span>
                            <span
                              className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                                ai.turnoverCheck.status === 'Pass'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {ai.turnoverCheck.status}
                            </span>
                          </div>
                          <p className="text-slate-500 text-[11px]">
                            <strong>Required by Tender:</strong> {ai.turnoverCheck.required}
                          </p>
                          <p className="text-slate-500 text-[11px]">
                            <strong>Submitted by Bidder:</strong> {ai.turnoverCheck.submitted}
                          </p>
                          <p className="text-slate-700 bg-slate-50 p-2 rounded border border-slate-100 mt-1">
                            {ai.turnoverCheck.notes}
                          </p>
                        </div>

                        {/* 2. Experience */}
                        <div className="p-3 rounded-lg border border-slate-200 bg-white space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900">2. Past Technical Experience</span>
                            <span
                              className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                                ai.experienceCheck.status === 'Pass'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {ai.experienceCheck.status}
                            </span>
                          </div>
                          <p className="text-slate-500 text-[11px]">
                            <strong>Required by Tender:</strong> {ai.experienceCheck.required}
                          </p>
                          <p className="text-slate-500 text-[11px]">
                            <strong>Submitted by Bidder:</strong> {ai.experienceCheck.submitted}
                          </p>
                          <p className="text-slate-700 bg-slate-50 p-2 rounded border border-slate-100 mt-1">
                            {ai.experienceCheck.notes}
                          </p>
                        </div>

                        {/* 3. Statutory */}
                        <div className="p-3 rounded-lg border border-slate-200 bg-white space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900">3. Statutory & Registration Documents</span>
                            <span
                              className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                                ai.documentsCheck.status === 'Pass'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {ai.documentsCheck.status}
                            </span>
                          </div>
                          <p className="text-slate-700 bg-slate-50 p-2 rounded border border-slate-100 mt-1">
                            {ai.documentsCheck.notes}
                          </p>
                        </div>
                      </div>
                    )
                  })()
                )}
              </div>

              {/* 6. Concluding Takeaway */}
              {reportTender.eligibilityCheck?.aiVerification?.conclusion && (
                <div className="p-3.5 rounded-lg bg-indigo-50/80 border border-indigo-200 text-indigo-950 text-xs font-medium">
                  <strong>Final Conclusion:</strong> {reportTender.eligibilityCheck.aiVerification.conclusion}
                </div>
              )}

              {/* 7. Insufficient Information Notice */}
              {reportTender.eligibilityCheck?.aiVerification?.insufficientInfoNotes && (
                <div className="p-2.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-600 text-[11px] italic flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                  <span>{reportTender.eligibilityCheck.aiVerification.insufficientInfoNotes}</span>
                </div>
              )}

              {/* Modal Close Button */}
              <div className="flex justify-end pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setReportTender(null)}
                  className="secondary-button text-xs py-2 px-4"
                >
                  Close Report
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
