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
import { TenderModal } from '@/components/modals/TenderModal'
import {
  collectAllTenderDocuments,
  DocumentDossierSummary,
} from '@/lib/document-ready-collector'

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
  const { tenders, updateTender, deleteTender, advanceStage, notify } = useTenders()
  const router = useRouter()
  const [tab, setTab] = useState<'pending' | 'completed' | 'all'>('pending')
  const [query, setQuery] = useState('')

  // Modal states
  const [dossierTender, setDossierTender] = useState<Tender | null>(null)
  const [editTender, setEditTender] = useState<Tender | null>(null)

  // Pending: Tenders currently in Document Ready stage
  const pendingTenders = useMemo(() => {
    return tenders.filter(t => t.stage === 'Document Ready')
  }, [tenders])

  // Completed / Advanced: Tenders that passed Document Ready (e.g. Document Upload in portal or later)
  const completedTenders = useMemo(() => {
    const postStages = [
      'Document Upload in portal',
      'Submit in website',
      'Technical Open Check',
      'Financial Open Check',
    ]
    return tenders.filter(t => postStages.includes(t.stage) || t.status === 'Completed')
  }, [tenders])

  // Map of document dossiers for fast lookup
  const dossiersByTenderId = useMemo(() => {
    const map = new Map<string, DocumentDossierSummary>()
    tenders.forEach(t => {
      map.set(t.id, collectAllTenderDocuments(t))
    })
    return map
  }, [tenders])

  const filtered = useMemo(() => {
    const baseList =
      tab === 'completed'
        ? completedTenders
        : tab === 'pending'
        ? pendingTenders
        : tenders

    if (!query.trim()) return baseList
    const q = query.toLowerCase()
    return baseList.filter(t => {
      const d = dossiersByTenderId.get(t.id)
      return (
        t.title.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q) ||
        t.authority.toLowerCase().includes(q) ||
        t.department.toLowerCase().includes(q) ||
        t.emdReady?.utrNumber?.toLowerCase().includes(q) ||
        t.stage.toLowerCase().includes(q) ||
        (d && d.totalCount.toString().includes(q))
      )
    })
  }, [tab, pendingTenders, completedTenders, tenders, query, dossiersByTenderId])

  const handleAdvanceToNextStage = (t: Tender) => {
    const updated: Tender = {
      ...t,
      portalUpload: {
        ...(t.portalUpload || { documents: [] }),
        checklist: t.documentReady?.checklist || t.portalUpload?.checklist,
        checklistSource: t.documentReady?.checklistTitle || t.portalUpload?.checklistSource,
        documents: [
          ...(t.portalUpload?.documents || []),
          ...(t.documentReady?.checklistDocs || []).filter(
            cd => !(t.portalUpload?.documents || []).some(pd => pd.fieldKey === cd.fieldKey)
          ),
        ],
      },
    }
    updateTender(t.id, updated)
    advanceStage(
      t.id,
      'Document Upload in portal',
      'Ready',
      'All previous stage documents verified and compiled into Master Dossier.'
    )
    setDossierTender(null)
    notify(
      `Tender "${t.title}" dossier approved and advanced to "Document Upload in portal".`
    )
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
            Consolidated Master Document Dossier. All uploaded files, PDFs, images, word documents,
            transaction references, and verification remarks fetched across previous stages.
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

      {/* Main Content Card */}
      <div className="card list-card">
        {/* Tabs */}
        <div className="tabs">
          <button
            className={tab === 'pending' ? 'tab active' : 'tab'}
            onClick={() => setTab('pending')}
          >
            Pending Document Review <span>{pendingTenders.length}</span>
          </button>
          <button
            className={tab === 'completed' ? 'tab active' : 'tab'}
            onClick={() => setTab('completed')}
          >
            Completed / Advanced <span>{completedTenders.length}</span>
          </button>
          <button
            className={tab === 'all' ? 'tab active' : 'tab'}
            onClick={() => setTab('all')}
          >
            All Workspace Dossiers <span>{tenders.length}</span>
          </button>
        </div>

        {/* Search Bar */}
        <div className="filters-bar">
          <div className="search-box">
            <Search />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by tender title, ID, authority, UTR Number, document..."
            />
          </div>
        </div>

        {/* Table Wrapper (strictly contained horizontal scroll) */}
        <div className="table-wrap">
          {filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon-box">
                <FolderArchive />
              </div>
              <h3>
                {tab === 'completed'
                  ? 'No completed document dossiers found'
                  : tab === 'pending'
                  ? 'No tenders pending in Document Ready'
                  : 'No tenders match the search query'}
              </h3>
              <p>
                {tab === 'pending'
                  ? 'Tenders that complete Stage 04 (EMD Ready) automatically arrive here with all fetched documents.'
                  : 'Tenders approved here advance to "Document Upload in portal" with complete statutory documentation.'}
              </p>
              {tab === 'pending' && (
                <Link href="/emd-ready" className="primary-button">
                  Check EMD Ready Stage
                </Link>
              )}
            </div>
          ) : (
            <table style={{ minWidth: '1500px' }}>
              <thead>
                <tr>
                  <th className="action-col">Action</th>
                  <th>Tender</th>
                  <th>Total Docs Fetched</th>
                  <th>Tender Checklist Requirements</th>
                  <th>Stage 1 & 2 (Notice / Corrigendum)</th>
                  <th>Stage 3 (Eligibility Docs)</th>
                  <th>Stage 4 (Sample Docs)</th>
                  <th>Stage 5 (EMD Payment Proof)</th>
                  <th>Stage & Status</th>
                  <th>Due Date</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => {
                  const dossier = dossiersByTenderId.get(t.id)
                  const total = dossier?.totalCount || 0
                  const hasEligibility = dossier?.hasEligibilityDocs
                  const hasSample = dossier?.hasSampleDocs
                  const hasEmd = dossier?.hasEmdPayment

                  return (
                    <tr key={t.id}>
                      {/* 1. Action Column */}
                      <td className="action-col">
                        <div className="action-group">
                          <button
                            className="table-action font-semibold"
                            title="View all fetched documents, files, images, PDFs, word docs, texts, and remarks"
                            onClick={() => setDossierTender(t)}
                          >
                            View All Documents <ArrowRight />
                          </button>

                          {/* Quick Upload PDF / Document */}
                          <button
                            className="icon-action text-blue-600 hover:text-blue-800"
                            title="Upload PDF or document into dossier"
                            onClick={() => setDossierTender(t)}
                          >
                            <UploadCloud />
                          </button>

                          {/* Open Auto-filled Bid documents */}
                          <Link
                            href={`/tender-documents/${encodeURIComponent(t.id)}`}
                            className="icon-action"
                            title="Open auto-generated bid document set (affidavits, annexures, checklists)"
                          >
                            <FileText />
                          </Link>

                          {/* Stage Specific Edit - Only in Completed / History */}
                          {tab === 'completed' && (
                            <button
                              className="icon-action text-amber-600 hover:text-amber-800"
                              title="Edit Document Ready dossier and documents"
                              onClick={() => setDossierTender(t)}
                            >
                              <Pencil />
                            </button>
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

                      {/* 3. Total Docs Fetched */}
                      <td>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-900 text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-800 border border-blue-200 whitespace-nowrap flex items-center gap-1">
                            <Layers className="w-3 h-3 text-blue-600" />
                            {total} Documents
                          </span>
                        </div>
                      </td>

                      {/* 3b. Tender Checklist Requirements (Dynamic from PDF) */}
                      <td>
                        <div className="min-w-[160px] max-w-[220px] flex flex-col gap-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-xs text-blue-900 bg-blue-100/90 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                              📋 {dossier?.totalChecklistCount || 0} Required
                            </span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                (dossier?.attachedChecklistCount || 0) >= (dossier?.totalChecklistCount || 1)
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-amber-100 text-amber-900'
                              }`}
                            >
                              {dossier?.attachedChecklistCount || 0} Attached
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-500 truncate" title={dossier?.checklistTitle}>
                            {dossier?.checklistTitle || 'Checklist of Documents to be Uploaded'}
                          </span>
                        </div>
                      </td>

                      {/* 4. Stage 1 & 2 (Notice & Corrigendum) */}
                      <td>
                        <div className="min-w-[140px] max-w-[190px] flex flex-col gap-1">
                          <span className="text-xs font-semibold text-slate-800 flex items-center gap-1 truncate">
                            <span className="px-1 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-bold">
                              PDF
                            </span>
                            {t.bid?.rfsNo ? `RfS: ${t.bid.rfsNo}` : `NIT: ${t.id}`}
                          </span>
                          <span className="text-[10px] text-purple-700 font-medium">
                            {t.corrigenda && t.corrigenda.length > 0
                              ? `📑 ${t.corrigenda.length} Corrigend${t.corrigenda.length === 1 ? 'um' : 'a'}`
                              : '— No Corrigendum —'}
                          </span>
                        </div>
                      </td>

                      {/* 5. Stage 3 (Eligibility Docs) */}
                      <td>
                        <div className="min-w-[160px] max-w-[220px]">
                          {hasEligibility ? (
                            <div className="flex flex-col gap-1">
                              <span className="text-xs font-semibold text-slate-800 flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                {dossier?.categories.eligibility.length} Eligibility Files
                              </span>
                              <div className="flex items-center gap-1 flex-wrap">
                                {t.eligibilityCheck?.turnoverDoc && (
                                  <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded font-mono text-slate-700">
                                    Turnover
                                  </span>
                                )}
                                {t.eligibilityCheck?.experienceDoc && (
                                  <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded font-mono text-slate-700">
                                    Exp
                                  </span>
                                )}
                                {t.eligibilityCheck?.vendorRegDoc && (
                                  <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded font-mono text-slate-700">
                                    VendorReg
                                  </span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-xs italic">— Not Provided —</span>
                          )}
                        </div>
                      </td>

                      {/* 6. Stage 4 (Sample Docs) */}
                      <td>
                        <div className="min-w-[160px] max-w-[220px]">
                          {hasSample ? (
                            <div className="flex flex-col gap-1">
                              <span className="text-xs font-semibold text-slate-800 flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                {dossier?.categories.sample.length} Sample Files
                              </span>
                              <div className="flex items-center gap-1 flex-wrap">
                                {t.sampleDetails?.mafLetter && (
                                  <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded font-mono">
                                    MAF
                                  </span>
                                )}
                                {t.sampleDetails?.testReport && (
                                  <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded font-mono">
                                    Test
                                  </span>
                                )}
                                {t.sampleDetails?.bisCertificate && (
                                  <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded font-mono">
                                    BIS
                                  </span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-xs italic">— Not Provided —</span>
                          )}
                        </div>
                      </td>

                      {/* 7. Stage 5 (EMD Payment Proof) */}
                      <td>
                        <div className="min-w-[160px] max-w-[220px]">
                          {hasEmd && t.emdReady ? (
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-slate-900 text-xs">
                                  {t.emdReady.amount}
                                </span>
                                <span className="font-mono text-[10px] bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded font-semibold">
                                  {t.emdReady.utrNumber}
                                </span>
                              </div>
                              <small className="text-slate-500 font-medium text-[11px]">
                                {t.emdReady.departmentAccount?.bankName} · {t.emdReady.date}
                              </small>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-xs italic">— EMD Pending —</span>
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

      {/* Master Document Dossier Modal */}
      {dossierTender && (
        <MasterDocumentDossierModal
          tender={dossierTender}
          onClose={() => setDossierTender(null)}
          onAdvance={dossierTender.stage === 'Document Ready' ? handleAdvanceToNextStage : undefined}
          onUpdate={updated => {
            updateTender(updated.id, updated)
            setDossierTender(updated)
            notify(`Tender "${updated.title}" dossier updated and saved.`)
          }}
        />
      )}

      {/* Edit Tender Modal */}
      {editTender && (
        <TenderModal
          mode="edit"
          initial={editTender}
          masters={{
            states: ['Delhi', 'Maharashtra', 'Gujarat', 'Karnataka', 'Tamil Nadu', 'Chhattisgarh'],
            departments: ['Energy', 'Irrigation', 'Transport', 'Public Works', 'CREDA', 'Water Resources'],
            firms: ['Apex Builders', 'Zenith Infra', 'Horizon Power', 'Suntech Engineers'],
            tenderTypes: ['Goods', 'Works', 'Services', 'Turnkey EPC'],
          }}
          onSave={updated => {
            updateTender(updated.id, updated)
            setEditTender(null)
          }}
          onClose={() => setEditTender(null)}
        />
      )}
    </section>
  )
}
