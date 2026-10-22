'use client'

import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  ParagraphChild,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx'

/**
 * Converts the Word editor's HTML into a genuine .docx (Office Open XML) file.
 * Handles paragraphs/headings, inline formatting, links, tables (incl. row/col
 * spans, shading and column widths), images, lists and page breaks.
 */

// A4 with 2 cm margins
export const PAGE_WIDTH_TWIP = 11906
export const PAGE_HEIGHT_TWIP = 16838
export const MARGIN_TWIP = 1134
export const CONTENT_WIDTH_TWIP = PAGE_WIDTH_TWIP - 2 * MARGIN_TWIP
export const CONTENT_WIDTH_PX = Math.round((CONTENT_WIDTH_TWIP / 1440) * 96)

interface RunFormat {
  bold?: boolean
  italics?: boolean
  underline?: boolean
  strike?: boolean
  color?: string
  sizePt?: number
  font?: string
  highlight?: boolean
}

type Block = Paragraph | Table

const BLOCK_TAGS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TABLE', 'UL', 'OL', 'LI', 'HR', 'BLOCKQUOTE', 'PRE', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER'])
const HEADING_SIZES: Record<string, number> = { H1: 20, H2: 16, H3: 13, H4: 12, H5: 11, H6: 10 }

function cssColorToHex(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  const v = value.trim().toLowerCase()
  if (v.startsWith('#')) {
    const h = v.slice(1)
    if (h.length === 3) return h.split('').map(c => c + c).join('').toUpperCase()
    if (h.length === 6) return h.toUpperCase()
    return undefined
  }
  const m = v.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/)
  if (m) {
    if (m[4] !== undefined && parseFloat(m[4]) === 0) return undefined
    return [m[1], m[2], m[3]].map(n => parseInt(n, 10).toString(16).padStart(2, '0')).join('').toUpperCase()
  }
  const named: Record<string, string> = { black: '000000', white: 'FFFFFF', red: 'FF0000', blue: '0000FF', green: '008000', yellow: 'FFFF00', gray: '808080', grey: '808080' }
  return named[v]
}

function cssSizeToPt(value: string | null | undefined): number | undefined {
  if (!value) return undefined
  const m = value.trim().match(/^([\d.]+)(pt|px|em|rem|%)?$/)
  if (!m) return undefined
  const n = parseFloat(m[1])
  switch (m[2]) {
    case 'px':
      return n * 0.75
    case 'em':
    case 'rem':
      return n * 11
    case '%':
      return (n / 100) * 11
    default:
      return n
  }
}

// <font size="1..7"> produced by document.execCommand('fontSize')
const FONT_TAG_SIZES: Record<string, number> = { '1': 8, '2': 10, '3': 12, '4': 14, '5': 18, '6': 24, '7': 36 }

function formatFromElement(el: HTMLElement, base: RunFormat): RunFormat {
  const f: RunFormat = { ...base }
  const tag = el.tagName
  if (tag === 'B' || tag === 'STRONG' || HEADING_SIZES[tag]) f.bold = true
  if (tag === 'I' || tag === 'EM') f.italics = true
  if (tag === 'U') f.underline = true
  if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') f.strike = true
  if (tag === 'A') {
    f.color = f.color || '0563C1'
    f.underline = true
  }
  if (tag === 'FONT') {
    const color = cssColorToHex(el.getAttribute('color'))
    if (color) f.color = color
    const face = el.getAttribute('face')
    if (face) f.font = face
    const size = el.getAttribute('size')
    if (size && FONT_TAG_SIZES[size]) f.sizePt = FONT_TAG_SIZES[size]
  }
  if (HEADING_SIZES[tag] && !el.style.fontSize) f.sizePt = HEADING_SIZES[tag]
  if (el.hasAttribute('data-ocr-low')) return f // review highlight is editor-only

  const s = el.style
  if (s.fontWeight) f.bold = s.fontWeight === 'bold' || s.fontWeight === 'bolder' || parseInt(s.fontWeight, 10) >= 600
  if (s.fontStyle) f.italics = s.fontStyle === 'italic' || s.fontStyle === 'oblique'
  const deco = s.textDecoration || s.textDecorationLine
  if (deco) {
    if (deco.includes('underline')) f.underline = true
    if (deco.includes('line-through')) f.strike = true
  }
  const color = cssColorToHex(s.color)
  if (color) f.color = color
  const size = cssSizeToPt(s.fontSize)
  if (size) f.sizePt = size
  if (s.fontFamily) f.font = s.fontFamily.split(',')[0].replace(/['"]/g, '').trim()
  return f
}

function textRun(text: string, f: RunFormat, extra: Record<string, unknown> = {}): TextRun {
  return new TextRun({
    text,
    bold: f.bold,
    italics: f.italics,
    underline: f.underline ? {} : undefined,
    strike: f.strike,
    color: f.color,
    size: f.sizePt ? Math.round(f.sizePt * 2) : undefined,
    font: f.font,
    ...extra,
  })
}

function alignmentOf(el: HTMLElement | null): (typeof AlignmentType)[keyof typeof AlignmentType] | undefined {
  const a = (el?.style.textAlign || el?.getAttribute('align') || '').toLowerCase()
  if (a === 'center') return AlignmentType.CENTER
  if (a === 'right') return AlignmentType.RIGHT
  if (a === 'justify') return AlignmentType.JUSTIFIED
  if (a === 'left') return AlignmentType.LEFT
  return undefined
}

function ptToTwip(pt: number): number {
  return Math.round(pt * 20)
}

class DocxBuilder {
  private listInstance = 0
  private images = new Map<HTMLImageElement, { data: Uint8Array; type: 'png' | 'jpg' | 'gif' | 'bmp'; w: number; h: number }>()

  /** Decodes every <img> up front (ImageRun needs bytes and pixel size). */
  async prepareImages(root: HTMLElement) {
    const imgs = Array.from(root.querySelectorAll('img'))
    await Promise.all(
      imgs.map(async img => {
        try {
          const src = img.getAttribute('src') || ''
          if (!src) return
          const el = new Image()
          el.crossOrigin = 'anonymous'
          await new Promise<void>((res, rej) => {
            el.onload = () => res()
            el.onerror = () => rej(new Error('image load failed'))
            el.src = src
          })
          let type: 'png' | 'jpg' | 'gif' | 'bmp' | null = null
          if (/^data:image\/png/i.test(src)) type = 'png'
          else if (/^data:image\/jpe?g/i.test(src)) type = 'jpg'
          let data: Uint8Array
          if (type) {
            data = new Uint8Array(await (await fetch(src)).arrayBuffer())
          } else {
            // Re-encode anything else (webp, svg, remote) as PNG
            const c = document.createElement('canvas')
            c.width = el.naturalWidth
            c.height = el.naturalHeight
            c.getContext('2d')!.drawImage(el, 0, 0)
            data = new Uint8Array(await (await fetch(c.toDataURL('image/png'))).arrayBuffer())
            type = 'png'
          }
          const wPt = parseFloat(img.getAttribute('data-width-pt') || '') || cssSizeToPt(img.style.width) || 0
          const hPt = parseFloat(img.getAttribute('data-height-pt') || '') || cssSizeToPt(img.style.height) || 0
          let w = wPt ? wPt / 0.75 : img.width || el.naturalWidth
          let h = hPt ? hPt / 0.75 : img.height || el.naturalHeight * (w / el.naturalWidth)
          if (w > CONTENT_WIDTH_PX) {
            h = h * (CONTENT_WIDTH_PX / w)
            w = CONTENT_WIDTH_PX
          }
          this.images.set(img, { data, type, w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) })
        } catch {
          /* unreadable image: skipped */
        }
      })
    )
  }

  private inlineChildren(node: Node, f: RunFormat, out: ParagraphChild[]) {
    node.childNodes.forEach(child => {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = (child.textContent || '').replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ')
        if (text) out.push(textRun(text, f))
        return
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return
      const el = child as HTMLElement
      if (el.tagName === 'BR') {
        out.push(new TextRun({ text: '', break: 1 }))
        return
      }
      if (el.tagName === 'IMG') {
        const img = this.images.get(el as HTMLImageElement)
        if (img) out.push(new ImageRun({ type: img.type, data: img.data, transformation: { width: img.w, height: img.h } }))
        return
      }
      const nf = formatFromElement(el, f)
      if (el.tagName === 'A' && el.getAttribute('href')) {
        const kids: ParagraphChild[] = []
        this.inlineChildren(el, nf, kids)
        out.push(new ExternalHyperlink({ link: el.getAttribute('href')!, children: kids as any }))
        return
      }
      this.inlineChildren(el, nf, out)
    })
  }

  private paragraphFrom(el: HTMLElement, f: RunFormat, extra: Record<string, unknown> = {}): Paragraph {
    const children: ParagraphChild[] = []
    this.inlineChildren(el, f, children)
    const s = el.style
    const mt = cssSizeToPt(s.marginTop) ?? (s.margin ? cssSizeToPt(s.margin.split(/\s+/)[0]) : undefined)
    const ml = cssSizeToPt(s.marginLeft)
    const ti = cssSizeToPt(s.textIndent)
    return new Paragraph({
      children,
      alignment: alignmentOf(el),
      spacing: { before: mt !== undefined ? ptToTwip(mt) : 0, after: el.tagName === 'P' && mt === undefined ? 120 : 0 },
      indent: ml || ti ? { left: ml ? ptToTwip(ml) : undefined, firstLine: ti && ti > 0 ? ptToTwip(ti) : undefined, hanging: ti && ti < 0 ? ptToTwip(-ti) : undefined } : undefined,
      ...extra,
    })
  }

  private hasBlockChildren(el: HTMLElement): boolean {
    return Array.from(el.children).some(c => BLOCK_TAGS.has(c.tagName))
  }

  blocks(el: HTMLElement, f: RunFormat, pendingBreak = { value: false }): Block[] {
    const out: Block[] = []
    let inlineBuffer: Node[] = []

    const flushInline = () => {
      if (!inlineBuffer.length) return
      const wrapper = document.createElement('p')
      wrapper.style.cssText = 'margin:0'
      const align = el.style.textAlign
      if (align) wrapper.style.textAlign = align
      inlineBuffer.forEach(n => wrapper.appendChild(n.cloneNode(true)))
      inlineBuffer = []
      if (!(wrapper.textContent || '').trim() && !wrapper.querySelector('img')) return
      out.push(this.paragraphFrom(wrapper, f, this.takeBreak(pendingBreak)))
    }

    el.childNodes.forEach(child => {
      if (child.nodeType !== Node.ELEMENT_NODE) {
        if (child.nodeType === Node.TEXT_NODE) inlineBuffer.push(child)
        return
      }
      const c = child as HTMLElement
      if (!BLOCK_TAGS.has(c.tagName)) {
        inlineBuffer.push(c)
        return
      }
      flushInline()
      const nf = formatFromElement(c, f)

      if (c.hasAttribute('data-page-break') || /page-break-before:\s*always|break-before:\s*page/.test(c.getAttribute('style') || '')) {
        pendingBreak.value = true
        if (!c.childNodes.length) return
      }

      switch (c.tagName) {
        case 'TABLE':
          out.push(this.table(c as HTMLTableElement, nf))
          return
        case 'HR':
          out.push(new Paragraph({ children: [], border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000', space: 1 } }, ...this.takeBreak(pendingBreak) }))
          return
        case 'UL':
        case 'OL': {
          const ordered = c.tagName === 'OL'
          const instance = ++this.listInstance
          Array.from(c.children).forEach(li => {
            if (li.tagName !== 'LI') return
            const liEl = li as HTMLElement
            out.push(
              this.paragraphFrom(liEl, formatFromElement(liEl, nf), {
                ...(ordered ? { numbering: { reference: 'ordered-list', level: 0, instance } } : { bullet: { level: 0 } }),
                ...this.takeBreak(pendingBreak),
              })
            )
          })
          return
        }
        default:
          if (this.hasBlockChildren(c)) out.push(...this.blocks(c, nf, pendingBreak))
          else if ((c.textContent || '').trim() || c.querySelector('img')) out.push(this.paragraphFrom(c, nf, this.takeBreak(pendingBreak)))
          else if (c.tagName === 'P') out.push(new Paragraph({ children: [], ...this.takeBreak(pendingBreak) }))
      }
    })
    flushInline()
    return out
  }

  private takeBreak(flag: { value: boolean }): { pageBreakBefore?: boolean } {
    if (!flag.value) return {}
    flag.value = false
    return { pageBreakBefore: true }
  }

  private table(t: HTMLTableElement, f: RunFormat): Table {
    const rows = Array.from(t.rows)
    const colCount = Math.max(1, ...rows.map(r => Array.from(r.cells).reduce((n, c) => n + (c.colSpan || 1), 0)))
    const widthPct = parseFloat(t.style.width) || 100
    const tableTwip = Math.round((CONTENT_WIDTH_TWIP * Math.min(widthPct, 100)) / 100)
    const cols = Array.from(t.querySelectorAll(':scope > colgroup > col')) as HTMLElement[]
    let columnWidths: number[]
    if (cols.length === colCount) {
      const pcts = cols.map(c => parseFloat(c.style.width) || 100 / colCount)
      const sum = pcts.reduce((a, b) => a + b, 0)
      columnWidths = pcts.map(p => Math.max(200, Math.round((tableTwip * p) / sum)))
    } else {
      columnWidths = Array.from({ length: colCount }, () => Math.round(tableTwip / colCount))
    }

    // Track grid columns occupied by rowspans to compute each cell's width
    const occupied: number[] = new Array(colCount).fill(0)
    const tableRows = rows
      .map(row => {
        const cells: TableCell[] = []
        let col = 0
        Array.from(row.cells).forEach(cell => {
          while (col < colCount && occupied[col] > 0) col++
          const span = cell.colSpan || 1
          const rs = cell.rowSpan || 1
          const width = columnWidths.slice(col, col + span).reduce((a, b) => a + b, 0) || tableTwip / colCount
          for (let k = col; k < Math.min(colCount, col + span); k++) occupied[k] = Math.max(occupied[k], rs)
          col += span
          const cf = formatFromElement(cell, f)
          let children: Block[] = this.blocks(cell, cf)
          if (!children.length) children = [new Paragraph({ children: [] })]
          // A table cell must end with a paragraph
          if (!(children[children.length - 1] instanceof Paragraph)) children.push(new Paragraph({ children: [] }))
          const bg = cssColorToHex(cell.style.backgroundColor)
          cells.push(
            new TableCell({
              children,
              columnSpan: span > 1 ? span : undefined,
              rowSpan: rs > 1 ? rs : undefined,
              width: { size: Math.round(width), type: WidthType.DXA },
              shading: bg && bg !== 'FFFFFF' ? { type: ShadingType.CLEAR, color: 'auto', fill: bg } : undefined,
              verticalAlign: cell.style.verticalAlign === 'middle' ? VerticalAlign.CENTER : VerticalAlign.TOP,
              margins: { top: 40, bottom: 40, left: 80, right: 80 },
            })
          )
        })
        for (let k = 0; k < colCount; k++) if (occupied[k] > 0) occupied[k]--
        return cells.length ? new TableRow({ children: cells }) : null
      })
      .filter((r): r is TableRow => r !== null)

    const border = { style: BorderStyle.SINGLE, size: 4, color: '000000' }
    return new Table({
      rows: tableRows.length ? tableRows : [new TableRow({ children: [new TableCell({ children: [new Paragraph({ children: [] })] })] })],
      width: { size: tableTwip, type: WidthType.DXA },
      columnWidths,
      borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    })
  }
}

export { DocxBuilder }

export async function htmlToBlocks(html: string): Promise<(Paragraph | Table)[]> {
  const container = document.createElement('div')
  container.innerHTML = html
  const builder = new DocxBuilder()
  await builder.prepareImages(container)
  return builder.blocks(container, {})
}

export async function htmlToDocxBlob(html: string, title: string): Promise<Blob> {
  const container = document.createElement('div')
  container.innerHTML = html
  const builder = new DocxBuilder()
  await builder.prepareImages(container)
  const children = builder.blocks(container, {})

  const doc = new Document({
    title,
    creator: 'Tender FMS',
    styles: {
      default: { document: { run: { font: 'Calibri', size: 22 } } },
    },
    numbering: {
      config: [
        {
          reference: 'ordered-list',
          levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.START, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_WIDTH_TWIP, height: PAGE_HEIGHT_TWIP },
            margin: { top: MARGIN_TWIP, bottom: MARGIN_TWIP, left: MARGIN_TWIP, right: MARGIN_TWIP },
          },
        },
        children: children.length ? children : [new Paragraph({ children: [] })],
      },
    ],
  })
  return Packer.toBlob(doc)
}

export async function downloadHtmlAsDocx(html: string, title: string, fileName: string): Promise<void> {
  const blob = await htmlToDocxBlob(html, title)
  const base = fileName.replace(/\.[^/.]+$/, '') || 'document'
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${base}.docx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
