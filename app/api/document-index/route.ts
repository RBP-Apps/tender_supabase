import { NextResponse } from 'next/server'
import { ensureDocumentIndexed, pagesToChunks, DocRole } from '@/lib/document-index-store'
import { UsageTracker } from '@/lib/ai-usage'

export const runtime = 'nodejs'
export const maxDuration = 300

const ROLES: DocRole[] = ['tender', 'corrigendum', 'bidder', 'chat']

/**
 * Index one document for one tender (batched; call again with `indexId` until
 * `done` is true). Body: { tenderId, role, docName, source?, indexId? }
 *   source = base64 data URL or this project's Supabase Storage URL.
 */
export async function POST(request: Request) {
  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }
  const { tenderId, role, docName, source, indexId } = body || {}
  if (!tenderId || typeof tenderId !== 'string') return NextResponse.json({ error: 'tenderId is required.' }, { status: 400 })
  if (!ROLES.includes(role)) return NextResponse.json({ error: `role must be one of ${ROLES.join(', ')}.` }, { status: 400 })
  if (!docName || (!source && !indexId)) return NextResponse.json({ error: 'docName and source (or indexId) are required.' }, { status: 400 })

  const usage = new UsageTracker()
  try {
    const doc = await ensureDocumentIndexed({ tenderId, role, docName, source, indexId, usage, timeBudgetMs: 200000 })
    if (usage.list().length) console.info('[document-index] usage', docName, JSON.stringify(usage.toJSON()))
    if (doc.status === 'failed' && !doc.pages.length) {
      return NextResponse.json({ error: doc.error || 'Indexing failed.', warnings: doc.warnings, usage }, { status: 422 })
    }
    return NextResponse.json({
      indexId: doc.indexId,
      persisted: doc.persisted,
      done: doc.done,
      status: doc.status,
      docName: doc.docName,
      pageCount: doc.pageCount,
      pagesDone: doc.pagesDone,
      unreadablePages: doc.unreadablePages,
      ocrPages: doc.ocrPages,
      visionPages: doc.visionPages,
      warnings: doc.warnings,
      usage,
      // Not saved (migration missing): hand the extracted pages back so the
      // client can still send them with each question (clearly flagged).
      chunks: !doc.persisted && doc.done ? pagesToChunks(doc, doc.pages) : undefined,
    })
  } catch (e: any) {
    console.error('document-index failed:', e)
    return NextResponse.json({ error: `Indexing failed: ${e?.message || e}` }, { status: 500 })
  }
}
