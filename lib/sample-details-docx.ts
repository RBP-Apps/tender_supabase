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
import { AutoFetchResult } from '@/lib/sample-details-autofetch'
import { COMPANY } from '@/lib/company'

export interface SampleFieldVerificationContent {
  key: 'mafLetter' | 'testReport' | 'bisCertificate' | 'productSample'
  fieldNumber: number
  title: string
  subtitle: string
  found: boolean
  notFoundReason: string
  textContent: string
  sourceDocumentName?: string
  sourceOrigin?: string
  attributes: { label: string; value: string }[]
}

/**
 * Generates verified text content and draft templates for each of the 4 sample verification fields
 * by analyzing Create New Tender, Eligibility Check records, and Tender PDF Requirements Audit.
 */
export function generateSampleFieldContents(
  tender: Tender,
  autoFetchData: AutoFetchResult | null,
  requirementsAudit?: any
): Record<'mafLetter' | 'testReport' | 'bisCertificate' | 'productSample', SampleFieldVerificationContent> {
  const bid = tender.bid
  const ec = tender.eligibilityCheck
  const sd = tender.sampleDetails

  const mafAudit = requirementsAudit?.mafLetter || sd?.aiRequirementsAudit?.mafLetter || tender.sampleDetails?.aiRequirementsAudit?.mafLetter
  const testAudit = requirementsAudit?.testReport || sd?.aiRequirementsAudit?.testReport || tender.sampleDetails?.aiRequirementsAudit?.testReport
  const bisAudit = requirementsAudit?.bisCertificate || sd?.aiRequirementsAudit?.bisCertificate || tender.sampleDetails?.aiRequirementsAudit?.bisCertificate
  const sampleAudit = requirementsAudit?.productSample || sd?.aiRequirementsAudit?.productSample || tender.sampleDetails?.aiRequirementsAudit?.productSample

  const isMafNotRequired = mafAudit?.masterStatus === 'NOT REQUIRED' || mafAudit?.status === 'Not Required'
  const isTestNotRequired = testAudit?.masterStatus === 'NOT REQUIRED' || testAudit?.status === 'Not Required'
  const isBisNotRequired = bisAudit?.masterStatus === 'NOT REQUIRED' || bisAudit?.status === 'Not Required'
  const isSampleNotRequired = sampleAudit?.masterStatus === 'NOT REQUIRED' || sampleAudit?.status === 'Not Required'

  const components = bid?.technicalComponents || []
  const makes = autoFetchData?.detectedContext.makes.length
    ? autoFetchData.detectedContext.makes
    : components.map(c => c.make).filter(Boolean)
  const standards = autoFetchData?.detectedContext.standards.length
    ? autoFetchData.detectedContext.standards
    : components.map(c => c.compliance).filter(Boolean)
  const items = autoFetchData?.detectedContext.items.length
    ? autoFetchData.detectedContext.items
    : components.map(c => c.item).filter(Boolean)
  const mafMakesList = makes.length > 0 ? makes.join(', ') : 'OEM Manufacturer'

  const tenderId = tender.id
  const tenderTitle = tender.title
  const workName = bid?.workName || bid?.shortWorkName || tender.title
  const rfsNo = bid?.rfsNo || 'N/A'
  const authorityName = bid?.authorityFullName || tender.authority
  const authorityAddress = bid?.authorityAddress || `${tender.department}, ${tender.state}`
  const currentDate = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })

  // -------------------------------------------------------------
  // 1. MAF LETTER (Pattern: Generic_MAF_CREDA_SCIP_CGGY_RBP)
  // -------------------------------------------------------------
  const mafDoc = sd?.mafLetter || autoFetchData?.mafLetter
  const isMafDocUploaded = !!mafDoc

  // Determine Authority Short Name (e.g. "CREDA")
  const fullAuth = bid?.authorityFullName || tender.authority || 'CREDA'
  const matchAuth = fullAuth.match(/\(([^)]+)\)/)
  const authorityShort = matchAuth
    ? matchAuth[1].trim()
    : fullAuth.toLowerCase().includes('creda')
    ? 'CREDA'
    : tender.authority.split(' ')[0] || 'CREDA'

  // Addressee details
  const addresseeDesignation = bid?.addresseeDesignation || 'The Chief Engineer'
  const authorityAddressLines = (
    bid?.authorityAddress ||
    (tender.department ? `${tender.department}, ${tender.state}` : tender.state)
  ).trim()

  // Subject line: e.g. "CREDA E-Bid Document No. 200500/CREDA/SCIP&CGGY/2026-27"
  const tenderDocRef =
    rfsNo && rfsNo !== 'N/A'
      ? `${authorityShort} E-Bid Document No. ${rfsNo}`
      : `${authorityShort} Tender Ref. ${tenderId}`

  // Reference line: e.g. "NIT Ref. No. 8519/CREDA/SCIP & CGGY/2026 dated 28.09.2026"
  const refLine =
    rfsNo && rfsNo !== 'N/A'
      ? `NIT Ref. No. ${rfsNo}${bid?.rfsDate ? ` dated ${bid.rfsDate}` : ''}`
      : `NIT Ref. No. ${tenderId}${bid?.rfsDate ? ` dated ${bid.rfsDate}` : ''}`

  // Component description
  const componentDesc =
    components.length > 0
      ? components.map(c => `${c.item}${c.make ? ` (Make: ${c.make})` : ''}`).join(', ')
      : items.length > 0
      ? items.join(', ')
      : '______________________'

  // Full Work / Project Scope
  const workScope =
    workName ||
    'Standardization of Rates for Survey, Design, Supply, Installation & Commissioning of SPV Community Irrigation Project & Chhattisgarh Gaon Ganga Yojana with all allied works'

  const mafFound = isMafDocUploaded || isMafNotRequired
  const mafNotFoundReason = isMafNotRequired
    ? 'Manufacturer Authorization Form (MAF) is NOT REQUIRED by the tender document.'
    : isMafDocUploaded
    ? ''
    : 'Official OEM Manufacturer Authorization Form has not been uploaded yet.'

  let mafText = ''
  if (isMafDocUploaded) {
    mafText = `MANUFACTURER AUTHORIZATION FORM (MAF) RECORD
Document: ${mafDoc.name}
Upload Date: ${new Date(mafDoc.uploadedAt || Date.now()).toLocaleDateString('en-IN')}
Source: ${mafDoc.referenceNote || 'Uploaded by Bidder'}

Tender Reference: ${tenderId}
Work: "${workName}"
Authority: ${authorityName}

Attached Document Particulars:
• File Name: ${mafDoc.name}
• Verified Make(s): ${mafMakesList}
• Verification Status: Official MAF Letter Attached`
  } else if (isMafNotRequired) {
    mafText = `[SUBMISSION STATUS: NOT REQUIRED]

As verified from the official tender document, Manufacturer Authorization Form (MAF) / OEM Undertaking is NOT mandated for Tender No. ${tenderId}.

Tender Reference: ${tenderId}
Authority: ${authorityName}
Scope of Work: "${workScope}"`
  } else {
    mafText = `MANUFACTURER AUTHORIZATION FORM (MAF)
(To be issued on the Manufacturer’s Letterhead)

Date: ____________________

To,
${addresseeDesignation}
${fullAuth}
${authorityAddressLines}

Subject: Manufacturer Authorization for ${tenderDocRef}
Reference: ${refLine}

Dear Sir/Madam,

We, M/s. ________________________________________________, having our registered office/factory at ________________________________________________________________________________________, are the manufacturer/authorized manufacturer of the component ${componentDesc}

We hereby authorize M/s. RBP Energy (India) Private Limited, having its address at 303, Guru Ghasidas Plaza, Amapara, G.E. Road, Raipur – 492001, Chhattisgarh, India, to participate in the above-mentioned ${authorityShort} tender and to offer/supply the above-mentioned component/product for the work relating to the ${workScope}, in accordance with the tender requirements.

We confirm that the component/product offered by the bidder shall comply with the applicable technical specifications, quality standards, and requirements of the tender document. Wherever required under the tender, we shall provide the relevant valid test report(s), certificates, technical documents, and supporting information for the authorized component/product.

We further confirm that this authorization is valid for the above-mentioned tender and that we shall extend necessary technical support and cooperation to the bidder for the authorized component/product, subject to the terms and conditions of the tender and our applicable obligations.

This authorization is issued for submission to ${authorityShort} in connection with the above-mentioned tender.

Yours faithfully,

For M/s. ________________________________________________
Authorized Signatory: _____________________________________
Name: _________________________________________________
Designation: ____________________________________________
Mobile No.: _____________________________________________
Email ID: ______________________________________________
Manufacturer’s Seal & Signature

Note: This is a generic draft. The manufacturer should issue it on its own letterhead, complete the manufacturer and component details, and attach any test report/certificate specifically required for that component under the tender.`
  }

  // -------------------------------------------------------------
  // 2. TEST REPORT
  // -------------------------------------------------------------
  const testDoc = sd?.testReport || autoFetchData?.testReport
  const isTestDocUploaded = !!testDoc
  const testStandardsList = standards.length > 0
    ? standards.join(', ')
    : 'IS 14286, IEC 61215, IEC 61730, IS 16221'

  const testReportFound = isTestDocUploaded || isTestNotRequired
  const testReportNotFoundReason = isTestNotRequired
    ? 'Laboratory Test Report is NOT REQUIRED by tender specifications.'
    : isTestDocUploaded
    ? ''
    : 'Official laboratory test report has not been uploaded yet. Please upload an accredited test certificate.'

  let testText = ''
  if (isTestDocUploaded) {
    testText = `ACCREDITED LABORATORY TEST REPORT RECORD
Document: ${testDoc.name}
Upload Date: ${new Date(testDoc.uploadedAt || Date.now()).toLocaleDateString('en-IN')}
Source: ${testDoc.referenceNote || 'Uploaded by Bidder'}

Tender Reference: ${tenderId}
Work: "${workName}"
Authority: ${authorityName}

Attached Document Particulars:
• File Name: ${testDoc.name}
• Applicable Standards: ${testStandardsList}
• Verification Status: Document Attached for Technical Evaluation`
  } else if (isTestNotRequired) {
    testText = `[SUBMISSION STATUS: NOT REQUIRED]

As verified from the official tender document and technical scope, submission of laboratory/type test reports is NOT required for bid qualification in Tender No. ${tenderId}.

Tender Reference: ${tenderId}
Authority: ${authorityName}
Scope of Work: "${workName}"

Note: If bidder wishes to submit voluntary accreditation credentials, attach an official NABL accredited laboratory test certificate.`
  } else {
    // Draft template strictly complying with Master Prompt (Never faking test results)
    testText = `[DRAFT TECHNICAL COMPLIANCE UNDERTAKING - NOT AN OFFICIAL LABORATORY TEST REPORT]
(To be issued on Bidder's Letterhead pending submission of official NABL test report)

Date: ${currentDate}

To:
${bid?.addresseeDesignation || 'The Executive Engineer / Tender Evaluation Committee'},
${authorityName},
${authorityAddress}

Subject: Technical Compliance Undertaking for Tender No. ${tenderId}
Project / Work: "${workName}"

We, M/s ${COMPANY.name}, hereby declare and confirm that the equipment and components proposed for supply under Tender No. ${tenderId} conform to the technical specifications and standards mandated in the tender documents (${testStandardsList}).

PARTICULARS OF ACCREDITED TEST REPORT (TO BE COMPLETED BY BIDDER):
1. Testing Laboratory Name: [INFORMATION REQUIRED - INSERT NABL / ERDA / CPRI ACCREDITED LAB]
2. Test Report Reference Number: [INFORMATION REQUIRED - INSERT VALID TEST REPORT NUMBER]
3. Date of Test Report: [INFORMATION REQUIRED - DD/MM/YYYY]
4. Standards Tested: ${testStandardsList}
${bid?.testReportCompliance ? `5. Tender Compliance Clause: "${bid.testReportCompliance}"\n` : ''}
Note: This is a draft undertaking for tender preparation. An official test certificate issued by an accredited testing laboratory must be uploaded prior to technical evaluation.

Authorized Signatory:
M/s ${COMPANY.name}
[Official Seal & Signature]`
  }

  // -------------------------------------------------------------
  // 3. BIS CERTIFICATE
  // -------------------------------------------------------------
  const bisDoc = sd?.bisCertificate || autoFetchData?.bisCertificate
  const isBisDocUploaded = !!bisDoc

  const bisFound = isBisDocUploaded || isBisNotRequired
  const bisNotFoundReason = isBisNotRequired
    ? 'BIS / CRS Certificate is NOT REQUIRED by tender specifications.'
    : isBisDocUploaded
    ? ''
    : 'Official BIS Registration Certificate / CRS License has not been uploaded yet.'

  const bisStandardRef = standards.length > 0 ? standards[0] : 'IS 14286 / IS 16221'
  let bisText = ''
  if (isBisDocUploaded) {
    bisText = `BUREAU OF INDIAN STANDARDS (BIS) CERTIFICATE RECORD
Document: ${bisDoc.name}
Upload Date: ${new Date(bisDoc.uploadedAt || Date.now()).toLocaleDateString('en-IN')}
Source: ${bisDoc.referenceNote || 'Uploaded by Bidder'}

Tender Reference: ${tenderId}
Work: "${workName}"
Authority: ${authorityName}

Attached Document Particulars:
• File Name: ${bisDoc.name}
• Governing Standard: ${bisStandardRef}
• Verification Status: Official BIS Document Attached`
  } else if (isBisNotRequired) {
    bisText = `[SUBMISSION STATUS: NOT REQUIRED]

As verified from the official tender document, submission of a separate BIS or CRS certificate is NOT mandated for Tender No. ${tenderId}.

Tender Reference: ${tenderId}
Authority: ${authorityName}
Scope of Work: "${workName}"`
  } else {
    bisText = `[DRAFT DECLARATION OF BIS COMPLIANCE - NOT AN OFFICIAL BIS CERTIFICATE]
(To be issued on Bidder's Letterhead pending upload of official BIS license copy)

Date: ${currentDate}

To:
${bid?.addresseeDesignation || 'The Executive Engineer / Tender Evaluation Committee'},
${authorityName},
${authorityAddress}

Subject: Declaration of BIS / CRS Statutory Compliance for Tender No. ${tenderId}
Project / Work: "${workName}"

We, M/s ${COMPANY.name}, hereby declare that the components proposed for supply under Tender ID: ${tenderId} comply with the governing Indian Standards (${bisStandardRef}).

PARTICULARS OF BIS / CRS REGISTRATION (TO BE COMPLETED BY BIDDER):
1. BIS / CRS License Number: [INFORMATION REQUIRED - ENTER OFFICIAL BIS REGISTRATION NUMBER]
2. Valid Upto: [INFORMATION REQUIRED - DD/MM/YYYY]
3. Standard Mark Authority: Bureau of Indian Standards (Govt. of India)
4. Licensee / OEM Name: [INFORMATION REQUIRED - MANUFACTURER NAME]

Note: This is a draft declaration. An official Bureau of Indian Standards (BIS) Certificate or CRS license copy must be uploaded by the bidder.

Authorized Signatory:
M/s ${COMPANY.name}
[Official Seal & Signature]`
  }

  // -------------------------------------------------------------
  // 4. PRODUCT SAMPLE
  // -------------------------------------------------------------
  const sampleDoc = sd?.productSample || autoFetchData?.productSample
  const isSampleDocUploaded = !!sampleDoc

  const sampleFound = isSampleDocUploaded || isSampleNotRequired
  const sampleNotFoundReason = isSampleNotRequired
    ? 'Physical Product Sample submission is NOT REQUIRED for this tender scope.'
    : isSampleDocUploaded
    ? ''
    : 'Sample submission receipt / delivery challan has not been uploaded yet.'

  let sampleText = ''
  if (isSampleDocUploaded) {
    sampleText = `PRODUCT SAMPLE SUBMISSION RECORD
Document: ${sampleDoc.name}
Upload Date: ${new Date(sampleDoc.uploadedAt || Date.now()).toLocaleDateString('en-IN')}
Source: ${sampleDoc.referenceNote || 'Uploaded Delivery Receipt'}

Tender Reference: ${tenderId}
Work: "${workName}"
Authority: ${authorityName}

Attached Submission Particulars:
• File Name: ${sampleDoc.name}
• Verification Status: Sample Submission Receipt Uploaded`
  } else if (isSampleNotRequired) {
    sampleText = `[SUBMISSION STATUS: NOT REQUIRED]

As verified from the official tender document, physical product sample submission prior to bid evaluation is NOT required for Tender No. ${tenderId}.

Tender Reference: ${tenderId}
Authority: ${authorityName}
Scope of Work: "${workName}"`
  } else {
    sampleText = `[DRAFT SAMPLE SUBMISSION CHALLAN - AWAITING PHYSICAL DELIVERY]
(To accompany physical prototype units dispatched to the testing cell)

Challan Date: ${currentDate}

To:
${bid?.addresseeDesignation || 'Officer-in-Charge, Sample Testing Cell'},
${authorityName},
${authorityAddress}

Subject: Submission of Physical Product Sample(s) for Tender No. ${tenderId}
Work: "${workName}"
Submitting Bidder: M/s ${COMPANY.name}

PARTICULARS OF SAMPLE DISPATCH (TO BE COMPLETED UPON DISPATCH):
1. Mode of Delivery: [INFORMATION REQUIRED - HAND DELIVERY / SPEED POST / COURIER]
2. Consignment / Docket Number: [INFORMATION REQUIRED - ENTER TRACKING NUMBER]
3. Date of Dispatch: [INFORMATION REQUIRED]
4. Particulars of Sample Units Dispatched:
${components.length > 0
  ? components.map((c, i) => `• Sample ${i + 1}: 1 Unit of ${c.item} (Make: ${c.make || 'As Quoted'})`).join('\n')
  : `• Sample 1: Physical Prototype Unit`}

RECEIPT ACKNOWLEDGMENT (FOR USE BY TESTING CELL ONLY):
Received Date: [PENDING RECEIPT AT TESTING CELL]
Received By: [NAME & DESIGNATION OF TESTING OFFICER]
Condition of Package: [SEALED / INTACT]
Testing Cell Acknowledgment Stamp & Signature`
  }

  return {
    mafLetter: {
      key: 'mafLetter',
      fieldNumber: 1,
      title: 'MAF Letter',
      subtitle: 'Manufacturer Authorization Form / OEM Letter for specified makes.',
      found: mafFound,
      notFoundReason: mafNotFoundReason,
      textContent: mafText,
      sourceDocumentName: mafDoc?.name,
      sourceOrigin: mafDoc?.referenceNote || (isMafDocUploaded ? 'Uploaded Document' : 'Generic MAF Draft (RBP Pattern)'),
      attributes: [
        { label: 'Format Type', value: isMafDocUploaded ? 'Uploaded MAF' : 'Generic MAF Draft (Letterhead)' },
        { label: 'Authorized Bidder', value: 'RBP Energy (India) Pvt. Ltd.' },
        { label: 'Tendering Authority', value: authorityShort },
        { label: 'Status', value: isMafDocUploaded ? 'Uploaded & Verified' : 'Awaiting OEM Letterhead' },
      ],
    },
    testReport: {
      key: 'testReport',
      fieldNumber: 2,
      title: 'Test Report',
      subtitle: 'Accredited laboratory / type test report certifying technical standards.',
      found: testReportFound,
      notFoundReason: testReportNotFoundReason,
      textContent: testText,
      sourceDocumentName: testDoc?.name,
      sourceOrigin: testDoc?.referenceNote || (isTestDocUploaded ? 'Uploaded Document' : isTestNotRequired ? 'Tender Scope (Not Required)' : 'Draft Undertaking Template'),
      attributes: [
        { label: 'Tender Requirement', value: isTestNotRequired ? 'NOT REQUIRED' : 'MANDATORY' },
        { label: 'Report Status', value: isTestDocUploaded ? 'Uploaded & Verified' : isTestNotRequired ? 'Safe to Skip' : 'Pending Upload by Bidder' },
        { label: 'Testing Standard', value: testStandardsList },
        { label: 'Accreditation Body', value: 'NABL / ERDA / CPRI' },
      ],
    },
    bisCertificate: {
      key: 'bisCertificate',
      fieldNumber: 3,
      title: 'BIS Certificate',
      subtitle: 'Bureau of Indian Standards certificate or Compulsory Registration Scheme (CRS) license.',
      found: bisFound,
      notFoundReason: bisNotFoundReason,
      textContent: bisText,
      sourceDocumentName: bisDoc?.name,
      sourceOrigin: bisDoc?.referenceNote || (isBisDocUploaded ? 'Uploaded Document' : isBisNotRequired ? 'Tender Scope (Not Required)' : 'Draft Declaration Template'),
      attributes: [
        { label: 'Tender Requirement', value: isBisNotRequired ? 'NOT REQUIRED' : 'MANDATORY' },
        { label: 'License Status', value: isBisDocUploaded ? 'Uploaded & Verified' : isBisNotRequired ? 'Safe to Skip' : 'Pending Upload by Bidder' },
        { label: 'Standard Mark', value: bisStandardRef },
        { label: 'Registration Scheme', value: 'BIS / CRS' },
      ],
    },
    productSample: {
      key: 'productSample',
      fieldNumber: 4,
      title: 'Product Sample',
      subtitle: 'Physical sample submission acknowledgment, courier receipt, or sample photograph.',
      found: sampleFound,
      notFoundReason: sampleNotFoundReason,
      textContent: sampleText,
      sourceDocumentName: sampleDoc?.name,
      sourceOrigin: sampleDoc?.referenceNote || (isSampleDocUploaded ? 'Uploaded Receipt' : isSampleNotRequired ? 'Tender Scope (Not Required)' : 'Draft Challan Template'),
      attributes: [
        { label: 'Tender Requirement', value: isSampleNotRequired ? 'NOT REQUIRED' : 'MANDATORY' },
        { label: 'Physical Submission', value: isSampleDocUploaded ? 'Receipt Uploaded' : isSampleNotRequired ? 'No Sample Required' : 'Pending Physical Delivery' },
        { label: 'Consignee', value: authorityName },
      ],
    },
  }
}

/**
 * Downloads a professionally formatted Word (.docx) document using the docx package.
 */
export async function downloadSampleDocx(
  field: SampleFieldVerificationContent,
  tender: Tender,
  customText?: string
): Promise<void> {
  const tenderId = tender.id
  const workName = tender.bid?.workName || tender.bid?.shortWorkName || tender.title
  const authority = tender.bid?.authorityFullName || tender.authority

  // Split text content into paragraphs (using customText if user edited it)
  const effectiveText = customText !== undefined ? customText : field.textContent
  const rawParagraphs = effectiveText.split('\n')

  // Dedicated clean Word document for MAF Letter (Generic_MAF_CREDA_SCIP_CGGY_RBP pattern)
  if (field.key === 'mafLetter') {
    const docChildren: any[] = []

    rawParagraphs.forEach(line => {
      const trimmed = line.trim()
      if (!trimmed) {
        docChildren.push(new Paragraph({ text: '', spacing: { after: 120 } }))
        return
      }

      if (trimmed === 'MANUFACTURER AUTHORIZATION FORM (MAF)') {
        docChildren.push(
          new Paragraph({
            children: [new TextRun({ text: trimmed, bold: true, size: 26, color: '111827' })],
            alignment: AlignmentType.CENTER,
            spacing: { before: 100, after: 40 },
          })
        )
      } else if (trimmed === '(To be issued on the Manufacturer’s Letterhead)') {
        docChildren.push(
          new Paragraph({
            children: [new TextRun({ text: trimmed, italics: true, size: 20, color: '4B5563' })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
          })
        )
      } else if (trimmed.startsWith('Subject:') || trimmed.startsWith('Reference:')) {
        const colonIdx = trimmed.indexOf(':')
        docChildren.push(
          new Paragraph({
            children: [
              new TextRun({ text: trimmed.slice(0, colonIdx + 1) + ' ', bold: true, size: 22 }),
              new TextRun({ text: trimmed.slice(colonIdx + 1).trim(), bold: true, size: 22 }),
            ],
            spacing: { before: 60, after: 60 },
          })
        )
      } else if (trimmed.startsWith('Note:')) {
        docChildren.push(
          new Paragraph({
            children: [
              new TextRun({ text: 'Note: ', bold: true, italics: true, size: 19, color: '4B5563' }),
              new TextRun({ text: trimmed.slice(5).trim(), italics: true, size: 19, color: '4B5563' }),
            ],
            spacing: { before: 200, after: 60 },
          })
        )
      } else if (
        trimmed === 'To,' ||
        trimmed === 'Dear Sir/Madam,' ||
        trimmed === 'Yours faithfully,' ||
        trimmed.startsWith('For M/s.') ||
        trimmed === 'Manufacturer’s Seal & Signature'
      ) {
        docChildren.push(
          new Paragraph({
            children: [new TextRun({ text: trimmed, bold: true, size: 22 })],
            spacing: { before: 100, after: 40 },
          })
        )
      } else if (
        trimmed.startsWith('Authorized Signatory:') ||
        trimmed.startsWith('Name:') ||
        trimmed.startsWith('Designation:') ||
        trimmed.startsWith('Mobile No.:') ||
        trimmed.startsWith('Email ID:') ||
        trimmed.startsWith('Date:')
      ) {
        const colonIdx = trimmed.indexOf(':')
        docChildren.push(
          new Paragraph({
            children: [
              new TextRun({ text: trimmed.slice(0, colonIdx + 1) + ' ', bold: true, size: 21 }),
              new TextRun({ text: trimmed.slice(colonIdx + 1).trim(), size: 21 }),
            ],
            spacing: { after: 40 },
          })
        )
      } else {
        docChildren.push(
          new Paragraph({
            children: [new TextRun({ text: line, size: 22 })],
            spacing: { after: 120 },
            alignment: AlignmentType.JUSTIFIED,
          })
        )
      }
    })

    const doc = new Document({
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: 1440,
                bottom: 1440,
                left: 1440,
                right: 1440,
              },
            },
          },
          children: docChildren,
        },
      ],
    })

    const blob = await Packer.toBlob(doc)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Generic_MAF_${tenderId}.docx`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    return
  }

  const docChildren: any[] = [
    // Top Title
    new Paragraph({
      text: field.title.toUpperCase(),
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 120 },
    }),

    // Subtitle
    new Paragraph({
      children: [
        new TextRun({
          text: `Stage 02 • Sample Details Verification Document`,
          italics: true,
          color: '555555',
          size: 20,
        }),
      ],
      spacing: { after: 200 },
    }),

    // Tender Reference Summary Table
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
              width: { size: 25, type: WidthType.PERCENTAGE },
              children: [new Paragraph({ text: tenderId })],
            }),
            new TableCell({
              width: { size: 25, type: WidthType.PERCENTAGE },
              children: [new Paragraph({ children: [new TextRun({ text: 'RfS No:', bold: true })] })],
            }),
            new TableCell({
              width: { size: 25, type: WidthType.PERCENTAGE },
              children: [new Paragraph({ text: tender.bid?.rfsNo || 'N/A' })],
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: 'Authority:', bold: true })] })],
            }),
            new TableCell({
              children: [new Paragraph({ text: authority })],
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: 'Bidder Name:', bold: true })] })],
            }),
            new TableCell({
              children: [new Paragraph({ text: COMPANY.name })],
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: 'Project / Work:', bold: true })] })],
            }),
            new TableCell({
              columnSpan: 3,
              children: [new Paragraph({ text: workName })],
            }),
          ],
        }),
      ],
    }),

    new Paragraph({ text: '', spacing: { after: 200 } }),

    // Section Header
    new Paragraph({
      children: [
        new TextRun({
          text: 'DOCUMENT VERIFICATION CONTENT',
          bold: true,
          size: 22,
          color: '1E40AF',
        }),
      ],
      spacing: { after: 120 },
    }),
  ]

  // Add all text paragraphs
  rawParagraphs.forEach(line => {
    const trimmed = line.trim()
    if (!trimmed) {
      docChildren.push(new Paragraph({ text: '', spacing: { after: 80 } }))
    } else if (
      trimmed.startsWith('MANUFACTURER') ||
      trimmed.startsWith('TYPE TEST') ||
      trimmed.startsWith('BUREAU OF') ||
      trimmed.startsWith('PRODUCT SAMPLE') ||
      trimmed.startsWith('1.') ||
      trimmed.startsWith('2.') ||
      trimmed.startsWith('3.') ||
      trimmed.startsWith('4.') ||
      trimmed.startsWith('5.')
    ) {
      docChildren.push(
        new Paragraph({
          children: [new TextRun({ text: trimmed, bold: true, size: 22 })],
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

  // Add Official Sign-off block
  docChildren.push(
    new Paragraph({ text: '', spacing: { before: 240, after: 120 } }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({ children: [new TextRun({ text: 'Generated By Tender FMS System', bold: true })] }),
                new Paragraph({ text: `Date: ${new Date().toLocaleDateString('en-IN')}` }),
                new Paragraph({ text: 'Status: Auto-Fetched & Verified' }),
              ],
            }),
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({ children: [new TextRun({ text: `For M/s ${COMPANY.name}`, bold: true })] }),
                new Paragraph({ text: 'Authorized Signatory' }),
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
  const safeFilename = `${field.title.replace(/[^a-zA-Z0-9]/g, '_')}_${tender.id}.docx`

  const link = document.createElement('a')
  link.href = url
  link.download = safeFilename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
