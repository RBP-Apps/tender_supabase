'use client'

import React, { useState } from 'react'
import {
  Download,
  Eye,
  FileText,
  FileSpreadsheet,
  Check,
  FileCheck2,
  X,
  Sparkles,
  ExternalLink,
} from 'lucide-react'
import { formatFileSize } from '@/lib/document-parser'
import { GeneratedFileResult } from '@/lib/document-file-generator'
import { MarkdownContent } from '@/components/chat/MarkdownContent'

export interface DownloadableFileInfo {
  id: string
  filename: string
  format: 'docx' | 'pdf' | 'xlsx' | 'csv' | 'txt'
  title: string
  size?: number
  url?: string
  content?: string
}

interface DownloadableFileCardProps {
  file: DownloadableFileInfo
  onDownload: () => void
}

export function DownloadableFileCard({ file, onDownload }: DownloadableFileCardProps) {
  const [downloaded, setDownloaded] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  const handleDownloadClick = () => {
    onDownload()
    setDownloaded(true)
    setTimeout(() => setDownloaded(false), 3000)
  }

  // Format details
  const getFormatDetails = () => {
    switch (file.format) {
      case 'docx':
        return {
          icon: <FileText className="w-6 h-6 text-blue-600" />,
          bg: 'bg-blue-50/80 border-blue-200/80',
          badge: 'bg-blue-100 text-blue-700',
          label: 'Word Document',
          subtitle: 'Microsoft Word (.docx) · Editable',
        }
      case 'xlsx':
        return {
          icon: <FileSpreadsheet className="w-6 h-6 text-emerald-600" />,
          bg: 'bg-emerald-50/80 border-emerald-200/80',
          badge: 'bg-emerald-100 text-emerald-700',
          label: 'Excel Spreadsheet',
          subtitle: 'Microsoft Excel (.xlsx) · Formatted Data',
        }
      case 'csv':
        return {
          icon: <FileSpreadsheet className="w-6 h-6 text-teal-600" />,
          bg: 'bg-teal-50/80 border-teal-200/80',
          badge: 'bg-teal-100 text-teal-700',
          label: 'CSV Data File',
          subtitle: 'Standard CSV · UTF-8 Compatible',
        }
      case 'pdf':
        return {
          icon: <FileText className="w-6 h-6 text-red-600" />,
          bg: 'bg-red-50/80 border-red-200/80',
          badge: 'bg-red-100 text-red-700',
          label: 'PDF Document',
          subtitle: 'Portable Document Format (.pdf)',
        }
      case 'txt':
      default:
        return {
          icon: <FileText className="w-6 h-6 text-slate-600" />,
          bg: 'bg-slate-50/80 border-slate-200/80',
          badge: 'bg-slate-100 text-slate-700',
          label: 'Text Document',
          subtitle: 'Plain Text File (.txt)',
        }
    }
  }

  const details = getFormatDetails()

  return (
    <>
      <div
        className={`my-3 p-4 rounded-2xl border transition-all shadow-xs hover:shadow-md ${details.bg} max-w-md w-full`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white border border-slate-200/80 flex items-center justify-center shadow-2xs flex-shrink-0">
              {details.icon}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-slate-900 truncate">
                  {file.filename}
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${details.badge}`}
                >
                  {file.format}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">{details.subtitle}</p>
            </div>
          </div>
        </div>

        {/* Action Row */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-200/60">
          <button
            onClick={() => setShowPreview(true)}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors shadow-2xs"
          >
            <Eye className="w-3.5 h-3.5 text-slate-500" />
            <span>Preview</span>
          </button>

          <button
            onClick={handleDownloadClick}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors"
          >
            {downloaded ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Downloaded!</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                <span>Download</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Document Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-200 animate-scale-in overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center">
                  {details.icon}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">{file.filename}</h4>
                  <p className="text-[11px] text-slate-500">{details.label} • Preview</p>
                </div>
              </div>
              <button
                onClick={() => setShowPreview(false)}
                className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-white">
              {file.content ? (
                <div className="prose prose-slate max-w-none text-xs sm:text-sm">
                  <MarkdownContent content={file.content} />
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic">
                  Document generated and ready for download.
                </p>
              )}
            </div>

            <div className="p-3.5 border-t border-slate-100 flex items-center justify-end gap-2.5 bg-slate-50/70">
              <button
                onClick={() => setShowPreview(false)}
                className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-semibold"
              >
                Close
              </button>
              <button
                onClick={handleDownloadClick}
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download File</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
