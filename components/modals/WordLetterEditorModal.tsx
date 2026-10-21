'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  AlertTriangle,
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Check,
  ChevronDown,
  Columns2,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileCode,
  FileDown,
  FileSpreadsheet,
  FileText,
  Heading1,
  Heading2,
  Highlighter,
  Image as ImageIcon,
  Italic,
  List,
  ListOrdered,
  Loader2,
  Maximize2,
  Minimize2,
  Palette,
  Pencil,
  Plus,
  Printer,
  Redo,
  RefreshCw,
  RotateCcw,
  Save,
  Sparkles,
  SplitSquareVertical,
  Strikethrough,
  Table as TableIcon,
  Trash2,
  Type,
  Underline as UnderlineIcon,
  Undo,
  UploadCloud,
  X,
} from 'lucide-react'
import { Tender, SampleDocumentItem, EligibilityDocument } from '@/types/tender'
import { CollectedDocument, formatFileSize } from '@/lib/document-ready-collector'
import {
  ConversionMethod,
  ConversionProgress,
  ConversionResult,
  OcrLanguage,
  convertDocumentToEditableHtml,
  stripOcrHighlights,
} from '@/lib/document-converter'
import { downloadHtmlAsDocx } from '@/lib/html-to-docx'

export interface WordDocumentEditorModalProps {
  tender: Tender
  doc: CollectedDocument
  onClose: () => void
  onSave?: (updatedDoc: {
    title: string
    fileName: string
    remarks?: string
    contentHtml: string
    dataUrl?: string
    fileSize?: number
    fileType?: string
    /** Present when the content was converted from the attached original file */
    sourceFileName?: string
    conversionMethod?: ConversionMethod
  }) => void
}

const CONVERSION_METHOD_LABELS: Record<ConversionMethod, string> = {
  'pdf-text': 'PDF text layer',
  'pdf-ocr': 'Scanned PDF · OCR',
  'pdf-mixed': 'PDF text + OCR',
  'image-ocr': 'Image · OCR',
  docx: 'Word document',
  text: 'Plain text',
}

/** Saved editor content is reused only when it was converted from this exact file. */
function isSavedConversionOf(doc: CollectedDocument, fileName: string): boolean {
  const saved = doc.letterContent
  return Boolean(saved?.contentHtml && saved.generatedBy === 'file-conversion' && saved.sourceFileName === fileName)
}

export function WordLetterEditorModal({
  tender,
  doc,
  onClose,
  onSave,
}: WordDocumentEditorModalProps) {
  // 1. View Mode: 'split' | 'editor' | 'preview'
  const [viewMode, setViewMode] = useState<'split' | 'editor' | 'preview'>(() => {
    return doc.dataUrl ? 'split' : 'editor'
  })

  // 2. Document Metadata State (Editable!)
  const [docTitle, setDocTitle] = useState<string>(doc.title)
  const [docFileName, setDocFileName] = useState<string>(doc.fileName)
  const [docRemarks, setDocRemarks] = useState<string>(doc.remarks || '')
  const [docDataUrl, setDocDataUrl] = useState<string | undefined>(doc.dataUrl)
  const [docFileSize, setDocFileSize] = useState<number | undefined>(doc.fileSize)
  const [docFileType, setDocFileType] = useState<string>(doc.fileType)
  const hasOriginalFile = Boolean(docDataUrl)

  // 3. Rich Document Content (HTML) — always the converted content of the
  // original attached file, or the user's own saved edits of that conversion.
  const editorRef = useRef<HTMLDivElement>(null)
  const savedConversion = isSavedConversionOf(doc, doc.fileName)
  const [documentHtml, setDocumentHtml] = useState<string>(() => {
    if (savedConversion) return doc.letterContent.contentHtml
    // No original file to convert: show the user's own previously saved text, if any
    if (!doc.dataUrl && doc.letterContent?.contentHtml) return doc.letterContent.contentHtml
    return ''
  })

  // 4. Conversion state (Original file → text extraction / OCR → editable document)
  const [conversionStatus, setConversionStatus] = useState<'idle' | 'converting' | 'done' | 'error'>(
    savedConversion ? 'done' : 'idle'
  )
  const [conversionProgress, setConversionProgress] = useState<ConversionProgress | null>(null)
  const [conversionResult, setConversionResult] = useState<ConversionResult | null>(null)
  const [conversionError, setConversionError] = useState<string | null>(null)
  const [conversionMethod, setConversionMethod] = useState<ConversionMethod | undefined>(
    savedConversion ? doc.letterContent.conversionMethod : undefined
  )
  const [convertedFromFile, setConvertedFromFile] = useState<string | undefined>(
    savedConversion ? doc.letterContent.sourceFileName : undefined
  )
  const [ocrLanguage, setOcrLanguage] = useState<OcrLanguage>('eng')
  const [showWarnings, setShowWarnings] = useState(true)
  const [isDownloadingWord, setIsDownloadingWord] = useState(false)
  const conversionAbortRef = useRef<AbortController | null>(null)

  const runConversion = useCallback(
    async (source: { dataUrl: string; fileName: string; fileType?: string }, lang: OcrLanguage) => {
      conversionAbortRef.current?.abort()
      const controller = new AbortController()
      conversionAbortRef.current = controller

      setConversionStatus('converting')
      setConversionError(null)
      setConversionResult(null)
      setConvertedFromFile(undefined)
      setConversionMethod(undefined)
      setConversionProgress({ message: 'Preparing conversion…' })
      setDocumentHtml('')
      if (editorRef.current) editorRef.current.innerHTML = ''

      try {
        const result = await convertDocumentToEditableHtml(source, {
          ocrLanguage: lang,
          signal: controller.signal,
          onProgress: p => {
            if (!controller.signal.aborted) setConversionProgress(p)
          },
        })
        if (controller.signal.aborted) return
        setConversionResult(result)
        setConversionMethod(result.method)
        setConvertedFromFile(result.sourceFileName)
        setDocumentHtml(result.html)
        setShowWarnings(true)
        setConversionStatus('done')
      } catch (err: any) {
        if (controller.signal.aborted || err?.name === 'AbortError') return
        console.error('Document conversion failed:', err)
        setConversionError(err?.message || 'The document could not be converted.')
        setConversionStatus('error')
      } finally {
        if (conversionAbortRef.current === controller) setConversionProgress(null)
      }
    },
    []
  )

  // Convert the original attached file when the editor opens (unless the user
  // already saved edits of a conversion of this same file)
  useEffect(() => {
    if (!savedConversion && doc.dataUrl) {
      runConversion({ dataUrl: doc.dataUrl, fileName: doc.fileName, fileType: doc.fileType }, ocrLanguage)
    }
    return () => conversionAbortRef.current?.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleReconvert = (lang: OcrLanguage = ocrLanguage) => {
    if (!docDataUrl) return
    if (
      conversionStatus === 'done' &&
      !window.confirm('Re-convert from the original file? Edits made in the Word editor will be replaced.')
    ) {
      return
    }
    runConversion({ dataUrl: docDataUrl, fileName: docFileName, fileType: docFileType }, lang)
  }

  const handleClearOcrHighlights = () => {
    const current = editorRef.current ? editorRef.current.innerHTML : documentHtml
    const cleaned = stripOcrHighlights(current)
    setDocumentHtml(cleaned)
    if (editorRef.current) editorRef.current.innerHTML = cleaned
  }

  // Sync ref on initial load, reset, or when the editor pane is re-mounted
  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== documentHtml) {
      editorRef.current.innerHTML = documentHtml
    }
  }, [documentHtml, viewMode])

  // State for UI feedback
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Toolbar Formatting Helpers
  const applyFormat = (command: string, value: string | undefined = undefined) => {
    document.execCommand(command, false, value)
    if (editorRef.current) {
      setDocumentHtml(editorRef.current.innerHTML)
    }
  }

  // Handle Font Size
  const handleFontSizeChange = (pt: string) => {
    const ptNum = parseInt(pt, 10)
    let cmdSize = '3'
    if (ptNum <= 9) cmdSize = '1'
    else if (ptNum <= 10) cmdSize = '2'
    else if (ptNum <= 12) cmdSize = '3'
    else if (ptNum <= 14) cmdSize = '4'
    else if (ptNum <= 18) cmdSize = '5'
    else cmdSize = '6'
    applyFormat('fontSize', cmdSize)
  }

  // Handle Adding a Table row
  const handleInsertTableRow = () => {
    if (!editorRef.current) return
    const sel = window.getSelection()
    if (!sel || !sel.anchorNode) return

    let node: Node | null = sel.anchorNode
    while (node && node !== editorRef.current && node.nodeName !== 'TR') {
      node = node.parentNode
    }

    if (node && node.nodeName === 'TR') {
      const tr = node as HTMLTableRowElement
      const newTr = tr.cloneNode(true) as HTMLTableRowElement
      // Clear text of cloned cells
      Array.from(newTr.cells).forEach(cell => {
        cell.innerHTML = '&nbsp;'
      })
      tr.parentNode?.insertBefore(newTr, tr.nextSibling)
      setDocumentHtml(editorRef.current.innerHTML)
    } else {
      // Insert simple table at selection or at end
      applyFormat(
        'insertHTML',
        `<table style="width:100%; border-collapse:collapse; margin:10px 0;">
          <tbody>
            <tr>
              <td style="border:1px solid #000; padding:2pt 4pt;">&nbsp;</td>
              <td style="border:1px solid #000; padding:2pt 4pt;">&nbsp;</td>
              <td style="border:1px solid #000; padding:2pt 4pt;">&nbsp;</td>
            </tr>
            <tr>
              <td style="border:1px solid #000; padding:2pt 4pt;">&nbsp;</td>
              <td style="border:1px solid #000; padding:2pt 4pt;">&nbsp;</td>
              <td style="border:1px solid #000; padding:2pt 4pt;">&nbsp;</td>
            </tr>
          </tbody>
        </table>`
      )
    }
  }

  // Handle File Replacement from inside the editor
  const handleReplaceAttachedFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string
      const fileType = file.type || 'application/octet-stream'
      setDocDataUrl(dataUrl)
      setDocFileName(file.name)
      setDocFileSize(file.size)
      setDocFileType(fileType)
      setViewMode('split')
      // The new original becomes the conversion source
      runConversion({ dataUrl, fileName: file.name, fileType }, ocrLanguage)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  // Handle Download Word (.docx)
  const handleDownloadWord = async () => {
    const currentHtml = editorRef.current ? editorRef.current.innerHTML : documentHtml
    if (!currentHtml.trim()) {
      window.alert('The Word document is empty — there is nothing to download yet.')
      return
    }
    setIsDownloadingWord(true)
    try {
      await downloadHtmlAsDocx(currentHtml, docTitle, docFileName)
    } catch (err: any) {
      console.error('DOCX export failed:', err)
      window.alert(`Could not create the Word (.docx) file: ${err?.message || err}`)
    } finally {
      setIsDownloadingWord(false)
    }
  }

  // Handle Download PDF (Print)
  const handleDownloadPdf = () => {
    window.print()
  }

  // Handle Download Original File
  const handleDownloadOriginal = () => {
    if (docDataUrl) {
      const a = document.createElement('a')
      a.href = docDataUrl
      a.download = docFileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      return
    }

    // Fallback: download text record
    const content = `DOCUMENT RECORD: ${docTitle}\nFile: ${docFileName}\nOrigin: ${doc.stageOrigin}\n\n${editorRef.current?.innerText || ''}`
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${docFileName}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Handle Save Changes
  const handleSave = () => {
    setIsSaving(true)
    const currentHtml = editorRef.current ? editorRef.current.innerHTML : documentHtml

    if (onSave) {
      onSave({
        title: docTitle.trim() || doc.title,
        fileName: docFileName.trim() || doc.fileName,
        remarks: docRemarks,
        contentHtml: currentHtml,
        dataUrl: docDataUrl,
        fileSize: docFileSize,
        fileType: docFileType,
        sourceFileName: convertedFromFile,
        conversionMethod,
      })
    }

    setSaveSuccess(true)
    setIsSaving(false)
    setTimeout(() => {
      setSaveSuccess(false)
      onClose()
    }, 800)
  }

  return (
    <div className="fixed inset-0 z-[120] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div
        className={`bg-slate-100 rounded-2xl shadow-2xl border border-slate-700 flex flex-col w-full transition-all duration-200 ${
          isExpanded ? 'max-w-[99vw] h-[98vh]' : 'max-w-[1360px] h-[92vh]'
        }`}
      >
        {/* Header Bar */}
        <header className="no-print flex items-center justify-between px-5 py-3 bg-white border-b border-slate-200 rounded-t-2xl flex-shrink-0 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20 font-bold">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                  {doc.stageOrigin} • {doc.sourceLabel}
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                  {docFileName} {docFileSize ? `(${formatFileSize(docFileSize)})` : ''}
                </span>
              </div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 mt-0.5 flex items-center gap-2">
                {docTitle}
              </h3>
            </div>
          </div>

          {/* Center: View Switcher */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 gap-1 text-xs">
            {hasOriginalFile && (
              <button
                type="button"
                onClick={() => setViewMode('split')}
                className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all ${
                  viewMode === 'split'
                    ? 'bg-white text-blue-700 shadow-sm border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="View Original Attached File on the left and Editable Word Document on the right"
              >
                <Columns2 className="w-3.5 h-3.5" /> Split View
              </button>
            )}

            <button
              type="button"
              onClick={() => setViewMode('editor')}
              className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all ${
                viewMode === 'editor'
                  ? 'bg-white text-blue-700 shadow-sm border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Full width Editable Word Document"
            >
              <Pencil className="w-3.5 h-3.5" /> Word Document Editor
            </button>

            {hasOriginalFile && (
              <button
                type="button"
                onClick={() => setViewMode('preview')}
                className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all ${
                  viewMode === 'preview'
                    ? 'bg-white text-blue-700 shadow-sm border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Full width Original File Viewer"
              >
                <Eye className="w-3.5 h-3.5" /> Original File ({docFileName})
              </button>
            )}
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Download Word (.docx) */}
            <button
              type="button"
              onClick={handleDownloadWord}
              disabled={isDownloadingWord || conversionStatus === 'converting'}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 shadow-sm shadow-blue-500/20 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              title="Download the converted document as an editable Microsoft Word (.docx) file"
            >
              {isDownloadingWord ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileDown className="w-3.5 h-3.5" />
              )}{' '}
              Download Word (.docx)
            </button>

            {/* Download PDF */}
            <button
              type="button"
              onClick={handleDownloadPdf}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
              title="Download or Print PDF"
            >
              <Printer className="w-3.5 h-3.5" /> Download PDF
            </button>

            {/* Save Changes */}
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold text-white transition-all shadow-sm ${
                saveSuccess
                  ? 'bg-emerald-600 ring-2 ring-emerald-400'
                  : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20'
              }`}
            >
              {saveSuccess ? (
                <>
                  <Check className="w-3.5 h-3.5" /> Saved!
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" /> Save Changes
                </>
              )}
            </button>

            {/* Expand Toggle */}
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
              title={isExpanded ? 'Restore size' : 'Expand full screen'}
            >
              {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Close */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Subheader: Document info & Re-sync with Attached File */}
        <div className="no-print bg-slate-50 border-b border-slate-200 px-5 py-2.5 flex items-center justify-between gap-4 flex-wrap text-xs">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-semibold text-slate-700 flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  conversionStatus === 'error'
                    ? 'bg-red-500'
                    : conversionStatus === 'converting'
                    ? 'bg-amber-500 animate-pulse'
                    : conversionStatus === 'done'
                    ? 'bg-emerald-500'
                    : 'bg-slate-400'
                }`}
              ></span>
              Converted Document:
            </span>
            {conversionStatus === 'converting' && (
              <span className="bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-1 rounded-md font-semibold text-[11px] flex items-center gap-1">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />
                Converting {docFileName}…
              </span>
            )}
            {conversionStatus === 'done' && (
              <span
                className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded-md font-semibold text-[11px] flex items-center gap-1"
                title={convertedFromFile ? `Content extracted from ${convertedFromFile}` : undefined}
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                {conversionResult
                  ? `Converted from ${conversionResult.sourceFileName} · ${conversionResult.pageCount} page${conversionResult.pageCount === 1 ? '' : 's'} · ${CONVERSION_METHOD_LABELS[conversionResult.method]}${conversionResult.ocrConfidence !== undefined ? ` (${conversionResult.ocrConfidence}% OCR confidence)` : ''} · ${conversionResult.tableCount} table${conversionResult.tableCount === 1 ? '' : 's'}`
                  : `Your saved edits of ${convertedFromFile}${conversionMethod ? ` · ${CONVERSION_METHOD_LABELS[conversionMethod]}` : ''}`}
              </span>
            )}
            {conversionStatus === 'error' && (
              <span className="bg-red-50 text-red-700 border border-red-200 px-2.5 py-1 rounded-md font-semibold text-[11px] flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> Conversion failed
              </span>
            )}
            {conversionStatus === 'idle' && (
              <span className="bg-slate-100 text-slate-600 border border-slate-200 px-2.5 py-1 rounded-md font-semibold text-[11px]">
                {hasOriginalFile ? 'Not converted yet' : 'No original file attached'}
              </span>
            )}

            <button
              type="button"
              onClick={() => handleReconvert()}
              disabled={!hasOriginalFile || conversionStatus === 'converting'}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-md transition-colors shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
              title="Extract the content of the original attached file again (text layer / OCR)"
            >
              <RotateCcw className="w-3 h-3 text-slate-500" /> Re-convert from Original File
            </button>

            <label className="flex items-center gap-1 text-slate-500 font-medium" title="Language used for OCR of scanned pages and images">
              OCR:
              <select
                value={ocrLanguage}
                onChange={e => {
                  const lang = e.target.value as OcrLanguage
                  setOcrLanguage(lang)
                  const usedOcr = conversionResult ? conversionResult.ocrPages.length > 0 : false
                  if (usedOcr) handleReconvert(lang)
                }}
                disabled={conversionStatus === 'converting'}
                className="bg-white border border-slate-300 rounded-md px-1.5 py-0.5 text-xs text-slate-700 focus:outline-none"
              >
                <option value="eng">English</option>
                <option value="eng+hin">English + हिन्दी</option>
              </select>
            </label>

            <span className="text-slate-300">|</span>

            <div className="flex items-center gap-2">
              <span className="text-slate-500 font-medium">Document Title:</span>
              <input
                type="text"
                value={docTitle}
                onChange={e => setDocTitle(e.target.value)}
                className="bg-white border border-slate-300 rounded-md px-2.5 py-1 text-xs font-semibold text-slate-800 focus:outline-none focus:border-blue-500 min-w-[260px] shadow-xs"
                placeholder="Document Title"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* File Replacement Input */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleReplaceAttachedFile}
              className="hidden"
              accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors"
              title="Replace or upload a new file for this document"
            >
              <UploadCloud className="w-3.5 h-3.5 text-amber-600" /> Replace Attached File
            </button>

            {docDataUrl && (
              <button
                type="button"
                onClick={handleDownloadOriginal}
                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-semibold underline"
                title="Download original file"
              >
                <Download className="w-3 h-3" /> Original ({docFileName})
              </button>
            )}
          </div>
        </div>

        {/* Main Workspace Body */}
        <div className="flex-1 flex overflow-hidden">
          {/* LEFT: ORIGINAL FILE VIEWER (Split or Preview Mode) */}
          {(viewMode === 'split' || viewMode === 'preview') && (
            <div
              className={`flex flex-col bg-slate-900 border-r border-slate-300 overflow-hidden ${
                viewMode === 'split' ? 'w-1/2' : 'w-full'
              }`}
            >
              <div className="px-4 py-2 bg-slate-800 text-slate-200 flex items-center justify-between text-xs border-b border-slate-700 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  <span className="font-bold tracking-wide">ORIGINAL ATTACHED FILE</span>
                  <span className="font-mono text-slate-400">({docFileName})</span>
                </div>
                {docDataUrl && (
                  <a
                    href={docDataUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-blue-300 hover:text-white font-medium"
                  >
                    Open Full Window <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>

              <div className="flex-1 overflow-auto p-2 flex items-center justify-center bg-slate-900/90">
                {docDataUrl ? (
                  docFileType?.includes('image') ||
                  docFileName.match(/\.(jpg|jpeg|png|webp|gif|svg)$/i) ? (
                    <img
                      src={docDataUrl}
                      alt={docFileName}
                      className="max-h-full max-w-full object-contain rounded-lg shadow-lg border border-slate-700"
                    />
                  ) : (
                    <iframe
                      src={docDataUrl}
                      title={docFileName}
                      className="w-full h-full min-h-[500px] rounded-lg border border-slate-700 bg-white"
                    />
                  )
                ) : (
                  <div className="text-center p-8 text-slate-400">
                    <FileText className="w-16 h-16 mx-auto mb-3 opacity-30 text-slate-500" />
                    <p className="font-bold text-slate-300 text-sm">{docFileName}</p>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm">
                      Original file preview is available in offline storage or download. You can
                      view and edit the formatted Word document on the right.
                    </p>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="mt-4 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                    >
                      <UploadCloud className="w-3.5 h-3.5" /> Attach / Upload File
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* RIGHT: EDITABLE WORD DOCUMENT WORKSPACE */}
          {(viewMode === 'split' || viewMode === 'editor') && (
            <div
              className={`flex flex-col bg-slate-200 overflow-hidden ${
                viewMode === 'split' ? 'w-1/2' : 'w-full'
              }`}
            >
              {/* Word Formatting Toolbar */}
              <div className="no-print bg-white border-b border-slate-300 p-2 flex items-center gap-1 flex-wrap flex-shrink-0 text-xs shadow-sm">
                {/* Font Family */}
                <select
                  onChange={e => applyFormat('fontName', e.target.value)}
                  className="h-7 px-2 border border-slate-300 rounded text-xs text-slate-700 bg-white font-medium focus:outline-none"
                  defaultValue="Calibri"
                >
                  <option value="Calibri">Calibri</option>
                  <option value="Mangal">Mangal (हिन्दी Unicode)</option>
                  <option value="Arial Unicode MS">Arial Unicode MS</option>
                  <option value="Nirmala UI">Nirmala UI</option>
                  <option value="Times New Roman">Times New Roman</option>
                  <option value="Arial">Arial</option>
                  <option value="Segoe UI">Segoe UI</option>
                </select>

                {/* Font Size */}
                <select
                  onChange={e => handleFontSizeChange(e.target.value)}
                  className="h-7 px-1.5 border border-slate-300 rounded text-xs text-slate-700 bg-white font-medium focus:outline-none w-14"
                  defaultValue="11pt"
                >
                  <option value="9pt">9pt</option>
                  <option value="10pt">10pt</option>
                  <option value="11pt">11pt</option>
                  <option value="12pt">12pt</option>
                  <option value="14pt">14pt</option>
                  <option value="16pt">16pt</option>
                  <option value="18pt">18pt</option>
                  <option value="22pt">22pt</option>
                </select>

                <div className="h-5 w-[1px] bg-slate-300 mx-1" />

                {/* Basic Styling */}
                <button
                  type="button"
                  onClick={() => applyFormat('bold')}
                  className="p-1.5 rounded hover:bg-slate-100 text-slate-700 font-bold"
                  title="Bold (Ctrl+B)"
                >
                  <Bold className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => applyFormat('italic')}
                  className="p-1.5 rounded hover:bg-slate-100 text-slate-700 italic"
                  title="Italic (Ctrl+I)"
                >
                  <Italic className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => applyFormat('underline')}
                  className="p-1.5 rounded hover:bg-slate-100 text-slate-700 underline"
                  title="Underline (Ctrl+U)"
                >
                  <UnderlineIcon className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => applyFormat('strikeThrough')}
                  className="p-1.5 rounded hover:bg-slate-100 text-slate-700"
                  title="Strikethrough"
                >
                  <Strikethrough className="w-3.5 h-3.5" />
                </button>

                <div className="h-5 w-[1px] bg-slate-300 mx-1" />

                {/* Alignment */}
                <button
                  type="button"
                  onClick={() => applyFormat('justifyLeft')}
                  className="p-1.5 rounded hover:bg-slate-100 text-slate-700"
                  title="Align Left"
                >
                  <AlignLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => applyFormat('justifyCenter')}
                  className="p-1.5 rounded hover:bg-slate-100 text-slate-700"
                  title="Align Center"
                >
                  <AlignCenter className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => applyFormat('justifyRight')}
                  className="p-1.5 rounded hover:bg-slate-100 text-slate-700"
                  title="Align Right"
                >
                  <AlignRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => applyFormat('justifyFull')}
                  className="p-1.5 rounded hover:bg-slate-100 text-slate-700"
                  title="Justify"
                >
                  <AlignJustify className="w-3.5 h-3.5" />
                </button>

                <div className="h-5 w-[1px] bg-slate-300 mx-1" />

                {/* Lists */}
                <button
                  type="button"
                  onClick={() => applyFormat('insertUnorderedList')}
                  className="p-1.5 rounded hover:bg-slate-100 text-slate-700"
                  title="Bulleted List"
                >
                  <List className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => applyFormat('insertOrderedList')}
                  className="p-1.5 rounded hover:bg-slate-100 text-slate-700"
                  title="Numbered List"
                >
                  <ListOrdered className="w-3.5 h-3.5" />
                </button>

                {/* Add Table Row / Table */}
                <button
                  type="button"
                  onClick={handleInsertTableRow}
                  className="p-1.5 rounded hover:bg-slate-100 text-blue-700 font-semibold flex items-center gap-1 border border-blue-200 bg-blue-50/50"
                  title="Insert table or duplicate row"
                >
                  <TableIcon className="w-3.5 h-3.5" /> + Row
                </button>

                <div className="h-5 w-[1px] bg-slate-300 mx-1" />

                {/* Color Picker */}
                <div className="flex items-center gap-1">
                  <Palette className="w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="color"
                    onChange={e => applyFormat('foreColor', e.target.value)}
                    className="w-5 h-5 rounded cursor-pointer border-0 p-0"
                    title="Text Color"
                    defaultValue="#0f172a"
                  />
                </div>

                <div className="h-5 w-[1px] bg-slate-300 mx-1" />

                {/* Undo / Redo */}
                <button
                  type="button"
                  onClick={() => applyFormat('undo')}
                  className="p-1.5 rounded hover:bg-slate-100 text-slate-700"
                  title="Undo (Ctrl+Z)"
                >
                  <Undo className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => applyFormat('redo')}
                  className="p-1.5 rounded hover:bg-slate-100 text-slate-700"
                  title="Redo (Ctrl+Y)"
                >
                  <Redo className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* A4 Document Viewport */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col items-center gap-3">
                {/* Conversion warnings (OCR confidence, skipped content, limitations) */}
                {conversionStatus === 'done' && conversionResult && conversionResult.warnings.length > 0 && (
                  <div className="no-print w-full max-w-[820px] bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 shadow-sm">
                    <div className="flex items-center justify-between px-3 py-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setShowWarnings(!showWarnings)}
                        className="font-semibold flex items-center gap-1.5"
                      >
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                        {conversionResult.warnings.length} conversion note
                        {conversionResult.warnings.length === 1 ? '' : 's'} — please review against the original
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showWarnings ? 'rotate-180' : ''}`} />
                      </button>
                      {conversionResult.lowConfidenceWords > 0 && (
                        <button
                          type="button"
                          onClick={handleClearOcrHighlights}
                          className="px-2 py-0.5 rounded border border-amber-300 bg-white hover:bg-amber-100 font-semibold"
                          title="Remove the yellow review highlights once you have checked the text"
                        >
                          Clear OCR highlights
                        </button>
                      )}
                    </div>
                    {showWarnings && (
                      <ul className="px-3 pb-2 space-y-1 list-disc list-inside">
                        {conversionResult.warnings.map((w, i) => (
                          <li key={i}>
                            {w.page ? <strong>Page {w.page}: </strong> : null}
                            {w.message}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {/* A4 Paper Container */}
                <div className="relative bg-white text-slate-900 shadow-2xl rounded-sm border border-slate-300 w-full max-w-[820px] min-h-[1050px] p-8 sm:p-12 transition-all">
                  {conversionStatus === 'converting' && (
                    <div className="no-print absolute inset-0 z-10 bg-white/95 flex flex-col items-center justify-start pt-40 px-8 text-center">
                      <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-4" />
                      <p className="text-sm font-bold text-slate-800">Converting original file to an editable document</p>
                      <p className="text-xs text-slate-500 mt-1 font-mono break-all">{docFileName}</p>
                      <p className="text-xs text-slate-600 mt-4">{conversionProgress?.message || 'Working…'}</p>
                      {conversionProgress?.total ? (
                        <div className="w-full max-w-sm mt-3">
                          <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-600 transition-all duration-300"
                              style={{
                                width: `${Math.round(
                                  (((conversionProgress.current || 1) - 1 + (conversionProgress.fraction ?? 0.5)) /
                                    conversionProgress.total) *
                                    100
                                )}%`,
                              }}
                            />
                          </div>
                          <p className="text-[11px] text-slate-500 mt-1">
                            Page {conversionProgress.current} of {conversionProgress.total}
                          </p>
                        </div>
                      ) : null}
                      <p className="text-[11px] text-slate-400 mt-6 max-w-sm">
                        Text-based pages are read directly from the PDF. Scanned pages and images are recognised with
                        OCR, which can take a few seconds per page.
                      </p>
                    </div>
                  )}

                  {conversionStatus === 'error' && (
                    <div className="no-print flex flex-col items-center text-center pt-32 px-6">
                      <AlertTriangle className="w-10 h-10 text-red-500 mb-3" />
                      <p className="text-sm font-bold text-slate-800">The original file could not be converted</p>
                      <p className="text-xs text-red-700 mt-2 max-w-md bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                        {conversionError}
                      </p>
                      <div className="flex items-center gap-2 mt-4">
                        <button
                          type="button"
                          onClick={() => handleReconvert()}
                          className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                        >
                          <RotateCcw className="w-3.5 h-3.5" /> Try Again
                        </button>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5"
                        >
                          <UploadCloud className="w-3.5 h-3.5" /> Upload a Different File
                        </button>
                      </div>
                    </div>
                  )}

                  {conversionStatus === 'idle' && !hasOriginalFile && !documentHtml && (
                    <div className="no-print absolute inset-x-0 top-24 text-center px-8 pointer-events-none">
                      <FileText className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                      <p className="text-sm font-semibold text-slate-600">No original file attached</p>
                      <p className="text-xs text-slate-500 mt-1">
                        Attach the original PDF or image to convert it into this editable document.
                      </p>
                    </div>
                  )}

                  {/* The Live ContentEditable Page */}
                  <div
                    ref={editorRef}
                    contentEditable={conversionStatus !== 'converting'}
                    suppressContentEditableWarning
                    onInput={() => {
                      if (editorRef.current) {
                        setDocumentHtml(editorRef.current.innerHTML)
                      }
                    }}
                    className={`outline-none min-h-[850px] font-sans text-slate-900 focus:ring-0 leading-relaxed ${
                      conversionStatus === 'error' ? 'hidden' : ''
                    }`}
                    style={{
                      fontFamily: 'Calibri, Mangal, Arial, sans-serif',
                      fontSize: '11pt',
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer info bar */}
        <footer className="no-print bg-white border-t border-slate-200 px-5 py-2 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>
              Editing document: <strong>{docTitle}</strong> • Changes will be saved to stage{' '}
              <strong>{doc.stageOrigin}</strong>
            </span>
          </div>
          <div>
            <span>Microsoft Word (.docx) &amp; A4 Print Ready</span>
          </div>
        </footer>
      </div>
    </div>
  )
}
