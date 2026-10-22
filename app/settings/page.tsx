'use client'

import React, { useState, useEffect, useRef } from 'react'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Database,
  Download,
  Eye,
  FileCheck2,
  FileText,
  Image as ImageIcon,
  Pencil,
  Plus,
  RefreshCw,
  Server,
  Settings2,
  Stamp,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react'
import { BankAccountDetails, CompanyDocumentItem, CompanyMasterDocuments, MasterKey } from '@/types/tender'
import { useTenders } from '@/context/TenderContext'
import {
  addMasterCategoryToSupabase,
  deleteMasterCategoryFromSupabase,
  updateMasterCategoryInSupabase,
} from '@/lib/supabase-service'
import { dataUrlToBlobUrl } from '@/lib/utils'
import {
  validateTransparentSignatureSeal,
  TRANSPARENT_BG_ERROR_MESSAGE,
} from '@/lib/signature-validator'

function formatBytes(bytes?: number) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getDocBadge(name?: string, type?: string) {
  const n = (name || '').toLowerCase()
  if (n.endsWith('.pdf') || type?.includes('pdf')) {
    return <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 font-bold text-[10px]">PDF</span>
  }
  if (n.match(/\.(jpg|jpeg|png|webp|bmp|gif)$/) || type?.includes('image')) {
    return <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-700 font-bold text-[10px]">IMAGE</span>
  }
  return <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 font-bold text-[10px]">DOCUMENT</span>
}

/**
 * Universal file downloader that works with both data/blob URLs and cross-origin remote URLs (Supabase storage)
 */
async function downloadFileFromUrl(url: string, fileName?: string) {
  if (!url) return
  const safeName = fileName || 'document'

  try {
    if (url.startsWith('data:') || url.startsWith('blob:')) {
      const a = document.createElement('a')
      a.href = url
      a.download = safeName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      return
    }

    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP error ${res.status}`)
    const blob = await res.blob()
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = safeName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(blobUrl), 2000)
  } catch (err) {
    console.warn('Blob fetch failed, falling back to window.open:', err)
    window.open(url, '_blank')
  }
}

const checkerboardStyle: React.CSSProperties = {
  backgroundImage:
    'linear-gradient(45deg, #e2e8f0 25%, transparent 25%), linear-gradient(-45deg, #e2e8f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e2e8f0 75%), linear-gradient(-45deg, transparent 75%, #e2e8f0 75%)',
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
  backgroundColor: '#ffffff',
}

interface CompanyDocUploadCardProps {
  stepNum: string
  id: string
  title: string
  subtitle: string
  doc: CompanyDocumentItem | null | undefined
  valueLabel: string
  valuePlaceholder: string
  notesLabel: string
  notesPlaceholder: string
  onSave: (doc: CompanyDocumentItem | null) => void
  onPreview: (doc: CompanyDocumentItem, title: string) => void
  notify: (msg: string) => void
}

function CompanyDocUploadCard({
  stepNum,
  id,
  title,
  subtitle,
  doc,
  valueLabel,
  valuePlaceholder,
  notesLabel,
  notesPlaceholder,
  onSave,
  onPreview,
  notify,
}: CompanyDocUploadCardProps) {
  const [val, setVal] = useState(doc?.value || '')
  const [notes, setNotes] = useState(doc?.notes || '')
  const [isEditingDetails, setIsEditingDetails] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  
  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  const replaceInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (doc) {
      setVal(doc.value || '')
      setNotes(doc.notes || '')
    }
  }, [doc])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|bmp|gif)$/i.test(file.name)

    if (!isPdf && !isImage) {
      notify('Please upload a valid PDF or Image file (PDF, PNG, JPG, JPEG, WEBP)')
      e.target.value = ''
      return
    }

    if (file.size > 15 * 1024 * 1024) {
      notify('File is larger than 15MB. Please upload a compressed document.')
      e.target.value = ''
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : undefined
      onSave({
        name: file.name,
        size: file.size,
        type: file.type || (isPdf ? 'application/pdf' : 'image/jpeg'),
        uploadedAt: new Date().toISOString(),
        dataUrl,
        value: val.trim() || doc?.value,
        notes: notes.trim() || doc?.notes,
      })
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleSaveDetails = () => {
    onSave({
      name: doc?.name || `${id}.pdf`,
      size: doc?.size || 0,
      type: doc?.type || 'application/pdf',
      uploadedAt: doc?.uploadedAt || new Date().toISOString(),
      dataUrl: doc?.dataUrl || '',
      value: val.trim(),
      notes: notes.trim(),
    })
    setIsEditingDetails(false)
    notify(`${title} parameters saved successfully`)
  }

  const handleDownload = async () => {
    if (!doc?.dataUrl) return
    setIsDownloading(true)
    try {
      await downloadFileFromUrl(doc.dataUrl, doc.name || `${id}.pdf`)
    } finally {
      setIsDownloading(false)
    }
  }

  const handleReplaceClick = () => {
    if (replaceInputRef.current) {
      replaceInputRef.current.value = ''
      replaceInputRef.current.click()
    }
  }

  return (
    <div className="border border-slate-200 rounded-xl bg-white shadow-xs overflow-hidden transition-all hover:border-slate-300">
      {/* Card Header */}
      <div className="p-4 bg-slate-50/70 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded bg-blue-100 text-blue-800">
              {stepNum}
            </span>
            <h3 className="text-sm font-bold text-slate-900 m-0">{title}</h3>
            {doc ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Uploaded (PDF / Image)
              </span>
            ) : (
              <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                Pending Upload
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">{subtitle}</p>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {doc ? (
          /* When Document is Uploaded */
          <div className="space-y-3">
            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className="mt-0.5 flex-shrink-0">
                  {getDocBadge(doc.name, doc.type)}
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-bold text-slate-900 block truncate max-w-[420px]" title={doc.name}>
                    {doc.name}
                  </span>
                  <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                    <span>{formatBytes(doc.size)}</span>
                    <span>•</span>
                    <span>Uploaded on {new Date(doc.uploadedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5 flex-shrink-0 self-end sm:self-center">
                <button
                  type="button"
                  onClick={() => onPreview(doc, title)}
                  className="secondary-button text-xs py-1.5 px-2.5 flex items-center gap-1"
                  title="Preview document"
                >
                  <Eye className="w-3.5 h-3.5 text-blue-600" />
                  <span>Preview</span>
                </button>

                {doc.dataUrl && (
                  <button
                    type="button"
                    onClick={handleDownload}
                    disabled={isDownloading}
                    className="secondary-button text-xs py-1.5 px-2.5 flex items-center gap-1"
                    title="Download document to computer"
                  >
                    <Download className={`w-3.5 h-3.5 text-slate-700 ${isDownloading ? 'animate-bounce' : ''}`} />
                    <span>{isDownloading ? 'Downloading...' : 'Download'}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleReplaceClick}
                  className="secondary-button text-xs py-1.5 px-2.5 flex items-center gap-1"
                  title="Replace with new file"
                >
                  <UploadCloud className="w-3.5 h-3.5 text-slate-700" />
                  <span>Replace</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Are you sure you want to remove ${title} (${doc.name})?`)) {
                      onSave(null)
                    }
                  }}
                  className="icon-action delete"
                  title="Remove document"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Document Values / Details */}
            <div className="p-3 bg-white border border-slate-200 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">
                  Configured Parameters & Reference
                </span>
                <button
                  type="button"
                  onClick={() => setIsEditingDetails(!isEditingDetails)}
                  className="text-xs text-blue-600 hover:text-blue-800 font-semibold inline-flex items-center gap-1"
                >
                  <Pencil className="w-3 h-3" />
                  <span>{isEditingDetails ? 'Cancel Edit' : 'Edit Details'}</span>
                </button>
              </div>

              {isEditingDetails ? (
                <div className="space-y-2.5 pt-1">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                        {valueLabel}
                      </label>
                      <input
                        value={val}
                        onChange={e => setVal(e.target.value)}
                        placeholder={valuePlaceholder}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                        {notesLabel}
                      </label>
                      <input
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        placeholder={notesPlaceholder}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsEditingDetails(false)}
                      className="secondary-button text-xs py-1.5 px-3"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveDetails}
                      className="primary-button text-xs py-1.5 px-3"
                    >
                      Save Parameters
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px] font-medium">{valueLabel}</span>
                    <strong className="text-slate-900 block mt-0.5">
                      {doc.value || <span className="text-slate-400 font-normal italic">— None specified —</span>}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] font-medium">{notesLabel}</span>
                    <span className="text-slate-700 block mt-0.5">
                      {doc.notes || <span className="text-slate-400 font-normal italic">— None specified —</span>}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* When Document is NOT Uploaded */
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  {valueLabel}
                </label>
                <input
                  value={val}
                  onChange={e => setVal(e.target.value)}
                  placeholder={valuePlaceholder}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  {notesLabel}
                </label>
                <input
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder={notesPlaceholder}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSaveDetails}
                className="secondary-button text-xs py-1.5 px-3 font-semibold text-blue-700 hover:text-blue-900 flex items-center gap-1"
                title="Save parameters"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Save Parameters</span>
              </button>
            </div>

            <div
              onClick={() => {
                if (uploadInputRef.current) {
                  uploadInputRef.current.value = ''
                  uploadInputRef.current.click()
                }
              }}
              className="border-2 border-dashed border-slate-300 hover:border-blue-500 hover:bg-blue-50/40 rounded-xl p-5 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all group"
            >
              <div className="w-10 h-10 rounded-full bg-blue-50 group-hover:bg-blue-100 flex items-center justify-center text-blue-600 transition-colors">
                <UploadCloud className="w-5 h-5" />
              </div>
              <div className="text-center">
                <span className="text-xs font-bold text-slate-800 group-hover:text-blue-700 block">
                  Click to Upload {title} (PDF or Image)
                </span>
                <span className="text-[11px] text-slate-500 block mt-0.5">
                  Supported formats: PDF, JPG, PNG, WEBP (Max 15MB)
                </span>
              </div>
              <input
                ref={uploadInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,image/*,application/pdf"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
          </div>
        )}

        {/* Dedicated Hidden File Input for Replace Action */}
        <input
          ref={replaceInputRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp,image/*,application/pdf"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
    </div>
  )
}

interface SignOrSealSlotCardProps {
  id: 'signatureDoc' | 'sealDoc'
  title: string
  subtitle: string
  badgeLabel: string
  doc: CompanyDocumentItem | null | undefined
  valueLabel: string
  valuePlaceholder: string
  onSave: (doc: CompanyDocumentItem | null) => void
  onPreview: (doc: CompanyDocumentItem, title: string) => void
  notify: (msg: string) => void
}

function SignOrSealSlotCard({
  id,
  title,
  subtitle,
  badgeLabel,
  doc,
  valueLabel,
  valuePlaceholder,
  onSave,
  onPreview,
  notify,
}: SignOrSealSlotCardProps) {
  const [val, setVal] = useState(doc?.value || '')
  const [isEditingVal, setIsEditingVal] = useState(false)
  const [isValidating, setIsValidating] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)

  // Dedicated separate refs for upload dropzone and replace action
  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  const replaceInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (doc) {
      setVal(doc.value || '')
    }
  }, [doc])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|bmp|gif)$/i.test(file.name)

    if (!isPdf && !isImage) {
      notify('Please upload a valid PDF or Image file (PNG, JPG, PDF)')
      e.target.value = ''
      return
    }

    if (file.size > 15 * 1024 * 1024) {
      notify('File is larger than 15MB. Please upload a compressed file.')
      e.target.value = ''
      return
    }

    // If an image is uploaded, enforce transparent background validation!
    if (isImage) {
      setIsValidating(true)
      try {
        const res = await validateTransparentSignatureSeal(file)
        if (!res.valid) {
          notify(res.error || TRANSPARENT_BG_ERROR_MESSAGE)
          e.target.value = ''
          return
        }

        onSave({
          name: file.name,
          size: file.size,
          type: 'image/png',
          uploadedAt: new Date().toISOString(),
          dataUrl: res.dataUrl,
          value: val.trim() || doc?.value,
        })
        notify(`${title} uploaded successfully with transparent background.`)
      } catch (err: any) {
        notify(err?.message || TRANSPARENT_BG_ERROR_MESSAGE)
      } finally {
        setIsValidating(false)
        e.target.value = ''
      }
      return
    }

    // If a PDF document is uploaded:
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : undefined
      onSave({
        name: file.name,
        size: file.size,
        type: 'application/pdf',
        uploadedAt: new Date().toISOString(),
        dataUrl,
        value: val.trim() || doc?.value,
      })
      notify(`${title} PDF document uploaded successfully.`)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleSaveVal = () => {
    onSave({
      name: doc?.name || (id === 'signatureDoc' ? 'signature.png' : 'seal.png'),
      size: doc?.size || 0,
      type: doc?.type || 'image/png',
      uploadedAt: doc?.uploadedAt || new Date().toISOString(),
      dataUrl: doc?.dataUrl || '',
      value: val.trim(),
    })
    setIsEditingVal(false)
    notify(`${title} details saved successfully.`)
  }

  const handleDownload = async () => {
    if (!doc?.dataUrl) return
    setIsDownloading(true)
    try {
      await downloadFileFromUrl(doc.dataUrl, doc.name || `${id}.png`)
    } finally {
      setIsDownloading(false)
    }
  }

  const handleReplaceClick = () => {
    if (replaceInputRef.current) {
      replaceInputRef.current.value = ''
      replaceInputRef.current.click()
    }
  }

  return (
    <div className="border border-slate-200 rounded-xl bg-slate-50/50 p-4 space-y-3 hover:border-purple-300 transition-colors">
      <div className="flex items-center justify-between gap-2">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 bg-purple-100 px-2 py-0.5 rounded">
            {badgeLabel}
          </span>
          <h4 className="text-xs font-bold text-slate-900 mt-1">{title}</h4>
          <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>
        </div>
        {doc ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex-shrink-0">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Uploaded
          </span>
        ) : (
          <span className="text-[10px] font-medium text-slate-500 bg-slate-200/70 px-2 py-0.5 rounded flex-shrink-0">
            Optional
          </span>
        )}
      </div>

      {doc ? (
        /* When File is Uploaded */
        <div className="space-y-3">
          <div className="p-3 rounded-lg border border-slate-200 bg-white flex items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3 min-w-0">
              {/* Thumbnail */}
              <div
                className="w-12 h-12 rounded-lg border border-slate-300 p-1 flex items-center justify-center flex-shrink-0 shadow-xs overflow-hidden"
                style={
                  doc.type?.startsWith('image/') || /\.(png|jpg|jpeg|webp)$/i.test(doc.name)
                    ? checkerboardStyle
                    : { backgroundColor: '#f8fafc' }
                }
              >
                {doc.dataUrl ? (
                  doc.type?.startsWith('image/') || /\.(png|jpg|jpeg|webp)$/i.test(doc.name) ? (
                    <img src={doc.dataUrl} alt={doc.name} className="max-h-full max-w-full object-contain" />
                  ) : (
                    <FileText className="w-6 h-6 text-red-500" />
                  )
                ) : (
                  <Stamp className="w-6 h-6 text-purple-500" />
                )}
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-900 truncate max-w-[200px]" title={doc.name}>
                    {doc.name}
                  </span>
                  {getDocBadge(doc.name, doc.type)}
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-0.5">
                  <span>{formatBytes(doc.size)}</span>
                  <span>•</span>
                  <span>{new Date(doc.uploadedAt).toLocaleDateString()}</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                type="button"
                onClick={() => onPreview(doc, title)}
                className="secondary-button text-[11px] py-1 px-2 flex items-center gap-1"
                title="Preview"
              >
                <Eye className="w-3 h-3 text-blue-600" />
                <span className="hidden sm:inline">Preview</span>
              </button>

              {doc.dataUrl && (
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={isDownloading}
                  className="secondary-button text-[11px] py-1 px-2 flex items-center gap-1"
                  title="Download file to computer"
                >
                  <Download className={`w-3 h-3 text-slate-700 ${isDownloading ? 'animate-bounce' : ''}`} />
                  <span className="hidden sm:inline">{isDownloading ? 'Downloading...' : 'Download'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleReplaceClick}
                disabled={isValidating}
                className="secondary-button text-[11px] py-1 px-2 flex items-center gap-1"
                title="Replace with new file"
              >
                <UploadCloud className="w-3 h-3 text-slate-700" />
                <span className="hidden sm:inline">{isValidating ? '...' : 'Replace'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Are you sure you want to remove ${title} (${doc.name})?`)) {
                    onSave(null)
                  }
                }}
                className="icon-action delete"
                title="Remove"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Value / Reference Parameter with Edit */}
          <div className="p-2.5 bg-white border border-slate-200 rounded-lg">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                {valueLabel}
              </span>
              <button
                type="button"
                onClick={() => setIsEditingVal(!isEditingVal)}
                className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold inline-flex items-center gap-1"
              >
                <Pencil className="w-3 h-3" />
                <span>{isEditingVal ? 'Cancel' : 'Edit'}</span>
              </button>
            </div>

            {isEditingVal ? (
              <div className="flex items-center gap-2 pt-1">
                <input
                  value={val}
                  onChange={e => setVal(e.target.value)}
                  placeholder={valuePlaceholder}
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={handleSaveVal}
                  className="primary-button text-xs py-1 px-2.5 flex items-center gap-1"
                >
                  <Check className="w-3 h-3" /> Save
                </button>
              </div>
            ) : (
              <p className="text-xs text-slate-800 font-medium m-0">
                {doc.value || <span className="text-slate-400 italic font-normal">— None specified —</span>}
              </p>
            )}
          </div>
        </div>
      ) : (
        /* When File is NOT Uploaded */
        <div className="space-y-2.5">
          {/* File Upload Dropzone */}
          <div
            onClick={() => {
              if (uploadInputRef.current) {
                uploadInputRef.current.value = ''
                uploadInputRef.current.click()
              }
            }}
            className="border-2 border-dashed border-slate-300 hover:border-purple-500 hover:bg-purple-50/40 rounded-xl p-4 flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-all bg-white group"
          >
            <div className="w-9 h-9 rounded-full bg-purple-50 group-hover:bg-purple-100 flex items-center justify-center text-purple-600 transition-colors">
              <UploadCloud className="w-4 h-4" />
            </div>
            <div className="text-center">
              <span className="text-xs font-bold text-slate-800 group-hover:text-purple-700 block">
                {isValidating ? 'Validating Transparent Background...' : `Upload ${title} (Image / PDF)`}
              </span>
              <span className="text-[10px] text-slate-500 block mt-0.5">
                Transparent PNG or PDF (Max 15MB)
              </span>
            </div>
            <input
              ref={uploadInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,image/*,application/pdf"
              className="hidden"
              disabled={isValidating}
              onChange={handleFileChange}
            />
          </div>

          {/* Optional Name/Reference Input before file upload */}
          <div className="flex items-center gap-2">
            <input
              value={val}
              onChange={e => setVal(e.target.value)}
              placeholder={valuePlaceholder}
              className="flex-1 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
            />
            <button
              type="button"
              onClick={handleSaveVal}
              className="secondary-button text-xs py-1.5 px-2.5 text-blue-700 hover:text-blue-900 font-semibold flex items-center gap-1 flex-shrink-0"
              title="Save value"
            >
              <Check className="w-3 h-3" /> Save
            </button>
          </div>
        </div>
      )}

      {/* Dedicated Hidden File Input for Replace Action */}
      <input
        ref={replaceInputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.webp,image/*,application/pdf"
        className="hidden"
        disabled={isValidating}
        onChange={handleFileChange}
      />
    </div>
  )
}

interface SignatureAndSealCardProps {
  signatureDoc: CompanyDocumentItem | null | undefined
  sealDoc: CompanyDocumentItem | null | undefined
  onSaveSignature: (doc: CompanyDocumentItem | null) => void
  onSaveSeal: (doc: CompanyDocumentItem | null) => void
  onPreview: (doc: CompanyDocumentItem, title: string) => void
  notify: (msg: string) => void
}

function SignatureAndSealCard({
  signatureDoc,
  sealDoc,
  onSaveSignature,
  onSaveSeal,
  onPreview,
  notify,
}: SignatureAndSealCardProps) {
  const hasUploaded = Boolean(signatureDoc || sealDoc)

  return (
    <div className="border border-purple-200 rounded-xl bg-white shadow-xs overflow-hidden transition-all hover:border-purple-300">
      {/* Card Header */}
      <div className="p-4 bg-purple-50/60 border-b border-purple-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded bg-purple-200 text-purple-900">
              FIELD 04
            </span>
            <h3 className="text-sm font-bold text-slate-900 m-0">Signature and Seal</h3>
            {hasUploaded ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                {[signatureDoc && 'Signature', sealDoc && 'Seal'].filter(Boolean).join(' & ')} Uploaded
              </span>
            ) : (
              <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                Optional • Pending Upload
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Upload authorized signatory signature and official company seal / stamp as separate image (transparent PNG) or PDF files.
          </p>
        </div>
        <div className="flex items-center gap-1.5 self-start sm:self-auto">
          <span className="text-[10px] font-semibold text-purple-900 bg-purple-100 border border-purple-200 px-2 py-0.5 rounded-md flex items-center gap-1">
            <Stamp className="w-3 h-3 text-purple-700" /> Image (Transparent PNG) / PDF
          </span>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* 2-Column Grid: Authorised Signatory Slot + Company Seal Slot */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Field 1: Authorised Signatory / Signer Name (Image / PDF) */}
          <SignOrSealSlotCard
            id="signatureDoc"
            badgeLabel="Signer Signature"
            title="Authorised Signatory / Signer Name"
            subtitle="Upload signature image (transparent PNG) or certified PDF document"
            doc={signatureDoc}
            valueLabel="Signer Name & Designation"
            valuePlaceholder="e.g. Rajesh Kumar (Managing Director / Authorised Signatory)"
            onSave={onSaveSignature}
            onPreview={onPreview}
            notify={notify}
          />

          {/* Field 2: Seal / Designation / Stamp Reference (Image / PDF) */}
          <SignOrSealSlotCard
            id="sealDoc"
            badgeLabel="Company Seal"
            title="Seal / Designation / Stamp Reference"
            subtitle="Upload official company seal stamp image (transparent PNG) or PDF proof"
            doc={sealDoc}
            valueLabel="Seal / Stamp Reference & Designation"
            valuePlaceholder="e.g. Official Corporate Seal • Registered Stamp No. RBP/2026/SEAL"
            onSave={onSaveSeal}
            onPreview={onPreview}
            notify={notify}
          />
        </div>

        {/* Diagnostic Storage Info & Validation Note */}
        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <span className="text-[11px] text-slate-600">
              <strong>Validation Rule:</strong> PNG images must have a 100% transparent background (no white scans or colored backgrounds). PDF documents are also accepted.
            </span>
          </div>
          <div className="text-[11px] font-mono text-slate-600 bg-white px-2 py-1 rounded border border-slate-200 flex-shrink-0">
            Table: <strong className="text-slate-900">master_company_documents</strong> • Bucket: <strong className="text-slate-900">tender-documents</strong>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const {
    masters,
    setMasters,
    selfAccounts,
    saveSelfAccount,
    deleteSelfAccount,
    companyDocs,
    saveCompanyDoc,
    notify,
    supabaseConnected,
    supabaseHealth,
    checkHealth,
    refreshFromDatabase,
    tenders,
  } = useTenders()

  const [testingDb, setTestingDb] = useState(false)

  useEffect(() => {
    checkHealth()
  }, [checkHealth])

  const handleTestConnection = async () => {
    setTestingDb(true)
    try {
      const res = await checkHealth()
      if (res.connected) {
        notify(`Supabase Connected successfully! Found ${res.tendersCount} tenders in database.`)
      } else {
        notify(`Supabase check returned error: ${res.error || 'Connection failed'}`)
      }
    } catch (e: any) {
      notify(`Connection error: ${e?.message || 'Failed'}`)
    } finally {
      setTestingDb(false)
    }
  }

  const handleSyncData = async () => {
    setTestingDb(true)
    try {
      await refreshFromDatabase()
      notify('Refreshed all tenders, masters, and accounts from Supabase!')
    } catch (e: any) {
      notify(`Sync error: ${e?.message || 'Failed to refresh'}`)
    } finally {
      setTestingDb(false)
    }
  }

  const labels: Record<MasterKey, string> = {
    states: 'States & Regions',
    departments: 'Departments',
    firms: 'Bidding Firms',
    tenderTypes: 'Tender Types',
  }

  const [selected, setSelected] = useState<MasterKey | 'selfAccounts' | 'companyDocs' | 'signatureSeal'>('companyDocs')
  const [newValue, setNewValue] = useState('')

  // State for Editing Master Category Item
  const [editingMaster, setEditingMaster] = useState<{ original: string; value: string } | null>(null)

  // State for Editing Bank Account
  const [editingBank, setEditingBank] = useState<{
    originalAccountNo: string
    data: BankAccountDetails
  } | null>(null)

  // State for Document Lightbox Preview Modal
  const [previewDoc, setPreviewDoc] = useState<{
    title: string
    name: string
    type?: string
    size?: number
    dataUrl?: string
  } | null>(null)

  // New Bank Account Form State
  const [newBank, setNewBank] = useState({
    bankName: '',
    accountHolder: '',
    accountNo: '',
    ifsc: '',
    branch: '',
  })

  // Count configured company documents
  const configuredDocsCount = [
    companyDocs?.turnoverDoc,
    companyDocs?.networthDoc,
    companyDocs?.experienceDoc,
    companyDocs?.signatureDoc,
    companyDocs?.sealDoc,
  ].filter(Boolean).length

  const handleAdd = () => {
    if (selected === 'selfAccounts' || selected === 'companyDocs' || selected === 'signatureSeal') return
    const trimmed = newValue.trim()
    if (!trimmed) return
    if (masters[selected].includes(trimmed)) {
      notify(`'${trimmed}' already exists in ${labels[selected]}`)
      return
    }

    setMasters(prev => ({
      ...prev,
      [selected]: [...prev[selected], trimmed],
    }))
    setNewValue('')
    notify(`Added '${trimmed}' to ${labels[selected]}`)

    addMasterCategoryToSupabase(selected, trimmed).catch(err => {
      console.error('Failed to sync master category to Supabase:', err)
      notify(`Warning: failed to sync '${trimmed}' to Supabase`)
    })
  }

  const handleSaveMasterEdit = () => {
    if (selected === 'selfAccounts' || selected === 'companyDocs' || selected === 'signatureSeal') return
    if (!editingMaster) return
    const { original, value } = editingMaster
    const trimmed = value.trim()
    if (!trimmed) {
      notify('Value cannot be empty')
      return
    }

    if (trimmed === original) {
      setEditingMaster(null)
      return
    }

    if (masters[selected].some(x => x.toLowerCase() === trimmed.toLowerCase() && x.toLowerCase() !== original.toLowerCase())) {
      notify(`'${trimmed}' already exists in ${labels[selected]}`)
      return
    }

    setMasters(prev => ({
      ...prev,
      [selected]: prev[selected].map(x => (x === original ? trimmed : x)),
    }))
    setEditingMaster(null)
    notify(`Updated '${original}' to '${trimmed}' in ${labels[selected]}`)

    updateMasterCategoryInSupabase(selected, original, trimmed).catch(err => {
      console.error('Failed to sync master category edit to Supabase:', err)
      notify(`Warning: failed to sync update '${trimmed}' to Supabase`)
    })
  }

  const handleRemove = (item: string) => {
    if (selected === 'selfAccounts' || selected === 'companyDocs' || selected === 'signatureSeal') return
    if (window.confirm(`Delete '${item}' from ${labels[selected]}?`)) {
      setMasters(prev => ({
        ...prev,
        [selected]: prev[selected].filter(x => x !== item),
      }))
      notify(`Removed '${item}' from ${labels[selected]}`)

      deleteMasterCategoryFromSupabase(selected, item).catch(err => {
        console.error('Failed to delete master category from Supabase:', err)
        notify(`Warning: failed to delete '${item}' from Supabase`)
      })
    }
  }

  const handleAddBank = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newBank.bankName.trim() || !newBank.accountNo.trim() || !newBank.ifsc.trim()) {
      notify('Please fill Bank Name, Account Number, and IFSC code.')
      return
    }

    saveSelfAccount({
      bankName: newBank.bankName.trim(),
      accountHolder: newBank.accountHolder.trim(),
      accountNo: newBank.accountNo.trim(),
      ifsc: newBank.ifsc.trim().toUpperCase(),
      branch: newBank.branch.trim(),
    })

    setNewBank({
      bankName: '',
      accountHolder: '',
      accountNo: '',
      ifsc: '',
      branch: '',
    })
  }

  const handleSaveBankEdit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingBank) return

    const { originalAccountNo, data } = editingBank
    if (!data.bankName.trim() || !data.accountNo.trim() || !data.ifsc.trim()) {
      notify('Please fill Bank Name, Account Number, and IFSC code.')
      return
    }

    const updatedAccount: BankAccountDetails = {
      bankName: data.bankName.trim(),
      accountHolder: data.accountHolder?.trim() || '',
      accountNo: data.accountNo.trim(),
      ifsc: data.ifsc.trim().toUpperCase(),
      branch: data.branch?.trim() || '',
    }

    saveSelfAccount(updatedAccount, originalAccountNo)
    setEditingBank(null)
    notify(`Account ${updatedAccount.bankName} (${updatedAccount.accountNo}) updated successfully.`)
  }

  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">CONFIGURATION & MASTERS</p>
          <h1>System Settings</h1>
          <p>Configure dropdown options, master categories, corporate bank accounts, and statutory eligibility documents.</p>
        </div>
        <div className={`badge ${supabaseConnected ? 'badge-green' : 'badge-amber'} flex items-center gap-1.5 py-1.5 px-3`}>
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>{supabaseConnected ? 'Supabase Connected' : 'Supabase Connecting...'}</span>
        </div>
      </div>

      {/* Supabase Realtime Database Status & Diagnostic Card */}
      <div className="card p-5 mb-6 border border-slate-200 bg-white shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold shadow-xs ${
                supabaseConnected
                  ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                  : 'bg-rose-50 text-rose-600 border border-rose-200'
              }`}
            >
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-800">Supabase Cloud Database Connection</h3>
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                    supabaseConnected ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      supabaseConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
                    }`}
                  />
                  {supabaseConnected ? 'Connected & Live' : 'Not Connected'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 font-mono truncate max-w-[500px]">
                {supabaseHealth?.url || 'https://vypmvumfxzxvhtqcbmuv.supabase.co'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testingDb}
              className="secondary-button text-xs font-semibold flex items-center gap-1.5 py-2 px-3"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${testingDb ? 'animate-spin' : ''}`} />
              <span>Test Connection</span>
            </button>
            <button
              type="button"
              onClick={handleSyncData}
              disabled={testingDb}
              className="primary-button text-xs font-semibold flex items-center gap-1.5 py-2 px-3"
            >
              <Database className="w-3.5 h-3.5" />
              <span>Force Re-sync DB</span>
            </button>
          </div>
        </div>

        {/* Database Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-4">
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
            <p className="text-[11px] font-medium text-slate-500">Tenders in Database</p>
            <p className="text-lg font-bold text-slate-800 mt-0.5">
              {supabaseHealth?.tendersCount ?? tenders.length}
            </p>
            <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-1 mt-1">
              <CheckCircle2 className="w-3 h-3" /> tenders table ok
            </span>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
            <p className="text-[11px] font-medium text-slate-500">Eligibility Check</p>
            <p className="text-lg font-bold text-slate-800 mt-0.5">
              {supabaseHealth?.tables.stage_01_eligibility_check ? 'Active' : 'Checking'}
            </p>
            <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-1 mt-1">
              <CheckCircle2 className="w-3 h-3" /> stage_01 ok
            </span>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
            <p className="text-[11px] font-medium text-slate-500">Master Categories</p>
            <p className="text-lg font-bold text-slate-800 mt-0.5">
              {supabaseHealth?.tables.master_categories ? 'Active' : 'Checking'}
            </p>
            <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-1 mt-1">
              <CheckCircle2 className="w-3 h-3" /> categories synced
            </span>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
            <p className="text-[11px] font-medium text-slate-500">Self Bank Accounts</p>
            <p className="text-lg font-bold text-slate-800 mt-0.5">
              {selfAccounts.length}
            </p>
            <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-1 mt-1">
              <CheckCircle2 className="w-3 h-3" /> accounts synced
            </span>
          </div>

          <div
            className="p-3 rounded-lg bg-slate-50 border border-slate-100 cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all"
            onClick={() => setSelected('companyDocs')}
            title="Click to view and configure Company Eligibility Documents and Signature/Seal"
          >
            <p className="text-[11px] font-medium text-slate-500">Company Credentials</p>
            <p className="text-lg font-bold text-blue-700 mt-0.5">
              {configuredDocsCount} / 5
            </p>
            <span className="text-[10px] text-blue-600 font-medium flex items-center gap-1 mt-1 truncate">
              <FileCheck2 className="w-3 h-3 flex-shrink-0" /> Turnover, Networth, Exp, Seal, Sign
            </span>
          </div>
        </div>

        {supabaseHealth?.error && (
          <div className="mt-3 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <strong>Database Notice: </strong>
              <span>{supabaseHealth.error}</span>
            </div>
          </div>
        )}
      </div>

      <div className="card grid lg:grid-cols-[250px_1fr] min-h-[460px] overflow-hidden border border-slate-200">
        {/* Settings Navigation Tabs */}
        <aside className="border-r border-slate-100 p-4 bg-slate-50/70 flex flex-col gap-1">
          {/* Master Categories */}
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-3 py-2">
            Master Data
          </p>
          {(Object.keys(labels) as MasterKey[]).map(key => {
            const isSel = selected === key
            return (
              <button
                key={key}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                  isSel
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-200/60'
                }`}
                onClick={() => setSelected(key)}
              >
                <div className="flex items-center gap-2">
                  <Settings2 className="w-4 h-4" />
                  <span>{labels[key]}</span>
                </div>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-md ${
                    isSel ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {masters[key].length}
                </span>
              </button>
            )
          })}

          {/* Company Accounts */}
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-3 py-2 mt-3">
            Company Accounts
          </p>
          <button
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold transition-all ${
              selected === 'selfAccounts'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-200/60'
            }`}
            onClick={() => setSelected('selfAccounts')}
          >
            <div className="flex items-center gap-2">
              <Settings2 className="w-4 h-4" />
              <span>Self Bank Accounts</span>
            </div>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-md ${
                selected === 'selfAccounts' ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-600'
              }`}
            >
              {selfAccounts.length}
            </span>
          </button>

          {/* Company Statutory & Eligibility Documents */}
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-3 py-2 mt-3">
            Company Documents
          </p>
          <button
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold transition-all ${
              selected === 'companyDocs'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-200/60'
            }`}
            onClick={() => setSelected('companyDocs')}
          >
            <div className="flex items-center gap-2">
              <FileCheck2 className="w-4 h-4" />
              <span>Eligibility & Financial Docs</span>
            </div>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${
                selected === 'companyDocs' ? 'bg-blue-700 text-white' : 'bg-blue-100 text-blue-800'
              }`}
            >
              {configuredDocsCount} / 5
            </span>
          </button>

          <button
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold transition-all ${
              selected === 'signatureSeal'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-200/60'
            }`}
            onClick={() => setSelected('signatureSeal')}
          >
            <div className="flex items-center gap-2">
              <Stamp className="w-4 h-4" />
              <span>Signature & Seal</span>
            </div>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${
                selected === 'signatureSeal'
                  ? 'bg-purple-700 text-white'
                  : companyDocs?.signatureDoc || companyDocs?.sealDoc
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              {companyDocs?.signatureDoc || companyDocs?.sealDoc ? 'Uploaded' : 'Optional'}
            </span>
          </button>
        </aside>

        {/* Content Pane */}
        <div className="p-7">
          {selected === 'companyDocs' ? (
            /* 4 Core Fields: Turnover, Networth, Experience, and Signature & Seal */
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 m-0">
                    Company Eligibility & Statutory Documents
                  </h2>
                  <p className="text-xs text-slate-500 m-1">
                    Upload and manage core company credential documents in PDF, Image, or Transparent PNG format.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="badge badge-green text-xs">Persistent Storage</span>
                  <span className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg">
                    {configuredDocsCount} of 5 Configured
                  </span>
                </div>
              </div>

              {/* Notice / Guidance */}
              <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200 text-xs text-blue-900 flex items-start gap-2.5">
                <FileCheck2 className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <strong>Permanent Organization Repository:</strong>
                  <p className="text-blue-800/80 mt-0.5">
                    Files uploaded here are saved for your company profile and can be referenced in <strong>Stage 01: Eligibility Check</strong>, <strong>Stage 04: Document Ready</strong>, and bid submission dossiers.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                {/* Field 1: Turnover */}
                <CompanyDocUploadCard
                  stepNum="FIELD 01"
                  id="turnoverDoc"
                  title="1. Turnover"
                  subtitle="Audited balance sheets, CA certified annual turnover certificate, or 3-year turnover summary."
                  doc={companyDocs?.turnoverDoc}
                  valueLabel="Annual / Average Turnover (₹ / Cr)"
                  valuePlaceholder="e.g. ₹ 938.73 Cr (3-Year MAAT) or ₹ 1,088.36 Cr"
                  notesLabel="Certificate Reference / Financial Years"
                  notesPlaceholder="e.g. FY 2021-22 to FY 2023-24 • CA Momin & Co."
                  onSave={doc => saveCompanyDoc('turnoverDoc', doc)}
                  onPreview={(doc, title) => setPreviewDoc({ ...doc, title })}
                  notify={notify}
                />

                {/* Field 2: Networth */}
                <CompanyDocUploadCard
                  stepNum="FIELD 02"
                  id="networthDoc"
                  title="2. Networth"
                  subtitle="Chartered Accountant Networth Certificate, capital reserve certificate, or financial solvency proof."
                  doc={companyDocs?.networthDoc}
                  valueLabel="Total Net Worth (₹ / Cr)"
                  valuePlaceholder="e.g. ₹ 482.92 Cr or ₹ 662.80 Cr"
                  notesLabel="Auditor UDIN / Certificate Reference"
                  notesPlaceholder="e.g. UDIN 26135345MAGIVP6707 • CA Hasan Bariawala"
                  onSave={doc => saveCompanyDoc('networthDoc', doc)}
                  onPreview={(doc, title) => setPreviewDoc({ ...doc, title })}
                  notify={notify}
                />

                {/* Field 3: Experience / Work Completion Certificate */}
                <CompanyDocUploadCard
                  stepNum="FIELD 03"
                  id="experienceDoc"
                  title="3. Experience / Work Completion Certificate"
                  subtitle="Client work completion certificates, past execution performance letter, LOA, or work orders."
                  doc={companyDocs?.experienceDoc}
                  valueLabel="Client Authority / Executed Capacity"
                  valuePlaceholder="e.g. APSPDCL (Andhra Pradesh DISCOM) • 36.76 MW Solar"
                  notesLabel="LOA / Certificate Ref & Issue Date"
                  notesPlaceholder="e.g. LOA NREDCAP/PMSG/SC&ST/07/2025/1123 dated 30.06.2026"
                  onSave={doc => saveCompanyDoc('experienceDoc', doc)}
                  onPreview={(doc, title) => setPreviewDoc({ ...doc, title })}
                  notify={notify}
                />

                {/* Field 4: Signature and Seal (Dual Upload Card: Signer Image/PDF & Seal Image/PDF) */}
                <SignatureAndSealCard
                  signatureDoc={companyDocs?.signatureDoc}
                  sealDoc={companyDocs?.sealDoc}
                  onSaveSignature={doc => saveCompanyDoc('signatureDoc', doc)}
                  onSaveSeal={doc => saveCompanyDoc('sealDoc', doc)}
                  onPreview={(doc, title) => setPreviewDoc({ ...doc, title })}
                  notify={notify}
                />
              </div>
            </div>
          ) : selected === 'signatureSeal' ? (
            /* Dedicated Signature and Seal Management View */
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 m-0">
                    Company Signature & Official Seal
                  </h2>
                  <p className="text-xs text-slate-500 m-1">
                    Upload and manage authorized signature and company seal stamp with strict transparent background verification.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="badge badge-green text-xs">Persistent Storage</span>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${
                    companyDocs?.signatureDoc || companyDocs?.sealDoc
                      ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                      : 'text-slate-600 bg-slate-50 border-slate-200'
                  }`}>
                    {companyDocs?.signatureDoc && companyDocs?.sealDoc
                      ? 'Both Uploaded'
                      : companyDocs?.signatureDoc || companyDocs?.sealDoc
                      ? 'Partially Uploaded'
                      : 'Optional • Not Uploaded'}
                  </span>
                </div>
              </div>

              {/* Guidelines Card */}
              <div className="p-4 rounded-xl bg-purple-50/70 border border-purple-200 text-xs text-purple-950 flex items-start gap-3">
                <Stamp className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <strong>Digital Signature & Stamp Requirements:</strong>
                  <p className="text-purple-900/80">
                    Signature and Company Seal can be uploaded as <strong>Transparent PNG images</strong> (100% transparent background) or <strong>PDF documents</strong>.
                    Images with white scanned paper borders or colored backgrounds are automatically rejected.
                  </p>
                </div>
              </div>

              <SignatureAndSealCard
                signatureDoc={companyDocs?.signatureDoc}
                sealDoc={companyDocs?.sealDoc}
                onSaveSignature={doc => saveCompanyDoc('signatureDoc', doc)}
                onSaveSeal={doc => saveCompanyDoc('sealDoc', doc)}
                onPreview={(doc, title) => setPreviewDoc({ ...doc, title })}
                notify={notify}
              />
            </div>
          ) : selected === 'selfAccounts' ? (
            /* Corporate Bank Accounts */
            <div>
              <div className="flex items-center justify-between pb-5 border-b border-slate-100 mb-6">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 m-0">Corporate Bank Accounts (Self Accounts)</h2>
                  <p className="text-xs text-slate-500 m-1">
                    Manage your company&apos;s configured bank accounts. These are automatically available in EMD Ready stage.
                  </p>
                </div>
                <span className="badge badge-green">Persistent Storage</span>
              </div>

              {/* Add Account Form */}
              <form onSubmit={handleAddBank} className="p-4 mb-6 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
                <h3 className="text-xs font-bold text-slate-800">Add New Company Bank Account</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">Bank Name *</label>
                    <input
                      required
                      value={newBank.bankName}
                      onChange={e => setNewBank({ ...newBank, bankName: e.target.value })}
                      placeholder="e.g. State Bank of India"
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">Account Holder Name</label>
                    <input
                      value={newBank.accountHolder}
                      onChange={e => setNewBank({ ...newBank, accountHolder: e.target.value })}
                      placeholder="e.g. Company Legal Name"
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">Account Number *</label>
                    <input
                      required
                      value={newBank.accountNo}
                      onChange={e => setNewBank({ ...newBank, accountNo: e.target.value })}
                      placeholder="e.g. 38920194821"
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-800 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">IFSC Code *</label>
                    <input
                      required
                      value={newBank.ifsc}
                      onChange={e => setNewBank({ ...newBank, ifsc: e.target.value.toUpperCase() })}
                      placeholder="e.g. SBIN0001234"
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-mono uppercase text-slate-800 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">Branch Name</label>
                    <input
                      value={newBank.branch}
                      onChange={e => setNewBank({ ...newBank, branch: e.target.value })}
                      placeholder="e.g. Industrial Area Branch"
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
                <div className="flex justify-end pt-1">
                  <button type="submit" className="primary-button text-xs py-1.5 px-3 flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" /> Save Corporate Account
                  </button>
                </div>
              </form>

              {/* List of Configured Accounts with Edit and Delete options */}
              <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                {selfAccounts.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500 italic bg-white">
                    No corporate bank accounts configured yet. Add your company&apos;s bank account above.
                  </div>
                ) : (
                  selfAccounts.map(account => {
                    const isEditing = editingBank?.originalAccountNo === account.accountNo

                    if (isEditing && editingBank) {
                      return (
                        <form
                          key={account.accountNo}
                          onSubmit={handleSaveBankEdit}
                          className="p-4 bg-blue-50/40 border-l-4 border-blue-500 space-y-3"
                        >
                          <div className="flex items-center justify-between pb-1">
                            <h4 className="text-xs font-bold text-blue-950 flex items-center gap-1.5">
                              <Pencil className="w-3.5 h-3.5 text-blue-600" />
                              <span>Edit Corporate Bank Account</span>
                            </h4>
                            <button
                              type="button"
                              onClick={() => setEditingBank(null)}
                              className="text-slate-400 hover:text-slate-600 text-xs inline-flex items-center gap-1"
                            >
                              <X className="w-3.5 h-3.5" />
                              <span>Cancel</span>
                            </button>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <label className="text-[11px] font-semibold text-slate-700 block mb-1">Bank Name *</label>
                              <input
                                required
                                value={editingBank.data.bankName}
                                onChange={e => setEditingBank({ ...editingBank, data: { ...editingBank.data, bankName: e.target.value } })}
                                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                              />
                            </div>
                            <div>
                              <label className="text-[11px] font-semibold text-slate-700 block mb-1">Account Holder Name</label>
                              <input
                                value={editingBank.data.accountHolder || ''}
                                onChange={e => setEditingBank({ ...editingBank, data: { ...editingBank.data, accountHolder: e.target.value } })}
                                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                              />
                            </div>
                            <div>
                              <label className="text-[11px] font-semibold text-slate-700 block mb-1">Account Number *</label>
                              <input
                                required
                                value={editingBank.data.accountNo}
                                onChange={e => setEditingBank({ ...editingBank, data: { ...editingBank.data, accountNo: e.target.value } })}
                                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-800 focus:outline-none focus:border-blue-500"
                              />
                            </div>
                            <div>
                              <label className="text-[11px] font-semibold text-slate-700 block mb-1">IFSC Code *</label>
                              <input
                                required
                                value={editingBank.data.ifsc}
                                onChange={e => setEditingBank({ ...editingBank, data: { ...editingBank.data, ifsc: e.target.value.toUpperCase() } })}
                                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono uppercase text-slate-800 focus:outline-none focus:border-blue-500"
                              />
                            </div>
                            <div className="md:col-span-2">
                              <label className="text-[11px] font-semibold text-slate-700 block mb-1">Branch Name</label>
                              <input
                                value={editingBank.data.branch || ''}
                                onChange={e => setEditingBank({ ...editingBank, data: { ...editingBank.data, branch: e.target.value } })}
                                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                              />
                            </div>
                          </div>
                          <div className="flex justify-end gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => setEditingBank(null)}
                              className="secondary-button text-xs py-1.5 px-3"
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              className="primary-button text-xs py-1.5 px-3 flex items-center gap-1"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Save Changes</span>
                            </button>
                          </div>
                        </form>
                      )
                    }

                    return (
                      <div
                        key={account.accountNo}
                        className="flex items-center justify-between px-4 py-3 bg-white hover:bg-slate-50 transition-colors"
                      >
                        <div>
                          <strong className="text-xs text-slate-900 block">{account.bankName}</strong>
                          <span className="text-[11px] text-slate-600 font-mono">
                            A/c: {account.accountNo} • IFSC: {account.ifsc}
                            {account.branch ? ` • Branch: ${account.branch}` : ''}
                          </span>
                          {account.accountHolder && (
                            <small className="text-[10px] text-slate-400 block">{account.accountHolder}</small>
                          )}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            type="button"
                            className="icon-action text-blue-600 hover:text-blue-800"
                            title={`Edit account ${account.accountNo}`}
                            onClick={() =>
                              setEditingBank({
                                originalAccountNo: account.accountNo,
                                data: { ...account },
                              })
                            }
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            className="icon-action delete"
                            title={`Delete account ${account.bankName} (${account.accountNo})`}
                            onClick={() => {
                              if (window.confirm(`Delete account ${account.bankName} (${account.accountNo})?`)) {
                                deleteSelfAccount(account.accountNo)
                              }
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          ) : (
            /* Master Categories with Edit and Delete options */
            <div>
              <div className="flex items-center justify-between pb-5 border-b border-slate-100 mb-6">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 m-0">{labels[selected]}</h2>
                  <p className="text-xs text-slate-500 m-1">
                    These values are populated in dropdown menus throughout tender forms.
                  </p>
                </div>
                <span className="badge badge-blue">Active Master</span>
              </div>

              {/* Add input */}
              <div className="flex gap-2 max-w-md mb-6">
                <input
                  value={newValue}
                  onChange={e => setNewValue(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                  placeholder={`Add new ${labels[selected].toLowerCase()}...`}
                  className="border border-slate-200 rounded-lg px-3 py-2 text-xs flex-1 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
                <button className="primary-button text-xs py-2" onClick={handleAdd}>
                  <Plus className="w-3.5 h-3.5" /> Add Value
                </button>
              </div>

              {/* List of items with Edit and Delete */}
              <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                {masters[selected].map(item => {
                  const isEditing = editingMaster?.original === item

                  if (isEditing && editingMaster) {
                    return (
                      <div
                        key={item}
                        className="flex items-center justify-between px-4 py-2.5 bg-blue-50/50 border-l-4 border-blue-500 transition-colors gap-2"
                      >
                        <input
                          type="text"
                          value={editingMaster.value}
                          onChange={e => setEditingMaster({ ...editingMaster, value: e.target.value })}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleSaveMasterEdit()
                            if (e.key === 'Escape') setEditingMaster(null)
                          }}
                          autoFocus
                          className="w-full bg-white border border-blue-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                        />
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button
                            type="button"
                            onClick={handleSaveMasterEdit}
                            className="primary-button text-xs py-1.5 px-3 flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700"
                            title="Save updated value"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Save</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingMaster(null)}
                            className="secondary-button text-xs py-1.5 px-2.5 flex items-center gap-1"
                            title="Cancel edit"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Cancel</span>
                          </button>
                        </div>
                      </div>
                    )
                  }

                  return (
                    <div
                      key={item}
                      className="flex items-center justify-between px-4 py-3 bg-white hover:bg-slate-50 transition-colors group"
                    >
                      <span className="text-xs font-medium text-slate-700">{item}</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          className="icon-action text-blue-600 hover:text-blue-800"
                          title={`Edit ${item}`}
                          onClick={() => setEditingMaster({ original: item, value: item })}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          className="icon-action delete"
                          title={`Delete ${item}`}
                          onClick={() => handleRemove(item)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Lightbox / Preview Modal for PDF and Images */}
      {previewDoc && (
        <div className="modal-backdrop">
          <div className="modal modal-wide" style={{ maxWidth: '850px' }}>
            <div className="modal-head">
              <div className="flex items-center gap-2">
                {getDocBadge(previewDoc.name, previewDoc.type)}
                <div>
                  <h2 className="text-base font-bold text-slate-900 m-0">{previewDoc.title}</h2>
                  <p className="text-xs text-slate-500 font-mono m-0 mt-0.5">{previewDoc.name}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {previewDoc.dataUrl && (
                  <button
                    type="button"
                    onClick={() => previewDoc.dataUrl && downloadFileFromUrl(previewDoc.dataUrl, previewDoc.name)}
                    className="secondary-button text-xs py-1.5 px-3 flex items-center gap-1.5"
                    title="Download file to computer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </button>
                )}
                <button type="button" onClick={() => setPreviewDoc(null)} title="Close">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div
              className="p-4 flex items-center justify-center min-h-[380px] max-h-[75vh] overflow-auto rounded-lg"
              style={
                previewDoc.type?.startsWith('image/') || /\.(jpg|jpeg|png|webp|bmp|gif)$/i.test(previewDoc.name)
                  ? checkerboardStyle
                  : { backgroundColor: '#f1f5f9' }
              }
            >
              {previewDoc.dataUrl ? (
                previewDoc.type?.startsWith('image/') || /\.(jpg|jpeg|png|webp|bmp|gif)$/i.test(previewDoc.name) ? (
                  <img
                    src={previewDoc.dataUrl}
                    alt={previewDoc.name}
                    className="max-h-[70vh] max-w-full object-contain rounded-lg shadow-md p-2"
                  />
                ) : (
                  <iframe
                    src={dataUrlToBlobUrl(previewDoc.dataUrl)}
                    className="w-full h-[70vh] rounded-lg border border-slate-300 bg-white shadow-sm"
                    title={previewDoc.name}
                  />
                )
              ) : (
                <div className="text-center p-8 text-slate-500">
                  <FileText className="w-12 h-12 mx-auto text-slate-400 mb-2" />
                  <p className="text-sm font-semibold">Preview not available for this file.</p>
                </div>
              )}
            </div>

            <div className="modal-foot justify-between">
              <span className="text-xs text-slate-500">
                {previewDoc.size ? formatBytes(previewDoc.size) : ''}
              </span>
              <button
                type="button"
                onClick={() => setPreviewDoc(null)}
                className="secondary-button text-xs py-1.5 px-4"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
