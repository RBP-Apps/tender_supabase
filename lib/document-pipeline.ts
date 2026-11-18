// Server-only module. Page-level PDF extraction used by every AI module.
//
//   1. pdf.js digital text layer (exact characters, physical page numbers)
//   2. Tesseract OCR (English + Hindi) when a page is scanned or its Hindi text
//      layer is garbled (common in GeM PDFs)                      — proposal A
//   3. OpenAI Vision transcription for pages OCR cannot read reliably and for
//      table-heavy pages, cross-checked against the text layer / OCR — proposal B
//
// Nothing is silently dropped: every page carries an extraction method and
// quality flags, and unreadable pages are marked with EXTRACTION_FAILED_MARKER.

import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import {
  EXTRACTION_FAILED_MARKER,
  cleanExtractedText,
  detectSectionTitle,
  reconstructPageLines,
} from '@/lib/universal-document-parser'
import { loadPdfjsNative } from '@/lib/server-pdf'
import { UsageTracker } from '@/lib/ai-usage'

export type ExtractionMethod = 'text' | 'ocr' | 'vision' | 'text+ocr' | 'text+vision' | 'ocr+vision' | 'failed'

export interface PageRecord {
  pageNumber: number
  totalPages: number
  content: string
  sectionTitle?: string
  clauseRef?: string
  method: ExtractionMethod
  ocrConfidence?: number
  isScanned: boolean
  hasTables: boolean
  /** e.g. 'garbled-hindi-text-layer', 'low-ocr-confidence', 'vision-mismatch', 'vision-only-unconfirmed', 'vision-limit-reached' */
  qualityFlags: string[]
}

export interface ExtractOptions {
  docName: string
  fromPage?: number
  toPage?: number
  /** Stop starting new pages after this many ms (batched ingestion) */
  timeBudgetMs?: number
  enableOcr?: boolean
  enableVision?: boolean
  /** Vision calls allowed in this run (cost cap) */
  maxVisionPages?: number
  usage?: UsageTracker
  apiKey?: string
}

export interface ExtractResult {
  totalPages: number
  pages: PageRecord[]
  /** first page NOT processed yet, or null when the document is complete */
  nextPage: number | null
  warnings: string[]
}

// Section headers inside page content (the verifier treats them all as evidence)
export const SECTION_VISION = '[VISION TRANSCRIPTION OF PAGE IMAGE]'
export const SECTION_OCR = '[OCR TEXT (English + Hindi)]'
export const SECTION_DIGITAL = '[DIGITAL TEXT LAYER]'

const OCR_CONFIDENCE_OK = 75
const VISION_NUMBER_AGREEMENT = 0.8

// ── Hindi text-layer quality ───────────────────────────────────────────────────

/**
 * GeM and many state-portal PDFs embed Devanagari with broken font maps: the
 * text layer comes out as "बडबड ववरणववरण", "सं7या", "द'तावेज़". Detect it so
 * the page is OCR'd instead of trusting the corrupted characters.
 */
export function isGarbledDevanagari(text: string): boolean {
  const tokens = text.split(/\s+/).filter(t => /[ऀ-ॿ]/.test(t))
  if (tokens.length < 5) return false
  let bad = 0
  for (const t of tokens) {
    const core = t.replace(/^[\/(\["']+|[\/)\]"'.,:;|]+$/g, '')
    const half = core.length / 2
    const doubled = core.length >= 4 && Number.isInteger(half) && core.slice(0, half) === core.slice(half)
    const mixed = /[ऀ-ॿ][0-9A-Za-z'%!\[\]{}]|[0-9A-Za-z'%!\[\]{}][ऀ-ॿ]/.test(core)
    if (doubled || mixed) bad++
  }
  return bad / tokens.length >= 0.2
}

// ── OCR worker (one per server process, English + Hindi) ───────────────────────

let ocrWorkerPromise: Promise<any> | null = null
let ocrQueue: Promise<unknown> = Promise.resolve()

async function getOcrWorker(): Promise<any> {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = (async () => {
      const req = createRequire(path.join(process.cwd(), 'package.json'))
      const T = req('tesseract.js')
      // Language data (eng, hin) is downloaded once from the tesseract.js CDN and cached here.
      return T.createWorker(['eng', 'hin'], 1, { cachePath: path.join(os.tmpdir(), 'tender-fms-tesseract') })
    })().catch(e => {
      ocrWorkerPromise = null
      throw e
    })
  }
  return ocrWorkerPromise
}

async function ocrImage(png: Buffer): Promise<{ text: string; confidence: number }> {
  const worker = await getOcrWorker()
  // tesseract workers process one job at a time; serialise across requests
  const job = ocrQueue.then(() => worker.recognize(png))
  ocrQueue = job.catch(() => undefined)
  const res: any = await Promise.race([
    job,
    new Promise((_, rej) => setTimeout(() => rej(new Error('OCR timeout (90s)')), 90000)),
  ])
  return { text: cleanExtractedText(res?.data?.text || ''), confidence: res?.data?.confidence ?? 0 }
}

// ── Rendering ──────────────────────────────────────────────────────────────────

async function renderPage(pdfDoc: any, page: any, scale: number): Promise<Buffer> {
  const viewport = page.getViewport({ scale })
  const factory = pdfDoc.canvasFactory
  if (!factory) throw new Error('No canvas available for page rendering')
  const { canvas, context } = factory.create(Math.ceil(viewport.width), Math.ceil(viewport.height))
  await page.render({ canvasContext: context, viewport }).promise
  const png: Buffer = canvas.toBuffer('image/png')
  factory.destroy?.({ canvas, context })
  return png
}

// ── Vision ────────────────────────────────────────────────────────────────────

const VISION_PROMPT = `Transcribe this tender document page EXACTLY as printed.
Rules:
- Copy every word, number, date, amount, clause number and heading character-for-character, in the original language (English and/or Hindi in Devanagari).
- Reproduce tables as Markdown tables, one row per printed row, keeping every column. If a table continues from/to another page, transcribe only what is visible.
- Write [illegible] for anything you cannot read. Never guess, complete, correct or summarise.
- Output only the transcription.`

async function visionTranscribe(png: Buffer, apiKey: string, usage?: UsageTracker): Promise<string> {
  const model = process.env.OPENAI_MODEL || 'gpt-4o'
  const openai = createOpenAI({ apiKey })
  const res = await generateText({
    model: openai(model),
    temperature: 0,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: VISION_PROMPT },
          { type: 'file', data: new Uint8Array(png), mediaType: 'image/png' },
        ],
      },
    ],
  })
  usage?.add('vision', model, res.usage as any)
  return (res.text || '')
    .trim()
    .replace(/^```[a-z]*\s*\n?/i, '')
    .replace(/\n?```\s*$/, '')
    .trim()
}

/** Numbers (≥2 digits, separators removed) used to cross-check two transcriptions. */
function numberSet(text: string): Set<string> {
  const out = new Set<string>()
  for (const m of text.replace(/(\d),(?=\d)/g, '$1').match(/\d+(?:\.\d+)?/g) || []) {
    const n = m.replace(/\.0+$/, '')
    if (n.replace('.', '').length >= 2) out.add(n)
  }
  return out
}

/** Fraction of `subset`'s numbers that also appear in `superset`. */
function coverage(subset: string, superset: string): number {
  const c = numberSet(subset)
  if (c.size === 0) return 1
  const r = numberSet(superset)
  let hit = 0
  for (const n of c) if (r.has(n)) hit++
  return hit / c.size
}

/**
 * Ruled-table detection on a rendered page image: counts horizontal rules
 * (rows where a long run of dark pixels spans ≥35% of the width). Tesseract
 * drops bordered table rows while still reporting high confidence, so scanned
 * pages with ≥3 rules are sent to Vision.
 */
async function detectRuledTable(pdfDoc: any, page: any): Promise<boolean> {
  const viewport = page.getViewport({ scale: 1.5 })
  const factory = pdfDoc.canvasFactory
  const w = Math.ceil(viewport.width)
  const h = Math.ceil(viewport.height)
  const { canvas, context } = factory.create(w, h)
  await page.render({ canvasContext: context, viewport }).promise
  const data: Uint8ClampedArray = context.getImageData(0, 0, w, h).data
  factory.destroy?.({ canvas, context })
  let rules = 0
  let lastRuleY = -10
  for (let y = 0; y < h; y++) {
    let run = 0
    let best = 0
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
      if (lum < 170) {
        run++
        if (run > best) best = run
      } else run = 0
    }
    if (best >= w * 0.35) {
      if (y - lastRuleY > 4) rules++
      lastRuleY = y
    }
  }
  return rules >= 3
}

function tableHeavy(lines: string[]): boolean {
  return lines.filter(l => (l.match(/ \| /g) || []).length >= 2).length >= 6
}

/**
 * Single image file (JPG/PNG scan of a certificate etc.): OCR + Vision,
 * cross-checked like a scanned PDF page.
 */
export async function extractImagePage(
  bytes: Uint8Array,
  opts: { usage?: UsageTracker; enableVision?: boolean; apiKey?: string }
): Promise<ExtractResult> {
  const warnings: string[] = []
  const flags: string[] = []
  const apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY
  const buf = Buffer.from(bytes)
  let ocr: { text: string; confidence: number } | null = null
  try {
    ocr = await ocrImage(buf)
    if (ocr.confidence < OCR_CONFIDENCE_OK) flags.push('low-ocr-confidence')
  } catch (e: any) {
    flags.push('ocr-failed')
    warnings.push(`OCR failed: ${e?.message || e}`)
  }
  let vision: string | null = null
  if (opts.enableVision !== false && apiKey) {
    try {
      vision = await visionTranscribe(buf, apiKey, opts.usage)
    } catch (e: any) {
      flags.push('vision-failed')
      warnings.push(`Vision transcription failed: ${e?.message || e}`)
    }
  }
  const ocrGood = !!ocr && ocr.text.replace(/\s/g, '').length > 40 && ocr.confidence >= OCR_CONFIDENCE_OK
  if (vision) {
    if (ocr && ocr.text.replace(/\s/g, '').length > 40) {
      if (coverage(ocr.text, vision) < VISION_NUMBER_AGREEMENT) flags.push('vision-mismatch')
      else if (coverage(vision, ocr.text) < 1) flags.push('vision-extra-content-unconfirmed')
    } else flags.push('vision-only-unconfirmed')
  }
  const usableVision = !!vision && !flags.includes('vision-mismatch')
  const parts: string[] = []
  if (usableVision) parts.push(`${SECTION_VISION}\n${vision}`)
  if (ocr?.text) parts.push(`${SECTION_OCR} (confidence ${Math.round(ocr.confidence)}/100)\n${ocr.text}`)
  if (vision && !usableVision) parts.push(`${SECTION_VISION} — NUMBERS DISAGREE WITH THE OCR ABOVE; treat as unreliable\n${vision}`)
  const method: ExtractionMethod = ocrGood && usableVision ? 'ocr+vision' : usableVision ? 'vision' : ocrGood ? 'ocr' : 'failed'
  const content =
    method === 'failed'
      ? `${EXTRACTION_FAILED_MARKER}: Image could not be read (${flags.join(', ') || 'no readable text'})]` + (parts.length ? `\n${parts.join('\n\n')}` : '')
      : parts.join('\n\n')
  return {
    totalPages: 1,
    nextPage: null,
    warnings,
    pages: [
      {
        pageNumber: 1,
        totalPages: 1,
        content,
        sectionTitle: 'Image',
        method,
        ocrConfidence: ocr ? Math.round(ocr.confidence) : undefined,
        isScanned: true,
        hasTables: false,
        qualityFlags: flags,
      },
    ],
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function extractPdfPages(bytes: Uint8Array, opts: ExtractOptions): Promise<ExtractResult> {
  const pdfjs = await loadPdfjsNative()
  const pdfDoc = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, useSystemFonts: true }).promise
  const totalPages: number = pdfDoc.numPages
  const from = Math.max(1, opts.fromPage || 1)
  const to = Math.min(totalPages, opts.toPage || totalPages)
  const started = Date.now()
  const enableOcr = opts.enableOcr !== false
  const apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY
  const enableVision = opts.enableVision !== false && !!apiKey
  let visionLeft = opts.maxVisionPages ?? 40
  const warnings: string[] = []
  const pages: PageRecord[] = []
  let nextPage: number | null = null
  let ocrUnavailable = false

  if (opts.enableVision !== false && !apiKey) warnings.push('OpenAI Vision unavailable (no API key): unreadable pages cannot be transcribed.')

  for (let n = from; n <= to; n++) {
    if (opts.timeBudgetMs && n > from && Date.now() - started > opts.timeBudgetMs) {
      nextPage = n
      break
    }
    const flags: string[] = []
    try {
      const page = await pdfDoc.getPage(n)
      const lines = reconstructPageLines(await page.getTextContent())
      const digital = cleanExtractedText(lines.join('\n'))
      const textChars = digital.replace(/\s/g, '').length

      // If page has sufficient digital text (>= 60 chars), use digital text directly (instant & complete)
      const isScanned = textChars < 60
      let hasTables = tableHeavy(lines)

      // 2. OCR (only for genuinely scanned pages with little or no digital text)
      let ocr: { text: string; confidence: number } | null = null
      let png: Buffer | null = null
      if (isScanned && enableOcr && !ocrUnavailable) {
        try {
          png = await renderPage(pdfDoc, page, 2)
          ocr = await ocrImage(png)
          if (ocr.confidence < OCR_CONFIDENCE_OK) flags.push('low-ocr-confidence')
        } catch (e: any) {
          flags.push('ocr-failed')
          if (/canvas|tesseract|network|fetch|ENOTFOUND/i.test(String(e?.message))) {
            ocrUnavailable = true
            warnings.push(`OCR unavailable: ${e?.message || e}. Scanned pages will rely on OpenAI Vision.`)
          }
        }
      }
      const ocrGood = !!ocr && ocr.text.replace(/\s/g, '').length > 40 && ocr.confidence >= OCR_CONFIDENCE_OK

      // 3. Vision: used ONLY for genuinely scanned pages where OCR could not read reliably.
      // (Digital pages already have accurate digital text layers and do not need expensive/slow Vision calls)
      const wantVision = isScanned && !ocrGood
      let vision: string | null = null
      if (wantVision && enableVision) {
        if (visionLeft <= 0) {
          flags.push('vision-limit-reached')
        } else {
          try {
            const vpng = await renderPage(pdfDoc, page, 1.5)
            vision = await visionTranscribe(vpng, apiKey!, opts.usage)
            visionLeft--
            if (!vision || /^\s*\[illegible\]\s*$/i.test(vision)) {
              flags.push('vision-illegible')
              vision = null
            }
          } catch (e: any) {
            flags.push('vision-failed')
            warnings.push(`Vision transcription failed on page ${n}: ${e?.message || e}`)
          }
        }
      }

      // Cross-check Vision against an independent reading of the same page.
      //  - digital page: the text layer has every character, so Vision must not
      //    introduce any number that is not in it (would be a hallucination).
      //  - scanned page: Vision must contain what OCR read; extra Vision content
      //    (rows OCR dropped) is kept but marked unconfirmed.
      if (vision) {
        const digitalReliable = textChars > 40 && !isScanned
        if (digitalReliable) {
          if (coverage(vision, digital) < VISION_NUMBER_AGREEMENT) flags.push('vision-mismatch')
        } else if (ocr && ocr.text.replace(/\s/g, '').length > 40) {
          if (coverage(ocr.text, vision) < VISION_NUMBER_AGREEMENT) flags.push('vision-mismatch')
          else if (coverage(vision, ocr.text) < 1) flags.push('vision-extra-content-unconfirmed')
        } else {
          flags.push('vision-only-unconfirmed')
        }
      }

      // 4. Assemble content (all independent readings are kept, labelled)
      const parts: string[] = []
      let method: ExtractionMethod
      if (vision && !flags.includes('vision-mismatch')) parts.push(`${SECTION_VISION}\n${vision}`)
      if (ocr && ocr.text.replace(/\s/g, '').length > 0) parts.push(`${SECTION_OCR} (confidence ${Math.round(ocr.confidence)}/100)\n${ocr.text}`)
      if (textChars > 0) parts.push(`${SECTION_DIGITAL}\n${digital}`)
      if (vision && flags.includes('vision-mismatch')) {
        parts.push(`${SECTION_VISION} — NUMBERS DISAGREE WITH THE TEXT/OCR ABOVE; treat as unreliable\n${vision}`)
      }

      const usableVision = !!vision && !flags.includes('vision-mismatch')
      if (!isScanned) method = usableVision ? 'text+vision' : 'text'
      else if (ocrGood && usableVision) method = 'ocr+vision'
      else if (usableVision) method = 'vision'
      else if (ocrGood) method = 'ocr'
      else method = 'failed'

      let content: string
      if (method === 'failed') {
        const why = flags.join(', ') || (enableOcr ? 'no readable text' : 'OCR disabled')
        content = `${EXTRACTION_FAILED_MARKER}: Page ${n} is scanned/image-only and could not be read (${why})]` + (parts.length ? `\n${parts.join('\n\n')}` : '')
      } else {
        content = parts.join('\n\n')
      }

      const clause = content.match(/\b(?:Clause|Section|Article|Para|Clause No\.)\s*([0-9]+(?:\.[0-9]+)*[A-Za-z]?)/i)
      pages.push({
        pageNumber: n,
        totalPages,
        content,
        sectionTitle: detectSectionTitle(lines.length ? lines : (ocr?.text || vision || '').split('\n')) || `Page ${n}`,
        clauseRef: clause?.[0],
        method,
        ocrConfidence: ocr ? Math.round(ocr.confidence) : undefined,
        isScanned,
        hasTables,
        qualityFlags: flags,
      })
    } catch (e: any) {
      pages.push({
        pageNumber: n,
        totalPages,
        content: `${EXTRACTION_FAILED_MARKER}: Page ${n} could not be parsed (${e?.message || 'error'})]`,
        method: 'failed',
        isScanned: false,
        hasTables: false,
        qualityFlags: ['parse-error'],
      })
    }
  }

  try {
    await pdfDoc.destroy()
  } catch {}
  return { totalPages, pages, nextPage, warnings }
}
