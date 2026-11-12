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
  content: string
  charCount: number
  isScanned?: boolean
  hasTables?: boolean
  rowStart?: number
  rowEnd?: number
  keywords?: string[]
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
  snippet?: string
  relevanceScore?: number
}

/**
 * Result of the strict document accuracy & verification audit
 */
export interface DocumentVerificationResult {
  isVerified: boolean
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
  chunks: DocumentPageChunk[]
}

