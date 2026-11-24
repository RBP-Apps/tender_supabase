'use client'

import React, { useState, useEffect, useRef } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Building,
  Calendar,
  Check,
  CheckCircle2,
  Copy,
  Download,
  Edit3,
  ExternalLink,
  Eye,
  FileCheck2,
  FileCode,
  FileText,
  Hash,
  HelpCircle,
  IndianRupee,
  Info,
  Landmark,
  Loader2,
  Maximize2,
  Minimize2,
  PanelRightClose,
  PanelRightOpen,
  Paperclip,
  Plus,
  Printer,
  RotateCcw,
  Save,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react'
import {
  BankAccountDetails,
  CorrigendumRecord,
  EmdGeneratedDocumentInfo,
  EmdReadyData,
  EmdReadyHistoryEntry,
  SampleDocumentItem,
  Tender,
} from '@/types/tender'
import { autoFetchEmdDetails, parseAmountToNumeric } from '@/lib/emd-ready-autofetch'
import { useTenders } from '@/context/TenderContext'
import { saveTenderToSupabase } from '@/lib/supabase-service'
import { MarkdownContent } from '@/components/chat/MarkdownContent'
import { SourceCitationCard } from '@/components/chat/SourceCitationCard'
import { DocumentPreviewModal } from '@/components/common/DocumentPreviewModal'
import { parseFileForChat, ParsedFileInfo, formatFileSize } from '@/lib/document-parser'
import { parseTextOrCsvDocument } from '@/lib/universal-document-parser'
import { DocumentPageChunk, DocumentSourceCitation, ProcessingProgress } from '@/types/document-understanding'
import { NOT_FOUND_DISCLAIMER } from '@/lib/document-verifier'
import {
  extractEmdFormatFromTender,
  buildEmdDocumentPayload,
  generateEmdDocx,
  generateEmdPdf,
  generatePdfFromHtmlElement,
  downloadFile,
  blobToDataUrl,
  numberToIndianWords,
  RBP_COMPANY,
} from '@/lib/emd-document-generator'

interface EmdReadyModalProps {
  tender: Tender
  mode: 'action' | 'view'
  onClose: () => void
  onComplete?: (updatedTender: Tender) => void
}

interface AIChatMessage {
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

interface ExtractedEmdDetails {
  amount?: string
  accountHolder?: string
  bankName?: string
  accountNo?: string
  ifsc?: string
  branch?: string
  modes?: string
  exemption?: string
  validity?: string
  pageRef?: string
  rawMarkdown?: string
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

const EMD_QUICK_PROMPTS = [
  'What is the exact EMD amount, percentage, and calculation formula?',
  'What are the official department beneficiary bank details for EMD deposit?',
  'Is MSME or Startup exempt from paying EMD in this tender?',
  'What are the accepted modes of EMD (RTGS, NEFT, BG, DD) and validity period?',
  'What are the forfeiture, penalty, or refund conditions for EMD?',
]

export function EmdReadyModal({
  tender,
  mode,
  onClose,
  onComplete,
}: EmdReadyModalProps) {
  const isViewOnly = mode === 'view'
  const { selfAccounts, saveSelfAccount, updateTender, notify } = useTenders()

  // 1 & 2: Dynamic Auto-Fetch from Tender & Corrigendum (NO HARDCODING)
  const autoFetched = autoFetchEmdDetails(tender)

  // 3: Self Account Details (From User Configuration - NO HARDCODING)
  const initialSelfAccount: BankAccountDetails =
    tender.emdReady?.selfAccount ||
    (selfAccounts.length > 0
      ? selfAccounts[0]
      : {
          bankName: '',
          accountHolder: '',
          accountNo: '',
          ifsc: '',
          branch: '',
        })

  const [amount, setAmount] = useState(parseAmountToNumeric(autoFetched.amount))
  const [deptAccount, setDeptAccount] = useState<BankAccountDetails>(autoFetched.departmentAccount)
  const [selfAccount, setSelfAccount] = useState<BankAccountDetails>(initialSelfAccount)
  const [selectedSelfIndex, setSelectedSelfIndex] = useState<number>(selfAccounts.length > 0 ? 0 : -1)
  const [saveSelfConfig, setSaveSelfConfig] = useState(false)
  const [utrNumber, setUtrNumber] = useState(tender.emdReady?.utrNumber || '')
  const [date, setDate] = useState(tender.emdReady?.date || '')
  const [remarks, setRemarks] = useState(tender.emdReady?.remarks || '')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // --- EMD DOCUMENT AUTO-GENERATION, WORD EDITING & PERSISTENCE STATE ---
  const [activeTab, setActiveTab] = useState<'form' | 'preview' | 'editor'>(
    isViewOnly && (tender.emdReady?.generatedDocument || tender.emdReady?.completedAt)
      ? 'preview'
      : 'form'
  )
  const [generatedDoc, setGeneratedDoc] = useState<EmdGeneratedDocumentInfo | null>(
    tender.emdReady?.generatedDocument || null
  )
  const [editedDoc, setEditedDoc] = useState<EmdGeneratedDocumentInfo | null>(
    tender.emdReady?.generatedDocument || null
  )
  const [isEditingDoc, setIsEditingDoc] = useState(false)
  const [isMaximized, setIsMaximized] = useState(false)
  const [isGeneratingDocx, setIsGeneratingDocx] = useState(false)
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)
  const [isSavingDoc, setIsSavingDoc] = useState(false)
  const [docSaveSuccess, setDocSaveSuccess] = useState<string | null>(null)
  const previewSheetRef = useRef<HTMLDivElement>(null)

  // Auto-prepare initial document payload from Tender PDF if not already present
  useEffect(() => {
    if (!generatedDoc && tender) {
      const payload = buildEmdDocumentPayload(
        tender,
        {
          amount: parseAmountToNumeric(autoFetched.amount),
          departmentAccount: autoFetched.departmentAccount,
          selfAccount: initialSelfAccount,
          utrNumber: tender.emdReady?.utrNumber || '',
          date: tender.emdReady?.date || new Date().toISOString().slice(0, 10),
          remarks: tender.emdReady?.remarks || '',
        }
      )
      setGeneratedDoc(payload)
      setEditedDoc(payload)
    }
  }, [tender])

  // --- UNIVERSAL AI DOCUMENT READER & ASSISTANT STATE ---
  const [isAiOpen, setIsAiOpen] = useState(false)
  const [aiTab, setAiTab] = useState<'scan' | 'chat'>('scan')
  const [messages, setMessages] = useState<AIChatMessage[]>([])
  const [queryInput, setQueryInput] = useState('')
  const [isAiLoading, setIsAiLoading] = useState(false)
  const [queryProgress, setQueryProgress] = useState<number>(0)
  const queryTimerRef = useRef<NodeJS.Timeout | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [parsingProgress, setParsingProgress] = useState<ProcessingProgress | null>(null)
  const [previewDoc, setPreviewDoc] = useState<any | null>(null)
  const [customUploadedDocs, setCustomUploadedDocs] = useState<ParsedFileInfo[]>([])
  const [selectedDocId, setSelectedDocId] = useState<string>('primary-tender-doc')
  const [extractedEmd, setExtractedEmd] = useState<ExtractedEmdDetails | null>(null)
  const [appliedNotification, setAppliedNotification] = useState<string | null>(null)

  // Cache parsed representations of documents
  const parsedDocsCache = useRef<Record<string, ParsedFileInfo>>({})
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Collect all available tender documents
  const availableDocs = [
    ...(tender.tenderDoc
      ? [
          {
            id: 'primary-tender-doc',
            name: tender.tenderDoc.name || 'Official_Tender_NIT.pdf',
            doc: tender.tenderDoc,
            type: 'tender-nit',
          },
        ]
      : []),
    ...(tender.corrigenda || []).map((corr, idx) => ({
      id: `corr-${corr.id || idx}`,
      name: corr.fileName || corr.corrigendumNo || `Corrigendum_${idx + 1}.pdf`,
      doc: {
        id: corr.id || `corr-${idx}`,
        name: corr.fileName || corr.corrigendumNo,
        dataUrl: corr.dataUrl || undefined,
        uploadedAt: corr.uploadedAt,
      } as SampleDocumentItem,
      type: 'corrigendum',
    })),
    ...customUploadedDocs.map((cd, idx) => ({
      id: `custom-${idx}`,
      name: cd.name,
      doc: {
        id: `custom-${idx}`,
        name: cd.name,
        dataUrl: cd.dataUrl,
        size: cd.size,
        type: cd.type,
        uploadedAt: new Date().toISOString(),
      } as SampleDocumentItem,
      type: 'custom',
    })),
  ]

  // Auto scroll chat
  useEffect(() => {
    if (isAiOpen && aiTab === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isAiLoading, isAiOpen, aiTab])

  const handleSelectConfiguredSelf = (idx: number) => {
    setSelectedSelfIndex(idx)
    if (selfAccounts[idx]) {
      setSelfAccount({ ...selfAccounts[idx] })
    }
  }

  // --- DOCUMENT PARSING & RETRIEVAL ENGINE ---
  const getOrParseSelectedDoc = async (): Promise<ParsedFileInfo> => {
    const selected = availableDocs.find(d => d.id === selectedDocId) || availableDocs[0]
    if (!selected) {
      throw new Error('No tender document or PDF available to analyze. Please upload a document.')
    }

    if (parsedDocsCache.current[selected.id]) {
      return parsedDocsCache.current[selected.id]
    }

    const doc = selected.doc

    // 1. If text content is available
    if (doc.textContent) {
      const parsedText = await parseTextOrCsvDocument(
        doc.textContent,
        doc.name,
        doc.name.toLowerCase().endsWith('.csv')
      )
      const parsed: ParsedFileInfo = {
        name: doc.name,
        type: doc.type || 'text/plain',
        size: doc.size || doc.textContent.length,
        extractedText: parsedText.extractedText,
        chunks: parsedText.chunks,
        rowCount: parsedText.rowCount,
      }
      parsedDocsCache.current[selected.id] = parsed
      return parsed
    }

    // 2. If dataUrl (PDF / Image)
    if (doc.dataUrl) {
      const isPdf = doc.type === 'application/pdf' || doc.name.toLowerCase().endsWith('.pdf')
      const isImage = doc.type?.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(doc.name)

      if (isPdf) {
        const file = dataUrlToFile(doc.dataUrl, doc.name)
        const parsed = await parseFileForChat(file, progress => {
          setParsingProgress(progress)
        })
        parsedDocsCache.current[selected.id] = parsed
        return parsed
      }

      if (isImage) {
        const parsed: ParsedFileInfo = {
          name: doc.name,
          type: doc.type || 'image/jpeg',
          size: doc.size || 0,
          dataUrl: doc.dataUrl,
          extractedText: `Image document: ${doc.name}`,
          isImage: true,
          chunks: [
            {
              id: `${doc.name}-img-chunk`,
              docName: doc.name,
              docType: 'image',
              sectionTitle: 'Image Content',
              content: `Visual Document Image: ${doc.name}`,
              charCount: 50,
              dataUrl: doc.dataUrl,
            },
          ],
        }
        parsedDocsCache.current[selected.id] = parsed
        return parsed
      }
    }

    // 3. Fallback from tender metadata
    const fallback: ParsedFileInfo = {
      name: doc.name,
      type: doc.type || 'application/octet-stream',
      size: doc.size || 0,
      extractedText: doc.referenceNote || doc.name,
      chunks: [
        {
          id: `${doc.name}-fallback-chunk`,
          docName: doc.name,
          docType: 'text',
          sectionTitle: 'Document Reference',
          content: `${doc.name}\n${doc.referenceNote || ''}\n${doc.matchReason || ''}`,
          charCount: (doc.name + (doc.referenceNote || '')).length,
        },
      ],
    }
    parsedDocsCache.current[selected.id] = fallback
    return fallback
  }

  // --- RUN DEEP AI DOCUMENT SCAN FOR EMD & BANK DETAILS ---
  const handleRunDeepEmdScan = async () => {
    setIsAiLoading(true)
    setQueryProgress(20)
    if (queryTimerRef.current) clearInterval(queryTimerRef.current)
    queryTimerRef.current = setInterval(() => {
      setQueryProgress(prev => {
        if (prev < 45) return prev + Math.floor(Math.random() * 5 + 4)
        if (prev < 75) return prev + Math.floor(Math.random() * 3 + 2)
        if (prev < 98) return prev + 1
        return prev
      })
    }, 600)
    setError(null)
    setExtractedEmd(null)

    try {
      const parsed = await getOrParseSelectedDoc()
      setParsingProgress({
        stage: 'analyzing_document',
        stageLabel: 'Extracting EMD & Bank Details',
        percent: 60,
        message: 'Scanning clauses, financial terms, and beneficiary bank accounts...',
      })

      const deepScanPrompt = `You are a Universal AI Document Understanding System. Please deeply read and understand the entire uploaded document ("${parsed.name}").
Analyze the text, tables, and clauses carefully.
Extract the following information STRICTLY based ONLY on the provided document:

1. Confirmed EMD Amount (exact figure, percentage, or package-wise calculation)
2. Department Beneficiary Bank Details (Bank Name, Account Holder / Beneficiary, Account Number, IFSC Code, Branch)
3. Accepted Payment Modes (RTGS, NEFT, Bank Guarantee, Demand Draft, Portal Online)
4. EMD Exemption Clauses (MSME, Startup, DIC, NSIC rules mentioned in document)
5. EMD / Bank Guarantee Validity Period (e.g., number of days)

CRITICAL RULES:
- If any requested field is NOT explicitly stated in the document, respond for that field with exactly: "This information is not available in the provided document."
- Do NOT guess, imagine, predict, or invent any numbers, bank names, or account numbers.
- Provide the exact Page Number and Clause Reference for every found value.

Format your response in structured markdown:
### 1. Confirmed EMD Amount
- Amount: [Exact figure or "This information is not available in the provided document."]
- Page & Clause: [Reference or N/A]
- Explanation: [Exact context from document]

### 2. Department Beneficiary Bank Details
- Account Holder: [Value or "This information is not available in the provided document."]
- Bank Name: [Value or "This information is not available in the provided document."]
- Account Number: [Value or "This information is not available in the provided document."]
- IFSC Code: [Value or "This information is not available in the provided document."]
- Branch: [Value or "This information is not available in the provided document."]
- Page & Clause: [Reference or N/A]

### 3. Accepted Payment Modes & Validity
- Accepted Modes: [Value or "This information is not available in the provided document."]
- Validity Period: [Value or "This information is not available in the provided document."]
- Page & Clause: [Reference or N/A]

### 4. EMD Exemption Clauses (MSME / Startup)
- Exemption Status: [Value or "This information is not available in the provided document."]
- Page & Clause: [Reference or N/A]`

      const res = await fetch('/api/tender-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: deepScanPrompt }],
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
        throw new Error(data?.error || data?.details || 'Deep EMD scan failed')
      }

      const reply = data.reply || NOT_FOUND_DISCLAIMER

      // Parse structured fields
      const notAvail = (s: string) =>
        !s ||
        s.toLowerCase().includes('not available in the provided document') ||
        s.toLowerCase().includes('not available in the uploaded document') ||
        s.toLowerCase().includes('not available') ||
        s.toLowerCase().includes('n/a')

      const cleanVal = (match: RegExpMatchArray | null) => {
        if (!match || !match[1]) return undefined
        const raw = match[1].replace(/^\[+|[\]\*\.]+$/g, '').trim()
        return notAvail(raw) ? undefined : raw
      }

      const parsedEmd: ExtractedEmdDetails = {
        amount: cleanVal(reply.match(/Amount:\s*([^\n\r]+)/i)),
        accountHolder: cleanVal(reply.match(/Account Holder:\s*([^\n\r]+)/i)),
        bankName: cleanVal(reply.match(/Bank Name:\s*([^\n\r]+)/i)),
        accountNo: cleanVal(reply.match(/Account Number:\s*([^\n\r]+)/i)),
        ifsc: cleanVal(reply.match(/IFSC Code:\s*([^\n\r]+)/i))?.toUpperCase(),
        branch: cleanVal(reply.match(/Branch:\s*([^\n\r]+)/i)),
        modes: cleanVal(reply.match(/Accepted Modes:\s*([^\n\r]+)/i)),
        validity: cleanVal(reply.match(/Validity Period:\s*([^\n\r]+)/i)),
        exemption: cleanVal(reply.match(/Exemption Status:\s*([^\n\r]+)/i)),
        pageRef: cleanVal(reply.match(/Page & Clause:\s*([^\n\r]+)/i)),
        rawMarkdown: reply,
      }

      setExtractedEmd(parsedEmd)
    } catch (err: any) {
      console.error('Deep EMD scan error:', err)
      setError(`Deep Document Scan Error: ${err?.message || 'Failed to read document.'}`)
    } finally {
      if (queryTimerRef.current) {
        clearInterval(queryTimerRef.current)
        queryTimerRef.current = null
      }
      setQueryProgress(100)
      await new Promise(r => setTimeout(r, 750))
      setIsAiLoading(false)
      setParsingProgress(null)
    }
  }

  // --- 1-CLICK APPLY VERIFIED DATA TO FORM ---
  const handleApplyExtractedToForm = () => {
    if (!extractedEmd) return
    let appliedCount = 0

    if (extractedEmd.amount) {
      setAmount(parseAmountToNumeric(extractedEmd.amount))
      appliedCount++
    }

    if (
      extractedEmd.bankName ||
      extractedEmd.accountNo ||
      extractedEmd.ifsc ||
      extractedEmd.accountHolder ||
      extractedEmd.branch
    ) {
      setDeptAccount(prev => ({
        bankName: extractedEmd.bankName || prev.bankName,
        accountNo: extractedEmd.accountNo || prev.accountNo,
        ifsc: extractedEmd.ifsc || prev.ifsc,
        accountHolder: extractedEmd.accountHolder || prev.accountHolder,
        branch: extractedEmd.branch || prev.branch,
      }))
      appliedCount++
    }

    setAppliedNotification(
      `Applied ${appliedCount} verified document values (EMD Amount & Department Bank) to the form.`
    )
    setTimeout(() => setAppliedNotification(null), 4000)
  }

  // --- INTERACTIVE DOCUMENT Q&A HANDLER ---
  const handleAskQuestion = async (overrideText?: string) => {
    const question = (overrideText ?? queryInput).trim()
    if (!question || isAiLoading) return

    setQueryInput('')
    const userMsg: AIChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: question,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }

    const updated = [...messages, userMsg]
    setMessages(updated)
    setIsAiLoading(true)
    setQueryProgress(18)
    if (queryTimerRef.current) clearInterval(queryTimerRef.current)
    queryTimerRef.current = setInterval(() => {
      setQueryProgress(prev => {
        if (prev < 45) return prev + Math.floor(Math.random() * 5 + 4)
        if (prev < 75) return prev + Math.floor(Math.random() * 3 + 2)
        if (prev < 98) return prev + 1
        return prev
      })
    }, 600)

    try {
      const parsed = await getOrParseSelectedDoc()
      setParsingProgress(null)

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

      const aiReply = data.reply || NOT_FOUND_DISCLAIMER

      const aiMsg: AIChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: aiReply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        sources: data.sources,
        verification: data.verification,
      }

      setMessages(prev => [...prev, aiMsg])
    } catch (err: any) {
      console.error('Document Q&A error:', err)
      const errorMsg: AIChatMessage = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `⚠️ **Error reading document:** ${err?.message || 'Could not process question.'}\n\nPlease try again or verify if the file is accessible.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }
      setMessages(prev => [...prev, errorMsg])
    } finally {
      if (queryTimerRef.current) {
        clearInterval(queryTimerRef.current)
        queryTimerRef.current = null
      }
      setQueryProgress(100)
      await new Promise(r => setTimeout(r, 750))
      setIsAiLoading(false)
      setParsingProgress(null)
    }
  }

  // --- UPLOAD CUSTOM DOCUMENT HANDLER ---
  const handleUploadCustomDoc = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return
    setIsAiLoading(true)

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      try {
        const parsed = await parseFileForChat(file, progress => {
          setParsingProgress(progress)
        })
        setCustomUploadedDocs(prev => [...prev, parsed])
        setSelectedDocId(`custom-${customUploadedDocs.length}`)
      } catch (err) {
        console.error('Custom document parsing error:', err)
        alert(`Failed to parse file "${file.name}": ${err}`)
      }
    }

    setIsAiLoading(false)
    setParsingProgress(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  // --- EMD DOCUMENT ACTIONS (WORD GENERATION, PDF DOWNLOAD & EDITING) ---

  const handleGenerateOrSyncDoc = async (targetDoc?: EmdGeneratedDocumentInfo | null) => {
    setIsGeneratingDocx(true)
    setError(null)
    try {
      const payload = buildEmdDocumentPayload(
        tender,
        {
          amount: amount.trim(),
          departmentAccount: deptAccount,
          selfAccount,
          utrNumber: utrNumber.trim(),
          date: date.trim(),
          remarks: remarks.trim(),
        },
        targetDoc || generatedDoc
      )

      setGeneratedDoc(payload)
      setEditedDoc(payload)
      setActiveTab('preview')
      notify('EMD Document generated according to Tender PDF format.')
    } catch (err: any) {
      console.error('Error generating EMD document:', err)
      setError(`Failed to generate EMD document: ${err?.message || 'Unknown error'}`)
    } finally {
      setIsGeneratingDocx(false)
    }
  }

  const handleDownloadWord = async () => {
    const currentDoc = editedDoc || generatedDoc
    if (!currentDoc) {
      handleGenerateOrSyncDoc()
      return
    }

    setIsGeneratingDocx(true)
    try {
      const blob = await generateEmdDocx(
        tender,
        {
          amount: amount.trim(),
          departmentAccount: deptAccount,
          selfAccount,
          utrNumber: utrNumber.trim(),
          date: date.trim(),
          remarks: remarks.trim(),
        },
        currentDoc
      )
      downloadFile(blob, currentDoc.docxFileName || `EMD_Document_${tender.id}.docx`)
      notify('Word document (.docx) downloaded successfully.')
    } catch (err: any) {
      console.error('Download Word error:', err)
      setError(`Download Word Error: ${err?.message || 'Failed to generate DOCX'}`)
    } finally {
      setIsGeneratingDocx(false)
    }
  }

  const handleDownloadPdf = async () => {
    const currentDoc = editedDoc || generatedDoc
    if (!currentDoc) {
      handleGenerateOrSyncDoc()
      return
    }

    setIsGeneratingPdf(true)
    try {
      let blob: Blob
      if (previewSheetRef.current && activeTab === 'preview') {
        try {
          // WYSIWYG: Generate PDF using the exact same preview DOM code/rendering
          blob = await generatePdfFromHtmlElement(previewSheetRef.current)
        } catch (canvasErr) {
          console.warn('Canvas capture fallback to vector jsPDF:', canvasErr)
          blob = await generateEmdPdf(
            tender,
            {
              amount: amount.trim(),
              departmentAccount: deptAccount,
              selfAccount,
              utrNumber: utrNumber.trim(),
              date: date.trim(),
              remarks: remarks.trim(),
            },
            currentDoc
          )
        }
      } else {
        blob = await generateEmdPdf(
          tender,
          {
            amount: amount.trim(),
            departmentAccount: deptAccount,
            selfAccount,
            utrNumber: utrNumber.trim(),
            date: date.trim(),
            remarks: remarks.trim(),
          },
          currentDoc
        )
      }
      downloadFile(blob, currentDoc.pdfFileName || `EMD_Document_${tender.id}.pdf`)
      notify('PDF document (.pdf) downloaded successfully.')
    } catch (err: any) {
      console.error('Download PDF error:', err)
      setError(`Download PDF Error: ${err?.message || 'Failed to generate PDF'}`)
    } finally {
      setIsGeneratingPdf(false)
    }
  }

  const handleSaveDocumentChanges = async () => {
    if (!editedDoc) return
    setIsSavingDoc(true)
    setError(null)
    setDocSaveSuccess(null)

    try {
      const currentFormData = {
        amount: amount.trim(),
        departmentAccount: deptAccount,
        selfAccount,
        utrNumber: utrNumber.trim(),
        date: date.trim(),
        remarks: remarks.trim(),
      }

      // 1. Generate updated DOCX & PDF blobs and base64 URLs
      const docxBlob = await generateEmdDocx(tender, currentFormData, editedDoc)
      const docxDataUrl = await blobToDataUrl(docxBlob)

      let pdfBlob: Blob
      if (previewSheetRef.current && activeTab === 'preview') {
        try {
          pdfBlob = await generatePdfFromHtmlElement(previewSheetRef.current)
        } catch (canvasErr) {
          console.warn('Canvas capture fallback to vector jsPDF:', canvasErr)
          pdfBlob = await generateEmdPdf(tender, currentFormData, editedDoc)
        }
      } else {
        pdfBlob = await generateEmdPdf(tender, currentFormData, editedDoc)
      }
      const pdfDataUrl = await blobToDataUrl(pdfBlob)

      const nextVersion = (editedDoc.version || 1) + 1
      const nowIso = new Date().toISOString()

      const savedDocInfo: EmdGeneratedDocumentInfo = {
        ...editedDoc,
        version: nextVersion,
        docxFileName: `EMD_Document_${tender.id}_v${nextVersion}.docx`,
        pdfFileName: `EMD_Document_${tender.id}_v${nextVersion}.pdf`,
        docxDataUrl,
        pdfDataUrl,
        status: 'Saved',
        lastModifiedAt: nowIso,
        lastSavedAt: nowIso,
      }

      setGeneratedDoc(savedDocInfo)
      setEditedDoc(savedDocInfo)
      setIsEditingDoc(false)
      setActiveTab('preview')

      // 2. Persist in database via TenderContext & Supabase
      const existingEmd = tender.emdReady || {
        amount: amount.trim(),
        departmentAccount: { ...deptAccount },
        selfAccount: { ...selfAccount },
        utrNumber: utrNumber.trim(),
        date: date.trim(),
      }

      const updatedEmdData: EmdReadyData = {
        ...existingEmd,
        amount: amount.trim(),
        departmentAccount: { ...deptAccount },
        selfAccount: { ...selfAccount },
        utrNumber: utrNumber.trim(),
        date: date.trim(),
        remarks: remarks.trim(),
        generatedDocument: savedDocInfo,
      }

      const updatedTender: Tender = {
        ...tender,
        emdReady: updatedEmdData,
      }

      updateTender(tender.id, updatedTender)
      try {
        await saveTenderToSupabase(updatedTender)
      } catch (dbErr) {
        console.warn('Direct Supabase save note:', dbErr)
      }

      setDocSaveSuccess(`Document v${nextVersion} saved to database & synchronized with Supabase.`)
      notify(`EMD Document v${nextVersion} saved successfully.`)
      setTimeout(() => setDocSaveSuccess(null), 4000)
    } catch (err: any) {
      console.error('Save document error:', err)
      setError(`Save Document Error: ${err?.message || 'Failed to save changes.'}`)
    } finally {
      setIsSavingDoc(false)
    }
  }

  const handleResetToAiDraft = () => {
    if (!window.confirm('Reset this document back to the AI-extracted Tender PDF template? Unsaved changes will be discarded.')) {
      return
    }
    const payload = buildEmdDocumentPayload(
      tender,
      {
        amount: amount.trim(),
        departmentAccount: deptAccount,
        selfAccount,
        utrNumber: utrNumber.trim(),
        date: date.trim(),
        remarks: remarks.trim(),
      },
      null
    )
    setGeneratedDoc(payload)
    setEditedDoc(payload)
    setIsEditingDoc(false)
    setActiveTab('preview')
    notify('Reset to default tender format.')
  }

  // --- STEP 1: PROCEED FROM FORM TO DOCUMENT PREVIEW ---
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!amount.trim()) {
      setError('Please provide the confirmed EMD Amount.')
      setActiveTab('form')
      return
    }

    if (!deptAccount.accountNo.trim() || !deptAccount.ifsc.trim() || !deptAccount.bankName.trim()) {
      setError('Please provide Department Bank Name, Account Number, and IFSC code.')
      setActiveTab('form')
      return
    }

    if (!selfAccount.accountNo.trim() || !selfAccount.ifsc.trim() || !selfAccount.bankName.trim()) {
      setError('Please provide Self Account Bank Name, Account Number, and IFSC code.')
      setActiveTab('form')
      return
    }

    // Sync form inputs into document payload
    const currentFormData = {
      amount: amount.trim(),
      departmentAccount: { ...deptAccount },
      selfAccount: { ...selfAccount },
      utrNumber: utrNumber.trim(),
      date: date.trim(),
      remarks: remarks.trim(),
    }

    const updated = buildEmdDocumentPayload(tender, currentFormData, editedDoc || generatedDoc || undefined)
    setGeneratedDoc(updated)
    setEditedDoc(updated)
    setIsEditingDoc(false)
    setActiveTab('preview')
    notify('Auto-Generated EMD Word & PDF Document ready for preview. Please review below.')
  }

  // --- STEP 2: FINAL SUBMIT & STORE PDF / WORD IN DATABASE ---
  const handleFinalSubmit = async () => {
    if (submitting) return
    setError(null)

    // Re-verify required fields
    if (!amount.trim()) {
      setError('Please provide the confirmed EMD Amount.')
      setActiveTab('form')
      return
    }

    if (!deptAccount.accountNo.trim() || !deptAccount.ifsc.trim() || !deptAccount.bankName.trim()) {
      setError('Please provide Department Bank Name, Account Number, and IFSC code.')
      setActiveTab('form')
      return
    }

    if (!selfAccount.accountNo.trim() || !selfAccount.ifsc.trim() || !selfAccount.bankName.trim()) {
      setError('Please provide Self Account Bank Name, Account Number, and IFSC code.')
      setActiveTab('form')
      return
    }

    setSubmitting(true)

    if (saveSelfConfig && selfAccount.accountNo.trim()) {
      saveSelfAccount(selfAccount)
    }

    const nowIso = new Date().toISOString()
    const currentFormData = {
      amount: amount.trim(),
      departmentAccount: { ...deptAccount },
      selfAccount: { ...selfAccount },
      utrNumber: utrNumber.trim(),
      date: date.trim(),
      remarks: remarks.trim(),
    }

    // Prepare or finalize generated document
    let docToSave = editedDoc || generatedDoc
    if (!docToSave) {
      docToSave = buildEmdDocumentPayload(tender, currentFormData)
    }

    let docxDataUrl = docToSave.docxDataUrl
    let pdfDataUrl = docToSave.pdfDataUrl

    try {
      // 1. Generate full Word .docx
      const docxBlob = await generateEmdDocx(tender, currentFormData, docToSave)
      docxDataUrl = await blobToDataUrl(docxBlob)

      // 2. Generate PDF using the exact same preview DOM code/rendering
      let pdfBlob: Blob
      if (previewSheetRef.current) {
        try {
          pdfBlob = await generatePdfFromHtmlElement(previewSheetRef.current)
        } catch (canvasErr) {
          console.warn('Canvas capture fallback to vector jsPDF:', canvasErr)
          pdfBlob = await generateEmdPdf(tender, currentFormData, docToSave)
        }
      } else {
        pdfBlob = await generateEmdPdf(tender, currentFormData, docToSave)
      }
      pdfDataUrl = await blobToDataUrl(pdfBlob)

      docToSave = {
        ...docToSave,
        docxDataUrl,
        pdfDataUrl,
        status: 'Saved',
        lastSavedAt: nowIso,
      }
      setGeneratedDoc(docToSave)
      setEditedDoc(docToSave)
    } catch (genErr) {
      console.warn('PDF/DOCX generation error on final submit:', genErr)
    }

    const historyEntry: EmdReadyHistoryEntry = {
      id: `emd-hist-${Date.now()}`,
      submittedAt: nowIso,
      submittedBy: 'Bid Manager',
      amount: amount.trim(),
      amountSource: autoFetched.amountSource,
      departmentAccount: { ...deptAccount },
      selfAccount: { ...selfAccount },
      utrNumber: utrNumber.trim(),
      date: date.trim(),
      remarks: remarks.trim(),
      generatedDocument: docToSave || undefined,
    }

    const existingHistory = tender.emdReady?.history || []

    const emdData: EmdReadyData = {
      amount: amount.trim(),
      amountSource: autoFetched.amountSource,
      departmentAccount: { ...deptAccount },
      selfAccount: { ...selfAccount },
      utrNumber: utrNumber.trim(),
      date: date.trim(),
      remarks: remarks.trim(),
      completedAt: nowIso,
      completedBy: 'Bid Manager',
      history: [historyEntry, ...existingHistory],
      generatedDocument: docToSave || undefined,
    }

    const updatedTender: Tender = {
      ...tender,
      stage: 'Document Ready',
      status: 'In Progress',
      remarks: remarks.trim() || tender.remarks,
      emdReady: emdData,
    }

    // 1. Direct update to TenderContext (Memory & Local Storage)
    updateTender(tender.id, updatedTender)

    // 2. Direct persistence in Supabase
    try {
      await saveTenderToSupabase(updatedTender)
    } catch (saveDbErr) {
      console.warn('Direct Supabase save note:', saveDbErr)
    }

    notify('EMD Format PDF & Word Document successfully stored in database.')

    // 3. Complete workflow & advance
    if (onComplete) {
      onComplete(updatedTender)
    }
  }

  const selectedDocItem = availableDocs.find(d => d.id === selectedDocId) || availableDocs[0]

  const isWideTab = activeTab === 'preview' || activeTab === 'editor'

  return (
    <div className="modal-backdrop">
      <div
        className={`modal bg-white rounded-2xl shadow-2xl transition-all duration-300 border border-slate-200 ${
          isWideTab ? 'modal-extra-wide' : ''
        }`}
        style={{
          width: isMaximized
            ? '98vw'
            : isAiOpen
            ? '96vw'
            : isWideTab
            ? '94vw'
            : 'min(780px, 94vw)',
          maxWidth: isMaximized
            ? '98vw'
            : isAiOpen
            ? '1520px'
            : isWideTab
            ? '1320px'
            : '780px',
          maxHeight: isMaximized ? '97vh' : '93vh',
          overflowY: 'auto',
        }}
      >
        {/* Modal Head */}
        <div className="modal-head sticky top-0 bg-white z-20 pb-3 border-b border-slate-100 flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <p className="eyebrow">WORKFLOW STAGE 03 • EMD DEPOSIT VERIFICATION</p>
              {availableDocs.length > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200">
                  <FileText className="w-2.5 h-2.5 text-blue-600" />
                  {availableDocs.length} Doc{availableDocs.length > 1 ? 's' : ''} Ready
                </span>
              )}
            </div>
            <h2 className="text-base font-bold text-slate-900 mt-0.5">
              {isViewOnly ? 'EMD Payment & Bank Account Details' : 'Verify & Submit EMD Details'}
            </h2>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* AI Document Reader Toggle */}
            <button
              type="button"
              onClick={() => {
                setIsAiOpen(prev => !prev)
                if (!isAiOpen && !extractedEmd) {
                  // Trigger initial scan when opening
                  handleRunDeepEmdScan()
                }
              }}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all shadow-xs cursor-pointer ${
                isAiOpen
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-indigo-200'
                  : 'bg-gradient-to-r from-blue-50 to-indigo-50 border border-indigo-200 text-indigo-700 hover:from-blue-100 hover:to-indigo-100'
              }`}
              title={isAiOpen ? 'Hide AI Document Reader' : 'Open Universal AI PDF & Document Reader'}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isAiOpen ? 'Hide AI Reader' : 'AI Document Reader'}</span>
              {isAiOpen ? (
                <PanelRightClose className="w-3.5 h-3.5 ml-0.5" />
              ) : (
                <PanelRightOpen className="w-3.5 h-3.5 ml-0.5" />
              )}
            </button>

            {/* Maximize / Wide View Toggle */}
            {isWideTab && (
              <button
                type="button"
                onClick={() => setIsMaximized(prev => !prev)}
                className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                title={isMaximized ? 'Restore standard width' : 'Maximize to full viewport'}
              >
                {isMaximized ? (
                  <Minimize2 className="w-4 h-4 text-slate-700" />
                ) : (
                  <Maximize2 className="w-4 h-4 text-slate-700" />
                )}
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              title="Close"
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Applied Notification Banner */}
        {appliedNotification && (
          <div className="p-3 my-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between animate-in fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span className="font-semibold">{appliedNotification}</span>
            </div>
            <button
              type="button"
              onClick={() => setAppliedNotification(null)}
              className="text-emerald-700 hover:text-emerald-900 font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* Split View Container */}
        <div className={`flex flex-col md:flex-row gap-5 ${isAiOpen ? 'items-start' : ''}`}>
          {/* LEFT COLUMN: EMD Form OR Generated Document & Word Editor */}
          <div className={`flex-1 min-w-0 ${isAiOpen ? 'max-w-full md:max-w-[55%]' : 'w-full'}`}>
            {/* Tender Record Pill */}
            <div className="modal-record-pill border-b border-slate-100 pb-3 mb-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <strong className="text-slate-900 text-sm">{tender.title}</strong>
                  <span className="badge badge-slate text-[10px]">{tender.id}</span>
                  {tender.bid?.rfsNo && (
                    <span className="text-[11px] text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      RfS: {tender.bid.rfsNo}
                    </span>
                  )}
                  {tender.corrigenda && tender.corrigenda.length > 0 && (
                    <span className="text-[11px] text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                      {tender.corrigenda.length} Corrigendum Applied
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  Authority: <span className="text-slate-700 font-medium">{tender.authority}</span>
                  {tender.value ? ` • Estimated Value: ${tender.value}` : ''}
                  {tender.bid?.tenderFeePerPackage ? ` • Fee: ₹ ${tender.bid.tenderFeePerPackage}` : ''}
                </p>
              </div>
            </div>

            {/* View Mode Tab Switcher: Form vs Preview vs Word Editor */}
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2.5 mb-4 flex-wrap">
              <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setActiveTab('form')}
                  className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                    activeTab === 'form'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Building className="w-3.5 h-3.5" />
                  <span>1. EMD Details Form</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const currentFormData = {
                      amount: amount.trim(),
                      departmentAccount: { ...deptAccount },
                      selfAccount: { ...selfAccount },
                      utrNumber: utrNumber.trim(),
                      date: date.trim(),
                      remarks: remarks.trim(),
                    }
                    const payload = buildEmdDocumentPayload(
                      tender,
                      currentFormData,
                      editedDoc || generatedDoc || undefined
                    )
                    setGeneratedDoc(payload)
                    setEditedDoc(payload)
                    setActiveTab('preview')
                  }}
                  className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                    activeTab === 'preview'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>2. Auto-Generated EMD Word &amp; PDF Document</span>
                  {editedDoc?.status === 'Saved' ? (
                    <span className="w-2 h-2 rounded-full bg-emerald-500" title="Saved to Database" />
                  ) : editedDoc?.status === 'Modified' ? (
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" title="Unsaved Modifications" />
                  ) : editedDoc ? (
                    <span className="w-2 h-2 rounded-full bg-blue-500" title="Generated" />
                  ) : null}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const currentFormData = {
                      amount: amount.trim(),
                      departmentAccount: { ...deptAccount },
                      selfAccount: { ...selfAccount },
                      utrNumber: utrNumber.trim(),
                      date: date.trim(),
                      remarks: remarks.trim(),
                    }
                    const payload = buildEmdDocumentPayload(
                      tender,
                      currentFormData,
                      editedDoc || generatedDoc || undefined
                    )
                    setGeneratedDoc(payload)
                    setEditedDoc(payload)
                    setActiveTab('editor')
                  }}
                  className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                    activeTab === 'editor'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>3. Word Editor</span>
                </button>
              </div>

              {/* Instant Document Generate Button */}
              <button
                type="button"
                onClick={() => handleGenerateOrSyncDoc()}
                disabled={isGeneratingDocx}
                className="text-xs font-bold px-3 py-1.5 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 border border-blue-200 text-blue-700 flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                title="Dynamically extract format and generate EMD document from the Original Tender PDF"
              >
                {isGeneratingDocx ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                )}
                <span>{editedDoc ? 'Re-Sync from Form & PDF' : 'Generate EMD Document'}</span>
              </button>
            </div>

            {error && (
              <div className="p-3 mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 text-red-600" />
                <span>{error}</span>
              </div>
            )}

            {docSaveSuccess && (
              <div className="p-3 mb-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between animate-in fade-in">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span className="font-semibold">{docSaveSuccess}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setDocSaveSuccess(null)}
                  className="text-emerald-700 hover:text-emerald-900 font-bold"
                >
                  ✕
                </button>
              </div>
            )}

            {/* TAB 1: EMD DETAILS VERIFICATION FORM */}
            {activeTab === 'form' && (
              <form onSubmit={handleFormSubmit} className="space-y-5">
                {/* 1. AMOUNT (AI / Document Extracted with Source Citation) */}
                <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/70">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <IndianRupee className="w-3.5 h-3.5 text-blue-600" />
                      1. EMD Amount <span className="text-red-500">*</span>
                    </label>

                    {extractedEmd?.amount ? (
                      <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3 text-emerald-600" /> AI Document-Verified
                      </span>
                    ) : autoFetched.amountStatus === 'auto-fetched' ? (
                      <span className="text-[10px] font-semibold text-blue-700 bg-blue-100/90 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-blue-600" /> Auto-Fetched
                      </span>
                    ) : autoFetched.amountStatus === 'previously-saved' ? (
                      <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                        <Check className="w-3 h-3 text-emerald-600" /> Previously Saved
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-amber-600" /> Not Found / Needs Review
                      </span>
                    )}
                  </div>

                  {/* Source Reference Banner */}
                  <div className="p-2 mb-2.5 rounded-lg bg-white border border-slate-200 text-[11px] text-slate-600 flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-slate-700">Source: </span>
                      <span>
                        {extractedEmd?.pageRef
                          ? `${selectedDocItem?.name} (${extractedEmd.pageRef})`
                          : autoFetched.amountSource}
                      </span>
                    </div>
                    {autoFetched.amountStatus === 'not-found' && !extractedEmd?.amount && (
                      <span className="text-amber-700 font-medium text-[10px]">Manual Input Required</span>
                    )}
                  </div>

                  <div className="relative space-y-1">
                    <input
                      type="text"
                      disabled={isViewOnly}
                      required
                      value={amount}
                      onChange={e => {
                        const val = e.target.value
                        // If user pastes or enters word format like "3 Lakh" or "3 lakhs", normalize to pure numbers
                        if (/lakh|lac|crore|cr|thousand/i.test(val)) {
                          setAmount(parseAmountToNumeric(val))
                        } else {
                          // Allow digits only so it is strictly a numeric display (e.g. 300000)
                          setAmount(val.replace(/[^0-9]/g, ''))
                        }
                      }}
                      onBlur={() => {
                        if (amount) {
                          setAmount(parseAmountToNumeric(amount))
                        }
                      }}
                      placeholder="Enter EMD Amount in numbers (e.g. 300000)"
                      className="w-full bg-white border border-slate-300 rounded-lg px-3.5 py-2 text-sm font-bold text-slate-900 focus:outline-hidden focus:border-blue-500 disabled:bg-slate-100 font-mono"
                    />
                    {amount && !isNaN(Number(amount)) && Number(amount) > 0 && (
                      <div className="flex items-center justify-between text-[11px] px-1 pt-0.5">
                        <span className="text-blue-700 font-bold">
                          ₹ {Number(amount).toLocaleString('en-IN')}
                        </span>
                        <span className="text-slate-500 italic">
                          ({numberToIndianWords(amount)})
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. DEPARTMENT ACCOUNTS DETAILS (Beneficiary) */}
                <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/70">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Building className="w-3.5 h-3.5 text-indigo-600" />
                      2. Department Accounts Details (Beneficiary) <span className="text-red-500">*</span>
                    </label>

                    {extractedEmd?.accountNo ? (
                      <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3 text-emerald-600" /> AI Document-Verified
                      </span>
                    ) : autoFetched.deptStatus === 'auto-fetched' ? (
                      <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-100/90 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-indigo-600" /> Auto-Fetched from Tender
                      </span>
                    ) : autoFetched.deptStatus === 'previously-saved' ? (
                      <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                        <Check className="w-3 h-3 text-emerald-600" /> Previously Saved
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-amber-600" /> Not Found in Documents
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] text-slate-500 mb-2.5">
                    Official tender issuing department account where the Earnest Money Deposit must be deposited:
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-white p-3.5 rounded-lg border border-slate-200">
                    <div className="md:col-span-2">
                      <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                        Beneficiary Name / Account Holder
                      </label>
                      <input
                        type="text"
                        disabled={isViewOnly}
                        value={deptAccount.accountHolder || ''}
                        onChange={e => setDeptAccount({ ...deptAccount, accountHolder: e.target.value })}
                        placeholder="e.g. Executive Engineer, Public Works / DISCOM"
                        className="w-full border border-slate-300 rounded-md px-3 py-1.5 text-xs text-slate-800 focus:outline-hidden focus:border-blue-500 disabled:bg-slate-100"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-700 block mb-1">Bank Name</label>
                      <input
                        type="text"
                        disabled={isViewOnly}
                        value={deptAccount.bankName}
                        onChange={e => setDeptAccount({ ...deptAccount, bankName: e.target.value })}
                        placeholder="e.g. State Bank of India"
                        className="w-full border border-slate-300 rounded-md px-3 py-1.5 text-xs text-slate-800 focus:outline-hidden focus:border-blue-500 disabled:bg-slate-100"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-700 block mb-1">Account Number</label>
                      <input
                        type="text"
                        disabled={isViewOnly}
                        value={deptAccount.accountNo}
                        onChange={e => setDeptAccount({ ...deptAccount, accountNo: e.target.value })}
                        placeholder="e.g. 123456789012"
                        className="w-full border border-slate-300 rounded-md px-3 py-1.5 text-xs text-slate-800 font-mono focus:outline-hidden focus:border-blue-500 disabled:bg-slate-100"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-700 block mb-1">IFSC Code</label>
                      <input
                        type="text"
                        disabled={isViewOnly}
                        value={deptAccount.ifsc}
                        onChange={e => setDeptAccount({ ...deptAccount, ifsc: e.target.value.toUpperCase() })}
                        placeholder="e.g. SBIN0001234"
                        className="w-full border border-slate-300 rounded-md px-3 py-1.5 text-xs text-slate-800 font-mono uppercase focus:outline-hidden focus:border-blue-500 disabled:bg-slate-100"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-700 block mb-1">Branch Name</label>
                      <input
                        type="text"
                        disabled={isViewOnly}
                        value={deptAccount.branch || ''}
                        onChange={e => setDeptAccount({ ...deptAccount, branch: e.target.value })}
                        placeholder="e.g. Main Branch"
                        className="w-full border border-slate-300 rounded-md px-3 py-1.5 text-xs text-slate-800 focus:outline-hidden focus:border-blue-500 disabled:bg-slate-100"
                      />
                    </div>
                  </div>
                </div>

                {/* 3. SELF ACCOUNT DETAILS (Manual / Saved Configuration ONLY) */}
                <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/70">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Landmark className="w-3.5 h-3.5 text-emerald-600" />
                      3. Self Account Details (Corporate Bidder Account) <span className="text-red-500">*</span>
                    </label>
                    <span className="text-[10px] font-semibold text-slate-600 bg-slate-200/80 px-2.5 py-0.5 rounded-full">
                      Configuration / Manual Only
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-500 mb-2.5">
                    Select an account from existing company configuration or enter your corporate bank details:
                  </p>

                  {selfAccounts.length > 0 && !isViewOnly && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {selfAccounts.map((account, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleSelectConfiguredSelf(idx)}
                          className={`text-xs px-2.5 py-1.5 rounded-lg border font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                            selectedSelfIndex === idx
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300 font-semibold shadow-xs'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <Check className={`w-3 h-3 ${selectedSelfIndex === idx ? 'text-emerald-600' : 'opacity-0'}`} />
                          {account.bankName} (..{account.accountNo.slice(-4)})
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-white p-3.5 rounded-lg border border-slate-200">
                    <div className="md:col-span-2">
                      <label className="text-[11px] font-semibold text-slate-700 block mb-1">Account Holder Name</label>
                      <input
                        type="text"
                        disabled={isViewOnly}
                        value={selfAccount.accountHolder || ''}
                        onChange={e => {
                          setSelectedSelfIndex(-1)
                          setSelfAccount({ ...selfAccount, accountHolder: e.target.value })
                        }}
                        placeholder="e.g. RBP ENERGY INDIA PRIVATE LIMITED"
                        className="w-full border border-slate-300 rounded-md px-3 py-1.5 text-xs text-slate-800 focus:outline-hidden focus:border-blue-500 disabled:bg-slate-100"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-700 block mb-1">Our Bank Name</label>
                      <input
                        type="text"
                        disabled={isViewOnly}
                        value={selfAccount.bankName}
                        onChange={e => {
                          setSelectedSelfIndex(-1)
                          setSelfAccount({ ...selfAccount, bankName: e.target.value })
                        }}
                        placeholder="e.g. State Bank of India"
                        className="w-full border border-slate-300 rounded-md px-3 py-1.5 text-xs text-slate-800 focus:outline-hidden focus:border-blue-500 disabled:bg-slate-100"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-700 block mb-1">Our Account Number</label>
                      <input
                        type="text"
                        disabled={isViewOnly}
                        value={selfAccount.accountNo}
                        onChange={e => {
                          setSelectedSelfIndex(-1)
                          setSelfAccount({ ...selfAccount, accountNo: e.target.value })
                        }}
                        placeholder="e.g. 1234567890"
                        className="w-full border border-slate-300 rounded-md px-3 py-1.5 text-xs text-slate-800 font-mono focus:outline-hidden focus:border-blue-500 disabled:bg-slate-100"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-700 block mb-1">IFSC Code</label>
                      <input
                        type="text"
                        disabled={isViewOnly}
                        value={selfAccount.ifsc}
                        onChange={e => {
                          setSelectedSelfIndex(-1)
                          setSelfAccount({ ...selfAccount, ifsc: e.target.value.toUpperCase() })
                        }}
                        placeholder="e.g. SBIN0001234"
                        className="w-full border border-slate-300 rounded-md px-3 py-1.5 text-xs text-slate-800 font-mono uppercase focus:outline-hidden focus:border-blue-500 disabled:bg-slate-100"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-700 block mb-1">Branch</label>
                      <input
                        type="text"
                        disabled={isViewOnly}
                        value={selfAccount.branch || ''}
                        onChange={e => {
                          setSelectedSelfIndex(-1)
                          setSelfAccount({ ...selfAccount, branch: e.target.value })
                        }}
                        placeholder="e.g. Industrial Area Branch"
                        className="w-full border border-slate-300 rounded-md px-3 py-1.5 text-xs text-slate-800 focus:outline-hidden focus:border-blue-500 disabled:bg-slate-100"
                      />
                    </div>
                  </div>

                  {!isViewOnly && (
                    <label className="flex items-center gap-2 mt-2.5 text-xs text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={saveSelfConfig}
                        onChange={e => setSaveSelfConfig(e.target.checked)}
                        className="rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span>Save this bank account to Company Configuration for future tenders</span>
                    </label>
                  )}
                </div>

                {/* 4. UTR ID & 5. DATE (Strictly Manual) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/70">
                    <label className="text-xs font-bold text-slate-900 flex items-center justify-between mb-1">
                      <span className="flex items-center gap-1.5">
                        <Hash className="w-3.5 h-3.5 text-purple-600" />
                        4. UTR ID / Reference
                      </span>
                      <span className="text-[10px] font-normal text-slate-500 bg-slate-200/80 px-2 py-0.5 rounded">
                        Optional
                      </span>
                    </label>
                    <p className="text-[11px] text-slate-500 mb-2">
                      Manually entered RTGS / NEFT / Bank transaction reference. Leave blank if not yet available.
                    </p>
                    <input
                      type="text"
                      disabled={isViewOnly}
                      value={utrNumber}
                      onChange={e => setUtrNumber(e.target.value)}
                      placeholder="e.g. UTR12984029482 (Leave blank if pending)"
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono font-semibold text-slate-900 focus:outline-hidden focus:border-blue-500 disabled:bg-slate-100 uppercase"
                    />
                  </div>

                  <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/70">
                    <label className="text-xs font-bold text-slate-900 flex items-center justify-between mb-1">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-amber-600" />
                        5. Payment Date
                      </span>
                      <span className="text-[10px] font-normal text-slate-500 bg-slate-200/80 px-2 py-0.5 rounded">
                        Optional
                      </span>
                    </label>
                    <p className="text-[11px] text-slate-500 mb-2">
                      Date when the payment transfer was executed. Leave blank if not yet executed.
                    </p>
                    <input
                      type="date"
                      disabled={isViewOnly}
                      value={date}
                      onChange={e => setDate(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 focus:outline-hidden focus:border-blue-500 disabled:bg-slate-100"
                    />
                  </div>
                </div>

                {/* 6. REMARK (Strictly Manual) */}
                <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/70">
                  <label className="text-xs font-bold text-slate-900 block mb-1">
                    6. Remark (Manual Notes / Approval Reference)
                  </label>
                  <p className="text-[11px] text-slate-500 mb-2">
                    Any special remarks, exemptions, approval references, or notes for the audit trail.
                  </p>
                  <textarea
                    rows={3}
                    disabled={isViewOnly}
                    value={remarks}
                    onChange={e => setRemarks(e.target.value)}
                    placeholder="Enter manual remarks, bank transaction notes..."
                    className="w-full bg-white border border-slate-300 rounded-lg p-3 text-xs text-slate-800 focus:outline-hidden focus:border-blue-500 disabled:bg-slate-100"
                  />
                </div>

                {/* Advance to Document Generator Banner */}
                <div className="p-3 bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 rounded-xl border border-blue-200 flex items-center justify-between gap-3 shadow-2xs">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center flex-shrink-0 shadow-xs">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-slate-900 block">
                        Auto-Generated EMD Word & PDF Document
                      </span>
                      <p className="text-[11px] text-slate-600 truncate">
                        Formatted with RBP ENERGY INDIA PRIVATE LIMITED letterhead, A4 layout, and exact tender clauses.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const currentFormData = {
                        amount: amount.trim(),
                        departmentAccount: { ...deptAccount },
                        selfAccount: { ...selfAccount },
                        utrNumber: utrNumber.trim(),
                        date: date.trim(),
                        remarks: remarks.trim(),
                      }
                      const updated = buildEmdDocumentPayload(
                        tender,
                        currentFormData,
                        editedDoc || generatedDoc || undefined
                      )
                      setGeneratedDoc(updated)
                      setEditedDoc(updated)
                      setActiveTab('preview')
                    }}
                    className="px-3 py-1.5 rounded-lg bg-white hover:bg-blue-50 border border-blue-300 text-blue-700 font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-all flex-shrink-0 cursor-pointer"
                  >
                    <span>Preview Document</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Modal Actions */}
                <div className="modal-actions pt-2 flex items-center justify-between border-t border-slate-100">
                  <button
                    type="button"
                    className="secondary-button cursor-pointer"
                    onClick={onClose}
                    disabled={submitting}
                  >
                    {isViewOnly ? 'Close' : 'Cancel'}
                  </button>

                  {!isViewOnly && (
                    <button
                      type="submit"
                      disabled={submitting}
                      className="primary-button flex items-center gap-1.5 cursor-pointer"
                    >
                      <Eye className="w-4 h-4" />
                      <span>Proceed to Preview Document</span>
                      <ArrowRight className="w-4 h-4 ml-0.5" />
                    </button>
                  )}
                </div>
              </form>
            )}

            {/* TAB 2: AUTO-GENERATED EMD WORD & PDF DOCUMENT (PREVIEW MODE) */}
            {activeTab === 'preview' && (
              <div className="space-y-4">
                {/* Confirmation & Action Header Card */}
                <div className="p-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl shadow-lg border border-slate-800 space-y-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                        <h3 className="text-sm font-extrabold text-white tracking-wide">
                          Auto-Generated EMD Word &amp; PDF Document
                        </h3>
                        {editedDoc?.status === 'Saved' ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            ✔ Saved in Database
                          </span>
                        ) : editedDoc?.status === 'Modified' ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            ✏️ Modified (Unsaved)
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                            ✨ Prescribed Tender Format
                          </span>
                        )}
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                          1-Page A4 Format
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                          v{editedDoc?.version || 1}
                        </span>
                      </div>
                      <p className="text-[11.5px] text-slate-300 leading-relaxed">
                        Official document format derived from <strong>{tender.tenderDoc?.name || 'Tender NIT PDF'}</strong> with <strong>{RBP_COMPANY.name}</strong> branding. Review the format below and click <strong>&quot;Final Submit &amp; Store in Database&quot;</strong> to store PDF &amp; advance workflow.
                      </p>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 flex-wrap">

                      <button
                        type="button"
                        onClick={() => setActiveTab('editor')}
                        className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                        title="Open interactive Word editor to adjust text and clauses"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Customize in Editor</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleDownloadWord}
                        disabled={isGeneratingDocx}
                        className="text-xs font-bold px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white border border-blue-500 shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        title="Download editable Microsoft Word (.docx) document"
                      >
                        {isGeneratingDocx ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <FileCode className="w-3.5 h-3.5" />
                        )}
                        <span>Download Word (.docx)</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleDownloadPdf}
                        disabled={isGeneratingPdf}
                        className="text-xs font-bold px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white border border-rose-500 shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        title="Download printable A4 vector PDF document"
                      >
                        {isGeneratingPdf ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Download className="w-3.5 h-3.5" />
                        )}
                        <span>Download PDF (.pdf)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveTab('form')}
                        className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all flex items-center gap-1 cursor-pointer"
                        title="Return to EMD Details Form"
                      >
                        <span>← Back to Form</span>
                      </button>

                      {!isViewOnly && (
                        <button
                          type="button"
                          onClick={handleFinalSubmit}
                          disabled={submitting}
                          className="text-xs font-bold px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white border border-emerald-500 shadow-md transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                          title="Save this PDF and document permanently in database and advance tender"
                        >
                          {submitting ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Saving to Database...</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Final Submit &amp; Store in Database</span>
                              <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* HIGH-FIDELITY A4 DOCUMENT PREVIEW SHEET */}
                {(editedDoc || generatedDoc) && (
                  <div className="bg-slate-300/80 p-4 sm:p-8 rounded-2xl flex flex-col items-center gap-6 overflow-x-auto shadow-inner border border-slate-300/80">
                    {/* Notification Banner above Table: Alert user if submitted with blank UTR or Date */}
                    {(!utrNumber.trim() || !date.trim()) && (
                      <div className="w-full max-w-[210mm] bg-amber-50 border-2 border-amber-400 rounded-xl p-3.5 shadow-xs flex items-start gap-3 text-amber-950">
                        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 text-xs">
                          <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                            <span className="font-extrabold text-amber-950 text-xs uppercase tracking-wide">
                              ⚠️ Notification: Document Prepared with Blank Remittance Details
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-amber-200 text-amber-950 text-[10px] font-bold border border-amber-300">
                              Pending Submission Info
                            </span>
                          </div>
                          <p className="text-amber-900 text-[11.5px] leading-relaxed">
                            You have submitted / prepared this EMD document with blank field(s):{' '}
                            <strong className="text-amber-950 underline font-bold">
                              {[
                                !utrNumber.trim() && 'UTR ID / Reference',
                                !date.trim() && 'Payment Date',
                              ]
                                .filter(Boolean)
                                .join(' and ')}
                            </strong>
                            . In the table below, these are marked as <em>&quot;Not Specified / Pending&quot;</em>. You can proceed with submission now and update the transaction details later when the transfer completes.
                          </p>
                          <div className="mt-2 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setActiveTab('form')}
                              className="text-[11px] font-bold px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white cursor-pointer transition-all shadow-xs"
                            >
                              ← Edit &amp; Fill Now
                            </button>
                            <span className="text-[10.5px] text-amber-800">
                              Or proceed with &quot;Final Submit &amp; Store in Database&quot; below.
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    <div ref={previewSheetRef} className="flex flex-col items-center gap-8 w-full max-w-[210mm]">
                      {/* --- 2-PAGE A4 FORMAT (Page 1 & Page 2 Each with Header & Footer) --- */}
                      {/* PAGE 1 OF 2 */}
                      <div
                        className="emd-a4-page bg-white shadow-2xl rounded-xs border border-slate-300 text-slate-900 font-sans flex flex-col justify-between"
                            style={{
                              width: '210mm',
                              minHeight: '297mm',
                              maxHeight: '297mm',
                              height: '297mm',
                              padding: '8mm 12mm',
                              boxSizing: 'border-box',
                              overflow: 'hidden',
                              backgroundColor: '#ffffff',
                            }}
                          >
                            {/* Page 1 Header */}
                            <div className="border-b-2 border-slate-900 pb-3 flex items-center justify-between gap-4 flex-shrink-0">
                              <div className="flex items-center gap-3.5">
                                <img
                                  src="/Logo.PNG"
                                  alt="RBP Logo"
                                  className="h-11 sm:h-12 w-auto object-contain flex-shrink-0"
                                  crossOrigin="anonymous"
                                />
                                <div>
                                  <h1 className="font-extrabold text-base text-slate-950 uppercase tracking-wide leading-tight">
                                    {RBP_COMPANY.name}
                                  </h1>
                                </div>
                              </div>

                              <div className="text-right flex-shrink-0 text-[10px] space-y-0.5 font-sans">
                                <div className="inline-block bg-slate-100 border border-slate-300 rounded px-2.5 py-1 font-mono text-slate-800 font-bold">
                                  REF: {editedDoc?.tenderRefNo || tender.id}
                                </div>
                                <p className="text-slate-600 text-[10px] pt-0.5">
                                  Date: <strong className="text-slate-900">{date || new Date().toISOString().slice(0, 10)}</strong>
                                  
                                </p>
                              </div>
                            </div>

                            {/* Page 1 Body: Title, Addressee, Subject, Preamble, Table 1, Table 2, Table 3 */}
                            <div className="space-y-3 flex-1 my-2 overflow-hidden flex flex-col justify-between text-[10.5px]">
                              {/* Title */}
                              <div className="text-center py-1 space-y-1 flex-shrink-0">
                                
                                <h2 className="font-extrabold text-sm text-slate-950 uppercase tracking-wide">
                                  {editedDoc?.formatTitle || 'PROFORMA FOR EARNEST MONEY DEPOSIT (EMD) VERIFICATION & UNDERTAKING'}
                                </h2>
                                <p className="text-[9.5px] italic text-slate-500">
                                  ({editedDoc?.formatSource || 'As per Tender NIT'})
                                </p>
                              </div>

                              {/* Addressee & Subject */}
                              <div className="space-y-1 flex-shrink-0">
                                <div className="text-[10.5px]">
                                  <strong className="block text-slate-900 font-bold">To, {editedDoc?.addressee || tender.authority || 'The Tender Inviting Authority'}</strong>
                                  <p className="text-slate-600 text-[10px] leading-tight">
                                    {editedDoc?.authorityAddress || `${tender.department}, ${tender.state}`}
                                  </p>
                                </div>

                                <div className="p-2 rounded bg-blue-50/50 border-l-4 border-l-blue-600 border border-blue-100 text-[10.5px]">
                                  <span className="font-bold text-blue-950 uppercase tracking-wider text-[9.5px] block mb-0.5">Subject:</span>
                                  <p className="font-semibold text-slate-900">{editedDoc?.subject || `Submission of Earnest Money Deposit (EMD) for Tender: ${tender.id}`}</p>
                                </div>
                              </div>

                              

                              {/* Tender-prescribed format (Details of EMD and Tender Document Fee) */}
                              {(() => {
                                const emdRs = Math.round(((tender.bid?.packages || []).reduce((n, p) => n + (parseFloat(p.emdLakh) || 0), 0)) * 100000)
                                const feeM = (tender.bid?.tenderFeePlusGst || '').replace(/,/g, '').match(/\d+(?:\.\d+)?/)
                                const feeRs = feeM ? Math.round(parseFloat(feeM[0])) : 0
                                const total = Number(amount)
                                const inr = (n: number) => n.toLocaleString('en-IN')
                                const split = emdRs > 0 && feeRs > 0 && total === emdRs + feeRs ? ` (Rs. ${inr(emdRs)} + Rs. ${inr(feeRs)})` : ''
                                const row = (label: string, value: React.ReactNode, mono = false) => (
                                  <tr className="border-b border-slate-300">
                                    <td className="w-[46%] p-1.5 border-r border-slate-300 text-slate-800">{label}</td>
                                    <td className={`p-1.5 text-slate-900 ${mono ? 'font-mono' : ''}`}>{value || <span className="text-slate-400">__________________</span>}</td>
                                  </tr>
                                )
                                return (
                                  <div className="space-y-2 flex-shrink-0">
                                    <p className="text-[10px] text-slate-700">
                                      A scanned copy of the EMD and Bid Document fee transaction is to be uploaded in the format below.
                                    </p>
                                    <table className="w-full border-collapse border border-slate-400 text-[10px]">
                                      <tbody>
                                        {row('Tender No. and Date', `${editedDoc?.tenderRefNo || tender.bid?.rfsNo || tender.id}${tender.bid?.rfsDate ? ` dated ${tender.bid.rfsDate}` : ''}`)}
                                        {row('Name of the Bidder', RBP_COMPANY.name)}
                                        {row("Bidder's Bank Account Details", '')}
                                        {row('(i) Name of the bank', selfAccount.bankName)}
                                        {row('(ii) Branch', selfAccount.branch)}
                                        {row('(iii) IFS Code', selfAccount.ifsc, true)}
                                        {row('(iv) Account No.', selfAccount.accountNo, true)}
                                        {row('(v) Transaction reference number', utrNumber.trim(), true)}
                                        {row('(vi) Date of transaction', date.trim())}
                                        {row('(vii) EMD + Bid Document Fee', amount ? `Rs. ${inr(total)} /-${split}` : '')}
                                      </tbody>
                                    </table>
                                    <p className="text-[10px] font-bold text-slate-800 pt-1">Beneficiary account (as per Tender)</p>
                                    <table className="w-full border-collapse border border-slate-400 text-[10px]">
                                      <tbody>
                                        {row('Name of A/c', deptAccount.accountHolder)}
                                        {row('Bank & Branch Name', [deptAccount.bankName, deptAccount.branch].filter(Boolean).join(', '))}
                                        {row('Bank Account Number', deptAccount.accountNo, true)}
                                        {row('Branch IFSC Code', deptAccount.ifsc, true)}
                                      </tbody>
                                    </table>
                                    <p className="text-[9.5px] text-slate-600">
                                      Note: The EMD and the Tender Document Fee are deposited as a single NEFT/RTGS transaction in the above account.
                                    </p>
                                  </div>
                                )
                              })()}

                              {/* Signature block (single-page format) */}
                              <div className="pt-3 flex items-end justify-between gap-6 flex-shrink-0">
                                <div className="space-y-0.5 text-[10.5px] text-slate-700">
                                  <p><strong>Place:</strong> {RBP_COMPANY.place}</p>
                                  <p><strong>Date:</strong> {date || new Date().toISOString().slice(0, 10)}</p>
                                </div>
                                <div className="text-right space-y-0.5">
                                  <p className="text-[10.5px] text-slate-900 font-bold">For {RBP_COMPANY.name}</p>
                                  <p className="text-[10.5px] font-semibold text-slate-800">{editedDoc?.signatoryName || RBP_COMPANY.signatory}</p>
                                  <p className="text-[10px] text-slate-500">{editedDoc?.signatoryDesignation || RBP_COMPANY.signatoryDesignation}</p>
                                  <p className="text-[11px] font-bold text-slate-950 pt-3">(Sign &amp; Seal of the bidder)</p>
                                </div>
                              </div>
                            </div>

                            {/* Page 1 Footer */}
                            <div className="w-full flex-shrink-0 mt-auto pt-2">
                              <div
                                className="w-full px-5 py-2.5 rounded-xs flex items-center justify-between gap-4 text-[9.5px] sm:text-[10px] leading-snug border"
                                style={{
                                  backgroundColor: '#FCD497',
                                  borderColor: '#E8B975',
                                  color: '#42372A',
                                }}
                              >
                                <div className="space-y-0.5 text-left">
                                  <p>
                                    <strong className="font-bold text-[#2E2419]">Regd. Office:</strong> 303 Guru Ghasidas Plaza
                                  </p>
                                  <p className="text-[#3E3326]">Amapara, G.E Road, Raipur (C.G) - 492 001</p>
                                </div>

                                <div
                                  className="h-8 w-[1.5px] opacity-70 flex-shrink-0"
                                  style={{ backgroundColor: '#B8925E' }}
                                />

                                <div className="space-y-0.5 text-left">
                                  <p>
                                    <strong className="font-bold text-[#2E2419]">e:</strong> info@rbpindia.com &nbsp;|&nbsp; <strong className="font-bold text-[#2E2419]">w:</strong> rbpindia.com
                                  </p>
                                  <p>
                                    <strong className="font-bold text-[#2E2419]">Sales:</strong> 92000 12500 &nbsp;|&nbsp; <strong className="font-bold text-[#2E2419]">Service:</strong> 92000 12400
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>

                    </div>
                  </div>
                )}

                {/* Bottom Action Bar */}
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between gap-3 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setActiveTab('form')}
                    className="secondary-button cursor-pointer"
                  >
                    <span>← Back to Edit Form</span>
                  </button>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={handleDownloadWord}
                      disabled={isGeneratingDocx}
                      className="text-xs font-bold px-3 py-2 rounded-lg bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <FileCode className="w-3.5 h-3.5 text-blue-600" />
                      <span>Download Word (.docx)</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleDownloadPdf}
                      disabled={isGeneratingPdf}
                      className="text-xs font-bold px-3 py-2 rounded-lg bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Download className="w-3.5 h-3.5 text-rose-600" />
                      <span>Download PDF (.pdf)</span>
                    </button>

                    {!isViewOnly && (
                      <button
                        type="button"
                        onClick={handleFinalSubmit}
                        disabled={submitting}
                        className="primary-button flex items-center gap-1.5 cursor-pointer"
                      >
                        {submitting ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Saving to Database...</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Final Submit &amp; Store in Database</span>
                            <ArrowRight className="w-4 h-4 ml-0.5" />
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: INTERACTIVE WORD EDITOR */}
            {activeTab === 'editor' && editedDoc && (
              <div className="space-y-4">
                {/* Editor Header */}
                <div className="p-3.5 bg-slate-900 text-white rounded-xl shadow-xs flex items-center justify-between gap-3 flex-wrap">
                  <div className="space-y-0.5">
                    <h3 className="text-xs font-extrabold text-white tracking-wide flex items-center gap-2">
                      <Edit3 className="w-3.5 h-3.5 text-blue-400" />
                      <span>Interactive Word Document Editor</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                        v{editedDoc.version || 1}
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Directly edit document clauses, addressee, amounts, and declarations. Click &quot;Preview A4 Document&quot; to inspect changes.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setActiveTab('preview')}
                      className="text-xs font-bold px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white border border-blue-500 shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Preview A4 Document</span>
                    </button>

                    {!isViewOnly && (
                      <button
                        type="button"
                        onClick={handleSaveDocumentChanges}
                        disabled={isSavingDoc}
                        className="text-xs font-bold px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-500 shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        {isSavingDoc ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Save className="w-3.5 h-3.5" />
                        )}
                        <span>Save Changes to Database</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleResetToAiDraft}
                      className="text-slate-400 hover:text-white p-1.5 rounded-lg border border-transparent hover:border-slate-700 transition-colors cursor-pointer"
                      title="Reset document to original AI template"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Editor Form Inputs */}
                <div className="space-y-4 bg-slate-50/70 p-4 rounded-xl border border-slate-200 text-xs animate-in fade-in">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                    <div>
                      <strong className="text-slate-900 block text-xs">
                        Customise Document Fields
                      </strong>
                      <p className="text-[11px] text-slate-500">
                        Modify text, addressee, amounts, bank particulars, and compliance declarations. Changes update the Word and PDF documents.
                      </p>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                      Live Word Editor
                    </span>
                  </div>

                  {/* Section 1: Title & Addressee */}
                  <div className="bg-white p-3.5 rounded-lg border border-slate-200 space-y-3">
                    <span className="text-[11px] font-bold text-blue-900 block uppercase tracking-wider">
                      1. Document Title &amp; Addressee
                    </span>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="md:col-span-2">
                        <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                          Document Format Title (Prescribed by Tender)
                        </label>
                        <input
                          type="text"
                          value={editedDoc.formatTitle}
                          onChange={e => {
                            setEditedDoc({ ...editedDoc, formatTitle: e.target.value, status: 'Modified' })
                          }}
                          className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-800 font-bold focus:border-blue-500"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                          To / Addressee Authority Name
                        </label>
                        <input
                          type="text"
                          value={editedDoc.addressee}
                          onChange={e => {
                            setEditedDoc({ ...editedDoc, addressee: e.target.value, status: 'Modified' })
                          }}
                          className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-800 font-semibold focus:border-blue-500"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                          Authority Official Address
                        </label>
                        <input
                          type="text"
                          value={editedDoc.authorityAddress}
                          onChange={e => {
                            setEditedDoc({ ...editedDoc, authorityAddress: e.target.value, status: 'Modified' })
                          }}
                          className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-800 focus:border-blue-500"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                          Subject Line
                        </label>
                        <input
                          type="text"
                          value={editedDoc.subject}
                          onChange={e => {
                            setEditedDoc({ ...editedDoc, subject: e.target.value, status: 'Modified' })
                          }}
                          className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-800 font-semibold focus:border-blue-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Section 2: Amounts & Transaction Particulars */}
                  <div className="bg-white p-3.5 rounded-lg border border-slate-200 space-y-3">
                    <span className="text-[11px] font-bold text-blue-900 block uppercase tracking-wider">
                      2. Transaction Particulars &amp; Amount Words
                    </span>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                          EMD Amount (₹)
                        </label>
                        <input
                          type="text"
                          value={amount}
                          onChange={e => {
                            const val = e.target.value
                            const numVal = /lakh|lac|crore|cr|thousand/i.test(val)
                              ? parseAmountToNumeric(val)
                              : val.replace(/[^0-9]/g, '')
                            setAmount(numVal)
                            setEditedDoc({
                              ...editedDoc,
                              amountInWords: numberToIndianWords(numVal),
                              status: 'Modified',
                            })
                          }}
                          className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-800 font-bold font-mono focus:border-blue-500"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                          Amount in Words (Calculated)
                        </label>
                        <input
                          type="text"
                          value={editedDoc.amountInWords || numberToIndianWords(amount)}
                          onChange={e => {
                            setEditedDoc({ ...editedDoc, amountInWords: e.target.value, status: 'Modified' })
                          }}
                          className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-800 font-medium focus:border-blue-500"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                          UTR / Transaction Ref No.
                        </label>
                        <input
                          type="text"
                          value={utrNumber}
                          onChange={e => {
                            setUtrNumber(e.target.value)
                            setEditedDoc({ ...editedDoc, status: 'Modified' })
                          }}
                          className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-800 font-mono uppercase focus:border-blue-500"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                          Payment Date
                        </label>
                        <input
                          type="date"
                          value={date}
                          onChange={e => {
                            setDate(e.target.value)
                            setEditedDoc({ ...editedDoc, status: 'Modified' })
                          }}
                          className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-800 focus:border-blue-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Section 3: Declarations & Compliance Clauses */}
                  <div className="bg-white p-3.5 rounded-lg border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-blue-900 block uppercase tracking-wider">
                        3. Compliance Declarations &amp; Undertakings (Extracted from Tender PDF)
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const current = [...(editedDoc.declarations || [])]
                          current.push('We further undertake to abide by all the general and special conditions of contract.')
                          setEditedDoc({ ...editedDoc, declarations: current, status: 'Modified' })
                        }}
                        className="text-[10px] font-bold text-blue-700 hover:text-blue-900 flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" /> Add Declaration Clause
                      </button>
                    </div>

                    <div className="space-y-2">
                      {editedDoc.declarations.map((decl, idx) => (
                        <div key={idx} className="flex items-start gap-2">
                          <span className="font-bold text-slate-500 pt-1 text-[11px]">{idx + 1}.</span>
                          <textarea
                            rows={2}
                            value={decl}
                            onChange={e => {
                              const current = [...editedDoc.declarations]
                              current[idx] = e.target.value
                              setEditedDoc({ ...editedDoc, declarations: current, status: 'Modified' })
                            }}
                            className="flex-1 border border-slate-300 rounded p-2 text-xs text-slate-800 focus:border-blue-500"
                          />
                          {editedDoc.declarations.length > 1 && (
                            <button
                              type="button"
                              onClick={() => {
                                const current = editedDoc.declarations.filter((_, i) => i !== idx)
                                setEditedDoc({ ...editedDoc, declarations: current, status: 'Modified' })
                              }}
                              className="text-slate-400 hover:text-red-600 p-1 rounded cursor-pointer pt-2"
                              title="Remove this clause"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Section 4: Signatory Details */}
                  <div className="bg-white p-3.5 rounded-lg border border-slate-200 space-y-3">
                    <span className="text-[11px] font-bold text-blue-900 block uppercase tracking-wider">
                      4. Signatory Authority Details
                    </span>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                          Signatory Name
                        </label>
                        <input
                          type="text"
                          value={editedDoc.signatoryName}
                          onChange={e => {
                            setEditedDoc({ ...editedDoc, signatoryName: e.target.value, status: 'Modified' })
                          }}
                          className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-800 font-bold focus:border-blue-500"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                          Designation
                        </label>
                        <input
                          type="text"
                          value={editedDoc.signatoryDesignation}
                          onChange={e => {
                            setEditedDoc({ ...editedDoc, signatoryDesignation: e.target.value, status: 'Modified' })
                          }}
                          className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-800 focus:border-blue-500"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                          Additional Remarks / Notes
                        </label>
                        <input
                          type="text"
                          value={editedDoc.customNotes || ''}
                          onChange={e => {
                            setEditedDoc({ ...editedDoc, customNotes: e.target.value, status: 'Modified' })
                          }}
                          placeholder="Optional extra remarks for EMD document..."
                          className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-800 focus:border-blue-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Editor Bottom Actions */}
                  <div className="pt-2 flex items-center justify-between border-t border-slate-200">
                    <button
                      type="button"
                      onClick={() => setActiveTab('preview')}
                      className="secondary-button cursor-pointer"
                    >
                      <span>← Back to Preview</span>
                    </button>

                    {!isViewOnly && (
                      <button
                        type="button"
                        onClick={handleSaveDocumentChanges}
                        disabled={isSavingDoc}
                        className="primary-button flex items-center gap-1.5 cursor-pointer"
                      >
                        {isSavingDoc ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Save className="w-4 h-4" />
                        )}
                        <span>Save Changes to Database</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: UNIVERSAL AI DOCUMENT READER & ASSISTANT */}
          {isAiOpen && (
            <div className="w-full md:w-[45%] border border-slate-200 rounded-2xl bg-white flex flex-col h-[78vh] overflow-hidden shadow-sm animate-in slide-in-from-right-4 duration-200 flex-shrink-0">
              {/* AI Panel Header */}
              <div className="px-4 py-3 bg-gradient-to-r from-slate-50 via-indigo-50/40 to-slate-50 border-b border-slate-200 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-600 to-purple-600 text-white flex items-center justify-center shadow-xs">
                      <Bot className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                        Universal Document Reader
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      </h4>
                      <p className="text-[10px] text-slate-500">
                        Strict Document-Based Verification • Page References
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {selectedDocItem && (
                      <button
                        type="button"
                        onClick={() => setPreviewDoc(selectedDocItem.doc)}
                        className="text-slate-500 hover:text-blue-700 p-1.5 rounded-lg hover:bg-slate-100 text-xs font-medium flex items-center gap-1 cursor-pointer"
                        title="Preview document in high-resolution viewer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span className="text-[11px] hidden sm:inline">Preview</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setIsAiOpen(false)}
                      className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
                      title="Collapse AI panel"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Document Selector & Upload Button */}
                <div className="flex items-center gap-2 pt-1 border-t border-slate-200/60">
                  <div className="flex-1 min-w-0">
                    <select
                      value={selectedDocId}
                      onChange={e => {
                        setSelectedDocId(e.target.value)
                        setExtractedEmd(null)
                      }}
                      className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-slate-800 focus:outline-hidden focus:border-indigo-500 truncate"
                    >
                      {availableDocs.map(d => (
                        <option key={d.id} value={d.id}>
                          📄 {d.name} {d.type === 'corrigendum' ? '(Corrigendum)' : d.type === 'custom' ? '(Uploaded)' : '(NIT PDF)'}
                        </option>
                      ))}
                    </select>
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,image/*"
                    className="hidden"
                    onChange={e => e.target.files && handleUploadCustomDoc(e.target.files)}
                  />

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-2.5 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg border border-slate-200 flex items-center gap-1 transition-colors flex-shrink-0 cursor-pointer"
                    title="Upload additional document or payment challan"
                  >
                    <UploadCloud className="w-3 h-3 text-slate-500" />
                    <span>Upload Doc</span>
                  </button>
                </div>

                {/* Sub-Tabs: Deep Scan vs Interactive Chat */}
                <div className="flex rounded-lg bg-slate-200/70 p-0.5 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setAiTab('scan')}
                    className={`flex-1 py-1 rounded-md transition-all text-center cursor-pointer ${
                      aiTab === 'scan'
                        ? 'bg-white text-indigo-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    🔍 EMD Deep Scan & Verification
                  </button>
                  <button
                    type="button"
                    onClick={() => setAiTab('chat')}
                    className={`flex-1 py-1 rounded-md transition-all text-center cursor-pointer ${
                      aiTab === 'chat'
                        ? 'bg-white text-indigo-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    💬 Ask Document AI
                  </button>
                </div>
              </div>

              {/* Panel Content Body */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
                {/* Progress Indicator */}
                {parsingProgress && (
                  <div className="p-3 bg-white rounded-xl border border-indigo-100 shadow-xs space-y-2">
                    <div className="flex items-center gap-2 text-indigo-700 text-xs font-semibold">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>{parsingProgress.stageLabel || 'Processing Document...'}</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-indigo-600 h-1.5 rounded-full transition-all duration-300"
                        style={{ width: `${parsingProgress.percent}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-slate-500">{parsingProgress.message}</p>
                  </div>
                )}

                {/* TAB 1: EMD DEEP SCAN & VERIFICATION */}
                {aiTab === 'scan' && (
                  <div className="space-y-3.5">
                    {/* Trigger Scan Card */}
                    <div className="p-3.5 bg-gradient-to-br from-indigo-50/70 via-white to-purple-50/40 rounded-xl border border-indigo-100 shadow-xs space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h5 className="font-bold text-xs text-indigo-950 flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                            Deep AI EMD Extraction Engine
                          </h5>
                          <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                            Deeply parses <strong>{selectedDocItem?.name}</strong> using multi-page OCR and table analysis. Extracts verified EMD Amount, Beneficiary Bank, accepted payment modes, and exemption rules.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={handleRunDeepEmdScan}
                          disabled={isAiLoading}
                          className="primary-button text-xs py-1.5 px-3 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          {isAiLoading ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              <span>Scanning Document...</span>
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-3 h-3" />
                              <span>{extractedEmd ? 'Re-Scan Document' : 'Run Deep EMD Scan'}</span>
                            </>
                          )}
                        </button>

                        {extractedEmd && (
                          <button
                            type="button"
                            onClick={handleApplyExtractedToForm}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-colors shadow-xs cursor-pointer"
                            title="Auto-fill verified EMD Amount and Department Bank details into the form"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Apply to Form</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Extracted Verified Results Card */}
                    {extractedEmd ? (
                      <div className="space-y-3">
                        <div className="p-3 bg-white rounded-xl border border-emerald-200/80 shadow-xs space-y-2.5">
                          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                            <span className="font-bold text-xs text-emerald-900 flex items-center gap-1.5">
                              <ShieldCheck className="w-4 h-4 text-emerald-600" />
                              Document Ground-Truth Verification
                            </span>
                            <span className="text-[10px] text-slate-400 font-medium">
                              Zero Hallucination
                            </span>
                          </div>

                          {/* 1. Verified EMD Amount */}
                          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/70 text-xs space-y-1">
                            <span className="font-bold text-slate-700 block text-[11px] uppercase tracking-wide">
                              1. Confirmed EMD Amount:
                            </span>
                            {extractedEmd.amount ? (
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-sm text-blue-700 font-mono">
                                    {parseAmountToNumeric(extractedEmd.amount)}
                                  </span>
                                  <span className="text-[10.5px] text-slate-500 font-medium">
                                    (₹ {!isNaN(Number(parseAmountToNumeric(extractedEmd.amount))) ? Number(parseAmountToNumeric(extractedEmd.amount)).toLocaleString('en-IN') : extractedEmd.amount})
                                  </span>
                                </div>
                                {extractedEmd.pageRef && (
                                  <span className="text-[10px] text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                                    {extractedEmd.pageRef}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <p className="text-[11px] text-amber-700 font-medium italic">
                                &quot;This information is not available in the provided document.&quot;
                              </p>
                            )}
                          </div>

                          {/* 2. Verified Beneficiary Bank */}
                          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/70 text-xs space-y-1">
                            <span className="font-bold text-slate-700 block text-[11px] uppercase tracking-wide">
                              2. Beneficiary Bank Details:
                            </span>
                            {extractedEmd.accountNo || extractedEmd.bankName ? (
                              <div className="space-y-1 text-slate-800 text-[11px]">
                                {extractedEmd.accountHolder && (
                                  <div>
                                    <span className="text-slate-500">Beneficiary: </span>
                                    <strong>{extractedEmd.accountHolder}</strong>
                                  </div>
                                )}
                                <div>
                                  <span className="text-slate-500">Bank: </span>
                                  <strong>{extractedEmd.bankName || 'N/A'}</strong>
                                  {extractedEmd.branch && <span> ({extractedEmd.branch})</span>}
                                </div>
                                <div className="font-mono">
                                  <span className="text-slate-500">A/C: </span>
                                  <strong>{extractedEmd.accountNo || 'N/A'}</strong>
                                  {extractedEmd.ifsc && (
                                    <span className="ml-2">
                                      IFSC: <strong>{extractedEmd.ifsc}</strong>
                                    </span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <p className="text-[11px] text-amber-700 font-medium italic">
                                &quot;This information is not available in the provided document.&quot;
                              </p>
                            )}
                          </div>

                          {/* 3. Payment Modes & Exemption */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                            <div className="p-2 rounded-lg bg-slate-50 border border-slate-200/70">
                              <span className="text-[10px] text-slate-500 font-bold uppercase block">
                                Accepted Modes:
                              </span>
                              <span className="text-[11px] text-slate-800 font-medium">
                                {extractedEmd.modes || 'Not specified in document'}
                              </span>
                            </div>
                            <div className="p-2 rounded-lg bg-slate-50 border border-slate-200/70">
                              <span className="text-[10px] text-slate-500 font-bold uppercase block">
                                Validity Period:
                              </span>
                              <span className="text-[11px] text-slate-800 font-medium">
                                {extractedEmd.validity || 'Not specified in document'}
                              </span>
                            </div>
                          </div>

                          {/* 4. Exemption */}
                          {extractedEmd.exemption && (
                            <div className="p-2 rounded-lg bg-indigo-50/60 border border-indigo-100 text-[11px] text-indigo-900">
                              <span className="font-bold block">EMD Exemption (MSME / Startup):</span>
                              <p className="mt-0.5">{extractedEmd.exemption}</p>
                            </div>
                          )}

                          {/* Apply Button */}
                          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                            <button
                              type="button"
                              onClick={handleApplyExtractedToForm}
                              className="w-full primary-button py-2 text-xs flex items-center justify-center gap-2 cursor-pointer"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Apply Verified Document Details to Form</span>
                            </button>
                          </div>
                        </div>

                        {/* Full Raw Markdown Accordion */}
                        {extractedEmd.rawMarkdown && (
                          <div className="p-3 bg-white rounded-xl border border-slate-200 text-xs">
                            <span className="font-bold text-slate-700 block mb-1">
                              Detailed AI Extraction Report:
                            </span>
                            <div className="prose prose-xs max-h-60 overflow-y-auto bg-slate-50 p-2.5 rounded-lg">
                              <MarkdownContent content={extractedEmd.rawMarkdown} />
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      !isAiLoading && (
                        <div className="p-6 text-center bg-white rounded-xl border border-slate-200 shadow-2xs space-y-2">
                          <FileCheck2 className="w-8 h-8 text-indigo-400 mx-auto" />
                          <h6 className="font-bold text-xs text-slate-800">
                            Ready to analyze {selectedDocItem?.name}
                          </h6>
                          <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                            Click &quot;Run Deep EMD Scan&quot; above to deeply read this document, extract verified EMD amounts, bank accounts, and exemption clauses with page numbers.
                          </p>
                        </div>
                      )
                    )}
                  </div>
                )}

                {/* TAB 2: INTERACTIVE DOCUMENT Q&A */}
                {aiTab === 'chat' && (
                  <div className="space-y-3">
                    {/* Welcome & Prompt Pills */}
                    {messages.length === 0 && (
                      <div className="space-y-3">
                        <div className="p-3 bg-white rounded-xl border border-indigo-100 shadow-2xs text-xs text-slate-700 space-y-1.5">
                          <div className="flex items-center gap-1.5 text-indigo-700 font-bold">
                            <Bot className="w-4 h-4" />
                            <span>Document AI Assistant Ready</span>
                          </div>
                          <p className="text-[11px] text-slate-600 leading-relaxed">
                            Ask any question regarding <strong>{selectedDocItem?.name}</strong>. The AI will read the exact text and cite page numbers. Never hallucinates.
                          </p>
                        </div>

                        <div className="space-y-1.5">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1">
                            Suggested EMD Questions:
                          </p>
                          {EMD_QUICK_PROMPTS.map((prompt, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => handleAskQuestion(prompt)}
                              disabled={isAiLoading}
                              className="w-full text-left text-xs text-slate-700 bg-white hover:bg-indigo-50/70 hover:text-indigo-900 border border-slate-200 hover:border-indigo-300 rounded-lg p-2 transition-all shadow-2xs font-medium cursor-pointer"
                            >
                              👉 {prompt}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Chat Messages */}
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
                                  type="button"
                                  onClick={() => handleCopy(msg.id, msg.content)}
                                  className="inline-flex items-center gap-1 hover:text-slate-700 p-0.5 rounded cursor-pointer"
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

                    {/* Loading State */}
                    {isAiLoading && (
                      <div className="flex flex-col items-start gap-1">
                        <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-xs p-3 shadow-2xs text-xs text-slate-600 max-w-[92%] space-y-2">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 text-indigo-700 font-semibold">
                              <Sparkles className="w-3.5 h-3.5 text-indigo-600 animate-pulse" />
                              <span>Reading document pages & verifying facts...</span>
                            </div>
                            <span className="text-[11px] font-mono font-bold text-indigo-600">
                              {queryProgress}%
                            </span>
                          </div>
                          <div className="w-full bg-indigo-100 rounded-full h-1.5 overflow-hidden">
                            <div
                              className="bg-indigo-600 h-1.5 rounded-full transition-all duration-300"
                              style={{ width: `${Math.max(10, Math.min(100, queryProgress))}%` }}
                            />
                          </div>
                          <p className="text-[10px] text-slate-400 italic">
                            Strict document search across all pages for exact answer...
                          </p>
                        </div>
                      </div>
                    )}

                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {/* Chat Input Box (Only for chat tab) */}
              {aiTab === 'chat' && (
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
                        className="absolute right-2 bottom-2.5 p-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
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
              )}
            </div>
          )}
        </div>

        {/* High-Resolution Document Inspection Modal */}
        {previewDoc && (
          <DocumentPreviewModal
            document={previewDoc}
            onClose={() => setPreviewDoc(null)}
          />
        )}
      </div>
    </div>
  )
}
