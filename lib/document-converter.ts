'use client'

/**
 * Converts an ORIGINAL ATTACHED FILE (PDF, scanned PDF, image, DOCX, text)
 * into editable HTML for the Word / Editable Document editor.
 *
 * Every result is built only from the uploaded file itself:
 *  - Digital PDFs: the pdf.js text layer (positions, font sizes, bold/italic),
 *    vector ruling lines (tables, underlines, rules), cell shading and
 *    embedded images (logos, stamps, signatures) cropped from the rendered page.
 *  - Scanned PDF pages and images: Tesseract OCR, plus raster line detection
 *    for tables and ink-region detection for stamps / signatures / logos.
 *  - DOCX: mammoth.
 *
 * No template or placeholder content is ever produced. When nothing readable
 * can be extracted a DocumentConversionError is thrown instead.
 */

export type ConversionMethod = 'pdf-text' | 'pdf-ocr' | 'pdf-mixed' | 'image-ocr' | 'docx' | 'text'
export type OcrLanguage = 'eng' | 'eng+hin'

export interface ConversionProgress {
  message: string
  current?: number
  total?: number
  /** 0..1 progress within the current step, when known */
  fraction?: number
}

export interface ConversionWarning {
  page?: number
  message: string
}

export interface ConversionResult {
  html: string
  method: ConversionMethod
  pageCount: number
  ocrPages: number[]
  /** Average OCR confidence (0-100) across OCR'd pages */
  ocrConfidence?: number
  lowConfidenceWords: number
  tableCount: number
  imageCount: number
  characterCount: number
  warnings: ConversionWarning[]
  sourceFileName: string
  convertedAt: string
}

export interface ConversionSource {
  dataUrl: string
  fileName: string
  fileType?: string
}

export interface ConversionOptions {
  ocrLanguage?: OcrLanguage
  onProgress?: (p: ConversionProgress) => void
  signal?: AbortSignal
}

export class DocumentConversionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DocumentConversionError'
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout model (all coordinates in points, origin top-left of the page)
// ─────────────────────────────────────────────────────────────────────────────

interface Run {
  text: string
  x: number
  top: number
  width: number
  height: number
  baseline: number
  size: number
  bold?: boolean
  italic?: boolean
  underline?: boolean
  href?: string
  family?: string
  lowConfidence?: boolean
  /** OCR runs carry Tesseract's own line grouping */
  lineKey?: string
}

interface Segment {
  x1: number
  y1: number
  x2: number
  y2: number
}

interface ShadeRect {
  x1: number
  y1: number
  x2: number
  y2: number
  color: string
}

interface ImageBox {
  x: number
  top: number
  width: number
  height: number
  src: string
}

interface PageLayout {
  pageNo: number
  width: number
  height: number
  runs: Run[]
  segments: Segment[]
  shades: ShadeRect[]
  images: ImageBox[]
  ocrConfidence?: number
}

interface Line {
  runs: Run[]
  x: number
  top: number
  right: number
  bottom: number
  size: number
  allBold: boolean
}

interface Block {
  top: number
  bottom: number
  render: (marginTopPt: number) => string
}

interface PageRenderStats {
  tables: number
  images: number
}

const A4_WIDTH_PT = 595
const A4_HEIGHT_PT = 842
const LIST_MARKER = /^\s*(\(?\d{1,3}[.)]|\(?[a-z][.)]|\(?[ivxlc]{1,5}[.)]|[•●▪■◦○►➢✓\-–*])\s+/i

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function round(n: number, step = 0.5): number {
  return Math.round(n / step) * step
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const s = [...values].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function cluster(values: number[], tol: number): number[] {
  const sorted = [...values].sort((a, b) => a - b)
  const out: number[] = []
  let group: number[] = []
  for (const v of sorted) {
    if (group.length && v - group[group.length - 1] > tol) {
      out.push(group.reduce((a, b) => a + b, 0) / group.length)
      group = []
    }
    group.push(v)
  }
  if (group.length) out.push(group.reduce((a, b) => a + b, 0) / group.length)
  return out
}

function bisect(edges: number[], v: number): number {
  for (let i = 0; i < edges.length - 1; i++) {
    if (v < edges[i + 1]) return i
  }
  return edges.length - 2
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Conversion cancelled', 'AbortError')
}

function mapFontFamily(name: string | undefined): string | undefined {
  if (!name) return undefined
  const n = name.toLowerCase()
  if (n.includes('times')) return 'Times New Roman'
  if (n.includes('calibri')) return 'Calibri'
  if (n.includes('cambria')) return 'Cambria'
  if (n.includes('arial') || n.includes('helvetica')) return 'Arial'
  if (n.includes('verdana')) return 'Verdana'
  if (n.includes('tahoma')) return 'Tahoma'
  if (n.includes('georgia')) return 'Georgia'
  if (n.includes('garamond')) return 'Garamond'
  if (n.includes('bookman')) return 'Bookman Old Style'
  if (n.includes('courier')) return 'Courier New'
  if (n.includes('mangal')) return 'Mangal'
  if (n.includes('nirmala')) return 'Nirmala UI'
  if (n.includes('segoe')) return 'Segoe UI'
  return undefined
}

function isGarbled(text: string): boolean {
  const chars = text.replace(/\s/g, '')
  if (chars.length < 20) return false
  let bad = 0
  for (const ch of chars) {
    const c = ch.codePointAt(0) || 0
    if (c < 32 || (c >= 0xe000 && c <= 0xf8ff) || c === 0xfffd || (c >= 0x80 && c < 0xa0)) bad++
  }
  return bad / chars.length > 0.3
}

async function dataUrlToBytes(dataUrl: string): Promise<Uint8Array> {
  try {
    const res = await fetch(dataUrl)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return new Uint8Array(await res.arrayBuffer())
  } catch (err: any) {
    throw new DocumentConversionError(
      `Could not read the attached file data (${err?.message || 'unknown error'}). Please re-upload the original file.`
    )
  }
}

type SourceKind = 'pdf' | 'image' | 'docx' | 'doc' | 'text' | 'unknown'

function detectKind(src: ConversionSource, bytes: Uint8Array): SourceKind {
  const name = src.fileName.toLowerCase()
  const type = (src.fileType || '').toLowerCase()
  const head = String.fromCharCode(...bytes.slice(0, 8))
  if (head.startsWith('%PDF')) return 'pdf'
  if (bytes[0] === 0x89 && head.slice(1, 4) === 'PNG') return 'image'
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image'
  if (head.startsWith('GIF8') || head.startsWith('BM') || head.startsWith('RIFF')) return 'image'
  if (type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|tiff?)$/.test(name)) return 'image'
  if (head.startsWith('PK') && (name.endsWith('.docx') || type.includes('wordprocessingml'))) return 'docx'
  if (name.endsWith('.doc') || type === 'application/msword') return 'doc'
  if (type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'
  if (type.startsWith('text/') || /\.(txt|csv|md)$/.test(name)) return 'text'
  return 'unknown'
}

// ─────────────────────────────────────────────────────────────────────────────
// Canvas / raster helpers
// ─────────────────────────────────────────────────────────────────────────────

function createCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.floor(w))
  c.height = Math.max(1, Math.floor(h))
  return c
}

function cropCanvas(canvas: HTMLCanvasElement, x: number, y: number, w: number, h: number): string | null {
  x = clamp(Math.floor(x), 0, canvas.width - 1)
  y = clamp(Math.floor(y), 0, canvas.height - 1)
  w = clamp(Math.ceil(w), 1, canvas.width - x)
  h = clamp(Math.ceil(h), 1, canvas.height - y)
  const srcCtx = canvas.getContext('2d')
  if (!srcCtx) return null
  const data = srcCtx.getImageData(x, y, w, h).data
  // Skip crops that are effectively blank (white image masks, empty boxes)
  let ink = 0
  for (let i = 0; i < data.length; i += 16) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    if (lum < 235) ink++
  }
  if (ink / (data.length / 16) < 0.004) return null

  const scale = Math.min(1, 1400 / w)
  const out = createCanvas(w * scale, h * scale)
  const ctx = out.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, out.width, out.height)
  ctx.drawImage(canvas, x, y, w, h, 0, 0, out.width, out.height)
  return out.width * out.height > 250_000 ? out.toDataURL('image/jpeg', 0.85) : out.toDataURL('image/png')
}

interface RasterInfo {
  gray: Uint8Array
  sat: Uint8Array
  w: number
  h: number
  background: number
}

function readRaster(canvas: HTMLCanvasElement): RasterInfo {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const { width: w, height: h } = canvas
  const rgba = ctx.getImageData(0, 0, w, h).data
  const gray = new Uint8Array(w * h)
  const sat = new Uint8Array(w * h)
  const hist = new Uint32Array(256)
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    const r = rgba[p], g = rgba[p + 1], b = rgba[p + 2]
    const lum = (r * 77 + g * 150 + b * 29) >> 8
    gray[i] = lum
    sat[i] = Math.max(r, g, b) - Math.min(r, g, b)
    hist[lum]++
  }
  // Background = most frequent bright luminance (scans are often off-white/grey)
  let background = 255
  let best = -1
  for (let v = 120; v < 256; v++) {
    if (hist[v] > best) {
      best = hist[v]
      background = v
    }
  }
  return { gray, sat, w, h, background }
}

/**
 * Estimates the skew of a scanned page (degrees) with a projection-profile
 * search: text lines and table rules are horizontal when the variance of the
 * row ink histogram is maximal.
 */
function estimateSkewDegrees(canvas: HTMLCanvasElement): number {
  const s = Math.min(1, 1000 / Math.max(canvas.width, canvas.height))
  const small = createCanvas(canvas.width * s, canvas.height * s)
  const sctx = small.getContext('2d', { willReadFrequently: true })!
  sctx.drawImage(canvas, 0, 0, small.width, small.height)
  const r = readRaster(small)
  const darkT = r.background - 70
  const xs: number[] = []
  const ys: number[] = []
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      if (r.gray[y * r.w + x] < darkT) {
        xs.push(x)
        ys.push(y)
      }
    }
  }
  if (xs.length < 500) return 0
  const step = Math.max(1, Math.floor(xs.length / 80_000))
  const offset = r.w + r.h
  const bins = new Float64Array(2 * offset + 2)
  const score = (deg: number) => {
    const rad = (deg * Math.PI) / 180
    const sin = Math.sin(rad), cos = Math.cos(rad)
    bins.fill(0)
    for (let i = 0; i < xs.length; i += step) bins[Math.round(ys[i] * cos - xs[i] * sin) + offset]++
    let sum = 0
    for (let i = 0; i < bins.length; i++) sum += bins[i] * bins[i]
    return sum
  }
  let best = 0
  let bestScore = score(0)
  for (let d = -5; d <= 5; d += 0.25) {
    const sc = score(d)
    if (sc > bestScore) { bestScore = sc; best = d }
  }
  const coarse = best
  for (let d = coarse - 0.25; d <= coarse + 0.25; d += 0.05) {
    const sc = score(d)
    if (sc > bestScore) { bestScore = sc; best = d }
  }
  return Math.round(best * 100) / 100
}

/** Returns a straightened copy of a scanned page (or the original when it is already straight). */
function deskewCanvas(canvas: HTMLCanvasElement): { canvas: HTMLCanvasElement; angle: number } {
  const angle = estimateSkewDegrees(canvas)
  if (Math.abs(angle) < 0.1) return { canvas, angle: 0 }
  const out = createCanvas(canvas.width, canvas.height)
  const ctx = out.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, out.width, out.height)
  ctx.translate(out.width / 2, out.height / 2)
  ctx.rotate((-angle * Math.PI) / 180)
  ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2)
  return { canvas: out, angle }
}

/** Detects horizontal and vertical ruling lines in a raster (scanned tables). */
function detectRasterSegments(r: RasterInfo, minLenH: number, minLenV: number): Segment[] {
  const { gray, w, h } = r
  const darkT = Math.min(170, r.background - 70)
  const maxThick = Math.max(6, Math.round(Math.max(w, h) * 0.004))
  type RawRun = { p: number; s1: number; s2: number }

  const hRuns: RawRun[] = []
  for (let y = 0; y < h; y++) {
    let start = -1, last = -1
    const row = y * w
    for (let x = 0; x <= w; x++) {
      const dark = x < w && gray[row + x] < darkT
      if (dark) {
        if (start < 0) start = x
        last = x
      } else if (start >= 0 && (x === w || x - last > 3)) {
        if (last - start + 1 >= minLenH) hRuns.push({ p: y, s1: start, s2: last })
        start = -1
      }
    }
  }

  const vRuns: RawRun[] = []
  for (let x = 0; x < w; x++) {
    let start = -1, last = -1
    for (let y = 0; y <= h; y++) {
      const dark = y < h && gray[y * w + x] < darkT
      if (dark) {
        if (start < 0) start = y
        last = y
      } else if (start >= 0 && (y === h || y - last > 3)) {
        if (last - start + 1 >= minLenV) vRuns.push({ p: x, s1: start, s2: last })
        start = -1
      }
    }
  }

  // Merge adjacent pixel rows/columns into single (possibly thick) lines
  const merge = (runs: RawRun[]) => {
    type G = { p1: number; p2: number; s1: number; s2: number }
    const done: G[] = []
    let active: G[] = []
    for (const run of runs) {
      active = active.filter(g => {
        if (g.p2 < run.p - 1) {
          done.push(g)
          return false
        }
        return true
      })
      const g = active.find(a => {
        const overlap = Math.min(a.s2, run.s2) - Math.max(a.s1, run.s1)
        return overlap >= 0.5 * Math.min(a.s2 - a.s1, run.s2 - run.s1)
      })
      if (g) {
        g.p2 = run.p
        g.s1 = Math.min(g.s1, run.s1)
        g.s2 = Math.max(g.s2, run.s2)
      } else {
        active.push({ p1: run.p, p2: run.p, s1: run.s1, s2: run.s2 })
      }
    }
    done.push(...active)
    return done.filter(g => g.p2 - g.p1 + 1 <= maxThick)
  }

  const segs: Segment[] = []
  for (const g of merge(hRuns)) {
    const y = (g.p1 + g.p2) / 2
    segs.push({ x1: g.s1, y1: y, x2: g.s2, y2: y })
  }
  for (const g of merge(vRuns)) {
    const x = (g.p1 + g.p2) / 2
    segs.push({ x1: x, y1: g.s1, x2: x, y2: g.s2 })
  }
  return segs
}

/**
 * Finds regions with ink that are not text and not ruling lines — stamps,
 * signatures, logos, photos — so they can be kept as images in the output.
 */
function detectGraphicRegions(
  r: RasterInfo,
  textBoxes: { x0: number; y0: number; x1: number; y1: number }[],
  segments: Segment[]
): { x: number; y: number; w: number; h: number }[] {
  const { gray, sat, w, h, background } = r
  const mask = new Uint8Array(w * h)
  const markBox = (x0: number, y0: number, x1: number, y1: number) => {
    const ax = clamp(Math.floor(x0), 0, w - 1), bx = clamp(Math.ceil(x1), 0, w - 1)
    const ay = clamp(Math.floor(y0), 0, h - 1), by = clamp(Math.ceil(y1), 0, h - 1)
    for (let y = ay; y <= by; y++) mask.fill(1, y * w + ax, y * w + bx + 1)
  }
  for (const b of textBoxes) markBox(b.x0 - 3, b.y0 - 3, b.x1 + 3, b.y1 + 3)
  for (const s of segments) markBox(s.x1 - 5, s.y1 - 5, s.x2 + 5, s.y2 + 5)

  const cell = Math.max(8, Math.round(Math.max(w, h) / 160))
  const gw = Math.ceil(w / cell), gh = Math.ceil(h / cell)
  const counts = new Uint32Array(gw * gh)
  const inkT = background - 55
  for (let y = 0; y < h; y++) {
    const gy = ((y / cell) | 0) * gw
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (mask[i]) continue
      const lum = gray[i]
      if (lum < inkT || (sat[i] > 90 && lum < 200)) counts[gy + ((x / cell) | 0)]++
    }
  }
  const active = new Uint8Array(gw * gh)
  const threshold = cell * cell * 0.04
  for (let i = 0; i < counts.length; i++) if (counts[i] > threshold) active[i] = 1

  const seen = new Uint8Array(gw * gh)
  const regions: { x: number; y: number; w: number; h: number }[] = []
  for (let start = 0; start < active.length; start++) {
    if (!active[start] || seen[start]) continue
    let minX = gw, minY = gh, maxX = 0, maxY = 0, n = 0
    const stack = [start]
    seen[start] = 1
    while (stack.length) {
      const idx = stack.pop()!
      const cx = idx % gw, cy = (idx / gw) | 0
      n++
      minX = Math.min(minX, cx); maxX = Math.max(maxX, cx)
      minY = Math.min(minY, cy); maxY = Math.max(maxY, cy)
      // radius-2 connectivity bridges broken signature strokes
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = cx + dx, ny = cy + dy
          if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue
          const ni = ny * gw + nx
          if (active[ni] && !seen[ni]) {
            seen[ni] = 1
            stack.push(ni)
          }
        }
      }
    }
    const bw = maxX - minX + 1, bh = maxY - minY + 1
    if (bw < 4 || bh < 3 || n < 6) continue
    const edges = (minX <= 0 ? 1 : 0) + (minY <= 0 ? 1 : 0) + (maxX >= gw - 1 ? 1 : 0) + (maxY >= gh - 1 ? 1 : 0)
    if (edges >= 2) continue // scanner shadow along the page edge
    if (bw * bh > gw * gh * 0.85) continue
    const pad = cell / 2
    regions.push({
      x: Math.max(0, minX * cell - pad),
      y: Math.max(0, minY * cell - pad),
      w: Math.min(w, (maxX + 1) * cell + pad) - Math.max(0, minX * cell - pad),
      h: Math.min(h, (maxY + 1) * cell + pad) - Math.max(0, minY * cell - pad),
    })
  }

  // Merge regions that overlap or nearly touch (a stamp split by its own masked text, a broken signature)
  const near = cell * 2
  let merged = true
  while (merged) {
    merged = false
    outer: for (let i = 0; i < regions.length; i++) {
      for (let j = i + 1; j < regions.length; j++) {
        const a = regions[i], b = regions[j]
        if (a.x - near < b.x + b.w && b.x - near < a.x + a.w && a.y - near < b.y + b.h && b.y - near < a.y + a.h) {
          const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y)
          regions[i] = { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y }
          regions.splice(j, 1)
          merged = true
          break outer
        }
      }
    }
  }
  return regions.sort((a, b) => b.w * b.h - a.w * a.h).slice(0, 10)
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout reconstruction: lines, paragraphs, tables, images → HTML
// ─────────────────────────────────────────────────────────────────────────────

function groupLines(runs: Run[]): Line[] {
  const byKey = new Map<string, Run[]>()
  const loose: Run[] = []
  for (const r of runs) {
    if (r.lineKey) {
      const arr = byKey.get(r.lineKey) || []
      arr.push(r)
      byKey.set(r.lineKey, arr)
    } else loose.push(r)
  }

  const groups: Run[][] = [...byKey.values()]
  const sorted = [...loose].sort((a, b) => a.baseline - b.baseline || a.x - b.x)
  const open: { runs: Run[]; baseline: number; size: number }[] = []
  for (const r of sorted) {
    let target: (typeof open)[number] | undefined
    for (let i = open.length - 1; i >= Math.max(0, open.length - 6); i--) {
      const l = open[i]
      const tol = Math.max(1.5, Math.min(l.size, r.size) * 0.4)
      if (Math.abs(l.baseline - r.baseline) <= tol) {
        target = l
        break
      }
    }
    if (target) target.runs.push(r)
    else open.push({ runs: [r], baseline: r.baseline, size: r.size })
  }
  groups.push(...open.map(o => o.runs))

  const lines: Line[] = []
  for (const g of groups) {
    g.sort((a, b) => a.x - b.x)
    // Drop overprinted duplicates (some PDFs draw text twice to fake bold)
    const runsOut: Run[] = []
    for (const r of g) {
      const dup = runsOut.find(o => o.text === r.text && Math.abs(o.x - r.x) < 1.5 && Math.abs(o.baseline - r.baseline) < 1.5)
      if (dup) {
        dup.bold = true
        continue
      }
      runsOut.push(r)
    }
    const textChars = runsOut.filter(r => r.text.trim())
    if (!textChars.length) continue
    lines.push({
      runs: runsOut,
      x: Math.min(...runsOut.map(r => r.x)),
      top: Math.min(...runsOut.map(r => r.top)),
      right: Math.max(...runsOut.map(r => r.x + r.width)),
      bottom: Math.max(...runsOut.map(r => r.top + r.height)),
      size: Math.max(...textChars.map(r => r.size)),
      allBold: textChars.every(r => r.bold),
    })
  }
  return lines.sort((a, b) => a.top - b.top || a.x - b.x)
}

function lineText(line: Line): string {
  return line.runs.map(r => r.text).join(' ')
}

function wrapRun(text: string, r: Run, baseSize: number): string {
  let h = esc(text)
  if (r.lowConfidence) {
    h = `<span data-ocr-low="1" title="Low OCR confidence – please verify" style="background-color:#fef08a">${h}</span>`
  }
  if (Math.abs(r.size - baseSize) > Math.max(1, baseSize * 0.18)) {
    h = `<span style="font-size:${round(r.size)}pt">${h}</span>`
  }
  if (r.underline) h = `<u>${h}</u>`
  if (r.italic) h = `<em>${h}</em>`
  if (r.bold) h = `<strong>${h}</strong>`
  if (r.href) h = `<a href="${esc(r.href)}" target="_blank" rel="noreferrer">${h}</a>`
  return h
}

function runsToInlineHtml(runs: Run[], baseSize: number): string {
  let out = ''
  let pendingText = ''
  let pendingKey = ''
  let pendingRun: Run | null = null
  let prev: Run | null = null
  const keyOf = (r: Run) =>
    [r.bold ? 1 : 0, r.italic ? 1 : 0, r.underline ? 1 : 0, r.href || '', r.lowConfidence ? 1 : 0,
      Math.abs(r.size - baseSize) > Math.max(1, baseSize * 0.18) ? round(r.size) : 0].join('|')
  const flush = () => {
    if (pendingRun && pendingText) out += wrapRun(pendingText, pendingRun, baseSize)
    pendingText = ''
    pendingRun = null
  }
  for (const r of runs) {
    let sep = ''
    if (prev) {
      const gap = r.x - (prev.x + prev.width)
      const em = Math.max(r.size, prev.size)
      if (gap > em * 2.2) sep = ' '.repeat(clamp(Math.round(gap / em), 2, 12))
      // OCR runs are already whole words, so they are always space-separated
      else if ((r.lineKey || gap > em * 0.15) && !/\s$/.test(prev.text) && !/^\s/.test(r.text)) sep = ' '
    }
    const key = keyOf(r)
    if (pendingRun && key === pendingKey) {
      pendingText += sep + r.text
    } else {
      flush()
      out += sep
      pendingText = r.text
      pendingKey = key
      pendingRun = r
    }
    prev = r
  }
  flush()
  return out
}

function dominantFamily(lines: Line[]): string | undefined {
  const counts = new Map<string, number>()
  for (const l of lines) for (const r of l.runs) if (r.family) counts.set(r.family, (counts.get(r.family) || 0) + r.text.length)
  let best: string | undefined
  let n = 0
  for (const [k, v] of counts) if (v > n) { n = v; best = k }
  return best
}

interface Frame {
  left: number
  right: number
  bodySize: number
}

function paragraphBlock(para: Line[], frame: Frame): Block {
  const size = round(median(para.map(l => l.size)))
  const width = frame.right - frame.left
  const first = para[0]
  const em = size || 11

  let inner = ''
  para.forEach((l, i) => {
    const html = runsToInlineHtml(l.runs, size)
    if (i === 0) inner = html
    else inner += /-$/.test(lineText(para[i - 1]).trim()) ? html : ' ' + html
  })

  let align = ''
  const frameCenter = (frame.left + frame.right) / 2
  const allCentered = para.every(l => Math.abs((l.x + l.right) / 2 - frameCenter) < width * 0.06 && l.x > frame.left + width * 0.06)
  if (allCentered) align = 'text-align:center;'
  else if (para.length === 1 && first.right >= frame.right - em && first.x > frame.left + width * 0.4) align = 'text-align:right;'
  else if (para.length > 2 && para.slice(0, -1).every(l => l.right >= frame.right - em * 1.5)) align = 'text-align:justify;'

  let indent = ''
  if (!allCentered && !align.includes('right')) {
    const bodyX = para.length > 1 ? para[1].x : first.x
    const marginLeft = bodyX - frame.left
    if (marginLeft > em * 1.2) indent += `margin-left:${round(Math.min(marginLeft, 220), 1)}pt;`
    const textIndent = first.x - bodyX
    if (para.length > 1 && Math.abs(textIndent) > em * 0.6) indent += `text-indent:${round(textIndent, 1)}pt;`
  }

  const ratio = size / (frame.bodySize || size)
  const allBold = para.every(l => l.allBold)
  let tag = 'p'
  if (para.length <= 3 && (ratio >= 1.3 || (allBold && ratio >= 1.12))) {
    tag = ratio >= 1.7 ? 'h1' : ratio >= 1.35 ? 'h2' : 'h3'
  }
  const family = dominantFamily(para)
  const style =
    `font-size:${size}pt;${align}${indent}` +
    (family ? `font-family:'${family}';` : '') +
    (tag !== 'p' && !allBold ? 'font-weight:normal;' : '') +
    'line-height:1.25;'

  return {
    top: first.top,
    bottom: para[para.length - 1].bottom,
    render: mt => `<${tag} style="margin:${mt}pt 0 0 0;${style}">${inner}</${tag}>`,
  }
}

function buildTextBlocks(lines: Line[], frame: Frame): Block[] {
  const blocks: Block[] = []
  let para: Line[] = []
  const width = frame.right - frame.left

  const canContinue = (line: Line): boolean => {
    const last = para[para.length - 1]
    const em = Math.max(last.size, line.size)
    if (Math.abs(last.size - line.size) > Math.max(0.8, em * 0.12)) return false
    if (last.allBold !== line.allBold) return false
    const gap = line.top - last.bottom
    if (gap > em * 0.75 || gap < -em * 0.6) return false
    if (LIST_MARKER.test(lineText(line))) return false
    if (last.right < frame.right - Math.max(em * 3, width * 0.1)) return false
    const firstIsList = LIST_MARKER.test(lineText(para[0]))
    if (para.length === 1) {
      if (line.x > last.x + (firstIsList ? em * 4 : em * 0.8)) return false
      if (line.x < frame.left - em) return false
    } else if (Math.abs(line.x - para[1].x) > em * 1.2) {
      return false
    }
    return true
  }

  for (const line of lines) {
    if (para.length && canContinue(line)) para.push(line)
    else {
      if (para.length) blocks.push(paragraphBlock(para, frame))
      para = [line]
    }
  }
  if (para.length) blocks.push(paragraphBlock(para, frame))
  return blocks
}

// ── Tables from ruling lines ────────────────────────────────────────────────

interface Grid {
  xs: number[]
  ys: number[]
  hSegs: Segment[]
  vSegs: Segment[]
  left: number
  right: number
  top: number
  bottom: number
}

function mergeCollinear(segs: Segment[], horizontal: boolean): Segment[] {
  const key = (s: Segment) => (horizontal ? s.y1 : s.x1)
  const start = (s: Segment) => (horizontal ? s.x1 : s.y1)
  const end = (s: Segment) => (horizontal ? s.x2 : s.y2)
  const sorted = [...segs].sort((a, b) => key(a) - key(b))
  const groups: Segment[][] = []
  for (const s of sorted) {
    const g = groups[groups.length - 1]
    if (g && Math.abs(key(s) - key(g[0])) <= 1.2) g.push(s)
    else groups.push([s])
  }
  const out: Segment[] = []
  for (const g of groups) {
    const k = g.reduce((a, s) => a + key(s), 0) / g.length
    const spans = g.map(s => [start(s), end(s)]).sort((a, b) => a[0] - b[0])
    let [cs, ce] = spans[0]
    const push = () => out.push(horizontal ? { x1: cs, y1: k, x2: ce, y2: k } : { x1: k, y1: cs, x2: k, y2: ce })
    for (let i = 1; i < spans.length; i++) {
      if (spans[i][0] <= ce + 2.5) ce = Math.max(ce, spans[i][1])
      else {
        push()
        ;[cs, ce] = spans[i]
      }
    }
    push()
  }
  return out
}

function detectGrids(segments: Segment[], pageW: number, pageH: number, runs: Run[]): Grid[] {
  const TOL = 2.5
  const hs = mergeCollinear(segments.filter(s => Math.abs(s.y2 - s.y1) <= 1.5 && s.x2 - s.x1 >= 4), true)
  const vs = mergeCollinear(segments.filter(s => Math.abs(s.x2 - s.x1) <= 1.5 && s.y2 - s.y1 >= 4), false)
  const n = hs.length + vs.length
  const parent = Array.from({ length: n }, (_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  for (let i = 0; i < hs.length; i++) {
    const h = hs[i]
    for (let j = 0; j < vs.length; j++) {
      const v = vs[j]
      if (v.x1 >= h.x1 - TOL && v.x1 <= h.x2 + TOL && h.y1 >= v.y1 - TOL && h.y1 <= v.y2 + TOL) {
        parent[find(i)] = find(hs.length + j)
      }
    }
  }
  const comps = new Map<number, { h: Segment[]; v: Segment[] }>()
  hs.forEach((s, i) => {
    const r = find(i)
    const c = comps.get(r) || { h: [], v: [] }
    c.h.push(s)
    comps.set(r, c)
  })
  vs.forEach((s, j) => {
    const r = find(hs.length + j)
    const c = comps.get(r) || { h: [], v: [] }
    c.v.push(s)
    comps.set(r, c)
  })

  let grids: Grid[] = []
  for (const c of comps.values()) {
    if (c.h.length < 2 || c.v.length < 2) continue
    const xs = cluster(c.v.map(s => s.x1), 3.5)
    const ys = cluster(c.h.map(s => s.y1), 3.5)
    if (xs.length < 2 || ys.length < 2) continue
    const g: Grid = { xs, ys, hSegs: c.h, vSegs: c.v, left: xs[0], right: xs[xs.length - 1], top: ys[0], bottom: ys[ys.length - 1] }
    if (g.right - g.left < 15 || g.bottom - g.top < 6) continue
    const single = xs.length === 2 && ys.length === 2
    if (single) {
      // Page frames are decoration, and empty boxes (checkboxes, photo boxes) carry no content
      if (g.bottom - g.top > pageH * 0.4 || (g.right - g.left) * (g.bottom - g.top) > pageW * pageH * 0.35) continue
      const hasText = runs.some(r => {
        const cx = r.x + r.width / 2, cy = r.top + r.height / 2
        return cx > g.left && cx < g.right && cy > g.top && cy < g.bottom
      })
      if (!hasText) continue
    }
    grids.push(g)
  }

  // Resolve nesting: a 1×1 frame around a real table is dropped; a table nested inside a cell is absorbed
  const contains = (a: Grid, b: Grid) => a !== b && b.left >= a.left - 1 && b.right <= a.right + 1 && b.top >= a.top - 1 && b.bottom <= a.bottom + 1
  const drop = new Set<Grid>()
  for (const a of grids) {
    for (const b of grids) {
      if (!contains(a, b)) continue
      const aSingle = a.xs.length === 2 && a.ys.length === 2
      drop.add(aSingle ? a : b)
    }
  }
  grids = grids.filter(g => !drop.has(g))
  return grids
}

function tableBlock(grid: Grid, runs: Run[], shades: ShadeRect[], frame: Frame): Block {
  const { xs, ys } = grid
  const R = ys.length - 1
  const C = xs.length - 1
  const parent = Array.from({ length: R * C }, (_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const union = (a: number, b: number) => {
    parent[find(a)] = find(b)
  }

  const hasV = (x: number, yA: number, yB: number) => {
    const mid = (yA + yB) / 2, band = yB - yA
    return grid.vSegs.some(s => Math.abs(s.x1 - x) <= 3.5 && s.y1 <= mid - band * 0.2 && s.y2 >= mid + band * 0.2)
  }
  const hasH = (y: number, xA: number, xB: number) => {
    const mid = (xA + xB) / 2, band = xB - xA
    return grid.hSegs.some(s => Math.abs(s.y1 - y) <= 3.5 && s.x1 <= mid - band * 0.2 && s.x2 >= mid + band * 0.2)
  }
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C - 1; c++) if (!hasV(xs[c + 1], ys[r], ys[r + 1])) union(r * C + c, r * C + c + 1)
  }
  for (let r = 0; r < R - 1; r++) {
    for (let c = 0; c < C; c++) if (!hasH(ys[r + 1], xs[c], xs[c + 1])) union(r * C + c, (r + 1) * C + c)
  }

  const rects = new Map<number, { r0: number; r1: number; c0: number; c1: number }>()
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      const root = find(r * C + c)
      const rect = rects.get(root)
      if (!rect) rects.set(root, { r0: r, r1: r, c0: c, c1: c })
      else {
        rect.r0 = Math.min(rect.r0, r); rect.r1 = Math.max(rect.r1, r)
        rect.c0 = Math.min(rect.c0, c); rect.c1 = Math.max(rect.c1, c)
      }
    }
  }

  const cellRuns = new Map<number, Run[]>()
  for (const run of runs) {
    const c = bisect(xs, run.x + run.width / 2)
    const r = bisect(ys, run.top + run.height / 2)
    const root = find(r * C + c)
    const arr = cellRuns.get(root) || []
    arr.push(run)
    cellRuns.set(root, arr)
  }

  const tableW = grid.right - grid.left
  const frameW = Math.max(frame.right - frame.left, tableW)
  const widthPct = clamp(Math.round((tableW / frameW) * 100), 10, 100)
  const cols = xs.slice(0, -1).map((x, i) => Math.round(((xs[i + 1] - x) / tableW) * 1000) / 10)
  const centered = Math.abs((grid.left + grid.right) / 2 - (frame.left + frame.right) / 2) < frameW * 0.05 && widthPct < 95
  const emitted = new Uint8Array(R * C)

  const cellHtml = (root: number, rect: { r0: number; r1: number; c0: number; c1: number }) => {
    const x0 = xs[rect.c0], x1 = xs[rect.c1 + 1], y0 = ys[rect.r0], y1 = ys[rect.r1 + 1]
    const items = cellRuns.get(root) || []
    const lines = groupLines(items)
    const size = lines.length ? round(median(lines.map(l => l.size))) : frame.bodySize
    const cw = x1 - x0
    let inner = ''
    lines.forEach((l, i) => {
      const html = runsToInlineHtml(l.runs, size)
      if (i === 0) inner = html
      else {
        const prev = lines[i - 1]
        const wrapped = prev.right >= x1 - Math.max(prev.size * 3, cw * 0.15) && l.top - prev.bottom < prev.size * 0.6
        inner += wrapped ? ' ' + html : '<br>' + html
      }
    })
    let align = ''
    if (lines.length) {
      // Centred = clearly indented from the left border with (nearly) equal gaps on both sides
      const centred = (l: Line) => {
        const leftGap = l.x - x0, rightGap = x1 - l.right
        return leftGap > Math.max(l.size * 0.8, cw * 0.04) && Math.abs(leftGap - rightGap) < Math.max(l.size * 0.8, cw * 0.08)
      }
      if (lines.every(centred)) align = 'text-align:center;'
      else if (lines.every(l => x1 - l.right < l.size * 1.2 && l.x - x0 > cw * 0.3)) align = 'text-align:right;'
    }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
    const shade = shades
      .filter(s => cx > s.x1 && cx < s.x2 && cy > s.y1 && cy < s.y2)
      .sort((a, b) => (a.x2 - a.x1) * (a.y2 - a.y1) - (b.x2 - b.x1) * (b.y2 - b.y1))[0]
    const span =
      (rect.r1 > rect.r0 ? ` rowspan="${rect.r1 - rect.r0 + 1}"` : '') +
      (rect.c1 > rect.c0 ? ` colspan="${rect.c1 - rect.c0 + 1}"` : '')
    const style =
      `border:1px solid #000;padding:2pt 4pt;vertical-align:top;font-size:${size}pt;${align}` +
      (shade ? `background-color:${shade.color};` : '')
    return `<td${span} style="${style}">${inner || '&nbsp;'}</td>`
  }

  return {
    top: grid.top,
    bottom: grid.bottom,
    render: mt => {
      let html =
        `<table data-converted-table="1" style="border-collapse:collapse;width:${widthPct}%;margin:${mt}pt ${centered ? 'auto' : '0'} 0 ${centered ? 'auto' : '0'};">` +
        `<colgroup>${cols.map(w => `<col style="width:${w}%">`).join('')}</colgroup><tbody>`
      for (let r = 0; r < R; r++) {
        html += '<tr>'
        for (let c = 0; c < C; c++) {
          if (emitted[r * C + c]) continue
          const root = find(r * C + c)
          const full = rects.get(root)!
          const rect = { r0: r, r1: Math.max(r, full.r1), c0: c, c1: Math.max(c, full.c1) }
          for (let rr = rect.r0; rr <= rect.r1; rr++) for (let cc = rect.c0; cc <= rect.c1; cc++) emitted[rr * C + cc] = 1
          html += cellHtml(root, rect)
        }
        html += '</tr>'
      }
      return html + '</tbody></table>'
    },
  }
}

function imageBlock(img: ImageBox, frame: Frame, pageNo: number): Block {
  const width = frame.right - frame.left
  const center = img.x + img.width / 2
  const frameCenter = (frame.left + frame.right) / 2
  let align = 'left'
  if (Math.abs(center - frameCenter) < width * 0.12) align = 'center'
  else if (center > frameCenter) align = 'right'
  const wPt = round(img.width, 1)
  const hPt = round(img.height, 1)
  return {
    top: img.top,
    bottom: img.top + img.height,
    render: mt =>
      `<p style="margin:${mt}pt 0 0 0;text-align:${align};"><img src="${img.src}" alt="Image from page ${pageNo}" ` +
      `style="width:${wPt}pt;height:${hPt}pt;max-width:100%;" data-width-pt="${wPt}" data-height-pt="${hPt}"></p>`,
  }
}

function renderPage(layout: PageLayout, bodySize: number, stats: PageRenderStats): string {
  const { runs, width: pageW, height: pageH } = layout
  if (!runs.length && !layout.images.length) return ''

  const xsLeft = runs.map(r => r.x).sort((a, b) => a - b)
  const xsRight = runs.map(r => r.x + r.width).sort((a, b) => a - b)
  const pick = (arr: number[], q: number) => (arr.length ? arr[Math.floor((arr.length - 1) * q)] : 0)
  const frame: Frame = {
    left: runs.length ? pick(xsLeft, 0.02) : pageW * 0.08,
    right: runs.length ? pick(xsRight, 0.98) : pageW * 0.92,
    bodySize,
  }
  if (frame.right - frame.left < pageW * 0.3) {
    frame.left = Math.min(frame.left, pageW * 0.1)
    frame.right = Math.max(frame.right, pageW * 0.9)
  }

  const grids = detectGrids(layout.segments, pageW, pageH, runs)
  const inGrid = (r: Run) => {
    const cx = r.x + r.width / 2, cy = r.top + r.height / 2
    return grids.find(g => cx >= g.left - 1 && cx <= g.right + 1 && cy >= g.top - 1 && cy <= g.bottom + 1)
  }
  const gridRuns = new Map<Grid, Run[]>()
  const freeRuns: Run[] = []
  for (const r of runs) {
    const g = inGrid(r)
    if (g) {
      const arr = gridRuns.get(g) || []
      arr.push(r)
      gridRuns.set(g, arr)
    } else freeRuns.push(r)
  }

  // Ruling lines outside tables: underlines under text, otherwise horizontal rules
  const looseH = layout.segments.filter(
    s => Math.abs(s.y2 - s.y1) <= 1.5 && s.x2 - s.x1 >= 4 && !grids.some(g => s.y1 >= g.top - 2 && s.y1 <= g.bottom + 2 && s.x1 >= g.left - 2 && s.x2 <= g.right + 2)
  )
  const usedForUnderline = new Set<Segment>()
  for (const r of freeRuns) {
    for (const s of looseH) {
      const below = s.y1 - r.baseline
      const overlap = Math.min(s.x2, r.x + r.width) - Math.max(s.x1, r.x)
      if (below >= -1 && below <= Math.max(3, r.size * 0.3) && overlap >= r.width * 0.7) {
        r.underline = true
        usedForUnderline.add(s)
      }
    }
  }

  const blocks: Block[] = []
  blocks.push(...buildTextBlocks(groupLines(freeRuns), frame))
  for (const g of grids) {
    blocks.push(tableBlock(g, gridRuns.get(g) || [], layout.shades, frame))
    stats.tables++
  }
  for (const img of layout.images) {
    blocks.push(imageBlock(img, frame, layout.pageNo))
    stats.images++
  }
  for (const s of looseH) {
    if (usedForUnderline.has(s) || s.x2 - s.x1 < (frame.right - frame.left) * 0.3) continue
    blocks.push({ top: s.y1, bottom: s.y1 + 1, render: mt => `<hr style="border:0;border-top:1px solid #000;margin:${mt}pt 0 0 0;">` })
  }

  blocks.sort((a, b) => a.top - b.top)
  let prevBottom = -1
  let html = ''
  for (const b of blocks) {
    const gap = prevBottom < 0 ? 0 : b.top - prevBottom - bodySize * 0.3
    html += b.render(prevBottom < 0 ? 0 : clamp(Math.round(gap), 0, 36))
    prevBottom = Math.max(prevBottom, b.bottom)
  }
  return html
}

function bodySizeOf(layouts: PageLayout[]): number {
  const weights = new Map<number, number>()
  for (const l of layouts) for (const r of l.runs) {
    const k = round(r.size)
    weights.set(k, (weights.get(k) || 0) + r.text.length)
  }
  let best = 11
  let n = 0
  for (const [k, v] of weights) if (v > n) { n = v; best = k }
  return best
}

function assembleHtml(layouts: PageLayout[], source: ConversionSource, method: ConversionMethod, stats: PageRenderStats): string {
  const bodySize = bodySizeOf(layouts)
  const pages = layouts.map(l => {
    const inner = renderPage(l, bodySize, stats)
    return `<div data-source-page="${l.pageNo}">${inner || '<p style="margin:0;color:#94a3b8;"><em>[Blank page]</em></p>'}</div>`
  })
  const pageBreak =
    '<div data-page-break="1" style="page-break-before:always;break-before:page;border-top:1px dashed #94a3b8;margin:24px 0 16px 0;height:0;"></div>'
  return (
    `<div data-converted-from="${esc(source.fileName)}" data-conversion-method="${method}">` +
    pages.join(pageBreak) +
    '</div>'
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// OCR (Tesseract)
// ─────────────────────────────────────────────────────────────────────────────

type TesseractWorker = Awaited<ReturnType<(typeof import('tesseract.js'))['createWorker']>>

class OcrEngine {
  private worker: TesseractWorker | null = null
  private progressCb: ((fraction: number) => void) | null = null

  constructor(private lang: OcrLanguage) {}

  private async get(): Promise<TesseractWorker> {
    if (this.worker) return this.worker
    try {
      const { createWorker } = await import('tesseract.js')
      this.worker = await createWorker(this.lang, 1, {
        logger: (m: any) => {
          if (m?.status === 'recognizing text' && typeof m.progress === 'number') this.progressCb?.(m.progress)
        },
      })
      return this.worker
    } catch (err: any) {
      throw new DocumentConversionError(
        `The OCR engine could not be loaded (${err?.message || 'network error'}). ` +
          'OCR language data is downloaded on first use, so an internet connection is required for scanned files and images.'
      )
    }
  }

  async recognize(canvas: HTMLCanvasElement, onFraction?: (f: number) => void) {
    const worker = await this.get()
    this.progressCb = onFraction || null
    const { data } = await worker.recognize(canvas)
    this.progressCb = null
    return data
  }

  async dispose() {
    try {
      await this.worker?.terminate()
    } catch {
      /* ignore */
    }
    this.worker = null
  }
}

interface OcrPageOutcome {
  layout: PageLayout
  confidence: number
  lowWords: number
  skewAngle: number
}

/** OCR a rendered page/image. `unit` converts canvas pixels into points. */
async function ocrToLayout(
  engine: OcrEngine,
  sourceCanvas: HTMLCanvasElement,
  unit: number,
  pageNo: number,
  onFraction?: (f: number) => void
): Promise<OcrPageOutcome> {
  // Straighten skewed scans first: OCR accuracy and table-line detection both depend on it
  const { canvas, angle: skewAngle } = deskewCanvas(sourceCanvas)
  const data: any = await engine.recognize(canvas, onFraction)
  const raster = readRaster(canvas)

  const allWords: { text: string; conf: number; bbox: any; lineKey: string; lineH: number }[] = []
  ;(data.lines || []).forEach((line: any, li: number) => {
    // Median word height, not the line box: a skewed scan inflates the line's bounding box
    const lineH = median((line.words || []).map((w: any) => w.bbox.y1 - w.bbox.y0)) || line.bbox.y1 - line.bbox.y0
    for (const w of line.words || []) {
      const text = String(w.text || '').trim()
      if (!text) continue
      // Tiny low-confidence fragments without letters/digits are graphics noise (stamps, signatures)
      if (w.confidence < 35 && !/[A-Za-z0-9ऀ-ॿ]{2,}/.test(text)) continue
      allWords.push({ text, conf: w.confidence, bbox: w.bbox, lineKey: `p${pageNo}l${li}`, lineH })
    }
  })

  const medH = median(allWords.map(w => w.bbox.y1 - w.bbox.y0)) || 20
  // Oversized, low-confidence "words" are handwriting/signature strokes read as letters: keep them as graphics
  const words = allWords.filter(w => !(w.conf < 70 && w.bbox.y1 - w.bbox.y0 > medH * 1.8 && w.text.length <= 4))
  const segPx = detectRasterSegments(raster, Math.max(40, raster.w * 0.03), Math.max(30, medH * 1.4))

  // Remove "|" style words that are really table borders
  const kept = words.filter(w => {
    if (!/^[|¦!lI\[\]_—–-]{1,2}$/.test(w.text)) return true
    return !segPx.some(s => s.x1 >= w.bbox.x0 - 3 && s.x2 <= w.bbox.x1 + 3 && s.y1 <= w.bbox.y1 && s.y2 >= w.bbox.y0)
  })

  const graphics = detectGraphicRegions(raster, kept.map(w => w.bbox), segPx)
  const images: ImageBox[] = []
  for (const g of graphics) {
    const src = cropCanvas(canvas, g.x, g.y, g.w, g.h)
    if (src) images.push({ x: g.x * unit, top: g.y * unit, width: g.w * unit, height: g.h * unit, src })
  }

  let lowWords = 0
  const runs: Run[] = kept.map(w => {
    const low = w.conf < 60
    if (low) lowWords++
    return {
      text: w.text,
      x: w.bbox.x0 * unit,
      top: w.bbox.y0 * unit,
      width: (w.bbox.x1 - w.bbox.x0) * unit,
      height: (w.bbox.y1 - w.bbox.y0) * unit,
      baseline: w.bbox.y1 * unit,
      size: clamp(round(w.lineH * unit * 0.85), 6, 48),
      lineKey: w.lineKey,
      lowConfidence: low,
    }
  })

  return {
    layout: {
      pageNo,
      width: raster.w * unit,
      height: raster.h * unit,
      runs,
      segments: segPx.map(s => ({ x1: s.x1 * unit, y1: s.y1 * unit, x2: s.x2 * unit, y2: s.y2 * unit })),
      shades: [],
      images,
      ocrConfidence: data.confidence,
    },
    confidence: typeof data.confidence === 'number' ? data.confidence : 0,
    lowWords,
    skewAngle,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF
// ─────────────────────────────────────────────────────────────────────────────

type PdfJsModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs')
let pdfjsPromise: Promise<PdfJsModule> | null = null

function loadPdfJs(): Promise<PdfJsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs').then(mod => {
      // Copied from node_modules by scripts/sync-pdfjs-assets.mjs
      mod.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs'
      return mod
    })
    pdfjsPromise.catch(() => {
      pdfjsPromise = null
    })
  }
  return pdfjsPromise
}

type Matrix = [number, number, number, number, number, number]

function mul(m1: Matrix, m2: Matrix): Matrix {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ]
}

function apply(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
}

function hex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('')
}

interface VectorGraphics {
  segments: Segment[]
  shades: ShadeRect[]
  images: { x: number; top: number; width: number; height: number }[]
}

/** Walks the pdf.js operator list collecting ruling lines, filled cell shading and image placements. */
function analyzeOperators(pdfjs: PdfJsModule, opList: { fnArray: number[]; argsArray: any[] }, viewportTransform: Matrix): VectorGraphics {
  const OPS = pdfjs.OPS as Record<string, number>
  const out: VectorGraphics = { segments: [], shades: [], images: [] }
  type State = { ctm: Matrix; fill: [number, number, number]; stroke: [number, number, number] }
  let state: State = { ctm: [1, 0, 0, 1, 0, 0], fill: [0, 0, 0], stroke: [0, 0, 0] }
  const stack: State[] = []
  type Piece = { kind: 'rect'; pts: [number, number][] } | { kind: 'line'; a: [number, number]; b: [number, number] }
  let path: Piece[] = []

  const toView = (x: number, y: number) => apply(mul(viewportTransform, state.ctm), x, y)
  const isLight = (c: [number, number, number]) => c[0] > 235 && c[1] > 235 && c[2] > 235

  const addSegment = (a: [number, number], b: [number, number]) => {
    const dx = Math.abs(a[0] - b[0]), dy = Math.abs(a[1] - b[1])
    if (dy <= 1 && dx >= 4) out.segments.push({ x1: Math.min(a[0], b[0]), y1: (a[1] + b[1]) / 2, x2: Math.max(a[0], b[0]), y2: (a[1] + b[1]) / 2 })
    else if (dx <= 1 && dy >= 4) out.segments.push({ x1: (a[0] + b[0]) / 2, y1: Math.min(a[1], b[1]), x2: (a[0] + b[0]) / 2, y2: Math.max(a[1], b[1]) })
  }

  const strokePath = () => {
    if (isLight(state.stroke)) return
    for (const p of path) {
      if (p.kind === 'line') addSegment(p.a, p.b)
      else for (let i = 0; i < 4; i++) addSegment(p.pts[i], p.pts[(i + 1) % 4])
    }
  }

  const fillPath = () => {
    for (const p of path) {
      if (p.kind !== 'rect') continue
      const xs = p.pts.map(q => q[0]), ys = p.pts.map(q => q[1])
      const x1 = Math.min(...xs), x2 = Math.max(...xs), y1 = Math.min(...ys), y2 = Math.max(...ys)
      const w = x2 - x1, h = y2 - y1
      if (isLight(state.fill)) continue
      // Thin filled rectangles are how many generators draw table borders
      if (h <= 2.5 && w >= 4) out.segments.push({ x1, y1: (y1 + y2) / 2, x2, y2: (y1 + y2) / 2 })
      else if (w <= 2.5 && h >= 4) out.segments.push({ x1: (x1 + x2) / 2, y1, x2: (x1 + x2) / 2, y2 })
      else if (w > 4 && h > 4) out.shades.push({ x1, y1, x2, y2, color: hex(...state.fill) })
    }
  }

  const { fnArray, argsArray } = opList
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i]
    const args = argsArray[i]
    switch (fn) {
      case OPS.save:
        stack.push({ ...state })
        break
      case OPS.restore:
        state = stack.pop() || state
        break
      case OPS.transform:
        state = { ...state, ctm: mul(state.ctm, args as Matrix) }
        break
      case OPS.paintFormXObjectBegin:
        stack.push({ ...state })
        if (Array.isArray(args?.[0]) && args[0].length === 6) state = { ...state, ctm: mul(state.ctm, args[0] as Matrix) }
        break
      case OPS.paintFormXObjectEnd:
      case OPS.endGroup:
        state = stack.pop() || state
        break
      case OPS.beginGroup:
        stack.push({ ...state })
        if (Array.isArray(args?.[0]?.matrix) && args[0].matrix.length === 6) state = { ...state, ctm: mul(state.ctm, args[0].matrix as Matrix) }
        break
      case OPS.setFillRGBColor:
        state = { ...state, fill: [args[0], args[1], args[2]] }
        break
      case OPS.setStrokeRGBColor:
        state = { ...state, stroke: [args[0], args[1], args[2]] }
        break
      case OPS.constructPath: {
        const [ops, coords] = args as [number[], number[]]
        let j = 0
        let cur: [number, number] = [0, 0]
        let start: [number, number] = [0, 0]
        for (const op of ops) {
          if (op === OPS.rectangle) {
            const [x, y, w, h] = [coords[j++], coords[j++], coords[j++], coords[j++]]
            if (w === 0 || h === 0) path.push({ kind: 'line', a: toView(x, y), b: toView(x + w, y + h) })
            else path.push({ kind: 'rect', pts: [toView(x, y), toView(x + w, y), toView(x + w, y + h), toView(x, y + h)] })
            cur = [x, y]
            start = cur
          } else if (op === OPS.moveTo) {
            cur = [coords[j++], coords[j++]]
            start = cur
          } else if (op === OPS.lineTo) {
            const next: [number, number] = [coords[j++], coords[j++]]
            path.push({ kind: 'line', a: toView(...cur), b: toView(...next) })
            cur = next
          } else if (op === OPS.curveTo) {
            j += 4
            cur = [coords[j++], coords[j++]]
          } else if (op === OPS.curveTo2 || op === OPS.curveTo3) {
            j += 2
            cur = [coords[j++], coords[j++]]
          } else if (op === OPS.closePath) {
            if (cur[0] !== start[0] || cur[1] !== start[1]) path.push({ kind: 'line', a: toView(...cur), b: toView(...start) })
            cur = start
          }
        }
        break
      }
      case OPS.stroke:
      case OPS.closeStroke:
        strokePath()
        path = []
        break
      case OPS.fill:
      case OPS.eoFill:
        fillPath()
        path = []
        break
      case OPS.fillStroke:
      case OPS.eoFillStroke:
      case OPS.closeFillStroke:
      case OPS.closeEOFillStroke:
        fillPath()
        strokePath()
        path = []
        break
      case OPS.endPath:
        path = []
        break
      case OPS.paintImageXObject:
      case OPS.paintInlineImageXObject:
      case OPS.paintImageMaskXObject:
      case OPS.paintJpegXObject: {
        const corners = [toView(0, 0), toView(1, 0), toView(1, 1), toView(0, 1)]
        const xs = corners.map(c => c[0]), ys = corners.map(c => c[1])
        const x = Math.min(...xs), top = Math.min(...ys)
        out.images.push({ x, top, width: Math.max(...xs) - x, height: Math.max(...ys) - top })
        break
      }
    }
  }
  return out
}

async function renderPdfPage(page: any, scale: number): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale })
  // Keep canvases within browser limits on very large pages
  const maxPixels = 16_000_000
  const actualScale = viewport.width * viewport.height > maxPixels ? scale * Math.sqrt(maxPixels / (viewport.width * viewport.height)) : scale
  const vp = actualScale === scale ? viewport : page.getViewport({ scale: actualScale })
  const canvas = createCanvas(vp.width, vp.height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: ctx, viewport: vp }).promise
  ;(canvas as any).__scale = actualScale
  return canvas
}

async function convertPdf(bytes: Uint8Array, source: ConversionSource, opts: ConversionOptions): Promise<ConversionResult> {
  const progress = opts.onProgress || (() => {})
  progress({ message: 'Loading PDF engine…' })
  let pdfjs: PdfJsModule
  try {
    pdfjs = await loadPdfJs()
  } catch (err: any) {
    throw new DocumentConversionError(`The PDF engine could not be loaded: ${err?.message || err}`)
  }

  let pdf: any
  try {
    pdf = await pdfjs.getDocument({
      data: bytes,
      cMapUrl: '/pdfjs/cmaps/',
      cMapPacked: true,
      standardFontDataUrl: '/pdfjs/standard_fonts/',
      isEvalSupported: false,
    }).promise
  } catch (err: any) {
    if (err?.name === 'PasswordException') throw new DocumentConversionError('This PDF is password-protected. Please upload an unlocked copy.')
    if (err?.name === 'InvalidPDFException') throw new DocumentConversionError('The attached file is not a valid PDF or is corrupted.')
    throw new DocumentConversionError(`Could not open the PDF: ${err?.message || err}`)
  }

  const total: number = pdf.numPages
  const warnings: ConversionWarning[] = []
  const layouts: PageLayout[] = []
  const ocrPages: number[] = []
  const confidences: number[] = []
  let lowWords = 0
  let ocrEngine: OcrEngine | null = null
  let ocrFailure: string | null = null
  const rotatedPages: number[] = []

  try {
    for (let p = 1; p <= total; p++) {
      throwIfAborted(opts.signal)
      progress({ message: `Reading page ${p} of ${total}…`, current: p, total })
      const page = await pdf.getPage(p)
      const viewport = page.getViewport({ scale: 1 })
      const vt = viewport.transform as Matrix
      const [textContent, opList, annotations] = await Promise.all([
        page.getTextContent(),
        page.getOperatorList(),
        page.getAnnotations({ intent: 'display' }).catch(() => []),
      ])

      const links: { x1: number; y1: number; x2: number; y2: number; url: string }[] = []
      for (const a of annotations as any[]) {
        if (a?.subtype !== 'Link' || !a.url) continue
        const [x1, y1, x2, y2] = viewport.convertToViewportRectangle(a.rect)
        links.push({ x1: Math.min(x1, x2), y1: Math.min(y1, y2), x2: Math.max(x1, x2), y2: Math.max(y1, y2), url: a.url })
      }

      const runs: Run[] = []
      let rotated = 0
      for (const item of textContent.items as any[]) {
        if (typeof item.str !== 'string' || !item.str.trim()) continue
        const tx = mul(vt, item.transform as Matrix)
        const size = Math.hypot(tx[2], tx[3])
        if (size < 1) continue
        if (Math.abs(tx[1]) > Math.abs(tx[0]) * 0.1 || tx[0] < 0) {
          rotated++
          continue
        }
        let font: any = null
        try {
          if (page.commonObjs.has(item.fontName)) font = page.commonObjs.get(item.fontName)
        } catch {
          font = null
        }
        const fontName: string = font?.name || textContent.styles?.[item.fontName]?.fontFamily || ''
        const width = Math.abs(item.width * (viewport.scale || 1)) || item.str.length * size * 0.5
        const x = tx[4]
        const baseline = tx[5]
        const cx = x + width / 2, cy = baseline - size * 0.35
        const link = links.find(l => cx >= l.x1 && cx <= l.x2 && cy >= l.y1 && cy <= l.y2)
        runs.push({
          text: item.str.replace(/\s+/g, ' '),
          x,
          top: baseline - size * 0.85,
          width,
          height: size,
          baseline,
          size: round(size),
          bold: Boolean(font?.bold || font?.black || /bold|black|heavy|semibold|demi/i.test(fontName)),
          italic: Boolean(font?.italic || /italic|oblique/i.test(fontName)),
          family: mapFontFamily(fontName),
          href: link?.url,
        })
      }
      if (rotated > 0) rotatedPages.push(p)

      const gfx = analyzeOperators(pdfjs, opList as any, vt)
      const pageArea = viewport.width * viewport.height
      const textChars = runs.reduce((n, r) => n + r.text.replace(/\s/g, '').length, 0)
      const garbled = isGarbled(runs.map(r => r.text).join(''))
      const bigImage = gfx.images.some(i => i.width * i.height > pageArea * 0.5)
      const needsOcr = textChars < 20 || garbled || (bigImage && textChars < 150)
      if (garbled) warnings.push({ page: p, message: 'The text layer uses an unreadable font encoding, so OCR was used for this page.' })

      if (needsOcr && !ocrFailure) {
        try {
          ocrEngine ||= new OcrEngine(opts.ocrLanguage || 'eng')
          progress({ message: `Running OCR on page ${p} of ${total}…`, current: p, total, fraction: 0 })
          const canvas = await renderPdfPage(page, 3)
          const scale = (canvas as any).__scale as number
          const outcome = await ocrToLayout(ocrEngine, canvas, 1 / scale, p, f =>
            progress({ message: `Running OCR on page ${p} of ${total}…`, current: p, total, fraction: f })
          )
          outcome.layout.width = viewport.width
          outcome.layout.height = viewport.height
          layouts.push(outcome.layout)
          ocrPages.push(p)
          confidences.push(outcome.confidence)
          lowWords += outcome.lowWords
          if (Math.abs(outcome.skewAngle) >= 0.3) {
            warnings.push({ page: p, message: `The scanned page was tilted ${outcome.skewAngle}° and was straightened before OCR.` })
          }
          if (outcome.layout.runs.length === 0 && outcome.layout.images.length === 0) {
            warnings.push({ page: p, message: 'No text could be recognised on this page (it may be blank or a photo).' })
          } else if (outcome.confidence < 75) {
            warnings.push({ page: p, message: `OCR confidence is low (${Math.round(outcome.confidence)}%). Please compare this page with the original.` })
          }
          continue
        } catch (err: any) {
          if (err?.name === 'AbortError') throw err
          ocrFailure = err instanceof DocumentConversionError ? err.message : `OCR failed: ${err?.message || err}`
        }
      }
      if (needsOcr && ocrFailure) {
        warnings.push({ page: p, message: `This page is scanned and could not be OCR'd. ${ocrFailure}` })
        layouts.push({ pageNo: p, width: viewport.width, height: viewport.height, runs, segments: [], shades: [], images: [] })
        continue
      }

      // Digital page: keep embedded images (logos, stamps, signatures) and, for
      // searchable scans, recover table lines from the rendered raster.
      const keepImages = gfx.images.filter(i => i.width >= 12 && i.height >= 12 && i.width * i.height <= pageArea * (bigImage ? 0.5 : 0.4))
      const images: ImageBox[] = []
      let segments = gfx.segments
      if (keepImages.length || bigImage) {
        const canvas = await renderPdfPage(page, bigImage ? 3 : 2)
        const scale = (canvas as any).__scale as number
        for (const img of keepImages.slice(0, 20)) {
          const src = cropCanvas(canvas, img.x * scale, img.top * scale, img.width * scale, img.height * scale)
          if (src) images.push({ ...img, src })
        }
        if (bigImage) {
          const raster = readRaster(canvas)
          const medH = median(runs.map(r => r.height * scale)) || 30
          const segPx = detectRasterSegments(raster, Math.max(40, raster.w * 0.03), Math.max(30, medH * 1.4))
          segments = segments.concat(segPx.map(s => ({ x1: s.x1 / scale, y1: s.y1 / scale, x2: s.x2 / scale, y2: s.y2 / scale })))
          const boxes = runs.map(r => ({ x0: r.x * scale, y0: r.top * scale, x1: (r.x + r.width) * scale, y1: (r.top + r.height) * scale }))
          for (const g of detectGraphicRegions(raster, boxes, segPx)) {
            const src = cropCanvas(canvas, g.x, g.y, g.w, g.h)
            if (src) images.push({ x: g.x / scale, top: g.y / scale, width: g.w / scale, height: g.h / scale, src })
          }
        }
        if (gfx.images.some(i => i.width * i.height > pageArea * 0.4) && !bigImage) {
          warnings.push({ page: p, message: 'A large background image/watermark was left out so the text stays editable.' })
        }
      }

      layouts.push({ pageNo: p, width: viewport.width, height: viewport.height, runs, segments, shades: gfx.shades, images })
      page.cleanup()
    }
  } finally {
    await ocrEngine?.dispose()
    pdf.destroy?.()
  }

  if (rotatedPages.length) {
    warnings.push({ message: `Rotated or vertical text (e.g. watermarks, side labels) was skipped on page(s) ${rotatedPages.join(', ')}.` })
  }

  const characterCount = layouts.reduce((n, l) => n + l.runs.reduce((m, r) => m + r.text.replace(/\s/g, '').length, 0), 0)
  if (characterCount === 0) {
    throw new DocumentConversionError(
      ocrFailure
        ? `No text could be extracted. The PDF appears to be scanned and OCR could not run: ${ocrFailure}`
        : 'No readable text could be extracted from this PDF. It may be blank, an image without legible text, or corrupted.'
    )
  }

  progress({ message: 'Building editable document…' })
  const method: ConversionMethod = ocrPages.length === 0 ? 'pdf-text' : ocrPages.length === total ? 'pdf-ocr' : 'pdf-mixed'
  const stats = { tables: 0, images: 0 }
  const html = assembleHtml(layouts, source, method, stats)
  if (lowWords > 0) {
    warnings.push({ message: `${lowWords} word(s) recognised with low OCR confidence are highlighted in yellow — please verify them.` })
  }

  return {
    html,
    method,
    pageCount: total,
    ocrPages,
    ocrConfidence: confidences.length ? Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length) : undefined,
    lowConfidenceWords: lowWords,
    tableCount: stats.tables,
    imageCount: stats.images,
    characterCount,
    warnings,
    sourceFileName: source.fileName,
    convertedAt: new Date().toISOString(),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Images
// ─────────────────────────────────────────────────────────────────────────────

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new DocumentConversionError('The attached image could not be decoded. Supported formats: JPG, PNG, WEBP, GIF, BMP.'))
    img.src = dataUrl
  })
}

async function convertImage(source: ConversionSource, opts: ConversionOptions): Promise<ConversionResult> {
  const progress = opts.onProgress || (() => {})
  progress({ message: 'Loading image…' })
  const img = await loadImage(source.dataUrl)
  const w0 = img.naturalWidth, h0 = img.naturalHeight
  if (!w0 || !h0) throw new DocumentConversionError('The attached image is empty.')

  // Upscale small images for better OCR, downscale huge ones for speed
  const maxDim = Math.max(w0, h0)
  const s = maxDim < 2000 ? Math.min(2.5, 2000 / maxDim) : maxDim > 3500 ? 3500 / maxDim : 1
  const canvas = createCanvas(w0 * s, h0 * s)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

  const pageWidthPt = canvas.width >= canvas.height ? A4_HEIGHT_PT : A4_WIDTH_PT
  const unit = pageWidthPt / canvas.width
  const engine = new OcrEngine(opts.ocrLanguage || 'eng')
  let outcome: OcrPageOutcome
  try {
    progress({ message: 'Running OCR on image…', current: 1, total: 1, fraction: 0 })
    outcome = await ocrToLayout(engine, canvas, unit, 1, f => progress({ message: 'Running OCR on image…', current: 1, total: 1, fraction: f }))
  } finally {
    await engine.dispose()
  }

  const characterCount = outcome.layout.runs.reduce((n, r) => n + r.text.length, 0)
  if (characterCount === 0) {
    throw new DocumentConversionError('OCR could not recognise any text in this image. Try a sharper, well-lit, straight scan.')
  }

  const warnings: ConversionWarning[] = []
  if (Math.abs(outcome.skewAngle) >= 0.3) {
    warnings.push({ page: 1, message: `The image was tilted ${outcome.skewAngle}° and was straightened before OCR.` })
  }
  if (outcome.confidence < 75) {
    warnings.push({ page: 1, message: `OCR confidence is low (${Math.round(outcome.confidence)}%). Please compare the text with the original image.` })
  }
  if (outcome.lowWords > 0) {
    warnings.push({ message: `${outcome.lowWords} word(s) recognised with low OCR confidence are highlighted in yellow — please verify them.` })
  }
  progress({ message: 'Building editable document…' })
  const stats = { tables: 0, images: 0 }
  const html = assembleHtml([outcome.layout], source, 'image-ocr', stats)
  return {
    html,
    method: 'image-ocr',
    pageCount: 1,
    ocrPages: [1],
    ocrConfidence: Math.round(outcome.confidence),
    lowConfidenceWords: outcome.lowWords,
    tableCount: stats.tables,
    imageCount: stats.images,
    characterCount,
    warnings,
    sourceFileName: source.fileName,
    convertedAt: new Date().toISOString(),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DOCX / text
// ─────────────────────────────────────────────────────────────────────────────

async function convertDocx(bytes: Uint8Array, source: ConversionSource, opts: ConversionOptions): Promise<ConversionResult> {
  opts.onProgress?.({ message: 'Reading Word document…' })
  const mammoth: any = await import('mammoth')
  let result: { value: string; messages: { type: string; message: string }[] }
  try {
    result = await (mammoth.default || mammoth).convertToHtml({ arrayBuffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) })
  } catch (err: any) {
    throw new DocumentConversionError(`Could not read the Word document: ${err?.message || err}`)
  }
  const doc = new DOMParser().parseFromString(`<div>${result.value}</div>`, 'text/html')
  const root = doc.body.firstElementChild as HTMLElement
  root.querySelectorAll('table').forEach(t => {
    t.setAttribute('style', 'border-collapse:collapse;width:100%;margin:6pt 0;')
    t.querySelectorAll('td,th').forEach(c => c.setAttribute('style', 'border:1px solid #000;padding:2pt 4pt;vertical-align:top;'))
  })
  root.querySelectorAll('p').forEach(p => {
    if (!p.getAttribute('style')) p.setAttribute('style', 'margin:0 0 6pt 0;')
  })
  const text = root.textContent || ''
  if (!text.trim() && !root.querySelector('img')) throw new DocumentConversionError('The Word document contains no readable content.')
  const warnings = result.messages
    .filter(m => m.type === 'warning')
    .slice(0, 5)
    .map(m => ({ message: `Word import: ${m.message}` }))
  return {
    html: `<div data-converted-from="${esc(source.fileName)}" data-conversion-method="docx">${root.innerHTML}</div>`,
    method: 'docx',
    pageCount: 1,
    ocrPages: [],
    lowConfidenceWords: 0,
    tableCount: root.querySelectorAll('table').length,
    imageCount: root.querySelectorAll('img').length,
    characterCount: text.replace(/\s/g, '').length,
    warnings,
    sourceFileName: source.fileName,
    convertedAt: new Date().toISOString(),
  }
}

function convertText(bytes: Uint8Array, source: ConversionSource): ConversionResult {
  const text = new TextDecoder('utf-8').decode(bytes)
  if (!text.trim()) throw new DocumentConversionError('The text file is empty.')
  const html = text
    .split(/\r?\n/)
    .map(l => `<p style="margin:0;white-space:pre-wrap;">${l ? esc(l) : '&nbsp;'}</p>`)
    .join('')
  return {
    html: `<div data-converted-from="${esc(source.fileName)}" data-conversion-method="text">${html}</div>`,
    method: 'text',
    pageCount: 1,
    ocrPages: [],
    lowConfidenceWords: 0,
    tableCount: 0,
    imageCount: 0,
    characterCount: text.replace(/\s/g, '').length,
    warnings: [],
    sourceFileName: source.fileName,
    convertedAt: new Date().toISOString(),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

export async function convertDocumentToEditableHtml(
  source: ConversionSource,
  opts: ConversionOptions = {}
): Promise<ConversionResult> {
  if (!source.dataUrl) {
    throw new DocumentConversionError('The original file content is not available (no file data stored). Please re-upload the original file.')
  }
  const bytes = await dataUrlToBytes(source.dataUrl)
  if (bytes.length === 0) throw new DocumentConversionError('The attached file is empty.')
  throwIfAborted(opts.signal)

  switch (detectKind(source, bytes)) {
    case 'pdf':
      return convertPdf(bytes, source, opts)
    case 'image':
      return convertImage(source, opts)
    case 'docx':
      return convertDocx(bytes, source, opts)
    case 'text':
      return convertText(bytes, source)
    case 'doc':
      throw new DocumentConversionError('Legacy .doc (Word 97-2003) files cannot be converted in the browser. Please upload the PDF, DOCX or a scanned image instead.')
    default:
      throw new DocumentConversionError(`Unsupported file type for conversion: ${source.fileName}. Supported: PDF, JPG, PNG, WEBP, DOCX, TXT.`)
  }
}

/** Removes the yellow low-confidence OCR highlights while keeping the text. */
export function stripOcrHighlights(html: string): string {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
  doc.querySelectorAll('[data-ocr-low]').forEach(el => el.replaceWith(...Array.from(el.childNodes)))
  return (doc.body.firstElementChild as HTMLElement).innerHTML
}
