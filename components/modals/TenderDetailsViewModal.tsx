'use client'

import React, { useState } from 'react'
import {
  AlertCircle,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Coins,
  Copy,
  ExternalLink,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  Layers,
  MapPin,
  Pencil,
  ShieldCheck,
  Sparkles,
  Tag,
  Wallet,
  X,
} from 'lucide-react'
import { Tender } from '@/types/tender'

interface TenderDetailsViewModalProps {
  tender: Tender | null
  onClose: () => void
  onEdit?: (tender: Tender) => void
}

export function TenderDetailsViewModal({ tender, onClose, onEdit }: TenderDetailsViewModalProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  if (!tender) return null

  const bid = tender.bid
  const copyToClipboard = (text: string, key: string) => {
    if (!text) return
    navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  return (
    <div className="modal-backdrop" style={{ zIndex: 70 }} onClick={onClose}>
      <div
        className="modal"
        style={{ width: 'min(980px, 96vw)', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-head flex-shrink-0" style={{ borderBottom: '1px solid #e2e8f0', padding: '18px 24px' }}>
          <div className="min-w-0 pr-4">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                {tender.id}
              </span>
              <span className="px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700">
                {tender.stage}
              </span>
              <span
                className={`px-2 py-0.5 rounded text-xs font-semibold ${
                  tender.status === 'Completed' || tender.status === 'Ready'
                    ? 'bg-emerald-100 text-emerald-800'
                    : tender.status === 'At Risk'
                    ? 'bg-rose-100 text-rose-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {tender.status}
              </span>
              {bid?.gstSection && (
                <span className="text-[11px] font-medium bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-purple-500" /> AI Populated
                </span>
              )}
            </div>
            <h2 className="text-lg font-bold text-slate-900 truncate" title={tender.title}>
              {tender.title}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Client: <strong className="text-slate-700">{tender.authority}</strong> • Department:{' '}
              <strong className="text-slate-700">{tender.department}</strong> • State:{' '}
              <strong className="text-slate-700">{tender.state}</strong>
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {onEdit && (
              <button
                type="button"
                className="secondary-button text-xs py-1.5 px-3 flex items-center gap-1.5"
                onClick={() => {
                  onClose()
                  onEdit(tender)
                }}
              >
                <Pencil className="w-3.5 h-3.5" /> Edit Tender
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50">
          {/* 1. Six AI Auto-Fill Tender Fields Hero Section */}
          <div className="p-4 rounded-xl border border-purple-200 bg-gradient-to-br from-purple-50/60 via-white to-blue-50/50 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-purple-100 pb-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-600" />
                <h3 className="text-sm font-bold text-purple-950 uppercase tracking-wide">
                  Tender Fee, GST & Eligibility Details (AI Auto-Fill)
                </h3>
              </div>
              <span className="text-[11px] text-purple-700 bg-purple-100 font-semibold px-2 py-0.5 rounded-full">
                6 Key Fields
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Field 1: GST Section */}
              <div className="p-3 bg-white rounded-lg border border-purple-100 shadow-2xs">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Coins className="w-3.5 h-3.5 text-purple-600" /> GST Section
                  </span>
                  {bid?.gstSection && (
                    <button
                      onClick={() => copyToClipboard(bid.gstSection!, 'gst')}
                      className="text-[10px] text-slate-400 hover:text-purple-700 flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" /> {copiedKey === 'gst' ? 'Copied' : 'Copy'}
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-800 leading-relaxed font-medium bg-slate-50 p-2 rounded border border-slate-100 min-h-[48px]">
                  {bid?.gstSection || <span className="text-slate-400 italic">Not Found in Tender Document</span>}
                </p>
              </div>

              {/* Field 2: Tender Fee + GST */}
              <div className="p-3 bg-white rounded-lg border border-purple-100 shadow-2xs">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Wallet className="w-3.5 h-3.5 text-emerald-600" /> Tender Fee + GST (Total)
                  </span>
                  {bid?.tenderFeePlusGst && (
                    <button
                      onClick={() => copyToClipboard(bid.tenderFeePlusGst!, 'feegst')}
                      className="text-[10px] text-slate-400 hover:text-emerald-700 flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" /> {copiedKey === 'feegst' ? 'Copied' : 'Copy'}
                    </button>
                  )}
                </div>
                <div className="bg-emerald-50/70 p-2 rounded border border-emerald-100 min-h-[48px] flex flex-col justify-center">
                  <strong className="text-xs text-emerald-900 font-bold block">
                    {bid?.tenderFeePlusGst || (bid?.tenderFeePerPackage ? `₹ ${bid.tenderFeePerPackage}` : '—')}
                  </strong>
                  <span className="text-[10px] text-emerald-700 mt-0.5">
                    Base Tender Fee: <strong>{bid?.tenderFeePerPackage ? `₹ ${bid.tenderFeePerPackage}` : 'Not Specified'}</strong>
                  </span>
                </div>
              </div>

              {/* Field 3: Test Report Compliance */}
              <div className="p-3 bg-white rounded-lg border border-purple-100 shadow-2xs md:col-span-2">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <FileCheck2 className="w-3.5 h-3.5 text-blue-600" /> Test Report Compliance (3–5 lines summary)
                  </span>
                  {bid?.testReportCompliance && (
                    <button
                      onClick={() => copyToClipboard(bid.testReportCompliance!, 'testreport')}
                      className="text-[10px] text-slate-400 hover:text-blue-700 flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" /> {copiedKey === 'testreport' ? 'Copied' : 'Copy'}
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line bg-slate-50 p-2.5 rounded border border-slate-100">
                  {bid?.testReportCompliance || <span className="text-slate-400 italic">Not Found in Tender Document</span>}
                </p>
              </div>

              {/* Field 4: MAF Requirement */}
              <div className="p-3 bg-white rounded-lg border border-purple-100 shadow-2xs md:col-span-2">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" /> Manufacturer Authorization Form (MAF) Requirement
                  </span>
                  {bid?.mafRequirement && (
                    <button
                      onClick={() => copyToClipboard(bid.mafRequirement!, 'maf')}
                      className="text-[10px] text-slate-400 hover:text-indigo-700 flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" /> {copiedKey === 'maf' ? 'Copied' : 'Copy'}
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line bg-slate-50 p-2.5 rounded border border-slate-100">
                  {bid?.mafRequirement || <span className="text-slate-400 italic">Not Found in Tender Document</span>}
                </p>
              </div>

              {/* Field 5: Experience Filed (Exact Requirement) */}
              <div className="p-3 bg-white rounded-lg border border-purple-100 shadow-2xs md:col-span-2">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-amber-600" /> Experience Filed (Exact Requirement Preserved)
                  </span>
                  {bid?.experienceRequirement && (
                    <button
                      onClick={() => copyToClipboard(bid.experienceRequirement!, 'exp')}
                      className="text-[10px] text-slate-400 hover:text-amber-700 flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" /> {copiedKey === 'exp' ? 'Copied' : 'Copy'}
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line bg-amber-50/40 p-2.5 rounded border border-amber-100 font-mono text-[11px]">
                  {bid?.experienceRequirement || <span className="text-slate-400 italic">Not Found in Tender Document</span>}
                </p>
              </div>

              {/* Field 6: Turn Over (Turnover) */}
              <div className="p-3 bg-white rounded-lg border border-purple-100 shadow-2xs md:col-span-2">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <FileSpreadsheet className="w-3.5 h-3.5 text-teal-600" /> Turn Over (Turnover Requirement Preserved)
                  </span>
                  {bid?.turnoverRequirement && (
                    <button
                      onClick={() => copyToClipboard(bid.turnoverRequirement!, 'turnover')}
                      className="text-[10px] text-slate-400 hover:text-teal-700 flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" /> {copiedKey === 'turnover' ? 'Copied' : 'Copy'}
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line bg-teal-50/40 p-2.5 rounded border border-teal-100 font-mono text-[11px]">
                  {bid?.turnoverRequirement || <span className="text-slate-400 italic">Not Found in Tender Document</span>}
                </p>
              </div>
            </div>
          </div>

          {/* 2. Tender Overview & Issuing Authority */}
          <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
              <Building2 className="w-3.5 h-3.5 text-blue-600" /> Issuing Authority & Scope
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-400 block font-medium">Authority Full Name</span>
                <span className="text-slate-800 font-semibold">{bid?.authorityFullName || tender.authority}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Addressee Designation</span>
                <span className="text-slate-800">{bid?.addresseeDesignation || '—'}</span>
              </div>
              <div className="md:col-span-2">
                <span className="text-slate-400 block font-medium">Authority Address</span>
                <span className="text-slate-800">{bid?.authorityAddress || '—'}</span>
              </div>
              <div className="md:col-span-2">
                <span className="text-slate-400 block font-medium">Full Name / Scope of Work</span>
                <span className="text-slate-800">{bid?.workName || tender.title}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Short Name of Work</span>
                <span className="text-slate-800">{bid?.shortWorkName || '—'}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Dispute Jurisdiction</span>
                <span className="text-slate-800">{bid?.jurisdiction || '—'}</span>
              </div>
            </div>
          </div>

          {/* 3. Deadlines, Dates & Financial Criteria */}
          <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-blue-600" /> Timeline, Value & Financial Requirements
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-slate-400 block font-medium">Estimated Value</span>
                <span className="text-slate-800 font-bold">{tender.value || '—'}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Submission Due Date</span>
                <span className="text-slate-800 font-bold text-blue-700">{tender.due || '—'}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Bid Deadline Time</span>
                <span className="text-slate-800">{bid?.bidDeadlineTime || '—'}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Bid Validity</span>
                <span className="text-slate-800">{bid?.bidValidityDays ? `${bid.bidValidityDays} Days` : '—'}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">RfS / Tender No.</span>
                <span className="text-slate-800 font-mono">{bid?.rfsNo || '—'}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">RfS Date</span>
                <span className="text-slate-800">{bid?.rfsDate || '—'}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Financial Req (Cr)</span>
                <span className="text-slate-800">{bid?.financialRequirementCr ? `₹ ${bid.financialRequirementCr} Cr` : '—'}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Technical Requirement</span>
                <span className="text-slate-800">{bid?.technicalRequirement || '—'}</span>
              </div>
            </div>
          </div>

          {/* 4. Packages & Lots */}
          {bid?.packages && bid.packages.length > 0 && (
            <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-blue-600" /> Packages / Lots & EMD ({bid.packages.length})
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border border-slate-200 rounded-lg">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600">
                      <th className="py-2 px-3 text-left">Code</th>
                      <th className="py-2 px-3 text-left">Region / Area</th>
                      <th className="py-2 px-3 text-left">RFX No.</th>
                      <th className="py-2 px-3 text-right">EMD (Lakh)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {bid.packages.map((pkg, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="py-2 px-3 font-bold text-slate-900">{pkg.code}</td>
                        <td className="py-2 px-3 text-slate-700">{pkg.region || '—'}</td>
                        <td className="py-2 px-3 font-mono text-slate-600">{pkg.rfx || '—'}</td>
                        <td className="py-2 px-3 text-right font-bold text-emerald-700">
                          {pkg.emdLakh ? `₹ ${pkg.emdLakh} Lakh` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 5. Technical Components */}
          {bid?.technicalComponents && bid.technicalComponents.length > 0 && (
            <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                <Tag className="w-3.5 h-3.5 text-blue-600" /> Technical Components (Format-12 ({bid.technicalComponents.length}))
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border border-slate-200 rounded-lg">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600">
                      <th className="py-2 px-3 text-left">Item / Component</th>
                      <th className="py-2 px-3 text-left">Make(s) Proposed</th>
                      <th className="py-2 px-3 text-left">Compliance Standard</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {bid.technicalComponents.map((c, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="py-2 px-3 font-bold text-slate-900">{c.item}</td>
                        <td className="py-2 px-3 text-slate-700">{c.make || '—'}</td>
                        <td className="py-2 px-3 text-slate-600">{c.compliance || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 6. Beneficiary Bank Details */}
          {bid?.beneficiaryBank && (
            <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                <Building2 className="w-3.5 h-3.5 text-blue-600" /> Beneficiary Bank Account (EMD / BG)
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 block font-medium">Account Holder</span>
                  <span className="text-slate-800 font-semibold">{bid.beneficiaryBank.accountHolder || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Bank Name</span>
                  <span className="text-slate-800">{bid.beneficiaryBank.bankName || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Branch</span>
                  <span className="text-slate-800">{bid.beneficiaryBank.branch || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Account No.</span>
                  <span className="text-slate-800 font-mono">{bid.beneficiaryBank.accountNo || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">IFSC Code</span>
                  <span className="text-slate-800 font-mono font-bold text-blue-700">{bid.beneficiaryBank.ifsc || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Account Type</span>
                  <span className="text-slate-800">{bid.beneficiaryBank.accountType || '—'}</span>
                </div>
              </div>
            </div>
          )}

          {/* 7. Advanced Workflow Stages (Stages 8 - 11) */}
          {(tender.technicalOpenCheck || tender.financialOpenCheck || tender.negotiation || tender.workOrder) && (
            <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                <FileCheck2 className="w-3.5 h-3.5 text-blue-600" /> Advanced Workflow Stages (08 - 11)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                {/* Stage 8 */}
                <div className="p-2.5 rounded-lg border border-slate-100 bg-slate-50 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-700">8. Technical Open</span>
                    {tender.technicalOpenCheck?.status === 'Qualified' ? (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">Qualified</span>
                    ) : tender.technicalOpenCheck?.status ? (
                      <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">{tender.technicalOpenCheck.status}</span>
                    ) : (
                      <span className="text-slate-400 text-[10px]">Pending</span>
                    )}
                  </div>
                  <span className="text-[11px] text-slate-500 block truncate" title={`${tender.technicalOpenCheck?.openingDate ? `Open: ${tender.technicalOpenCheck.openingDate}` : ''}${tender.technicalOpenCheck?.evaluationDate ? ` • Eval: ${tender.technicalOpenCheck.evaluationDate}` : ''}`}>
                    {tender.technicalOpenCheck?.openingDate ? `Open: ${tender.technicalOpenCheck.openingDate}` : 'No date recorded'}
                    {tender.technicalOpenCheck?.evaluationDate ? ` • Eval: ${tender.technicalOpenCheck.evaluationDate}` : ''}
                  </span>
                </div>

                {/* Stage 9 */}
                <div className="p-2.5 rounded-lg border border-slate-100 bg-slate-50 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-700">9. Financial Open</span>
                    {tender.financialOpenCheck?.ranking ? (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">{tender.financialOpenCheck.ranking}</span>
                    ) : (
                      <span className="text-slate-400 text-[10px]">Pending</span>
                    )}
                  </div>
                  <span className="text-[11px] text-slate-500 block truncate" title={tender.financialOpenCheck?.l1Price}>
                    {tender.financialOpenCheck?.l1Price ? `L1: ${tender.financialOpenCheck.l1Price}` : 'Price pending'}
                  </span>
                </div>

                {/* Stage 10 */}
                <div className="p-2.5 rounded-lg border border-slate-100 bg-slate-50 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-700">10. Negotiation</span>
                    {tender.negotiation?.status ? (
                      <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-bold">{tender.negotiation.status}</span>
                    ) : (
                      <span className="text-slate-400 text-[10px]">Pending</span>
                    )}
                  </div>
                  <span className="text-[11px] text-slate-500 block truncate">
                    {tender.negotiation?.letterDoc ? `Letter: ${tender.negotiation.letterDoc.name}` : 'No letter attached'}
                  </span>
                </div>

                {/* Stage 11 */}
                <div className="p-2.5 rounded-lg border border-slate-100 bg-slate-50 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-700">11. Work Order</span>
                    {tender.workOrder?.workOrderNumber ? (
                      <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">Executed</span>
                    ) : (
                      <span className="text-slate-400 text-[10px]">Pending</span>
                    )}
                  </div>
                  <span className="text-[11px] text-slate-500 block truncate" title={tender.workOrder?.workOrderNumber}>
                    {tender.workOrder?.workOrderNumber || 'No WO issued'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* 8. Remarks & Audit Notes */}
          {tender.remarks && (
            <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-1.5 text-xs">
              <span className="text-slate-400 block font-medium">Stage Verification Notes & Remarks</span>
              <p className="text-slate-700 whitespace-pre-line">{tender.remarks}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-actions flex-shrink-0" style={{ borderTop: '1px solid #e2e8f0', padding: '14px 24px' }}>
          <button type="button" className="secondary-button" onClick={onClose}>
            Close
          </button>
          {onEdit && (
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                onClose()
                onEdit(tender)
              }}
            >
              <Pencil className="w-4 h-4" /> Edit Record
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
