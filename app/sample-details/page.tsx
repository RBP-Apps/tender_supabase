'use client'

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Clock3,
  Download,
  Eye,
  FileCheck2,
  FileText,
  History,
  Pencil,
  Search,
} from 'lucide-react'
import { useTenders } from '@/context/TenderContext'
import { SampleDocumentItem, Status, Tender } from '@/types/tender'
import { SampleDetailsModal } from '@/components/modals/SampleDetailsModal'
import { TenderModal } from '@/components/modals/TenderModal'
import { DocumentPreviewModal } from '@/components/common/DocumentPreviewModal'
import {
  downloadSampleDocx,
  generateSampleFieldContents,
} from '@/lib/sample-details-docx'

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

function renderSampleDocCell(
  doc?: SampleDocumentItem | null,
  onPreview?: (doc: SampleDocumentItem) => void,
  tender?: Tender,
  fieldKey?: 'mafLetter' | 'testReport' | 'bisCertificate' | 'productSample',
  onDirectWordDownload?: (
    fieldKey: 'mafLetter' | 'testReport' | 'bisCertificate' | 'productSample',
    tender: Tender,
    customText?: string
  ) => void
) {
  const docNames: Record<string, string> = {
    mafLetter: `MAF_Letter_${tender?.id || 'Doc'}.docx`,
    testReport: `Test_Report_${tender?.id || 'Doc'}.docx`,
    bisCertificate: `BIS_Certificate_${tender?.id || 'Doc'}.docx`,
    productSample: `Product_Sample_${tender?.id || 'Doc'}.docx`,
  }
  const docNotes: Record<string, string> = {
    mafLetter: 'Auto-generated MAF Authorization Letter',
    testReport: 'Auto-generated Laboratory Test Report',
    bisCertificate: 'Auto-generated BIS Certificate',
    productSample: 'Auto-generated Product Sample Challan',
  }

  // Synthesize auto-generated document if doc is not explicitly saved yet
  const effectiveDoc: SampleDocumentItem | null =
    doc ||
    (tender && fieldKey
      ? {
          id: `${fieldKey}-${tender.id}`,
          name: docNames[fieldKey] || `${fieldKey}.docx`,
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          uploadedAt: tender.sampleDetails?.completedAt || new Date().toISOString(),
          source: 'auto-fetched',
          referenceNote: docNotes[fieldKey],
        }
      : null)

  if (!effectiveDoc) {
    return <span className="text-slate-400 text-xs italic">— Not Provided —</span>
  }

  const handlePreviewDoc = () => {
    if (!effectiveDoc.textContent && tender && fieldKey) {
      const contents = generateSampleFieldContents(tender, null)
      effectiveDoc.textContent = contents[fieldKey]?.textContent
    }
    onPreview?.(effectiveDoc)
  }

  return (
    <div className="flex flex-col gap-1 min-w-[130px] max-w-[200px]">
      <div className="flex items-center gap-1.5">
        {getFileBadge(effectiveDoc.name, effectiveDoc.type)}
        <span
          className="font-semibold text-slate-800 text-xs truncate cursor-pointer hover:text-blue-700"
          title={effectiveDoc.name}
          onClick={handlePreviewDoc}
        >
          {effectiveDoc.name}
        </span>
      </div>
      <div className="flex items-center gap-2 text-[10px]">
        {effectiveDoc.source === 'auto-fetched' || effectiveDoc.source === 'eligibility-docs' ? (
          <span className="text-blue-700 font-bold">✨ Auto</span>
        ) : (
          <span className="text-emerald-700 font-medium">✔ Uploaded</span>
        )}
        {effectiveDoc.size ? <span className="text-slate-400">{formatBytes(effectiveDoc.size)}</span> : null}
        {onPreview && (
          <button
            type="button"
            onClick={handlePreviewDoc}
            className="text-blue-600 hover:text-blue-800 font-bold underline inline-flex items-center gap-0.5 ml-auto cursor-pointer"
            title="Inspect / Preview Document Content"
          >
            <Eye className="w-3 h-3" /> Preview
          </button>
        )}
        {effectiveDoc.dataUrl ? (
          <a
            href={effectiveDoc.dataUrl}
            download={effectiveDoc.name}
            className="text-slate-500 hover:text-slate-800 font-medium underline inline-flex items-center gap-0.5"
            target="_blank"
            rel="noreferrer"
            onClick={e => e.stopPropagation()}
          >
            Download
          </a>
        ) : onDirectWordDownload && tender && fieldKey ? (
          <button
            type="button"
            onClick={e => {
              e.stopPropagation()
              onDirectWordDownload(fieldKey, tender, effectiveDoc.textContent)
            }}
            className="text-blue-600 hover:text-blue-800 font-medium underline inline-flex items-center gap-0.5 cursor-pointer"
            title="Download Word (.docx)"
          >
            <Download className="w-2.5 h-2.5" /> Word
          </button>
        ) : null}
      </div>
    </div>
  )
}

export default function SampleDetailsPage() {
  const { tenders, masters, updateTender, deleteTender, notify } = useTenders()
  const router = useRouter()
  const [tab, setTab] = useState<'pending' | 'completed'>('pending')
  const [query, setQuery] = useState('')

  // Sample Details Verification & History Modal state
  const [sampleModal, setSampleModal] = useState<{
    tender: Tender
    mode: 'edit' | 'history'
  } | null>(null)

  // General Edit Tender Modal state
  const [editTender, setEditTender] = useState<Tender | null>(null)

  // Document Inspection Preview Modal state
  const [previewDoc, setPreviewDoc] = useState<SampleDocumentItem | null>(null)

  // Pending: Tenders currently in Sample Details stage that haven't been completed
  const pendingTenders = useMemo(() => {
    return tenders.filter(
      t => t.stage === 'Sample Details' && !t.sampleDetails?.completedAt
    )
  }, [tenders])

  // Completed / History: Tenders that completed Sample Details and advanced to EMD Ready
  const completedTenders = useMemo(() => {
    return tenders.filter(
      t => !!t.sampleDetails?.completedAt || (t.stage !== 'Sample Details' && !!t.sampleDetails)
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

  const handleDirectWordDownload = async (
    fieldKey: 'mafLetter' | 'testReport' | 'bisCertificate' | 'productSample',
    targetTender: Tender,
    customText?: string
  ) => {
    try {
      const contents = generateSampleFieldContents(targetTender, null)
      const fieldContent = contents[fieldKey]
      await downloadSampleDocx(fieldContent, targetTender, customText)
      notify?.('Word document (.docx) downloaded successfully!')
    } catch (err) {
      console.error('Word download error:', err)
      notify?.('Failed to download Word document')
    }
  }

  const handleCompleteSampleDetails = (updatedTender: Tender) => {
    updateTender(updatedTender.id, updatedTender)
    setSampleModal(null)
    notify(
      `Sample details submitted for "${updatedTender.title}". Archived to History and advanced to EMD Ready (Pending).`
    )
  }

  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">WORKFLOW STAGE 02</p>
          <h1>Sample Details</h1>
          <p>
            Verify MAF letter, lab test reports, BIS certificates, product sample submissions, and technical compliance.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/eligibility-check" className="secondary-button text-xs">
            Previous: Eligibility Check
          </Link>
          <Link href="/emd-ready" className="secondary-button text-xs">
            Next: EMD Ready
          </Link>
          <div className="badge badge-blue py-2 px-3 text-xs font-semibold">
            {pendingTenders.length} Pending Samples
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
              placeholder="Search by tender title, ID, authority, department..."
            />
          </div>
        </div>

        {/* Table */}
        <div className="table-wrap">
          {filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon-box">
                <FileCheck2 />
              </div>
              <h3>{tab === 'completed' ? 'No completed sample records yet' : 'No tenders pending in Sample Details'}</h3>
              <p>
                {tab === 'completed'
                  ? 'Tenders with verified MAF, test reports, and BIS certificates will be archived here.'
                  : 'Tenders completed in Stage 01 (Eligibility Check) automatically arrive here for sample verification.'}
              </p>
              {tab === 'pending' && (
                <Link href="/eligibility-check" className="primary-button">
                  Check Eligibility Check Stage
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
                      <th>MAF Letter</th>
                      <th>Test Report</th>
                      <th>BIS Certificate</th>
                      <th>Product Sample</th>
                      <th>Other Documents</th>
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
                            title="Verify and submit MAF, Test Report, BIS, Product Sample"
                            onClick={() => setSampleModal({ tender: t, mode: 'edit' })}
                          >
                            Action <ArrowRight />
                          </button>
                        ) : (
                          <>
                            <button
                              className="table-action"
                              title="View submitted sample details and audit history"
                              onClick={() => setSampleModal({ tender: t, mode: 'history' })}
                            >
                              View Docs
                            </button>

                            {/* Stage Specific Edit - Only in Completed / History */}
                            <button
                              className="icon-action text-amber-600 hover:text-amber-800"
                              title="Edit Sample Details (MAF, Test Report, BIS, Product Sample, Remark)"
                              onClick={() => setSampleModal({ tender: t, mode: 'edit' })}
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
                        <td>
                          {renderSampleDocCell(
                            t.sampleDetails?.mafLetter,
                            setPreviewDoc,
                            t,
                            'mafLetter',
                            handleDirectWordDownload
                          )}
                        </td>
                        <td>
                          {renderSampleDocCell(
                            t.sampleDetails?.testReport,
                            setPreviewDoc,
                            t,
                            'testReport',
                            handleDirectWordDownload
                          )}
                        </td>
                        <td>
                          {renderSampleDocCell(
                            t.sampleDetails?.bisCertificate,
                            setPreviewDoc,
                            t,
                            'bisCertificate',
                            handleDirectWordDownload
                          )}
                        </td>
                        <td>
                          {renderSampleDocCell(
                            t.sampleDetails?.productSample,
                            setPreviewDoc,
                            t,
                            'productSample',
                            handleDirectWordDownload
                          )}
                        </td>

                        <td>
                          {t.sampleDetails?.otherDocs && t.sampleDetails.otherDocs.length > 0 ? (
                            <div className="flex flex-col gap-1 min-w-[140px] max-w-[200px]">
                              {t.sampleDetails.otherDocs.slice(0, 2).map((od, i) => (
                                <div key={i} className="flex items-center justify-between text-xs gap-1">
                                  <span
                                    className="truncate text-slate-700 font-semibold cursor-pointer hover:text-blue-700"
                                    title={od.name}
                                    onClick={() => setPreviewDoc(od)}
                                  >
                                    {od.name}
                                  </span>
                                  <div className="flex items-center gap-1.5 flex-shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => setPreviewDoc(od)}
                                      className="text-[10px] text-blue-600 font-bold underline cursor-pointer"
                                    >
                                      Preview
                                    </button>
                                    {od.dataUrl && (
                                      <a
                                        href={od.dataUrl}
                                        download={od.name}
                                        className="text-[10px] text-slate-500 underline font-medium"
                                        target="_blank"
                                        rel="noreferrer"
                                        onClick={e => e.stopPropagation()}
                                      >
                                        Download
                                      </a>
                                    )}
                                  </div>
                                </div>
                              ))}
                              {t.sampleDetails.otherDocs.length > 2 && (
                                <span className="text-[10px] text-slate-500 font-medium">
                                  +{t.sampleDetails.otherDocs.length - 2} more
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 text-xs italic">— None —</span>
                          )}
                        </td>

                        <td>
                          <div className="min-w-[150px] max-w-[220px]">
                            {t.sampleDetails?.remarks ? (
                              <p className="text-xs text-slate-700 leading-relaxed line-clamp-2" title={t.sampleDetails.remarks}>
                                {t.sampleDetails.remarks}
                              </p>
                            ) : (
                              <span className="text-slate-400 text-xs italic">— None —</span>
                            )}
                          </div>
                        </td>

                        <td>
                          <span className="text-xs text-slate-600 font-medium whitespace-nowrap">
                            {t.sampleDetails?.completedAt
                              ? new Date(t.sampleDetails.completedAt).toLocaleString('en-IN', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : 'Submitted'}
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

      {/* Sample Details Verification & History Modal */}
      {sampleModal && (
        <SampleDetailsModal
          tender={sampleModal.tender}
          mode={sampleModal.mode}
          onClose={() => setSampleModal(null)}
          onComplete={handleCompleteSampleDetails}
        />
      )}

      {/* Tender Edit Modal */}
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
