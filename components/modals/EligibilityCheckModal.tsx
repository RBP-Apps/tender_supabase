'use client'

import React, { useState } from 'react'
import {
  Check,
  CheckCircle2,
  Download,
  Eye,
  FileCheck,
  FileText,
  Image as ImageIcon,
  Paperclip,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react'
import { EligibilityCheckData, EligibilityDocument, Tender } from '@/types/tender'
import { useTenders } from '@/context/TenderContext'
import { DocumentPreviewModal } from '@/components/common/DocumentPreviewModal'

interface EligibilityCheckModalProps {
  tender: Tender
  mode: 'verify' | 'view'
  onClose: () => void
  onComplete?: (updatedTender: Tender) => void
}

function formatBytes(bytes?: number) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getFileIcon(type?: string, name?: string) {
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
  return <Paperclip className="w-3.5 h-3.5 text-slate-500" />
}

interface FileUploadSlotProps {
  label: string
  sublabel: string
  required?: boolean
  file: EligibilityDocument | null
  onFileSelect: (file: EligibilityDocument | null) => void
  disabled?: boolean
  onPreview?: (file: EligibilityDocument) => void
}

function FileUploadSlot({
  label,
  sublabel,
  required = false,
  file,
  onFileSelect,
  disabled = false,
  onPreview,
}: FileUploadSlotProps) {
  const handleNativeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFile = e.target.files?.[0]
    if (!rawFile) return

    // Read small files as DataURL for offline preview/download if < 3MB
    if (rawFile.size < 3 * 1024 * 1024) {
      const reader = new FileReader()
      reader.onload = () => {
        onFileSelect({
          name: rawFile.name,
          size: rawFile.size,
          type: rawFile.type,
          uploadedAt: new Date().toISOString(),
          dataUrl: typeof reader.result === 'string' ? reader.result : undefined,
        })
      }
      reader.readAsDataURL(rawFile)
    } else {
      onFileSelect({
        name: rawFile.name,
        size: rawFile.size,
        type: rawFile.type,
        uploadedAt: new Date().toISOString(),
      })
    }
    e.target.value = ''
  }

  return (
    <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/60 hover:border-slate-300 transition-all">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div>
          <label className="text-xs font-bold text-slate-800 flex items-center gap-1">
            {label} {required && <span className="text-red-500">*</span>}
          </label>
          <p className="text-[11px] text-slate-500 mt-0.5">{sublabel}</p>
        </div>
      </div>

      {file ? (
        <div className="flex items-center justify-between p-2.5 bg-white border border-slate-200 rounded-lg text-xs mt-2">
          <div className="flex items-center gap-2 min-w-0">
            {getFileIcon(file.type, file.name)}
            <div className="min-w-0">
              <span
                className={`font-semibold block truncate max-w-[280px] ${file.dataUrl ? 'text-slate-800 hover:text-blue-700 cursor-pointer' : 'text-slate-800'}`}
                title={file.name}
                onClick={() => file.dataUrl && onPreview?.(file)}
              >
                {file.name}
              </span>
              <span className="text-[10px] text-slate-500">
                {formatBytes(file.size)} • {new Date(file.uploadedAt).toLocaleDateString()}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {file.dataUrl && (
              <>
                {onPreview && (
                  <button
                    type="button"
                    onClick={() => onPreview(file)}
                    className="text-[11px] text-blue-600 hover:text-blue-800 font-bold underline px-1 inline-flex items-center gap-0.5 cursor-pointer"
                    title="View Document"
                  >
                    <Eye className="w-3 h-3" /> View
                  </button>
                )}
                <a
                  href={file.dataUrl}
                  download={file.name}
                  className="text-[11px] text-slate-600 hover:text-slate-900 font-semibold underline px-1 inline-flex items-center gap-0.5"
                  target="_blank"
                  rel="noreferrer"
                  title="Download Document"
                >
                  <Download className="w-3 h-3" /> Download
                </a>
              </>
            )}
            {!disabled && (
              <button
                type="button"
                onClick={() => onFileSelect(null)}
                className="text-slate-400 hover:text-red-600 p-1 rounded"
                title="Remove file"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      ) : disabled ? (
        <p className="text-xs text-slate-400 italic py-2">No document attached.</p>
      ) : (
        <label className="mt-2 border-2 border-dashed border-slate-300 hover:border-blue-400 hover:bg-blue-50/40 rounded-lg p-3 flex items-center justify-center gap-2 cursor-pointer text-xs text-slate-600 font-medium transition-all group">
          <UploadCloud className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition-colors" />
          <span>Upload Document (PDF / Image / Word - All Files)</span>
          <input
            type="file"
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={handleNativeChange}
          />
        </label>
      )}
    </div>
  )
}

export function EligibilityCheckModal({
  tender,
  mode,
  onClose,
  onComplete,
}: EligibilityCheckModalProps) {
  const { companyDocs } = useTenders()
  const existing = tender.eligibilityCheck

  const [turnoverFile, setTurnoverFile] = useState<EligibilityDocument | null>(existing?.turnoverDoc || null)
  const [experienceFile, setExperienceFile] = useState<EligibilityDocument | null>(existing?.experienceDoc || null)
  const [vendorRegFile, setVendorRegFile] = useState<EligibilityDocument | null>(existing?.vendorRegDoc || null)
  const [otherFile, setOtherFile] = useState<EligibilityDocument | null>(existing?.otherDoc || null)
  const [remarks, setRemarks] = useState<string>(existing?.remarks || '')
  const [submitting, setSubmitting] = useState(false)
  const [previewDoc, setPreviewDoc] = useState<{
    name: string
    dataUrl?: string
    type?: string
    size?: number
  } | null>(null)

  const isViewOnly = mode === 'view'

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isViewOnly) {
      onClose()
      return
    }

    setSubmitting(true)
    const checkData: EligibilityCheckData = {
      turnoverDoc: turnoverFile,
      experienceDoc: experienceFile,
      vendorRegDoc: vendorRegFile,
      otherDoc: otherFile,
      remarks: remarks.trim(),
      completedAt: existing?.completedAt || new Date().toISOString(),
    }

    const updatedTender: Tender = {
      ...tender,
      stage: tender.stage === 'Eligibility Check' ? 'Sample Details' : tender.stage,
      status: tender.stage === 'Eligibility Check' ? 'In Progress' : tender.status,
      remarks: remarks.trim() || tender.remarks,
      eligibilityCheck: checkData,
    }

    if (onComplete) {
      onComplete(updatedTender)
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal modal-wide" style={{ maxWidth: '680px' }}>
        <div className="modal-head">
          <div>
            <p className="eyebrow">STAGE 01 • ELIGIBILITY VERIFICATION</p>
            <h2>
              {isViewOnly
                ? 'Eligibility Verification Details'
                : existing?.completedAt
                ? 'Edit Eligibility Documents'
                : 'Create Eligibility Documents'}
            </h2>
          </div>
          <button type="button" onClick={onClose} title="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="modal-record-pill border-b border-slate-100 pb-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <strong className="text-slate-900 text-sm">{tender.title}</strong>
              <span className="badge badge-slate text-[10px]">{tender.id}</span>
              {tender.bid?.rfsNo && (
                <span className="text-[11px] text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  RfS: {tender.bid.rfsNo}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              Authority: <span className="text-slate-700 font-medium">{tender.authority}</span>
              {tender.value ? ` • Estimated Value: ${tender.value}` : ''}
              {tender.bid?.financialRequirementCr ? ` • Financial Req: ₹ ${tender.bid.financialRequirementCr} Cr` : ''}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[calc(85vh-120px)] overflow-y-auto">
          {/* Status Banner */}
          {isViewOnly ? (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-900">
              <div className="flex items-center gap-2 font-semibold">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Eligibility Check Verified & Passed to Sample Details</span>
              </div>
              {existing?.completedAt && (
                <span className="text-[11px] text-emerald-700 font-normal">
                  Completed on {new Date(existing.completedAt).toLocaleDateString()}
                </span>
              )}
            </div>
          ) : (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-start gap-2.5 text-xs text-blue-900">
              <FileCheck className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <strong>Workflow Advancement Notice:</strong>
                <p className="text-blue-800/80 mt-0.5">
                  Uploading these verification documents will archive this tender in the <strong>Completed / History</strong> tab of Eligibility Check, and advance it into the <strong>Pending Action</strong> tab of <strong>Sample Details</strong> (Stage 02).
                </p>
              </div>
            </div>
          )}

          {/* 1. Turnover Document */}
          <div className="space-y-1.5">
            <FileUploadSlot
              label="1. Turnover Document"
              sublabel="Audited balance sheets, CA certified turnover certificate, or financial net-worth proof."
              file={turnoverFile}
              onFileSelect={setTurnoverFile}
              disabled={isViewOnly}
              onPreview={setPreviewDoc}
            />
            {!isViewOnly && !turnoverFile && companyDocs?.turnoverDoc && (
              <div className="flex items-center justify-between p-2 bg-blue-50/70 border border-blue-200 rounded-lg text-xs">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-semibold text-blue-900 truncate">
                    Settings Master Doc: {companyDocs.turnoverDoc.name}
                  </span>
                  {companyDocs.turnoverDoc.value && (
                    <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-bold">
                      {companyDocs.turnoverDoc.value}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setTurnoverFile(companyDocs.turnoverDoc!)}
                  className="primary-button text-[11px] py-1 px-2.5 bg-blue-600 hover:bg-blue-700 whitespace-nowrap ml-2"
                >
                  Use Company Doc
                </button>
              </div>
            )}
            {(tender.bid?.turnoverRequirement || tender.turnoverRequirement || tender.bid?.financialRequirementCr) && (
              <div className="px-3 py-2 bg-teal-50/70 border border-teal-200 rounded-lg text-[11px] text-teal-900 flex items-start gap-1.5">
                <span className="font-bold text-teal-800 whitespace-nowrap">Tender Turnover Requirement:</span>
                <span className="text-teal-950 font-medium leading-relaxed">
                  {tender.bid?.turnoverRequirement || tender.turnoverRequirement || `Financial Req: ₹ ${tender.bid?.financialRequirementCr} Cr`}
                </span>
              </div>
            )}
          </div>

          {/* 2. Experience / Completions */}
          <div className="space-y-1.5">
            <FileUploadSlot
              label="2. Experience / Work Completion Certificate"
              sublabel="Similar work orders, client completion letters, or past execution performance certificates."
              file={experienceFile}
              onFileSelect={setExperienceFile}
              disabled={isViewOnly}
              onPreview={setPreviewDoc}
            />
            {!isViewOnly && !experienceFile && companyDocs?.experienceDoc && (
              <div className="flex items-center justify-between p-2 bg-amber-50/70 border border-amber-200 rounded-lg text-xs">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-semibold text-amber-900 truncate">
                    Settings Master Doc: {companyDocs.experienceDoc.name}
                  </span>
                  {companyDocs.experienceDoc.value && (
                    <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold">
                      {companyDocs.experienceDoc.value}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setExperienceFile(companyDocs.experienceDoc!)}
                  className="primary-button text-[11px] py-1 px-2.5 bg-amber-600 hover:bg-amber-700 whitespace-nowrap ml-2"
                >
                  Use Company Doc
                </button>
              </div>
            )}
            {(tender.bid?.experienceRequirement || tender.experienceRequirement) && (
              <div className="px-3 py-2 bg-amber-50/70 border border-amber-200 rounded-lg text-[11px] text-amber-900 flex items-start gap-1.5">
                <span className="font-bold text-amber-800 whitespace-nowrap">Tender Experience Requirement:</span>
                <span className="text-amber-950 font-medium leading-relaxed">
                  {tender.bid?.experienceRequirement || tender.experienceRequirement}
                </span>
              </div>
            )}
          </div>

          {/* 3. Other Documents */}
          <FileUploadSlot
            label="3. Other Supporting Documents"
            sublabel="PAN, GST registration, MSME / Udyam certificate, joint venture deed, or affidavits."
            file={otherFile}
            onFileSelect={setOtherFile}
            disabled={isViewOnly}
            onPreview={setPreviewDoc}
          />

          {/* 4. Remarks */}
          <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/60 space-y-1.5">
            <label className="text-xs font-bold text-slate-800 block">
              4. Eligibility Remarks & Stage Notes
            </label>
            <p className="text-[11px] text-slate-500">
              Document verification notes, turnover calculations, committee remarks, or stage approvals.
            </p>
            {isViewOnly ? (
              <p className="text-xs text-slate-800 p-2.5 bg-white border border-slate-200 rounded-lg min-h-[50px] whitespace-pre-wrap">
                {remarks || 'No remarks entered.'}
              </p>
            ) : (
              <textarea
                value={remarks}
                onChange={e => setRemarks(e.target.value)}
                placeholder="Enter eligibility verification notes, compliance status, or approvals..."
                className="w-full border border-slate-300 rounded-lg p-2.5 text-xs text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-[70px]"
              />
            )}
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button type="button" onClick={onClose} className="secondary-button text-xs py-2 px-4">
              {isViewOnly ? 'Close' : 'Cancel'}
            </button>
            {!isViewOnly && (
              <button
                type="submit"
                disabled={submitting}
                className="primary-button text-xs py-2 px-4 bg-blue-600 hover:bg-blue-700 flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                {submitting
                  ? 'Saving…'
                  : existing?.completedAt
                  ? 'Update Eligibility Documents'
                  : 'Create Eligibility Documents'}
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Document Inspection Modal */}
      {previewDoc && (
        <DocumentPreviewModal
          document={previewDoc}
          onClose={() => setPreviewDoc(null)}
        />
      )}
    </div>
  )
}
