'use client'

import JSZip from 'jszip'

export interface ParsedFileInfo {
  name: string
  type: string
  size: number
  dataUrl?: string
  extractedText: string
  previewText?: string
  rowCount?: number
  sheetCount?: number
  isImage?: boolean
}

/**
 * Format bytes to human readable string
 */
export function formatFileSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

/**
 * Extract text from plain text or CSV file
 */
function parseTextOrCsv(content: string, isCsv: boolean): string {
  if (!isCsv) return content

  // Format CSV as Markdown table for AI readability
  const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0)
  if (lines.length === 0) return content

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
  if (rows.length === 0) return content

  // Build markdown table
  const header = rows[0]
  let md = '| ' + header.join(' | ') + ' |\n'
  md += '| ' + header.map(() => '---').join(' | ') + ' |\n'

  for (let i = 1; i < Math.min(rows.length, 100); i++) {
    const row = rows[i]
    while (row.length < header.length) row.push('')
    md += '| ' + row.slice(0, header.length).join(' | ') + ' |\n'
  }

  if (rows.length > 100) {
    md += `\n*...and ${rows.length - 100} more rows.*`
  }

  return md
}

/**
 * Extract text, headings, and tables from DOCX using JSZip
 */
async function parseDocx(buffer: ArrayBuffer): Promise<string> {
  try {
    const zip = await JSZip.loadAsync(buffer)
    const documentXml = await zip.file('word/document.xml')?.async('text')
    if (!documentXml) return 'Could not read Word document content.'

    // Extract text from XML nodes
    // Clean paragraph breaks
    let text = documentXml
      .replace(/<w:p[^>]*>/g, '\n')
      .replace(/<w:tab[^>]*\/>/g, '\t')
      .replace(/<w:br[^>]*\/>/g, '\n')
      .replace(/<w:tc[^>]*>/g, ' | ')
      .replace(/<\/w:tr>/g, ' |\n')
      .replace(/<[^>]+>/g, '') // strip all other XML tags
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/\n\s*\n/g, '\n\n')
      .trim()

    return text || 'Empty Word document.'
  } catch (err: any) {
    console.warn('DOCX parse warning:', err)
    return 'Could not parse Word document: ' + (err?.message || 'Invalid format')
  }
}

/**
 * Extract sheets and cell data from XLSX using JSZip
 */
async function parseXlsx(buffer: ArrayBuffer): Promise<{ text: string; rowCount: number }> {
  try {
    const zip = await JSZip.loadAsync(buffer)

    // 1. Shared Strings Table
    const sharedStringsXml = await zip.file('xl/sharedStrings.xml')?.async('text')
    const sharedStrings: string[] = []
    if (sharedStringsXml) {
      const stringMatches = sharedStringsXml.match(/<t[^>]*>([^<]*)<\/t>/g) || []
      for (const m of stringMatches) {
        const val = m.replace(/<[^>]+>/g, '')
        sharedStrings.push(val)
      }
    }

    // 2. Read first worksheet
    const sheet1Xml = await zip.file('xl/worksheets/sheet1.xml')?.async('text')
    if (!sheet1Xml) {
      return { text: 'Empty Excel spreadsheet or no worksheets found.', rowCount: 0 }
    }

    // Extract rows
    const rowMatches = sheet1Xml.match(/<row[^>]*>(.*?)<\/row>/g) || []
    if (rowMatches.length === 0) {
      return { text: 'Excel worksheet contains no data rows.', rowCount: 0 }
    }

    const tableRows: string[][] = []

    for (const rowXml of rowMatches.slice(0, 80)) {
      const cellMatches = rowXml.match(/<c\s*([^>]*)>(.*?)<\/c>/g) || []
      const rowCells: string[] = []

      for (const cellXml of cellMatches) {
        const isString = cellXml.includes('t="s"')
        const valMatch = cellXml.match(/<v>([^<]*)<\/v>/)
        if (valMatch) {
          const rawVal = valMatch[1]
          if (isString) {
            const idx = parseInt(rawVal, 10)
            rowCells.push(sharedStrings[idx] || rawVal)
          } else {
            rowCells.push(rawVal)
          }
        } else {
          // Check inline string
          const inlineMatch = cellXml.match(/<t[^>]*>([^<]*)<\/t>/)
          if (inlineMatch) {
            rowCells.push(inlineMatch[1])
          } else {
            rowCells.push('')
          }
        }
      }

      if (rowCells.some(c => c.trim().length > 0)) {
        tableRows.push(rowCells)
      }
    }

    if (tableRows.length === 0) {
      return { text: 'Excel worksheet contains no text rows.', rowCount: 0 }
    }

    // Format as Markdown Table
    const maxCols = Math.max(...tableRows.map(r => r.length))
    const header = tableRows[0]
    while (header.length < maxCols) header.push(`Col ${header.length + 1}`)

    let md = '| ' + header.join(' | ') + ' |\n'
    md += '| ' + header.map(() => '---').join(' | ') + ' |\n'

    for (let r = 1; r < tableRows.length; r++) {
      const row = tableRows[r]
      while (row.length < maxCols) row.push('')
      md += '| ' + row.join(' | ') + ' |\n'
    }

    if (rowMatches.length > 80) {
      md += `\n*...and ${rowMatches.length - 80} more rows.*`
    }

    return { text: md, rowCount: rowMatches.length }
  } catch (err: any) {
    console.warn('XLSX parse warning:', err)
    return { text: 'Could not parse Excel document: ' + (err?.message || 'Invalid format'), rowCount: 0 }
  }
}

/**
 * Extract readable text from standard text-based PDF
 */
function parsePdfBasic(binaryString: string): string {
  try {
    const textPieces: string[] = []

    // Match text within BT (Begin Text) ... ET (End Text) blocks
    const btBlocks = binaryString.match(/BT[\s\S]*?ET/g) || []

    for (const block of btBlocks) {
      // Look for (string) Tj or [ (string) ... ] TJ
      const stringMatches = block.match(/\((.*?)\)\s*Tj/g) || []
      for (const sm of stringMatches) {
        const clean = sm.replace(/^\(/, '').replace(/\)\s*Tj$/, '')
        if (clean && clean.length > 1) {
          textPieces.push(clean)
        }
      }

      // TJ array matching
      const tjMatches = block.match(/\[(.*?)\]\s*TJ/g) || []
      for (const tm of tjMatches) {
        const subStrings = tm.match(/\((.*?)\)/g) || []
        const combined = subStrings.map(s => s.slice(1, -1)).join('')
        if (combined && combined.length > 1) {
          textPieces.push(combined)
        }
      }
    }

    let extracted = textPieces.join(' ').replace(/\s+/g, ' ').trim()

    // If PDF text objects were found
    if (extracted.length > 50) {
      return extracted.slice(0, 15000)
    }

    // Fallback: search for common plain text patterns in PDF
    const plainTokens = binaryString.match(/[\x20-\x7E]{5,}/g) || []
    const filteredTokens = plainTokens.filter(t => !t.startsWith('/') && !t.includes('obj') && !t.includes('endobj'))

    if (filteredTokens.length > 20) {
      return filteredTokens.slice(0, 200).join(' ').slice(0, 10000)
    }

    return 'PDF document attached. Text is scanned or encoded; image/vision analysis will be utilized.'
  } catch (e: any) {
    return 'PDF document attached for review.'
  }
}

/**
 * Main parser entry point for client-side document reading
 */
export async function parseFileForChat(file: File): Promise<ParsedFileInfo> {
  const fileName = file.name
  const fileType = file.type || ''
  const fileSize = file.size
  const lowerName = fileName.toLowerCase()

  // 1. Image Files (.png, .jpg, .jpeg, .webp)
  if (fileType.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/.test(lowerName)) {
    return new Promise(resolve => {
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        resolve({
          name: fileName,
          type: fileType || 'image/png',
          size: fileSize,
          dataUrl,
          extractedText: `[Image Attached: ${fileName} (${formatFileSize(fileSize)})]`,
          previewText: 'Image loaded for vision OCR and document analysis.',
          isImage: true,
        })
      }
      reader.onerror = () => {
        resolve({
          name: fileName,
          type: fileType,
          size: fileSize,
          extractedText: `[Image: ${fileName}]`,
          isImage: true,
        })
      }
      reader.readAsDataURL(file)
    })
  }

  // 2. Plain Text and CSV
  if (lowerName.endsWith('.txt') || lowerName.endsWith('.csv') || fileType.includes('text/')) {
    return new Promise(resolve => {
      const reader = new FileReader()
      reader.onload = () => {
        const rawContent = (reader.result as string) || ''
        const isCsv = lowerName.endsWith('.csv')
        const formatted = parseTextOrCsv(rawContent, isCsv)
        resolve({
          name: fileName,
          type: isCsv ? 'text/csv' : 'text/plain',
          size: fileSize,
          extractedText: formatted,
          previewText: formatted.slice(0, 250) + (formatted.length > 250 ? '...' : ''),
        })
      }
      reader.onerror = () => {
        resolve({
          name: fileName,
          type: fileType,
          size: fileSize,
          extractedText: `[File: ${fileName}]`,
        })
      }
      reader.readAsText(file)
    })
  }

  // 3. Word Document (.docx)
  if (lowerName.endsWith('.docx')) {
    return new Promise(resolve => {
      const reader = new FileReader()
      reader.onload = async () => {
        const buffer = reader.result as ArrayBuffer
        const text = await parseDocx(buffer)
        resolve({
          name: fileName,
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size: fileSize,
          extractedText: text,
          previewText: text.slice(0, 250) + (text.length > 250 ? '...' : ''),
        })
      }
      reader.onerror = () => {
        resolve({
          name: fileName,
          type: 'application/docx',
          size: fileSize,
          extractedText: `[Word Document: ${fileName}]`,
        })
      }
      reader.readAsArrayBuffer(file)
    })
  }

  // 4. Excel Document (.xlsx)
  if (lowerName.endsWith('.xlsx')) {
    return new Promise(resolve => {
      const reader = new FileReader()
      reader.onload = async () => {
        const buffer = reader.result as ArrayBuffer
        const { text, rowCount } = await parseXlsx(buffer)
        resolve({
          name: fileName,
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          size: fileSize,
          extractedText: text,
          rowCount,
          previewText: `Parsed ${rowCount} rows from Excel sheet.`,
        })
      }
      reader.onerror = () => {
        resolve({
          name: fileName,
          type: 'application/xlsx',
          size: fileSize,
          extractedText: `[Excel Document: ${fileName}]`,
        })
      }
      reader.readAsArrayBuffer(file)
    })
  }

  // 5. PDF Document (.pdf)
  if (lowerName.endsWith('.pdf') || fileType === 'application/pdf') {
    return new Promise(resolve => {
      const reader = new FileReader()
      reader.onload = () => {
        const binary = (reader.result as string) || ''
        const text = parsePdfBasic(binary)
        resolve({
          name: fileName,
          type: 'application/pdf',
          size: fileSize,
          extractedText: text,
          previewText: text.slice(0, 250) + (text.length > 250 ? '...' : ''),
        })
      }
      reader.onerror = () => {
        resolve({
          name: fileName,
          type: 'application/pdf',
          size: fileSize,
          extractedText: `[PDF Document: ${fileName}]`,
        })
      }
      reader.readAsBinaryString(file)
    })
  }

  // Fallback for other files
  return {
    name: fileName,
    type: fileType || 'application/octet-stream',
    size: fileSize,
    extractedText: `[Attached File: ${fileName} (${formatFileSize(fileSize)})]`,
    previewText: `File: ${fileName}`,
  }
}
