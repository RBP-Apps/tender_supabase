// Server-only module. Persistent, tender-scoped page index (proposals C + D).
//
// ensureDocumentIndexed() is the single entry point used by Chat, Eligibility
// and Sample Details: it extracts a document once (pdf.js → OCR → Vision),
// embeds every page, stores it in Supabase, and returns the pages. Repeated
// calls for the same tender + file reuse the stored pages. Long documents are
// processed in time-boxed batches and resumed on the next call.

import crypto from 'node:crypto'
import { embed, embedMany } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { supabase } from '@/lib/supabaseClient'
import { looksLikePdf, resolveStoredDocBytes } from '@/lib/server-pdf'
import { extractImagePage, extractPdfPages, ExtractResult, PageRecord } from '@/lib/document-pipeline'
import { UsageTracker } from '@/lib/ai-usage'
import { BUCKET_NAME } from '@/lib/supabase-storage'
import { DocumentPageChunk } from '@/types/document-understanding'

export const EMBEDDING_MODEL = 'text-embedding-3-small'
const MAX_EMBED_CHARS = 24000 // ≈6k tokens, under the 8k model limit
const DEFAULT_MAX_VISION_PAGES_PER_DOC = 60

export type DocRole = 'tender' | 'corrigendum' | 'bidder' | 'chat'

export interface IndexedDocument {
  indexId: string | null
  tenderId: string
  role: DocRole
  docName: string
  docHash: string
  sourceUrl?: string | null
  pageCount: number
  pagesDone: number
  status: 'processing' | 'ready' | 'partial' | 'failed'
  persisted: boolean
  done: boolean
  pages: PageRecord[]
  unreadablePages: number[]
  ocrPages: number[]
  visionPages: number[]
  warnings: string[]
  error?: string
}

export interface EnsureParams {
  tenderId: string
  role: DocRole
  docName: string
  /** base64 data URL or Supabase Storage URL */
  source?: string | null
  bytes?: Uint8Array
  mimeType?: string
  /** existing index row to resume (chat batching) */
  indexId?: string
  timeBudgetMs?: number
  usage?: UsageTracker
  maxVisionPages?: number
}

// ── helpers ─────────────────────────────────────────────────────────────────

function isMissingTable(err: any): boolean {
  const msg = `${err?.code || ''} ${err?.message || ''}`
  return /42P01|PGRST205|PGRST202|does not exist|Could not find the (table|function)/i.test(msg)
}

const MIGRATION_HINT =
  'Document index tables are missing – run supabase/migration_document_pages_rag.sql in the Supabase SQL editor. The document was processed for this request only and NOT saved.'

function failed(params: EnsureParams, error: string, docHash = ''): IndexedDocument {
  return {
    indexId: null,
    tenderId: params.tenderId,
    role: params.role,
    docName: params.docName,
    docHash,
    pageCount: 0,
    pagesDone: 0,
    status: 'failed',
    persisted: false,
    done: true,
    pages: [],
    unreadablePages: [],
    ocrPages: [],
    visionPages: [],
    warnings: [error],
    error,
  }
}

function summarise(pages: PageRecord[]) {
  return {
    unreadable: pages.filter(p => p.method === 'failed').map(p => p.pageNumber),
    ocr: pages.filter(p => p.method.includes('ocr')).map(p => p.pageNumber),
    vision: pages.filter(p => p.method.includes('vision') || p.qualityFlags.some(f => f.startsWith('vision'))).map(p => p.pageNumber),
  }
}

const uniqSorted = (a: number[]) => Array.from(new Set(a)).sort((x, y) => x - y)

export async function embedTexts(texts: string[], usage?: UsageTracker): Promise<number[][]> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured')
  const openai = createOpenAI({ apiKey })
  const out: number[][] = []
  for (let i = 0; i < texts.length; i += 64) {
    const batch = texts.slice(i, i + 64).map(t => t.slice(0, MAX_EMBED_CHARS) || ' ')
    const res = await embedMany({ model: openai.embedding(EMBEDDING_MODEL), values: batch })
    usage?.add('embedding', EMBEDDING_MODEL, res.usage as any)
    out.push(...res.embeddings)
  }
  return out
}

function rowToPage(r: any): PageRecord {
  return {
    pageNumber: r.page_number,
    totalPages: r.total_pages,
    content: r.content,
    sectionTitle: r.section_title || undefined,
    clauseRef: r.clause_ref || undefined,
    method: r.extraction_method,
    ocrConfidence: r.ocr_confidence ?? undefined,
    isScanned: !!r.is_scanned,
    hasTables: !!r.has_tables,
    qualityFlags: r.quality_flags || [],
  }
}

export async function loadIndexedPages(indexId: string): Promise<PageRecord[]> {
  const pages: PageRecord[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('document_pages')
      .select('page_number,total_pages,content,section_title,clause_ref,extraction_method,ocr_confidence,is_scanned,has_tables,quality_flags')
      .eq('index_id', indexId)
      .order('page_number', { ascending: true })
      .range(from, from + 999)
    if (error) throw error
    pages.push(...(data || []).map(rowToPage))
    if (!data || data.length < 1000) break
  }
  return pages
}

async function uploadSource(tenderId: string, docHash: string, docName: string, bytes: Uint8Array, mime: string): Promise<string | null> {
  const safe = docName.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80)
  const path = `document-index/${tenderId.replace(/[^a-zA-Z0-9._-]+/g, '_')}/${docHash.slice(0, 16)}_${safe}`
  const { error } = await supabase.storage.from(BUCKET_NAME).upload(path, Buffer.from(bytes), { contentType: mime, upsert: true })
  if (error) return null
  return supabase.storage.from(BUCKET_NAME).getPublicUrl(path).data.publicUrl || null
}

// ── main entry ──────────────────────────────────────────────────────────────

// In-memory document index cache (persists across requests in node process)
const inMemoryDocIndex = new Map<string, IndexedDocument>()

export async function ensureDocumentIndexed(params: EnsureParams): Promise<IndexedDocument> {
  const usage = params.usage
  const timeBudgetMs = params.timeBudgetMs ?? 200000
  const warnings: string[] = []

  // Fast check: resolve bytes or check cache by docName/source
  let bytes = params.bytes
  let mime = params.mimeType
  if (!bytes) {
    const res = await resolveStoredDocBytes(params.source)
    if (res.status === 'loaded' && res.bytes) {
      bytes = res.bytes
      mime = mime || res.mimeType
    }
  }

  let docHash = bytes ? crypto.createHash('sha256').update(bytes).digest('hex') : ''
  const memKey = `${params.tenderId}:${params.role}:${docHash || params.docName}`
  const cachedMem = inMemoryDocIndex.get(memKey)
  if (cachedMem && cachedMem.done && cachedMem.pages.length > 0) {
    return cachedMem
  }

  // 0. Resume by indexId: fetch the stored row and source
  let row: any = null
  let dbAvailable = true
  let source = params.source
  if (params.indexId) {
    const { data, error } = await supabase.from('document_index').select('*').eq('id', params.indexId).maybeSingle()
    if (error) {
      if (isMissingTable(error)) dbAvailable = false
      else return failed(params, `Could not load document index: ${error.message}`)
    } else if (data) {
      if (data.tender_id !== params.tenderId) return failed(params, 'Document index belongs to a different tender.')
      row = data
      source = source || data.source_url
    }
  }

  // 1. Bytes
  if (!bytes) {
    const res = await resolveStoredDocBytes(source)
    if (res.status !== 'loaded' || !res.bytes) {
      return failed(params, `Document "${params.docName}" could not be loaded (${res.status}${res.error ? `: ${res.error}` : ''}).`)
    }
    bytes = res.bytes
    mime = mime || res.mimeType
  }
  const isPdf = looksLikePdf(bytes, mime, params.docName)
  const isImage = !isPdf && (/^image\//.test(mime || '') || /\.(png|jpe?g|webp)$/i.test(params.docName))
  if (!isPdf && !isImage) {
    return failed(params, `"${params.docName}" is not a PDF or image (${mime || 'unknown type'}); it cannot be indexed.`)
  }
  if (!docHash) {
    docHash = crypto.createHash('sha256').update(bytes).digest('hex')
  }

  // 2. Existing index row for this tender + role + file
  if (!row && dbAvailable) {
    const { data, error } = await supabase
      .from('document_index')
      .select('*')
      .eq('tender_id', params.tenderId)
      .eq('doc_role', params.role)
      .eq('doc_hash', docHash)
      .maybeSingle()
    if (error) {
      if (isMissingTable(error)) dbAvailable = false
      else warnings.push(`Document index lookup failed: ${error.message}`)
    } else row = data
  }
  if (!dbAvailable) warnings.push(MIGRATION_HINT)

  if (row && row.status !== 'processing' && row.page_count && row.pages_done >= row.page_count) {
    try {
      const pages = await loadIndexedPages(row.id)
      const loaded: IndexedDocument = {
        indexId: row.id,
        tenderId: params.tenderId,
        role: params.role,
        docName: row.doc_name,
        docHash,
        sourceUrl: row.source_url,
        pageCount: row.page_count,
        pagesDone: row.pages_done,
        status: row.status,
        persisted: true,
        done: true,
        pages,
        unreadablePages: row.unreadable_pages || [],
        ocrPages: row.ocr_pages || [],
        visionPages: row.vision_pages || [],
        warnings: [...(row.warnings || []), ...warnings],
      }
      inMemoryDocIndex.set(memKey, loaded)
      return loaded
    } catch (e: any) {
      warnings.push(`Stored pages could not be loaded (${e?.message}); re-extracting.`)
    }
  }

  // 3. Create the index row
  if (!row && dbAvailable) {
    let sourceUrl: string | null = typeof source === 'string' && /^https?:\/\//.test(source) ? source : null
    if (!sourceUrl) sourceUrl = await uploadSource(params.tenderId, docHash, params.docName, bytes, mime || (isPdf ? 'application/pdf' : 'image/png'))
    const { data, error } = await supabase
      .from('document_index')
      .upsert(
        {
          tender_id: params.tenderId,
          doc_role: params.role,
          doc_name: params.docName,
          doc_hash: docHash,
          source_url: sourceUrl,
          status: 'processing',
          pages_done: 0,
        },
        { onConflict: 'tender_id,doc_role,doc_hash' }
      )
      .select('*')
      .single()
    if (error) {
      if (isMissingTable(error)) {
        dbAvailable = false
        warnings.push(MIGRATION_HINT)
      } else warnings.push(`Document index row could not be created: ${error.message}`)
    } else row = data
  }
  const persisted = dbAvailable && !!row

  // 4. Extract the next batch (or everything when not persisted)
  const fromPage = (row?.pages_done || 0) + 1
  const visionUsed = (row?.vision_pages || []).length
  let extractError: string | null = null
  const extract: ExtractResult = isPdf
    ? await extractPdfPages(bytes, {
        docName: params.docName,
        fromPage,
        timeBudgetMs: persisted ? timeBudgetMs : Math.max(timeBudgetMs, 280000),
        maxVisionPages: Math.max(0, (params.maxVisionPages ?? DEFAULT_MAX_VISION_PAGES_PER_DOC) - visionUsed),
        usage,
      }).catch((e: any): ExtractResult => {
        extractError = e?.message || String(e)
        return { totalPages: 0, pages: [], nextPage: null, warnings: [] }
      })
    : await extractImagePage(bytes, { usage }).catch((e: any): ExtractResult => {
        extractError = e?.message || String(e)
        return { totalPages: 0, pages: [], nextPage: null, warnings: [] }
      })
  if (extractError) {
    const msg = `Extraction failed for "${params.docName}": ${extractError}`
    if (row?.id) await supabase.from('document_index').update({ status: 'failed', error: msg, updated_at: new Date().toISOString() }).eq('id', row.id)
    return failed(params, msg, docHash)
  }
  warnings.push(...extract.warnings)
  if (extract.pages.some(p => p.qualityFlags.includes('vision-limit-reached'))) {
    warnings.push('Vision page limit for this document was reached; some table/scanned pages rely on OCR or text only.')
  }

  // 5. Embeddings (failure is reported, BM25 still works)
  let embeddings: (number[] | null)[] = extract.pages.map(() => null)
  // Embed every page that carries real text (fully unreadable pages have none)
  const hasText = (p: PageRecord) => p.method !== 'failed' || /\[(DIGITAL TEXT LAYER|OCR TEXT|VISION TRANSCRIPTION)/.test(p.content)
  const embedIdx = extract.pages.map((p, i) => (hasText(p) ? i : -1)).filter(i => i >= 0)
  if (embedIdx.length && process.env.OPENAI_API_KEY) {
    try {
      const embedPromise = embedTexts(embedIdx.map(i => extract.pages[i].content), usage)
      const timeoutPromise = new Promise<number[][]>((_, reject) =>
        setTimeout(() => reject(new Error('Embedding timeout')), 2500)
      )
      const vecs = await Promise.race([embedPromise, timeoutPromise])
      embedIdx.forEach((pi, k) => (embeddings[pi] = vecs[k]))
    } catch (e: any) {
      warnings.push(`Embeddings note (${e?.message || e}); keyword search used.`)
    }
  }

  // 6. Persist
  const s = summarise(extract.pages)
  let allPages = extract.pages
  let status: IndexedDocument['status'] = extract.nextPage ? 'processing' : s.unreadable.length ? 'partial' : 'ready'
  if (persisted) {
    for (let i = 0; i < extract.pages.length; i += 50) {
      const batch = extract.pages.slice(i, i + 50).map((p, k) => ({
        index_id: row.id,
        tender_id: params.tenderId,
        doc_hash: docHash,
        doc_name: params.docName,
        page_number: p.pageNumber,
        total_pages: p.totalPages,
        content: p.content,
        section_title: p.sectionTitle || null,
        clause_ref: p.clauseRef || null,
        extraction_method: p.method,
        ocr_confidence: p.ocrConfidence ?? null,
        is_scanned: p.isScanned,
        has_tables: p.hasTables,
        quality_flags: p.qualityFlags,
        embedding: embeddings[i + k],
      }))
      const { error } = await supabase.from('document_pages').upsert(batch, { onConflict: 'index_id,page_number' })
      if (error) {
        warnings.push(`Saving pages failed: ${error.message}`)
        status = 'failed'
        break
      }
    }
    const pagesDone = extract.nextPage ? extract.nextPage - 1 : extract.totalPages
    const unreadable = uniqSorted([...(row.unreadable_pages || []), ...s.unreadable])
    if (!extract.nextPage && status !== 'failed') status = unreadable.length ? 'partial' : 'ready'
    const { error: upErr } = await supabase
      .from('document_index')
      .update({
        page_count: extract.totalPages,
        pages_done: status === 'failed' ? row.pages_done : pagesDone,
        status,
        unreadable_pages: unreadable,
        ocr_pages: uniqSorted([...(row.ocr_pages || []), ...s.ocr]),
        vision_pages: uniqSorted([...(row.vision_pages || []), ...s.vision]),
        warnings: Array.from(new Set([...(row.warnings || []), ...warnings])).slice(-30),
        embedding_model: EMBEDDING_MODEL,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)
    if (upErr) warnings.push(`Index status update failed: ${upErr.message}`)
    if (fromPage > 1) {
      try {
        allPages = await loadIndexedPages(row.id)
      } catch {}
    }
    row.unreadable_pages = unreadable
    row.ocr_pages = uniqSorted([...(row.ocr_pages || []), ...s.ocr])
    row.vision_pages = uniqSorted([...(row.vision_pages || []), ...s.vision])
    row.pages_done = pagesDone
  }

  const result: IndexedDocument = {
    indexId: persisted ? row.id : null,
    tenderId: params.tenderId,
    role: params.role,
    docName: params.docName,
    docHash,
    sourceUrl: row?.source_url,
    pageCount: extract.totalPages,
    pagesDone: persisted ? row.pages_done : extract.pages.length,
    status,
    persisted,
    done: !extract.nextPage,
    pages: allPages,
    unreadablePages: persisted ? row.unreadable_pages : s.unreadable,
    ocrPages: persisted ? row.ocr_pages : s.ocr,
    visionPages: persisted ? row.vision_pages : s.vision,
    warnings,
  }

  if (result.done && result.pages.length > 0) {
    inMemoryDocIndex.set(memKey, result)
  }

  return result
}

/** Index rows of a tender for the given roles (only completed ones). */
export async function findTenderIndexes(tenderId: string, roles: DocRole[]): Promise<any[]> {
  const { data, error } = await supabase
    .from('document_index')
    .select('id,tender_id,doc_role,doc_name,doc_hash,source_url,page_count,pages_done,status,unreadable_pages,metadata,updated_at')
    .eq('tender_id', tenderId)
    .in('doc_role', roles)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function getIndexMetadata(indexId: string): Promise<Record<string, any>> {
  const { data } = await supabase.from('document_index').select('metadata').eq('id', indexId).maybeSingle()
  return (data?.metadata as any) || {}
}

export async function setIndexMetadata(indexId: string, key: string, value: any): Promise<void> {
  const meta = await getIndexMetadata(indexId)
  meta[key] = value
  await supabase.from('document_index').update({ metadata: meta, updated_at: new Date().toISOString() }).eq('id', indexId)
}

/** Convert stored pages to retrieval chunks; ids are "<indexId|hash>:p<page>". */
export function pagesToChunks(doc: Pick<IndexedDocument, 'indexId' | 'docHash' | 'docName'>, pages: PageRecord[]): DocumentPageChunk[] {
  const key = doc.indexId || doc.docHash.slice(0, 16)
  return pages.map(p => ({
    id: `${key}:p${p.pageNumber}`,
    docName: doc.docName,
    docType: 'pdf',
    pageNumber: p.pageNumber,
    totalPages: p.totalPages,
    sectionTitle: p.sectionTitle,
    clauseOrRef: p.clauseRef,
    content: p.content,
    charCount: p.content.length,
    isScanned: p.isScanned,
    hasTables: p.hasTables,
    ocrConfidence: p.ocrConfidence,
    extractionMethod: p.method,
    qualityFlags: p.qualityFlags,
  }))
}

/**
 * Semantic similarity of the query to pages of the given (same-tender) indexes.
 * Returns chunk-id → cosine similarity.
 */
export async function semanticScores(
  tenderId: string,
  indexIds: string[],
  query: string,
  usage?: UsageTracker,
  matchCount = 30
): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (!indexIds.length || !query.trim()) return out
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured')
  const openai = createOpenAI({ apiKey })
  const { embedding, usage: u } = await embed({ model: openai.embedding(EMBEDDING_MODEL), value: query.slice(0, 4000) })
  usage?.add('embedding', EMBEDDING_MODEL, u as any)
  const { data, error } = await supabase.rpc('match_document_pages', {
    p_tender_id: tenderId,
    p_index_ids: indexIds,
    p_query_embedding: embedding,
    p_match_count: matchCount,
  })
  if (error) throw error
  for (const r of data || []) out.set(`${r.index_id}:p${r.page_number}`, r.similarity)
  return out
}
