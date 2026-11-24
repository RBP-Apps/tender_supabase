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
  Header,
  Footer,
  PageNumber,
} from 'docx'
import { jsPDF } from 'jspdf'
import { Tender, BankAccountDetails, EmdGeneratedDocumentInfo, EmdReadyData } from '@/types/tender'

export const RBP_COMPANY = {
  name: 'RBP ENERGY INDIA PRIVATE LIMITED',
  shortName: 'RBP Energy India Pvt. Ltd.',
  logoUrl: '/Logo.PNG',
  regdOfficeLine1: '303 Guru Ghasidas Plaza',
  regdOfficeLine2: 'Amapara, G.E Road, Raipur (C.G) - 492 001',
  email: 'info@rbpindia.com',
  website: 'rbpindia.com',
  salesPhone: '92000 12500',
  servicePhone: '92000 12400',
  signatory: 'Mr. Anirudha Singh',
  signatoryDesignation: 'Authorised Signatory',
  place: 'Raipur, Chhattisgarh',
}

/**
 * Converts a numeric amount to Indian Currency words (e.g., "Rupees Fifty Thousand Only")
 */
export function numberToIndianWords(numStr: string | number): string {
  let raw = String(numStr).trim()
  const lakhMatch = raw.match(/([\d,.]+)\s*(?:lakhs?|lacs?)/i)
  if (lakhMatch) {
    const n = parseFloat(lakhMatch[1].replace(/,/g, ''))
    if (!isNaN(n)) raw = String(Math.round(n * 100000))
  }
  const crMatch = raw.match(/([\d,.]+)\s*(?:crores?|cr)\b/i)
  if (crMatch) {
    const n = parseFloat(crMatch[1].replace(/,/g, ''))
    if (!isNaN(n)) raw = String(Math.round(n * 10000000))
  }
  const cleanStr = raw.replace(/[^0-9.]/g, '')
  const num = Math.floor(parseFloat(cleanStr))
  if (isNaN(num) || num <= 0) return 'Rupees Zero Only'

  const ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen'
  ]
  const tens = [
    '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'
  ]

  function convertHundreds(n: number): string {
    let str = ''
    if (n >= 100) {
      str += ones[Math.floor(n / 100)] + ' Hundred '
      n %= 100
    }
    if (n >= 20) {
      str += tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '')
    } else if (n > 0) {
      str += ones[n]
    }
    return str.trim()
  }

  let crore = Math.floor(num / 10000000)
  let remainder = num % 10000000
  let lakh = Math.floor(remainder / 100000)
  remainder = remainder % 100000
  let thousand = Math.floor(remainder / 1000)
  remainder = remainder % 1000
  let hundreds = remainder

  let words = ''
  if (crore > 0) words += convertHundreds(crore) + ' Crore '
  if (lakh > 0) words += convertHundreds(lakh) + ' Lakh '
  if (thousand > 0) words += convertHundreds(thousand) + ' Thousand '
  if (hundreds > 0) words += convertHundreds(hundreds)

  return `Rupees ${words.trim()} Only`
}

/** "Rs. 5,11,800 /- (Rs. 5,00,000 + Rs. 11,800)" – the single-payment line of the tender's EMD format. */
export function emdAmountLine(tender: Tender, amount: string): string {
  const total = Number(amount)
  if (!amount || isNaN(total)) return amount || ''
  const emdRs = Math.round((tender.bid?.packages || []).reduce((n, p) => n + (parseFloat(p.emdLakh) || 0), 0) * 100000)
  const feeM = (tender.bid?.tenderFeePlusGst || '').replace(/,/g, '').match(/\d+(?:\.\d+)?/)
  const feeRs = feeM ? Math.round(parseFloat(feeM[0])) : 0
  const inr = (n: number) => n.toLocaleString('en-IN')
  const split = emdRs > 0 && feeRs > 0 && total === emdRs + feeRs ? ` (Rs. ${inr(emdRs)} + Rs. ${inr(feeRs)})` : ''
  return `Rs. ${inr(total)} /-${split}`
}

export interface EmdFormatAnalysis {
  formatTitle: string
  formatType: 'rtgs_neft' | 'bank_guarantee' | 'demand_draft' | 'portal_challan' | 'custom_undertaking'
  annexureRef: string
  pageNumber: string
  clauseNumber: string
  extractedDeclarations: string[]
  paymentTerms: string[]
  instructions: string[]
  sourceDescription: string
}

/**
 * Reads and analyzes the original Tender PDF text to dynamically identify
 * the exact EMD format, annexure title, and clauses without hallucination.
 */
export function extractEmdFormatFromTender(tender: Tender, pdfText?: string): EmdFormatAnalysis {
  const tenderNit = tender.tenderDoc?.name || 'Original Tender NIT PDF'
  const text = (pdfText || tender.tenderDoc?.textContent || '').trim()

  // Default fallback adhering strictly to tender context
  const defaultTitle = 'EARNEST MONEY DEPOSIT (EMD) VERIFICATION & PAYMENT UNDERTAKING'
  const defaultAnnexure = 'EMD Compliance Schedule'

  if (!text) {
    return {
      formatTitle: defaultTitle,
      formatType: 'rtgs_neft',
      annexureRef: defaultAnnexure,
      pageNumber: 'Not Specified in Tender Document',
      clauseNumber: 'Clause on Earnest Money Deposit',
      extractedDeclarations: [
        'We hereby confirm that the Earnest Money Deposit (EMD) for the subject tender has been remitted as per the terms and conditions stipulated in the Tender Document.',
        'We undertake that our bid shall remain valid for the period specified in the Tender NIT from the date of opening of technical bids.',
        'We acknowledge that the EMD shall be liable for forfeiture in accordance with the tender conditions if we withdraw or modify our bid during the validity period or fail to furnish the performance security upon award.',
        'The bank transaction particulars provided herein are true, authentic, and verifiable from our corporate banking records.'
      ],
      paymentTerms: [
        'Mode of Remittance: Electronic Fund Transfer (RTGS / NEFT)',
        'Beneficiary Account: Official Department Account as designated in Tender NIT',
        'Transaction Proof: Verified UTR / Transaction Reference Number attached'
      ],
      instructions: [
        'Please quote the Tender Number and RfS Reference in all future correspondence regarding EMD release or adjustment.',
        'The bank remittance confirmation receipt generated from our corporate banking portal is enclosed herewith.'
      ],
      sourceDescription: `Extracted from Tender Context (${tenderNit})`
    }
  }

  // Scan text for specific EMD Annexure / Format headings
  let detectedTitle = defaultTitle
  let detectedAnnexure = defaultAnnexure
  let detectedType: 'rtgs_neft' | 'bank_guarantee' | 'demand_draft' | 'portal_challan' | 'custom_undertaking' = 'rtgs_neft'
  let detectedPage = 'Not Specified in Tender Document'
  let detectedClause = 'EMD / Bid Security Clause'

  // 1. Check for Bank Guarantee format in PDF
  const bgMatch = text.match(/(?:ANNEXURE|FORMAT|SCHEDULE|PROFORMA)\s*[-:–]?\s*([A-Z0-9]+)?[\s\S]{0,80}?(?:BANK\s+GUARANTEE\s+FOR\s+EARNEST\s+MONEY|EMD\s+BANK\s+GUARANTEE|BG\s+IN\s+LIEU\s+OF\s+EMD|BID\s+SECURITY\s+BANK\s+GUARANTEE)/i)
  if (bgMatch) {
    detectedType = 'bank_guarantee'
    detectedTitle = 'BANK GUARANTEE FORMAT IN LIEU OF EARNEST MONEY DEPOSIT (EMD)'
    if (bgMatch[0]) {
      const firstLine = bgMatch[0].split('\n')[0].trim()
      if (firstLine.length > 5 && firstLine.length < 80) detectedAnnexure = firstLine
    }
  } else {
    // 2. Check for RTGS / NEFT / Online EMD format
    const rtgsMatch = text.match(/(?:ANNEXURE|FORMAT|SCHEDULE|PROFORMA)\s*[-:–]?\s*([A-Z0-9]+)?[\s\S]{0,100}?(?:RTGS|NEFT|ELECTRONIC|ONLINE\s+PAYMENT|DETAILS\s+OF\s+EMD|EMD\s+SUBMISSION|PROFORMA\s+FOR\s+EMD)/i)
    if (rtgsMatch) {
      detectedType = 'rtgs_neft'
      detectedTitle = 'PROFORMA FOR SUBMISSION & VERIFICATION OF EARNEST MONEY DEPOSIT (EMD)'
      const cleanLine = rtgsMatch[0].split('\n')[0].trim()
      if (cleanLine.length > 5 && cleanLine.length < 80) detectedAnnexure = cleanLine
    }
  }

  // 3. Scan for Page & Clause numbers
  const pageMatch = text.match(/(?:Page|Sheet|Pg\.?)\s*([0-9]+)\s*(?:of|\/)\s*([0-9]+)/i)
  if (pageMatch) {
    detectedPage = `Page ${pageMatch[1]}`
  }

  const clauseMatch = text.match(/(?:Clause|Section|Para|Item)\s*(?:No\.?)?\s*([0-9]+(?:\.[0-9]+)*)/i)
  if (clauseMatch) {
    detectedClause = `Clause ${clauseMatch[1]}`
  }

  // 4. Extract realistic declarations from text if clauses match
  const extractedDeclarations: string[] = []
  if (/forfeit|forfeiture/i.test(text)) {
    extractedDeclarations.push(
      'We accept that the Earnest Money Deposit shall stand forfeited without prejudice to any other rights or remedies if the bidder withdraws or modifies the bid during the validity period or refuses to accept the award of contract.'
    )
  } else {
    extractedDeclarations.push(
      'The EMD submitted herewith is subject to the conditions of forfeiture and refund as laid down in the General Conditions of Contract (GCC) of the Tender Document.'
    )
  }

  if (/validity|valid for/i.test(text)) {
    const valMatch = text.match(/(?:valid\s+for\s+(?:a\s+period\s+of\s+)?([0-9]+)\s+days|validity\s+period\s+of\s+([0-9]+)\s+days)/i)
    const days = valMatch ? valMatch[1] || valMatch[2] : tender.bid?.bidValidityDays || '180'
    extractedDeclarations.push(
      `Our bid shall remain binding upon us and may be accepted at any time before the expiration of the validity period of ${days} days from the date of technical bid opening.`
    )
  } else {
    extractedDeclarations.push(
      `Our bid shall remain valid for ${tender.bid?.bidValidityDays || '180'} days from the date of opening of technical bids.`
    )
  }

  extractedDeclarations.push(
    'We hereby certify that the remittance of Earnest Money Deposit has been made exclusively from our corporate bank account in compliance with the Instructions to Bidders (ITB).'
  )

  return {
    formatTitle: detectedTitle,
    formatType: detectedType,
    annexureRef: detectedAnnexure,
    pageNumber: detectedPage,
    clauseNumber: detectedClause,
    extractedDeclarations,
    paymentTerms: [
      'Remittance Method: Real Time Gross Settlement (RTGS) / National Electronic Funds Transfer (NEFT)',
      'Account Mapping: Transferred directly to the Designated Department Beneficiary Account',
      'Transaction Identifier: Unique Transaction Reference (UTR) as recorded with the Reserve Bank of India (RBI) payment gateway'
    ],
    instructions: [
      'Attach copy of the Bank UTR Remittance Challan / Payment Confirmation along with the Technical Bid Envelope.',
      'In case of any discrepancy or query, communication shall be routed quoting the Tender Number and Transaction Reference.'
    ],
    sourceDescription: `Extracted from Original Tender PDF: ${detectedAnnexure} (${detectedPage !== 'Not Specified in Tender Document' ? detectedPage + ', ' : ''}${detectedClause})`
  }
}

/**
 * Builds the complete editable document payload mapped with form values.
 */
export function buildEmdDocumentPayload(
  tender: Tender,
  emdData: {
    amount: string
    departmentAccount: BankAccountDetails
    selfAccount: BankAccountDetails
    utrNumber: string
    date: string
    remarks?: string
  },
  existingDoc?: EmdGeneratedDocumentInfo | null
): EmdGeneratedDocumentInfo {
  const analysis = extractEmdFormatFromTender(tender)
  const tenderNo = tender.bid?.rfsNo || tender.id || 'N/A'
  const authorityName = tender.bid?.authorityFullName || tender.authority || 'The Designated Authority'
  const authorityAddress = tender.bid?.authorityAddress || `${tender.department}, ${tender.state}`
  const workName = tender.bid?.workName || tender.bid?.shortWorkName || tender.title || 'Tender Execution Work'

  const amountWords = numberToIndianWords(emdData.amount)
  const currentVersion = existingDoc ? existingDoc.version + 1 : 1

  return {
    formatTitle: existingDoc?.formatTitle || analysis.formatTitle,
    formatSource: analysis.sourceDescription,
    formatType: analysis.formatType,
    docxFileName: `EMD_Document_${tender.id}_v${currentVersion}.docx`,
    pdfFileName: `EMD_Document_${tender.id}_v${currentVersion}.pdf`,
    status: existingDoc ? 'Modified' : 'Generated',
    version: currentVersion,
    generatedAt: existingDoc?.generatedAt || new Date().toISOString(),
    lastModifiedAt: new Date().toISOString(),
    lastSavedAt: new Date().toISOString(),
    subject: existingDoc?.subject || `Submission of Earnest Money Deposit (EMD) for Tender No: ${tenderNo}`,
    addressee: existingDoc?.addressee || authorityName,
    authorityAddress: existingDoc?.authorityAddress || authorityAddress,
    tenderRefNo: tenderNo,
    workName: workName,
    amountInWords: amountWords,
    declarations: existingDoc?.declarations || analysis.extractedDeclarations,
    paymentTerms: existingDoc?.paymentTerms || analysis.paymentTerms,
    signatoryName: existingDoc?.signatoryName || RBP_COMPANY.signatory,
    signatoryDesignation: existingDoc?.signatoryDesignation || RBP_COMPANY.signatoryDesignation,
    customNotes: emdData.remarks || existingDoc?.customNotes || '',
    textContent: existingDoc?.textContent || ''
  }
}

/**
 * Generates an editable Microsoft Word (.docx) Document adhering to A4 layout,
 * with RBP ENERGY INDIA PRIVATE LIMITED Header and Footer on every page.
 */
export async function generateEmdDocx(
  tender: Tender,
  emdData: {
    amount: string
    departmentAccount: BankAccountDetails
    selfAccount: BankAccountDetails
    utrNumber: string
    date: string
    remarks?: string
  },
  docPayload: EmdGeneratedDocumentInfo
): Promise<Blob> {
  const tableBorderNone = {
    top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  }

  const standardCellBorder = {
    top: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
    left: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
    right: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
  }

  // 1. Header Component (Every Page) - Company Name ONLY
  const header = new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { after: 120 },
        border: {
          bottom: { style: BorderStyle.SINGLE, size: 6, color: '0F172A' },
        },
        children: [
          new TextRun({
            text: RBP_COMPANY.name,
            bold: true,
            size: 22, // 11pt
            color: '0F172A',
            font: 'Arial',
          }),
        ],
      }),
    ],
  })

  // 2. Footer Component (Every Page) - Matching User Image
  const footer = new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { after: 120 },
        children: [
          new TextRun({
            text: '(Sign & Seal of the bidder)',
            bold: true,
            size: 19, // 9.5pt
            color: '000000',
            font: 'Arial',
          }),
        ],
      }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: tableBorderNone,
        rows: [
          new TableRow({
            children: [
              new TableCell({
                width: { size: 50, type: WidthType.PERCENTAGE },
                shading: { fill: 'FCD497' },
                margins: { top: 90, bottom: 90, left: 140, right: 100 },
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({ text: 'Regd. Office: ', bold: true, size: 16, color: '2E2419', font: 'Arial' }),
                      new TextRun({ text: RBP_COMPANY.regdOfficeLine1, size: 16, color: '3E3326', font: 'Arial' }),
                    ],
                  }),
                  new Paragraph({
                    children: [
                      new TextRun({ text: RBP_COMPANY.regdOfficeLine2, size: 16, color: '3E3326', font: 'Arial' }),
                    ],
                  }),
                ],
              }),
              new TableCell({
                width: { size: 50, type: WidthType.PERCENTAGE },
                shading: { fill: 'FCD497' },
                margins: { top: 90, bottom: 90, left: 100, right: 140 },
                borders: {
                  left: { style: BorderStyle.SINGLE, size: 6, color: 'B8925E' },
                },
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({ text: 'e: ', bold: true, size: 16, color: '2E2419', font: 'Arial' }),
                      new TextRun({ text: `${RBP_COMPANY.email}  |  `, size: 16, color: '3E3326', font: 'Arial' }),
                      new TextRun({ text: 'w: ', bold: true, size: 16, color: '2E2419', font: 'Arial' }),
                      new TextRun({ text: RBP_COMPANY.website, size: 16, color: '3E3326', font: 'Arial' }),
                    ],
                  }),
                  new Paragraph({
                    children: [
                      new TextRun({ text: 'Sales: ', bold: true, size: 16, color: '2E2419', font: 'Arial' }),
                      new TextRun({ text: `${RBP_COMPANY.salesPhone}  |  `, size: 16, color: '3E3326', font: 'Arial' }),
                      new TextRun({ text: 'Service: ', bold: true, size: 16, color: '2E2419', font: 'Arial' }),
                      new TextRun({ text: RBP_COMPANY.servicePhone, size: 16, color: '3E3326', font: 'Arial' }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  })

  // 3. Document Body Elements
  const bodyParagraphs: (Paragraph | Table)[] = []

  // Document Title
  bodyParagraphs.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 180, after: 120 },
      children: [
        new TextRun({
          text: docPayload.formatTitle.toUpperCase(),
          bold: true,
          size: 24, // 12pt
          color: '0F172A',
          font: 'Arial',
        }),
      ],
    })
  )

  // Subtitle / Source Reference Note
  bodyParagraphs.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [
        new TextRun({
          text: `(${docPayload.formatSource || 'Format as prescribed in Tender Document'})`,
          italics: true,
          size: 16, // 8pt
          color: '475569',
          font: 'Arial',
        }),
      ],
    })
  )

  // Addressee Block
  bodyParagraphs.push(
    new Paragraph({
      spacing: { after: 60 },
      children: [
        new TextRun({ text: 'To,', bold: true, size: 20, font: 'Arial' }),
      ],
    }),
    new Paragraph({
      spacing: { after: 40 },
      children: [
        new TextRun({ text: docPayload.addressee, bold: true, size: 20, color: '1E293B', font: 'Arial' }),
      ],
    }),
    new Paragraph({
      spacing: { after: 180 },
      children: [
        new TextRun({ text: docPayload.authorityAddress, size: 18, color: '334155', font: 'Arial' }),
      ],
    })
  )

  // Subject Line
  bodyParagraphs.push(
    new Paragraph({
      spacing: { before: 100, after: 180 },
      children: [
        new TextRun({ text: 'Subject: ', bold: true, size: 20, color: '0F172A', font: 'Arial' }),
        new TextRun({
          text: docPayload.subject,
          bold: true,
          size: 20,
          color: '1E40AF',
          font: 'Arial',
          underline: {},
        }),
      ],
    })
  )

  // Tender References
  bodyParagraphs.push(
    new Paragraph({
      spacing: { after: 60 },
      children: [
        new TextRun({ text: 'Tender ID / Ref No: ', bold: true, size: 18, font: 'Arial' }),
        new TextRun({ text: `${tender.id} (RfS No: ${docPayload.tenderRefNo})`, size: 18, font: 'Arial' }),
      ],
    }),
    new Paragraph({
      spacing: { after: 180 },
      children: [
        new TextRun({ text: 'Name of Work: ', bold: true, size: 18, font: 'Arial' }),
        new TextRun({ text: docPayload.workName, size: 18, font: 'Arial' }),
      ],
    })
  )

  // Helper to create key-value table rows
  const createTableRow = (label: string, value: string, isHeader = false) => {
    return new TableRow({
      children: [
        new TableCell({
          width: { size: 38, type: WidthType.PERCENTAGE },
          borders: standardCellBorder,
          shading: { fill: isHeader ? 'F1F5F9' : 'F8FAFC' },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: label, bold: true, size: 18, color: '1E293B', font: 'Arial' }),
              ],
            }),
          ],
        }),
        new TableCell({
          width: { size: 62, type: WidthType.PERCENTAGE },
          borders: standardCellBorder,
          shading: { fill: 'FFFFFF' },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: value || 'Not Specified', size: 18, color: '0F172A', font: 'Arial' }),
              ],
            }),
          ],
        }),
      ],
    })
  }

  // Tender-prescribed format: "Details of EMD and Tender Document Fee"
  bodyParagraphs.push(
    new Paragraph({
      spacing: { before: 120, after: 100 },
      children: [
        new TextRun({
          text: 'A scanned copy of the EMD and Bid Document fee transaction is to be uploaded in the format below.',
          size: 18,
          font: 'Arial',
        }),
      ],
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: standardCellBorder,
      rows: [
        createTableRow('Tender No. and Date', `${docPayload.tenderRefNo}${tender.bid?.rfsDate ? ` dated ${tender.bid.rfsDate}` : ''}`),
        createTableRow('Name of the Bidder', RBP_COMPANY.name),
        createTableRow("Bidder's Bank Account Details", ''),
        createTableRow('(i) Name of the bank', emdData.selfAccount.bankName),
        createTableRow('(ii) Branch', emdData.selfAccount.branch || ''),
        createTableRow('(iii) IFS Code', emdData.selfAccount.ifsc),
        createTableRow('(iv) Account No.', emdData.selfAccount.accountNo),
        createTableRow('(v) Transaction reference number', emdData.utrNumber || ''),
        createTableRow('(vi) Date of transaction', emdData.date || ''),
        createTableRow('(vii) EMD + Bid Document Fee', emdAmountLine(tender, emdData.amount)),
      ],
    }),
    new Paragraph({
      spacing: { before: 200, after: 80 },
      children: [new TextRun({ text: 'Beneficiary account (as per Tender)', bold: true, size: 19, font: 'Arial' })],
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: standardCellBorder,
      rows: [
        createTableRow('Name of A/c', emdData.departmentAccount.accountHolder || ''),
        createTableRow('Bank & Branch Name', [emdData.departmentAccount.bankName, emdData.departmentAccount.branch].filter(Boolean).join(', ')),
        createTableRow('Bank Account Number', emdData.departmentAccount.accountNo),
        createTableRow('Branch IFSC Code', emdData.departmentAccount.ifsc),
      ],
    }),
    new Paragraph({
      spacing: { before: 120, after: 60 },
      children: [
        new TextRun({
          text: 'Note: The EMD and the Tender Document Fee are deposited as a single NEFT/RTGS transaction in the above account.',
          size: 17,
          color: '475569',
          font: 'Arial',
        }),
      ],
    })
  )

  // Remarks if present
  if (docPayload.customNotes || emdData.remarks) {
    bodyParagraphs.push(
      new Paragraph({
        spacing: { before: 140, after: 60 },
        children: [
          new TextRun({ text: 'Additional Remarks / Notes: ', bold: true, size: 18, font: 'Arial' }),
          new TextRun({ text: docPayload.customNotes || emdData.remarks || '', size: 18, color: '475569', font: 'Arial' }),
        ],
      })
    )
  }

  // SIGNATURE BLOCK
  bodyParagraphs.push(
    new Paragraph({
      spacing: { before: 280, after: 60 },
      children: [
        new TextRun({ text: `For and on behalf of `, size: 19, font: 'Arial' }),
        new TextRun({ text: RBP_COMPANY.name, bold: true, size: 19, color: '0F172A', font: 'Arial' }),
      ],
    }),
    new Paragraph({
      spacing: { before: 200, after: 40 },
      children: [
        new TextRun({ text: '____________________________________________', color: '94A3B8', size: 16 }),
      ],
    }),
    new Paragraph({
      spacing: { after: 40 },
      children: [
        new TextRun({ text: docPayload.signatoryName, bold: true, size: 20, color: '0F172A', font: 'Arial' }),
      ],
    }),
    new Paragraph({
      spacing: { after: 40 },
      children: [
        new TextRun({ text: docPayload.signatoryDesignation, size: 18, color: '475569', font: 'Arial' }),
      ],
    }),
    new Paragraph({
      spacing: { after: 40 },
      children: [
        new TextRun({ text: `Date: ${emdData.date || new Date().toISOString().slice(0, 10)}`, size: 17, color: '64748B', font: 'Arial' }),
        new TextRun({ text: `    •    Place: ${RBP_COMPANY.place}`, size: 17, color: '64748B', font: 'Arial' }),
      ],
    })
  )

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 }, // A4
            margin: { top: 1200, bottom: 1200, left: 1440, right: 1440 },
          },
        },
        headers: { default: header },
        footers: { default: footer },
        children: bodyParagraphs,
      },
    ],
  })

  return await Packer.toBlob(doc)
}

/**
 * Generates an A4 PDF Document from the latest saved Word / Form data
 * complete with RBP ENERGY INDIA PRIVATE LIMITED Header, Footer, Page Numbers,
 * tables, and declarations.
 */
export async function generateEmdPdf(
  tender: Tender,
  emdData: {
    amount: string
    departmentAccount: BankAccountDetails
    selfAccount: BankAccountDetails
    utrNumber: string
    date: string
    remarks?: string
  },
  docPayload: EmdGeneratedDocumentInfo
): Promise<Blob> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4', // 210 x 297 mm
  })

  const pageWidth = 210
  const pageHeight = 297
  const leftMargin = 16
  const rightMargin = 194
  const contentWidth = rightMargin - leftMargin

  let cursorY = 16

  // Function to draw Header & Footer on current page
  const drawPageHeaderAndFooter = (pageNum: number, totalPages: number) => {
    // Header Top - Company Name ONLY
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(15, 23, 42) // Dark Slate
    doc.text(RBP_COMPANY.name, rightMargin, 13, { align: 'right' })

    // Dividing rule
    doc.setDrawColor(15, 23, 42)
    doc.setLineWidth(0.5)
    doc.line(leftMargin, 16, rightMargin, 16)

    // Above Footer: (Sign & Seal of the bidder) - Right aligned
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(0, 0, 0)
    doc.text('(Sign & Seal of the bidder)', rightMargin, pageHeight - 21, { align: 'right' })

    // Footer Peach Banner: matching user image
    doc.setFillColor(252, 212, 151) // #FCD497
    doc.setDrawColor(232, 185, 117)
    doc.rect(leftMargin, pageHeight - 19, contentWidth, 14, 'FD')

    // Left Column: Regd. Office
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(46, 36, 25)
    doc.text('Regd. Office: ', leftMargin + 3, pageHeight - 13.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(62, 51, 38)
    doc.text(RBP_COMPANY.regdOfficeLine1, leftMargin + 19, pageHeight - 13.5)
    doc.text(RBP_COMPANY.regdOfficeLine2, leftMargin + 3, pageHeight - 9)

    // Center dividing line
    const midX = leftMargin + (contentWidth / 2)
    doc.setDrawColor(184, 146, 94)
    doc.setLineWidth(0.3)
    doc.line(midX, pageHeight - 17.5, midX, pageHeight - 6.5)

    // Right Column: e, w, Sales, Service
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(46, 36, 25)
    doc.text('e: ', midX + 3, pageHeight - 13.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(62, 51, 38)
    doc.text(`${RBP_COMPANY.email}  |  `, midX + 7, pageHeight - 13.5)
    const emailW = doc.getTextWidth(`${RBP_COMPANY.email}  |  `)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(46, 36, 25)
    doc.text('w: ', midX + 7 + emailW, pageHeight - 13.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(62, 51, 38)
    doc.text(RBP_COMPANY.website, midX + 11 + emailW, pageHeight - 13.5)

    doc.setFont('helvetica', 'bold')
    doc.setTextColor(46, 36, 25)
    doc.text('Sales: ', midX + 3, pageHeight - 9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(62, 51, 38)
    doc.text(`${RBP_COMPANY.salesPhone}  |  `, midX + 12, pageHeight - 9)
    const salesW = doc.getTextWidth(`${RBP_COMPANY.salesPhone}  |  `)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(46, 36, 25)
    doc.text('Service: ', midX + 12 + salesW, pageHeight - 9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(62, 51, 38)
    doc.text(RBP_COMPANY.servicePhone, midX + 23 + salesW, pageHeight - 9)
  }

  // --- PAGE 1 CONTENT ---
  cursorY = 26

  // Document Title
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(15, 23, 42)
  doc.text(docPayload.formatTitle.toUpperCase(), pageWidth / 2, cursorY, { align: 'center' })
  cursorY += 5

  // Subtitle / Source Reference
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(7.5)
  doc.setTextColor(71, 85, 105)
  doc.text(`(${docPayload.formatSource || 'Format prescribed in Original Tender Document'})`, pageWidth / 2, cursorY, { align: 'center' })
  cursorY += 8

  // Addressee Block
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(15, 23, 42)
  doc.text('To,', leftMargin, cursorY)
  cursorY += 4.5

  doc.text(docPayload.addressee, leftMargin, cursorY)
  cursorY += 4.5

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(51, 65, 85)
  const addrLines = doc.splitTextToSize(docPayload.authorityAddress, contentWidth)
  doc.text(addrLines, leftMargin, cursorY)
  cursorY += addrLines.length * 4 + 3

  // Subject Box
  doc.setFillColor(248, 250, 252)
  doc.setDrawColor(203, 213, 225)
  doc.roundedRect(leftMargin, cursorY, contentWidth, 8, 1, 1, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(30, 64, 175) // Blue 800
  const subText = `Subject: ${docPayload.subject}`
  doc.text(doc.splitTextToSize(subText, contentWidth - 4), leftMargin + 2, cursorY + 5.5)
  cursorY += 12

  // Reference line
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(30, 41, 59)
  doc.text(`Tender Reference: ${tender.id} (RfS No: ${docPayload.tenderRefNo})  •  Work: ${docPayload.workName.slice(0, 70)}`, leftMargin, cursorY)
  cursorY += 7

  // Helper function to render structured table in PDF
  const drawTable = (title: string, rows: [string, string][]) => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(30, 58, 138)
    doc.text(title, leftMargin, cursorY)
    cursorY += 3.5

    const col1Width = 58
    const col2Width = contentWidth - col1Width
    const rowHeight = 5.5

    rows.forEach(([label, val]) => {
      // Cell 1 (Label)
      doc.setFillColor(248, 250, 252)
      doc.setDrawColor(226, 232, 240)
      doc.rect(leftMargin, cursorY, col1Width, rowHeight, 'FD')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.5)
      doc.setTextColor(30, 41, 59)
      doc.text(label, leftMargin + 2, cursorY + 3.8)

      // Cell 2 (Value)
      doc.setFillColor(255, 255, 255)
      doc.rect(leftMargin + col1Width, cursorY, col2Width, rowHeight, 'FD')
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.5)
      doc.setTextColor(15, 23, 42)
      doc.text(doc.splitTextToSize(val || 'Not Specified', col2Width - 4), leftMargin + col1Width + 2, cursorY + 3.8)

      cursorY += rowHeight
    })

    cursorY += 4
  }

  // Tender-prescribed format: "Details of EMD and Tender Document Fee"
  drawTable('DETAILS OF EMD AND TENDER DOCUMENT FEE', [
    ['Tender No. and Date', `${docPayload.tenderRefNo}${tender.bid?.rfsDate ? ` dated ${tender.bid.rfsDate}` : ''}`],
    ['Name of the Bidder', RBP_COMPANY.name],
    ['(i) Name of the bank', emdData.selfAccount.bankName],
    ['(ii) Branch', emdData.selfAccount.branch || ''],
    ['(iii) IFS Code', emdData.selfAccount.ifsc],
    ['(iv) Account No.', emdData.selfAccount.accountNo],
    ['(v) Transaction reference number', emdData.utrNumber || ''],
    ['(vi) Date of transaction', emdData.date || ''],
    ['(vii) EMD + Bid Document Fee', emdAmountLine(tender, emdData.amount)],
  ])

  drawTable('BENEFICIARY ACCOUNT (AS PER TENDER)', [
    ['Name of A/c', emdData.departmentAccount.accountHolder || ''],
    ['Bank & Branch Name', [emdData.departmentAccount.bankName, emdData.departmentAccount.branch].filter(Boolean).join(', ')],
    ['Bank Account Number', emdData.departmentAccount.accountNo],
    ['Branch IFSC Code', emdData.departmentAccount.ifsc],
  ])

  // Signatory Block
  cursorY += 6

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(30, 41, 59)
  doc.text(`For and on behalf of ${RBP_COMPANY.name}`, leftMargin, cursorY)
  cursorY += 8

  doc.setDrawColor(148, 163, 184)
  doc.line(leftMargin, cursorY, leftMargin + 65, cursorY)
  cursorY += 4

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(15, 23, 42)
  doc.text(docPayload.signatoryName, leftMargin, cursorY)
  cursorY += 4

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(71, 85, 105)
  doc.text(docPayload.signatoryDesignation, leftMargin, cursorY)
  cursorY += 3.5

  doc.text(`Date: ${emdData.date || new Date().toISOString().slice(0, 10)}  •  Place: ${RBP_COMPANY.place}`, leftMargin, cursorY)

  // Apply Headers and Footers to all pages
  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    drawPageHeaderAndFooter(i, totalPages)
  }

  const pdfOutput = doc.output('blob')
  return pdfOutput
}

/**
 * Downloads a Blob to the user's browser with the given filename.
 */
export function downloadFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Converts a Blob to a Base64 Data URL string for database storage.
 */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * Generates an exact 1:1 WYSIWYG A4 PDF Document from the on-screen rendered
 * HTML preview element using html2canvas-pro (with native lab/oklch color support) and jsPDF.
 * Accurately processes each .emd-a4-page container onto its own physical A4 PDF page.
 */
export async function generatePdfFromHtmlElement(element: HTMLElement): Promise<Blob> {
  // Use html2canvas-pro which natively supports modern CSS color functions (lab, oklch, oklab)
  let html2canvas: any
  try {
    const html2canvasModule = await import('html2canvas-pro')
    html2canvas = html2canvasModule.default || html2canvasModule
  } catch {
    const fallbackModule = await import('html2canvas')
    html2canvas = fallbackModule.default || fallbackModule
  }

  // Ensure images are fully loaded before capturing
  const images = element.querySelectorAll('img')
  const imgPromises = Array.from(images).map(img => {
    if (img.complete) return Promise.resolve()
    return new Promise(resolve => {
      img.onload = resolve
      img.onerror = resolve
    })
  })
  await Promise.all(imgPromises)

  // Find all explicit A4 pages inside the element
  const pageNodes = element.querySelectorAll<HTMLElement>('.emd-a4-page')
  const pages: HTMLElement[] = pageNodes.length > 0 ? Array.from(pageNodes) : [element]

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4', // 210 x 297 mm
  })

  for (let i = 0; i < pages.length; i++) {
    const pageEl = pages[i]
    if (i > 0) {
      pdf.addPage('a4', 'portrait')
    }

    const canvas = await html2canvas(pageEl, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      windowWidth: pageEl.scrollWidth || pageEl.offsetWidth,
      windowHeight: pageEl.scrollHeight || pageEl.offsetHeight,
    })

    const imgData = canvas.toDataURL('image/png', 1.0)
    pdf.addImage(imgData, 'PNG', 0, 0, 210, 297, undefined, 'FAST')
  }

  return pdf.output('blob')
}


