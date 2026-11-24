import { generateText, Output } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { COMPANY } from '@/lib/company'
import { resolveStoredDocBytes } from '@/lib/server-pdf'
import { extractPdfPageTexts, type PageText } from '@/lib/tender-validation-agent'

export const runtime = 'nodejs'
export const maxDuration = 120

/**
 * Builds a bidder-side document (annexure / undertaking / affidavit / declaration / MAF ...)
 * in the tender's OWN prescribed format, pre-filled with known facts, on the RBP letterhead.
 *  - the format is taken from the tender PDF pages (never invented);
 *  - unknown facts stay as blanks (______________) - nothing is fabricated;
 *  - if the tender has no format for the item, formatFound=false and nothing is generated.
 */

const schema = z.object({
  formatFound: z.boolean().describe('true only if the pages contain a prescribed format / proforma / annexure for this document'),
  title: z.string().describe('Title of the format exactly as in the tender (e.g. "Annexure-03 - Format of Affidavit")'),
  sourcePage: z.number().nullable(),
  sourceQuote: z.string().nullable().describe('Short verbatim quote from the page that proves the format exists'),
  blocks: z.array(
    z.object({
      kind: z.enum(['heading', 'paragraph', 'list', 'table', 'signature']),
      text: z.string().nullable().describe('Text for heading / paragraph / list item / signature line'),
      rows: z
        .array(z.object({ cells: z.array(z.string()) }))
        .nullable()
        .describe('Rows for kind=table (first row is the header)'),
    })
  ),
})

const STOP = new Set(['the', 'of', 'and', 'for', 'in', 'to', 'a', 'an', 'copy', 'valid', 'document', 'documents', 'letter', 'certificate', 'with', 'by', 'as', 'per', 'tender', 'bid'])

function pickFormatPages(pages: PageText[], docName: string, clauseRef: string, max = 3): PageText[] {
  const words = docName
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(w => w.length > 2 && !STOP.has(w))
  const annex = (docName + ' ' + clauseRef).match(/annexure[\s-]*0?(\d+)/i)?.[1]
  const refPages = (clauseRef.match(/\d+/g) || []).map(Number)
  const scored = pages
    .map(p => {
      const t = p.text.toLowerCase()
      let score = 0
      for (const w of words) if (t.includes(w)) score += 2
      if (annex && new RegExp(`annexure[\\s\\-–]*0?${annex}\\b`, 'i').test(p.text)) score += 8
      if (/\b(format|proforma|pro-forma|annexure|affidavit|undertaking|declaration)\b/.test(t)) score += 2
      if (/\bi\/we\b|\bhereby\b|\bsignature\b|\bsign\s*&?\s*seal\b|_{4,}|\.{6,}/.test(t)) score += 3
      // table-of-contents style pages list many annexures but carry no format
      if ((t.match(/annexure/g) || []).length > 6) score -= 6
      if (refPages.includes(p.page)) score += 1
      return { p, score }
    })
    .filter(s => s.score >= 6)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map(s => s.p)
  return scored.sort((a, b) => a.page - b.page)
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function letterheadHtml(company: typeof COMPANY, bodyHtml: string): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#111;max-width:100%;overflow:hidden">
<table style="width:100%;border-collapse:collapse;border-bottom:2px solid #111;margin-bottom:12px"><tr>
<td style="width:70px;vertical-align:middle"><img src="${esc(company.logoUrl)}" alt="RBP" style="height:48px"/></td>
<td style="vertical-align:middle"><div style="font-size:18px;font-weight:bold">${esc(company.name)}</div>
<div style="font-size:10px;color:#444">${esc(company.address)}</div></td></tr></table>
${bodyHtml}
<div style="margin-top:28px;background:#fcd497;padding:8px 12px;font-size:10px;color:#222">
Regd. Office: ${esc(company.regdOfficeLine1)}, ${esc(company.regdOfficeLine2)}<br/>
e: ${esc(company.email)} &nbsp;|&nbsp; w: ${esc(company.website)} &nbsp;|&nbsp; Sales: ${esc(company.salesPhone)} &nbsp;|&nbsp; Service: ${esc(company.servicePhone)}</div></div>`
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'OPENAI_API_KEY is not configured.' }, { status: 500 })

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }
  const docName = String(body.docName || '').trim()
  if (!docName) return NextResponse.json({ error: 'docName is required.' }, { status: 400 })
  const clauseRef = String(body.clauseOrPageRef || '')
  const company = { ...COMPANY, ...(body.company || {}) } as typeof COMPANY

  const resolved = await resolveStoredDocBytes(body.pdfDataUrl, body.customDocumentName)
  if (resolved.status !== 'loaded' || !resolved.bytes) {
    return NextResponse.json({ success: true, formatFound: false, reason: 'The tender PDF is not available to read the prescribed format.' })
  }
  const pages = await extractPdfPageTexts(resolved.bytes)
  const candidates = pickFormatPages(pages, docName, clauseRef)
  if (!candidates.length) {
    return NextResponse.json({ success: true, formatFound: false, reason: 'No prescribed format for this item was found in the tender PDF. Upload the actual document instead.' })
  }

  const facts = {
    bidder: {
      name: company.name,
      address: company.address,
      pan: company.pan || null,
      gst: company.gst || null,
      cin: company.cin || null,
      phone: company.phone,
      email: company.email,
      authorisedSignatory: company.signatory,
      designation: company.signatoryDesignation,
      place: company.place,
    },
    tender: {
      number: body.tenderNumber || null,
      title: body.tenderTitle || null,
      authority: body.authority || null,
      workName: body.workName || null,
    },
  }

  const openai = createOpenAI({ apiKey })
  try {
    const { output } = await generateText({
      model: openai(process.env.OPENAI_VALIDATION_MODEL || process.env.OPENAI_MODEL || 'gpt-4o'),
      system:
        'You turn a tender\'s prescribed bidder format into a ready-to-sign document. ' +
        'Reproduce the format\'s own headings, wording, numbering and table structure faithfully from the pages. ' +
        'Fill a blank ONLY with a value present in FACTS (bidder name, address, PAN, GST, tender number, authority, signatory, place). ' +
        'For everything else (turnover, dates, amounts, project details, registration numbers, signatures, seals, stamp-paper details) leave a blank "______________". ' +
        'Never invent numbers, dates or references. Do not include instructions meant only for the authority. ' +
        'If the pages do not actually contain the prescribed format for the requested document, return formatFound=false with empty blocks.',
      output: Output.object({ schema }),
      prompt:
        `REQUESTED DOCUMENT: ${docName}\nCHECKLIST REFERENCE: ${clauseRef || 'n/a'}\n\nFACTS:\n${JSON.stringify(facts, null, 2)}\n\n` +
        candidates.map(p => `=== TENDER PAGE ${p.page} ===\n${p.text.slice(0, 6000)}`).join('\n\n'),
    })

    if (!output.formatFound || !output.blocks.length) {
      return NextResponse.json({ success: true, formatFound: false, reason: 'The tender has no prescribed format for this item. Upload the actual document instead.' })
    }

    const parts: string[] = [`<h2 style="text-align:center;font-size:15px;margin:6px 0 12px;text-decoration:underline">${esc(output.title || docName)}</h2>`]
    for (const b of output.blocks) {
      if (b.kind === 'heading') parts.push(`<p style="font-weight:bold;margin:10px 0 4px">${esc(b.text || '')}</p>`)
      else if (b.kind === 'list' && b.text?.trim()) parts.push(`<p style="margin:3px 0 3px 18px">• ${esc(b.text || '')}</p>`)
      else if (b.kind === 'signature' && b.text?.trim()) parts.push(`<p style="margin:26px 0 2px;text-align:right;white-space:pre-line">${esc(b.text || '')}</p>`)
      else if (b.kind === 'table' && b.rows?.length) {
        const [head, ...rest] = b.rows
        parts.push(
          `<table style="width:100%;max-width:100%;table-layout:fixed;word-break:break-word;border-collapse:collapse;margin:8px 0"><thead><tr>${head.cells
            .map(c => `<th style="border:1px solid #333;padding:4px 6px;background:#f3f3f3;text-align:left">${esc(c)}</th>`)
            .join('')}</tr></thead><tbody>${rest
            .map(r => `<tr>${r.cells.map(c => `<td style="border:1px solid #333;padding:4px 6px">${esc(c)}</td>`).join('')}</tr>`)
            .join('')}</tbody></table>`
        )
      } else if (b.text) parts.push(`<p style="margin:5px 0;text-align:justify;line-height:1.5">${esc(b.text)}</p>`)
    }
    const html = letterheadHtml(company, parts.join('\n'))
    return NextResponse.json({
      success: true,
      formatFound: true,
      title: output.title || docName,
      html,
      sourcePage: output.sourcePage ?? candidates[0].page,
      sourceQuote: output.sourceQuote,
      note: 'Draft in the tender\'s own format. Blanks (______) must be completed and the document signed/sealed before upload.',
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Generation failed.' }, { status: 502 })
  }
}
