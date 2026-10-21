'use client'

import React, { useEffect, useMemo, useState } from 'react'
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
  Loader2,
  Paperclip,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react'
import {
  SampleDetailsData,
  SampleDetailsHistoryEntry,
  SampleDocumentItem,
  Tender,
} from '@/types/tender'
import {
  autoFetchSampleDetails,
  autoFetchSampleDetailsWithAI,
  AutoFetchResult,
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
}: DocumentSlotProps) {
  const [showCandidatePicker, setShowCandidatePicker] = useState(false)
  const [isEditing, setIsEditing] = useState(false)

  const activeText = customText !== undefined ? customText : (verificationContent?.textContent || '')

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const baseItem: SampleDocumentItem = {
      id: `doc-${Date.now()}`,
      name: file.name,
      size: file.size,
      type: file.type,
      uploadedAt: new Date().toISOString(),
      source: 'manual-upload',
      referenceNote: 'Manually uploaded fallback document',
    }

    if (file.size < 15 * 1024 * 1024) {
      const reader = new FileReader()
      reader.onload = () => {
        onSelect({
          ...baseItem,
          dataUrl: typeof reader.result === 'string' ? reader.result : undefined,
        })
      }
      reader.readAsDataURL(file)
    } else {
      onSelect(baseItem)
    }
    e.target.value = ''
  }

  const isImage =
    document?.type?.startsWith('image/') ||
    document?.name?.toLowerCase().match(/\.(jpg|jpeg|png|webp|gif|bmp|svg)$/)

  return (
    <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/60 hover:border-slate-300 transition-all space-y-2.5">
      {/* Header Info & Actions */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-900">
              {fieldNumber}. {title}
            </span>

            {verificationContent ? (
              verificationContent.found ? (
                <span className="text-[10px] font-bold text-blue-700 bg-blue-100/90 border border-blue-200 px-2 py-0.5 rounded-full flex items-center gap-1 shadow-2xs">
                  <Sparkles className="w-3 h-3 text-blue-600" /> AI Auto-Fetched & Generated
                </span>
              ) : (
                <span className="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 text-rose-600" /> Document Not Found
                </span>
              )
            ) : document ? (
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Check className="w-3 h-3 text-emerald-600" /> User Uploaded
              </span>
            ) : (
              <span className="text-[10px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
                Document Not Found
              </span>
            )}

            {isEditing ? (
              <span className="text-[10px] font-bold text-amber-700 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
                <Pencil className="w-2.5 h-2.5" /> Editing Mode
              </span>
            ) : isCustomized ? (
              <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                ✏️ Customized
              </span>
            ) : verificationContent?.found ? (
              <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                Editable
              </span>
            ) : null}
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

        {/* Word Download & Switch Buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {onDownloadWord && (
            <button
              type="button"
              onClick={onDownloadWord}
              disabled={!verificationContent?.found || isDownloadingWord}
              title={
                verificationContent?.found
                  ? `Download ${title} in Word (.docx) format`
                  : 'Document Not Found - Cannot download'
              }
              className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border transition-all ${
                verificationContent?.found
                  ? 'bg-blue-600 text-white hover:bg-blue-700 border-blue-700 shadow-xs cursor-pointer active:scale-98'
                  : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-60'
              }`}
            >
              {isDownloadingWord ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileText className="w-3.5 h-3.5" />
              )}
              <span>Download Word</span>
              <span className="text-[9px] uppercase px-1 py-0.2 rounded bg-black/20 text-white/90">
                .docx
              </span>
            </button>
          )}

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
      </div>

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

      {/* Text Format Display & Editing */}
      {verificationContent && (
        <div className="space-y-1.5">
          {verificationContent.found ? (
            <div
              className={`border rounded-xl overflow-hidden shadow-2xs transition-colors ${
                isEditing ? 'border-amber-300 bg-amber-50/20' : 'border-slate-200 bg-white'
              }`}
            >
              {/* Attribute Header */}
              <div className="px-3 py-2 bg-slate-50/90 border-b border-slate-100 flex items-center justify-between gap-2 flex-wrap text-[11px]">
                <div className="flex items-center gap-3 flex-wrap">
                  {verificationContent.attributes.map((attr, idx) => (
                    <span key={idx} className="text-slate-600">
                      <strong className="text-slate-800 font-semibold">{attr.label}:</strong> {attr.value}
                    </span>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  {!disabled && onCustomTextChange && (
                    <button
                      type="button"
                      onClick={() => setIsEditing(prev => !prev)}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-bold transition-all shadow-2xs cursor-pointer ${
                        isEditing
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700'
                          : 'bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 hover:border-blue-400'
                      }`}
                      title={isEditing ? 'Done editing this document' : 'Click to edit the text for this document'}
                    >
                      {isEditing ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Done Editing</span>
                        </>
                      ) : (
                        <>
                          <Pencil className="w-3 h-3" />
                          <span>Edit Text</span>
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
                </div>
              </div>

              {/* Text Box / Editable Textarea */}
              {isEditing ? (
                <div className="p-3 bg-amber-50/30 space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-amber-900">
                    <span className="font-semibold flex items-center gap-1">
                      <Pencil className="w-3 h-3 text-amber-600" /> Customize and edit {title} content:
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {activeText.length} characters • {activeText.split('\n').length} lines
                    </span>
                  </div>
                  <textarea
                    value={activeText}
                    onChange={e => onCustomTextChange?.(e.target.value)}
                    rows={8}
                    className="w-full p-3 font-mono text-xs text-slate-800 bg-white border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 leading-relaxed shadow-inner"
                    placeholder={`Type or customize ${title} content here...`}
                  />
                  <div className="flex items-center justify-between pt-1">
                    <p className="text-[10px] text-slate-500">
                      💡 Any changes here will be included in Word (.docx) download and saved upon submission.
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
                  className="p-3 bg-white max-h-48 overflow-y-auto text-xs font-mono text-slate-700 leading-relaxed whitespace-pre-wrap select-text group relative cursor-pointer hover:bg-slate-50/70 transition-colors"
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
          ) : (
            <div className="p-3 bg-rose-50/80 border border-rose-200 rounded-xl text-xs text-rose-900 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <strong className="font-bold text-rose-900 block text-xs">Document Not Found</strong>
                <p className="text-rose-700 text-[11px]">
                  {verificationContent.notFoundReason}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Document Slot Display (If actual file was attached / auto-fetched) */}
      {document ? (
        <div className="p-2.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs space-y-2">
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

              {!disabled && (
                <div className="flex items-center gap-1 pl-1 border-l border-slate-200">
                  <label className="text-[11px] text-slate-600 hover:text-blue-700 cursor-pointer font-medium px-2 py-1 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100">
                    Replace
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => onSelect(null)}
                    className="text-slate-400 hover:text-red-600 p-1 rounded"
                    title="Remove document"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : !disabled && !verificationContent?.found ? (
        <div className="space-y-1.5">
          <label className="border-2 border-dashed border-slate-300 hover:border-blue-400 hover:bg-blue-50/40 rounded-lg p-2.5 flex items-center justify-center gap-2 cursor-pointer text-xs text-slate-600 font-medium transition-all group">
            <UploadCloud className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition-colors" />
            <span>Upload {title} Manually (Fallback)</span>
            <input
              type="file"
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={handleFileUpload}
            />
          </label>
        </div>
      ) : null}
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

  // Automatically generate text verification contents for all 4 fields
  const verifiedContents = useMemo(
    () => generateSampleFieldContents(tender, autoFetchData),
    [tender, autoFetchData]
  )

  // Editable text states for all 4 verification fields
  const [mafText, setMafText] = useState<string>(
    existing?.mafLetter?.textContent || verifiedContents.mafLetter.textContent
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

  const [mafEdited, setMafEdited] = useState(!!existing?.mafLetter?.textContent)
  const [testReportEdited, setTestReportEdited] = useState(!!existing?.testReport?.textContent)
  const [bisEdited, setBisEdited] = useState(!!existing?.bisCertificate?.textContent)
  const [sampleEdited, setSampleEdited] = useState(!!existing?.productSample?.textContent)

  // Sync if pristine and auto-fetch/verified content updates
  useEffect(() => {
    if (!mafEdited && verifiedContents.mafLetter.textContent) {
      setMafText(verifiedContents.mafLetter.textContent)
    }
  }, [verifiedContents.mafLetter.textContent, mafEdited])

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
  }, [tender])

  const handleAddOtherDoc = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const newDoc: SampleDocumentItem = {
      id: `other-${Date.now()}`,
      name: file.name,
      size: file.size,
      type: file.type,
      uploadedAt: new Date().toISOString(),
      source: 'manual-upload',
    }

    if (file.size < 15 * 1024 * 1024) {
      const reader = new FileReader()
      reader.onload = () => {
        newDoc.dataUrl = typeof reader.result === 'string' ? reader.result : undefined
        setOtherDocs(prev => [...prev, newDoc])
      }
      reader.readAsDataURL(file)
    } else {
      setOtherDocs(prev => [...prev, newDoc])
    }
    e.target.value = ''
  }

  const handleRemoveOtherDoc = (id: string) => {
    setOtherDocs(prev => prev.filter(d => d.id !== id))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)

    // Synthesize valid document items with user-customized text content so they are never null
    const finalMaf: SampleDocumentItem = mafLetter
      ? { ...mafLetter, textContent: mafText }
      : {
          id: `maf-${tender.id}`,
          name: `MAF_Letter_${tender.id}.docx`,
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          uploadedAt: new Date().toISOString(),
          source: 'auto-fetched',
          referenceNote: 'Auto-generated MAF Authorization Letter',
          textContent: mafText,
        }

    const finalTestReport: SampleDocumentItem = testReport
      ? { ...testReport, textContent: testReportText }
      : {
          id: `test-${tender.id}`,
          name: `Test_Report_${tender.id}.docx`,
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          uploadedAt: new Date().toISOString(),
          source: 'auto-fetched',
          referenceNote: 'Auto-generated Laboratory Test Report',
          textContent: testReportText,
        }

    const finalBis: SampleDocumentItem = bisCertificate
      ? { ...bisCertificate, textContent: bisCertificateText }
      : {
          id: `bis-${tender.id}`,
          name: `BIS_Certificate_${tender.id}.docx`,
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          uploadedAt: new Date().toISOString(),
          source: 'auto-fetched',
          referenceNote: 'Auto-generated BIS Certificate',
          textContent: bisCertificateText,
        }

    const finalProductSample: SampleDocumentItem = productSample
      ? { ...productSample, textContent: productSampleText }
      : {
          id: `sample-${tender.id}`,
          name: `Product_Sample_Challan_${tender.id}.docx`,
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          uploadedAt: new Date().toISOString(),
          source: 'auto-fetched',
          referenceNote: 'Auto-generated Product Sample Submission Challan',
          textContent: productSampleText,
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
      updateSummary: `Sample details verified. Documents: MAF, Test Report, BIS, Product Sample${
        otherDocs.length ? `, ${otherDocs.length} Other` : ''
      }`,
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
                    ? `${fetchedCount} source files linked • All 4 verification documents auto-generated & ready for Word download (.docx)`
                    : 'All 4 verification documents auto-generated with tender metadata & ready for Word download (.docx)'}
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
                  Edit / Upload New Revision
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
              disabled={isViewOnly}
              onSelect={setTestReport}
              onPreview={setPreviewDoc}
              verificationContent={verifiedContents.testReport}
              customText={testReportText}
              onCustomTextChange={txt => {
                setTestReportText(txt)
                setTestReportEdited(true)
              }}
              onResetCustomText={() => {
                setTestReportText(verifiedContents.testReport.textContent)
                setTestReportEdited(false)
              }}
              isCustomized={testReportEdited && testReportText !== verifiedContents.testReport.textContent}
              onDownloadWord={() => handleDownloadWord(verifiedContents.testReport, testReportText)}
              isDownloadingWord={downloadingKey === 'testReport'}
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
              disabled={isViewOnly}
              onSelect={setBisCertificate}
              onPreview={setPreviewDoc}
              verificationContent={verifiedContents.bisCertificate}
              customText={bisCertificateText}
              onCustomTextChange={txt => {
                setBisCertificateText(txt)
                setBisEdited(true)
              }}
              onResetCustomText={() => {
                setBisCertificateText(verifiedContents.bisCertificate.textContent)
                setBisEdited(false)
              }}
              isCustomized={bisEdited && bisCertificateText !== verifiedContents.bisCertificate.textContent}
              onDownloadWord={() => handleDownloadWord(verifiedContents.bisCertificate, bisCertificateText)}
              isDownloadingWord={downloadingKey === 'bisCertificate'}
            />

            {/* 4. Product Sample */}
            <DocumentSlot
              fieldNumber={4}
              title="Product Sample"
              description="Physical sample submission acknowledgment, courier receipt, or sample photograph."
              document={productSample}
              candidates={autoFetchData?.candidates.productSample}
              matchReason={autoFetchData?.matchReasons.productSample}
              disabled={isViewOnly}
              onSelect={setProductSample}
              onPreview={setPreviewDoc}
              verificationContent={verifiedContents.productSample}
              customText={productSampleText}
              onCustomTextChange={txt => {
                setProductSampleText(txt)
                setSampleEdited(true)
              }}
              onResetCustomText={() => {
                setProductSampleText(verifiedContents.productSample.textContent)
                setSampleEdited(false)
              }}
              isCustomized={sampleEdited && productSampleText !== verifiedContents.productSample.textContent}
              onDownloadWord={() => handleDownloadWord(verifiedContents.productSample, productSampleText)}
              isDownloadingWord={downloadingKey === 'productSample'}
            />

            {/* 5. Other Documents */}
            <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/50">
              <div className="flex items-center justify-between mb-1.5">
                <div>
                  <span className="text-xs font-bold text-slate-900">5. Other Documents</span>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Technical datasheets, factory inspection certificates, or extra specifications.
                  </p>
                </div>

                {!isViewOnly && (
                  <label className="text-xs text-blue-700 bg-white border border-blue-200 hover:bg-blue-50 px-2 py-1 rounded cursor-pointer font-semibold flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" /> Add Document
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      className="hidden"
                      onChange={handleAddOtherDoc}
                    />
                  </label>
                )}
              </div>

              {otherDocs.length > 0 ? (
                <div className="space-y-1.5 mt-2">
                  {otherDocs.map(doc => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between p-2 bg-white border border-slate-200 rounded-lg text-xs"
                    >
                      <div className="flex items-center gap-2 truncate">
                        {getFileBadge(doc.name, doc.type)}
                        <span className="truncate font-semibold text-slate-800">{doc.name}</span>
                        <span className="text-[10px] text-slate-400">({formatBytes(doc.size)})</span>
                      </div>

                      <div className="flex items-center gap-2">
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
              ) : (
                <p className="text-xs text-slate-400 italic py-1 mt-1">No additional documents attached.</p>
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
