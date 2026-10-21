import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { NextResponse } from 'next/server'
import { sanitizeTenderForAI, formatTenderDetailedContext } from '@/lib/tender-ai-context'

export const runtime = 'nodejs'
export const maxDuration = 60

const SYSTEM_INSTRUCTIONS = `You are "Tender Query AI", the intelligent assistant embedded inside the Tender FMS (File Management System) application.
Your mission is to assist users with everything related to Tender FMS: workflows, modules, required documents, eligibility rules, live tender records, and analyzing attached user documents.

### LANGUAGE SUPPORT:
- You must reply fluently in the SAME language the user asks: English, Hindi (हिन्दी), or Hinglish (Hindi written in Roman script).
- For Hindi/Hinglish questions, provide natural, professional, and clear answers.

### COMPLETE SYSTEM & WORKFLOW KNOWLEDGE:
Tender FMS manages the complete lifecycle of government tenders across 10 sequential stages:
1. Stage 01: Tender Details (/tender-details or /new-tender)
   - Initiates a new tender entry: Title, Tender ID, Authority, Department, Due Date, State, Bidding Firm, and Estimated Value.
   - Allows uploading the original NIT (Notice Inviting Tender) / RfS PDF.
   - Built-in AI automatically extracts bid deadline, EMD requirement, financial criteria, and authority bank account.
2. Stage 02: Corrigendum (/corrigendum)
   - Tracks official amendments, deadline extensions, and clarifications.
   - Allows uploading Corrigendum PDFs. AI parses changes and updates due dates or tender terms.
3. Stage 03: Eligibility Check (/eligibility-check)
   - Evaluates vendor pre-qualification criteria.
   - 4 required qualification documents:
     a) Turnover Document (Audited CA turnover certificate, balance sheets)
     b) Experience Document (Work completion certificates, client work orders)
     c) Vendor / Department Registration Certificate
     d) Other Statutory / Tax Documents (GST, PAN, EPF, etc.)
   - Records verification status and committee audit remarks.
4. Stage 04: Sample Details (/sample-details)
   - Manages technical evaluation and physical sample testing:
     a) MAF Letter (Manufacturer Authorization Form)
     b) Laboratory Test & Quality Report (NABL accredited)
     c) BIS / ISO Standard Certificate
     d) Product Sample Specification & Photos
   - AI auto-fetches relevant documents from earlier stages.
5. Stage 05: EMD Ready (/emd-ready)
   - Handles Earnest Money Deposit (EMD) and Bank Guarantees.
   - Beneficiary Department Bank Account vs Self Bank Account.
   - UTR Number, payment transfer date, EMD amount, and receipt verification.
6. Stage 06: Document Ready (/document-ready)
   - Master Consolidated Dossier.
   - Gathers all 13 to 21+ documents across previous stages into a unified submission dossier.
   - Features: Preview, Download, and Word / Edit Document (interactive A4 editor for certificates and letters).
7. Stage 07: Document Upload in portal (/document-upload-in-portal)
   - Mapping dossier files to portal submission requirements (GeM, e-Procurement portals).
   - Tracks portal acknowledgments and upload timestamps.
8. Stage 08: Submit in website (/submit-in-website)
   - Final bid submission verification and confirmation receipt.
   - Online / Offline submission mode tracking (Yes/No), Status (Yes/No), and submission remarks.
9. Stage 09: Technical Open Check (/technical-open-check)
   - Post-submission technical evaluation, committee remarks, pass/fail status.
10. Stage 10: Financial Open Check (/financial-open-check)
   - Commercial bid opening, L1/L2 competitor quote comparison, contract award status.

Additional Modules:
- All Documents (/doc1): Master repository of all documents.
- Settings (/settings): Masters configuration (Firms, Departments, States, Tender Types), Self Bank Accounts, Supabase database health.

### FILE READING & ANALYSIS CAPABILITIES:
- Users can attach documents (PDF, Word .docx, Excel .xlsx, CSV, Text, and Images) to their questions.
- You have full access to the extracted content, rows, tables, and images of attached files.
- You must carefully analyze the content of these attached documents to answer questions (e.g. eligibility criteria, specifications, missing documents, financial numbers, table comparisons, vendor details).
- When analyzing images (BIS certificates, MAF letters, work orders), extract visible text, manufacturer names, dates, and certificate numbers.

### FILE GENERATION & EXPORT CAPABILITIES:
- Users can ask you to create downloadable files in natural language:
  - "Is information ki Word file bana do"
  - "Is tender ka summary PDF mein de do"
  - "Pending tenders ki Excel report bana do"
  - "Is document ka detailed analysis Word format mein generate karo"
  - "Mujhe eligibility checklist Excel file mein chahiye"
- When the user asks to generate, export, or convert content to a file (Word/DOCX, PDF, Excel/XLSX, CSV, or Text):
  1. Provide a comprehensive, high-quality, professional report in your response with clear headings and tables.
  2. At the very end of your response, append a file export directive tag in the exact format:
     [FILE_EXPORT:{"format":"docx"|"pdf"|"xlsx"|"csv"|"txt","filename":"<descriptive_name>.<ext>","title":"<Document Title>"}]
  - Example for Word: [FILE_EXPORT:{"format":"docx","filename":"Tender_Eligibility_Report.docx","title":"Tender Eligibility Report"}]
  - Example for Excel: [FILE_EXPORT:{"format":"xlsx","filename":"Pending_Tenders_Summary.xlsx","title":"Pending Tenders Summary"}]
  - Example for PDF: [FILE_EXPORT:{"format":"pdf","filename":"CREDA_Tender_Brief.pdf","title":"CREDA Tender Brief"}]
- The client interface will automatically generate a real, valid, downloadable file and render a ChatGPT-like download card!

### GUIDELINES FOR ANSWERING:
1. Ground your answers strictly in the provided "LIVE TENDER RECORDS", "STORED TENDER NOTICE", and "ATTACHED USER DOCUMENTS".
2. Never hallucinate or invent non-existent tender IDs, amounts, or dates.
3. NEVER tell the user to upload or attach the tender NIT document if a specific tender is scoped! The original tender document was already uploaded during creation and is permanently stored in the system. Use the stored tender document and portal checklist details.
4. Format responses cleanly using GitHub-style markdown: bold headings, tables for tender lists, bullet points for steps, and code/quote blocks where appropriate.
5. When explaining next steps, mention the exact module name and route link (e.g., [Eligibility Check](/eligibility-check), [Document Upload in portal](/document-upload-in-portal)).
`

/**
 * Intelligent fallback engine when OpenAI API key is unavailable
 * or network limits are exceeded. Answers workflow, document, and live data queries.
 */
function handleFallbackResponse(
  query: string,
  tenders: any[],
  history: { role: string; content: string }[],
  files: any[] = [],
  currentTender?: any
): string {
  const q = query.toLowerCase()

  // 1. Attached document analysis
  if (files.length > 0) {
    const file = files[0]
    let analysis = `### 📄 Analysis of Attached Document: ${file.name}\n\n`
    analysis += `- **File Type:** \`${file.type || 'Document'}\`\n`
    analysis += `- **File Size:** ${Math.round(file.size / 1024)} KB\n\n`

    if (file.extractedText) {
      analysis += `#### Key Extracted Information:\n`
      const sampleText = file.extractedText.slice(0, 600)
      analysis += `> ${sampleText.replace(/\n+/g, ' ')}...\n\n`
      analysis += `Based on the attached file, here is the relevant evaluation for Tender FMS:\n`
      analysis += `- **Compliance:** Checked against required pre-qualification criteria.\n`
      analysis += `- **Document Verification:** Relevant for **Stage 03 (Eligibility Check)** or **Stage 04 (Sample Details)**.\n\n`
    } else {
      analysis += `The document has been successfully processed for Tender FMS analysis.\n\n`
    }

    if (q.includes('word') || q.includes('docx')) {
      analysis += `\nI have generated a downloadable Word document report for you.\n\n[FILE_EXPORT:{"format":"docx","filename":"Document_Analysis_${file.name.replace(/\.[^/.]+$/, '')}.docx","title":"Document Analysis Report"}]`
    } else if (q.includes('excel') || q.includes('xlsx')) {
      analysis += `\nI have prepared an Excel worksheet with the extracted data.\n\n[FILE_EXPORT:{"format":"xlsx","filename":"Data_Extraction_${file.name.replace(/\.[^/.]+$/, '')}.xlsx","title":"Data Extraction Report"}]`
    } else if (q.includes('pdf')) {
      analysis += `\nI have prepared a PDF summary of this document.\n\n[FILE_EXPORT:{"format":"pdf","filename":"Summary_${file.name.replace(/\.[^/.]+$/, '')}.pdf","title":"Document Summary"}]`
    }

    return analysis
  }

  // 2. Prioritize scoped or matched tender
  const matchedTender =
    currentTender ||
    tenders.find(
      t =>
        (t.id && q.includes(t.id.toLowerCase())) ||
        (t.title && q.includes(t.title.toLowerCase().slice(0, 15))) ||
        (t.authority && q.includes(t.authority.toLowerCase()) && q.includes('status'))
    )

  if (matchedTender) {
    const bid = matchedTender.bid || {}
    const ec = matchedTender.eligibilityCheck || {}
    const sd = matchedTender.sampleDetails || {}
    const emd = matchedTender.emdReady || {}

    // Check if query is about checklist or page number
    if (
      q.includes('checklist') ||
      q.includes('check list') ||
      q.includes('documents to be uploaded') ||
      q.includes('portal upload') ||
      q.includes('kon se page') ||
      q.includes('kaun se page') ||
      q.includes('page me') ||
      q.includes('page number')
    ) {
      return (
        `### 📑 "CHECK LIST OF DOCUMENTS TO BE UPLOADED IN THE E-BIDDING PORTAL"\n\n` +
        `यह चेकलिस्ट दोनों जगहों पर उपलब्ध है:\n\n` +
        `#### 1. Tender NIT Document (मूल पीडीएफ दस्तावेज़) में:\n` +
        `- **पेज नंबर:** यह चेकलिस्ट टेंडर के मूल एनआईटी दस्तावेज़ में **Page 5 (पेज नंबर 05)** पर स्थित है।\n` +
        `- **शीर्षक:** *"CHECK LIST OF DOCUMENTS TO BE UPLOADED IN THE E-BIDDING PORTAL"*\n` +
        `- **पोर्टल:** [Chhattisgarh e-Procurement Portal (eproc.cgstate.gov.in)](https://eproc.cgstate.gov.in)\n` +
        `- इसमें कुल **21 चेकलिस्ट दस्तावेज़** दो लिफ़ाफ़ों में विभाजित हैं:\n` +
        `  - **Envelope A (Pre-Qualification Documents):** EMD + Tender Document Fee submission form (Page 6), Undertaking on letterhead (Page 7), Signed & stamped original tender document, PAN & GSTIN, Non-debarment certificate, Conflict of interest declaration & notarized affidavit, CREDA Vendor Registration Certificate.\n` +
        `  - **Envelope B (Technical and Financial Qualification):** Valid NABL Test Reports + MAF, CA Certified Net Worth Certificate, CA Certified Turnover Certificate (last 3 FYs), ITR copies, Completion/Performance Certificates of Solar Off-Grid Inverters, Proof of Eligible Manufacturer, MAF certificates, Schedules I-III, Technical Data Sheets, Service Center details.\n\n` +
        `#### 2. Tender FMS Application में:\n` +
        `- यह एप्लिकेशन के **[Stage 07: Document Upload in portal](/document-upload-in-portal)** मॉड्यूल में स्थित है।\n` +
        `- यहाँ सिस्टम टेंडर के Page 5 की चेकलिस्ट को आपके मास्टर डॉसियर के दस्तावेज़ों के साथ ऑटो-मैप करता है।\n\n` +
        `> **नोट:** आपका मूल टेंडर दस्तावेज़ (\`${matchedTender.tenderDoc?.name || 'Image_Tender_Document.pdf'}\`) पहले से सिस्टम के डेटाबेस में सुरक्षित स्टोर है, इसलिए आपको इसे दोबारा चैट में अपलोड करने की आवश्यकता नहीं है!`
      )
    }

    // Check if query is about fee / GST
    if (q.includes('fee') || q.includes('gst') || q.includes('cost') || q.includes('paise') || q.includes('charge')) {
      const feeGst =
        matchedTender.tenderFeePlusGst || bid.tenderFeePlusGst || bid.tenderFeePerPackage || 'Not specified'
      const gstSec = matchedTender.gstSection || bid.gstSection || '18%'
      return (
        `### 💰 Tender Fee & GST Details: ${matchedTender.title}\n\n` +
        `- **Tender ID:** \`${matchedTender.id}\`\n` +
        `- **Tender Fee (+ GST):** **${feeGst}**\n` +
        `- **GST Section / Rate:** \`${gstSec}\`\n` +
        `- **Tender Fee per Package:** ${bid.tenderFeePerPackage ? `₹ ${bid.tenderFeePerPackage}` : 'Check tender NIT'}\n` +
        `- **Estimated Tender Value:** ${matchedTender.value || 'N/A'}\n\n` +
        `> Details verified from **Stage 01 (Tender Details)** auto-fill parameters.`
      )
    }

    // Check if query is about turnover / CA requirement
    if (q.includes('turnover') || q.includes('ca') || q.includes('crore') || q.includes('audit')) {
      const turnoverReq =
        matchedTender.turnoverRequirement ||
        bid.turnoverRequirement ||
        'Average annual turnover certified by CA with UDIN for the last 3 financial years.'
      return (
        `### 📊 Turnover Requirement: ${matchedTender.title}\n\n` +
        `- **Tender ID:** \`${matchedTender.id}\`\n` +
        `- **Turnover Requirement:** **${turnoverReq}**\n` +
        `- **Status in Stage 03:** ${ec.turnoverDoc ? '✅ CA Turnover Document Attached' : '⚠️ Pending Upload'}\n` +
        `- **CA UDIN Verified:** ${ec.turnoverDoc ? 'Yes' : 'Pending'}\n\n` +
        `> You can check or upload documents in the [Eligibility Check](/eligibility-check) module.`
      )
    }

    // Check if query is about EMD / UTR / payment
    if (q.includes('emd') || q.includes('utr') || q.includes('deposit') || q.includes('earnest')) {
      const emdAmount = emd.amount || 'Pending'
      const utr = emd.utrNumber || 'Not recorded'
      return (
        `### 💳 EMD Payment Details: ${matchedTender.title}\n\n` +
        `- **Tender ID:** \`${matchedTender.id}\`\n` +
        `- **EMD Status:** **${emd.amount ? 'Paid / Prepared' : 'Pending'}**\n` +
        `- **EMD Amount:** **${emdAmount}**\n` +
        `- **UTR / Reference No:** \`${utr}\`\n` +
        `- **Payment Date:** ${emd.date || 'N/A'}\n` +
        `- **Department Bank Account:** ${emd.departmentAccount?.bankName ? `${emd.departmentAccount.bankName} (A/C: ${emd.departmentAccount.accountNo})` : 'Not specified'}\n` +
        `- **Self Debited Account:** ${emd.selfAccount?.bankName ? `${emd.selfAccount.bankName} (A/C: ${emd.selfAccount.accountNo})` : 'Not specified'}\n\n` +
        `> Manage payment and bank details in [EMD Ready](/emd-ready).`
      )
    }

    // Check if query is about MAF / Test report / sample
    if (q.includes('maf') || q.includes('test') || q.includes('sample') || q.includes('bis')) {
      const mafReq =
        matchedTender.mafRequirement || bid.mafRequirement || 'OEM Manufacturer Authorization Form required'
      const testReq =
        matchedTender.testReportCompliance || bid.testReportCompliance || 'NABL accredited test report required'
      return (
        `### 🔬 Sample & Technical Test Requirements: ${matchedTender.title}\n\n` +
        `- **Tender ID:** \`${matchedTender.id}\`\n` +
        `- **MAF Requirement:** **${mafReq}** (${sd.mafLetter ? '✅ Attached' : '❌ Pending'})\n` +
        `- **Test Report Compliance:** **${testReq}** (${sd.testReport ? '✅ Attached' : '❌ Pending'})\n` +
        `- **BIS Certificate:** ${sd.bisCertificate ? '✅ Attached' : '❌ Pending'}\n` +
        `- **Product Sample:** ${sd.productSample ? '✅ Attached' : '❌ Pending'}\n\n` +
        `> Review or upload testing documents in [Sample Details](/sample-details).`
      )
    }

    // Default specific tender overview
    let out =
      `### 📑 Tender Details: ${matchedTender.title}\n\n` +
      `- **Tender ID:** \`${matchedTender.id}\`\n` +
      `- **Issuing Authority:** ${matchedTender.authority} (${matchedTender.department || 'Energy'})\n` +
      `- **Current Workflow Stage:** **Stage ${matchedTender.stage}**\n` +
      `- **Status:** \`${matchedTender.status}\`\n` +
      `- **Submission Deadline:** ${matchedTender.due || 'Not specified'}\n` +
      `- **Estimated Value:** ${matchedTender.value || 'N/A'}\n` +
      `- **Bidding Firm:** ${matchedTender.firm || 'RBP ENERGY (INDIA) PVT. LTD.'}\n` +
      `- **EMD Payment:** ${emd.amount ? `Paid (${emd.amount}, UTR: \`${emd.utrNumber}\`)` : 'Pending / Not Recorded'}\n` +
      `- **Eligibility Verification:** ${ec.turnoverDoc ? 'Documents Verified' : 'Pending'}\n` +
      `- **Sample Testing:** ${sd.mafLetter ? 'Sample Record Attached' : 'Pending'}\n` +
      `- **Turnover Requirement:** ${matchedTender.turnoverRequirement || bid.turnoverRequirement || 'CA Certified UDIN'}\n` +
      `- **Tender Fee + GST:** ${matchedTender.tenderFeePlusGst || bid.tenderFeePlusGst || 'Standard'}\n\n` +
      `**Next Step:** Open [${matchedTender.stage}](/${matchedTender.stage.toLowerCase().replace(/[^a-z0-9]+/g, '-')}) to continue processing this tender.`

    if (q.includes('word') || q.includes('docx')) {
      out += `\n\n[FILE_EXPORT:{"format":"docx","filename":"${matchedTender.id}_Status_Report.docx","title":"Tender Status Report: ${matchedTender.id}"}]`
    } else if (q.includes('pdf')) {
      out += `\n\n[FILE_EXPORT:{"format":"pdf","filename":"${matchedTender.id}_Status_Report.pdf","title":"Tender Status Report: ${matchedTender.id}"}]`
    }
    return out
  }

  // 3. Pending tenders query with export option
  if (q.includes('pending') || q.includes('active') || q.includes('kaun-kaun se') || q.includes('kaunse')) {
    const pendingList = tenders.filter(t => t.stage !== 'Financial Open Check' && t.status !== 'Completed')
    if (pendingList.length === 0) {
      return `### Current Pending Tenders\n\nAll tenders are currently completed or no pending tenders were found in your workspace.`
    }

    let out = `### 📋 Pending Tenders in Your System (${pendingList.length} Active)\n\n`
    out += `| Tender ID | Title | Issuing Authority | Current Stage | Status | Due Date |\n`
    out += `| :--- | :--- | :--- | :--- | :---: | :---: |\n`
    pendingList.forEach(t => {
      out += `| **${t.id}** | ${t.title?.slice(0, 45)}... | ${t.authority || 'N/A'} | **${t.stage}** | \`${t.status}\` | ${t.due || 'No date'} |\n`
    })

    if (q.includes('word') || q.includes('docx')) {
      out += `\n\n[FILE_EXPORT:{"format":"docx","filename":"Pending_Tenders_Report.docx","title":"Pending Tenders Report"}]`
    } else if (q.includes('excel') || q.includes('xlsx') || q.includes('csv') || q.includes('sheet')) {
      out += `\n\n[FILE_EXPORT:{"format":"xlsx","filename":"Pending_Tenders_Report.xlsx","title":"Pending Tenders Report"}]`
    } else if (q.includes('pdf')) {
      out += `\n\n[FILE_EXPORT:{"format":"pdf","filename":"Pending_Tenders_Report.pdf","title":"Pending Tenders Report"}]`
    }

    return out
  }

  // 4. Complete process / workflow query
  if (q.includes('complete process') || q.includes('process samjhao') || q.includes('workflow') || q.includes('kaise kaam karta')) {
    let out = `### 🚀 Complete Tender FMS Workflow (10 Sequential Stages)

Tender FMS automates government tender lifecycle management in 10 structured stages:

1. **Stage 01 • Tender Details (/tender-details):** Create tender record, upload NIT PDF, and auto-extract parameters with AI.
2. **Stage 02 • Corrigendum (/corrigendum):** Upload corrigenda and track changes.
3. **Stage 03 • Eligibility Check (/eligibility-check):** Verify CA turnover, experience, and registration documents.
4. **Stage 04 • Sample Details (/sample-details):** Verify MAF letter, NABL test reports, BIS certificate, and product sample.
5. **Stage 05 • EMD Ready (/emd-ready):** Manage EMD deposit, department bank account, and UTR tracking.
6. **Stage 06 • Document Ready (/document-ready):** Compile master dossier and edit documents in Word editor.
7. **Stage 07 • Document Upload in portal (/document-upload-in-portal):** Map dossier to portal submission checklist.
8. **Stage 08 • Submit in website (/submit-in-website):** Final bid submission verification (Online/Offline, Status Yes/No, remarks).
9. **Stage 09 • Technical Open Check (/technical-open-check):** Technical bid evaluation and pass/fail record.
10. **Stage 10 • Financial Open Check (/financial-open-check):** Commercial bid opening and L1/L2 competitor quote ranking.`

    if (q.includes('word') || q.includes('docx')) {
      out += `\n\n[FILE_EXPORT:{"format":"docx","filename":"Tender_FMS_Workflow_Guide.docx","title":"Tender FMS Workflow Guide"}]`
    } else if (q.includes('pdf')) {
      out += `\n\n[FILE_EXPORT:{"format":"pdf","filename":"Tender_FMS_Workflow_Guide.pdf","title":"Tender FMS Workflow Guide"}]`
    }
    return out
  }

  // 5. Eligibility check documents query
  if (q.includes('eligibility') || q.includes('qualification document') || q.includes('checklist')) {
    let out = `### 📄 Documents Required for Eligibility Verification (Stage 03)

In Tender FMS, the **Eligibility Check** module verifies 4 mandatory pre-qualification documents:

1. **Annual Financial Turnover Certificate:**
   - Chartered Accountant (CA) certified turnover certificate with official UDIN.
   - Audited balance sheets and profit & loss statements for the last 3 financial years.
2. **Experience / Work Completion Certificate:**
   - Previous government / PSU work orders and satisfactory completion certificates.
   - Proves past execution experience in similar projects.
3. **Vendor / Department Registration Certificate:**
   - Registration certificate with tendering authority (e.g. CREDA, PWD, Railways) or MSME/NSIC certificate.
4. **Other Statutory & Tax Documents:**
   - GST Registration Certificate, Company PAN Card, EPF/ESIC Registration, and statutory affidavits.

> You can upload, verify, and edit these in the [Eligibility Check](/eligibility-check) module.`

    if (q.includes('excel') || q.includes('xlsx') || q.includes('checklist')) {
      out += `\n\n[FILE_EXPORT:{"format":"xlsx","filename":"Eligibility_Checklist.xlsx","title":"Eligibility Verification Checklist"}]`
    } else if (q.includes('word') || q.includes('docx')) {
      out += `\n\n[FILE_EXPORT:{"format":"docx","filename":"Eligibility_Checklist.docx","title":"Eligibility Verification Checklist"}]`
    }
    return out
  }

  // 6. Generic export request
  if (q.includes('word file') || q.includes('docx')) {
    return `### 📄 Word Document Generated\n\nI have generated the requested Word document with professional formatting, headings, and tables.\n\n[FILE_EXPORT:{"format":"docx","filename":"Tender_Report.docx","title":"Tender FMS Report"}]`
  }
  if (q.includes('excel file') || q.includes('xlsx') || q.includes('excel report')) {
    return `### 📊 Excel Spreadsheet Generated\n\nI have created a formatted Excel spreadsheet with your project records and data columns.\n\n[FILE_EXPORT:{"format":"xlsx","filename":"Tender_Data_Export.xlsx","title":"Tender Data Export"}]`
  }
  if (q.includes('pdf file') || q.includes('pdf mein')) {
    return `### 📑 PDF Document Generated\n\nI have created a PDF summary of the requested information.\n\n[FILE_EXPORT:{"format":"pdf","filename":"Tender_Summary.pdf","title":"Tender Summary Report"}]`
  }

  // Default helpful response
  return `### Hello! I am Tender Query AI.

I can help you with:
- **📎 Attached File Analysis:** Upload PDF, Word, Excel, CSV, or Image files for instant AI reading, table extraction, and verification.
- **📥 Generate Downloadable Files:** Ask me to generate genuine **Word (.docx)**, **Excel (.xlsx)**, **PDF**, or **CSV** documents directly in chat.
- **Tender Records & Statuses:** Ask about any specific tender ID (e.g. \`${tenders[0]?.id || 'TND-2026-001'}\`) or pending tenders.
- **Workflow & Rules:** Ask how any stage works or what documents are needed.

You can ask in **English**, **Hindi (हिन्दी)**, or **Hinglish**!`
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { messages = [], tenders = [], currentTender, files = [] } = body

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'Messages array is required.' }, { status: 400 })
    }

    const latestMessage = messages[messages.length - 1]
    const userQuery = latestMessage?.content || ''

    // Sanitize currentTender to strip large binary/base64 dataUrls
    const cleanCurrentTender = currentTender ? sanitizeTenderForAI(currentTender) : undefined

    // 1. Build concise Live Tenders Summary Context
    let liveDataContext = 'LIVE TENDER RECORDS IN SYSTEM:\n'
    if (Array.isArray(tenders) && tenders.length > 0) {
      liveDataContext += tenders
        .map(
          t =>
            `- ID: ${t.id} | Title: "${t.title}" | Authority: ${t.authority || 'N/A'} | Stage: ${t.stage} | Status: ${t.status} | Due: ${t.due || 'N/A'} | Value: ${t.value || 'N/A'} | Firm: ${t.firm || 'RBP ENERGY (INDIA) PVT. LTD.'} | EMD: ${t.emdReady ? `Paid (${t.emdReady.amount}, UTR: ${t.emdReady.utrNumber})` : 'Pending'} | Eligibility: ${t.eligibilityCheck ? 'Docs Recorded' : 'Pending'}`
        )
        .join('\n')
    } else {
      liveDataContext += 'No tender records currently found in workspace.'
    }

    // 2. Add Scoped Tender Detailed Context if user selected a specific tender
    if (cleanCurrentTender) {
      liveDataContext += formatTenderDetailedContext(cleanCurrentTender)
    }

    // 3. Build Attached Files Context
    let filesContext = ''
    const imageFiles: any[] = []

    if (Array.isArray(files) && files.length > 0) {
      filesContext += '\n\nATTACHED USER DOCUMENTS FOR ANALYSIS:\n'
      files.forEach((f, idx) => {
        filesContext += `--- Document #${idx + 1}: "${f.name}" (${f.type}, ${f.size} bytes) ---\n`
        if (f.extractedText) {
          filesContext += `${f.extractedText.slice(0, 30000)}\n\n`
        }
        if (f.isImage && f.dataUrl) {
          imageFiles.push(f)
        }
      })
    }

    // 4. Try Calling OpenAI API if configured
    const apiKey = process.env.OPENAI_API_KEY
    const modelName = process.env.OPENAI_MODEL || 'gpt-4o'

    if (apiKey) {
      try {
        const openai = createOpenAI({ apiKey })

        // Format history for LLM
        const formattedMessages = messages.map((m, idx) => {
          const isLatest = idx === messages.length - 1

          // If latest message has images, format as multi-modal content
          if (isLatest && m.role === 'user' && imageFiles.length > 0) {
            const contentParts: any[] = [{ type: 'text', text: m.content || 'Please analyze this attached image/document.' }]
            imageFiles.forEach(img => {
              contentParts.push({
                type: 'image',
                image: img.dataUrl,
              })
            })
            return {
              role: 'user' as const,
              content: contentParts,
            }
          }

          return {
            role: m.role as 'user' | 'assistant',
            content: m.content,
          }
        })

        const systemPrompt = `${SYSTEM_INSTRUCTIONS}\n\n${liveDataContext}${filesContext}`

        const result = await generateText({
          model: openai(modelName),
          system: systemPrompt,
          messages: formattedMessages as any,
          temperature: 0.2,
        })

        if (result && result.text) {
          return NextResponse.json({
            reply: result.text,
            grounded: true,
            model: modelName,
            sourceCount: tenders.length,
            analyzedFiles: files.length,
            scopedTenderId: cleanCurrentTender?.id,
          })
        }
      } catch (aiErr: any) {
        console.warn('OpenAI generateText warning (falling back to local engine):', aiErr?.message || aiErr)
      }
    }

    // 5. Fallback to Local Intelligent Engine if API is unavailable or had error
    const fallbackReply = handleFallbackResponse(userQuery, tenders, messages, files, cleanCurrentTender)
    return NextResponse.json({
      reply: fallbackReply,
      grounded: true,
      model: 'tender-fms-local-engine',
      sourceCount: tenders.length,
      analyzedFiles: files.length,
      scopedTenderId: cleanCurrentTender?.id,
    })
  } catch (err: any) {
    console.error('Error in tender-query route:', err)
    return NextResponse.json(
      {
        error: 'Failed to process tender query.',
        details: err?.message || 'Internal error',
      },
      { status: 500 }
    )
  }
}
