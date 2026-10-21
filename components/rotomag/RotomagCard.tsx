'use client'

import React, { useState } from 'react'
import {
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileCheck2,
  FileText,
  Layers,
  Scale,
  ShieldCheck,
} from 'lucide-react'
import { RotomagDocItem } from '@/lib/rotomag-data'

interface RotomagCardProps {
  doc: RotomagDocItem
  onOpenModal: (doc: RotomagDocItem) => void
}

function CategoryIcon({ category }: { category: RotomagDocItem['category'] }) {
  if (category === 'Bank Guarantee') return <ShieldCheck className="h-4 w-4" />
  if (category === 'Legal & Notary') return <Scale className="h-4 w-4" />
  if (category === 'Packaging & Dispatch') return <Layers className="h-4 w-4" />
  if (category === 'Checklist') return <FileCheck2 className="h-4 w-4" />
  return <FileText className="h-4 w-4" />
}

function categoryStyles(category: RotomagDocItem['category']) {
  switch (category) {
    case 'Bank Guarantee':
      return 'border-t-4 border-t-amber-500'
    case 'Legal & Notary':
      return 'border-t-4 border-t-purple-600'
    case 'Packaging & Dispatch':
      return 'border-t-4 border-t-rose-600'
    case 'Checklist':
      return 'border-t-4 border-t-emerald-600'
    default:
      return 'border-t-4 border-t-blue-600'
  }
}

function categoryBadge(category: RotomagDocItem['category']) {
  switch (category) {
    case 'Bank Guarantee':
      return 'bg-amber-50 text-amber-800 border-amber-200'
    case 'Legal & Notary':
      return 'bg-purple-50 text-purple-800 border-purple-200'
    case 'Packaging & Dispatch':
      return 'bg-rose-50 text-rose-800 border-rose-200'
    case 'Checklist':
      return 'bg-emerald-50 text-emerald-800 border-emerald-200'
    default:
      return 'bg-blue-50 text-blue-800 border-blue-200'
  }
}

export function RotomagCard({ doc, onOpenModal }: RotomagCardProps) {
  const [copied, setCopied] = useState(false)

  const handleCopySummary = async (event: React.MouseEvent) => {
    event.stopPropagation()
    const summary = [
      doc.title,
      `Bidder: ${doc.bidder}`,
      `RfS: ${doc.rfsNo}`,
      `Packages: ${doc.packagesCovered.join(', ')}`,
      `EMD: ${doc.totalEMD}`,
      `File: ${doc.fileName}`,
    ].join('\n')

    try {
      await navigator.clipboard.writeText(summary)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  return (
    <article
      className={`card group flex min-h-[520px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-400 hover:shadow-xl ${categoryStyles(doc.category)}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${categoryBadge(doc.category)}`}>
          <CategoryIcon category={doc.category} />
          {doc.category}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Source PDF
        </span>
      </div>

      <button
        type="button"
        onClick={() => onOpenModal(doc)}
        className="mt-3 block w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100 text-left focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        aria-label={`Preview ${doc.title}`}
      >
        <div className="relative h-64 w-full overflow-hidden bg-slate-200">
          <iframe
            title={`${doc.title} preview`}
            src={`${doc.pdfUrl}#page=1&view=FitH&toolbar=0&navpanes=0&scrollbar=0`}
            className="pointer-events-none h-[900px] w-full origin-top scale-[0.43] bg-white"
            tabIndex={-1}
          />
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-slate-950/80 via-slate-950/30 to-transparent px-3 pb-2 pt-8 text-white">
            <span className="text-[10px] font-semibold">Page 1 preview</span>
            <span className="rounded-md bg-white/15 px-2 py-1 text-[10px] font-semibold backdrop-blur">Click to open</span>
          </div>
        </div>
      </button>

      <div className="mt-3 flex flex-1 flex-col">
        <div>
          <h3 className="text-sm font-extrabold leading-snug text-slate-900">{doc.title}</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{doc.description}</p>
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
            <dt className="font-semibold uppercase tracking-wide text-slate-400">Pages</dt>
            <dd className="mt-0.5 font-bold text-slate-800">{doc.pages}</dd>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
            <dt className="font-semibold uppercase tracking-wide text-slate-400">Packages</dt>
            <dd className="mt-0.5 font-bold text-slate-800">P-1 to P-7</dd>
          </div>
        </dl>

        <p className="mt-2 truncate font-mono text-[9px] text-slate-400" title={doc.fileName}>{doc.fileName}</p>

        <div className="mt-auto flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={handleCopySummary} className="icon-button" title="Copy document summary" aria-label="Copy document summary">
              {copied ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={e => {
                e.stopPropagation()
                onOpenModal(doc)
              }}
              className="icon-button"
              title="Open PDF (in current tab)"
              aria-label="Open PDF in current tab"
            >
              <ExternalLink className="h-4 w-4" />
            </button>
            <a href={doc.pdfUrl} download={doc.fileName} onClick={e => e.stopPropagation()} className="icon-button" title="Download PDF" aria-label="Download PDF">
              <Download className="h-4 w-4" />
            </a>
          </div>

          <button type="button" onClick={() => onOpenModal(doc)} className="primary-button flex h-9 items-center gap-1.5 px-4 text-xs font-semibold">
            <Eye className="h-3.5 w-3.5" />
            View document
          </button>
        </div>
      </div>
    </article>
  )
}
