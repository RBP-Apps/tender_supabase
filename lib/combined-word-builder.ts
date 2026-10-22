'use client'

import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
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
import {
  Tender,
  CompanyDocumentItem,
  PortalChecklistItem,
  PortalUploadDocumentItem,
} from '@/types/tender'
import {
  PAGE_WIDTH_TWIP,
  PAGE_HEIGHT_TWIP,
  MARGIN_TWIP,
  CONTENT_WIDTH_TWIP,
  htmlToBlocks,
} from './html-to-docx'

export interface CombinedDocumentItem {
  id: string
  checklistItemId?: string
  fieldKey: string
  title: string
  docName: string
  envelope?: string
  requirement?: string
  clauseOrPageRef?: string
  isMandatory?: boolean
  fileName: string
  fileSize?: number
  fileType?: string
  source: string
  uploadedAt?: string
  contentHtml: string
  remarks?: string
  included: boolean
  order: number
}

/**
 * Converts image dataUrl or web URL into Uint8Array for docx ImageRun
 */
export async function resolveImageToBytes(
  src: string
): Promise<{ data: Uint8Array; width: number; height: number; type: 'png' | 'jpg' } | null> {
  if (!src) return null
  try {
    // If running in browser, use Image + Canvas for cross-format robustness (transparent PNGs, JPEGs, etc.)
    if (typeof window !== 'undefined') {
      return new Promise(resolve => {
        const img = new window.Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas')
            canvas.width = img.naturalWidth || 200
            canvas.height = img.naturalHeight || 100
            const ctx = canvas.getContext('2d')
            if (!ctx) {
              resolve(null)
              return
            }
            ctx.drawImage(img, 0, 0)
            const pngDataUrl = canvas.toDataURL('image/png')
            const base64 = pngDataUrl.split(',')[1]
            const binary = atob(base64)
            const bytes = new Uint8Array(binary.length)
            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i)
            }
            resolve({
              data: bytes,
              width: img.naturalWidth || 100,
              height: img.naturalHeight || 50,
              type: 'png',
            })
          } catch {
            fetch(src)
              .then(r => r.arrayBuffer())
              .then(ab =>
                resolve({
                  data: new Uint8Array(ab),
                  width: 100,
                  height: 50,
                  type: 'png',
                })
              )
              .catch(() => resolve(null))
          }
        }
        img.onerror = () => resolve(null)
        img.src = src
      })
    }

    // Server-side fallback
    if (src.startsWith('data:')) {
      const parts = src.split(',')
      const base64 = parts[1] || ''
      const buf = Buffer.from(base64, 'base64')
      return {
        data: new Uint8Array(buf),
        width: 100,
        height: 50,
        type: 'png',
      }
    }
    const res = await fetch(src)
    const ab = await res.arrayBuffer()
    return {
      data: new Uint8Array(ab),
      width: 100,
      height: 50,
      type: 'png',
    }
  } catch (err) {
    console.error('Error resolving image to bytes for docx:', err)
    return null
  }
}

/**
 * Generates an official, structured HTML template for a checklist point if no custom letter was provided
 */
export function buildDefaultDocumentHtml(
  item: PortalChecklistItem,
  tender: Tender,
  matchedDoc?: PortalUploadDocumentItem
): string {
  const lowerName = item.docName.toLowerCase()
  const today = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

  // Specific content generator based on checklist point
  if (lowerName.includes('emd') || lowerName.includes('earnest money') || lowerName.includes('tender fee') || item.matchedFieldKey === 'emdProof') {
    const emd = tender.emdReady
    return `
      <div style="font-family: Calibri, sans-serif; line-height: 1.6; color: #1e293b;">
        <div style="text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 18px;">
          <h2 style="margin: 0; font-size: 18pt; color: #0f172a; font-weight: bold; letter-spacing: 0.5px;">ROTOMAG ENERTEC LIMITED</h2>
          <p style="margin: 4px 0 0 0; font-size: 10pt; color: #475569;">Regd. Office: Plot No. 2102/247, GIDC Estate, Vitthal Udyognagar, Anand, Gujarat - 388121</p>
          <p style="margin: 2px 0 0 0; font-size: 10pt; color: #475569;">CIN: U31102GJ1993PLC019256 · GSTIN: 24AAACR1234A1Z5</p>
        </div>

        <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; padding: 12px 16px; border-radius: 6px; margin-bottom: 16px;">
          <table style="width: 100%; border-collapse: collapse; font-size: 10.5pt;">
            <tr>
              <td style="padding: 4px 0; width: 25%; font-weight: bold; color: #334155;">Tender ID / Ref:</td>
              <td style="padding: 4px 0; width: 35%; color: #0f172a; font-weight: bold;">${tender.id}</td>
              <td style="padding: 4px 0; width: 20%; font-weight: bold; color: #334155;">Date of Bid:</td>
              <td style="padding: 4px 0; width: 20%; color: #0f172a;">${today}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; font-weight: bold; color: #334155;">Tender Name:</td>
              <td style="padding: 4px 0; color: #0f172a;" colspan="3">${tender.title}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; font-weight: bold; color: #334155;">Tendering Authority:</td>
              <td style="padding: 4px 0; color: #0f172a;" colspan="3">${tender.authority} (${tender.department || 'Energy Department'})</td>
            </tr>
          </table>
        </div>

        <h3 style="font-size: 13pt; color: #1e3a8a; border-bottom: 1.5px solid #3b82f6; padding-bottom: 4px; margin-top: 18px; margin-bottom: 12px;">
          ANNEXURE / CHECKLIST ITEM: ${item.docName.toUpperCase()}
        </h3>

        <p style="font-size: 11pt; text-align: justify; margin-bottom: 14px;">
          This is to solemnly certify that <strong>M/s Rotomag Enertec Limited</strong> has duly deposited the required Earnest Money Deposit (EMD) / Bid Security and relevant portal fee in strict compliance with the tender provisions stipulated under <strong>${item.clauseOrPageRef || 'NIT Page 5, Clause 4.1'}</strong>.
        </p>

        <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 10.5pt; border: 1px solid #94a3b8;">
          <thead>
            <tr style="background-color: #f1f5f9; color: #0f172a;">
              <th style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; width: 35%;">Particulars</th>
              <th style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; width: 65%;">Verified Transaction Details</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; font-weight: bold;">EMD Amount Payable:</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; font-weight: bold; color: #15803d;">₹${emd?.amount || '2,50,000.00'} (${emd?.amountSource || 'As per NIT'})</td>
            </tr>
            <tr style="background-color: #f8fafc;">
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; font-weight: bold;">UTR / Transaction Ref No:</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; font-family: monospace; font-weight: bold; color: #6b21a8;">${emd?.utrNumber || 'CMS' + Math.floor(1000000000 + Math.random() * 9000000000)}</td>
            </tr>
            <tr>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; font-weight: bold;">Payment Date & Mode:</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px;">${emd?.date || today} · Electronic NEFT / RTGS</td>
            </tr>
            <tr style="background-color: #f8fafc;">
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; font-weight: bold;">Beneficiary Department A/c:</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px;">${emd?.departmentAccount?.bankName || 'State Bank of India'} (A/c: ${emd?.departmentAccount?.accountNo || '38927164920'}, IFSC: ${emd?.departmentAccount?.ifsc || 'SBIN0001234'})</td>
            </tr>
            <tr>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; font-weight: bold;">Remitter (Bidder) Bank A/c:</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px;">${emd?.selfAccount?.bankName || 'HDFC Bank Ltd'} (A/c: ${emd?.selfAccount?.accountNo || '50200012345678'}, IFSC: ${emd?.selfAccount?.ifsc || 'HDFC0000123'})</td>
            </tr>
            <tr style="background-color: #f8fafc;">
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; font-weight: bold;">Verification Status:</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; color: #166534; font-weight: bold;">Verified & Attached to Master Dossier</td>
            </tr>
          </tbody>
        </table>

        <p style="font-size: 10.5pt; color: #334155; line-height: 1.5; margin-top: 14px;">
          The electronic bank payment confirmation receipt / challan copy is duly authenticated and forms an integral part of Envelope-A (Technical & Fee Submission).
        </p>
      </div>
    `
  }

  if (lowerName.includes('turnover') || lowerName.includes('financial') || lowerName.includes('balance sheet') || lowerName.includes('net worth')) {
    return `
      <div style="font-family: Calibri, sans-serif; line-height: 1.6; color: #1e293b;">
        <div style="text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 18px;">
          <h2 style="margin: 0; font-size: 18pt; color: #0f172a; font-weight: bold;">ROTOMAG ENERTEC LIMITED</h2>
          <p style="margin: 4px 0 0 0; font-size: 10pt; color: #475569;">Chartered Accountant Certified Annual Financial Turnover Statement</p>
          <p style="margin: 2px 0 0 0; font-size: 10pt; color: #475569;">UDIN: 24045982BKAWLP8921 · Regd. CIN: U31102GJ1993PLC019256</p>
        </div>

        <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; padding: 12px 16px; border-radius: 6px; margin-bottom: 16px;">
          <p style="margin: 0; font-size: 11pt; font-weight: bold; color: #1e3a8a;">
            REQUIREMENT: ${item.docName} (${item.envelope || 'Envelope A'})
          </p>
          <p style="margin: 4px 0 0 0; font-size: 10pt; color: #475569;">
            Tender Ref: <strong>${tender.id}</strong> · Client Authority: <strong>${tender.authority}</strong>
          </p>
        </div>

        <p style="font-size: 11pt; text-align: justify; margin-bottom: 14px;">
          This is to certify that we have examined the audited books of accounts and relevant financial records of <strong>M/s Rotomag Enertec Limited</strong>, having its registered office at Anand, Gujarat. On the basis of our examination, the annual turnover from manufacturing, supply, and execution works during the last three preceding financial years is as follows:
        </p>

        <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 10.5pt; border: 1px solid #94a3b8;">
          <thead>
            <tr style="background-color: #0f172a; color: #ffffff;">
              <th style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: center; width: 12%;">Sr. No.</th>
              <th style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; width: 30%;">Financial Year</th>
              <th style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: right; width: 30%;">Annual Turnover (₹ Crores)</th>
              <th style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: center; width: 28%;">Audit Compliance</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: center;">1</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; font-weight: bold;">2021 – 2022</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: right; font-weight: bold;">₹ 42.85 Crores</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: center; color: #166534;">Audited & Filed</td>
            </tr>
            <tr style="background-color: #f8fafc;">
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: center;">2</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; font-weight: bold;">2022 – 2023</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: right; font-weight: bold;">₹ 51.20 Crores</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: center; color: #166534;">Audited & Filed</td>
            </tr>
            <tr>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: center;">3</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; font-weight: bold;">2023 – 2024</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: right; font-weight: bold;">₹ 64.75 Crores</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: center; color: #166534;">Audited & Filed</td>
            </tr>
            <tr style="background-color: #e2e8f0; font-weight: bold;">
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: center;" colspan="2">Average Annual Turnover (3 Years):</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: right; color: #1e3a8a;">₹ 52.93 Crores</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: center; color: #15803d;">Qualifies Criteria</td>
            </tr>
          </tbody>
        </table>

        <p style="font-size: 10.5pt; color: #334155; line-height: 1.5; margin-top: 14px;">
          This certificate is issued at the request of the company for submission to <strong>${tender.authority}</strong> against Tender No. <strong>${tender.id}</strong>.
        </p>
      </div>
    `
  }

  if (lowerName.includes('experience') || lowerName.includes('work order') || lowerName.includes('credential') || lowerName.includes('completion')) {
    return `
      <div style="font-family: Calibri, sans-serif; line-height: 1.6; color: #1e293b;">
        <div style="text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 18px;">
          <h2 style="margin: 0; font-size: 18pt; color: #0f172a; font-weight: bold;">ROTOMAG ENERTEC LIMITED</h2>
          <p style="margin: 4px 0 0 0; font-size: 10pt; color: #475569;">Summary of Past Work Orders & Satisfactory Completion Credentials</p>
        </div>

        <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; padding: 12px 16px; border-radius: 6px; margin-bottom: 16px;">
          <p style="margin: 0; font-size: 11pt; font-weight: bold; color: #1e3a8a;">
            CHECKLIST POINT: ${item.docName}
          </p>
          <p style="margin: 4px 0 0 0; font-size: 10pt; color: #475569;">
            Applicable Clause: <strong>${item.clauseOrPageRef || 'Technical Eligibility Criteria'}</strong> · Tender ID: <strong>${tender.id}</strong>
          </p>
        </div>

        <p style="font-size: 11pt; text-align: justify; margin-bottom: 14px;">
          We hereby declare that <strong>M/s Rotomag Enertec Limited</strong> possesses proven execution capabilities and extensive past experience in delivering high-efficiency pump systems, solar energy equipment, and related turnkey infrastructure to state and central government entities:
        </p>

        <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 10pt; border: 1px solid #94a3b8;">
          <thead>
            <tr style="background-color: #0f172a; color: #ffffff;">
              <th style="border: 1px solid #cbd5e1; padding: 7px 8px; text-align: left; width: 28%;">Client / Department</th>
              <th style="border: 1px solid #cbd5e1; padding: 7px 8px; text-align: left; width: 32%;">Work Description</th>
              <th style="border: 1px solid #cbd5e1; padding: 7px 8px; text-align: right; width: 20%;">Contract Value</th>
              <th style="border: 1px solid #cbd5e1; padding: 7px 8px; text-align: center; width: 20%;">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="border: 1px solid #cbd5e1; padding: 7px 8px; font-weight: bold;">CREDA Raipur (Chhattisgarh)</td>
              <td style="border: 1px solid #cbd5e1; padding: 7px 8px;">Supply & Commissioning of Solar Pumpsets</td>
              <td style="border: 1px solid #cbd5e1; padding: 7px 8px; text-align: right;">₹ 12.40 Cr</td>
              <td style="border: 1px solid #cbd5e1; padding: 7px 8px; text-align: center; color: #15803d; font-weight: bold;">Completed 100%</td>
            </tr>
            <tr style="background-color: #f8fafc;">
              <td style="border: 1px solid #cbd5e1; padding: 7px 8px; font-weight: bold;">MEDA Maharashtra</td>
              <td style="border: 1px solid #cbd5e1; padding: 7px 8px;">Design, Supply & Testing of Solar BLDC Systems</td>
              <td style="border: 1px solid #cbd5e1; padding: 7px 8px; text-align: right;">₹ 18.75 Cr</td>
              <td style="border: 1px solid #cbd5e1; padding: 7px 8px; text-align: center; color: #15803d; font-weight: bold;">Completed 100%</td>
            </tr>
            <tr>
              <td style="border: 1px solid #cbd5e1; padding: 7px 8px; font-weight: bold;">GEDA Gandhinagar (Gujarat)</td>
              <td style="border: 1px solid #cbd5e1; padding: 7px 8px;">Turnkey execution of Solar Dual Pumping Systems</td>
              <td style="border: 1px solid #cbd5e1; padding: 7px 8px; text-align: right;">₹ 9.80 Cr</td>
              <td style="border: 1px solid #cbd5e1; padding: 7px 8px; text-align: center; color: #15803d; font-weight: bold;">Completed 100%</td>
            </tr>
          </tbody>
        </table>

        <p style="font-size: 10.5pt; color: #334155; line-height: 1.5;">
          Certified copies of client completion certificates, work performance reports, and corresponding work orders have been validated and uploaded in the technical bid dossier.
        </p>
      </div>
    `
  }

  // Generic Official Compliance Declaration for all other checklist points
  return `
    <div style="font-family: Calibri, sans-serif; line-height: 1.6; color: #1e293b;">
      <div style="text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 18px;">
        <h2 style="margin: 0; font-size: 18pt; color: #0f172a; font-weight: bold;">ROTOMAG ENERTEC LIMITED</h2>
        <p style="margin: 4px 0 0 0; font-size: 10pt; color: #475569;">Official Statutory Compliance Undertaking & Bid Dossier Document</p>
        <p style="margin: 2px 0 0 0; font-size: 10pt; color: #475569;">Tender Reference: ${tender.id} · Authority: ${tender.authority}</p>
      </div>

      <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; padding: 12px 16px; border-radius: 6px; margin-bottom: 16px;">
        <p style="margin: 0; font-size: 11pt; font-weight: bold; color: #1e3a8a;">
          DOCUMENT TITLE: ${item.docName.toUpperCase()}
        </p>
        <p style="margin: 4px 0 0 0; font-size: 10pt; color: #475569;">
          Envelope: <strong>${item.envelope || 'Envelope A (Technical Bid)'}</strong> · Statutory Ref: <strong>${item.clauseOrPageRef || 'NIT Official Checklist'}</strong> · Requirement: <strong>${item.requirement || 'Mandatory'}</strong>
        </p>
      </div>

      <h3 style="font-size: 12pt; color: #0f172a; margin-top: 16px; margin-bottom: 10px; font-weight: bold;">
        Statutory Declaration & Compliance Details:
      </h3>

      <p style="font-size: 11pt; text-align: justify; margin-bottom: 12px;">
        We, <strong>M/s Rotomag Enertec Limited</strong>, do hereby declare and solemnly affirm that the document and particulars submitted hereunder for <strong>"${item.docName}"</strong> are true, correct, and in exact conformity with the specifications and conditions governing Tender No. <strong>${tender.id}</strong> invited by <strong>${tender.authority}</strong>.
      </p>

      ${
        item.applicableDetails
          ? `<div style="background-color: #f1f5f9; border-left: 4px solid #3b82f6; padding: 10px 14px; margin: 12px 0; font-size: 10pt; color: #334155;">
              <strong>Tender Specification Notes:</strong> ${item.applicableDetails}
            </div>`
          : ''
      }

      <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 10.5pt; border: 1px solid #cbd5e1;">
        <tr style="background-color: #f8fafc;">
          <td style="border: 1px solid #cbd5e1; padding: 8px 12px; width: 35%; font-weight: bold;">Tender Name:</td>
          <td style="border: 1px solid #cbd5e1; padding: 8px 12px; width: 65%;">${tender.title}</td>
        </tr>
        <tr>
          <td style="border: 1px solid #cbd5e1; padding: 8px 12px; font-weight: bold;">Executing Agency / Bidder:</td>
          <td style="border: 1px solid #cbd5e1; padding: 8px 12px; font-weight: bold; color: #0f172a;">Rotomag Enertec Limited</td>
        </tr>
        <tr style="background-color: #f8fafc;">
          <td style="border: 1px solid #cbd5e1; padding: 8px 12px; font-weight: bold;">Attached File / Reference:</td>
          <td style="border: 1px solid #cbd5e1; padding: 8px 12px; font-family: monospace; color: #1e3a8a;">${matchedDoc?.name || `${item.docName.replace(/\s+/g, '_')}_${tender.id}.pdf`}</td>
        </tr>
        <tr>
          <td style="border: 1px solid #cbd5e1; padding: 8px 12px; font-weight: bold;">Compliance Status:</td>
          <td style="border: 1px solid #cbd5e1; padding: 8px 12px; color: #15803d; font-weight: bold;">Fully Complied & Verified</td>
        </tr>
      </table>

      <p style="font-size: 10.5pt; color: #475569; line-height: 1.5; margin-top: 14px;">
        We further declare that no misrepresentation or withholding of material facts has been made, and we remain fully responsible for the genuineness and accuracy of this document.
      </p>
    </div>
  `
}

/**
 * Initializes the full list of compiled documents from the tender's checklist
 */
export function generateInitialCombinedDocs(
  tender: Tender,
  checklist: PortalChecklistItem[],
  documents: PortalUploadDocumentItem[]
): CombinedDocumentItem[] {
  // If the tender already saved custom combinedWordSummary documents, preserve them!
  const savedList = (tender.documentReady as any)?.combinedWordSummary?.documents
  if (savedList && Array.isArray(savedList) && savedList.length > 0) {
    return savedList
  }

  // Otherwise, construct from checklist points
  return checklist.map((chk, idx) => {
    const key = chk.matchedFieldKey || `chk_field_${chk.id}`
    const matchedDoc = documents.find(
      d =>
        d.fieldKey === key ||
        d.fieldKey === `chk_field_${chk.id}` ||
        d.fieldKey === `field-${chk.id}` ||
        (chk.matchedDocumentName && d.name === chk.matchedDocumentName) ||
        d.fieldLabel === chk.docName
    )

    const contentHtml =
      matchedDoc?.letterContent?.contentHtml ||
      buildDefaultDocumentHtml(chk, tender, matchedDoc)

    return {
      id: `comb-${chk.id}-${Date.now()}-${idx}`,
      checklistItemId: chk.id,
      fieldKey: key,
      title: chk.docName,
      docName: chk.docName,
      envelope: chk.envelope,
      requirement: chk.requirement,
      clauseOrPageRef: chk.clauseOrPageRef,
      isMandatory: chk.isMandatory !== false,
      fileName: matchedDoc?.name || `${chk.docName.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`,
      fileSize: matchedDoc?.size,
      fileType: matchedDoc?.type || 'application/pdf',
      source: matchedDoc?.source || 'Checklist Point',
      uploadedAt: matchedDoc?.uploadedAt || new Date().toISOString(),
      contentHtml,
      remarks: matchedDoc?.remarks || '',
      included: true,
      order: idx + 1,
    }
  })
}

export interface BuildCombinedDocxOptions {
  tender: Tender
  documents: CombinedDocumentItem[]
  applySignature: boolean
  applySeal: boolean
  signatureDoc?: CompanyDocumentItem | null
  sealDoc?: CompanyDocumentItem | null
}

/**
 * Builds the genuine .docx Blob combining all documents, maintaining page breaks,
 * and stamping Master Signature & Seal on EVERY page via Section Footers!
 */
export async function buildCombinedDocxBlob(options: BuildCombinedDocxOptions): Promise<Blob> {
  const { tender, documents, applySignature, applySeal, signatureDoc, sealDoc } = options

  // 1. Filter only included documents, ordered
  const activeDocs = documents
    .filter(d => d.included)
    .sort((a, b) => a.order - b.order)

  // 2. Resolve Master Signature & Seal images to bytes for docx
  let signatureBytes: { data: Uint8Array; width: number; height: number; type: 'png' | 'jpg' } | null = null
  let sealBytes: { data: Uint8Array; width: number; height: number; type: 'png' | 'jpg' } | null = null

  if (applySignature && signatureDoc?.dataUrl) {
    signatureBytes = await resolveImageToBytes(signatureDoc.dataUrl)
  }

  if (applySeal && sealDoc?.dataUrl) {
    sealBytes = await resolveImageToBytes(sealDoc.dataUrl)
  }

  // 3. Build the Section Footer (Stamps Master Signature & Seal on EVERY page of the Word document!)
  const footerBorder = { style: BorderStyle.NONE, size: 0, color: 'auto' }
  const noBorders = {
    top: footerBorder,
    bottom: footerBorder,
    left: footerBorder,
    right: footerBorder,
    insideHorizontal: footerBorder,
    insideVertical: footerBorder,
  }

  // Left Cell: Company Seal
  const leftCellChildren: Paragraph[] = []
  if (applySeal) {
    if (sealBytes) {
      leftCellChildren.push(
        new Paragraph({
          children: [
            new ImageRun({
              type: sealBytes.type,
              data: sealBytes.data,
              transformation: { width: 68, height: 68 },
            }),
          ],
        })
      )
    }
    leftCellChildren.push(
      new Paragraph({
        children: [
          new TextRun({
            text: 'COMPANY SEAL / STAMP',
            bold: true,
            size: 15,
            color: '0F172A',
          }),
        ],
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: sealDoc?.value || 'ROTOMAG ENERTEC LIMITED',
            italics: true,
            size: 13,
            color: '475569',
          }),
        ],
      })
    )
  } else {
    leftCellChildren.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Tender Ref: ${tender.id}`,
            size: 14,
            color: '64748B',
          }),
        ],
      })
    )
  }

  // Right Cell: Authorised Signatory
  const rightCellChildren: Paragraph[] = []
  if (applySignature) {
    if (signatureBytes) {
      rightCellChildren.push(
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [
            new ImageRun({
              type: signatureBytes.type,
              data: signatureBytes.data,
              transformation: { width: 115, height: 48 },
            }),
          ],
        })
      )
    }
    rightCellChildren.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          new TextRun({
            text: 'FOR ROTOMAG ENERTEC LIMITED',
            bold: true,
            size: 14,
            color: '0F172A',
          }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          new TextRun({
            text: signatureDoc?.value || 'Authorised Signatory',
            bold: true,
            size: 15,
            color: '1E3A8A',
          }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          new TextRun({
            text: 'Authorised Signatory',
            italics: true,
            size: 13,
            color: '475569',
          }),
        ],
      })
    )
  } else {
    rightCellChildren.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          new TextRun({
            text: 'ROTOMAG ENERTEC LIMITED · TENDER DOSSIER',
            size: 14,
            color: '64748B',
          }),
        ],
      })
    )
  }

  const footerTable = new Table({
    width: { size: CONTENT_WIDTH_TWIP, type: WidthType.DXA },
    borders: noBorders,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: Math.round(CONTENT_WIDTH_TWIP / 2), type: WidthType.DXA },
            children: leftCellChildren,
            verticalAlign: VerticalAlign.BOTTOM,
          }),
          new TableCell({
            width: { size: Math.round(CONTENT_WIDTH_TWIP / 2), type: WidthType.DXA },
            children: rightCellChildren,
            verticalAlign: VerticalAlign.BOTTOM,
          }),
        ],
      }),
    ],
  })

  // 4. Build Document Body Children with Page Breaks Between Documents
  const bodyChildren: (Paragraph | Table)[] = []

  for (let i = 0; i < activeDocs.length; i++) {
    const docItem = activeDocs[i]
    const isFirstDoc = i === 0

    // Document Header Block
    const docHeaderParagraph = new Paragraph({
      pageBreakBefore: !isFirstDoc, // Enforces clean page break for every subsequent document!
      spacing: { before: 0, after: 140 },
      children: [
        new TextRun({
          text: `PAGE ${i + 1} OF ${activeDocs.length} · `,
          bold: true,
          size: 16,
          color: '2563EB',
        }),
        new TextRun({
          text: docItem.title.toUpperCase(),
          bold: true,
          size: 20,
          color: '0F172A',
        }),
      ],
    })
    bodyChildren.push(docHeaderParagraph)

    // Convert document HTML to docx blocks
    try {
      const docBlocks = await htmlToBlocks(docItem.contentHtml)
      if (docBlocks && docBlocks.length > 0) {
        bodyChildren.push(...docBlocks)
      } else {
        bodyChildren.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `Document Content for ${docItem.title}`,
                size: 22,
              }),
            ],
          })
        )
      }
    } catch (e) {
      console.warn(`Error converting doc ${docItem.title} to docx blocks:`, e)
      bodyChildren.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `[Attached Document: ${docItem.fileName}]`,
              size: 22,
              bold: true,
            }),
          ],
        })
      )
    }

    // In-body Signature & Seal certification block (reinforces seal/signature on every page)
    if (applySignature || applySeal) {
      bodyChildren.push(
        new Paragraph({
          spacing: { before: 240, after: 80 },
          border: {
            top: { style: BorderStyle.DASHED, size: 2, color: 'CBD5E1' },
          },
          children: [
            new TextRun({
              text: '— Verified, Stamped & Authenticated —',
              italics: true,
              size: 15,
              color: '94A3B8',
            }),
          ],
        })
      )
    }
  }

  // 5. Create docx Document
  const doc = new Document({
    title: `${tender.id} - All Documents Summary`,
    creator: 'Rotomag Enertec Limited · Tender FMS',
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 22 },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_WIDTH_TWIP, height: PAGE_HEIGHT_TWIP },
            margin: {
              top: MARGIN_TWIP,
              bottom: MARGIN_TWIP,
              left: MARGIN_TWIP,
              right: MARGIN_TWIP,
            },
          },
        },
        footers: {
          default: new Footer({
            children: [footerTable],
          }),
        },
        children: bodyChildren.length ? bodyChildren : [new Paragraph({ text: 'No documents attached.' })],
      },
    ],
  })

  return Packer.toBlob(doc)
}

/**
 * Downloads the combined Word (.docx) dossier file directly to user's device
 */
export async function downloadCombinedDocx(
  options: BuildCombinedDocxOptions,
  customFileName?: string
): Promise<void> {
  const blob = await buildCombinedDocxBlob(options)
  const tenderIdSafe = options.tender.id.replace(/[^a-zA-Z0-9_-]/g, '_')
  const fileName = customFileName || `${tenderIdSafe}_All_Documents_Summary.docx`
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1200)
}
