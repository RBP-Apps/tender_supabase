'use client'

import {
  parseUniversalFile,
  formatBytes,
  UniversalParseOptions,
} from './universal-document-parser'
import {
  DocumentPageChunk,
  ParsedDocumentResult,
  ProcessingProgress,
} from '@/types/document-understanding'

export interface ParsedFileInfo {
  name: string
  type: string
  size: number
  dataUrl?: string
  extractedText: string
  previewText?: string
  rowCount?: number
  sheetCount?: number
  pageCount?: number
  isImage?: boolean
  isScanned?: boolean
  chunks?: DocumentPageChunk[]
}

/**
 * Re-export formatFileSize for backward compatibility
 */
export const formatFileSize = formatBytes

/**
 * Universal client-side document reading engine.
 * Handles 200–500+ page PDFs, multi-sheet Excel files, Word documents,
 * images with OCR, and CSVs with page-level chunking.
 */
export async function parseFileForChat(
  file: File,
  onProgress?: (progress: ProcessingProgress) => void
): Promise<ParsedFileInfo> {
  try {
    const result: ParsedDocumentResult = await parseUniversalFile(file, {
      onProgress,
      enableOcr: true,
      maxPages: 600,
    })

    return {
      name: result.name,
      type: result.type,
      size: result.size,
      dataUrl: result.dataUrl,
      extractedText: result.extractedText,
      previewText: result.previewText,
      rowCount: result.rowCount,
      sheetCount: result.sheetCount,
      pageCount: result.pageCount,
      isImage: result.isImage,
      isScanned: result.isScanned,
      chunks: result.chunks,
    }
  } catch (err: any) {
    console.warn(`Universal parser warning for ${file.name}, using safe fallback:`, err)
    return {
      name: file.name,
      type: file.type || 'application/octet-stream',
      size: file.size,
      extractedText: `[Document: ${file.name} (${formatBytes(file.size)})]`,
      previewText: `Could not parse entire file: ${err?.message || 'Format warning'}. Passing to Vision/AI engine.`,
      chunks: [],
    }
  }
}
