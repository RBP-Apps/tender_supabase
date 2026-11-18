'use client'

import React, { useState } from 'react'
import {
  ShieldCheck,
  FileText,
  FileSpreadsheet,
  FileCode,
  Image as ImageIcon,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  CheckCircle2,
  Info,
} from 'lucide-react'
import { DocumentSourceCitation } from '@/types/document-understanding'

interface SourceCitationCardProps {
  sources?: DocumentSourceCitation[]
  verification?: {
    confidence: string
    isVerified: boolean
    status?: 'verified' | 'verified-scanned' | 'not-verified' | 'evidence-not-found' | 'extraction-incomplete'
    auditNotes?: string
    unverifiedClaims?: string[]
  }
  conflicts?: Array<{
    field: string
    values: Array<{ source: string; value: string }>
  }>
  totalPagesAnalyzed?: number
}

export function SourceCitationCard({
  sources = [],
  verification,
  conflicts = [],
  totalPagesAnalyzed,
}: SourceCitationCardProps) {
  const [expanded, setExpanded] = useState(false)

  if (sources.length === 0 && conflicts.length === 0 && !verification) {
    return null
  }

  const getSourceIcon = (src: DocumentSourceCitation) => {
    const name = src.docName.toLowerCase()
    if (name.endsWith('.pdf')) return <FileText className="w-3.5 h-3.5 text-rose-500" />
    if (name.endsWith('.xlsx') || name.endsWith('.xls') || src.sheetName)
      return <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
    if (/\.(png|jpe?g|webp)$/.test(name))
      return <ImageIcon className="w-3.5 h-3.5 text-amber-500" />
    return <FileCode className="w-3.5 h-3.5 text-blue-500" />
  }

  return (
    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
      {/* 1. Header Bar: Verification Badge & Source Count */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5">
          {verification?.status === 'evidence-not-found' ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium border border-slate-200 dark:border-slate-700">
              <Info className="w-3.5 h-3.5" />
              Evidence Not Found in Document
            </span>
          ) : verification?.status === 'extraction-incomplete' ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 font-medium border border-amber-200 dark:border-amber-800/60">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              Extraction Incomplete – Manual Verification Required
            </span>
          ) : verification?.status === 'verified-scanned' ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-50 dark:bg-sky-950/40 text-sky-800 dark:text-sky-300 font-medium border border-sky-200 dark:border-sky-800/60">
              <ShieldCheck className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
              Verified Against Machine-Read Scan – Confirm on Original Page
            </span>
          ) : verification?.isVerified === true ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-medium border border-emerald-200 dark:border-emerald-800/60 shadow-xs">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              Verified Against Original Document
            </span>
          ) : verification ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 font-medium border border-amber-200 dark:border-amber-800/60">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              Not Verified – Manual Check Required
            </span>
          ) : null}

          {totalPagesAnalyzed && totalPagesAnalyzed > 1 && (
            <span className="text-slate-500 dark:text-slate-400 font-medium text-[11px]">
              • {totalPagesAnalyzed} pages indexed
            </span>
          )}
        </div>

        {sources.length > 0 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
          >
            {sources.length} citation{sources.length > 1 ? 's' : ''}
            {expanded ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
          </button>
        )}
      </div>

      {/* 2. Source Pills (Compact Overview) */}
      {sources.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {sources.map((src, idx) => (
            <div
              key={`src-pill-${idx}`}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-[11px] text-slate-700 dark:text-slate-300 font-medium shadow-2xs hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors"
            >
              {getSourceIcon(src)}
              <span className="max-w-[140px] truncate" title={src.docName}>
                {src.docName}
              </span>
              {src.pageNumber && (
                <span className="px-1 py-0.2 rounded bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-semibold text-[10px]">
                  Pg {src.pageNumber}
                </span>
              )}
              {src.sheetName && (
                <span className="px-1 py-0.2 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-semibold text-[10px]">
                  {src.sheetName}
                  {src.cellRef ? `:${src.cellRef}` : ''}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 3. Expanded Snippet Cards */}
      {expanded && sources.length > 0 && (
        <div className="mt-2 space-y-1.5 p-2.5 rounded-lg bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-800 text-xs">
          <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
            Verified Source References:
          </div>
          {sources.map((src, idx) => (
            <div
              key={`expanded-src-${idx}`}
              className="p-2 rounded bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 text-slate-700 dark:text-slate-300 space-y-1"
            >
              <div className="flex items-center justify-between font-medium">
                <span className="flex items-center gap-1 text-slate-900 dark:text-slate-100">
                  {getSourceIcon(src)}
                  {src.docName}
                </span>
                <span className="text-[11px] text-slate-500">
                  {src.pageNumber ? `Page ${src.pageNumber}` : ''}
                  {src.sheetName ? ` • Sheet: "${src.sheetName}"` : ''}
                  {src.cellRef ? ` • Cell: ${src.cellRef}` : ''}
                </span>
              </div>
              {src.sectionTitle && (
                <div className="text-[11px] text-blue-600 dark:text-blue-400 font-medium">
                  § {src.sectionTitle}
                </div>
              )}
              {src.snippet && (
                <div className="text-[11px] italic text-slate-500 dark:text-slate-400 border-l-2 border-slate-300 dark:border-slate-600 pl-2 py-0.5 line-clamp-2">
                  &ldquo;{src.snippet}&rdquo;
                </div>
              )}
            </div>
          ))}

          {verification?.auditNotes && (
            <div className="text-[11px] text-slate-500 dark:text-slate-400 pt-1 flex items-center gap-1">
              <Info className="w-3 h-3 text-slate-400" />
              {verification.auditNotes}
            </div>
          )}
        </div>
      )}

      {/* 3b. Failed verification checks (always visible so nothing is hidden) */}
      {verification?.unverifiedClaims && verification.unverifiedClaims.length > 0 && (
        <ul className="mt-1 pl-4 list-disc text-[11px] text-amber-800 dark:text-amber-300 space-y-0.5">
          {verification.unverifiedClaims.map((c, i) => (
            <li key={`uv-${i}`}>{c}</li>
          ))}
        </ul>
      )}

      {/* 4. Conflict Warning Card (if documents have divergent values) */}
      {conflicts.length > 0 && (
        <div className="mt-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 space-y-1.5">
          <div className="flex items-center gap-1.5 font-semibold text-amber-800 dark:text-amber-300">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
            <span>Multiple / Conflicting Document References Identified:</span>
          </div>
          <div className="space-y-1 pl-5">
            {conflicts.map((c, cIdx) => (
              <div key={`conflict-${cIdx}`} className="text-[11px]">
                <strong className="text-amber-950 dark:text-amber-100">{c.field}:</strong>
                <ul className="list-disc list-inside mt-0.5 space-y-0.5 text-amber-800 dark:text-amber-300">
                  {c.values.map((v, vIdx) => (
                    <li key={`val-${vIdx}`}>
                      {v.source}: <code className="bg-amber-100 dark:bg-amber-900/60 px-1 py-0.2 rounded font-mono">{v.value}</code>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

