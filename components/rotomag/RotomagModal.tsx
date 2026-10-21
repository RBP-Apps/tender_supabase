'use client'

import React, { useEffect, useMemo } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  X,
} from 'lucide-react'
import { ROTOMAG_DOCUMENTS, RotomagDocItem } from '@/lib/rotomag-data'
import { dataUrlToBlobUrl } from '@/lib/utils'

interface RotomagModalProps {
  currentDoc: RotomagDocItem | null
  onClose: () => void
  onSelectDoc: (doc: RotomagDocItem) => void
}

export function RotomagModal({ currentDoc, onClose, onSelectDoc }: RotomagModalProps) {
  useEffect(() => {
    if (!currentDoc) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [currentDoc, onClose])

  const safePdfSrc = useMemo(() => {
    if (!currentDoc?.pdfUrl) return ''
    if (currentDoc.pdfUrl.startsWith('data:')) {
      return dataUrlToBlobUrl(currentDoc.pdfUrl)
    }
    return currentDoc.pdfUrl
  }, [currentDoc?.pdfUrl])

  if (!currentDoc) return null

  const index = ROTOMAG_DOCUMENTS.findIndex(doc => doc.id === currentDoc.id)
  const previous = ROTOMAG_DOCUMENTS[index - 1]
  const next = ROTOMAG_DOCUMENTS[index + 1]

  return (
    <div
      className="fixed inset-0 z-[100] bg-slate-950/75 backdrop-blur-sm p-3 sm:p-5 lg:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={currentDoc.title}
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="mx-auto flex h-full max-w-[1500px] min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-100 shadow-2xl">
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700 border border-blue-100">
              <FileText className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-sm font-bold text-slate-900 sm:text-base">{currentDoc.title}</h2>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                  {currentDoc.pages} {currentDoc.pages === 1 ? 'page' : 'pages'}
                </span>
              </div>
              <p className="mt-0.5 truncate text-[11px] text-slate-500">{currentDoc.fileName}</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {previous && (
              <button type="button" onClick={() => onSelectDoc(previous)} className="icon-button" title="Previous document" aria-label="Previous document">
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            {next && (
              <button type="button" onClick={() => onSelectDoc(next)} className="icon-button" title="Next document" aria-label="Next document">
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
            <a href={safePdfSrc} download={currentDoc.fileName} className="secondary-button hidden text-xs sm:flex items-center gap-1.5">
              <Download className="h-3.5 w-3.5" />
              Download
            </a>
            <button type="button" onClick={onClose} className="icon-button ml-1" title="Close" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 bg-slate-200 p-2 sm:p-4">
          <div className="h-full w-full overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm">
            <iframe
              title={currentDoc.title}
              src={`${safePdfSrc}#page=1&view=FitH`}
              className="h-full w-full"
            />
          </div>
        </div>

        <footer className="flex shrink-0 flex-col gap-2 border-t border-slate-200 bg-white px-4 py-2.5 text-[11px] text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <span>{currentDoc.documentType} • {currentDoc.pages} {currentDoc.pages === 1 ? 'page' : 'pages'}</span>
          <span className="truncate">{currentDoc.rfsNo} • {currentDoc.bidder}</span>
        </footer>
      </div>
    </div>
  )
}
