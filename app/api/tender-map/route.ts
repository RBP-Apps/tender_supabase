import { NextResponse } from 'next/server'
import { resolveStoredDocBytes } from '@/lib/server-pdf'
import { extractPdfPageTexts } from '@/lib/tender-validation-agent'
import { buildTenderMap } from '@/lib/tender-map'

export const runtime = 'nodejs'
export const maxDuration = 120

/** Returns the tender map (section -> pages, annexure index) for a stored tender PDF. */
export async function POST(request: Request) {
  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }
  const resolved = await resolveStoredDocBytes(body.pdfDataUrl, body.customDocumentName)
  if (resolved.status !== 'loaded' || !resolved.bytes) {
    return NextResponse.json({ error: 'Tender PDF is not available.', status: resolved.status }, { status: 404 })
  }
  const pages = await extractPdfPageTexts(resolved.bytes)
  return NextResponse.json({ success: true, map: buildTenderMap(pages) })
}
