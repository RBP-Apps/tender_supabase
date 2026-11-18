'use client'

import React, { useEffect, useState, useRef } from 'react'
import {
  Download,
  ExternalLink,
  Eye,
  FileText,
  Image as ImageIcon,
  Paperclip,
  X,
  Bot,
  Sparkles,
  Send,
  Copy,
  Check,
  Loader2,
  HelpCircle,
  PanelRightClose,
  PanelRightOpen,
  FileSearch,
  ShieldCheck,
  AlertCircle,
  RotateCcw,
} from 'lucide-react'
import { dataUrlToBlobUrl } from '@/lib/utils'
import { MarkdownContent } from '@/components/chat/MarkdownContent'
import { SourceCitationCard } from '@/components/chat/SourceCitationCard'
import { parseFileForChat, ParsedFileInfo, formatFileSize } from '@/lib/document-parser'
import { parseTextOrCsvDocument } from '@/lib/universal-document-parser'
import { DocumentSourceCitation, ProcessingProgress } from '@/types/document-understanding'

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

interface ModalChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  sources?: DocumentSourceCitation[]
  verification?: {
    confidence: string
    isVerified: boolean
    auditNotes?: string
  }
}

function dataUrlToFile(dataUrl: string, filename: string): File {
  const parts = dataUrl.split(',')
  const mime = parts[0].match(/:(.*?);/)?.[1] || 'application/pdf'
  const binary = atob(parts[1])
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  const blob = new Blob([bytes], { type: mime })
  return new File([blob], filename, { type: mime })
}

const QUICK_PROMPTS = [
  'What are the key requirements and eligibility criteria?',
  'What are the EMD, tender fee & financial conditions?',
  'Is MAF, Test Report, or BIS certificate required?',
  'Summarize important dates, deadlines and penalty clauses.',
]

export function DocumentPreviewModal({
  document,
  onClose,
  onDownloadWord,
}: DocumentPreviewModalProps) {
  // Modal keyboard listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // AI Assistant state
  const [isAiOpen, setIsAiOpen] = useState(false)
  const [queryInput, setQueryInput] = useState('')
  const [isAiLoading, setIsAiLoading] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ModalChatMessage[]>([])
  const [parsingProgress, setParsingProgress] = useState<ProcessingProgress | null>(null)

  // Cached parsed document representation
  const parsedDocRef = useRef<ParsedFileInfo | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Reset state when document changes
  useEffect(() => {
    parsedDocRef.current = null
    setMessages([])
    setIsAiLoading(false)
    setParsingProgress(null)
  }, [document?.name, document?.dataUrl])

  useEffect(() => {
    if (isAiOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isAiLoading, isAiOpen])

  if (!document) return null

  const name = document.name || 'Document'
  const nameLower = name.toLowerCase()
  const isImage =
    document.type?.startsWith('image/') ||
    nameLower.match(/\.(jpg|jpeg|png|webp|gif|bmp|svg)$/)
  const isPdf =
    document.type === 'application/pdf' ||
    nameLower.endsWith('.pdf')

  // Parse document for AI context if not already parsed
  const getOrParseDocument = async (): Promise<ParsedFileInfo> => {
    if (parsedDocRef.current) return parsedDocRef.current

    if (document.textContent) {
      const parsedText = await parseTextOrCsvDocument(
        document.textContent,
        name,
        nameLower.endsWith('.csv')
      )
      const parsed: ParsedFileInfo = {
        name,
        type: document.type || 'text/plain',
        size: document.size || document.textContent.length,
        extractedText: parsedText.extractedText,
        chunks: parsedText.chunks,
        rowCount: parsedText.rowCount,
      }
      parsedDocRef.current = parsed
      return parsed
    }

    if (document.dataUrl) {
      if (isPdf) {
        const file = dataUrlToFile(document.dataUrl, name)
        const parsed = await parseFileForChat(file, progress => {
          setParsingProgress(progress)
        })
        parsedDocRef.current = parsed
        return parsed
      }

      if (isImage) {
        const parsed: ParsedFileInfo = {
          name,
          type: document.type || 'image/jpeg',
          size: document.size || 0,
          dataUrl: document.dataUrl,
          extractedText: `Image document: ${name}`,
          isImage: true,
          chunks: [
            {
              id: `${name}-img-chunk`,
              docName: name,
              docType: 'image',
              sectionTitle: 'Image Content',
              content: `Visual Document Image: ${name}`,
              charCount: 50,
              dataUrl: document.dataUrl,
            },
          ],
        }
        parsedDocRef.current = parsed
        return parsed
      }
    }

    // Default fallback
    const fallback: ParsedFileInfo = {
      name,
      type: document.type || 'application/octet-stream',
      size: document.size || 0,
      extractedText: document.referenceNote || name,
      chunks: [
        {
          id: `${name}-fallback-chunk`,
          docName: name,
          docType: 'text',
          sectionTitle: 'Document Reference',
          content: `${name}\n${document.referenceNote || ''}\n${document.matchReason || ''}`,
          charCount: (name + (document.referenceNote || '')).length,
        },
      ],
    }
    parsedDocRef.current = fallback
    return fallback
  }

  // Handle Ask AI Query
  const handleAskQuestion = async (overrideText?: string) => {
    const question = (overrideText ?? queryInput).trim()
    if (!question || isAiLoading) return

    setQueryInput('')
    const userMsg: ModalChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: question,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }

    const updated = [...messages, userMsg]
    setMessages(updated)
    setIsAiLoading(true)

    try {
      // 1. Get parsed document
      const parsed = await getOrParseDocument()
      setParsingProgress(null)

      // 2. Call backend AI query engine
      const res = await fetch('/api/tender-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updated.map(m => ({ role: m.role, content: m.content })),
          files: [
            {
              name: parsed.name,
              type: parsed.type,
              size: parsed.size,
              dataUrl: parsed.dataUrl,
              extractedText: parsed.extractedText,
              isImage: parsed.isImage,
              pageCount: parsed.pageCount,
              rowCount: parsed.rowCount,
              sheetCount: parsed.sheetCount,
              isScanned: parsed.isScanned,
              chunks: parsed.chunks,
              executiveSummary: parsed.executiveSummary,
              documentMap: parsed.documentMap,
            },
          ],
          tenders: [],
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || data?.details || 'AI answering request failed')
      }

      const aiReply =
        data.reply ||
        'The requested information is not available in the uploaded document.'

      const aiMsg: ModalChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: aiReply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        sources: data.sources,
        verification: data.verification,
      }

      setMessages(prev => [...prev, aiMsg])
    } catch (err: any) {
      console.error('Document AI query error:', err)
      const errorMsg: ModalChatMessage = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `⚠️ **Error reading document:** ${err?.message || 'Could not process question.'}\n\nPlease try again or verify if the file is accessible.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }
      setMessages(prev => [...prev, errorMsg])
    } finally {
      setIsAiLoading(false)
      setParsingProgress(null)
    }
  }

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
      <div
        className={`bg-white rounded-2xl shadow-2xl w-full max-h-[94vh] flex flex-col overflow-hidden border border-slate-200 transition-all duration-200 ${
          isAiOpen ? 'max-w-7xl' : 'max-w-4xl'
        }`}
      >
        {/* Header Bar */}
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/90 gap-3">
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
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-900 text-sm truncate" title={name}>
                  {name}
                </h3>
                <span className="hidden sm:inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-200/80 text-slate-700">
                  {isPdf ? 'PDF Document' : isImage ? 'Image File' : 'Document'}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                {document.size ? <span>{formatFileSize(document.size)}</span> : null}
                {document.type ? <span>• {document.type}</span> : null}
                {document.referenceNote ? (
                  <span className="text-blue-700 font-medium">• {document.referenceNote}</span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Ask AI Toggle Button */}
            <button
              onClick={() => setIsAiOpen(prev => !prev)}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all shadow-sm ${
                isAiOpen
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-indigo-200'
                  : 'bg-gradient-to-r from-blue-50 to-indigo-50 border border-indigo-200 text-indigo-700 hover:from-blue-100 hover:to-indigo-100'
              }`}
              title={isAiOpen ? 'Close AI Assistant' : 'Ask questions to AI about this document'}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isAiOpen ? 'Hide AI' : 'Ask AI'}</span>
              {isAiOpen ? (
                <PanelRightClose className="w-3.5 h-3.5 ml-0.5" />
              ) : (
                <PanelRightOpen className="w-3.5 h-3.5 ml-0.5" />
              )}
            </button>

            {/* Download */}
            {document.dataUrl && (
              <a
                href={document.dataUrl}
                download={name}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Download</span>
              </a>
            )}

            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors ml-1"
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

        {/* Main Content Area: Split View when AI is Open */}
        <div className="flex-1 flex overflow-hidden min-h-[480px]">
          {/* Left Column: Document Preview */}
          <div
            className={`flex-1 overflow-auto p-4 bg-slate-100/60 flex items-center justify-center transition-all ${
              isAiOpen ? 'max-w-[calc(100%-420px)] hidden md:flex' : 'w-full'
            }`}
          >
            {document.dataUrl ? (
              isImage ? (
                <div className="max-h-[72vh] flex items-center justify-center">
                  <img
                    src={document.dataUrl}
                    alt={name}
                    className="max-h-[70vh] max-w-full rounded-lg shadow-md object-contain bg-white"
                  />
                </div>
              ) : isPdf ? (
                <iframe
                  src={dataUrlToBlobUrl(document.dataUrl)}
                  title={name}
                  className="w-full h-[72vh] rounded-lg border border-slate-200 bg-white shadow-sm"
                />
              ) : (
                <div className="text-center p-8 bg-white rounded-xl border border-slate-200 shadow-sm max-w-md">
                  <FileText className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                  <h4 className="font-semibold text-slate-800 text-sm mb-1">{name}</h4>
                  <p className="text-xs text-slate-500 mb-4">
                    This file type cannot be previewed directly in the browser iframe. You can ask AI questions or download the file.
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
                <div className="p-4 max-h-[66vh] overflow-y-auto text-xs font-mono text-slate-800 leading-relaxed whitespace-pre-wrap select-text bg-slate-50/30">
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

          {/* Right Column: AI Document Assistant Panel */}
          {isAiOpen && (
            <div className="w-full md:w-[420px] lg:w-[450px] border-l border-slate-200 bg-white flex flex-col h-[72vh] md:h-auto overflow-hidden animate-in slide-in-from-right-4 duration-200">
              {/* AI Panel Header */}
              <div className="px-4 py-3 bg-gradient-to-r from-slate-50 to-indigo-50/40 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-sm">
                    <Sparkles className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                      Document AI Assistant
                      <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    </h4>
                    <p className="text-[10px] text-slate-500">Strict Document-Based Answering</p>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {messages.length > 0 && (
                    <button
                      onClick={() => setMessages([])}
                      className="text-[11px] text-slate-500 hover:text-slate-800 p-1 rounded hover:bg-slate-200/60"
                      title="Clear chat"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => setIsAiOpen(false)}
                    className="text-slate-400 hover:text-slate-700 p-1 rounded hover:bg-slate-100"
                    title="Close AI panel"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* AI Messages Container */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50">
                {/* Welcome Message / Quick Suggestions */}
                {messages.length === 0 && (
                  <div className="space-y-3">
                    <div className="p-3 bg-white rounded-xl border border-indigo-100 shadow-sm text-xs text-slate-700 space-y-2">
                      <div className="flex items-center gap-1.5 text-indigo-700 font-bold">
                        <Bot className="w-4 h-4" />
                        <span>Ready to analyze {name}</span>
                      </div>
                      <p className="text-[11px] text-slate-600 leading-relaxed">
                        Ask any question regarding this document. Answers are extracted directly from
                        the text and pages with exact citations. Zero outside assumptions.
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1">
                        Quick Questions:
                      </p>
                      {QUICK_PROMPTS.map((prompt, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleAskQuestion(prompt)}
                          disabled={isAiLoading}
                          className="w-full text-left text-xs text-slate-700 bg-white hover:bg-indigo-50/70 hover:text-indigo-900 border border-slate-200 hover:border-indigo-300 rounded-lg p-2 transition-all shadow-2xs font-medium"
                        >
                          👉 {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Message Bubbles */}
                {messages.map(msg => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${
                      msg.role === 'user' ? 'items-end' : 'items-start'
                    }`}
                  >
                    <div
                      className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 text-xs shadow-2xs leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-blue-600 text-white rounded-br-xs'
                          : 'bg-white text-slate-800 border border-slate-200 rounded-bl-xs'
                      }`}
                    >
                      {msg.role === 'user' ? (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      ) : (
                        <div className="space-y-2">
                          <MarkdownContent content={msg.content} />

                          {/* Source Citations */}
                          {msg.sources && msg.sources.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-slate-100">
                              <SourceCitationCard
                                sources={msg.sources}
                                verification={msg.verification}
                              />
                            </div>
                          )}

                          {/* Copy Action */}
                          <div className="flex items-center justify-end gap-1.5 pt-1 text-[10px] text-slate-400">
                            <button
                              onClick={() => handleCopy(msg.id, msg.content)}
                              className="inline-flex items-center gap-1 hover:text-slate-700 p-0.5 rounded"
                              title="Copy response"
                            >
                              {copiedId === msg.id ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-600" />
                                  <span className="text-emerald-600 font-semibold">Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 mt-1 px-1">{msg.timestamp}</span>
                  </div>
                ))}

                {/* Loading / Parsing State */}
                {isAiLoading && (
                  <div className="flex flex-col items-start gap-1">
                    <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-xs p-3 shadow-2xs text-xs text-slate-600 max-w-[92%] space-y-1.5">
                      <div className="flex items-center gap-2 text-indigo-700 font-semibold">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>
                          {parsingProgress
                            ? parsingProgress.stageLabel || 'Scanning document...'
                            : 'Reading document pages & verifying facts...'}
                        </span>
                      </div>
                      {parsingProgress && (
                        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-indigo-600 h-1.5 rounded-full transition-all duration-300"
                            style={{ width: `${parsingProgress.percent}%` }}
                          />
                        </div>
                      )}
                      <p className="text-[10px] text-slate-400 italic">
                        Checking page numbers, tables, and clauses for exact answer...
                      </p>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Input Box */}
              <div className="p-3 border-t border-slate-200 bg-white">
                <form
                  onSubmit={e => {
                    e.preventDefault()
                    handleAskQuestion()
                  }}
                  className="space-y-1.5"
                >
                  <div className="relative flex items-center">
                    <textarea
                      ref={inputRef}
                      value={queryInput}
                      onChange={e => setQueryInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          handleAskQuestion()
                        }
                      }}
                      placeholder="Ask anything from this document..."
                      rows={2}
                      disabled={isAiLoading}
                      className="w-full resize-none text-xs p-2.5 pr-10 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-slate-50/50"
                    />
                    <button
                      type="submit"
                      disabled={!queryInput.trim() || isAiLoading}
                      className="absolute right-2 bottom-2.5 p-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                      title="Send question"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-[9px] text-slate-400 text-center">
                    Answers strictly grounded in document. Zero external assumptions.
                  </p>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
