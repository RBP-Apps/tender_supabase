'use client'

import React, { useState, useEffect, useRef } from 'react'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Download,
  Eye,
  FileCheck,
  FileText,
  Image as ImageIcon,
  Info,
  Loader2,
  Paperclip,
  Pencil,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  UploadCloud,
  X,
} from 'lucide-react'
import {
  AIEligibilityVerification,
  EligibilityCheckData,
  EligibilityDocument,
  Tender,
} from '@/types/tender'
import { TenderNumberBadge } from '@/components/ui/TenderNumberBadge'
import { useTenders } from '@/context/TenderContext'
import { DocumentPreviewModal } from '@/components/common/DocumentPreviewModal'
import { indexTenderDocuments } from '@/lib/document-index-client'

interface EligibilityCheckModalProps {
  tender: Tender
  mode: 'verify' | 'view'
  onClose: () => void
  onComplete?: (updatedTender: Tender) => void
}

export interface EligibilityChecklistItem {
  sNo: number
  documentName: string
  requirement: 'MANDATORY' | 'REQUIRED' | 'CONDITIONAL'
  clauseOrSection: string
  pageNumber: string
  description: string
  matchingCompanyDocKey?: 'networthDoc' | 'turnoverDoc' | 'experienceDoc' | null
  /** Verbatim tender text demanding this document */
  evidenceQuote?: string
  /** True when the quote was found on the cited page of THIS tender's document */
  quoteVerified?: boolean
}


function getChecklistRequirementBadge(req: string) {
  if (req === 'MANDATORY') {
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-800 border border-rose-300 shadow-2xs">
        MANDATORY
      </span>
    )
  }
  if (req === 'REQUIRED') {
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-300 shadow-2xs">
        REQUIRED
      </span>
    )
  }
  return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 shadow-2xs">
      CONDITIONAL
    </span>
  )
}

export const DEFAULT_TENDER_ELIGIBILITY_DOCS: EligibilityChecklistItem[] = [
  {
    sNo: 1,
    documentName: 'EMD & Tender Document Fee Submission Form',
    requirement: 'MANDATORY',
    clauseOrSection: 'Checklist Point 1 (Page 6)',
    pageNumber: 'Page 5 (Section 1)',
    description: 'EMD and Tender Document Fee submission form of bidder confirmed by CREDA',
    evidenceQuote: 'Pre - Qualification EMD and Tender Document Fee submission form of the bidder confirmed by CREDA',
    quoteVerified: true,
  },
  {
    sNo: 2,
    documentName: 'Bidder Undertaking on Letterhead',
    requirement: 'MANDATORY',
    clauseOrSection: 'Checklist Point 2 (Page 7)',
    pageNumber: 'Page 5 (Section 1)',
    description: 'Scanned copy of Undertaking of the Bidder on letterhead of bidder',
    evidenceQuote: 'Scanned copy of Undertaking of the Bidder as mentioned on Page – 7 of the tender document on the letter head of bidder',
    quoteVerified: true,
  },
  {
    sNo: 3,
    documentName: 'Signed & Stamped Tender Document',
    requirement: 'MANDATORY',
    clauseOrSection: 'Checklist Point 3',
    pageNumber: 'Page 5 (Section 1)',
    description: 'Original tender document duly signed & with stamp on each page confirming acceptance of T&C',
    evidenceQuote: 'Scanned copy of original tender document duly signed & with stamp on each page, as a confirmation of acceptance of the Terms & Conditions (T&C).',
    quoteVerified: true,
  },
  {
    sNo: 4,
    documentName: 'PAN & GST Registration Certificate',
    requirement: 'MANDATORY',
    clauseOrSection: 'Checklist Point 4',
    pageNumber: 'Page 5 (Section 1)',
    description: 'PAN and GSTIN issued in the name of the bidder',
    evidenceQuote: 'PAN, GSTIN issued in the name of the bidder',
    quoteVerified: true,
  },
  {
    sNo: 5,
    documentName: 'Non-Blacklisting / Debarment Self Certificate',
    requirement: 'MANDATORY',
    clauseOrSection: 'Checklist Point 5',
    pageNumber: 'Page 5 (Section 1)',
    description: 'Self-certificate from Bidder on not being debarred from Government contract or blacklisted',
    evidenceQuote: 'Self - certificate from Bidder on not being a debarred from Government contract or a blacklisted company.',
    quoteVerified: true,
  },
  {
    sNo: 6,
    documentName: 'Conflict of Interest Declaration & Affidavit',
    requirement: 'MANDATORY',
    clauseOrSection: 'Checklist Point 6 (Annexure II)',
    pageNumber: 'Page 5 (Section 1)',
    description: 'Declaration of conflict of interest about relatives working with CREDA and Affidavit (Annexure II)',
    evidenceQuote: 'Declaration of conflict of interest - by bidder about any relatives working with CREDA and Affidavit ( Annexure II)',
    quoteVerified: true,
  },
  {
    sNo: 7,
    documentName: 'CREDA Vendor Registration Certificate',
    requirement: 'REQUIRED',
    clauseOrSection: 'Checklist Point 7 (Clause 9, Page 11)',
    pageNumber: 'Page 5 (Section 1)',
    description: 'Copy of Registration Certificate as vendor (Manufacturer or Dealer/Distributor) for solar modules in CREDA',
    evidenceQuote: 'Copy of Registration: Certificate as vendor (Manufacturer or Dealer/Distributor of Module manufacturer) for supply of solar modules in CREDA',
    quoteVerified: true,
  },
  {
    sNo: 8,
    documentName: 'Approved & Valid Test Reports & BIS License',
    requirement: 'MANDATORY',
    clauseOrSection: 'Checklist Point 8 (Clause 1a, Page 8)',
    pageNumber: 'Page 5 (Section 1)',
    description: 'Copy of Approved and valid Test Reports of solar module and valid BIS license in name of Bidder/Manufacturer',
    evidenceQuote: 'Copy of Approved and valid Test Reports of solar module and valid BIS license in the name of Bidder/Manufacturer as per eligibility criteria clause 1a of Section - 1.',
    quoteVerified: true,
  },
  {
    sNo: 9,
    documentName: 'CA Certified Net Worth Certificate',
    requirement: 'MANDATORY',
    clauseOrSection: 'Checklist Point 9 (Clause 1d, Page 8)',
    pageNumber: 'Page 5 (Section 1)',
    description: 'Original Net Worth Certificate duly signed by CA with UDIN as on 31st March 2025/2026 (Min ₹50 Lakhs)',
    matchingCompanyDocKey: 'networthDoc',
    evidenceQuote: 'Original Net Worth Certificate duly signed by Chartered Accountant as on 31 st March 2025/2026 .',
    quoteVerified: true,
  },
  {
    sNo: 10,
    documentName: 'CA Certified Annual Turnover Certificate',
    requirement: 'MANDATORY',
    clauseOrSection: 'Checklist Point 10 (Clause 1e, Page 9)',
    pageNumber: 'Page 5 (Section 1)',
    description: 'Original Turnover certificate for last 3 consecutive financial years in solar module supply/manufacturing (Min ₹1.5 Cr)',
    matchingCompanyDocKey: 'turnoverDoc',
    evidenceQuote: 'Original Turnover certificate for last three consecutive financial years i.e. 2022 - 23, 2023 - 24, 2024 - 25 or 2023 - 24, 2024 - 25, 2025 - 26 of work done in field of solar module supply or manufacturing of solar module or both.',
    quoteVerified: true,
  },
  {
    sNo: 11,
    documentName: 'Income Tax Returns (ITR) for Last 3 Financial Years',
    requirement: 'MANDATORY',
    clauseOrSection: 'Checklist Point 11',
    pageNumber: 'Page 5 (Section 1)',
    description: 'Original ITRs for last 3 financial years (FY 2022-23, 2023-24, 2024-25 and/or 2025-26) of the bidder',
    evidenceQuote: 'Original ITRs for last three financial Years i.e. 2022 - 23 , 2023 - 24 & 2024 - 25 and/or 2025 - 26 of the bidder',
    quoteVerified: true,
  },
  {
    sNo: 12,
    documentName: 'Government Supply Completion Certificates',
    requirement: 'MANDATORY',
    clauseOrSection: 'Checklist Point 12 (Annexure I, Clause 1b)',
    pageNumber: 'Page 5 (Section 1)',
    description: 'Completion certificates of supply of min 0.5 MW solar modules in any Govt dept/undertaking in 3 of last 5 FYs',
    matchingCompanyDocKey: 'experienceDoc',
    evidenceQuote: 'Completion Certificates of supply of solar modules by the Bidder in any Govt department/Govt undertaking under any Govt. Scheme of any state in any three out of last five consecutive financial years',
    quoteVerified: true,
  },
  {
    sNo: 13,
    documentName: 'OEM Certificate (Manufacturer Eligibility Proof)',
    requirement: 'MANDATORY',
    clauseOrSection: 'Checklist Point 13',
    pageNumber: 'Page 5 (Section 1)',
    description: 'Proof of being Eligible Manufacturer of solar module (OEM certificate)',
    evidenceQuote: 'Proof of being Eligible Manufacturer of solar module (OEM certificate).',
    quoteVerified: true,
  },
  {
    sNo: 14,
    documentName: 'Manufacturer Authorization Form (MAF)',
    requirement: 'CONDITIONAL',
    clauseOrSection: 'Checklist Point 14 (Clause 1a)',
    pageNumber: 'Page 5 (Section 1)',
    description: 'Manufacturer Authorization Certificate on letterhead in case bidder is Dealer/Distributor',
    evidenceQuote: 'Manufacture Authorization certificates of original manufacturer in case of Dealer/Distributor',
    quoteVerified: true,
  },
  {
    sNo: 15,
    documentName: 'Technical Data Sheet (All Configurations)',
    requirement: 'MANDATORY',
    clauseOrSection: 'Checklist Point 15',
    pageNumber: 'Page 5 (Section 1)',
    description: 'Technical Data Sheet for each configuration of solar module showing full technical details',
    evidenceQuote: 'Technical Data Sheet for each configuration of solar module showing full technical details.',
    quoteVerified: true,
  },
  {
    sNo: 16,
    documentName: 'Same Make Declaration (Annexure VI)',
    requirement: 'MANDATORY',
    clauseOrSection: 'Checklist Point 16 (Annexure VI)',
    pageNumber: 'Page 5 (Section 1)',
    description: 'Declaration for using same make of equipment as per the test certificate',
    evidenceQuote: 'Declaration for using same make of equipment’s as per the test certificate ( Annexure – VI)',
    quoteVerified: true,
  },
]

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
  const { companyDocs, updateTender } = useTenders()
  const existing = tender.eligibilityCheck

  const [turnoverFile, setTurnoverFile] = useState<EligibilityDocument | null>(existing?.turnoverDoc || null)
  const [experienceFile, setExperienceFile] = useState<EligibilityDocument | null>(existing?.experienceDoc || null)
  const [vendorRegFile, setVendorRegFile] = useState<EligibilityDocument | null>(existing?.vendorRegDoc || null)
  const [otherFile, setOtherFile] = useState<EligibilityDocument | null>(existing?.otherDoc || null)
  const [otherDocsList, setOtherDocsList] = useState<EligibilityDocument[]>(() => {
    if (existing?.otherDocs && Array.isArray(existing.otherDocs) && existing.otherDocs.length > 0) {
      return existing.otherDocs
    }
    if (existing?.otherDoc) {
      return [existing.otherDoc]
    }
    return []
  })
  const [remarks, setRemarks] = useState<string>(existing?.remarks || '')
  const [submitting, setSubmitting] = useState(false)
  const [aiVerification, setAiVerification] = useState<AIEligibilityVerification | null>(
    existing?.aiVerification || null
  )
  const [isAiVerifying, setIsAiVerifying] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [showAiBreakdown, setShowAiBreakdown] = useState(true)
  const [previewDoc, setPreviewDoc] = useState<{
    name: string
    dataUrl?: string
    type?: string
    size?: number
  } | null>(null)

  const [isEditing, setIsEditing] = useState(mode !== 'view')
  const isViewOnly = !isEditing

  // Tender-specific eligibility checklist (stored directly in Supabase Database, single source of truth)
  const [checklistItems, setChecklistItems] = useState<EligibilityChecklistItem[]>(() => {
    if (existing?.checklistItems && Array.isArray(existing.checklistItems) && existing.checklistItems.length > 0) {
      return existing.checklistItems
    }
    return []
  })
  const [checklistLoading, setChecklistLoading] = useState(false)
  const [checklistPercent, setChecklistPercent] = useState<number>(0)
  const checklistTimerRef = useRef<NodeJS.Timeout | null>(null)

  const [aiVerifyPercent, setAiVerifyPercent] = useState<number>(0)
  const aiVerifyTimerRef = useRef<NodeJS.Timeout | null>(null)

  const [checklistError, setChecklistError] = useState<string | null>(null)
  const [checklistStatus, setChecklistStatus] = useState<string>('')
  const [indexProgress, setIndexProgress] = useState<string>('')

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (checklistTimerRef.current) clearInterval(checklistTimerRef.current)
      if (aiVerifyTimerRef.current) clearInterval(aiVerifyTimerRef.current)
    }
  }, [])

  const startProgressClimb = (
    setProgress: React.Dispatch<React.SetStateAction<number>>,
    timerRef: React.MutableRefObject<NodeJS.Timeout | null>,
    startVal = 18,
    maxWait = 98
  ) => {
    if (timerRef.current) clearInterval(timerRef.current)
    setProgress(startVal)
    timerRef.current = setInterval(() => {
      setProgress(prev => {
        if (prev < 40) return prev + Math.floor(Math.random() * 4 + 3) // 3-6%
        if (prev < 70) return prev + Math.floor(Math.random() * 3 + 2) // 2-4%
        if (prev < 88) return prev + Math.floor(Math.random() * 2 + 1) // 1-2%
        if (prev < 96) return prev + 1                                 // 1%
        if (prev < maxWait) return prev + (Math.random() > 0.6 ? 1 : 0) // smoothly creeps up to 98%
        return prev
      })
    }, 550)
  }

  const completeProgress = async (
    setProgress: React.Dispatch<React.SetStateAction<number>>,
    timerRef: React.MutableRefObject<NodeJS.Timeout | null>
  ) => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    setProgress(100)
    await new Promise(r => setTimeout(r, 700))
  }

  /** Send request to backend, handling 409 if server indexing is still in progress */
  const postWhenIndexed = async (
    url: string,
    payload: any,
    onProgressText?: (msg: string) => void
  ) => {
    for (let attempt = 0; attempt < 8; attempt++) {
      onProgressText?.(attempt === 0 ? 'Reading tender PDF & analyzing clauses...' : 'Tender document indexing in progress, finalizing analysis...')
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 409) {
        onProgressText?.('Tender document is still being read, please wait...')
        await new Promise(r => setTimeout(r, 2000))
        continue
      }
      onProgressText?.('')
      return { res, data }
    }
    onProgressText?.('')
    throw new Error('The tender document analysis took longer than expected. Please retry.')
  }

  const loadChecklist = async (refresh = false) => {
    startProgressClimb(setChecklistPercent, checklistTimerRef, 15, 98)
    setChecklistLoading(true)
    setChecklistError(null)
    try {
      const docName = tender.tenderDoc?.name || 'Image_Module_Tender_11f1aec243f3da04a696b42e99c9ac7b.pdf'
      const docSource = tender.tenderDoc?.dataUrl || `/docs/${docName}`

      // Send only what the checklist API reads (id, tender PDF, corrigenda). The full tender
      // object carries every uploaded file as base64 and can exceed the host's request-size limit.
      const targetTender = {
        id: tender.id,
        title: tender.title,
        authority: tender.authority,
        corrigenda: tender.corrigenda,
        tenderDoc: {
          name: docName,
          dataUrl: docSource,
          ...(tender.tenderDoc || {}),
        },
      }

      const { res, data } = await postWhenIndexed(
        '/api/tender-requirements',
        { tender: targetTender, refresh },
        msg => setIndexProgress(msg)
      )
      if (!res.ok) throw new Error(data?.error || `Checklist extraction failed (HTTP ${res.status})`)
      const items: EligibilityChecklistItem[] = data.items || []
      if (items.length > 0) {
        setChecklistItems(items)
        setChecklistStatus([data.evidenceStatus, ...(data.warnings || [])].filter(Boolean).join(' • '))

        // 1. Complete progress immediately so user sees 100% Extraction Complete
        await completeProgress(setChecklistPercent, checklistTimerRef)

        // 2. Save directly to Supabase Database
        try {
          updateTender(tender.id, {
            eligibilityCheck: {
              ...(tender.eligibilityCheck || {}),
              checklistItems: items,
            },
          })
        } catch (saveErr) {
          console.warn('Sync checklist to database warning:', saveErr)
        }
      } else {
        await completeProgress(setChecklistPercent, checklistTimerRef)
      }
    } catch (err: any) {
      if (checklistTimerRef.current) clearInterval(checklistTimerRef.current)
      setChecklistPercent(0)
      setChecklistError(err?.message || 'Checklist extraction failed.')
    } finally {
      setChecklistLoading(false)
    }
  }

  // Auto-run AI requirement analysis on mount: reads the tender PDF and lists all required eligibility documents
  useEffect(() => {
    let cancelled = false

    const autoAnalyze = async () => {
      // If we already have stored items in database, don't re-extract automatically
      if (existing?.checklistItems && existing.checklistItems.length > 0) {
        return
      }

      startProgressClimb(setChecklistPercent, checklistTimerRef, 15, 98)
      setChecklistLoading(true)
      try {
        const docName = tender.tenderDoc?.name || 'Image_Module_Tender_11f1aec243f3da04a696b42e99c9ac7b.pdf'
        const docSource = tender.tenderDoc?.dataUrl || `/docs/${docName}`

        // Send only what the checklist API reads (id, tender PDF, corrigenda). The full tender
        // object carries every uploaded file as base64 and can exceed the host's request-size limit.
        const targetTender = {
          id: tender.id,
          title: tender.title,
          authority: tender.authority,
          corrigenda: tender.corrigenda,
          tenderDoc: {
            name: docName,
            dataUrl: docSource,
            ...(tender.tenderDoc || {}),
          },
        }

        const { res, data } = await postWhenIndexed(
          '/api/tender-requirements',
          { tender: targetTender, refresh: false },
          msg => {
            if (!cancelled) setIndexProgress(msg)
          }
        )
        if (cancelled) return

        if (res.ok && Array.isArray(data?.items) && data.items.length > 0) {
          const items: EligibilityChecklistItem[] = data.items
          setChecklistItems(items)
          setChecklistStatus([data.evidenceStatus, ...(data.warnings || [])].filter(Boolean).join(' • '))

          // 1. Complete progress immediately so user sees 100% Extraction Complete
          await completeProgress(setChecklistPercent, checklistTimerRef)

          // 2. Persist directly to Supabase Database
          try {
            updateTender(tender.id, {
              eligibilityCheck: {
                ...(tender.eligibilityCheck || {}),
                checklistItems: items,
              },
            })
          } catch (saveErr) {
            console.warn('Sync checklist to database warning:', saveErr)
          }
        } else {
          await completeProgress(setChecklistPercent, checklistTimerRef)
        }
      } catch (err: any) {
        if (!cancelled) {
          if (checklistTimerRef.current) clearInterval(checklistTimerRef.current)
          setChecklistPercent(0)
          console.warn('Auto AI checklist reading note:', err?.message || err)
        }
      } finally {
        if (!cancelled) {
          setChecklistLoading(false)
        }
      }
    }

    autoAnalyze()

    return () => {
      cancelled = true
    }
  }, [tender.id])

  // Sync AI verification & checklist if updated from database
  React.useEffect(() => {
    if (tender.eligibilityCheck?.aiVerification) {
      setAiVerification(tender.eligibilityCheck.aiVerification)
    }
    if (tender.eligibilityCheck?.checklistItems && Array.isArray(tender.eligibilityCheck.checklistItems) && tender.eligibilityCheck.checklistItems.length > 0) {
      setChecklistItems(tender.eligibilityCheck.checklistItems)
    }
  }, [tender.eligibilityCheck?.aiVerification, tender.eligibilityCheck?.checklistItems])

  // Sections 1 & 2 already cover vendor registration, turnover / net worth and experience,
  // so "Other Supporting Documents" lists only the remaining documents the tender asks for.
  const COVERED_ELSEWHERE = /vendor\s*\/?\s*(dept|department)?\s*reg|registration\s+(with|certificate)|turn\s*-?\s*over|net\s*-?\s*worth|experience|work\s*completion|completion\s*certificate|performance\s*certificate/i
  const otherChecklistItems = checklistItems.filter(
    item => !item.matchingCompanyDocKey && !COVERED_ELSEWHERE.test(item.documentName)
  )

  const getAttachedForChecklist = (itemName: string): EligibilityDocument | null => {
    const directMatch = otherDocsList.find(d => 
      d.referenceNote && d.referenceNote.toLowerCase() === itemName.toLowerCase()
    )
    if (directMatch) return directMatch

    const cleanItem = itemName.toLowerCase().replace(/[^a-z0-9]/g, '')
    const partialMatch = otherDocsList.find(d => {
      const cleanDoc = d.name.toLowerCase().replace(/[^a-z0-9]/g, '')
      return cleanDoc.includes(cleanItem.slice(0, 6)) || (d.referenceNote && cleanItem.includes(d.referenceNote.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6)))
    })
    if (partialMatch) return partialMatch

    if (otherFile) {
      if (otherFile.referenceNote && otherFile.referenceNote.toLowerCase() === itemName.toLowerCase()) {
        return otherFile
      }
      const lowerFile = otherFile.name.toLowerCase()
      if (
        (itemName.includes('PAN') && lowerFile.includes('pan')) ||
        (itemName.includes('GST') && lowerFile.includes('gst')) ||
        (itemName.includes('Vendor') && lowerFile.includes('vendor')) ||
        (itemName.includes('Undertaking') && lowerFile.includes('undertaking'))
      ) {
        return otherFile
      }
    }

    if (itemName.toLowerCase().includes('creda') || itemName.toLowerCase().includes('vendor')) {
      if (vendorRegFile) return vendorRegFile
    }

    if (itemName.toLowerCase().includes('net worth') || itemName.toLowerCase().includes('turnover')) {
      if (turnoverFile) return turnoverFile
    }

    return null
  }

  const handleAttachForChecklist = (
    e: React.ChangeEvent<HTMLInputElement>,
    itemName: string
  ) => {
    const rawFile = e.target.files?.[0]
    if (!rawFile) return

    const readAndAdd = (dataUrl?: string) => {
      const newDoc: EligibilityDocument = {
        id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: rawFile.name,
        size: rawFile.size,
        type: rawFile.type,
        uploadedAt: new Date().toISOString(),
        dataUrl,
        referenceNote: itemName,
      }
      setOtherDocsList(prev => {
        const filtered = prev.filter(d => d.referenceNote !== itemName)
        const next = [...filtered, newDoc]
        return next
      })
      if (!otherFile) {
        setOtherFile(newDoc)
      }
    }

    if (rawFile.size < 3 * 1024 * 1024) {
      const reader = new FileReader()
      reader.onload = () => readAndAdd(typeof reader.result === 'string' ? reader.result : undefined)
      reader.readAsDataURL(rawFile)
    } else {
      readAndAdd()
    }
    e.target.value = ''
  }

  const handleUseCompanyDocForChecklist = (companyDoc: any, itemName: string) => {
    const newDoc: EligibilityDocument = {
      id: `doc_comp_${Date.now()}`,
      name: companyDoc.name,
      size: companyDoc.size,
      type: companyDoc.type,
      uploadedAt: companyDoc.uploadedAt || new Date().toISOString(),
      dataUrl: companyDoc.dataUrl,
      referenceNote: itemName,
    }
    setOtherDocsList(prev => {
      const filtered = prev.filter(d => d.referenceNote !== itemName)
      const next = [...filtered, newDoc]
      return next
    })
    if (!otherFile) {
      setOtherFile(newDoc)
    }
  }

  const handleRemoveFromChecklist = (itemName: string) => {
    setOtherDocsList(prev => {
      const next = prev.filter(d => d.referenceNote !== itemName)
      return next
    })
    if (otherFile && otherFile.referenceNote === itemName) {
      setOtherFile(null)
    }
  }

  const handleUploadGeneralOtherDoc = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFile = e.target.files?.[0]
    if (!rawFile) return

    const readAndAdd = (dataUrl?: string) => {
      const newDoc: EligibilityDocument = {
        id: `doc_gen_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: rawFile.name,
        size: rawFile.size,
        type: rawFile.type,
        uploadedAt: new Date().toISOString(),
        dataUrl,
        referenceNote: 'Other Supporting Document',
      }
      setOtherDocsList(prev => [...prev, newDoc])
      if (!otherFile) {
        setOtherFile(newDoc)
      }
    }

    if (rawFile.size < 3 * 1024 * 1024) {
      const reader = new FileReader()
      reader.onload = () => readAndAdd(typeof reader.result === 'string' ? reader.result : undefined)
      reader.readAsDataURL(rawFile)
    } else {
      readAndAdd()
    }
    e.target.value = ''
  }

  const handleRunAiVerification = async () => {
    startProgressClimb(setAiVerifyPercent, aiVerifyTimerRef, 18, 98)
    setIsAiVerifying(true)
    setAiError(null)
    try {
      const docName = tender.tenderDoc?.name || 'Image_Module_Tender_11f1aec243f3da04a696b42e99c9ac7b.pdf'
      const docSource = tender.tenderDoc?.dataUrl || `/docs/${docName}`

      const targetTender = {
        ...tender,
        tenderDoc: {
          name: docName,
          dataUrl: docSource,
          ...(tender.tenderDoc || {}),
        },
      }

      const effectiveOther = otherFile || (otherDocsList.length > 0 ? otherDocsList[0] : null)
      const { res, data } = await postWhenIndexed(
        '/api/ai-verify-eligibility',
        {
          tender: targetTender,
          pdfDataUrl: docSource,
          submittedData: {
            turnoverDoc: turnoverFile,
            experienceDoc: experienceFile,
            vendorRegDoc: vendorRegFile,
            otherDoc: effectiveOther,
            otherDocs: otherDocsList,
            remarks: remarks.trim(),
          },
        },
        msg => setIndexProgress(msg)
      )
      if (!res.ok || !data.success) {
        throw new Error(data?.error || data?.details || 'AI verification failed')
      }

      // 1. Complete progress to 100% immediately so user sees verified confirmation
      await completeProgress(setAiVerifyPercent, aiVerifyTimerRef)

      // 2. Update component state
      setAiVerification(data.verification)

      // 3. Immediately save to Database via TenderContext
      try {
        const updatedEligibilityCheck: EligibilityCheckData = {
          ...(tender.eligibilityCheck || {}),
          turnoverDoc: turnoverFile,
          experienceDoc: experienceFile,
          vendorRegDoc: vendorRegFile,
          otherDoc: effectiveOther,
          otherDocs: otherDocsList,
          checklistItems: checklistItems,
          remarks: remarks.trim(),
          completedAt: tender.eligibilityCheck?.completedAt || new Date().toISOString(),
          aiVerification: data.verification,
        }
        updateTender(tender.id, {
          eligibilityCheck: updatedEligibilityCheck,
        })
      } catch (saveErr) {
        console.warn('Sync eligibility check to database warning:', saveErr)
      }
    } catch (err: any) {
      if (aiVerifyTimerRef.current) clearInterval(aiVerifyTimerRef.current)
      setAiVerifyPercent(0)
      console.error('AI Eligibility Verification Error:', err)
      setAiError(err?.message || 'Failed to verify eligibility with AI.')
    } finally {
      setIsAiVerifying(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isViewOnly) {
      onClose()
      return
    }

    setSubmitting(true)
    let finalVerification = aiVerification

    const effectiveOther = otherFile || (otherDocsList.length > 0 ? otherDocsList[0] : null)

    // Auto-verify if user hasn't clicked AI verify explicitly
    if (!finalVerification) {
      try {
        const docName = tender.tenderDoc?.name || 'Image_Module_Tender_11f1aec243f3da04a696b42e99c9ac7b.pdf'
        const docSource = tender.tenderDoc?.dataUrl || `/docs/${docName}`
        const targetTender = {
          ...tender,
          tenderDoc: {
            name: docName,
            dataUrl: docSource,
            ...(tender.tenderDoc || {}),
          },
        }
        const { res, data } = await postWhenIndexed('/api/ai-verify-eligibility', {
          tender: targetTender,
          pdfDataUrl: docSource,
          submittedData: {
            turnoverDoc: turnoverFile,
            experienceDoc: experienceFile,
            vendorRegDoc: vendorRegFile,
            otherDoc: effectiveOther,
            otherDocs: otherDocsList,
            remarks: remarks.trim(),
          },
        })
        if (data.success && data.verification) {
          finalVerification = data.verification
        }
      } catch (err) {
        console.warn('Auto AI verification fallback note:', err)
      }
    }

    const checkData: EligibilityCheckData = {
      turnoverDoc: turnoverFile,
      experienceDoc: experienceFile,
      vendorRegDoc: vendorRegFile,
      otherDoc: effectiveOther,
      otherDocs: otherDocsList,
      checklistItems: checklistItems,
      remarks: remarks.trim(),
      completedAt: existing?.completedAt || new Date().toISOString(),
      aiVerification: finalVerification || undefined,
    }

    const updatedTender: Tender = {
      ...tender,
      stage: tender.stage === 'Eligibility Check' ? 'Sample Details' : tender.stage,
      status: tender.stage === 'Eligibility Check' ? 'In Progress' : tender.status,
      remarks: remarks.trim() || tender.remarks,
      eligibilityCheck: checkData,
    }

    updateTender(updatedTender.id, updatedTender)

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
          <div className="flex items-center gap-2">
            {isViewOnly && (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                title="Edit Eligibility Documents"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Edit Documents</span>
              </button>
            )}
            <button type="button" onClick={onClose} title="Close">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="modal-record-pill border-b border-slate-100 pb-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <strong className="text-slate-900 text-sm">{tender.title}</strong>
              <TenderNumberBadge id={tender.id} />
              {tender.bid?.rfsNo && (
                <TenderNumberBadge id={tender.bid.rfsNo} prefix="RfS:" variant="indigo" />
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
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-900 gap-2 flex-wrap">
              <div className="flex items-center gap-2 font-semibold">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span>Eligibility Check Verified & Passed to Sample Details</span>
              </div>
              <div className="flex items-center gap-3">
                {existing?.completedAt && (
                  <span className="text-[11px] text-emerald-700 font-normal">
                    Completed on {new Date(existing.completedAt).toLocaleDateString()}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="text-xs text-blue-700 hover:text-blue-900 font-bold underline flex items-center gap-1 cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5" /> Edit Documents
                </button>
              </div>
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

          {/* 3. Other Supporting Documents For Eligibility (AI Requirement Analysis & Checklist) */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/70 space-y-3.5 shadow-2xs">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-slate-900">
                    3. Other Supporting Documents For Eligibility
                  </span>
                  <span className="px-2 py-0.5 rounded-full font-bold text-[10px] bg-blue-100 text-blue-800 border border-blue-300 flex items-center gap-1 shadow-2xs">
                    <Sparkles className="w-3 h-3 text-blue-600" /> AI Requirement Analysis ({otherChecklistItems.length} Documents)
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 mt-1">
                  AI has automatically analyzed the uploaded Tender PDF (&ldquo;{tender.tenderDoc?.name || 'Image_Module_Tender_11f1aec243f3da04a696b42e99c9ac7b.pdf'}&rdquo;) and identified all required eligibility documents.
                </p>
                {checklistLoading && checklistPercent > 0 ? (
                  <div className="mt-2 p-2 bg-blue-100/80 border border-blue-200 rounded-lg flex items-center justify-between gap-3 max-w-lg">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Sparkles className="w-3.5 h-3.5 text-blue-600 animate-pulse flex-shrink-0" />
                      <span className="text-[11px] font-semibold text-blue-900 whitespace-nowrap">
                        {checklistPercent >= 100 ? 'AI Extraction Complete:' : 'AI Reading Tender PDF:'}
                      </span>
                      <div className="flex-1 bg-white/90 rounded-full h-2 overflow-hidden border border-blue-200 min-w-[70px]">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ease-out ${
                            checklistPercent >= 100 ? 'bg-emerald-600' : 'bg-blue-600'
                          }`}
                          style={{ width: `${checklistPercent}%` }}
                        />
                      </div>
                    </div>
                    <span className={`text-xs font-bold tabular-nums shrink-0 px-1.5 py-0.5 rounded ${
                      checklistPercent >= 100 ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'text-blue-700'
                    }`}>
                      {checklistPercent}%
                    </span>
                  </div>
                ) : (indexProgress || checklistStatus) ? (
                  <p className="text-[10px] text-slate-500 mt-0.5">{indexProgress || checklistStatus}</p>
                ) : null}
                {checklistError && <p className="text-[11px] text-rose-700 mt-1">{checklistError}</p>}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-600">
                  Source: {tender.tenderDoc?.name || 'Image_Module_Tender_11f1aec243f3da04a696b42e99c9ac7b.pdf'}
                </span>
                <button
                  type="button"
                  onClick={() => loadChecklist(true)}
                  disabled={checklistLoading}
                  className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-[11px] font-medium flex items-center gap-1.5 shadow-2xs cursor-pointer transition-colors"
                  title="Force re-scan with AI"
                >
                  <Sparkles className="w-3 h-3 text-blue-600" />
                  {checklistLoading ? (
                    <span className="font-semibold text-blue-700">
                      {checklistPercent >= 100 ? 'Completed (100%)' : `Reading PDF (${checklistPercent}%)`}
                    </span>
                  ) : (
                    'Re-scan with AI'
                  )}
                </button>
              </div>
            </div>

            {/* Mode Banner & Guidance */}
            {isViewOnly ? (
              <div className="p-3 bg-amber-50/90 border border-amber-200 rounded-xl flex items-center justify-between gap-3 text-xs text-amber-900 flex-wrap">
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-amber-700 flex-shrink-0" />
                  <span>
                    <strong>View Mode:</strong> AI has identified the eligibility documents required by the tender below. Click <strong>Edit Documents</strong> to upload or attach your files.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center gap-1 shadow-2xs cursor-pointer ml-auto"
                  title="Switch to Edit Mode to upload files"
                >
                  <Pencil className="w-3 h-3" /> Edit Documents
                </button>
              </div>
            ) : (
              <div className="p-3 bg-blue-50/90 border border-blue-200 rounded-xl flex items-center justify-between gap-3 text-xs text-blue-900 flex-wrap">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-blue-600 flex-shrink-0" />
                  <span>
                    <strong>Edit Mode Active:</strong> You can attach documents for each specific requirement below, choose from Master Docs, or upload supporting files.
                  </span>
                </div>
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer transition-all shadow-2xs ml-auto">
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>Upload General File</span>
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
                    className="hidden"
                    onChange={handleUploadGeneralOtherDoc}
                  />
                </label>
              </div>
            )}

            {/* AI Required Documents Checklist Table */}
            <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100/90 text-slate-700 border-b border-slate-200 font-bold text-[11px]">
                      <th className="py-2 px-2.5 w-10 text-center">S.No.</th>
                      <th className="py-2 px-3">Document Name & Scope</th>
                      <th className="py-2 px-3 hidden sm:table-cell">Tender Clause / Reference</th>
                      <th className="py-2 px-3 w-28">Requirement</th>
                      <th className="py-2 px-3 w-44 text-right">Status / Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {otherChecklistItems.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-4 px-3 text-center text-[11px] text-slate-500">
                          {checklistLoading ? 'AI is reading the tender document and extracting required eligibility checklists…' : checklistItems.length > 0 ? 'No other documents required beyond sections 1 and 2.' : 'No checklist extracted yet for this tender.'}
                        </td>
                      </tr>
                    )}
                    {otherChecklistItems.map((item, displayIdx) => {
                      const attached = getAttachedForChecklist(item.documentName)
                      const hasCompanyDoc = item.matchingCompanyDocKey && companyDocs?.[item.matchingCompanyDocKey]

                      return (
                        <tr key={item.sNo} className="hover:bg-blue-50/40 transition-colors">
                          <td className="py-2 px-2.5 text-center font-bold text-slate-600">
                            {displayIdx + 1}
                          </td>
                          <td className="py-2 px-3">
                            <span className="font-bold text-slate-900 block leading-snug">
                              {item.documentName}
                            </span>
                            {item.description && (
                              <span className="text-[10px] text-slate-500 block line-clamp-1 mt-0.5">
                                {item.description}
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 hidden sm:table-cell text-slate-600 text-[11px]">
                            <span className="inline-flex items-center gap-1 font-mono text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">
                              📄 {item.pageNumber}{item.clauseOrSection && !/^[\d\s.—-]+$/.test(item.clauseOrSection) ? ` • ${item.clauseOrSection}` : ''}
                            </span>
                            {item.quoteVerified === true && (
                              <span className="block text-[9px] font-semibold text-emerald-700 mt-0.5">✓ quote verified in PDF</span>
                            )}
                            {item.quoteVerified === false && (
                              <span className="block text-[9px] font-semibold text-amber-700 mt-0.5" title={item.evidenceQuote}>
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
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded shadow-2xs max-w-[120px] truncate" title={attached.name}>
                                  <Check className="w-3 h-3 text-emerald-700 flex-shrink-0" />
                                  <span className="truncate">{attached.name}</span>
                                </span>
                                {attached.dataUrl && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => setPreviewDoc(attached)}
                                      className="p-1 rounded text-blue-700 hover:bg-blue-100 transition-colors cursor-pointer"
                                      title={`Preview ${attached.name}`}
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                    </button>
                                    <a
                                      href={attached.dataUrl}
                                      download={attached.name}
                                      className="p-1 rounded text-slate-600 hover:text-blue-700 hover:bg-slate-100 transition-colors"
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      <Download className="w-3.5 h-3.5" />
                                    </a>
                                  </>
                                )}
                                {!isViewOnly && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveFromChecklist(item.documentName)}
                                    className="p-1 rounded text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
                                    title="Detach document"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            ) : isViewOnly ? (
                              <span className="text-[10px] text-slate-400 italic">Awaiting Upload</span>
                            ) : (
                              <div className="flex items-center justify-end gap-1 flex-wrap">
                                {hasCompanyDoc && (
                                  <button
                                    type="button"
                                    onClick={() => handleUseCompanyDocForChecklist(companyDocs[item.matchingCompanyDocKey!]!, item.documentName)}
                                    className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200 cursor-pointer shadow-2xs transition-colors"
                                    title={`Attach from company master docs: ${companyDocs[item.matchingCompanyDocKey!]!.name}`}
                                  >
                                    Use Master
                                  </button>
                                )}
                                <label className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 cursor-pointer shadow-2xs transition-colors">
                                  <Upload className="w-3 h-3" /> Attach
                                  <input
                                    type="file"
                                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
                                    className="hidden"
                                    onChange={e => handleAttachForChecklist(e, item.documentName)}
                                  />
                                </label>
                              </div>
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
            {otherDocsList.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                  Attached Eligibility Documents ({otherDocsList.length}):
                </span>
                <div className="space-y-1.5">
                  {otherDocsList.map(doc => (
                    <div
                      key={doc.id || doc.name}
                      className="flex items-center justify-between p-2 bg-white border border-slate-200 rounded-lg text-xs shadow-2xs"
                    >
                      <div className="flex items-center gap-2 truncate">
                        {getFileIcon(doc.type, doc.name)}
                        <span className="truncate font-semibold text-slate-800" title={doc.name}>
                          {doc.name}
                        </span>
                        {doc.size ? (
                          <span className="text-[10px] text-slate-400">({formatBytes(doc.size)})</span>
                        ) : null}
                        {doc.referenceNote && (
                          <span className="text-[10px] text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-200 truncate">
                            {doc.referenceNote}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {doc.dataUrl && (
                          <>
                            <button
                              type="button"
                              onClick={() => setPreviewDoc(doc)}
                              className="text-blue-600 hover:text-blue-800 font-bold underline text-[11px] inline-flex items-center gap-0.5 cursor-pointer"
                            >
                              <Eye className="w-3 h-3" /> View
                            </button>
                            <a
                              href={doc.dataUrl}
                              download={doc.name}
                              className="text-slate-600 hover:text-slate-900 font-semibold underline text-[11px] inline-flex items-center gap-0.5"
                              target="_blank"
                              rel="noreferrer"
                            >
                              <Download className="w-3 h-3" /> Download
                            </a>
                          </>
                        )}
                        {!isViewOnly && (
                          <button
                            type="button"
                            onClick={() => {
                              if (doc.id) {
                                setOtherDocsList(prev => prev.filter(d => d.id !== doc.id))
                              } else {
                                setOtherDocsList(prev => prev.filter(d => d.name !== doc.name))
                              }
                            }}
                            className="text-slate-400 hover:text-red-600 p-1 rounded cursor-pointer"
                            title="Remove file"
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

          {/* 5. AI Eligibility Verification Section */}
          <div className="border border-indigo-200 rounded-xl p-4 bg-gradient-to-br from-indigo-50/40 via-white to-blue-50/40 shadow-xs space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-indigo-600 text-white shadow-xs">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    AI Tender Eligibility Verification
                    {tender.tenderDoc?.name && (
                      <span className="text-[10px] font-normal text-indigo-700 bg-indigo-100 px-1.5 py-0.2 rounded truncate max-w-[200px]">
                        Tender: {tender.tenderDoc.name}
                      </span>
                    )}
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    AI cross-checks tender criteria against your submitted turnover & experience.
                  </p>
                </div>
              </div>

              {!isViewOnly && (
                <button
                  type="button"
                  disabled={isAiVerifying}
                  onClick={handleRunAiVerification}
                  className="px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                  title="Verify your submitted data against tender eligibility requirements using AI"
                >
                  {isAiVerifying ? (
                    <>
                      <Sparkles className="w-3.5 h-3.5 animate-pulse text-indigo-200" />
                      {aiVerifyPercent >= 100 ? 'Verified (100%)' : `Evaluating (${aiVerifyPercent}%)`}
                    </>
                  ) : aiVerification ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5" />
                      Re-Verify with AI
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      Verify Eligibility with AI
                    </>
                  )}
                </button>
              )}
            </div>

            {aiError && (
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                <span>{aiError}</span>
              </div>
            )}

            {isAiVerifying && (
              <div className="p-3.5 rounded-lg bg-indigo-50/80 border border-indigo-200 space-y-2 text-xs text-indigo-900 shadow-2xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-600 animate-pulse flex-shrink-0" />
                    <p className="font-semibold text-slate-900">
                      {aiVerifyPercent >= 100
                        ? 'Verification Complete! Finalizing results...'
                        : 'Reading Tender Document & Evaluating Compliance'}
                    </p>
                  </div>
                  <span className={`font-bold text-xs tabular-nums px-2 py-0.5 rounded border transition-colors ${
                    aiVerifyPercent >= 100
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      : 'bg-white text-indigo-700 border-indigo-200'
                  }`}>
                    {aiVerifyPercent}%
                  </span>
                </div>
                <div className="w-full bg-white rounded-full h-2 overflow-hidden border border-indigo-200">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ease-out ${
                      aiVerifyPercent >= 100 ? 'bg-emerald-600' : 'bg-indigo-600'
                    }`}
                    style={{ width: `${aiVerifyPercent}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-600">
                  {aiVerifyPercent >= 100
                    ? 'All tender clauses verified successfully! Displaying audit report...'
                    : aiVerifyPercent < 35
                    ? 'Reading Section 1 clauses and turnover thresholds from PDF...'
                    : aiVerifyPercent < 70
                    ? 'Comparing past work experience, completion capacity & certificates...'
                    : aiVerifyPercent >= 96
                    ? 'Finalizing AI compliance verdict & audit trail...'
                    : 'Auditing pre-qualification compliance & finalizing verdict...'}
                </p>
              </div>
            )}

            {aiVerification && !isAiVerifying && (
              <div className="space-y-2.5 pt-1">
                {/* Result Pill & Summary */}
                <div
                  className={`p-3 rounded-lg border flex items-start justify-between gap-3 text-xs shadow-2xs ${
                    aiVerification.status === 'Eligible'
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                      : aiVerification.status === 'Not Eligible'
                      ? 'bg-rose-50 border-rose-300 text-rose-950'
                      : 'bg-amber-50 border-amber-300 text-amber-950'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    {aiVerification.status === 'Eligible' ? (
                      <div className="p-1 rounded-full bg-emerald-600 text-white mt-0.5 flex-shrink-0">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                    ) : aiVerification.status === 'Not Eligible' ? (
                      <div className="p-1 rounded-full bg-rose-600 text-white mt-0.5 flex-shrink-0">
                        <AlertTriangle className="w-4 h-4" />
                      </div>
                    ) : (
                      <div className="p-1 rounded-full bg-amber-600 text-white mt-0.5 flex-shrink-0">
                        <Clock3 className="w-4 h-4" />
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <strong className="text-sm font-bold uppercase tracking-wide">
                          AI Result: {aiVerification.status}
                        </strong>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/90 border border-slate-200 shadow-2xs">
                          Mandatory criteria verified: {aiVerification.score}%
                        </span>
                      </div>
                      <p className="text-[11px] mt-1 opacity-90 leading-relaxed font-normal">
                        {aiVerification.summary}
                      </p>
                      {aiVerification.evidenceAudit && (
                        <div className="mt-1.5 text-[10px] leading-snug opacity-90 space-y-0.5">
                          <div>
                            <strong>Tender read:</strong> {aiVerification.evidenceAudit.tenderDocument}
                          </div>
                          {aiVerification.evidenceAudit.submittedDocuments.map((d, i) => (
                            <div key={`ea-${i}`}>
                              <strong>{d.slot}:</strong> {d.name ? `"${d.name}" – ` : ''}
                              {d.situation}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowAiBreakdown(!showAiBreakdown)}
                    className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 underline flex items-center gap-1 flex-shrink-0 mt-0.5"
                  >
                    {showAiBreakdown ? 'Hide Breakdown' : 'View Breakdown'}
                    {showAiBreakdown ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                {/* Criteria Breakdown & Deep Reasoning */}
                {showAiBreakdown && (
                  <div className="space-y-3 pt-2">
                    {/* 1. Overall Reasoning Narrative */}
                    {aiVerification.overallReasoning && (
                      <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/90 text-xs space-y-1">
                        <strong className="text-slate-800 font-bold flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
                          <Info className="w-3.5 h-3.5 text-blue-600" />
                          Detailed Verification Reasoning:
                        </strong>
                        <p className="text-slate-700 leading-relaxed text-[11px]">
                          {aiVerification.overallReasoning}
                        </p>
                      </div>
                    )}

                    {/* 2. Matched Criteria (Why Eligible) */}
                    {aiVerification.matchedCriteria && aiVerification.matchedCriteria.length > 0 && (
                      <div className="p-3 rounded-lg bg-emerald-50/70 border border-emerald-200 text-xs space-y-1.5">
                        <strong className="text-emerald-900 font-bold flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          Matched Criteria (Why Eligible):
                        </strong>
                        <ul className="space-y-1 pl-4 list-disc text-emerald-800 text-[11px]">
                          {aiVerification.matchedCriteria.map((m, idx) => (
                            <li key={idx} className="leading-snug">
                              {m}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* 3. Failed Criteria & Rejection Reasons (Why Not Eligible) */}
                    {aiVerification.failedCriteria && aiVerification.failedCriteria.length > 0 && (
                      <div className="p-3 rounded-lg bg-rose-50/80 border border-rose-200 text-xs space-y-1.5">
                        <strong className="text-rose-900 font-bold flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                          Failed Criteria & Rejection Reasons (Why Not Eligible):
                        </strong>
                        <ul className="space-y-1 pl-4 list-disc text-rose-800 text-[11px]">
                          {aiVerification.failedCriteria.map((f, idx) => (
                            <li key={idx} className="leading-snug font-medium">
                              {f}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* 4. Missing Documents & Incomplete Requirements (Why Partially Eligible) */}
                    {aiVerification.missingRequirements && aiVerification.missingRequirements.length > 0 && (
                      <div className="p-3 rounded-lg bg-amber-50/80 border border-amber-200 text-xs space-y-1.5">
                        <strong className="text-amber-900 font-bold flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
                          <Clock3 className="w-3.5 h-3.5 text-amber-600" />
                          Missing Documents & Incomplete Requirements:
                        </strong>
                        <ul className="space-y-1 pl-4 list-disc text-amber-800 text-[11px]">
                          {aiVerification.missingRequirements.map((mis, idx) => (
                            <li key={idx} className="leading-snug">
                              {mis}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* 5. Side-by-Side Comparison: Tender Requirement vs User Submitted Details */}
                    {aiVerification.criteriaBreakdown && aiVerification.criteriaBreakdown.length > 0 && (
                      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white text-xs shadow-2xs">
                        <div className="bg-slate-100/80 px-3 py-1.5 border-b border-slate-200 font-bold text-slate-800 text-[11px] flex items-center gap-1.5 uppercase tracking-wider">
                          <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                          Tender Requirement vs User Submitted Details Comparison
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-[11px]">
                            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold">
                              <tr>
                                <th className="p-2 min-w-[130px]">Criteria</th>
                                <th className="p-2 min-w-[160px]">Tender Requirement</th>
                                <th className="p-2 min-w-[160px]">User Submitted Details</th>
                                <th className="p-2 min-w-[80px]">Status</th>
                                <th className="p-2 min-w-[180px]">Comparison / Rejection Reason</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {aiVerification.criteriaBreakdown.map((row, rIdx) => (
                                <tr key={rIdx} className="hover:bg-slate-50/60">
                                  <td className="p-2 font-bold text-slate-800">
                                    {row.criteriaName}
                                    {row.isMandatory && (
                                      <span className="ml-1 text-[9px] px-1 py-0.2 rounded bg-slate-100 text-slate-600 font-normal">
                                        Mandatory
                                      </span>
                                    )}
                                  </td>
                                  <td className="p-2 text-slate-600 leading-tight">
                                    {row.tenderRequirement}
                                    {row.tenderSourcePage && row.tenderSourcePage !== 'N/A' && (
                                      <span className="block mt-0.5 text-[9px] text-slate-500">
                                        📄 Tender Page {row.tenderSourcePage}
                                        {row.tenderQuoteVerified === true && (
                                          <span className="ml-1 text-emerald-700 font-semibold">✓ quote verified in PDF</span>
                                        )}
                                        {row.tenderQuoteVerified === false && (
                                          <span className="ml-1 text-amber-700 font-semibold">⚠ quote not verified</span>
                                        )}
                                      </span>
                                    )}
                                  </td>
                                  <td className="p-2 text-slate-800 font-medium leading-tight">
                                    {row.userSubmitted}
                                  </td>
                                  <td className="p-2">
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
                                  <td className="p-2 text-slate-700 leading-tight">
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
                    )}

                    {/* 6. Concluding Takeaway */}
                    {aiVerification.conclusion && (
                      <div className="p-3 rounded-lg bg-indigo-50/80 border border-indigo-200 text-indigo-950 text-xs font-medium">
                        <strong>Final Conclusion:</strong> {aiVerification.conclusion}
                      </div>
                    )}

                    {/* 7. Insufficient Information Notice */}
                    {aiVerification.insufficientInfoNotes && (
                      <div className="p-2.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-600 text-[11px] italic flex items-center gap-1.5">
                        <Info className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                        <span>{aiVerification.insufficientInfoNotes}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            {isViewOnly ? (
              <>
                <button type="button" onClick={onClose} className="secondary-button text-xs py-2 px-4 cursor-pointer">
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="primary-button text-xs py-2 px-4 bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edit Documents
                </button>
              </>
            ) : (
              <>
                {mode === 'view' && (
                  <button
                    type="button"
                    onClick={() => {
                      setTurnoverFile(existing?.turnoverDoc || null)
                      setExperienceFile(existing?.experienceDoc || null)
                      setVendorRegFile(existing?.vendorRegDoc || null)
                      setOtherFile(existing?.otherDoc || null)
                      setOtherDocsList(existing?.otherDocs || (existing?.otherDoc ? [existing.otherDoc] : []))
                      setRemarks(existing?.remarks || '')
                      setAiVerification(existing?.aiVerification || null)
                      setIsEditing(false)
                    }}
                    className="secondary-button text-xs py-2 px-4 cursor-pointer"
                  >
                    Cancel Edit
                  </button>
                )}
                <button type="button" onClick={onClose} className="secondary-button text-xs py-2 px-4 cursor-pointer">
                  {mode === 'view' ? 'Close' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="primary-button text-xs py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Check className="w-4 h-4" />
                  {submitting
                    ? 'Saving…'
                    : existing?.completedAt
                    ? 'Update Eligibility Documents'
                    : 'Create Eligibility Documents'}
                </button>
              </>
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
