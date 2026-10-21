'use client'

import React, { useEffect } from 'react'
import {
  Download,
  ExternalLink,
  Eye,
  FileText,
  Image as ImageIcon,
  Paperclip,
  X,
} from 'lucide-react'
import { dataUrlToBlobUrl } from '@/lib/utils'

interface DocumentPreviewModalProps {
  document: {
    name: string
    dataUrl?: string
    type?: string
    size?: number
    source?: string
    referenceNote?: string
    matchReason?: string
    textContent?: string
  } | null
  onClose: () => void
  onDownloadWord?: () => void
}

function formatBytes(bytes?: number) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function DocumentPreviewModal({ document, onClose }: DocumentPreviewModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  if (!document) return null

  const name = document.name || 'Document'
  const nameLower = name.toLowerCase()
  const isImage =
    document.type?.startsWith('image/') ||
    nameLower.match(/\.(jpg|jpeg|png|webp|gif|bmp|svg)$/)
  const isPdf =
    document.type === 'application/pdf' ||
    nameLower.endsWith('.pdf')

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center flex-shrink-0">
              {isImage ? (
                <ImageIcon className="w-5 h-5" />
              ) : isPdf ? (
                <FileText className="w-5 h-5 text-red-600" />
              ) : (
                <Paperclip className="w-5 h-5" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-slate-900 text-sm truncate" title={name}>
                {name}
              </h3>
              <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                {document.size ? <span>{formatBytes(document.size)}</span> : null}
                {document.type ? <span>• {document.type}</span> : null}
                {document.referenceNote ? (
                  <span className="text-blue-700 font-medium">• {document.referenceNote}</span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {document.dataUrl && (
              <a
                href={document.dataUrl}
                download={name}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> Download
              </a>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              title="Close Preview (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Reason / Context banner if present */}
        {document.matchReason && (
          <div className="px-5 py-2 bg-indigo-50/70 border-b border-indigo-100 text-xs text-indigo-900 flex items-center gap-2">
            <span className="font-bold">AI Match Explanation:</span>
            <span>{document.matchReason}</span>
          </div>
        )}

        {/* Preview Content */}
        <div className="flex-1 overflow-auto p-4 bg-slate-100/60 flex items-center justify-center min-h-[420px]">
          {document.dataUrl ? (
            isImage ? (
              <div className="max-h-[70vh] flex items-center justify-center">
                <img
                  src={document.dataUrl}
                  alt={name}
                  className="max-h-[68vh] max-w-full rounded-lg shadow-md object-contain bg-white"
                />
              </div>
            ) : isPdf ? (
              <iframe
                src={dataUrlToBlobUrl(document.dataUrl)}
                title={name}
                className="w-full h-[70vh] rounded-lg border border-slate-200 bg-white shadow-sm"
              />
            ) : (
              <div className="text-center p-8 bg-white rounded-xl border border-slate-200 shadow-sm max-w-md">
                <FileText className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                <h4 className="font-semibold text-slate-800 text-sm mb-1">{name}</h4>
                <p className="text-xs text-slate-500 mb-4">
                  This file type cannot be previewed directly in the browser. You can download it to inspect.
                </p>
                <a
                  href={document.dataUrl}
                  download={name}
                  className="primary-button inline-flex items-center gap-2 text-xs"
                >
                  <Download className="w-4 h-4" /> Download File
                </a>
              </div>
            )
          ) : document.textContent ? (
            <div className="w-full max-w-3xl bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs text-slate-600">
                <span className="font-semibold text-slate-700">Document Text Content</span>
                <span className="text-[11px] font-mono text-slate-500">
                  {document.textContent.length} characters • {document.textContent.split('\n').length} lines
                </span>
              </div>
              <div className="p-4 max-h-[60vh] overflow-y-auto text-xs font-mono text-slate-800 leading-relaxed whitespace-pre-wrap select-text bg-slate-50/30">
                {document.textContent}
              </div>
            </div>
          ) : (
            <div className="text-center p-8 bg-white rounded-xl border border-slate-200 shadow-sm max-w-md">
              <Paperclip className="w-10 h-10 text-slate-400 mx-auto mb-2" />
              <h4 className="font-semibold text-slate-800 text-sm mb-1">{name}</h4>
              <p className="text-xs text-slate-500">
                File content preview is unavailable for this record because it was registered by reference.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
