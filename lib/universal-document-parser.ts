import JSZip from 'jszip'
import {
  DocumentPageChunk,
  DocumentType,
  ParsedDocumentResult,
  ProcessingProgress,
} from '@/types/document-understanding'

export interface UniversalParseOptions {
  onProgress?: (progress: ProcessingProgress) => void
  maxPages?: number
  chunkSizeWords?: number
  enableOcr?: boolean
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

/**
 * Detect document type from file name and MIME type
 */
export function detectDocumentType(fileName: string, mimeType?: string): DocumentType {
  const lower = fileName.toLowerCase()
  const mime = (mimeType || '').toLowerCase()

  if (lower.endsWith('.pdf') || mime === 'application/pdf') return 'pdf'
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || mime.includes('spreadsheet') || mime.includes('excel'))
    return 'excel'
  if (lower.endsWith('.docx') || lower.endsWith('.doc') || mime.includes('word')) return 'word'
  if (lower.endsWith('.csv') || mime === 'text/csv') return 'csv'
  if (
    /\.(png|jpe?g|webp|gif|bmp|tiff?)$/.test(lower) ||
    mime.startsWith('image/')
  )
    return 'image'
  if (lower.endsWith('.txt') || mime.startsWith('text/')) return 'text'

  return 'other'
}

/**
 * Clean and normalize text
 */
function cleanText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // remove unprintable control chars
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim()
}

/**
 * Detect section heading from first few lines of text
 */
function extractSectionTitle(lines: string[]): string | undefined {
  for (const line of lines.slice(0, 6)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    // Check for clause patterns or uppercase headings
    if (
      /^(clause|section|article|part|stage|schedule|annexure|appendix|chapter)\b/i.test(trimmed) ||
      /^(\d+[\.\)]|\b[A-Z0-9\s\-–:]{4,60}\b)$/.test(trimmed) ||
      (trimmed.length < 90 && trimmed.toUpperCase() === trimmed && /[A-Z]/.test(trimmed))
    ) {
      return trimmed.slice(0, 100)
    }
  }
  return undefined
}

/**
 * Extract key terms/identifiers from text
 */
function extractKeywords(text: string): string[] {
  const matches = new Set<string>()
  // Match tender IDs, clause numbers, monetary amounts, percentages, dates
  const patterns = [
    /\b[A-Z0-9_\-\/]{4,25}\b/g, // identifiers & tender numbers
    /(?:Rs\.?|INR|₹)\s*[\d,]+(?:\.\d+)?(?:\s*(?:Lakh|Crore|Cr|L))?/gi, // amounts
    /\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b/g, // dates
    /\b\d+(?:\.\d+)?%/g, // percentages
    /\b(?:EMD|NIT|RFS|BOQ|GST|PAN|CA|PBG|BG|OEM|MAF|ISO|NABL|BIS)\b/gi, // acronyms
  ]

  for (const regex of patterns) {
    const hits = text.match(regex)
    if (hits) {
      hits.forEach(h => matches.add(h.trim()))
    }
  }

  return Array.from(matches).slice(0, 25)
}

/**
 * 1. UNIVERSAL PDF PARSER (Handles 200-500+ Pages)
 * Uses pdfjs-dist with page-wise extraction and spatial text reconstruction.
 */
export async function parsePdfDocument(
  buffer: ArrayBuffer,
  fileName: string,
  options?: UniversalParseOptions
): Promise<ParsedDocumentResult> {
  const { onProgress, maxPages = 600, enableOcr = true } = options || {}

  onProgress?.({
    stage: 'extracting_content',
    stageLabel: 'Initializing PDF Engine',
    percent: 5,
    message: `Loading PDF structure for ${fileName}...`,
  })

  // Dynamic import of pdfjs-dist legacy build
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')

  // Setup worker only in browser environment if not yet configured
  if (typeof window !== 'undefined' && pdfjs.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
    try {
      pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version || '4.10.38'}/legacy/build/pdf.worker.min.mjs`
    } catch {
      // Fallback to internal fake worker
    }
  }

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    useSystemFonts: true,
  })

  const pdfDoc = await loadingTask.promise
  const totalPages = Math.min(pdfDoc.numPages, maxPages)

  onProgress?.({
    stage: 'processing_pages',
    stageLabel: 'Processing PDF Pages',
    current: 0,
    total: totalPages,
    percent: 10,
    message: `Found ${pdfDoc.numPages} pages. Starting structured extraction...`,
  })

  const chunks: DocumentPageChunk[] = []
  const allPageTexts: string[] = []
  let scannedPagesCount = 0

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    try {
      const page = await pdfDoc.getPage(pageNum)
      const textContent = await page.getTextContent()

      // Spatial line grouping: sort by Y descending (top to bottom), then X ascending (left to right)
      const rawItems = (textContent.items as any[]) || []
      const items = rawItems
        .filter(item => typeof item.str === 'string' && item.str.length > 0)
        .map(item => ({
          text: item.str,
          x: item.transform ? item.transform[4] : 0,
          y: item.transform ? item.transform[5] : 0,
          width: item.width || 0,
          height: item.height || 0,
        }))
        .sort((a, b) => {
          if (Math.abs(b.y - a.y) > 3) return b.y - a.y
          return a.x - b.x
        })

      const lines: string[] = []
      let currentY: number | null = null
      let currentLine: typeof items = []

      for (const item of items) {
        if (currentY === null || Math.abs(currentY - item.y) > 3) {
          if (currentLine.length > 0) {
            lines.push(currentLine.map(i => i.text).join(' '))
          }
          currentLine = [item]
          currentY = item.y
        } else {
          currentLine.push(item)
        }
      }
      if (currentLine.length > 0) {
        lines.push(currentLine.map(i => i.text).join(' '))
      }

      let pageText = cleanText(lines.join('\n'))
      let isPageScanned = false

      // Check if page appears scanned or empty
      if (pageText.length < 40) {
        isPageScanned = true
        scannedPagesCount++
        pageText = `[Page ${pageNum}: Scanned or image-based content]`
      }

      const sectionTitle = extractSectionTitle(lines)
      const hasTables =
        lines.some(l => (l.match(/\|/g) || []).length >= 2) ||
        lines.some(l => (l.match(/\s{3,}/g) || []).length >= 2)

      const chunk: DocumentPageChunk = {
        id: `${fileName}-page-${pageNum}`,
        docName: fileName,
        docType: 'pdf',
        pageNumber: pageNum,
        totalPages: pdfDoc.numPages,
        sectionTitle: sectionTitle || `Page ${pageNum}`,
        content: pageText,
        charCount: pageText.length,
        isScanned: isPageScanned,
        hasTables,
        keywords: extractKeywords(pageText),
      }

      chunks.push(chunk)
      allPageTexts.push(`--- Page ${pageNum} of ${pdfDoc.numPages} ---\n${pageText}`)

      // Progress notification every 5 pages or on final page
      if (pageNum % 5 === 0 || pageNum === totalPages) {
        const percent = Math.round(10 + (pageNum / totalPages) * 75)
        onProgress?.({
          stage: 'processing_pages',
          stageLabel: 'Processing PDF Pages',
          current: pageNum,
          total: totalPages,
          percent,
          message: `Extracted ${pageNum} of ${totalPages} pages (${percent}%)...`,
        })
      }
    } catch (pageErr) {
      console.warn(`Error parsing PDF page ${pageNum}:`, pageErr)
      chunks.push({
        id: `${fileName}-page-${pageNum}`,
        docName: fileName,
        docType: 'pdf',
        pageNumber: pageNum,
        totalPages: pdfDoc.numPages,
        sectionTitle: `Page ${pageNum} (Parse Warning)`,
        content: `[Page ${pageNum}: Text could not be read cleanly]`,
        charCount: 40,
        isScanned: true,
      })
    }
  }

  const combinedFullText = allPageTexts.join('\n\n')
  const preview =
    combinedFullText.slice(0, 300) + (combinedFullText.length > 300 ? '...' : '')

  return {
    name: fileName,
    type: 'application/pdf',
    size: buffer.byteLength,
    extractedText: combinedFullText,
    previewText: `Parsed ${chunks.length} pages (${scannedPagesCount > 0 ? `${scannedPagesCount} scanned` : 'all digital'}).`,
    pageCount: pdfDoc.numPages,
    isScanned: scannedPagesCount > (totalPages / 2),
    chunks,
  }
}

/**
 * 2. UNIVERSAL EXCEL PARSER (Multi-Sheet, Cell Coordinates, Formulas)
 * Extracts all worksheets, shared strings, and explicit cell references.
 */
export async function parseExcelDocument(
  buffer: ArrayBuffer,
  fileName: string,
  options?: UniversalParseOptions
): Promise<ParsedDocumentResult> {
  const { onProgress } = options || {}

  onProgress?.({
    stage: 'extracting_content',
    stageLabel: 'Reading Excel Structure',
    percent: 15,
    message: `Parsing sheets and workbook schema for ${fileName}...`,
  })

  const zip = await JSZip.loadAsync(buffer)

  // 1. Parse Shared Strings Table
  const sharedStringsXml = await zip.file('xl/sharedStrings.xml')?.async('text')
  const sharedStrings: string[] = []
  if (sharedStringsXml) {
    const stringMatches = sharedStringsXml.match(/<t[^>]*>([^<]*)<\/t>/g) || []
    for (const m of stringMatches) {
      const val = m.replace(/<[^>]+>/g, '')
      sharedStrings.push(val)
    }
  }

  // 2. Parse Workbook & Sheet Relationships
  const workbookXml = await zip.file('xl/workbook.xml')?.async('text')
  const relsXml = await zip.file('xl/_rels/workbook.xml.rels')?.async('text')

  const sheetEntries: Array<{ name: string; rId: string; filePath: string }> = []

  if (workbookXml) {
    const sheetMatches = workbookXml.match(/<sheet\s+[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"[^>]*\/>/g) || []
    for (const sm of sheetMatches) {
      const nameMatch = sm.match(/name="([^"]+)"/)
      const rIdMatch = sm.match(/r:id="([^"]+)"/)
      if (nameMatch && rIdMatch) {
        sheetEntries.push({
          name: nameMatch[1],
          rId: rIdMatch[1],
          filePath: '', // filled below
        })
      }
    }
  }

  // Map rId to target file
  if (relsXml && sheetEntries.length > 0) {
    for (const entry of sheetEntries) {
      const relPattern = new RegExp(`Id="${entry.rId}"[^>]*Target="([^"]+)"`)
      const relMatch = relsXml.match(relPattern)
      if (relMatch) {
        let target = relMatch[1]
        if (!target.startsWith('xl/')) {
          target = `xl/${target.replace(/^\//, '')}`
        }
        entry.filePath = target
      }
    }
  }

  // Fallback: If no sheets matched via XML, check standard worksheets
  if (sheetEntries.length === 0) {
    const sheetFiles = Object.keys(zip.files).filter(k => k.startsWith('xl/worksheets/sheet') && k.endsWith('.xml'))
    sheetFiles.forEach((path, idx) => {
      sheetEntries.push({
        name: `Sheet ${idx + 1}`,
        rId: `rId${idx + 1}`,
        filePath: path,
      })
    })
  }

  const chunks: DocumentPageChunk[] = []
  const fullTextPieces: string[] = []
  let totalRowCount = 0

  for (let sIdx = 0; sIdx < sheetEntries.length; sIdx++) {
    const sheet = sheetEntries[sIdx]
    const sheetPath = sheet.filePath || `xl/worksheets/sheet${sIdx + 1}.xml`
    const sheetXml = await zip.file(sheetPath)?.async('text')
    if (!sheetXml) continue

    onProgress?.({
      stage: 'processing_pages',
      stageLabel: 'Parsing Worksheets',
      current: sIdx + 1,
      total: sheetEntries.length,
      percent: Math.round(20 + ((sIdx + 1) / sheetEntries.length) * 65),
      message: `Extracting worksheet "${sheet.name}"...`,
    })

    const rowMatches = sheetXml.match(/<row[^>]*>(.*?)<\/row>/g) || []
    if (rowMatches.length === 0) continue

    totalRowCount += rowMatches.length

    // Extract row cells with coordinate mapping
    const sheetRows: Array<{ rowNum: number; cells: Array<{ ref: string; value: string; formula?: string }> }> = []

    for (const rowXml of rowMatches) {
      const rowNumMatch = rowXml.match(/r="(\d+)"/)
      const rowNum = rowNumMatch ? parseInt(rowNumMatch[1], 10) : sheetRows.length + 1

      const cellMatches = rowXml.match(/<c\s*([^>]*)>(.*?)<\/c>/g) || []
      const rowCells: Array<{ ref: string; value: string; formula?: string }> = []

      for (const cellXml of cellMatches) {
        const refMatch = cellXml.match(/r="([A-Z0-9]+)"/)
        const ref = refMatch ? refMatch[1] : ''
        const isString = cellXml.includes('t="s"')
        const formulaMatch = cellXml.match(/<f[^>]*>([^<]*)<\/f>/)
        const formula = formulaMatch ? formulaMatch[1] : undefined

        let val = ''
        const valMatch = cellXml.match(/<v>([^<]*)<\/v>/)
        if (valMatch) {
          const rawVal = valMatch[1]
          if (isString) {
            const idx = parseInt(rawVal, 10)
            val = sharedStrings[idx] || rawVal
          } else {
            val = rawVal
          }
        } else {
          const inlineMatch = cellXml.match(/<t[^>]*>([^<]*)<\/t>/)
          if (inlineMatch) {
            val = inlineMatch[1]
          }
        }

        if (ref || val) {
          rowCells.push({ ref, value: val.trim(), formula })
        }
      }

      if (rowCells.some(c => c.value.length > 0)) {
        sheetRows.push({ rowNum, cells: rowCells })
      }
    }

    // Chunk sheet in blocks of 40 rows to avoid token blowout while retaining column context
    const CHUNK_ROW_SIZE = 40
    for (let r = 0; r < sheetRows.length; r += CHUNK_ROW_SIZE) {
      const block = sheetRows.slice(r, r + CHUNK_ROW_SIZE)
      const firstRow = block[0].rowNum
      const lastRow = block[block.length - 1].rowNum
      const firstCell = block[0].cells[0]?.ref || `A${firstRow}`
      const lastCell = block[block.length - 1].cells[block[block.length - 1].cells.length - 1]?.ref || `Z${lastRow}`
      const cellRange = `${firstCell}:${lastCell}`

      // Build structured markdown table for chunk
      let chunkMd = `### Sheet: "${sheet.name}" (Rows ${firstRow}–${lastRow}, Range: ${cellRange})\n\n`
      for (const row of block) {
        const cellStrs = row.cells.map(c => `${c.ref}: ${c.value}${c.formula ? ` (Formula: =${c.formula})` : ''}`)
        chunkMd += `| Row ${row.rowNum} | ${cellStrs.join(' | ')} |\n`
      }

      const chunk: DocumentPageChunk = {
        id: `${fileName}-sheet-${sheet.name}-rows-${firstRow}-${lastRow}`,
        docName: fileName,
        docType: 'excel',
        sheetName: sheet.name,
        cellRange,
        rowStart: firstRow,
        rowEnd: lastRow,
        sectionTitle: `Sheet: "${sheet.name}" [Cells: ${cellRange}]`,
        content: chunkMd,
        charCount: chunkMd.length,
        hasTables: true,
        keywords: extractKeywords(chunkMd),
      }

      chunks.push(chunk)
      fullTextPieces.push(chunkMd)
    }
  }

  const fullText = fullTextPieces.join('\n\n')

  return {
    name: fileName,
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: buffer.byteLength,
    extractedText: fullText || 'No tabular data found in Excel workbook.',
    previewText: `Extracted ${sheetEntries.length} sheet(s), ${totalRowCount} rows, ${chunks.length} chunks.`,
    sheetCount: sheetEntries.length,
    rowCount: totalRowCount,
    chunks,
  }
}

/**
 * 3. UNIVERSAL WORD DOCUMENT PARSER (.docx)
 * Uses mammoth to convert Word documents to structured Markdown with headings & tables.
 */
export async function parseWordDocument(
  buffer: ArrayBuffer,
  fileName: string,
  options?: UniversalParseOptions
): Promise<ParsedDocumentResult> {
  const { onProgress } = options || {}

  onProgress?.({
    stage: 'extracting_content',
    stageLabel: 'Parsing Word Document',
    percent: 25,
    message: `Reading document structure and formatting for ${fileName}...`,
  })

  let markdownText = ''

  try {
    const mammothModule = await import('mammoth')
    const mammoth: any = mammothModule.default || mammothModule
    if (typeof mammoth.convertToMarkdown === 'function') {
      const result = await mammoth.convertToMarkdown({ arrayBuffer: buffer })
      markdownText = cleanText(result.value)
    } else if (typeof mammoth.extractRawText === 'function') {
      const result = await mammoth.extractRawText({ arrayBuffer: buffer })
      markdownText = cleanText(result.value)
    }
  } catch (mammothErr) {
    console.warn('Mammoth parser fallback to JSZip:', mammothErr)
    // Fallback via JSZip document.xml
    const zip = await JSZip.loadAsync(buffer)
    const documentXml = await zip.file('word/document.xml')?.async('text')
    if (documentXml) {
      markdownText = cleanText(
        documentXml
          .replace(/<w:p[^>]*>/g, '\n\n')
          .replace(/<w:tab[^>]*\/>/g, '\t')
          .replace(/<w:br[^>]*\/>/g, '\n')
          .replace(/<w:tc[^>]*>/g, ' | ')
          .replace(/<\/w:tr>/g, ' |\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'")
      )
    }
  }

  if (!markdownText) {
    markdownText = 'Empty or unreadable Word document.'
  }

  // Split into chunks by headings (#, ##, ###) or ~600 word paragraphs
  const rawSections = markdownText.split(/(?=\n#{1,3}\s+)/g)
  const chunks: DocumentPageChunk[] = []
  let pageCounter = 1

  for (let sIdx = 0; sIdx < rawSections.length; sIdx++) {
    const section = rawSections[sIdx].trim()
    if (!section) continue

    const headingMatch = section.match(/^#{1,3}\s+(.+)$/m)
    const sectionTitle = headingMatch ? headingMatch[1].trim() : `Section ${sIdx + 1}`

    // Estimate page based on ~400 words per page
    const wordCount = section.split(/\s+/).length
    const pagesSpan = Math.max(1, Math.round(wordCount / 400))

    const chunk: DocumentPageChunk = {
      id: `${fileName}-section-${sIdx + 1}`,
      docName: fileName,
      docType: 'word',
      pageNumber: pageCounter,
      sectionTitle,
      content: section,
      charCount: section.length,
      hasTables: section.includes('|'),
      keywords: extractKeywords(section),
    }

    chunks.push(chunk)
    pageCounter += pagesSpan
  }

  return {
    name: fileName,
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    size: buffer.byteLength,
    extractedText: markdownText,
    previewText: markdownText.slice(0, 300) + (markdownText.length > 300 ? '...' : ''),
    pageCount: pageCounter - 1,
    chunks,
  }
}

/**
 * 4. UNIVERSAL IMAGE & OCR PARSER (.png, .jpg, .webp, .jpeg)
 */
export async function parseImageDocument(
  fileOrBuffer: File | ArrayBuffer,
  fileName: string,
  mimeType: string,
  options?: UniversalParseOptions
): Promise<ParsedDocumentResult> {
  const { onProgress, enableOcr = true } = options || {}

  onProgress?.({
    stage: 'extracting_content',
    stageLabel: 'Processing Image & Vision',
    percent: 20,
    message: `Preparing image ${fileName} for vision & OCR analysis...`,
  })

  let dataUrl = ''
  let buffer: ArrayBuffer

  if (fileOrBuffer instanceof File) {
    buffer = await fileOrBuffer.arrayBuffer()
    dataUrl = await new Promise<string>(resolve => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => resolve('')
      reader.readAsDataURL(fileOrBuffer)
    })
  } else {
    buffer = fileOrBuffer
    // Construct base64 dataUrl from ArrayBuffer
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    const base64 = btoa(binary)
    dataUrl = `data:${mimeType || 'image/png'};base64,${base64}`
  }

  let ocrText = ''

  if (enableOcr) {
    try {
      onProgress?.({
        stage: 'extracting_content',
        stageLabel: 'Running Optical Character Recognition (OCR)',
        percent: 45,
        message: 'Scanning text from image with Tesseract OCR...',
      })

      const tesseractModule = await import('tesseract.js')
      const T = (tesseractModule as any).default || tesseractModule
      if (typeof T.recognize === 'function') {
        // Run with a 10s timeout to avoid freezing on slow environments
        const ocrPromise = T.recognize(dataUrl, 'eng', {
          logger: (m: any) => {
            if (m.status === 'recognizing text' && m.progress) {
              onProgress?.({
                stage: 'extracting_content',
                stageLabel: 'Running OCR',
                percent: Math.round(45 + m.progress * 45),
                message: `OCR recognition: ${Math.round(m.progress * 100)}%`,
              })
            }
          },
        })

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('OCR Timeout')), 10000)
        )

        const result: any = await Promise.race([ocrPromise, timeoutPromise])
        if (result && result.data && result.data.text) {
          ocrText = cleanText(result.data.text)
        }
      }
    } catch (ocrErr) {
      console.warn('OCR note (will rely on Vision model):', ocrErr)
    }
  }

  const extractedText = ocrText
    ? `[OCR Extracted Text from ${fileName}]:\n${ocrText}`
    : `[Image Document: ${fileName} (${formatBytes(buffer.byteLength)}) - Loaded for Vision analysis]`

  const chunk: DocumentPageChunk = {
    id: `${fileName}-image-1`,
    docName: fileName,
    docType: 'image',
    pageNumber: 1,
    totalPages: 1,
    sectionTitle: 'Image Content & OCR',
    content: extractedText,
    charCount: extractedText.length,
    isScanned: true,
    keywords: extractKeywords(extractedText),
  }

  return {
    name: fileName,
    type: mimeType || 'image/png',
    size: buffer.byteLength,
    dataUrl,
    extractedText,
    previewText: ocrText
      ? `OCR extracted ${ocrText.length} characters.`
      : 'Image loaded for multi-modal Vision document analysis.',
    isImage: true,
    pageCount: 1,
    isScanned: true,
    chunks: [chunk],
  }
}

/**
 * 5. UNIVERSAL CSV & PLAIN TEXT PARSER
 */
export async function parseTextOrCsvDocument(
  content: string,
  fileName: string,
  isCsv: boolean
): Promise<ParsedDocumentResult> {
  const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0)
  const chunks: DocumentPageChunk[] = []

  let formattedText = ''

  if (isCsv && lines.length > 0) {
    const parseCsvLine = (line: string): string[] => {
      const result: string[] = []
      let current = ''
      let inQuotes = false

      for (let i = 0; i < line.length; i++) {
        const char = line[i]
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"'
            i++
          } else {
            inQuotes = !inQuotes
          }
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim())
          current = ''
        } else {
          current += char
        }
      }
      result.push(current.trim())
      return result
    }

    const rows = lines.map(parseCsvLine)
    const header = rows[0] || []

    // Build structured markdown chunks of 50 rows each
    const CHUNK_SIZE = 50
    for (let r = 0; r < rows.length; r += CHUNK_SIZE) {
      const block = rows.slice(r, r + CHUNK_SIZE)
      const startRow = r + 1
      const endRow = r + block.length

      let md = `### CSV Data: "${fileName}" (Rows ${startRow}–${endRow})\n\n`
      md += '| ' + header.join(' | ') + ' |\n'
      md += '| ' + header.map(() => '---').join(' | ') + ' |\n'

      for (const row of block) {
        while (row.length < header.length) row.push('')
        md += '| ' + row.slice(0, header.length).join(' | ') + ' |\n'
      }

      chunks.push({
        id: `${fileName}-csv-rows-${startRow}-${endRow}`,
        docName: fileName,
        docType: 'csv',
        sectionTitle: `CSV Rows ${startRow}–${endRow}`,
        content: md,
        charCount: md.length,
        hasTables: true,
        rowStart: startRow,
        rowEnd: endRow,
        keywords: extractKeywords(md),
      })
    }

    formattedText = chunks.map(c => c.content).join('\n\n')
  } else {
    // Plain text
    formattedText = content
    const paragraphs = content.split(/\n\s*\n/)
    let currentChunkText = ''
    let pIdx = 1

    for (const p of paragraphs) {
      if ((currentChunkText + '\n\n' + p).length > 2000) {
        chunks.push({
          id: `${fileName}-text-chunk-${pIdx++}`,
          docName: fileName,
          docType: 'text',
          sectionTitle: `Text Section ${pIdx - 1}`,
          content: currentChunkText.trim(),
          charCount: currentChunkText.length,
          keywords: extractKeywords(currentChunkText),
        })
        currentChunkText = p
      } else {
        currentChunkText += (currentChunkText ? '\n\n' : '') + p
      }
    }

    if (currentChunkText.trim().length > 0) {
      chunks.push({
        id: `${fileName}-text-chunk-${pIdx}`,
        docName: fileName,
        docType: 'text',
        sectionTitle: `Text Section ${pIdx}`,
        content: currentChunkText.trim(),
        charCount: currentChunkText.length,
        keywords: extractKeywords(currentChunkText),
      })
    }
  }

  return {
    name: fileName,
    type: isCsv ? 'text/csv' : 'text/plain',
    size: new Blob([content]).size,
    extractedText: formattedText,
    previewText: formattedText.slice(0, 300) + (formattedText.length > 300 ? '...' : ''),
    rowCount: lines.length,
    chunks,
  }
}

/**
 * MAIN ENTRY POINT: Universal Document Parsing Engine
 * Intelligently routes file to specialized parser with progress callbacks.
 */
export async function parseUniversalFile(
  file: File,
  options?: UniversalParseOptions
): Promise<ParsedDocumentResult> {
  const fileName = file.name
  const fileType = file.type || ''
  const docType = detectDocumentType(fileName, fileType)

  options?.onProgress?.({
    stage: 'uploading',
    stageLabel: 'Document Uploading',
    percent: 10,
    message: `Reading "${fileName}" (${formatBytes(file.size)})...`,
  })

  switch (docType) {
    case 'pdf': {
      const buffer = await file.arrayBuffer()
      return parsePdfDocument(buffer, fileName, options)
    }
    case 'excel': {
      const buffer = await file.arrayBuffer()
      return parseExcelDocument(buffer, fileName, options)
    }
    case 'word': {
      const buffer = await file.arrayBuffer()
      return parseWordDocument(buffer, fileName, options)
    }
    case 'image': {
      return parseImageDocument(file, fileName, fileType, options)
    }
    case 'csv':
    case 'text': {
      const text = await file.text()
      return parseTextOrCsvDocument(text, fileName, docType === 'csv')
    }
    default: {
      const text = await file.text().catch(() => '')
      if (text) {
        return parseTextOrCsvDocument(text, fileName, false)
      }
      return {
        name: fileName,
        type: fileType || 'application/octet-stream',
        size: file.size,
        extractedText: `[Attached File: ${fileName}]`,
        previewText: fileName,
        chunks: [],
      }
    }
  }
}

