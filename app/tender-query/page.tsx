'use client'

import React, { useState, useEffect, useRef } from 'react'
import {
  Bot,
  Send,
  Trash2,
  RotateCcw,
  Sparkles,
  Copy,
  Check,
  AlertCircle,
  HelpCircle,
  ArrowRight,
  Database,
  Layers,
  FileText,
  Clock,
  ShieldCheck,
  ChevronDown,
  Paperclip,
  UploadCloud,
  FileSpreadsheet,
  Download,
  Eye,
  FileCheck2,
  Loader2,
  PanelLeft,
  PanelLeftClose,
  History,
  MessageSquare,
  Plus,
} from 'lucide-react'
import { useTenders } from '@/context/TenderContext'
import { MarkdownContent } from '@/components/chat/MarkdownContent'
import { parseFileForChat, ParsedFileInfo, formatFileSize } from '@/lib/document-parser'
import { FileAttachmentPill } from '@/components/chat/FileAttachmentPill'
import {
  DownloadableFileCard,
  DownloadableFileInfo,
} from '@/components/chat/DownloadableFileCard'
import { generateFileByFormat } from '@/lib/document-file-generator'
import {
  ChatConversation,
  ChatMessage,
  createNewConversation,
  loadAllConversations,
  saveConversation,
  deleteConversation,
  renameConversation,
  generateConversationTitle,
  getSavedActiveConversationId,
  setSavedActiveConversationId,
} from '@/lib/chat-history-service'
import { ChatHistorySidebar } from '@/components/chat/ChatHistorySidebar'
import { sanitizeTenderForAI } from '@/lib/tender-ai-context'

const SUGGESTED_QUESTIONS = [
  {
    title: 'Complete Tender Process',
    query: 'How does the complete tender process work?',
    category: 'Workflow',
  },
  {
    title: 'Current Tender Status',
    query: 'What is the current status of a tender?',
    category: 'Status Check',
  },
  {
    title: 'Pending Tenders Report',
    query: 'Which tenders are pending? Inki Word report bana do.',
    category: 'Live Records',
  },
  {
    title: 'Eligibility Documents',
    query: 'What documents are required for eligibility verification? Excel checklist chahiye.',
    category: 'Stage 03',
  },
  {
    title: 'Sample Details Verification',
    query: 'Explain the Sample Details Verification process.',
    category: 'Stage 04',
  },
  {
    title: 'Analyze Uploaded Document',
    query: 'Attached document mein kya eligibility criteria aur conditions likhi hain?',
    category: 'File Analysis',
  },
  {
    title: 'Available Modules',
    query: 'Which modules are available in Tender FMS?',
    category: 'Architecture',
  },
  {
    title: 'Tender Workflow Guide',
    query: 'Explain the workflow from tender creation to final approval. Iska PDF summary do.',
    category: 'End-to-End',
  },
]

export default function TenderQueryPage() {
  const { tenders, supabaseConnected } = useTenders()

  // 1. CONVERSATIONS & CHAT HISTORY STATE
  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string>('')
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [isHistoryLoaded, setIsHistoryLoaded] = useState(false)

  // Input & Messaging state
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedTenderId, setSelectedTenderId] = useState<string>('all')
  const [showClearModal, setShowClearModal] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [exportingId, setExportingId] = useState<string | null>(null)

  // Attachment state
  const [attachedFiles, setAttachedFiles] = useState<ParsedFileInfo[]>([])
  const [isParsingFiles, setIsParsingFiles] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load conversations on mount
  useEffect(() => {
    async function initHistory() {
      try {
        const loaded = await loadAllConversations()
        setConversations(loaded)

        const savedActiveId = getSavedActiveConversationId()
        const targetId =
          savedActiveId && loaded.some(c => c.id === savedActiveId)
            ? savedActiveId
            : loaded[0]?.id || ''

        setActiveConversationId(targetId)
        if (targetId) {
          setSavedActiveConversationId(targetId)
        }
      } catch (err) {
        console.error('Error loading chat history:', err)
      } finally {
        setIsHistoryLoaded(true)
      }
    }

    initHistory()
  }, [])

  // Active conversation helper
  const currentConversation =
    conversations.find(c => c.id === activeConversationId) ||
    conversations[0] ||
    createNewConversation(selectedTenderId)

  const messages = currentConversation.messages || []

  // Auto scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, loading, attachedFiles])

  // Handle textarea auto-resize
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`
    }
  }

  // 1. FILE UPLOAD & PARSING HANDLER
  const handleFilesSelect = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return
    setIsParsingFiles(true)

    const parsedResults: ParsedFileInfo[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (file.size > 25 * 1024 * 1024) {
        alert(`File "${file.name}" exceeds the 25MB limit. Please upload a smaller document.`)
        continue
      }
      try {
        const parsed = await parseFileForChat(file)
        parsedResults.push(parsed)
      } catch (err) {
        console.error('File parsing error:', err)
      }
    }

    setAttachedFiles(prev => [...prev, ...parsedResults])
    setIsParsingFiles(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleRemoveFile = (fileName: string) => {
    setAttachedFiles(prev => prev.filter(f => f.name !== fileName))
  }

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await handleFilesSelect(e.dataTransfer.files)
    }
  }

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items
    const filesToParse: File[] = []

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file) {
          filesToParse.push(file)
        }
      }
    }

    if (filesToParse.length > 0) {
      await handleFilesSelect(filesToParse)
    }
  }

  // 2. PARSE AI RESPONSE FOR [FILE_EXPORT:...] TAGS
  const parseResponseForFiles = (
    responseText: string
  ): { cleanText: string; generatedFiles: DownloadableFileInfo[] } => {
    const fileTagRegex = /\[FILE_EXPORT:(\{.*?\})\]/g
    const generatedFiles: DownloadableFileInfo[] = []
    let match: RegExpExecArray | null

    while ((match = fileTagRegex.exec(responseText)) !== null) {
      try {
        const rawJson = match[1]
        const fileMeta = JSON.parse(rawJson)
        if (fileMeta && fileMeta.format && fileMeta.filename) {
          generatedFiles.push({
            id: `gen-file-${Date.now()}-${Math.random().toString(36).substring(7)}`,
            filename: fileMeta.filename,
            format: fileMeta.format,
            title: fileMeta.title || fileMeta.filename,
            content: responseText.replace(/\[FILE_EXPORT:\{.*?\}\]/g, '').trim(),
          })
        }
      } catch (err) {
        console.warn('Error parsing FILE_EXPORT tag:', err)
      }
    }

    const cleanText = responseText.replace(/\[FILE_EXPORT:\{.*?\}\]/g, '').trim()
    return { cleanText, generatedFiles }
  }

  // 3. DOWNLOAD GENERATED FILE
  const handleDownloadFile = async (
    fileInfo: DownloadableFileInfo,
    overrideContent?: string
  ) => {
    try {
      const content = overrideContent || fileInfo.content || 'Tender FMS Document Report'
      const result = await generateFileByFormat(
        fileInfo.format,
        fileInfo.title || fileInfo.filename,
        content,
        fileInfo.filename
      )

      const link = document.createElement('a')
      link.href = result.url
      link.download = result.filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (err: any) {
      console.error('File generation error:', err)
      alert(`Could not generate ${fileInfo.format.toUpperCase()} file: ` + (err?.message || 'Error'))
    }
  }

  // 4. QUICK 1-CLICK EXPORT
  const handleQuickExport = async (
    format: 'docx' | 'pdf' | 'xlsx' | 'csv' | 'txt',
    msgId: string,
    content: string
  ) => {
    setExportingId(`${msgId}-${format}`)
    try {
      const title = currentConversation.title || 'Tender_FMS_Report'
      const ext = format === 'docx' ? 'docx' : format === 'xlsx' ? 'xlsx' : format
      const filename = `${title.replace(/[^a-zA-Z0-9_-]/g, '_')}_${new Date().toISOString().slice(0, 10)}.${ext}`

      const result = await generateFileByFormat(format, title, content, filename)

      const link = document.createElement('a')
      link.href = result.url
      link.download = result.filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (e: any) {
      alert(`Export failed: ${e?.message || 'Error generating file'}`)
    } finally {
      setTimeout(() => setExportingId(null), 1000)
    }
  }

  // 5. CHAT HISTORY ACTIONS: NEW CHAT, SELECT, RENAME, DELETE
  const handleNewChat = () => {
    const newConv = createNewConversation(selectedTenderId)
    const updated = [newConv, ...conversations]
    setConversations(updated)
    setActiveConversationId(newConv.id)
    setSavedActiveConversationId(newConv.id)
    setInput('')
    setAttachedFiles([])
    saveConversation(newConv, updated)
  }

  const handleSelectConversation = (id: string) => {
    setActiveConversationId(id)
    setSavedActiveConversationId(id)
    setInput('')
    setAttachedFiles([])
  }

  const handleRenameConversation = async (id: string, newTitle: string) => {
    const updated = await renameConversation(id, newTitle, conversations)
    setConversations(updated)
  }

  const handleDeleteConversation = async (id: string) => {
    const updated = await deleteConversation(id, conversations)
    setConversations(updated)

    if (activeConversationId === id) {
      if (updated.length > 0) {
        setActiveConversationId(updated[0].id)
        setSavedActiveConversationId(updated[0].id)
      } else {
        const fresh = createNewConversation(selectedTenderId)
        setConversations([fresh])
        setActiveConversationId(fresh.id)
        setSavedActiveConversationId(fresh.id)
        saveConversation(fresh, [fresh])
      }
    }
  }

  // 6. CLEAR ACTIVE CONVERSATION
  const handleConfirmClearActive = () => {
    const welcomeMsg: ChatMessage = {
      id: `welcome-${Date.now()}`,
      role: 'assistant',
      content:
        'Hello! Welcome to **Tender Query**. Ask me anything about your Tender FMS system, tender records, workflows, documents, or project-related information.\n\n📎 You can attach PDF, Word, Excel, CSV, or Image files for instant analysis.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      grounded: true,
    }

    const updatedConv: ChatConversation = {
      ...currentConversation,
      messages: [welcomeMsg],
      updatedAt: new Date().toISOString(),
    }

    const updatedList = conversations.map(c =>
      c.id === currentConversation.id ? updatedConv : c
    )

    setConversations(updatedList)
    saveConversation(updatedConv, updatedList)
    setAttachedFiles([])
    setShowClearModal(false)
  }

  // 7. SEND MESSAGE HANDLER
  const handleSend = async (overrideQuery?: string) => {
    const textToSend = (overrideQuery ?? input).trim()
    if ((!textToSend && attachedFiles.length === 0) || loading) return

    const currentFiles = [...attachedFiles]

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: textToSend || 'Please analyze the attached files.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      attachedFiles: currentFiles.length > 0 ? currentFiles : undefined,
    }

    // Auto-generate title if currently "New Conversation"
    let convTitle = currentConversation.title
    if (convTitle === 'New Conversation' || currentConversation.messages.length <= 1) {
      convTitle = generateConversationTitle(
        textToSend,
        currentFiles.map(f => f.name)
      )
    }

    const updatedMessages = [...messages, userMessage]

    const tempConv: ChatConversation = {
      ...currentConversation,
      title: convTitle,
      updatedAt: new Date().toISOString(),
      messages: updatedMessages,
    }

    const optimisticList = [
      tempConv,
      ...conversations.filter(c => c.id !== tempConv.id),
    ]
    setConversations(optimisticList)
    setInput('')
    setAttachedFiles([])
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
    setLoading(true)

    const currentTender =
      selectedTenderId !== 'all' ? tenders.find(t => t.id === selectedTenderId) : undefined

    try {
      const response = await fetch('/api/tender-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedMessages.map(m => ({
            role: m.role,
            content: m.content,
          })),
          tenders: tenders.map(t => ({
            id: t.id,
            title: t.title,
            authority: t.authority,
            department: t.department,
            state: t.state,
            value: t.value,
            stage: t.stage,
            status: t.status,
            due: t.due,
            owner: t.owner,
            remarks: t.remarks,
          })),
          currentTender: currentTender ? sanitizeTenderForAI(currentTender) : undefined,
          files: currentFiles.map(f => ({
            name: f.name,
            type: f.type,
            size: f.size,
            dataUrl: f.dataUrl,
            extractedText: f.extractedText,
            isImage: f.isImage,
          })),
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data?.error || data?.details || 'Error communicating with AI service')
      }

      const rawReply =
        data.reply || 'I could not find this information in the available Tender FMS data.'
      const { cleanText, generatedFiles } = parseResponseForFiles(rawReply)

      const assistantMessage: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: cleanText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        sourceCount: data.sourceCount ?? tenders.length,
        grounded: data.grounded ?? true,
        generatedFiles: generatedFiles.length > 0 ? generatedFiles : undefined,
      }

      const finalConv: ChatConversation = {
        ...tempConv,
        updatedAt: new Date().toISOString(),
        messages: [...updatedMessages, assistantMessage],
      }

      const finalList = [
        finalConv,
        ...conversations.filter(c => c.id !== finalConv.id),
      ]
      setConversations(finalList)
      await saveConversation(finalConv, finalList)
    } catch (err: any) {
      console.error('Chat error:', err)
      const errorMessage: ChatMessage = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `**Error:** ${err?.message || 'Failed to process request.'}\n\nPlease try asking again or select a specific question below.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        grounded: false,
      }

      const errorConv: ChatConversation = {
        ...tempConv,
        messages: [...updatedMessages, errorMessage],
      }
      const errorList = [
        errorConv,
        ...conversations.filter(c => c.id !== errorConv.id),
      ]
      setConversations(errorList)
      await saveConversation(errorConv, errorList)
    } finally {
      setLoading(false)
      setTimeout(() => textareaRef.current?.focus(), 100)
    }
  }

  // Handle Enter Key press
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <section
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="relative flex flex-col h-[calc(100vh-64px)] max-h-[calc(100vh-64px)] overflow-hidden px-3 py-2.5 sm:px-6 sm:py-3 max-w-[1600px] mx-auto w-full"
    >
      {/* DRAG AND DROP OVERLAY */}
      {isDragOver && (
        <div className="absolute inset-0 z-50 bg-blue-600/10 backdrop-blur-xs border-2 border-dashed border-blue-500 rounded-2xl flex flex-col items-center justify-center pointer-events-none animate-fade-in p-6">
          <div className="w-16 h-16 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg mb-3">
            <UploadCloud className="w-8 h-8 animate-bounce" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">Drop files to analyze with AI</h3>
          <p className="text-xs text-slate-600 mt-1">
            Supports PDF, Word (.docx), Excel (.xlsx), CSV, TXT, and Images
          </p>
        </div>
      )}

      {/* 1. TOP BAR / PAGE HEADING - FIXED AT TOP */}
      <div className="flex-shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-3 mb-2.5 pb-2.5 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-2 mb-1">
            {/* Toggle History Sidebar Button */}
            <button
              onClick={() => setIsSidebarOpen(prev => !prev)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs mr-1 transition-colors"
              title={isSidebarOpen ? 'Hide Chat History' : 'Show Chat History'}
            >
              {isSidebarOpen ? (
                <PanelLeftClose className="w-4 h-4 text-blue-600" />
              ) : (
                <PanelLeft className="w-4 h-4 text-blue-600" />
              )}
              <span className="hidden sm:inline">History</span>
            </button>

            <span className="eyebrow flex items-center gap-1.5 text-blue-600 font-bold tracking-wider text-[11px] uppercase">
              <Sparkles className="w-3.5 h-3.5 text-blue-600 animate-pulse" />
              INTELLIGENT KNOWLEDGE ASSISTANT
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
              ChatGPT-Like AI
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 flex items-center gap-2">
            Tender Query
            <span className="text-xs font-normal text-slate-400 hidden sm:inline">
              • {currentConversation.title}
            </span>
          </h1>
        </div>

        {/* Top Controls: Scope selector, New Chat, Clear Active Chat */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Live Records Badge */}
          <div
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200/80 text-xs font-semibold shadow-xs"
            title={`${tenders.length} active tenders indexed in live memory`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
            <Database className="w-3.5 h-3.5 text-emerald-600" />
            <span>{tenders.length} Live Tenders</span>
          </div>

          {/* Scope Selector */}
          <div className="relative">
            <select
              value={selectedTenderId}
              onChange={e => setSelectedTenderId(e.target.value)}
              className={`appearance-none text-xs font-medium rounded-lg pl-3 pr-8 py-1.5 shadow-xs transition-colors focus:outline-hidden ${
                selectedTenderId !== 'all'
                  ? 'bg-blue-50 border border-blue-300 text-blue-900 font-semibold ring-1 ring-blue-200'
                  : 'bg-white border border-slate-200 text-slate-700 hover:border-slate-300'
              }`}
              title="Scope query context to a specific tender"
            >
              <option value="all">Scope: All Live Tenders</option>
              {tenders.map(t => (
                <option key={t.id} value={t.id}>
                  Scope: {t.id} ({t.authority || 'Tender'})
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
          </div>

          {/* New Chat Button */}
          <button
            onClick={handleNewChat}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors"
            title="Start a new blank conversation"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Chat</span>
          </button>

          {/* Clear Current Chat Button */}
          <button
            onClick={() => setShowClearModal(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:text-red-600 text-xs font-medium transition-colors shadow-xs"
            title="Clear active conversation messages"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Clear</span>
          </button>
        </div>
      </div>

      {/* 2. MAIN CONTAINER WITH SIDEBAR + CHAT AREA */}
      <div className="flex-1 min-h-0 flex bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        {/* CHAT HISTORY SIDEBAR */}
        <ChatHistorySidebar
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelectConversation={handleSelectConversation}
          onNewChat={handleNewChat}
          onDeleteConversation={handleDeleteConversation}
          onRenameConversation={handleRenameConversation}
          isOpen={isSidebarOpen}
          onToggleOpen={() => setIsSidebarOpen(prev => !prev)}
        />

        {/* CHAT MESSAGES & INPUT AREA */}
        <div className="flex-1 min-h-0 flex flex-col min-w-0 bg-white h-full overflow-hidden">
          {/* Active Conversation Sub-header - FIXED */}
          <div className="flex-shrink-0 px-4 py-2 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 text-xs text-slate-500">
            <div className="flex items-center gap-2 truncate">
              <MessageSquare className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
              <strong className="text-slate-800 truncate font-semibold">
                {currentConversation.title}
              </strong>
              <span className="text-[10px] text-slate-400">
                ({messages.length} messages)
              </span>
            </div>
            <span className="text-[10px] text-slate-400 hidden sm:inline">
              Updated: {new Date(currentConversation.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>

          {/* Messages Scroll Area - ONLY THIS SCROLLS */}
          <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-6">
            {messages.map(msg => (
              <div
                key={msg.id}
                className={`flex gap-3 sm:gap-4 ${
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {/* Bot Avatar */}
                {msg.role === 'assistant' && (
                  <div className="flex-shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-sm mt-0.5">
                    <Bot className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                )}

                {/* Message Bubble Container */}
                <div
                  className={`flex flex-col max-w-[92%] sm:max-w-[85%] ${
                    msg.role === 'user' ? 'items-end' : 'items-start'
                  }`}
                >
                  {/* Attached Files Badges (User message) */}
                  {msg.attachedFiles && msg.attachedFiles.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2 justify-end">
                      {msg.attachedFiles.map((file, fIdx) => (
                        <FileAttachmentPill key={fIdx} file={file} readOnly />
                      ))}
                    </div>
                  )}

                  {/* Bubble Content */}
                  <div
                    className={`rounded-2xl px-4 sm:px-5 py-3 text-sm shadow-xs ${
                      msg.role === 'user'
                        ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-tr-xs'
                        : 'bg-slate-50 border border-slate-200/90 text-slate-800 rounded-tl-xs'
                    }`}
                  >
                    {msg.role === 'user' ? (
                      <p className="whitespace-pre-wrap leading-relaxed font-normal">{msg.content}</p>
                    ) : (
                      <div>
                        <MarkdownContent content={msg.content} />

                        {/* Downloadable File Cards */}
                        {msg.generatedFiles && msg.generatedFiles.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-slate-200/60 space-y-2">
                            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                              <Sparkles className="w-3 h-3 text-blue-600" />
                              AI Generated Downloadable Documents:
                            </p>
                            {msg.generatedFiles.map(gf => (
                              <DownloadableFileCard
                                key={gf.id}
                                file={gf}
                                onDownload={() => handleDownloadFile(gf, msg.content)}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Message Meta & Action Row */}
                  <div className="flex flex-wrap items-center gap-2 mt-1 px-1 text-[11px] text-slate-400">
                    <span>{msg.timestamp}</span>

                    {msg.role === 'assistant' && (
                      <>
                        <span>•</span>
                        {msg.grounded && (
                          <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                            <ShieldCheck className="w-3 h-3" /> Grounded in Tender FMS
                          </span>
                        )}
                        <span>•</span>

                        {/* Copy Answer */}
                        <button
                          onClick={() => handleCopy(msg.id, msg.content)}
                          className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800 transition-colors"
                          title="Copy answer"
                        >
                          {copiedId === msg.id ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-600" />
                              <span className="text-emerald-600 font-medium">Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>

                        {/* 1-Click Quick Exports */}
                        <span>•</span>
                        <div className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-md px-1.5 py-0.5 shadow-2xs">
                          <span className="text-[10px] text-slate-400 mr-1">Export:</span>
                          <button
                            onClick={() => handleQuickExport('docx', msg.id, msg.content)}
                            className="px-1 text-[10px] font-bold text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="Download as Word Document (.docx)"
                          >
                            {exportingId === `${msg.id}-docx` ? '...' : '.DOCX'}
                          </button>
                          <span className="text-slate-300">|</span>
                          <button
                            onClick={() => handleQuickExport('xlsx', msg.id, msg.content)}
                            className="px-1 text-[10px] font-bold text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                            title="Download as Excel Spreadsheet (.xlsx)"
                          >
                            {exportingId === `${msg.id}-xlsx` ? '...' : '.XLSX'}
                          </button>
                          <span className="text-slate-300">|</span>
                          <button
                            onClick={() => handleQuickExport('pdf', msg.id, msg.content)}
                            className="px-1 text-[10px] font-bold text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Download as PDF (.pdf)"
                          >
                            {exportingId === `${msg.id}-pdf` ? '...' : '.PDF'}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* User Avatar */}
                {msg.role === 'user' && (
                  <div className="flex-shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-xs shadow-sm mt-0.5">
                    U
                  </div>
                )}
              </div>
            ))}

            {/* AI Generating Indicator */}
            {loading && (
              <div className="flex gap-3 sm:gap-4 justify-start items-start animate-fade-in">
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-sm flex-shrink-0 animate-pulse">
                  <Bot className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div className="bg-slate-50 border border-slate-200/90 rounded-2xl rounded-tl-xs px-4 py-3 shadow-xs">
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
                    <span className="flex gap-1">
                      <span className="w-2 h-2 rounded-full bg-blue-600 animate-bounce [animation-delay:-0.3s]" />
                      <span className="w-2 h-2 rounded-full bg-blue-600 animate-bounce [animation-delay:-0.15s]" />
                      <span className="w-2 h-2 rounded-full bg-blue-600 animate-bounce" />
                    </span>
                    <span>Tender Query is analyzing documents & live records...</span>
                  </div>
                </div>
              </div>
            )}

            {/* SUGGESTED QUESTIONS GRID (When conversation is fresh) */}
            {messages.length <= 2 && !loading && (
              <div className="mt-8 pt-6 border-t border-slate-100">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                    Suggested Questions & Actions:
                  </p>
                  <span className="text-[11px] text-slate-400">English • हिन्दी • Hinglish</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  {SUGGESTED_QUESTIONS.map((sq, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSend(sq.query)}
                      className="group text-left p-3 rounded-xl border border-slate-200/80 bg-white hover:bg-blue-50/50 hover:border-blue-300 transition-all duration-150 shadow-2xs hover:shadow-xs flex flex-col justify-between"
                    >
                      <div>
                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 group-hover:bg-blue-100 group-hover:text-blue-700 mb-1.5 transition-colors">
                          {sq.category}
                        </span>
                        <p className="text-xs font-semibold text-slate-800 group-hover:text-blue-700 leading-snug">
                          {sq.query}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-blue-600 font-medium mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span>Ask question</span>
                        <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* 3. INPUT COMPONENT & ATTACHMENT TRAY - ALWAYS VISIBLE / PINNED AT BOTTOM */}
          <div className="flex-shrink-0 p-3 sm:p-4 bg-slate-50/90 border-t border-slate-200/90">
            {/* Attached Files Preview Tray */}
            {attachedFiles.length > 0 && (
              <div className="mb-2.5 flex flex-wrap items-center gap-2 p-2 bg-white rounded-xl border border-blue-200/80 shadow-2xs animate-fade-in">
                <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider px-1">
                  Attached ({attachedFiles.length}):
                </span>
                {attachedFiles.map((f, idx) => (
                  <FileAttachmentPill
                    key={idx}
                    file={f}
                    onRemove={() => handleRemoveFile(f.name)}
                  />
                ))}
              </div>
            )}

            {isParsingFiles && (
              <div className="mb-2 flex items-center gap-2 text-xs text-blue-600 px-2 animate-pulse">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Reading and extracting document text for AI analysis...</span>
              </div>
            )}

            {/* Hidden File Input */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,image/*"
              className="hidden"
              onChange={e => e.target.files && handleFilesSelect(e.target.files)}
            />

            <form
              onSubmit={e => {
                e.preventDefault()
                handleSend()
              }}
              className="relative flex flex-col bg-white rounded-xl border border-slate-300/80 shadow-xs focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all overflow-hidden"
            >
              {selectedTenderId !== 'all' && (
                <div className="flex items-center justify-between px-3 py-1.5 text-[11px] bg-blue-50 border-b border-blue-100 text-blue-900">
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse flex-shrink-0" />
                    <span className="font-semibold text-blue-700">Scoped Tender:</span>
                    <span className="font-medium text-slate-800 truncate">
                      {selectedTenderId} — {tenders.find(t => t.id === selectedTenderId)?.title || 'Selected Tender'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedTenderId('all')}
                    className="ml-2 text-slate-400 hover:text-red-600 text-[11px] font-semibold flex-shrink-0 cursor-pointer"
                    title="Switch back to All Live Tenders"
                  >
                    ✕ Reset
                  </button>
                </div>
              )}

              <div className="flex items-start gap-1 p-2">
                {/* Paperclip Button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-9 h-9 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 flex items-center justify-center transition-colors flex-shrink-0 mt-0.5"
                  title="Attach files (PDF, Word, Excel, CSV, Images)"
                >
                  <Paperclip className="w-5 h-5 rotate-45" />
                </button>

                {/* Textarea */}
                <textarea
                  ref={textareaRef}
                  rows={1}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  placeholder={
                    selectedTenderId !== 'all'
                      ? `Ask about ${selectedTenderId} (e.g. EMD details, turnover requirement, tender fee, status)...`
                      : "Ask anything about Tender FMS, analyze attached files, or request a Word/Excel/PDF export..."
                  }
                  className="flex-1 resize-none px-2 pt-1.5 pb-1 text-sm text-slate-800 placeholder:text-slate-400 bg-transparent focus:outline-hidden min-h-[40px] max-h-[160px]"
                />
              </div>

              <div className="flex items-center justify-between px-3 pb-2 pt-1 border-t border-slate-100 text-xs">
                <div className="flex items-center gap-2 text-slate-400 text-[11px]">
                  <span className="hidden sm:inline">Press</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-600 font-mono text-[10px]">
                    Enter ↵
                  </kbd>
                  <span className="hidden sm:inline">to send •</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-600 font-mono text-[10px]">
                    Shift + Enter
                  </kbd>
                  <span className="hidden sm:inline">for newline</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={(!input.trim() && attachedFiles.length === 0) || loading}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold text-xs shadow-xs transition-colors cursor-pointer disabled:cursor-not-allowed"
                  >
                    <span>Send</span>
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </form>

            {/* Footer note */}
            <div className="flex flex-wrap items-center justify-between gap-2 mt-2 px-1 text-[11px] text-slate-400">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>
                  Persistent Chat History • Auto-saves each conversation securely
                </span>
              </div>
              <span>English • हिन्दी • Hinglish</span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. CLEAR ACTIVE CHAT MODAL */}
      {showClearModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-scale-in">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mb-4">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-1">Clear Current Conversation?</h3>
            <p className="text-sm text-slate-600 leading-relaxed mb-6">
              This will clear the messages in <strong>&quot;{currentConversation.title}&quot;</strong>. Your other previous chats in the history sidebar and live tender records will remain completely safe.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowClearModal(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmClearActive}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition-colors shadow-xs"
              >
                Yes, Clear Messages
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
