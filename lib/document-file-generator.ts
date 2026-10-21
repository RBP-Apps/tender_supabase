'use client'

import {
  Document,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  Packer,
  AlignmentType,
  BorderStyle,
  WidthType,
  ShadingType,
} from 'docx'
import JSZip from 'jszip'

export interface GeneratedFileResult {
  blob: Blob
  url: string
  filename: string
  format: 'docx' | 'pdf' | 'xlsx' | 'csv' | 'txt'
  size: number
}

/**
 * Clean markdown symbols for plain text / docx text runs
 */
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim()
}

/**
 * 1. GENERATE WORD DOCUMENT (.docx)
 */
export async function generateWordDocument(
  title: string,
  markdownContent: string,
  customFilename?: string
): Promise<GeneratedFileResult> {
  const safeFilename =
    customFilename ||
    `${title.replace(/[^a-zA-Z0-9_-]/g, '_') || 'Tender_Report'}_${new Date().toISOString().slice(0, 10)}.docx`

  const lines = markdownContent.split(/\r?\n/)
  const docElements: (Paragraph | Table)[] = []

  // Document Header Banner
  docElements.push(
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [
        new TextRun({
          text: 'TENDER FMS • AI GENERATED REPORT',
          size: 16,
          color: '64748B',
          font: 'Arial',
        }),
      ],
      spacing: { after: 120 },
    })
  )

  // Title
  docElements.push(
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [
        new TextRun({
          text: title || 'Tender Document Report',
          bold: true,
          size: 36,
          color: '1E3A8A',
          font: 'Arial',
        }),
      ],
      spacing: { after: 200 },
    })
  )

  // Meta subtitle
  docElements.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Generated on: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}  |  Source: Tender Query AI Assistant`,
          size: 18,
          color: '475569',
          font: 'Arial',
          italics: true,
        }),
      ],
      spacing: { after: 360 },
    })
  )

  let i = 0
  while (i < lines.length) {
    const rawLine = lines[i]
    const trimmed = rawLine.trim()

    // Skip empty lines
    if (!trimmed) {
      i++
      continue
    }

    // Markdown Table
    if (trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.includes('|')) {
      const tableLines: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        tableLines.push(lines[i].trim())
        i++
      }

      if (tableLines.length >= 2) {
        const headerCells = tableLines[0]
          .split('|')
          .slice(1, -1)
          .map(c => stripMarkdown(c.trim()))

        let startIndex = 1
        if (tableLines.length > 1 && /^[|:\-\s]+$/.test(tableLines[1])) {
          startIndex = 2
        }

        const bodyRows = tableLines.slice(startIndex).map(line =>
          line
            .split('|')
            .slice(1, -1)
            .map(c => stripMarkdown(c.trim()))
        )

        // Build docx Table
        const docxRows: TableRow[] = []

        // Header Row
        docxRows.push(
          new TableRow({
            tableHeader: true,
            children: headerCells.map(
              h =>
                new TableCell({
                  shading: { type: ShadingType.CLEAR, fill: '1E3A8A', color: 'auto' },
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: h,
                          bold: true,
                          color: 'FFFFFF',
                          font: 'Arial',
                          size: 18,
                        }),
                      ],
                    }),
                  ],
                })
            ),
          })
        )

        // Data Rows
        bodyRows.forEach((row, rIdx) => {
          docxRows.push(
            new TableRow({
              children: row.map(
                cell =>
                  new TableCell({
                    shading:
                      rIdx % 2 === 1
                        ? { type: ShadingType.CLEAR, fill: 'F8FAFC', color: 'auto' }
                        : undefined,
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: cell,
                            font: 'Arial',
                            size: 18,
                            color: '1E293B',
                          }),
                        ],
                      }),
                    ],
                  })
              ),
            })
          )
        })

        docElements.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: docxRows,
          })
        )

        docElements.push(new Paragraph({ spacing: { after: 200 } }))
        continue
      }
    }

    // Headings
    if (trimmed.startsWith('# ')) {
      docElements.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [
            new TextRun({
              text: stripMarkdown(trimmed.slice(2)),
              bold: true,
              size: 28,
              color: '1E3A8A',
              font: 'Arial',
            }),
          ],
          spacing: { before: 280, after: 120 },
        })
      )
      i++
      continue
    }

    if (trimmed.startsWith('## ')) {
      docElements.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [
            new TextRun({
              text: stripMarkdown(trimmed.slice(3)),
              bold: true,
              size: 24,
              color: '0F172A',
              font: 'Arial',
            }),
          ],
          spacing: { before: 240, after: 100 },
        })
      )
      i++
      continue
    }

    if (trimmed.startsWith('### ')) {
      docElements.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [
            new TextRun({
              text: stripMarkdown(trimmed.slice(4)),
              bold: true,
              size: 20,
              color: '2563EB',
              font: 'Arial',
            }),
          ],
          spacing: { before: 180, after: 80 },
        })
      )
      i++
      continue
    }

    // Bullet points (- or *)
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const cleanText = stripMarkdown(trimmed.slice(2))
      docElements.push(
        new Paragraph({
          bullet: { level: 0 },
          children: [
            new TextRun({
              text: cleanText,
              size: 20,
              color: '334155',
              font: 'Arial',
            }),
          ],
          spacing: { after: 80 },
        })
      )
      i++
      continue
    }

    // Blockquote
    if (trimmed.startsWith('> ')) {
      docElements.push(
        new Paragraph({
          children: [
            new TextRun({
              text: stripMarkdown(trimmed.slice(2)),
              italics: true,
              size: 20,
              color: '1D4ED8',
              font: 'Arial',
            }),
          ],
          indent: { left: 400 },
          spacing: { before: 100, after: 100 },
        })
      )
      i++
      continue
    }

    // Normal paragraph
    docElements.push(
      new Paragraph({
        children: [
          new TextRun({
            text: stripMarkdown(rawLine),
            size: 20,
            color: '1E293B',
            font: 'Arial',
          }),
        ],
        spacing: { after: 120 },
      })
    )
    i++
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440,
              right: 1440,
              bottom: 1440,
              left: 1440,
            },
          },
        },
        children: docElements,
      },
    ],
  })

  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)

  return {
    blob,
    url,
    filename: safeFilename,
    format: 'docx',
    size: blob.size,
  }
}

/**
 * 2. GENERATE SPREADSHEET (OpenXML .xlsx using JSZip)
 */
export async function generateExcelDocument(
  title: string,
  markdownContent: string,
  customFilename?: string
): Promise<GeneratedFileResult> {
  const safeFilename =
    customFilename ||
    `${title.replace(/[^a-zA-Z0-9_-]/g, '_') || 'Tender_Data'}_${new Date().toISOString().slice(0, 10)}.xlsx`

  // Extract table rows from markdown
  const lines = markdownContent.split(/\r?\n/)
  const extractedRows: string[][] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('|') && trimmed.endsWith('|') && !/^[|:\-\s]+$/.test(trimmed)) {
      const cells = trimmed
        .split('|')
        .slice(1, -1)
        .map(c => stripMarkdown(c.trim()))
      if (cells.length > 0) {
        extractedRows.push(cells)
      }
    }
  }

  // If no markdown tables were found, parse bullet points or lines as rows
  if (extractedRows.length === 0) {
    extractedRows.push(['Field / Parameter', 'Details / Value'])
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        const parts = trimmed.slice(2).split(/:\s*(.+)/)
        if (parts.length >= 2) {
          extractedRows.push([stripMarkdown(parts[0]), stripMarkdown(parts[1])])
        } else {
          extractedRows.push(['Item', stripMarkdown(trimmed.slice(2))])
        }
      } else if (trimmed && !trimmed.startsWith('#')) {
        extractedRows.push(['Note', stripMarkdown(trimmed)])
      }
    }
  }

  // Build OpenXML XLSX Structure
  const zip = new JSZip()

  // [Content_Types].xml
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`
  )

  // _rels/.rels
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`
  )

  // xl/_rels/workbook.xml.rels
  zip.file(
    'xl/_rels/workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`
  )

  // xl/workbook.xml
  zip.file(
    'xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Tender Report" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`
  )

  // xl/styles.xml
  zip.file(
    'xl/styles.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1E3A8A"/></patternFill></fill>
  </fills>
  <borders count="1">
    <border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/></border>
  </borders>
  <cellXfs count="2">
    <xf fontId="0" fillId="0" borderId="0"/>
    <xf fontId="1" fillId="2" borderId="0" applyFont="1" applyFill="1"/>
  </cellXfs>
</styleSheet>`
  )

  // Shared strings collection
  const sharedStrings: string[] = []
  const stringIndexMap = new Map<string, number>()

  const getStringId = (s: string): number => {
    if (stringIndexMap.has(s)) {
      return stringIndexMap.get(s)!
    }
    const idx = sharedStrings.length
    sharedStrings.push(s)
    stringIndexMap.set(s, idx)
    return idx
  }

  // Build sheet1.xml
  let sheetRowsXml = ''
  extractedRows.forEach((row, rIdx) => {
    const rowNum = rIdx + 1
    sheetRowsXml += `<row r="${rowNum}">`
    row.forEach((cellVal, cIdx) => {
      const colLetter = String.fromCharCode(65 + (cIdx % 26))
      const cellRef = `${colLetter}${rowNum}`
      const sId = getStringId(cellVal)
      const styleAttr = rIdx === 0 ? ' s="1"' : ''
      sheetRowsXml += `<c r="${cellRef}" t="s"${styleAttr}><v>${sId}</v></c>`
    })
    sheetRowsXml += '</row>'
  })

  zip.file(
    'xl/worksheets/sheet1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${sheetRowsXml}</sheetData>
</worksheet>`
  )

  // xl/sharedStrings.xml
  let sharedStringsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sharedStrings.length}" uniqueCount="${sharedStrings.length}">`
  for (const s of sharedStrings) {
    const escaped = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    sharedStringsXml += `<si><t>${escaped}</t></si>`
  }
  sharedStringsXml += '</sst>'
  zip.file('xl/sharedStrings.xml', sharedStringsXml)

  // Generate .xlsx Blob
  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)

  return {
    blob,
    url,
    filename: safeFilename,
    format: 'xlsx',
    size: blob.size,
  }
}

/**
 * 3. GENERATE CSV (.csv)
 */
export function generateCsvDocument(
  title: string,
  markdownContent: string,
  customFilename?: string
): GeneratedFileResult {
  const safeFilename =
    customFilename ||
    `${title.replace(/[^a-zA-Z0-9_-]/g, '_') || 'Tender_Data'}_${new Date().toISOString().slice(0, 10)}.csv`

  const lines = markdownContent.split(/\r?\n/)
  const extractedRows: string[][] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('|') && trimmed.endsWith('|') && !/^[|:\-\s]+$/.test(trimmed)) {
      const cells = trimmed
        .split('|')
        .slice(1, -1)
        .map(c => stripMarkdown(c.trim()))
      if (cells.length > 0) {
        extractedRows.push(cells)
      }
    }
  }

  if (extractedRows.length === 0) {
    extractedRows.push(['Section', 'Content'])
    for (const l of lines) {
      if (l.trim()) extractedRows.push(['Detail', stripMarkdown(l)])
    }
  }

  const csvContent =
    '\uFEFF' + // UTF-8 BOM for Microsoft Excel
    extractedRows
      .map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
      .join('\r\n')

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)

  return {
    blob,
    url,
    filename: safeFilename,
    format: 'csv',
    size: blob.size,
  }
}

/**
 * 4. GENERATE CLEAN STANDARD PDF (.pdf)
 */
export function generatePdfDocument(
  title: string,
  markdownContent: string,
  customFilename?: string
): GeneratedFileResult {
  const safeFilename =
    customFilename ||
    `${title.replace(/[^a-zA-Z0-9_-]/g, '_') || 'Tender_Document'}_${new Date().toISOString().slice(0, 10)}.pdf`

  // Build clean text lines for PDF canvas/stream
  const lines = markdownContent
    .split(/\r?\n/)
    .map(l => stripMarkdown(l))
    .filter(l => l.length > 0)

  // Construct standard valid %PDF-1.4 stream
  const escapedTitle = title.replace(/[()\\]/g, '')
  const dateStr = new Date().toLocaleDateString('en-IN')

  let streamText = `BT\n/F1 16 Tf\n50 760 Td\n(${escapedTitle}) Tj\nET\n`
  streamText += `BT\n/F1 9 Tf\n50 740 Td\n(Tender FMS Official Report - Generated: ${dateStr}) Tj\nET\n`
  streamText += `BT\n/F1 10 Tf\n`

  let y = 710
  const pageLines: string[] = []

  for (const line of lines.slice(0, 48)) {
    // Word wrap long lines
    const maxChars = 75
    for (let c = 0; c < line.length; c += maxChars) {
      const chunk = line.substring(c, c + maxChars).replace(/[()\\]/g, '')
      pageLines.push(`50 ${y} Td\n(${chunk}) Tj\n-50 -14 Td\n`)
      y -= 14
      if (y < 60) break
    }
    if (y < 60) break
  }

  streamText += pageLines.join('') + 'ET\n'

  const streamLength = streamText.length

  const pdfSource = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length ${streamLength} >>
stream
${streamText}
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000244 00000 n 
0000000000 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
${300 + streamLength}
%%EOF`

  const blob = new Blob([pdfSource], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)

  return {
    blob,
    url,
    filename: safeFilename,
    format: 'pdf',
    size: blob.size,
  }
}

/**
 * 5. GENERATE TEXT DOCUMENT (.txt)
 */
export function generateTxtDocument(
  title: string,
  markdownContent: string,
  customFilename?: string
): GeneratedFileResult {
  const safeFilename =
    customFilename ||
    `${title.replace(/[^a-zA-Z0-9_-]/g, '_') || 'Tender_Summary'}_${new Date().toISOString().slice(0, 10)}.txt`

  const header = `============================================================\n${title.toUpperCase()}\nTender FMS • Generated on ${new Date().toLocaleString()}\n============================================================\n\n`
  const fullText = header + stripMarkdown(markdownContent)

  const blob = new Blob([fullText], { type: 'text/plain;charset=utf-8;' })
  const url = URL.createObjectURL(blob)

  return {
    blob,
    url,
    filename: safeFilename,
    format: 'txt',
    size: blob.size,
  }
}

/**
 * Unified Generator Helper
 */
export async function generateFileByFormat(
  format: 'docx' | 'pdf' | 'xlsx' | 'csv' | 'txt',
  title: string,
  content: string,
  customFilename?: string
): Promise<GeneratedFileResult> {
  switch (format) {
    case 'docx':
      return await generateWordDocument(title, content, customFilename)
    case 'xlsx':
      return await generateExcelDocument(title, content, customFilename)
    case 'csv':
      return generateCsvDocument(title, content, customFilename)
    case 'pdf':
      return generatePdfDocument(title, content, customFilename)
    case 'txt':
    default:
      return generateTxtDocument(title, content, customFilename)
  }
}
