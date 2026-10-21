import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
} from 'docx'
import { Tender } from '@/types/tender'
import { COMPANY } from '@/lib/company'

/**
 * Generates and downloads a formal Word document (.docx) of the Affidavit / Contract Agreement
 */
export async function downloadWorkOrderAgreementDocx(
  tender: Tender,
  agreementText: string,
  workOrderNumber?: string
): Promise<void> {
  const authorityName = tender.bid?.authorityFullName || tender.authority
  const tenderId = tender.id
  const tenderTitle = tender.title
  const woNum = workOrderNumber || `WO/${tender.id}`
  const today = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })

  const lines = agreementText.split('\n')
  const docChildren: (Paragraph | Table)[] = []

  // Document Header Banner
  docChildren.push(
    new Paragraph({
      text: 'ARTICLES OF CONTRACT AGREEMENT / AFFIDAVIT',
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 120 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `[To be executed on Non-Judicial Stamp Paper of Prescribed Value]`,
          italics: true,
          size: 19,
          color: '555555',
        }),
      ],
      spacing: { after: 200 },
    })
  )

  // Reference Table
  docChildren.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 25, type: WidthType.PERCENTAGE },
              children: [new Paragraph({ children: [new TextRun({ text: 'Tender ID:', bold: true })] })],
            }),
            new TableCell({
              width: { size: 75, type: WidthType.PERCENTAGE },
              children: [new Paragraph({ text: tenderId })],
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({
              width: { size: 25, type: WidthType.PERCENTAGE },
              children: [new Paragraph({ children: [new TextRun({ text: 'Tender Title:', bold: true })] })],
            }),
            new TableCell({
              width: { size: 75, type: WidthType.PERCENTAGE },
              children: [new Paragraph({ text: tenderTitle })],
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({
              width: { size: 25, type: WidthType.PERCENTAGE },
              children: [new Paragraph({ children: [new TextRun({ text: 'Authority:', bold: true })] })],
            }),
            new TableCell({
              width: { size: 75, type: WidthType.PERCENTAGE },
              children: [new Paragraph({ text: `${authorityName} (${tender.department})` })],
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({
              width: { size: 25, type: WidthType.PERCENTAGE },
              children: [new Paragraph({ children: [new TextRun({ text: 'Work Order No:', bold: true })] })],
            }),
            new TableCell({
              width: { size: 75, type: WidthType.PERCENTAGE },
              children: [new Paragraph({ text: woNum })],
            }),
          ],
        }),
      ],
    }),
    new Paragraph({ text: '', spacing: { before: 180, after: 120 } })
  )

  // Content Paragraphs
  lines.forEach(line => {
    const trimmed = line.trim()
    if (!trimmed) {
      docChildren.push(new Paragraph({ text: '', spacing: { after: 80 } }))
    } else if (
      trimmed.startsWith('ARTICLES') ||
      trimmed.startsWith('THIS AGREEMENT') ||
      trimmed.startsWith('NOW THIS AGREEMENT') ||
      trimmed.startsWith('1.') ||
      trimmed.startsWith('2.') ||
      trimmed.startsWith('3.') ||
      trimmed.startsWith('4.') ||
      trimmed.startsWith('5.') ||
      trimmed.startsWith('6.') ||
      trimmed.startsWith('7.') ||
      trimmed.startsWith('8.') ||
      trimmed.startsWith('WHEREAS') ||
      trimmed.startsWith('AND WHEREAS')
    ) {
      docChildren.push(
        new Paragraph({
          children: [new TextRun({ text: trimmed, bold: true, size: 21 })],
          spacing: { before: 140, after: 60 },
        })
      )
    } else {
      docChildren.push(
        new Paragraph({
          children: [new TextRun({ text: line, size: 20 })],
          spacing: { after: 60 },
        })
      )
    }
  })

  // Signatures Table
  docChildren.push(
    new Paragraph({ text: '', spacing: { before: 300, after: 120 } }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({ children: [new TextRun({ text: 'FIRST PARTY (EMPLOYER):', bold: true })] }),
                new Paragraph({ text: `For and on behalf of ${authorityName}` }),
                new Paragraph({ text: '\n\n' }),
                new Paragraph({ text: 'Authorized Signatory: ___________________' }),
                new Paragraph({ text: 'Designation: ________________________' }),
                new Paragraph({ text: '[Official Seal]' }),
              ],
            }),
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({ children: [new TextRun({ text: 'SECOND PARTY (CONTRACTOR):', bold: true })] }),
                new Paragraph({ text: `For M/s ${COMPANY.name}` }),
                new Paragraph({ text: '\n\n' }),
                new Paragraph({ text: 'Authorized Signatory: ___________________' }),
                new Paragraph({ text: 'Designation: Director / Partner' }),
                new Paragraph({ text: '[Company Seal]' }),
              ],
            }),
          ],
        }),
      ],
    })
  )

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: docChildren,
      },
    ],
  })

  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const safeFilename = `Contract_Agreement_${tender.id.replace(/[^a-zA-Z0-9]/g, '_')}.docx`

  const link = document.createElement('a')
  link.href = url
  link.download = safeFilename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
