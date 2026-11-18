export type DocumentType = 'pdf' | 'excel' | 'word' | 'image' | 'csv' | 'text' | 'other'

/**
 * Intelligent chunk representing a single page, section, or sheet segment
 * with exact document coordinates for strict source attribution.
 */
export interface DocumentPageChunk {
  id: string
  docName: string
  docType: DocumentType
  pageNumber?: number
  totalPages?: number
  sheetName?: string
  cellRange?: string
  sectionTitle?: string
  clauseOrRef?: string
  content: string
  charCount: number
  isScanned?: boolean
  /** Tesseract mean confidence (0-100) for OCR pages; undefined for digital text */
  ocrConfidence?: number
  hasTables?: boolean
  tableData?: string[][]
  dataUrl?: string // Base64 rendered page image for vision multimodal understanding
  rowStart?: number
  rowEnd?: number
  keywords?: string[]
  /** BM25-based retrieval score assigned at query time */
  relevanceScore?: number
  /** How the page text was obtained: text | ocr | vision | text+ocr | text+vision | ocr+vision | failed */
  extractionMethod?: string
  /** Extraction quality flags (e.g. low-ocr-confidence, vision-extra-content-unconfirmed) */
  qualityFlags?: string[]
}

/**
 * Verified source reference cited in an AI answer
 */
export interface DocumentSourceCitation {
  docName: string
  pageNumber?: number
  sheetName?: string
  cellRef?: string
  sectionTitle?: string
  clauseOrRef?: string
  snippet?: string
  relevanceScore?: number
}

/**
 * Result of the strict document accuracy & verification audit
 */
export interface DocumentVerificationResult {
  isVerified: boolean
  /** verified | verified-scanned | not-verified | evidence-not-found | extraction-incomplete */
  status?: 'verified' | 'verified-scanned' | 'not-verified' | 'evidence-not-found' | 'extraction-incomplete'
  /** number of numeric/date/amount/quote facts machine-checked */
  factChecks?: number
  /** retrieved chunks the answer validly cites */
  citedChunks?: DocumentPageChunk[]
  /** result of the independent OpenAI verification pass (proposal E), when it ran */
  semanticCheck?: {
    ran: boolean
    verdict: 'supported' | 'unsupported' | 'partially-supported' | 'missed-evidence' | 'no-claims' | 'error'
    notes: string
  }
  confidence: 'high' | 'medium' | 'low' | 'unsupported'
  verifiedSources: DocumentSourceCitation[]
  unverifiedClaims?: string[]
  conflictsDetected?: Array<{
    field: string
    values: Array<{ source: string; value: string }>
  }>
  auditNotes?: string
}

/**
 * Multi-stage progress tracking for 200-500+ page processing pipeline
 */
export type ProcessingStage =
  | 'idle'
  | 'uploading'
  | 'extracting_content'
  | 'processing_pages'
  | 'analyzing_document'
  | 'verifying_information'
  | 'generating_answer'
  | 'completed'
  | 'error'

export interface ProcessingProgress {
  stage: ProcessingStage
  stageLabel: string
  current?: number
  total?: number
  percent?: number
  message?: string
}

export interface DocumentSectionMapItem {
  sectionTitle: string
  startPage: number
  endPage?: number
  clauses?: string[]
}

/**
 * Complete parsed document payload including extracted chunks
 */
export interface ParsedDocumentResult {
  name: string
  type: string
  size: number
  dataUrl?: string
  extractedText: string
  previewText?: string
  isImage?: boolean
  pageCount?: number
  sheetCount?: number
  rowCount?: number
  isScanned?: boolean
  executiveSummary?: string
  documentMap?: DocumentSectionMapItem[]
  /** PDF page numbers whose text could not be extracted (scanned w/o OCR, parse errors, over limit) */
  unreadablePages?: number[]
  chunks: DocumentPageChunk[]
}

