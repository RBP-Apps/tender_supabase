'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Clock3,
  Download,
  Eye,
  FileText,
  Layers,
  Pencil,
  Plus,
  Sparkles,
  Table as TableIcon,
} from 'lucide-react'
import { Status, Tender } from '@/types/tender'
import { TenderDetailsViewModal } from '@/components/modals/TenderDetailsViewModal'

interface TenderTableProps {
  tenders: Tender[]
  onProcess: (tender: Tender) => void
  onEdit?: (tender: Tender) => void
  onDelete?: (id: string) => void
  history?: boolean
  emptyMessage?: string
  showCreateButton?: boolean
  onCreateClick?: () => void
  defaultViewMode?: 'all' | 'compact'
  allowViewToggle?: boolean
}

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

/**
 * Expandable cell for lengthy text values (Test Reports, MAF, Experience, Turnover, Work Name, etc.)
 */
function ExpandableTextCell({
  text,
  maxChars = 80,
  onOpenModal,
}: {
  text?: string | null
  maxChars?: number
  onOpenModal?: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  if (!text || !text.trim()) {
    return <span className="text-slate-300 italic text-xs">—</span>
  }
  const clean = text.trim()
  const isLong = clean.length > maxChars

  return (
    <div className="text-xs leading-relaxed max-w-[280px]">
      <div className={expanded ? 'whitespace-pre-line break-words' : 'line-clamp-2 break-words'}>
        {clean}
      </div>
      {isLong && (
        <div className="flex items-center gap-2 mt-1">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold underline inline-flex items-center gap-0.5"
          >
            {expanded ? (
              <>
                Less <ChevronUp className="w-3 h-3" />
              </>
            ) : (
              <>
                More <ChevronDown className="w-3 h-3" />
              </>
            )}
          </button>
          {onOpenModal && (
            <button
              type="button"
              onClick={onOpenModal}
              className="text-[11px] text-purple-600 hover:text-purple-800 font-semibold underline inline-flex items-center gap-0.5"
            >
              Full View
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Export tender records to CSV
 */
function exportTendersToCsv(tenders: Tender[]) {
  const headers = [
    'Tender ID',
    'Tender Title',
    'Issuing Authority',
    'Authority Full Name',
    'Department',
    'State',
    'Estimated Value',
    'Stage',
    'Status',
    'Submission Due Date',
    'Bid Deadline Time',
    'Tender Fee (per package)',
    'GST Section',
    'Tender Fee + GST',
    'Test Report Compliance',
    'MAF Requirement',
    'Experience Filed (Exact Requirement)',
    'Turn Over (Turnover)',
    'Financial Requirement (Rs. Cr)',
    'Technical Requirement',
    'RfS / Tender No.',
    'RfS Date',
    'Corrigendum',
    'Addressee Designation',
    'Authority Address',
    'Scope of Work',
    'Short Name of Work',
    'Jurisdiction',
    'Bid Validity (Days)',
    'Planned Date',
    'Actual Date',
    'Delay (Days)',
    'Remarks',
  ]

  const rows = tenders.map(t => {
    const bid = t.bid
    return [
      t.id,
      t.title,
      t.authority,
      bid?.authorityFullName || t.authority,
      t.department,
      t.state,
      t.value || '',
      t.stage,
      t.status,
      t.due || '',
      bid?.bidDeadlineTime || '',
      bid?.tenderFeePerPackage || '',
      bid?.gstSection || '',
      bid?.tenderFeePlusGst || '',
      bid?.testReportCompliance || '',
      bid?.mafRequirement || '',
      bid?.experienceRequirement || '',
      bid?.turnoverRequirement || '',
      bid?.financialRequirementCr || '',
      bid?.technicalRequirement || '',
      bid?.rfsNo || '',
      bid?.rfsDate || '',
      bid?.corrigendum || '',
      bid?.addresseeDesignation || '',
      bid?.authorityAddress || '',
      bid?.workName || '',
      bid?.shortWorkName || '',
      bid?.jurisdiction || '',
      bid?.bidValidityDays || '',
      t.planned_date || '',
      t.actual_date || '',
      typeof t.delay_days === 'number' ? t.delay_days : 0,
      t.remarks || '',
    ].map(val => `"${String(val ?? '').replace(/"/g, '""')}"`)
  })

  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
  const encodedUri = encodeURI(csvContent)
  const link = document.createElement('a')
  link.setAttribute('href', encodedUri)
  link.setAttribute('download', `tenders_export_${new Date().toISOString().slice(0, 10)}.csv`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export function TenderTable({
  tenders,
  onProcess,
  onEdit,
  onDelete,
  history = false,
  emptyMessage,
  showCreateButton = false,
  onCreateClick,
  defaultViewMode = 'all',
  allowViewToggle = true,
}: TenderTableProps) {
  const [viewMode, setViewMode] = useState<'all' | 'compact'>(defaultViewMode)
  const [selectedTender, setSelectedTender] = useState<Tender | null>(null)

  return (
    <>
      {/* Sub-header Controls for All Records view */}
      {tenders.length > 0 && allowViewToggle && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5 bg-slate-50 border-b border-slate-200 text-xs">
          <div className="flex items-center gap-2 text-slate-600 font-medium">
            <span>
              Showing <strong>{tenders.length}</strong> record{tenders.length === 1 ? '' : 's'}
            </span>
            <span className="text-slate-300">•</span>
            <span className="inline-flex items-center gap-1 text-purple-700 font-semibold bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
              <Sparkles className="w-3.5 h-3.5 text-purple-600" />
              {viewMode === 'all' ? 'All 36 Create New Tender & AI Fields' : 'Compact Summary View (10 Fields)'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => exportTendersToCsv(tenders)}
              className="secondary-button text-xs py-1 px-2.5 flex items-center gap-1.5 hover:bg-slate-100"
              title="Download CSV containing all 36 tender fields for current records"
            >
              <Download className="w-3.5 h-3.5 text-slate-600" /> Export CSV
            </button>
            <button
              type="button"
              onClick={() => setViewMode(prev => (prev === 'all' ? 'compact' : 'all'))}
              className={`text-xs font-semibold py-1 px-2.5 rounded-md border flex items-center gap-1.5 transition-all ${
                viewMode === 'all'
                  ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" />
              {viewMode === 'all' ? 'Switch to Compact View' : 'Show All Fields (36 Columns)'}
            </button>
          </div>
        </div>
      )}

      <div className="table-wrap">
        {tenders.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon-box">
              <FileText />
            </div>
            <h3>{history ? 'No completed records' : 'No tenders available'}</h3>
            <p>
              {emptyMessage ||
                (history
                  ? 'Processed and completed records will be archived here.'
                  : 'No tenders found in this view. Start by creating a new tender.')}
            </p>
            {showCreateButton &&
              (onCreateClick ? (
                <button className="primary-button" onClick={onCreateClick}>
                  <Plus className="w-4 h-4" /> Add New Tender
                </button>
              ) : (
                <Link href="/tender-details" className="primary-button">
                  <Plus className="w-4 h-4" /> Go to Tender Details
                </Link>
              ))}
          </div>
        ) : (
          <table className={viewMode === 'all' ? 'all-records-table' : ''}>
            <thead>
              <tr>
                {/* Column 1: Action (Sticky left) */}
                <th className="action-col">Action</th>

                {/* Core Overview */}
                <th style={{ minWidth: 260 }}>Tender ID & Title</th>
                <th style={{ minWidth: 140 }}>Authority (Client)</th>

                {viewMode === 'all' && (
                  <>
                    <th style={{ minWidth: 220 }}>Authority Full Name</th>
                  </>
                )}

                <th style={{ minWidth: 140 }}>Department</th>
                <th style={{ minWidth: 120 }}>State</th>
                <th style={{ minWidth: 110 }}>Estimated Value</th>
                <th style={{ minWidth: 130 }}>Stage</th>
                <th style={{ minWidth: 110 }}>Status</th>
                <th style={{ minWidth: 110 }}>Due Date</th>

                {/* 6 AI Auto-Fill Tender Fields */}
                {viewMode === 'all' && (
                  <>
                    <th style={{ minWidth: 120 }}>Bid Deadline Time</th>
                    <th style={{ minWidth: 130 }}>Tender Fee (per pkg)</th>
                    <th style={{ minWidth: 200, background: '#faf5ff', color: '#6b21a8' }}>
                      <span className="flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-purple-600" /> GST Section
                      </span>
                    </th>
                    <th style={{ minWidth: 220, background: '#ecfdf5', color: '#065f46' }}>
                      <span className="flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-emerald-600" /> Tender Fee + GST
                      </span>
                    </th>
                    <th style={{ minWidth: 260, background: '#f0f9ff', color: '#0369a1' }}>
                      <span className="flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-blue-600" /> Test Report Compliance
                      </span>
                    </th>
                    <th style={{ minWidth: 260, background: '#eef2ff', color: '#3730a3' }}>
                      <span className="flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-indigo-600" /> MAF Requirement
                      </span>
                    </th>
                    <th style={{ minWidth: 280, background: '#fffbeb', color: '#92400e' }}>
                      <span className="flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-amber-600" /> Experience Filed (Exact)
                      </span>
                    </th>
                    <th style={{ minWidth: 260, background: '#f0fdfa', color: '#115e59' }}>
                      <span className="flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-teal-600" /> Turn Over (Turnover)
                      </span>
                    </th>

                    {/* All Remaining Create New Tender Form Fields */}
                    <th style={{ minWidth: 130 }}>Financial Req (Cr)</th>
                    <th style={{ minWidth: 180 }}>Technical Req</th>
                    <th style={{ minWidth: 180 }}>RfS / Tender No.</th>
                    <th style={{ minWidth: 110 }}>RfS Date</th>
                    <th style={{ minWidth: 180 }}>Corrigendum</th>
                    <th style={{ minWidth: 180 }}>Addressee Designation</th>
                    <th style={{ minWidth: 240 }}>Authority Address</th>
                    <th style={{ minWidth: 280 }}>Full Name of Work</th>
                    <th style={{ minWidth: 200 }}>Short Name of Work</th>
                    <th style={{ minWidth: 130 }}>Jurisdiction</th>
                    <th style={{ minWidth: 110 }}>Bid Validity</th>
                    <th style={{ minWidth: 140 }}>Packages & EMD</th>
                    <th style={{ minWidth: 180 }}>Technical Components</th>
                    <th style={{ minWidth: 200 }}>Beneficiary Bank</th>
                  </>
                )}

                <th style={{ minWidth: 100 }}>Planned</th>
                <th style={{ minWidth: 100 }}>Actual</th>
                <th style={{ minWidth: 80 }}>Delay</th>

                {viewMode === 'all' && <th style={{ minWidth: 220 }}>Remarks & Notes</th>}
              </tr>
            </thead>
            <tbody>
              {tenders.map(t => {
                const delayVal = typeof t.delay_days === 'number' ? t.delay_days : 0
                const bid = t.bid

                return (
                  <tr key={t.id}>
                    {/* First column: Action (Sticky left) */}
                    <td className="action-col">
                      <div className="action-group">
                        <button
                          className="icon-action text-purple-700 hover:text-purple-900 hover:bg-purple-50"
                          title="View all 36 fields in detailed modal"
                          onClick={() => setSelectedTender(t)}
                        >
                          <Eye className="w-4 h-4 text-purple-600" />
                        </button>
                        <button
                          className="table-action"
                          title={history ? 'View Tender Details' : 'Process to next stage'}
                          onClick={() => onProcess(t)}
                        >
                          {history ? 'View' : 'Process'} <ArrowRight />
                        </button>
                        {onEdit && (history || defaultViewMode === 'all') && (
                          <button
                            className="icon-action text-amber-600 hover:text-amber-800"
                            title="Edit details"
                            onClick={() => onEdit(t)}
                          >
                            <Pencil />
                          </button>
                        )}
                        <Link
                          href={`/tender-documents/${encodeURIComponent(t.id)}`}
                          className="icon-action"
                          title="View auto-filled bid documents"
                        >
                          <FileText />
                        </Link>
                      </div>
                    </td>

                    {/* Tender ID & Title */}
                    <td>
                      <div className="tender-name max-w-[280px]">
                        <strong className="text-slate-900 block truncate" title={t.title}>
                          {t.title}
                        </strong>
                        <small className="text-slate-500 font-mono text-[11px] block mt-0.5">
                          {t.id} {t.value ? `· ${t.value}` : ''}
                        </small>
                      </div>
                    </td>

                    {/* Issuing Authority */}
                    <td>
                      <span className="font-semibold text-slate-800">{t.authority}</span>
                    </td>

                    {viewMode === 'all' && (
                      <td>
                        <span className="text-xs text-slate-700 font-medium" title={bid?.authorityFullName || t.authority}>
                          {bid?.authorityFullName || t.authority || '—'}
                        </span>
                      </td>
                    )}

                    {/* Department & State */}
                    <td>{t.department}</td>
                    <td>{t.state}</td>

                    {/* Estimated Value */}
                    <td>
                      <strong className="text-slate-800 font-semibold">{t.value || '—'}</strong>
                    </td>

                    {/* Stage & Status */}
                    <td>
                      <span className="badge badge-slate">{t.stage}</span>
                    </td>
                    <td>
                      <span className={`badge ${statusTone(t.status)}`}>{t.status}</span>
                    </td>

                    {/* Due Date */}
                    <td>
                      <span className="due-badge">
                        <Clock3 />
                        {dueLabel(t.due)}
                      </span>
                    </td>

                    {/* 6 AI Auto-Fill Tender Fields */}
                    {viewMode === 'all' && (
                      <>
                        {/* Bid Deadline Time */}
                        <td className="text-xs font-mono text-slate-700">{bid?.bidDeadlineTime || '—'}</td>

                        {/* Tender Fee (per package) */}
                        <td className="text-xs font-bold text-slate-800">
                          {bid?.tenderFeePerPackage ? `₹ ${bid.tenderFeePerPackage}` : '—'}
                        </td>

                        {/* Field 1: GST Section */}
                        <td className="bg-purple-50/40">
                          <ExpandableTextCell
                            text={bid?.gstSection}
                            maxChars={70}
                            onOpenModal={() => setSelectedTender(t)}
                          />
                        </td>

                        {/* Field 2: Tender Fee + GST */}
                        <td className="bg-emerald-50/40">
                          {bid?.tenderFeePlusGst ? (
                            <div className="text-xs font-semibold text-emerald-900 leading-tight">
                              <span className="font-bold text-emerald-800 block">{bid.tenderFeePlusGst}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic text-xs">—</span>
                          )}
                        </td>

                        {/* Field 3: Test Report Compliance (3–5 lines summary) */}
                        <td className="bg-sky-50/30">
                          <ExpandableTextCell
                            text={bid?.testReportCompliance}
                            maxChars={85}
                            onOpenModal={() => setSelectedTender(t)}
                          />
                        </td>

                        {/* Field 4: MAF Requirement (3–5 lines summary) */}
                        <td className="bg-indigo-50/30">
                          <ExpandableTextCell
                            text={bid?.mafRequirement}
                            maxChars={85}
                            onOpenModal={() => setSelectedTender(t)}
                          />
                        </td>

                        {/* Field 5: Experience Filed (Exact Requirement) */}
                        <td className="bg-amber-50/30">
                          <ExpandableTextCell
                            text={bid?.experienceRequirement}
                            maxChars={90}
                            onOpenModal={() => setSelectedTender(t)}
                          />
                        </td>

                        {/* Field 6: Turn Over (Turnover) */}
                        <td className="bg-teal-50/30">
                          <ExpandableTextCell
                            text={bid?.turnoverRequirement}
                            maxChars={85}
                            onOpenModal={() => setSelectedTender(t)}
                          />
                        </td>

                        {/* Financial Requirement (Rs. Cr) */}
                        <td className="text-xs font-bold text-slate-800">
                          {bid?.financialRequirementCr ? `₹ ${bid.financialRequirementCr} Cr` : '—'}
                        </td>

                        {/* Technical Requirement */}
                        <td className="text-xs text-slate-700">
                          <ExpandableTextCell text={bid?.technicalRequirement} maxChars={60} />
                        </td>

                        {/* RfS No & Date */}
                        <td className="text-xs font-mono text-slate-800 font-semibold">{bid?.rfsNo || '—'}</td>
                        <td className="text-xs text-slate-600 font-mono">{bid?.rfsDate || '—'}</td>

                        {/* Corrigendum */}
                        <td className="text-xs text-slate-700 font-medium">
                          <ExpandableTextCell text={bid?.corrigendum} maxChars={60} />
                        </td>

                        {/* Addressee Designation */}
                        <td className="text-xs text-slate-700">{bid?.addresseeDesignation || '—'}</td>

                        {/* Authority Address */}
                        <td>
                          <ExpandableTextCell text={bid?.authorityAddress} maxChars={70} />
                        </td>

                        {/* Scope of Work */}
                        <td>
                          <ExpandableTextCell text={bid?.workName || t.title} maxChars={80} />
                        </td>

                        {/* Short Work Name */}
                        <td>
                          <ExpandableTextCell text={bid?.shortWorkName} maxChars={60} />
                        </td>

                        {/* Jurisdiction */}
                        <td className="text-xs text-slate-700">{bid?.jurisdiction || '—'}</td>

                        {/* Bid Validity Days */}
                        <td className="text-xs font-semibold text-slate-700">
                          {bid?.bidValidityDays ? `${bid.bidValidityDays} Days` : '—'}
                        </td>

                        {/* Packages & EMD */}
                        <td>
                          {bid?.packages && bid.packages.length > 0 ? (
                            <div className="text-xs space-y-0.5">
                              <span className="font-bold text-blue-700 block">
                                {bid.packages.length} Package{bid.packages.length === 1 ? '' : 's'}
                              </span>
                              <span className="text-[11px] text-slate-500 block truncate max-w-[160px]">
                                {bid.packages.map(p => `${p.code} (${p.emdLakh ? `₹${p.emdLakh}L` : ''})`).join(', ')}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic text-xs">—</span>
                          )}
                        </td>

                        {/* Technical Components */}
                        <td>
                          {bid?.technicalComponents && bid.technicalComponents.length > 0 ? (
                            <div className="text-xs space-y-0.5">
                              <span className="font-bold text-slate-800 block">
                                {bid.technicalComponents.length} Component{bid.technicalComponents.length === 1 ? '' : 's'}
                              </span>
                              <span className="text-[11px] text-slate-500 block truncate max-w-[180px]">
                                {bid.technicalComponents.map(c => c.item).join(', ')}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic text-xs">—</span>
                          )}
                        </td>

                        {/* Beneficiary Bank */}
                        <td>
                          {bid?.beneficiaryBank?.accountNo ? (
                            <div className="text-xs">
                              <span className="font-semibold text-slate-800 block truncate max-w-[180px]">
                                {bid.beneficiaryBank.bankName || 'Bank'}
                              </span>
                              <span className="text-[11px] font-mono text-slate-500 block">
                                A/C: {bid.beneficiaryBank.accountNo} • {bid.beneficiaryBank.ifsc}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic text-xs">—</span>
                          )}
                        </td>
                      </>
                    )}

                    {/* Planned & Actual */}
                    <td className="text-xs text-slate-600 font-medium">{t.planned_date || t.due || '—'}</td>
                    <td className="text-xs text-slate-600 font-medium">
                      {t.actual_date ? (
                        <span className="text-emerald-700 font-semibold">{t.actual_date}</span>
                      ) : (
                        <span className="text-slate-400 italic">Pending</span>
                      )}
                    </td>

                    {/* Delay */}
                    <td>
                      {delayVal > 0 ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-red-100 text-red-700">
                          +{delayVal}d
                        </span>
                      ) : t.status === 'Completed' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-700">
                          On Time
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">0d</span>
                      )}
                    </td>

                    {/* Remarks & Notes */}
                    {viewMode === 'all' && (
                      <td>
                        <ExpandableTextCell text={t.remarks} maxChars={80} />
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Tender Record Full Details Modal */}
      {selectedTender && (
        <TenderDetailsViewModal
          tender={selectedTender}
          onClose={() => setSelectedTender(null)}
          onEdit={onEdit}
        />
      )}
    </>
  )
}
