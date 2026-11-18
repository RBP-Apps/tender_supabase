'use client'

import React, { useEffect, useMemo, useState, useRef } from 'react'
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileCheck2,
  FileText,
  History,
  Image as ImageIcon,
  ListChecks,
  Loader2,
  Paperclip,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import {
  FieldRequirementAudit,
  SampleDetailsData,
  SampleDetailsHistoryEntry,
  SampleDocumentItem,
  SampleOtherDocumentRequirement,
  SampleRequirementsAudit,
  Tender,
} from '@/types/tender'
import {
  autoFetchSampleDetails,
  autoFetchSampleDetailsWithAI,
  AutoFetchResult,
  checkSampleRequirementsWithAI,
} from '@/lib/sample-details-autofetch'
import {
  downloadSampleDocx,
  generateSampleFieldContents,
  SampleFieldVerificationContent,
} from '@/lib/sample-details-docx'
import { DocumentPreviewModal } from '@/components/common/DocumentPreviewModal'

interface SampleDetailsModalProps {
  tender: Tender
  mode: 'edit' | 'history'
  onClose: () => void
  onComplete?: (updatedTender: Tender) => void
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
  return <Paperclip className="w-3.5 h-3.5 text-slate-500" />
}

export function getMasterStatusTone(audit?: FieldRequirementAudit) {
  if (!audit) return { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-700', badgeBg: 'bg-slate-500 text-white', label: '⚪ NOT AUDITED' }
  const status = (audit.masterStatus || audit.status || '').toUpperCase()
  if (status === 'MANDATORY' || status === 'REQUIRED') {
    return { bg: 'bg-rose-50/90', border: 'border-rose-300', text: 'text-rose-900', badgeBg: 'bg-rose-600 text-white', label: '🔴 MANDATORY' }
  }
  if (status === 'OPTIONAL') {
    return { bg: 'bg-blue-50/90', border: 'border-blue-300', text: 'text-blue-900', badgeBg: 'bg-blue-600 text-white', label: '🔵 OPTIONAL' }
  }
  if (status === 'NOT REQUIRED') {
    return { bg: 'bg-emerald-50/80', border: 'border-emerald-300', text: 'text-emerald-900', badgeBg: 'bg-emerald-600 text-white', label: '🟢 NOT REQUIRED' }
  }
  if (status === 'CONDITIONAL') {
    return { bg: 'bg-amber-50/90', border: 'border-amber-300', text: 'text-amber-900', badgeBg: 'bg-amber-500 text-white', label: '🟡 CONDITIONAL' }
  }
  if (status === 'MANUAL VERIFICATION REQUIRED' || status === 'UNCLEAR') {
    return { bg: 'bg-purple-50/90', border: 'border-purple-300', text: 'text-purple-900', badgeBg: 'bg-purple-600 text-white', label: '🟣 MANUAL VERIFICATION REQUIRED' }
  }
  return { bg: 'bg-slate-100/90', border: 'border-slate-300', text: 'text-slate-900', badgeBg: 'bg-slate-600 text-white', label: '⚪ DOCUMENT INCOMPLETE' }
}

export function renderMasterStatusBadge(audit?: FieldRequirementAudit) {
  if (!audit) return null
  const tone = getMasterStatusTone(audit)
  return (
    <span className={`px-2 py-0.5 rounded-md font-black text-[10px] uppercase tracking-wide shadow-2xs ${tone.badgeBg}`}>
      {tone.label}
    </span>
  )
}

export function renderVerificationStatusBadge(status?: string) {
  if (status === 'VERIFIED_FROM_DOCUMENT') {
    return (
      <span className="text-[9px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full flex items-center gap-1 shadow-2xs">
        🛡️ VERIFIED FROM DOCUMENT
      </span>
    )
  }
  if (status === 'NOT_AVAILABLE') {
    return (
      <span className="text-[9px] font-bold text-slate-700 bg-slate-100 border border-slate-300 px-2 py-0.5 rounded-full flex items-center gap-1">
        ⚠️ NOT AVAILABLE IN DOCUMENT
      </span>
    )
  }
  if (status === 'UNABLE_TO_VERIFY') {
    return (
      <span className="text-[9px] font-bold text-purple-800 bg-purple-100 border border-purple-300 px-2 py-0.5 rounded-full flex items-center gap-1">
        ❓ UNABLE TO VERIFY
      </span>
    )
  }
  return (
    <span className="text-[9px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full flex items-center gap-1">
      ⚠️ PARTIAL VERIFICATION
    </span>
  )
}

export function getChecklistRequirementBadge(req: string) {
  const r = req.toLowerCase()
  if (r === 'mandatory') {
    return (
      <span className="px-2 py-0.5 rounded font-black text-[10px] bg-rose-100 text-rose-800 border border-rose-300 uppercase tracking-wide">
        Mandatory
      </span>
    )
  }
  if (r === 'required') {
    return (
      <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-blue-100 text-blue-800 border border-blue-300 uppercase tracking-wide">
        Required
      </span>
    )
  }
  if (r.includes('dealer')) {
    return (
      <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-amber-100 text-amber-900 border border-amber-300">
        Dealer/Distributor ke liye
      </span>
    )
  }
  if (r.includes('manufacturer')) {
    return (
      <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-purple-100 text-purple-900 border border-purple-300">
        Manufacturer ke liye
      </span>
    )
  }
  return (
    <span className="px-2 py-0.5 rounded font-semibold text-[10px] bg-slate-100 text-slate-800 border border-slate-300">
      {req}
    </span>
  )
}

interface DocumentSlotProps {
  fieldNumber: number
  title: string
  description: string
  document: SampleDocumentItem | null
  candidates?: SampleDocumentItem[]
  suggestedHint?: string
  matchReason?: string
  disabled?: boolean
  onSelect: (doc: SampleDocumentItem | null) => void
  onPreview: (doc: SampleDocumentItem) => void
  verificationContent?: SampleFieldVerificationContent
  onDownloadWord?: () => void
  isDownloadingWord?: boolean
  customText?: string
  onCustomTextChange?: (text: string) => void
  onResetCustomText?: () => void
  isCustomized?: boolean
  requirementAudit?: FieldRequirementAudit
  isCheckingAudit?: boolean
  auditPercent?: number
}

function DocumentSlot({
  fieldNumber,
  title,
  description,
  document,
  candidates = [],
  suggestedHint,
  matchReason,
  disabled = false,
  onSelect,
  onPreview,
  verificationContent,
  onDownloadWord,
  isDownloadingWord = false,
  customText,
  onCustomTextChange,
  onResetCustomText,
  isCustomized = false,
  requirementAudit,
  isCheckingAudit = false,
  auditPercent = 0,
}: DocumentSlotProps) {
  const [showCandidatePicker, setShowCandidatePicker] = useState(false)
  const [isEditing, setIsEditing] = useState(false)

  const activeText = customText !== undefined ? customText : (verificationContent?.textContent || '')

  const reqMasterStatus = (requirementAudit?.masterStatus || requirementAudit?.status || '').toUpperCase()
  const isMandatory = reqMasterStatus === 'MANDATORY' || reqMasterStatus === 'REQUIRED'
  const isNotRequired = reqMasterStatus === 'NOT REQUIRED'
  const isConditional = reqMasterStatus === 'CONDITIONAL' || reqMasterStatus === 'OPTIONAL'
  const isUnclear = reqMasterStatus === 'UNCLEAR'
  const isIncomplete = reqMasterStatus === 'DOCUMENT INCOMPLETE'

  const isImage =
    document?.type?.startsWith('image/') ||
    document?.name?.toLowerCase().match(/\.(jpg|jpeg|png|webp|gif|bmp|svg)$/)

  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/70 hover:border-slate-300 transition-all space-y-3 shadow-2xs">
      {/* 1. Slot Header: Title, Master Status Badge, Bidder Fulfilment Badge */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-slate-900">
              {fieldNumber}. {title}
            </span>

            {/* AI Master Requirement Status Badge */}
            {isCheckingAudit ? (
              <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full flex items-center gap-1.5 shadow-2xs">
                <Sparkles className="w-2.5 h-2.5 text-blue-600 animate-pulse" /> AI Reading PDF ({auditPercent > 0 ? `${auditPercent}%` : '15%'})
              </span>
            ) : requirementAudit ? (
              renderMasterStatusBadge(requirementAudit)
            ) : null}

            {/* Bidder Document Fulfilment / Draft Status Badge */}
            {isNotRequired ? (
              document ? (
                <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-2xs">
                  <Check className="w-3 h-3 text-emerald-700" /> Source File Linked (Not Required)
                </span>
              ) : (
                <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-2xs">
                  🟢 Not Required by Tender
                </span>
              )
            ) : isMandatory ? (
              document ? (
                <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-2xs">
                  <Check className="w-3 h-3 text-emerald-700" /> Attached & Verified
                </span>
              ) : verificationContent ? (
                <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-2xs">
                  <Sparkles className="w-3 h-3 text-blue-600" /> AI Draft Generated (.docx)
                </span>
              ) : (
                <span className="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-2xs">
                  <AlertCircle className="w-3 h-3 text-rose-600" /> Submission Mandatory
                </span>
              )
            ) : isConditional ? (
              document ? (
                <span className="text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-2xs">
                  <Check className="w-3 h-3 text-amber-700" /> Source File Linked (Conditional)
                </span>
              ) : verificationContent ? (
                <span className="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-300 px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-2xs">
                  <AlertCircle className="w-3 h-3 text-amber-600" /> Subject to Tender Condition
                </span>
              ) : (
                <span className="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-300 px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-2xs">
                  <AlertCircle className="w-3 h-3 text-amber-600" /> Conditional Submission
                </span>
              )
            ) : isUnclear ? (
              <span className="text-[10px] font-bold text-purple-800 bg-purple-50 border border-purple-200 px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-2xs">
                <AlertCircle className="w-3 h-3 text-purple-600" /> Manual Verification Required
              </span>
            ) : isIncomplete ? (
              <span className="text-[10px] font-bold text-slate-700 bg-slate-100 border border-slate-300 px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-2xs">
                ⚪ Document Incomplete / Scanned
              </span>
            ) : document ? (
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Check className="w-3 h-3 text-emerald-600" /> Source File Linked
              </span>
            ) : (
              <span className="text-[10px] font-medium text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                Awaiting PDF Audit
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">{description}</p>

          {suggestedHint && (
            <p className="text-[11px] text-indigo-700 bg-indigo-50/80 border border-indigo-100 rounded px-2 py-0.5 mt-1 inline-block">
              💡 {suggestedHint}
            </p>
          )}

          {document?.matchReason && (
            <p className="text-[11px] text-emerald-800 bg-emerald-50/70 border border-emerald-100 rounded px-2 py-0.5 mt-1 block">
              ✔ {document.matchReason}
            </p>
          )}
        </div>

        {candidates.length > 1 && !disabled && (
          <button
            type="button"
            onClick={() => setShowCandidatePicker(prev => !prev)}
            className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold underline flex items-center gap-1 flex-shrink-0"
          >
            <RefreshCw className="w-3 h-3" /> Switch Candidate ({candidates.length})
          </button>
        )}
      </div>

      {/* 2. Requirement Analysis Card (AI Evidence-Based Audit) */}
      {isCheckingAudit ? (
        <div className="rounded-xl p-3.5 border border-blue-200 bg-blue-50/70 text-xs space-y-2 transition-all shadow-2xs animate-pulse">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-blue-600 animate-pulse" />
              <span className="text-slate-900 font-extrabold text-xs">
                AI Reading Tender PDF for {title}...
              </span>
            </div>
            <span className="text-[11px] font-mono font-bold text-blue-700 bg-white px-2 py-0.5 rounded-full border border-blue-300">
              {auditPercent > 0 ? `${auditPercent}%` : '15%'}
            </span>
          </div>
          <div className="w-full bg-blue-200/80 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${Math.max(10, Math.min(100, auditPercent || 15))}%` }}
            />
          </div>
          <p className="text-[10px] text-slate-500">
            Scanning 51 pages of original tender document for clauses, testing standards, and requirement evidence...
          </p>
        </div>
      ) : requirementAudit ? (
        <div
          className={`rounded-xl p-4 border text-xs space-y-3 transition-all shadow-2xs ${
            getMasterStatusTone(requirementAudit).bg
          } ${getMasterStatusTone(requirementAudit).border}`}
        >
          {/* Header Row: Title, Status Badge, Source File, Page & Clause */}
          <div className="flex items-center justify-between gap-2 flex-wrap pb-2 border-b border-slate-200/80">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-base leading-none">📋</span>
              <span className="text-slate-900 font-extrabold text-sm">
                Requirement Analysis: {title}
              </span>
              {renderMasterStatusBadge(requirementAudit)}
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/95 border border-slate-200 text-slate-700">
                Source: {requirementAudit.documentName || 'Tender document'}
              </span>
              {requirementAudit.pageNumber && requirementAudit.pageNumber !== 'Not Available' && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100/90 border border-blue-200 text-blue-900 flex items-center gap-1 shadow-2xs">
                  📄 {requirementAudit.pageNumber}
                </span>
              )}
              {requirementAudit.clauseOrSection && requirementAudit.clauseOrSection !== 'Not Specified in Tender Document' && (
                <span
                  className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/95 border border-slate-200 text-slate-800 truncate max-w-[280px]"
                  title={requirementAudit.clauseOrSection}
                >
                  {requirementAudit.clauseOrSection}
                </span>
              )}
            </div>
          </div>

          {/* Exact Original Tender PDF Quotation (Open & Grounded) */}
          {requirementAudit.originalDocumentEvidence && (
            <div className="p-3 rounded-lg bg-white border border-slate-200/90 shadow-2xs space-y-1.5">
              <div className="flex items-center justify-between gap-2 flex-wrap text-[11px] font-bold text-slate-700">
                <div className="flex items-center gap-1.5 text-blue-900 font-extrabold uppercase tracking-wide text-[10px]">
                  <span>📜 Exact Original Tender PDF Quotation</span>
                  {requirementAudit.pageNumber && requirementAudit.pageNumber !== 'Not Available' && (
                    <span className="text-slate-500 font-semibold lowercase">({requirementAudit.pageNumber})</span>
                  )}
                </div>
                {renderVerificationStatusBadge(requirementAudit.verificationStatus)}
              </div>
              <div className="p-2.5 rounded bg-slate-50/80 border-l-4 border-l-blue-600 font-serif text-xs text-slate-900 italic leading-relaxed">
                {requirementAudit.originalDocumentEvidence}
              </div>
            </div>
          )}

          {/* Reference & AI Explanation */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
              <span className="text-blue-600 font-bold">💡 AI Explanation:</span>
              <span className="font-semibold text-slate-800">
                {requirementAudit.clauseOrSection
                  ? `Tender ke ${requirementAudit.clauseOrSection}${
                      requirementAudit.pageNumber && !requirementAudit.clauseOrSection.toLowerCase().includes('page')
                        ? `, ${requirementAudit.pageNumber}`
                        : ''
                    } ke according:`
                  : 'Tender requirements ke according:'}
              </span>
            </div>

            {/* Bullet Points List */}
            {requirementAudit.bulletPoints && requirementAudit.bulletPoints.length > 0 ? (
              <ul className="space-y-1.5 pl-1.5">
                {requirementAudit.bulletPoints.map((point, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-xs text-slate-800 leading-relaxed">
                    <span className="text-blue-600 font-black text-sm leading-none mt-0.5">•</span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            ) : requirementAudit.detailedExplanation ? (
              <div className="text-xs text-slate-700 leading-relaxed pl-1.5">
                <span>{requirementAudit.detailedExplanation}</span>
              </div>
            ) : null}
          </div>

          {/* Corrigendum Update Alert (e.g. NOTICE 2, Page 2 revise inspection schedule) */}
          {requirementAudit.corrigendumNote && (
            <div className="p-3 rounded-lg bg-purple-50/90 border border-purple-200 text-purple-950 text-xs space-y-1.5 shadow-2xs">
              <div className="font-extrabold flex items-center gap-1.5 text-purple-900 text-[11px] uppercase tracking-wide">
                <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                <span>Corrigendum Update</span>
              </div>
              <div className="whitespace-pre-line leading-relaxed text-[11px] font-medium pl-1">
                {requirementAudit.corrigendumNote}
              </div>
            </div>
          )}

          {/* Page 23 / Applicable Standards Tags */}
          {requirementAudit.applicableStandards && requirementAudit.applicableStandards.length > 0 && (
            <div className="p-2.5 rounded-lg bg-white/80 border border-slate-200 space-y-1.5 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-700 block">
                Page 23 par BIS/IEC standards bhi specify kiye gaye hain:
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {requirementAudit.applicableStandards.map((std, idx) => (
                  <span
                    key={idx}
                    className="px-2.5 py-1 rounded bg-slate-50 font-mono text-[11px] font-bold text-slate-800 border border-slate-300 shadow-2xs"
                  >
                    • {std}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Important Notes Alert Box */}
          {requirementAudit.importantNotes && requirementAudit.importantNotes.length > 0 && (
            <div className="p-2.5 rounded-lg bg-amber-50/90 border border-amber-300 text-amber-950 text-xs shadow-2xs space-y-1">
              {requirementAudit.importantNotes.map((note, idx) => (
                <div key={idx} className="flex items-start gap-2 font-semibold">
                  <AlertCircle className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
                  <span className="leading-snug">{note}</span>
                </div>
              ))}
            </div>
          )}

          {/* Required Document Summary */}
          {requirementAudit.requiredDocumentSummary && (
            <div className="p-2.5 rounded-lg bg-blue-50/70 border border-blue-200 flex items-center gap-2 text-xs font-bold text-blue-950">
              <span className="text-blue-700 font-extrabold flex items-center gap-1">
                📌 Required document / physical item:
              </span>
              <span className="text-slate-900 bg-white px-2 py-0.5 rounded border border-blue-200">
                {requirementAudit.requiredDocumentSummary}
              </span>
            </div>
          )}
        </div>
      ) : null}

      {/* Candidate picker list if multiple exist */}
      {showCandidatePicker && candidates.length > 1 && !disabled && (
        <div className="p-2.5 bg-blue-50/80 border border-blue-200 rounded-lg space-y-1.5 animate-in fade-in duration-100">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold text-blue-900">
              Multiple matching documents detected by AI. Select preferred document:
            </p>
            <button
              type="button"
              onClick={() => setShowCandidatePicker(false)}
              className="text-[10px] text-slate-400 hover:text-slate-600"
            >
              Close
            </button>
          </div>
          {candidates.map((cand, idx) => (
            <div
              key={cand.id || idx}
              onClick={() => {
                onSelect(cand)
                setShowCandidatePicker(false)
              }}
              className="flex items-center justify-between p-2 bg-white rounded-md border border-blue-100 hover:border-blue-400 hover:shadow-xs cursor-pointer text-xs transition-all"
            >
              <div className="flex items-center gap-2 truncate">
                {getFileBadge(cand.name, cand.type)}
                <span className="truncate font-semibold text-slate-800">{cand.name}</span>
                {cand.matchReason ? (
                  <span className="text-[10px] text-slate-500 truncate">({cand.matchReason})</span>
                ) : cand.referenceNote ? (
                  <span className="text-[10px] text-slate-500 truncate">({cand.referenceNote})</span>
                ) : null}
              </div>
              <span className="text-[10px] text-blue-700 bg-blue-50 font-bold px-2 py-0.5 rounded border border-blue-200 flex-shrink-0">
                Choose
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 3. Actual Uploaded Supporting Document Section */}
      {document ? (
        <div className="p-3 bg-white border border-slate-200 rounded-xl text-xs space-y-2 shadow-2xs">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              {isImage && document.dataUrl ? (
                <div
                  onClick={() => onPreview(document)}
                  className="w-10 h-10 rounded-lg border border-slate-200 overflow-hidden bg-slate-100 flex-shrink-0 cursor-pointer hover:opacity-85 relative group"
                  title="Click to preview image"
                >
                  <img src={document.dataUrl} alt={document.name} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-slate-900/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Eye className="w-3.5 h-3.5 text-white" />
                  </div>
                </div>
              ) : (
                <div className="flex-shrink-0">
                  {getFileBadge(document.name, document.type)}
                </div>
              )}

              <div className="min-w-0">
                <span
                  className="font-bold text-slate-900 block truncate max-w-[280px] hover:text-blue-700 cursor-pointer"
                  title={document.name}
                  onClick={() => onPreview(document)}
                >
                  {document.name}
                </span>
                <span className="text-[10px] text-slate-500 block truncate">
                  {formatBytes(document.size)} • {new Date(document.uploadedAt).toLocaleDateString()}
                  {document.referenceNote ? ` • ${document.referenceNote}` : ''}
                </span>
              </div>
            </div>

            {/* Document Actions: Preview, Download, Replace, Remove */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                type="button"
                onClick={() => onPreview(document)}
                className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors"
                title="Inspect / Preview Document"
              >
                <Eye className="w-3 h-3" /> Preview Original
              </button>

              {document.dataUrl && (
                <a
                  href={document.dataUrl}
                  download={document.name}
                  className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md text-slate-600 hover:text-blue-700 hover:bg-slate-100 transition-colors"
                  target="_blank"
                  rel="noreferrer"
                  title="Download File"
                >
                  <Download className="w-3 h-3" />
                </a>
              )}

            </div>
          </div>
        </div>
      ) : isNotRequired ? (
        <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span className="font-semibold text-emerald-950">
              Not Required by Tender Document: No submission required for bid qualification.
            </span>
          </div>
        </div>
      ) : null}

      {/* 4. AI-Generated Draft Bidder Undertaking / Word Document (.docx) */}
      {verificationContent && (
        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs space-y-0">
          <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600" />
              <span className="text-xs font-bold text-slate-900">
                Draft Bidder Undertaking / Template (Word .docx)
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200">
                Editable Template
              </span>
            </div>

            <div className="flex items-center gap-2">
              {!disabled && onCustomTextChange && (
                <button
                  type="button"
                  onClick={() => setIsEditing(prev => !prev)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all shadow-2xs cursor-pointer ${isEditing
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700'
                      : 'bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 hover:border-blue-400'
                    }`}
                  title={isEditing ? 'Done editing this document' : 'Click to edit the template text'}
                >
                  {isEditing ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Done Editing</span>
                    </>
                  ) : (
                    <>
                      <Pencil className="w-3 h-3" />
                      <span>Edit Template</span>
                    </>
                  )}
                </button>
              )}

              {isEditing && onResetCustomText && isCustomized && (
                <button
                  type="button"
                  onClick={() => {
                    onResetCustomText()
                    setIsEditing(false)
                  }}
                  className="text-[11px] text-slate-500 hover:text-red-600 font-medium px-2 py-0.5 hover:bg-red-50 rounded"
                  title="Reset text back to default template"
                >
                  Reset Default
                </button>
              )}

              {onDownloadWord && (
                <button
                  type="button"
                  onClick={onDownloadWord}
                  disabled={!verificationContent?.textContent || isDownloadingWord}
                  className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-lg border transition-all ${verificationContent?.textContent
                      ? 'bg-blue-600 text-white hover:bg-blue-700 border-blue-700 shadow-xs cursor-pointer active:scale-98'
                      : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-60'
                    }`}
                >
                  {isDownloadingWord ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  <span>Download Word</span>
                  <span className="text-[9px] uppercase px-1 py-0.2 rounded bg-black/20 text-white/90">
                    .docx
                  </span>
                </button>
              )}
            </div>
          </div>

          <div className="px-3.5 py-1.5 bg-blue-50/50 border-b border-blue-100 text-[10px] text-blue-900 flex items-center justify-between">
            <span>
              ℹ️ <strong>Notice:</strong> This is an AI-generated draft template for bidder convenience. It does not replace an official certificate or lab test report.
            </span>
            {isCustomized && (
              <span className="font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-200">
                ✏️ Customized by User
              </span>
            )}
          </div>

          {isEditing ? (
            <div className="p-3 bg-amber-50/30 space-y-2">
              <textarea
                value={activeText}
                onChange={e => onCustomTextChange?.(e.target.value)}
                rows={8}
                className="w-full p-3 font-mono text-xs text-slate-800 bg-white border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 leading-relaxed shadow-inner"
                placeholder={`Type or customize ${title} content here...`}
              />
              <div className="flex items-center justify-between pt-1">
                <p className="text-[10px] text-slate-500">
                  💡 Changes will be included in Word (.docx) download and saved upon submission.
                </p>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-md shadow-xs flex items-center gap-1 cursor-pointer"
                >
                  <Check className="w-3 h-3" /> Done
                </button>
              </div>
            </div>
          ) : (
            <div
              onClick={() => {
                if (!disabled && onCustomTextChange) setIsEditing(true)
              }}
              className="p-3 bg-white max-h-44 overflow-y-auto text-xs font-mono text-slate-700 leading-relaxed whitespace-pre-wrap select-text group relative cursor-pointer hover:bg-slate-50/70 transition-colors"
              title={!disabled ? 'Click to edit text' : undefined}
            >
              {activeText}
              {!disabled && onCustomTextChange && (
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  <span className="px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-700 text-[10px] font-bold flex items-center gap-1 shadow-2xs">
                    <Pencil className="w-2.5 h-2.5" /> Click to Edit
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function SampleDetailsModal({
  tender,
  mode,
  onClose,
  onComplete,
}: SampleDetailsModalProps) {
  const existing = tender.sampleDetails

  // No substitute document: showing another tender's PDF as "this tender's NIT"
  // made users (and the AI) read the wrong tender.
  const effectiveTenderDoc: SampleDocumentItem | null = tender.tenderDoc || null

  const [mafLetter, setMafLetter] = useState<SampleDocumentItem | null>(existing?.mafLetter || null)
  const [testReport, setTestReport] = useState<SampleDocumentItem | null>(existing?.testReport || null)
  const [bisCertificate, setBisCertificate] = useState<SampleDocumentItem | null>(existing?.bisCertificate || null)
  const [productSample, setProductSample] = useState<SampleDocumentItem | null>(existing?.productSample || null)
  const [otherDocs, setOtherDocs] = useState<SampleDocumentItem[]>(existing?.otherDocs || [])
  const [remarks, setRemarks] = useState<string>(existing?.remarks || '')
  const [submitting, setSubmitting] = useState(false)
  const [loadingAI, setLoadingAI] = useState(false)
  const [autoFetchData, setAutoFetchData] = useState<AutoFetchResult | null>(null)
  const [editHistoryActive, setEditHistoryActive] = useState(mode === 'history')
  const [previewDoc, setPreviewDoc] = useState<SampleDocumentItem | null>(null)
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null)

  // AI Tender Requirements Audit state
  const [requirementsAudit, setRequirementsAudit] = useState<SampleRequirementsAudit | null>(
    existing?.aiRequirementsAudit || null
  )
  const [isAuditing, setIsAuditing] = useState(false)
  const [auditProgress, setAuditProgress] = useState<string>('')
  const [auditPercent, setAuditPercent] = useState<number>(0)
  const auditTimerRef = useRef<NodeJS.Timeout | null>(null)

  const startProgressClimb = (
    timerRef: React.MutableRefObject<NodeJS.Timeout | null>,
    setPercent: React.Dispatch<React.SetStateAction<number>>,
    initial = 18,
    maxWait = 98,
    intervalMs = 600
  ) => {
    if (timerRef.current) clearInterval(timerRef.current)
    setPercent(initial)
    timerRef.current = setInterval(() => {
      setPercent(prev => {
        if (prev < 45) return prev + Math.floor(Math.random() * 4 + 3)
        if (prev < 75) return prev + Math.floor(Math.random() * 3 + 2)
        if (prev < 90) return prev + Math.floor(Math.random() * 2 + 1)
        if (prev < maxWait) return prev + (Math.random() > 0.5 ? 1 : 0)
        return prev
      })
    }, intervalMs)
  }

  const completeProgress = async (
    timerRef: React.MutableRefObject<NodeJS.Timeout | null>,
    setPercent: React.Dispatch<React.SetStateAction<number>>
  ) => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    setPercent(100)
    await new Promise(r => setTimeout(r, 750))
  }

  const isAuditFailedOrUnverified = (audit: SampleRequirementsAudit | null | undefined): boolean => {
    if (!audit) return true
    if (audit.verificationQuality === 'UNABLE_TO_VERIFY') return true
    const tr = audit.testReport
    if (
      !tr ||
      tr.verificationStatus === 'UNABLE_TO_VERIFY' ||
      tr.clauseOrSection?.toLowerCase().includes('no original tender pdf') ||
      tr.finalAnswer?.toLowerCase().includes('no original tender pdf') ||
      tr.detailedExplanation?.toLowerCase().includes('no original tender pdf')
    ) {
      return true
    }
    return false
  }

  const runRequirementAudit = async () => {
    setIsAuditing(true)
    startProgressClimb(auditTimerRef, setAuditPercent, 18, 98, 600)
    setAuditProgress('Reading Complete Tender PDF...')
    try {
      const audit = await checkSampleRequirementsWithAI(tender, msg => {
        setAuditProgress(msg)
        const match = msg.match(/(\d+)\/(\d+)\s+pages/i)
        if (match) {
          const current = parseInt(match[1], 10)
          const total = parseInt(match[2], 10)
          if (total > 0) {
            const calculated = Math.min(98, Math.round((current / total) * 88) + 10)
            setAuditPercent(prev => Math.max(prev, calculated))
          }
        }
      })
      await completeProgress(auditTimerRef, setAuditPercent)
      setRequirementsAudit(audit)

      // Automatically sync valid evidence-based audit to database
      if (tender?.id && audit && audit.verificationQuality !== 'UNABLE_TO_VERIFY') {
        const { saveTenderToSupabase } = await import('@/lib/supabase-service')
        saveTenderToSupabase({
          ...tender,
          sampleDetails: {
            ...(tender.sampleDetails || {}),
            aiRequirementsAudit: audit,
          },
        }).catch((e: any) => console.warn('Background sync of requirements audit to Supabase:', e))
      }
    } catch (err) {
      console.warn('Error running AI requirement audit:', err)
      if (auditTimerRef.current) clearInterval(auditTimerRef.current)
      setAuditPercent(0)
    } finally {
      setIsAuditing(false)
    }
  }

  useEffect(() => {
    return () => {
      if (auditTimerRef.current) clearInterval(auditTimerRef.current)
    }
  }, [])

  // Automatically generate text verification contents for all 4 fields
  const verifiedContents = useMemo(
    () => generateSampleFieldContents(tender, autoFetchData, requirementsAudit),
    [tender, autoFetchData, requirementsAudit]
  )

  // Detect whether existing stored MAF text used the old/legacy template format
  const isLegacyMaf = !!(
    existing?.mafLetter?.textContent &&
    (existing.mafLetter.textContent.includes('ROTOMAG') ||
      existing.mafLetter.textContent.includes('Rotomag') ||
      existing.mafLetter.textContent.includes('Vitthal Udyognagar') ||
      !existing.mafLetter.textContent.includes('RBP Energy') ||
      !existing.mafLetter.textContent.includes('To be issued on the Manufacturer’s Letterhead'))
  )

  // Editable text states for all 4 verification fields
  const [mafText, setMafText] = useState<string>(
    !isLegacyMaf && existing?.mafLetter?.textContent
      ? existing.mafLetter.textContent
      : verifiedContents.mafLetter.textContent
  )
  const [testReportText, setTestReportText] = useState<string>(
    existing?.testReport?.textContent || verifiedContents.testReport.textContent
  )
  const [bisCertificateText, setBisCertificateText] = useState<string>(
    existing?.bisCertificate?.textContent || verifiedContents.bisCertificate.textContent
  )
  const [productSampleText, setProductSampleText] = useState<string>(
    existing?.productSample?.textContent || verifiedContents.productSample.textContent
  )

  const [mafEdited, setMafEdited] = useState(!isLegacyMaf && !!existing?.mafLetter?.textContent)
  const [testReportEdited, setTestReportEdited] = useState(!!existing?.testReport?.textContent)
  const [bisEdited, setBisEdited] = useState(!!existing?.bisCertificate?.textContent)
  const [sampleEdited, setSampleEdited] = useState(!!existing?.productSample?.textContent)

  // Sync if pristine (or legacy format) and auto-fetch/verified content updates
  useEffect(() => {
    if ((!mafEdited || isLegacyMaf) && verifiedContents.mafLetter.textContent) {
      setMafText(verifiedContents.mafLetter.textContent)
    }
  }, [verifiedContents.mafLetter.textContent, mafEdited, isLegacyMaf])

  useEffect(() => {
    if (!testReportEdited && verifiedContents.testReport.textContent) {
      setTestReportText(verifiedContents.testReport.textContent)
    }
  }, [verifiedContents.testReport.textContent, testReportEdited])

  useEffect(() => {
    if (!bisEdited && verifiedContents.bisCertificate.textContent) {
      setBisCertificateText(verifiedContents.bisCertificate.textContent)
    }
  }, [verifiedContents.bisCertificate.textContent, bisEdited])

  useEffect(() => {
    if (!sampleEdited && verifiedContents.productSample.textContent) {
      setProductSampleText(verifiedContents.productSample.textContent)
    }
  }, [verifiedContents.productSample.textContent, sampleEdited])

  const handleDownloadWord = async (
    content: SampleFieldVerificationContent,
    customTextValue?: string
  ) => {
    if (!content.found) return
    setDownloadingKey(content.key)
    try {
      await downloadSampleDocx(content, tender, customTextValue)
    } catch (err) {
      console.error('Word download error:', err)
    } finally {
      setDownloadingKey(null)
    }
  }

  // AI-Based Auto-Fetch Execution
  useEffect(() => {
    // 1. Instant local heuristic matching
    const localResult = autoFetchSampleDetails(tender)
    setAutoFetchData(localResult)

    if (!existing?.completedAt) {
      if (!mafLetter && localResult.mafLetter) setMafLetter(localResult.mafLetter)
      if (!testReport && localResult.testReport) setTestReport(localResult.testReport)
      if (!bisCertificate && localResult.bisCertificate) setBisCertificate(localResult.bisCertificate)
      if (!productSample && localResult.productSample) setProductSample(localResult.productSample)
      if (otherDocs.length === 0 && localResult.otherDocs.length > 0) setOtherDocs(localResult.otherDocs)
    }

    // 2. Background AI enhancement
    setLoadingAI(true)
    autoFetchSampleDetailsWithAI(tender)
      .then(aiResult => {
        setAutoFetchData(aiResult)
        if (!existing?.completedAt) {
          if (!mafLetter && aiResult.mafLetter) setMafLetter(aiResult.mafLetter)
          if (!testReport && aiResult.testReport) setTestReport(aiResult.testReport)
          if (!bisCertificate && aiResult.bisCertificate) setBisCertificate(aiResult.bisCertificate)
          if (!productSample && aiResult.productSample) setProductSample(aiResult.productSample)
        }
      })
      .finally(() => {
        setLoadingAI(false)
      })

    // 3. AI Tender Document Requirement Audit (Test Report & BIS Certificate requirement check)
    if (!existing?.aiRequirementsAudit || isAuditFailedOrUnverified(existing?.aiRequirementsAudit)) {
      runRequirementAudit()
    }
  }, [tender])

  const handleRemoveOtherDoc = (id: string) => {
    setOtherDocs(prev => prev.filter(d => d.id !== id))
  }

  const checklistDocs = useMemo<SampleOtherDocumentRequirement[]>(() => {
    // Only items extracted from THIS tender's document (no static checklist from another tender)
    return requirementsAudit?.otherDocuments || []
  }, [requirementsAudit?.otherDocuments])

  const handleUploadOtherDoc = (e: React.ChangeEvent<HTMLInputElement>, targetDocName?: string) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      const newDoc: SampleDocumentItem = {
        id: `other-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        uploadedAt: new Date().toISOString(),
        dataUrl: reader.result as string,
        source: 'manual-upload',
        referenceNote: targetDocName ? `Checklist: ${targetDocName}` : 'Uploaded Supporting Document',
      }
      setOtherDocs(prev => [...prev, newDoc])
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const getAttachedForChecklist = (docName: string): SampleDocumentItem | undefined => {
    const lower = docName.toLowerCase()
    // 1. Check user-uploaded or auto-fetched otherDocs
    const foundInOther = otherDocs.find(d => {
      const dRef = (d.referenceNote || '').toLowerCase()
      const dName = (d.name || '').toLowerCase()
      if (dRef.includes(lower)) return true
      if (lower.includes('pan') && (dRef.includes('pan') || dName.includes('pan'))) return true
      if (lower.includes('gst') && (dRef.includes('gst') || dName.includes('gst'))) return true
      if (lower.includes('undertaking') && (dRef.includes('undertaking') || dName.includes('undertaking'))) return true
      if (lower.includes('blacklisting') && (dRef.includes('blacklisting') || dName.includes('blacklisting'))) return true
      if (lower.includes('conflict of interest') && (dRef.includes('conflict') || dName.includes('conflict'))) return true
      if (lower.includes('vendor registration') && (dRef.includes('vendor') || dName.includes('vendor'))) return true
      if (lower.includes('net worth') && (dRef.includes('net worth') || dName.includes('net worth') || dName.includes('networth'))) return true
      if (lower.includes('turnover') && (dRef.includes('turnover') || dName.includes('turnover'))) return true
      if (lower.includes('itr') && (dRef.includes('itr') || dName.includes('itr') || dRef.includes('income tax'))) return true
      if (lower.includes('supply completion') && (dRef.includes('completion') || dName.includes('completion') || dName.includes('work order'))) return true
      if (lower.includes('oem certificate') && (dRef.includes('oem') || dName.includes('oem'))) return true
      if ((lower.includes('datasheet') || lower.includes('data sheet')) && (dRef.includes('datasheet') || dName.includes('datasheet'))) return true
      if (lower.includes('same make') && (dRef.includes('same make') || dName.includes('make declaration'))) return true
      if (lower.includes('manufacturing unit') && (dRef.includes('manufacturing') || dName.includes('factory'))) return true
      return false
    })
    if (foundInOther) return foundInOther

    // 2. Check main tender files from earlier stages
    if (effectiveTenderDoc && (lower.includes('signed & stamped tender document') || lower.includes('signed tender'))) {
      return {
        id: effectiveTenderDoc.id || 'tender-doc',
        name: effectiveTenderDoc.name,
        type: effectiveTenderDoc.type,
        size: effectiveTenderDoc.size,
        uploadedAt: effectiveTenderDoc.uploadedAt || new Date().toISOString(),
        dataUrl: effectiveTenderDoc.dataUrl,
        referenceNote: 'Official Signed Tender PDF (Stage 01)',
      }
    }
    if (lower.includes('vendor registration') && tender.eligibilityCheck?.vendorRegDoc) {
      const v = tender.eligibilityCheck.vendorRegDoc
      return {
        id: 'elig-vendor-reg',
        name: v.name,
        type: v.type,
        size: v.size,
        uploadedAt: v.uploadedAt || new Date().toISOString(),
        dataUrl: v.dataUrl,
        referenceNote: 'Attached at Eligibility Check Stage',
      }
    }
    if (lower.includes('completion') && tender.eligibilityCheck?.experienceDoc) {
      const ex = tender.eligibilityCheck.experienceDoc
      return {
        id: 'elig-experience-doc',
        name: ex.name,
        type: ex.type,
        size: ex.size,
        uploadedAt: ex.uploadedAt || new Date().toISOString(),
        dataUrl: ex.dataUrl,
        referenceNote: 'Attached at Eligibility Check Stage',
      }
    }
    if (lower.includes('maf') || lower.includes('manufacturer authorization')) {
      if (mafLetter) return mafLetter
    }
    return undefined
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)

    // Synthesize valid document items with user-customized text content so they are never null
    const finalMaf: SampleDocumentItem = mafLetter
      ? { ...mafLetter, textContent: mafText }
      : requirementsAudit?.mafLetter?.masterStatus === 'NOT REQUIRED'
        ? {
          id: `maf-${tender.id}`,
          name: 'Not Applicable / Not Required',
          type: 'text/plain',
          uploadedAt: new Date().toISOString(),
          source: 'auto-fetched',
          referenceNote: 'MAF Letter is Not Required by Tender Document',
          textContent: mafText,
        }
        : {
          id: `maf-${tender.id}`,
          name: `MAF_Letter_${tender.id}.docx`,
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          uploadedAt: new Date().toISOString(),
          source: 'auto-fetched',
          referenceNote: 'Manufacturer Authorization Form (MAF) - Draft Template',
          textContent: mafText,
        }

    const finalTestReport: SampleDocumentItem | null = testReport
      ? { ...testReport, textContent: testReportText }
      : null

    const finalBis: SampleDocumentItem | null = bisCertificate
      ? { ...bisCertificate, textContent: bisCertificateText }
      : null

    const finalProductSample: SampleDocumentItem | null = productSample
      ? { ...productSample, textContent: productSampleText }
      : null

    if (finalTestReport && requirementsAudit?.testReport) {
      finalTestReport.requirementStatus = requirementsAudit.testReport.masterStatus || requirementsAudit.testReport.status
      finalTestReport.requirementReason = requirementsAudit.testReport.detailedExplanation || requirementsAudit.testReport.reasoning
      finalTestReport.requirementClause = requirementsAudit.testReport.clauseOrSection || requirementsAudit.testReport.clauseOrRef
      finalTestReport.originalDocumentEvidence = requirementsAudit.testReport.originalDocumentEvidence
      finalTestReport.pageNumber = requirementsAudit.testReport.pageNumber
      finalTestReport.verificationStatus = requirementsAudit.testReport.verificationStatus
    }

    if (finalBis && requirementsAudit?.bisCertificate) {
      finalBis.requirementStatus = requirementsAudit.bisCertificate.masterStatus || requirementsAudit.bisCertificate.status
      finalBis.requirementReason = requirementsAudit.bisCertificate.detailedExplanation || requirementsAudit.bisCertificate.reasoning
      finalBis.requirementClause = requirementsAudit.bisCertificate.clauseOrSection || requirementsAudit.bisCertificate.clauseOrRef
      finalBis.originalDocumentEvidence = requirementsAudit.bisCertificate.originalDocumentEvidence
      finalBis.pageNumber = requirementsAudit.bisCertificate.pageNumber
      finalBis.verificationStatus = requirementsAudit.bisCertificate.verificationStatus
    }

    if (finalProductSample && requirementsAudit?.productSample) {
      finalProductSample.requirementStatus = requirementsAudit.productSample.masterStatus || requirementsAudit.productSample.status
      finalProductSample.requirementReason = requirementsAudit.productSample.detailedExplanation || requirementsAudit.productSample.reasoning
      finalProductSample.requirementClause = requirementsAudit.productSample.clauseOrSection || requirementsAudit.productSample.clauseOrRef
      finalProductSample.originalDocumentEvidence = requirementsAudit.productSample.originalDocumentEvidence
      finalProductSample.pageNumber = requirementsAudit.productSample.pageNumber
      finalProductSample.verificationStatus = requirementsAudit.productSample.verificationStatus
    }

    // Build history audit entry
    const historyEntry: SampleDetailsHistoryEntry = {
      id: `hist-${Date.now()}`,
      submittedAt: new Date().toISOString(),
      submittedBy: tender.owner || 'Admin',
      mafLetter: finalMaf,
      testReport: finalTestReport,
      bisCertificate: finalBis,
      productSample: finalProductSample,
      otherDocs,
      remarks: remarks.trim(),
      previousStage: 'Sample Details',
      advancedToStage: 'EMD Ready',
      updateSummary: `Sample details verified. Documents: MAF, Test Report (${requirementsAudit?.testReport.status || 'Verified'}), BIS (${requirementsAudit?.bisCertificate.status || 'Verified'}), Product Sample (${requirementsAudit?.productSample?.status || 'Verified'})${otherDocs.length ? `, ${otherDocs.length} Other` : ''
        }`,
      aiRequirementsAudit: requirementsAudit || undefined,
    }

    const previousHistory = existing?.history || []

    const sampleDetailsData: SampleDetailsData = {
      mafLetter: finalMaf,
      testReport: finalTestReport,
      bisCertificate: finalBis,
      productSample: finalProductSample,
      otherDocs,
      remarks: remarks.trim(),
      completedAt: new Date().toISOString(),
      completedBy: tender.owner || 'Admin',
      history: [historyEntry, ...previousHistory],
      aiRequirementsAudit: requirementsAudit || undefined,
    }

    const updatedTender: Tender = {
      ...tender,
      stage: 'EMD Ready',
      status: 'In Progress',
      remarks: remarks.trim() || tender.remarks,
      sampleDetails: sampleDetailsData,
    }

    if (onComplete) {
      onComplete(updatedTender)
    }
  }

  const isViewOnly = editHistoryActive && !!existing?.completedAt
  const historyList = existing?.history || []

  // Count fetched documents
  const fetchedCount = [mafLetter, testReport, bisCertificate, productSample].filter(Boolean).length

  return (
    <>
      <div className="modal-backdrop">
        <div className="modal modal-wide" style={{ maxWidth: '860px' }}>
          {/* Modal Header */}
          <div className="modal-head">
            <div>
              <p className="eyebrow">STAGE 02 • SAMPLE DETAILS & VERIFICATION</p>
              <h2>{isViewOnly ? 'Sample Details Record & History' : 'Sample Details Verification'}</h2>
            </div>
            <button type="button" onClick={onClose} title="Close">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Record Header */}
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
              </p>
            </div>
          </div>

          {/* Original Tender PDF Source Banner (Single Source of Truth) */}
          <div className="px-6 py-2.5 bg-slate-900 text-white border-b border-slate-800 text-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-blue-500/20 border border-blue-400/40 text-blue-400 flex items-center justify-center flex-shrink-0">
                <FileText className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-white">Source: Original Tender PDF</span>
                  <span className="text-[10px] font-bold px-2 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Attached at Stage 01
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 truncate">
                  File: <span className="font-semibold text-white">{effectiveTenderDoc?.name || 'No tender document attached'}</span>
                  {effectiveTenderDoc?.size ? ` (${formatBytes(effectiveTenderDoc.size)})` : ''}
                  {tender.corrigenda?.length ? ` • ${tender.corrigenda.length} Corrigenda Included` : ''}
                </p>
              </div>
            </div>
            {effectiveTenderDoc?.dataUrl && (
              <button
                type="button"
                onClick={() => setPreviewDoc(effectiveTenderDoc)}
                className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors flex-shrink-0 cursor-pointer"
                title="Preview original uploaded tender document"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>View Original PDF</span>
              </button>
            )}
          </div>

          {/* AI Auto-Fetch Status Banner */}
          <div className="px-6 py-2.5 bg-gradient-to-r from-blue-50/80 via-indigo-50/80 to-purple-50/80 border-b border-blue-100 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
                {loadingAI ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              </span>
              <div>
                <strong className="text-slate-900 block text-xs">
                  AI Document Auto-Fetch {loadingAI ? 'Analyzing...' : 'Active'}
                </strong>
                <p className="text-[11px] text-slate-600">
                  {fetchedCount > 0
                    ? `${fetchedCount} source files linked • MAF Letter ready for Word download (.docx)`
                    : 'MAF Letter template ready for Word download (.docx)'}
                </p>
              </div>
            </div>

            {autoFetchData && autoFetchData.detectedContext.makes.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {autoFetchData.detectedContext.makes.slice(0, 2).map((m, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-white text-blue-700 border border-blue-200 font-bold">
                    OEM: {m}
                  </span>
                ))}
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[calc(85vh-150px)] overflow-y-auto">
            {/* Status & Advancement Banner */}
            {isViewOnly ? (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-900">
                <div className="flex items-center gap-2 font-semibold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Sample Details Verified • Advanced to EMD Ready</span>
                </div>
                <button
                  type="button"
                  onClick={() => setEditHistoryActive(false)}
                  className="text-xs text-blue-700 hover:text-blue-900 font-bold underline"
                >
                  Edit / Review Revision
                </button>
              </div>
            ) : (
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl flex items-start gap-2.5 text-xs text-blue-900">
                <FileCheck2 className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <strong>User Verification Step:</strong>
                  <p className="text-blue-800/80 mt-0.5">
                    Review each auto-fetched document using the <strong>Preview</strong> button. Once verified, click <strong>Submit & Move to EMD Ready</strong> to archive this record to History and advance the workflow.
                  </p>
                </div>
              </div>
            )}

            {/* AI Tender Document Requirement Overview Banner */}
            <div className="p-3.5 bg-gradient-to-r from-blue-50/90 via-indigo-50/70 to-purple-50/80 border border-blue-200 rounded-xl flex items-center justify-between gap-3 shadow-2xs">
              <div className="flex items-start gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center flex-shrink-0 shadow-2xs mt-0.5">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-slate-900">
                      Master AI Tender Document Audit
                    </span>
                    {requirementsAudit ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                        ✔ Evidence Verified {requirementsAudit.totalPagesAnalyzed ? `(${requirementsAudit.totalPagesAnalyzed} Pages Scanned)` : requirementsAudit.sourceType === 'tender-pdf' ? 'from Official Tender PDF' : 'from Tender Specifications'}
                      </span>
                    ) : isAuditing ? (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-300 flex items-center gap-1.5 animate-pulse">
                          <Sparkles className="w-3 h-3 text-blue-600 animate-pulse" /> Reading Complete Tender PDF ({auditPercent > 0 ? `${auditPercent}%` : '15%'})
                        </span>
                        <div className="w-20 bg-blue-200/90 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                            style={{ width: `${Math.max(10, Math.min(100, auditPercent || 15))}%` }}
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap text-xs">
                    {/* MAF Letter */}
                    <div className="flex items-center gap-1">
                      <span className="text-slate-600 font-semibold text-[11px]">MAF:</span>
                      {requirementsAudit?.mafLetter ? (
                        renderMasterStatusBadge(requirementsAudit.mafLetter)
                      ) : (
                        <span className="text-slate-400 text-[10px] italic">Checking...</span>
                      )}
                    </div>
                    <span className="text-slate-300">•</span>
                    {/* Test Report */}
                    <div className="flex items-center gap-1">
                      <span className="text-slate-600 font-semibold text-[11px]">Test Report:</span>
                      {requirementsAudit?.testReport ? (
                        renderMasterStatusBadge(requirementsAudit.testReport)
                      ) : (
                        <span className="text-slate-400 text-[10px] italic">Checking...</span>
                      )}
                    </div>
                    <span className="text-slate-300">•</span>
                    {/* BIS Certificate */}
                    <div className="flex items-center gap-1">
                      <span className="text-slate-600 font-semibold text-[11px]">BIS:</span>
                      {requirementsAudit?.bisCertificate ? (
                        renderMasterStatusBadge(requirementsAudit.bisCertificate)
                      ) : (
                        <span className="text-slate-400 text-[10px] italic">Checking...</span>
                      )}
                    </div>
                    <span className="text-slate-300">•</span>
                    {/* Product Sample */}
                    <div className="flex items-center gap-1">
                      <span className="text-slate-600 font-semibold text-[11px]">Sample:</span>
                      {requirementsAudit?.productSample ? (
                        renderMasterStatusBadge(requirementsAudit.productSample)
                      ) : (
                        <span className="text-slate-400 text-[10px] italic">Checking...</span>
                      )}
                    </div>
                  </div>
                  {requirementsAudit?.summary && (
                    <p className="text-[11px] text-slate-600 mt-1 line-clamp-1">
                      {requirementsAudit.summary}
                    </p>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={runRequirementAudit}
                disabled={isAuditing}
                className="px-3 py-1.5 rounded-lg bg-white border border-blue-200 hover:border-blue-400 hover:bg-blue-50/60 text-blue-700 text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer flex-shrink-0 disabled:opacity-60"
                title="Re-read tender PDF and verify evidence with Master AI"
              >
                {isAuditing ? (
                  <span className="text-[11px] font-mono font-bold text-blue-600">{auditPercent > 0 ? `${auditPercent}%` : '15%'}</span>
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                <span>{isAuditing ? `Reading PDF (${auditPercent > 0 ? `${auditPercent}%` : '15%'})` : 'Re-check Tender with Master AI'}</span>
              </button>
            </div>

            {/* 1. MAF Letter */}
            <DocumentSlot
              fieldNumber={1}
              title="MAF Letter"
              description="Manufacturer Authorization Form / OEM Letter for specified makes."
              document={mafLetter}
              candidates={autoFetchData?.candidates.mafLetter}
              suggestedHint={
                autoFetchData?.detectedContext.makes.length
                  ? `Required for make(s): ${autoFetchData.detectedContext.makes.join(', ')}`
                  : undefined
              }
              matchReason={autoFetchData?.matchReasons.mafLetter}
              requirementAudit={requirementsAudit?.mafLetter}
              isCheckingAudit={isAuditing}
              auditPercent={auditPercent}
              disabled={isViewOnly}
              onSelect={setMafLetter}
              onPreview={setPreviewDoc}
              verificationContent={verifiedContents.mafLetter}
              customText={mafText}
              onCustomTextChange={txt => {
                setMafText(txt)
                setMafEdited(true)
              }}
              onResetCustomText={() => {
                setMafText(verifiedContents.mafLetter.textContent)
                setMafEdited(false)
              }}
              isCustomized={mafEdited && mafText !== verifiedContents.mafLetter.textContent}
              onDownloadWord={() => handleDownloadWord(verifiedContents.mafLetter, mafText)}
              isDownloadingWord={downloadingKey === 'mafLetter'}
            />

            {/* 2. Test Report */}
            <DocumentSlot
              fieldNumber={2}
              title="Test Report"
              description="Accredited laboratory / type test report certifying technical standards."
              document={testReport}
              candidates={autoFetchData?.candidates.testReport}
              suggestedHint={
                autoFetchData?.detectedContext.standards.length
                  ? `Standards identified: ${autoFetchData.detectedContext.standards.join(', ')}`
                  : undefined
              }
              matchReason={autoFetchData?.matchReasons.testReport}
              requirementAudit={requirementsAudit?.testReport}
              isCheckingAudit={isAuditing}
              auditPercent={auditPercent}
              disabled={isViewOnly}
              onSelect={setTestReport}
              onPreview={setPreviewDoc}
            />

            {/* 3. BIS Certificate */}
            <DocumentSlot
              fieldNumber={3}
              title="BIS Certificate"
              description="Bureau of Indian Standards certificate or Compulsory Registration Scheme (CRS) license."
              document={bisCertificate}
              candidates={autoFetchData?.candidates.bisCertificate}
              suggestedHint="Mandatory for solar modules, inverters, pumps, and electrical equipment."
              matchReason={autoFetchData?.matchReasons.bisCertificate}
              requirementAudit={requirementsAudit?.bisCertificate}
              isCheckingAudit={isAuditing}
              auditPercent={auditPercent}
              disabled={isViewOnly}
              onSelect={setBisCertificate}
              onPreview={setPreviewDoc}
            />

            {/* 4. Product Sample */}
            <DocumentSlot
              fieldNumber={4}
              title="Product Sample"
              description="Physical sample submission acknowledgment, courier receipt, or sample photograph."
              document={productSample}
              candidates={autoFetchData?.candidates.productSample}
              matchReason={autoFetchData?.matchReasons.productSample}
              requirementAudit={requirementsAudit?.productSample}
              isCheckingAudit={isAuditing}
              auditPercent={auditPercent}
              disabled={isViewOnly}
              onSelect={setProductSample}
              onPreview={setPreviewDoc}
            />

            {/* 5. Other Documents (AI Requirement Analysis & Checklist) */}
            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/70 space-y-3.5 shadow-2xs">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-slate-900">
                      5. Other Documents
                    </span>
                    <span className="px-2 py-0.5 rounded-full font-bold text-[10px] bg-blue-100 text-blue-800 border border-blue-300 flex items-center gap-1 shadow-2xs">
                      <Sparkles className="w-3 h-3 text-blue-600" /> AI Requirement Analysis ({checklistDocs.length} Documents)
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 mt-1">
                    {checklistDocs.length > 0
                      ? 'Is tender ke apne document se nikale gaye required documents (har item ka page aur quote PDF se verify kiya gaya hai):'
                      : 'Abhi tak is tender ke document se koi checklist nahi nikali gayi. Upar "AI Requirement Analysis" chalayein.'}
                  </p>
                  {requirementsAudit?.evidenceStatus && (
                    <p className="text-[10px] text-slate-500 mt-0.5">Read: {requirementsAudit.evidenceStatus}</p>
                  )}
                </div>

                {!isViewOnly && (
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer transition-all shadow-2xs">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload Supporting File</span>
                    <input
                      type="file"
                      className="hidden"
                      onChange={e => handleUploadOtherDoc(e)}
                    />
                  </label>
                )}
              </div>

              {/* AI Required Documents Checklist Table */}
              <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-2xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100/90 text-slate-700 border-b border-slate-200 font-bold text-[11px]">
                        <th className="py-2.5 px-3 w-12 text-center">S.No.</th>
                        <th className="py-2.5 px-3">Document Name</th>
                        <th className="py-2.5 px-3 hidden md:table-cell">Tender Clause / Reference</th>
                        <th className="py-2.5 px-3 w-44">Requirement</th>
                        <th className="py-2.5 px-3 w-40 text-right">Status / Attachment</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {checklistDocs.map(item => {
                        const attached = getAttachedForChecklist(item.documentName)
                        return (
                          <tr key={item.sNo} className="hover:bg-blue-50/40 transition-colors">
                            <td className="py-2 px-3 text-center font-bold text-slate-600">
                              {item.sNo}
                            </td>
                            <td className="py-2 px-3">
                              <span className="font-bold text-slate-900 block">
                                {item.documentName}
                              </span>
                              {item.description && (
                                <span className="text-[10px] text-slate-500 block line-clamp-1">
                                  {item.description}
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 hidden md:table-cell text-slate-600 text-[11px] font-mono">
                              {item.pageNumber ? `📄 ${item.pageNumber} • ` : ''}
                              {item.clauseOrSection || 'Tender Checklist'}
                              {item.quoteVerified === true && (
                                <span className="block text-[9px] font-sans font-semibold text-emerald-700">✓ quote verified in PDF</span>
                              )}
                              {item.quoteVerified === false && (
                                <span className="block text-[9px] font-sans font-semibold text-amber-700" title={item.evidenceQuote}>
                                  ⚠ quote not found on cited page – verify manually
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3">
                              {getChecklistRequirementBadge(item.requirement)}
                            </td>
                            <td className="py-2 px-3 text-right">
                              {attached ? (
                                <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded shadow-2xs">
                                    <Check className="w-3 h-3 text-emerald-700" /> Attached
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setPreviewDoc(attached)}
                                    className="p-1 rounded text-blue-700 hover:bg-blue-100 transition-colors"
                                    title={`Preview ${attached.name}`}
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                  </button>
                                  {attached.dataUrl && (
                                    <a
                                      href={attached.dataUrl}
                                      download={attached.name}
                                      className="p-1 rounded text-slate-600 hover:text-blue-700 hover:bg-slate-100 transition-colors"
                                      target="_blank"
                                      rel="noreferrer"
                                      title="Download"
                                    >
                                      <Download className="w-3.5 h-3.5" />
                                    </a>
                                  )}
                                </div>
                              ) : isViewOnly ? (
                                <span className="text-[10px] text-slate-400 italic">Not Uploaded</span>
                              ) : (
                                <label className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 cursor-pointer shadow-2xs transition-colors">
                                  <Upload className="w-3 h-3" /> Attach
                                  <input
                                    type="file"
                                    className="hidden"
                                    onChange={e => handleUploadOtherDoc(e, item.documentName)}
                                  />
                                </label>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Uploaded Documents List */}
              {otherDocs.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                      Custom Uploaded Files ({otherDocs.length}):
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {otherDocs.map(doc => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between p-2 bg-white border border-slate-200 rounded-lg text-xs shadow-2xs"
                      >
                        <div className="flex items-center gap-2 truncate">
                          {getFileBadge(doc.name, doc.type)}
                          <span className="truncate font-semibold text-slate-800">{doc.name}</span>
                          <span className="text-[10px] text-slate-400">({formatBytes(doc.size)})</span>
                          {doc.referenceNote && (
                            <span className="text-[10px] text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-200 truncate">
                              {doc.referenceNote}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => setPreviewDoc(doc)}
                            className="text-[11px] text-blue-700 hover:text-blue-900 font-bold underline flex items-center gap-1"
                          >
                            <Eye className="w-3 h-3" /> Preview
                          </button>
                          {doc.dataUrl && (
                            <a
                              href={doc.dataUrl}
                              download={doc.name}
                              className="text-[11px] text-slate-600 hover:text-blue-700 underline font-semibold"
                              target="_blank"
                              rel="noreferrer"
                            >
                              Download
                            </a>
                          )}
                          {!isViewOnly && (
                            <button
                              type="button"
                              onClick={() => handleRemoveOtherDoc(doc.id)}
                              className="text-slate-400 hover:text-red-600 p-1 rounded"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 6. Remark (Manual Entry) */}
            <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/50 space-y-1.5">
              <label className="text-xs font-bold text-slate-900 block">
                6. Remark <span className="text-[11px] font-normal text-slate-500">(Manual Entry)</span>
              </label>
              <p className="text-[11px] text-slate-500">
                Enter sample inspection notes, courier tracking number, physical sample verification status, or approvals.
              </p>
              {isViewOnly ? (
                <p className="text-xs text-slate-800 p-2.5 bg-white border border-slate-200 rounded-lg min-h-[50px] whitespace-pre-wrap">
                  {remarks || 'No remarks provided.'}
                </p>
              ) : (
                <textarea
                  value={remarks}
                  onChange={e => setRemarks(e.target.value)}
                  placeholder="Enter sample tracking numbers, lab approval notes, or compliance comments..."
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-xs text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-[75px]"
                />
              )}
            </div>

            {/* Historical Audits Timeline */}
            {historyList.length > 0 && (
              <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/70 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                  <History className="w-4 h-4 text-purple-600" />
                  <span>Submission History & Audit Trail ({historyList.length} entry)</span>
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {historyList.map(item => (
                    <div key={item.id} className="p-2.5 bg-white rounded-lg border border-slate-200 text-xs space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-slate-800">
                          Submitted by: {item.submittedBy}
                        </span>
                        <span className="text-slate-500 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(item.submittedAt).toLocaleString()}
                        </span>
                      </div>
                      {item.updateSummary && (
                        <p className="text-slate-600 text-[11px]">{item.updateSummary}</p>
                      )}
                      {item.remarks && (
                        <p className="text-slate-700 font-medium bg-slate-50 p-1.5 rounded border border-slate-100 text-[11px]">
                          “{item.remarks}”
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button type="button" onClick={onClose} className="secondary-button text-xs py-2 px-4">
                {isViewOnly ? 'Close' : 'Cancel'}
              </button>
              {!isViewOnly && (
                <button
                  type="submit"
                  disabled={submitting}
                  className="primary-button text-xs py-2 px-4 bg-blue-600 hover:bg-blue-700 flex items-center gap-1.5 font-bold"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Submitting & Moving to EMD Ready…</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Submit & Move to EMD Ready</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>

      {/* High-Resolution Document Inspection Modal */}
      {previewDoc && (
        <DocumentPreviewModal
          document={previewDoc}
          onClose={() => setPreviewDoc(null)}
        />
      )}
    </>
  )
}
