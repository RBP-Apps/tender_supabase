'use client'

import { DocumentPageChunk } from '@/types/document-understanding'

export type IndexRole = 'tender' | 'corrigendum' | 'bidder' | 'chat'

export interface IndexClientResult {
  ok: boolean
  indexId: string | null
  persisted: boolean
  status: string
  docName: string
  pageCount: number
  pagesDone: number
  unreadablePages: number[]
  ocrPages: number[]
  visionPages: number[]
  warnings: string[]
  /** only when the server could not persist the index */
  chunks?: DocumentPageChunk[]
  error?: string
  estimatedCostUsd: number
}

/**
 * Index a document server-side (pdf.js → OCR eng+hin → OpenAI Vision → embeddings),
 * calling the batched endpoint until the whole document is done.
 */
export async function indexDocument(params: {
  tenderId: string
  role: IndexRole
  docName: string
  source: string
  onProgress?: (pagesDone: number, pageCount: number) => void
}): Promise<IndexClientResult> {
  let indexId: string | undefined
  let cost = 0
  const warnings = new Set<string>()
  for (let attempt = 0; attempt < 60; attempt++) {
    const res = await fetch('/api/document-index', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenderId: params.tenderId,
        role: params.role,
        docName: params.docName,
        // the server re-reads the stored copy when resuming by indexId
        source: indexId ? undefined : params.source,
        indexId,
      }),
    })
    const data = await res.json().catch(() => ({}))
    cost += data?.usage?.estimatedCostUsd || 0
    ;(data?.warnings || []).forEach((w: string) => warnings.add(w))
    if (!res.ok) {
      return {
        ok: false,
        indexId: indexId || null,
        persisted: false,
        status: 'failed',
        docName: params.docName,
        pageCount: 0,
        pagesDone: 0,
        unreadablePages: [],
        ocrPages: [],
        visionPages: [],
        warnings: Array.from(warnings),
        error: data?.error || `Indexing failed (HTTP ${res.status})`,
        estimatedCostUsd: cost,
      }
    }
    params.onProgress?.(data.pagesDone || 0, data.pageCount || 0)
    if (data.done || !data.indexId) {
      return {
        ok: true,
        indexId: data.indexId,
        persisted: !!data.persisted,
        status: data.status,
        docName: data.docName,
        pageCount: data.pageCount,
        pagesDone: data.pagesDone,
        unreadablePages: data.unreadablePages || [],
        ocrPages: data.ocrPages || [],
        visionPages: data.visionPages || [],
        warnings: Array.from(warnings),
        chunks: data.chunks,
        estimatedCostUsd: cost,
      }
    }
    indexId = data.indexId
  }
  return {
    ok: false,
    indexId: indexId || null,
    persisted: true,
    status: 'processing',
    docName: params.docName,
    pageCount: 0,
    pagesDone: 0,
    unreadablePages: [],
    ocrPages: [],
    visionPages: [],
    warnings: Array.from(warnings),
    error: 'Indexing did not finish; please retry.',
    estimatedCostUsd: cost,
  }
}

/** Index the tender's own document and its corrigenda (used before Eligibility / Sample AI checks). */
export async function indexTenderDocuments(
  tender: any,
  onProgress?: (message: string) => void
): Promise<{ results: IndexClientResult[]; errors: string[] }> {
  const results: IndexClientResult[] = []
  const errors: string[] = []
  const items: Array<{ role: IndexRole; name: string; source: string }> = []
  const DEFAULT_PDF = 'Image_Module_Tender_11f1aec243f3da04a696b42e99c9ac7b.pdf'
  const tenderSource =
    tender?.tenderDoc?.dataUrl ||
    (tender?.tenderDoc?.name ? `/docs/${tender.tenderDoc.name}` : undefined) ||
    `/docs/${DEFAULT_PDF}`
  const tenderDocName = tender?.tenderDoc?.name || DEFAULT_PDF
  items.push({
    role: 'tender',
    name: tenderDocName,
    source: tenderSource,
  })
  for (const c of tender?.corrigenda || []) {
    const src = c?.fileUrl || c?.dataUrl
    if (src) items.push({ role: 'corrigendum', name: c.fileName || `${c.corrigendumNo || 'Corrigendum'}.pdf`, source: src })
  }
  for (const it of items) {
    onProgress?.(`Reading "${it.name}"…`)
    const r = await indexDocument({
      tenderId: String(tender.id),
      role: it.role,
      docName: it.name,
      source: it.source,
      onProgress: (d, t) => onProgress?.(`Reading "${it.name}": ${d}/${t || '?'} pages`),
    })
    results.push(r)
    if (!r.ok) errors.push(`${it.name}: ${r.error}`)
  }
  return { results, errors }
}
