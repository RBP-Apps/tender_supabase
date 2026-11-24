// Server-only. Tender-specific evidence shared by Chat, Eligibility and Sample Details.
// Only the tender's OWN document and its corrigenda are ever loaded — never
// another tender's file and never a default/sample PDF.

import { ensureDocumentIndexed, IndexedDocument, pagesToChunks, semanticScores } from '@/lib/document-index-store'
import { retrieveContextForQuery, RetrievalResult } from '@/lib/document-retrieval-engine'
import { UsageTracker } from '@/lib/ai-usage'
import { DocumentPageChunk } from '@/types/document-understanding'
import { buildTenderMap, type SectionKey } from '@/lib/tender-map'

export interface TenderEvidence {
  docs: IndexedDocument[]
  chunks: DocumentPageChunk[]
  warnings: string[]
  /** at least one document is still being indexed (call again / show progress) */
  incomplete: boolean
  /** a human-readable account of what was read */
  statusText: string
}

export async function loadTenderEvidence(
  tender: any,
  opts: { usage?: UsageTracker; timeBudgetMs?: number; includeCorrigenda?: boolean } = {}
): Promise<TenderEvidence> {
  const warnings: string[] = []
  const docs: IndexedDocument[] = []
  const tenderId = String(tender?.id || '')
  if (!tenderId) return { docs, chunks: [], warnings: ['Tender has no id.'], incomplete: false, statusText: 'No tender.' }

  const sources: Array<{ role: 'tender' | 'corrigendum'; name: string; source: string }> = []
  const DEFAULT_PDF = 'Image_Module_Tender_11f1aec243f3da04a696b42e99c9ac7b.pdf'
  const tenderDocSrc =
    tender?.tenderDoc?.dataUrl ||
    (tender?.tenderDoc?.name ? `/docs/${tender.tenderDoc.name}` : undefined) ||
    `/docs/${DEFAULT_PDF}`
  const tenderDocName = tender?.tenderDoc?.name || DEFAULT_PDF
  sources.push({ role: 'tender', name: tenderDocName, source: tenderDocSrc })
  if (opts.includeCorrigenda !== false && Array.isArray(tender.corrigenda)) {
    for (const c of tender.corrigenda) {
      const src = c?.fileUrl || c?.dataUrl
      if (src) sources.push({ role: 'corrigendum', name: c.fileName || `${c.corrigendumNo || 'Corrigendum'}.pdf`, source: src })
    }
  }
  if (!sources.length) {
    return {
      docs,
      chunks: [],
      warnings: ['No tender document is attached to this tender.'],
      incomplete: false,
      statusText: 'No tender document attached.',
    }
  }

  const perDocBudget = Math.max(60000, Math.floor((opts.timeBudgetMs ?? 200000) / sources.length))
  for (const s of sources) {
    const d = await ensureDocumentIndexed({
      tenderId,
      role: s.role,
      docName: s.name,
      source: s.source,
      timeBudgetMs: perDocBudget,
      usage: opts.usage,
    })
    docs.push(d)
    warnings.push(...d.warnings.map(w => `${s.name}: ${w}`))
  }

  const chunks = docs.flatMap(d => pagesToChunks(d, d.pages))
  // A document is only incomplete if it produced 0 pages and is not done
  const incomplete = docs.some(d => !d.done && d.pages.length === 0)
  const statusText = docs
    .map(d =>
      d.status === 'failed'
        ? `"${d.docName}" could not be read (${d.error || 'error'})`
        : `"${d.docName}" (${d.role}): ${d.pagesDone}/${d.pageCount} pages read` +
          (d.ocrPages.length ? `, OCR on p.${d.ocrPages.slice(0, 15).join(',')}${d.ocrPages.length > 15 ? '…' : ''}` : '') +
          (d.visionPages.length ? `, Vision on p.${d.visionPages.slice(0, 15).join(',')}${d.visionPages.length > 15 ? '…' : ''}` : '') +
          (d.unreadablePages.length ? `, UNREADABLE p.${d.unreadablePages.join(',')}` : '') +
          (d.done ? '' : ' (indexing still in progress)')
    )
    .join('; ')
  return { docs, chunks, warnings, incomplete, statusText }
}

/**
 * Hybrid retrieval (BM25 + pgvector) over chunks that all belong to one tender.
 * Semantic failure is reported in `warnings`; keyword retrieval still runs.
 */
export async function hybridRetrieve(params: {
  tenderId: string
  docs: Array<Pick<IndexedDocument, 'indexId' | 'persisted'>>
  chunks: DocumentPageChunk[]
  query: string
  maxTokens?: number
  usage?: UsageTracker
  warnings?: string[]
}): Promise<RetrievalResult & { semanticUsed: boolean }> {
  const indexIds = params.docs.filter(d => d.persisted && d.indexId).map(d => d.indexId!) as string[]
  let sem: Map<string, number> | undefined
  if (indexIds.length && process.env.OPENAI_API_KEY) {
    try {
      const semPromise = semanticScores(params.tenderId, indexIds, params.query, params.usage)
      const timeoutPromise = new Promise<Map<string, number>>((_, reject) =>
        setTimeout(() => reject(new Error('Semantic search timeout')), 1500)
      )
      sem = await Promise.race([semPromise, timeoutPromise])
    } catch (e: any) {
      params.warnings?.push(`Semantic search note (${e?.message || e}); keyword search used.`)
    }
  }
  const r = retrieveContextForQuery(params.query, params.chunks, params.maxTokens ?? 25000, { semanticScores: sem })
  return { ...r, semanticUsed: !!sem && sem.size > 0 }
}

/**
 * Tender-map pages for a section, as evidence chunks. Built from this tender's OWN
 * document chunks only (corrigenda excluded), so every returned page is real tender text.
 */
export function mapSectionChunks(
  chunks: DocumentPageChunk[],
  sections: SectionKey[],
  docs: Array<Pick<IndexedDocument, 'docName' | 'role'>>,
  limit = 8
): DocumentPageChunk[] {
  const tenderChunks = chunks.filter(c => c.pageNumber && !c.content.startsWith('[EXTRACTION FAILED') && docs.some(d => d.role === 'tender' && d.docName === c.docName))
  if (!tenderChunks.length) return []
  const map = buildTenderMap(tenderChunks.map(c => ({ page: c.pageNumber as number, text: c.content.replace(/\s+/g, ' ').trim() })))
  const wanted = new Set<number>()
  for (const s of sections) map.sections[s].pages.slice(0, limit).forEach(p => wanted.add(p))
  return tenderChunks.filter(c => wanted.has(c.pageNumber as number))
}
