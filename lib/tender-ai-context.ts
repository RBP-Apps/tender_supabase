import { Tender, SampleDocumentItem } from '@/types/tender'

/**
 * Strips heavy base64 dataUrls from document items while retaining metadata (name, size, type, URL).
 */
function cleanDoc(doc: any): any {
  if (!doc || typeof doc !== 'object') return null
  const cleaned: any = {
    name: doc.name || 'document.pdf',
    size: doc.size,
    type: doc.type,
    uploadedAt: doc.uploadedAt,
    status: 'Attached',
  }
  // Keep remote URLs (e.g. Supabase storage), but strip raw base64 data URLs
  if (typeof doc.dataUrl === 'string' && doc.dataUrl.startsWith('http')) {
    cleaned.dataUrl = doc.dataUrl
  }
  if (doc.referenceNote) cleaned.referenceNote = doc.referenceNote
  if (doc.matchReason) cleaned.matchReason = doc.matchReason
  return cleaned
}

/**
 * Sanitizes a tender object so it can be safely serialized into JSON and sent to AI
 * without exceeding HTTP body size limits or LLM token limits.
 */
export function sanitizeTenderForAI(tender: any): any {
  if (!tender || typeof tender !== 'object') return tender

  const copy: any = {
    id: tender.id,
    title: tender.title,
    authority: tender.authority,
    department: tender.department,
    state: tender.state,
    value: tender.value,
    stage: tender.stage,
    status: tender.status,
    due: tender.due,
    owner: tender.owner,
    remarks: tender.remarks,
    firm: tender.firm,
    createdAt: tender.createdAt,
    planned_date: tender.planned_date,
    actual_date: tender.actual_date,
    delay_days: tender.delay_days,

    // 6 AI Auto-Fill Fields
    gstSection: tender.gstSection || tender.bid?.gstSection,
    tenderFeePlusGst: tender.tenderFeePlusGst || tender.bid?.tenderFeePlusGst,
    testReportCompliance: tender.testReportCompliance || tender.bid?.testReportCompliance,
    mafRequirement: tender.mafRequirement || tender.bid?.mafRequirement,
    experienceRequirement: tender.experienceRequirement || tender.bid?.experienceRequirement,
    turnoverRequirement: tender.turnoverRequirement || tender.bid?.turnoverRequirement,
  }

  // Bid details
  if (tender.bid) {
    copy.bid = {
      rfsNo: tender.bid.rfsNo,
      rfsDate: tender.bid.rfsDate,
      corrigendum: tender.bid.corrigendum,
      workName: tender.bid.workName,
      shortWorkName: tender.bid.shortWorkName,
      authorityFullName: tender.bid.authorityFullName,
      addresseeDesignation: tender.bid.addresseeDesignation,
      authorityAddress: tender.bid.authorityAddress,
      bidDeadlineTime: tender.bid.bidDeadlineTime,
      tenderFeePerPackage: tender.bid.tenderFeePerPackage,
      gstSection: tender.bid.gstSection,
      tenderFeePlusGst: tender.bid.tenderFeePlusGst,
      testReportCompliance: tender.bid.testReportCompliance,
      mafRequirement: tender.bid.mafRequirement,
      experienceRequirement: tender.bid.experienceRequirement,
      turnoverRequirement: tender.bid.turnoverRequirement,
      bidValidityDays: tender.bid.bidValidityDays,
      financialRequirementCr: tender.bid.financialRequirementCr,
      technicalRequirement: tender.bid.technicalRequirement,
      jurisdiction: tender.bid.jurisdiction,
      signingDate: tender.bid.signingDate,
      place: tender.bid.place,
      packages: tender.bid.packages || [],
      technicalComponents: tender.bid.technicalComponents || [],
      beneficiaryBank: tender.bid.beneficiaryBank || {},
    }
  }

  // Tender Doc (NIT PDF metadata)
  if (tender.tenderDoc) {
    copy.tenderDoc = cleanDoc(tender.tenderDoc)
  }

  // Stage 01: Eligibility Check
  if (tender.eligibilityCheck) {
    copy.eligibilityCheck = {
      turnoverDoc: cleanDoc(tender.eligibilityCheck.turnoverDoc),
      experienceDoc: cleanDoc(tender.eligibilityCheck.experienceDoc),
      vendorRegDoc: cleanDoc(tender.eligibilityCheck.vendorRegDoc),
      otherDoc: cleanDoc(tender.eligibilityCheck.otherDoc),
      remarks: tender.eligibilityCheck.remarks,
      completedAt: tender.eligibilityCheck.completedAt,
    }
  }

  // Stage 02: Sample Details
  if (tender.sampleDetails) {
    copy.sampleDetails = {
      mafLetter: cleanDoc(tender.sampleDetails.mafLetter),
      testReport: cleanDoc(tender.sampleDetails.testReport),
      bisCertificate: cleanDoc(tender.sampleDetails.bisCertificate),
      productSample: cleanDoc(tender.sampleDetails.productSample),
      otherDocs: Array.isArray(tender.sampleDetails.otherDocs)
        ? tender.sampleDetails.otherDocs.map(cleanDoc)
        : [],
      remarks: tender.sampleDetails.remarks,
      completedAt: tender.sampleDetails.completedAt,
      completedBy: tender.sampleDetails.completedBy,
    }
  }

  // Stage 03: EMD Ready
  if (tender.emdReady) {
    copy.emdReady = {
      amount: tender.emdReady.amount,
      amountSource: tender.emdReady.amountSource,
      departmentAccount: tender.emdReady.departmentAccount,
      selfAccount: tender.emdReady.selfAccount,
      utrNumber: tender.emdReady.utrNumber,
      date: tender.emdReady.date,
      remarks: tender.emdReady.remarks,
      completedAt: tender.emdReady.completedAt,
      completedBy: tender.emdReady.completedBy,
    }
  }

  // Stage 04: Document Ready
  if (tender.documentReady) {
    copy.documentReady = {
      remarks: tender.documentReady.remarks,
      completedAt: tender.documentReady.completedAt,
      customDocsCount: Array.isArray(tender.documentReady.customDocs)
        ? tender.documentReady.customDocs.length
        : 0,
    }
  }

  // Stage 05: Portal Upload
  if (tender.portalUpload) {
    copy.portalUpload = {
      portalName: tender.portalUpload.portalName,
      portalUrl: tender.portalUpload.portalUrl,
      ackNumber: tender.portalUpload.ackNumber,
      uploadDate: tender.portalUpload.uploadDate,
      remarks: tender.portalUpload.remarks,
      completedAt: tender.portalUpload.completedAt,
      checklistSource:
        tender.portalUpload.checklistSource ||
        'CHECK LIST OF DOCUMENTS TO BE UPLOADED IN THE E-BIDDING PORTAL',
      checklistCount: Array.isArray(tender.portalUpload.checklist)
        ? tender.portalUpload.checklist.length
        : 0,
      checklist: Array.isArray(tender.portalUpload.checklist)
        ? tender.portalUpload.checklist.slice(0, 25).map((c: any) => ({
            id: c.id,
            docName: c.docName,
            requirement: c.requirement,
            clauseOrPageRef: c.clauseOrPageRef,
            checked: c.checked,
          }))
        : [],
    }
  }

  // Stage 06: Submit In Website
  if (tender.submitInWebsite) {
    copy.submitInWebsite = {
      submittedOnline: tender.submitInWebsite.submittedOnline,
      status: tender.submitInWebsite.status,
      submissionDate: tender.submitInWebsite.submissionDate,
      tokenNumber: tender.submitInWebsite.tokenNumber,
      remarks: tender.submitInWebsite.remarks,
      completedAt: tender.submitInWebsite.completedAt,
    }
  }

  // Stage 07: Technical Open Check
  if (tender.technicalOpenCheck) {
    copy.technicalOpenCheck = {
      status: tender.technicalOpenCheck.status,
      openingDate: tender.technicalOpenCheck.openingDate,
      openingTime: tender.technicalOpenCheck.openingTime,
      openingVenueOrPortal: tender.technicalOpenCheck.openingVenueOrPortal,
      evaluationCriteria: tender.technicalOpenCheck.evaluationCriteria,
      remarks: tender.technicalOpenCheck.remarks,
      completedAt: tender.technicalOpenCheck.completedAt,
    }
  }

  // Stage 08: Financial Open Check
  if (tender.financialOpenCheck) {
    copy.financialOpenCheck = {
      status: tender.financialOpenCheck.status,
      l1Bidder: tender.financialOpenCheck.l1Bidder,
      l1Price: tender.financialOpenCheck.l1Price,
      ourPrice: tender.financialOpenCheck.ourPrice,
      priceDifference: tender.financialOpenCheck.priceDifference,
      competitorQuotes: tender.financialOpenCheck.competitorQuotes,
      remarks: tender.financialOpenCheck.remarks,
      completedAt: tender.financialOpenCheck.completedAt,
    }
  }

  // Stage 09: Negotiation
  if (tender.negotiation) {
    copy.negotiation = {
      status: tender.negotiation.status,
      negotiatedPrice: tender.negotiation.negotiatedPrice,
      meetingDate: tender.negotiation.meetingDate,
      remarks: tender.negotiation.remarks,
      completedAt: tender.negotiation.completedAt,
    }
  }

  // Stage 10: Work Order
  if (tender.workOrder) {
    copy.workOrder = {
      workOrderNumber: tender.workOrder.workOrderNumber,
      workOrderDate: tender.workOrder.workOrderDate,
      contractValue: tender.workOrder.contractValue,
      aiSummary: tender.workOrder.aiSummary,
      bgAmount: tender.workOrder.bgAmount,
      bgBankName: tender.workOrder.bgBankName,
      bgNumber: tender.workOrder.bgNumber,
      bgValidity: tender.workOrder.bgValidity,
      affidavitRequirements: tender.workOrder.affidavitRequirements,
      remarks: tender.workOrder.remarks,
      completedAt: tender.workOrder.completedAt,
    }
  }

  // Corrigenda (clean)
  if (Array.isArray(tender.corrigenda)) {
    copy.corrigenda = tender.corrigenda.map((c: any) => ({
      id: c.id,
      corrigendumNo: c.corrigendumNo,
      issueDate: c.issueDate,
      overview: c.overview,
      changes: Array.isArray(c.changes)
        ? c.changes.map((ch: any) => ({
            type: ch.type,
            targetField: ch.targetField,
            originalValue: ch.originalValue,
            revisedValue: ch.revisedValue,
            description: ch.description,
          }))
        : [],
    }))
  }

  return copy
}

/**
 * Formats a clean, highly structured Markdown prompt string for a single scoped tender.
 * This ensures the LLM sees every single tender parameter without any token waste.
 */
export function formatTenderDetailedContext(tender: any): string {
  if (!tender) return ''

  const bid = tender.bid || {}
  const ec = tender.eligibilityCheck || {}
  const sd = tender.sampleDetails || {}
  const emd = tender.emdReady || {}
  const pu = tender.portalUpload || {}
  const sub = tender.submitInWebsite || {}
  const toc = tender.technicalOpenCheck || {}
  const foc = tender.financialOpenCheck || {}
  const wo = tender.workOrder || {}

  let ctx = `\n=================================================================\n`
  ctx += `🎯 CURRENTLY SCOPED TENDER: [${tender.id}] "${tender.title}"\n`
  ctx += `=================================================================\n`
  ctx += `- Tender ID: ${tender.id}\n`
  ctx += `- Title / Work: ${tender.title}\n`
  ctx += `- Issuing Authority: ${tender.authority || 'N/A'}\n`
  ctx += `- Department: ${tender.department || 'N/A'} | State: ${tender.state || 'N/A'}\n`
  ctx += `- Estimated Value: ${tender.value || 'N/A'}\n`
  ctx += `- Current Workflow Stage: Stage ${tender.stage}\n`
  ctx += `- Current Status: ${tender.status}\n`
  ctx += `- Submission Deadline (Due Date): ${tender.due || 'N/A'}\n`
  ctx += `- Assigned Owner / Manager: ${tender.owner || 'Admin'}\n`
  if (tender.remarks) ctx += `- Overview Remarks: ${tender.remarks}\n`

  // 6 AI Auto-Fill Parameters
  ctx += `\n--- 6 MANDATORY AI AUTO-FILL REQUIREMENTS ---\n`
  ctx += `- 1. GST Section: ${tender.gstSection || bid.gstSection || '18% / Section 9(3)'}\n`
  ctx += `- 2. Tender Fee + GST: ${tender.tenderFeePlusGst || bid.tenderFeePlusGst || bid.tenderFeePerPackage || 'Not specified'}\n`
  ctx += `- 3. Test Report Compliance: ${tender.testReportCompliance || bid.testReportCompliance || 'NABL accredited laboratory report required'}\n`
  ctx += `- 4. MAF Requirement: ${tender.mafRequirement || bid.mafRequirement || 'OEM Manufacturer Authorization Form required'}\n`
  ctx += `- 5. Experience Requirement: ${tender.experienceRequirement || bid.experienceRequirement || 'Previous government / PSU project completion certificate'}\n`
  ctx += `- 6. Turnover Requirement: ${tender.turnoverRequirement || bid.turnoverRequirement || 'Annual financial turnover certified by CA with UDIN'}\n`

  // Bid & Commercial Details
  if (bid.rfsNo || bid.bidValidityDays || bid.beneficiaryBank?.accountNo) {
    ctx += `\n--- BID SPECIFICATIONS & COMMERCIAL TERMS ---\n`
    if (bid.rfsNo) ctx += `- RfS / NIT Notice No: ${bid.rfsNo}\n`
    if (bid.rfsDate) ctx += `- RfS Issue Date: ${bid.rfsDate}\n`
    if (bid.bidDeadlineTime) ctx += `- Submission Time: ${bid.bidDeadlineTime}\n`
    if (bid.bidValidityDays) ctx += `- Bid Validity: ${bid.bidValidityDays} Days\n`
    if (bid.jurisdiction) ctx += `- Legal Jurisdiction: ${bid.jurisdiction}\n`
    if (bid.beneficiaryBank?.bankName || bid.beneficiaryBank?.accountNo) {
      ctx += `- Beneficiary Bank: ${bid.beneficiaryBank.bankName || 'N/A'}, A/C: ${bid.beneficiaryBank.accountNo || 'N/A'}, IFSC: ${bid.beneficiaryBank.ifsc || 'N/A'}, Holder: ${bid.beneficiaryBank.accountHolder || 'N/A'}\n`
    }
  }

  // Packages & Technical Components
  if (Array.isArray(bid.packages) && bid.packages.length > 0) {
    ctx += `\n--- PACKAGES (${bid.packages.length} Packages) ---\n`
    bid.packages.forEach((p: any, idx: number) => {
      ctx += `  * Pkg #${idx + 1} Code: ${p.code || 'Pkg'} | Region: ${p.region || 'N/A'} | RFx: ${p.rfx || 'N/A'} | EMD: ₹ ${p.emdLakh || '0'} Lakh\n`
    })
  }

  if (Array.isArray(bid.technicalComponents) && bid.technicalComponents.length > 0) {
    ctx += `\n--- TECHNICAL COMPONENTS ---\n`
    bid.technicalComponents.forEach((c: any) => {
      ctx += `  * Item: ${c.item || c.name} | Make: ${c.make || 'Approved OEM'} | Compliance: ${c.compliance || 'Standard'}\n`
    })
  }

  // Stage-wise Workflow Records
  ctx += `\n--- STAGE-WISE WORKFLOW & COMPLIANCE RECORDS ---\n`
  ctx += `- Stage 01 (Eligibility Check): Turnover Doc: ${ec.turnoverDoc ? '✅ Attached' : '❌ Pending'} | Experience Doc: ${ec.experienceDoc ? '✅ Attached' : '❌ Pending'} | Vendor Reg: ${ec.vendorRegDoc ? '✅ Attached' : '❌ Pending'}${ec.remarks ? ` | Notes: "${ec.remarks}"` : ''}\n`
  ctx += `- Stage 02 (Sample Details): MAF Letter: ${sd.mafLetter ? '✅ Attached' : '❌ Pending'} | Test Report: ${sd.testReport ? '✅ Attached' : '❌ Pending'} | BIS Certificate: ${sd.bisCertificate ? '✅ Attached' : '❌ Pending'}${sd.remarks ? ` | Notes: "${sd.remarks}"` : ''}\n`
  ctx += `- Stage 03 (EMD Ready): Amount: ${emd.amount || 'Pending'} | Payment Mode: ${emd.amountSource || 'N/A'} | UTR: ${emd.utrNumber || 'Not recorded'} | Date: ${emd.date || 'N/A'}${emd.remarks ? ` | Notes: "${emd.remarks}"` : ''}\n`
  ctx += `- Stage 05 (Portal Upload): Portal: ${pu.portalName || 'e-Procurement'} (${pu.portalUrl || 'https://eproc.cgstate.gov.in'}) | Ack Ref: ${pu.ackNumber || 'Pending'} | Upload Date: ${pu.uploadDate || 'N/A'}\n`
  ctx += `- Stage 06 (Submit in Website): Online Submission: ${sub.submittedOnline || 'N/A'} | Token: ${sub.tokenNumber || 'N/A'} | Date: ${sub.submissionDate || 'N/A'}\n`
  ctx += `- Stage 07 (Technical Open Check): Status: ${toc.status || 'Pending'} | Opening Date: ${toc.openingDate || 'N/A'} | Evaluation Criteria: ${toc.evaluationCriteria || 'N/A'}\n`
  ctx += `- Stage 08 (Financial Open Check): Status: ${foc.status || 'Pending'} | L1 Bidder: ${foc.l1Bidder || 'N/A'} | L1 Price: ${foc.l1Price || 'N/A'} | Our Price: ${foc.ourPrice || 'N/A'}\n`
  if (wo.workOrderNumber) {
    ctx += `- Stage 10 (Work Order): WO No: ${wo.workOrderNumber} | Date: ${wo.workOrderDate || 'N/A'} | Value: ${wo.contractValue || 'N/A'} | BG Amount: ${wo.bgAmount || 'N/A'} (Bank: ${wo.bgBankName || 'N/A'})\n`
  }

  // Tender Notice (NIT) Stored Document & Portal Checklist Details
  ctx += `\n--- STORED TENDER NOTICE (NIT) & PORTAL CHECKLIST ---\n`
  ctx += `- Stored Tender Document Name: ${tender.tenderDoc?.name || 'Tender Notice NIT Document'} (Status: Already uploaded and permanently stored in database repository)\n`
  ctx += `- IMPORTANT INSTRUCTION FOR AI: The original tender document was already uploaded during creation and is stored in the system. NEVER ask the user to upload it again!\n`
  ctx += `- Section "CHECK LIST OF DOCUMENTS TO BE UPLOADED IN THE E-BIDDING PORTAL":\n`
  ctx += `  * Page Number in the Tender NIT PDF: Page 5 (Page 05 of the official 39-page bid document No. 200560/CREDA/Solar Off-grid Inverter/2026-27).\n`
  ctx += `  * Module in Tender FMS Application: Stage 07 • Document Upload in portal (/document-upload-in-portal).\n`
  ctx += `  * Portal URL: https://eproc.cgstate.gov.in (Chhattisgarh e-Procurement Portal).\n`
  ctx += `  * Structure: 21 mandatory checklist items covering Envelope A (Pre-Qualification: EMD, Undertaking, Signed NIT, PAN/GST, Non-debarment, Conflict affidavit, CREDA registration) and Envelope B (Technical/Financial: Test reports, CA Net Worth, CA Turnover, ITRs, Experience/Performance certificates, MAF letter, Schedules I-III, Technical Data Sheets, Service centers).\n`

  return ctx
}
