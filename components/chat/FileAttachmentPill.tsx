'use client'

import React from 'react'
import {
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  FileCode,
  Paperclip,
  X,
  CheckCircle2,
  FileCheck2,
} from 'lucide-react'
import { ParsedFileInfo, formatFileSize } from '@/lib/document-parser'

interface FileAttachmentPillProps {
  file: ParsedFileInfo
  onRemove?: () => void
  readOnly?: boolean
  onClick?: () => void
}

export function getFileIconComponent(name: string, type?: string) {
  const n = name.toLowerCase()
  if (n.endsWith('.pdf') || type?.includes('pdf')) {
    return <FileText className="w-4 h-4 text-red-600 flex-shrink-0" />
  }
  if (n.endsWith('.docx') || n.endsWith('.doc') || type?.includes('word')) {
    return <FileText className="w-4 h-4 text-blue-600 flex-shrink-0" />
  }
  if (n.endsWith('.xlsx') || n.endsWith('.xls') || n.endsWith('.csv') || type?.includes('sheet')) {
    return <FileSpreadsheet className="w-4 h-4 text-emerald-600 flex-shrink-0" />
  }
  if (type?.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/.test(n)) {
    return <ImageIcon className="w-4 h-4 text-purple-600 flex-shrink-0" />
  }
  return <Paperclip className="w-4 h-4 text-slate-500 flex-shrink-0" />
}

export function FileAttachmentPill({
  file,
  onRemove,
  readOnly = false,
  onClick,
}: FileAttachmentPillProps) {
  return (
    <div
      onClick={onClick}
      className={`group inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all text-xs ${
        readOnly
          ? 'bg-slate-100/90 border-slate-200/90 text-slate-800'
          : 'bg-white border-blue-200 text-slate-800 shadow-2xs hover:border-blue-300 hover:shadow-xs'
      }`}
    >
      {/* File Thumbnail or Icon */}
      {file.isImage && file.dataUrl ? (
        <img
          src={file.dataUrl}
          alt={file.name}
          className="w-5 h-5 rounded-md object-cover border border-slate-200"
        />
      ) : (
        getFileIconComponent(file.name, file.type)
      )}

      {/* File Info */}
      <div className="flex flex-col min-w-0 max-w-[160px] sm:max-w-[200px]">
        <span className="truncate font-semibold text-slate-800 leading-tight">
          {file.name}
        </span>
        <span className="text-[10px] text-slate-400">
          {formatFileSize(file.size)}
        </span>
      </div>

      {/* Remove Button if active */}
      {!readOnly && onRemove && (
        <button
          type="button"
          onClick={e => {
            e.stopPropagation()
            onRemove()
          }}
          className="w-4 h-4 rounded-full text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition-colors ml-1"
          title="Remove attachment"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}
