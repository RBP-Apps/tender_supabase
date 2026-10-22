import { supabase } from '@/lib/supabaseClient'
import {
  BankAccountDetails,
  CompanyDocumentItem,
  CompanyMasterDocuments,
  CorrigendumChangeItem,
  CorrigendumRecord,
  DocumentReadyData,
  EligibilityCheckData,
  EmdReadyData,
  EmdReadyHistoryEntry,
  FinancialOpenCheckData,
  FinancialOpenCheckHistoryEntry,
  FinancialRanking,
  MasterKey,
  Masters,
  NegotiationData,
  NegotiationHistoryEntry,
  PortalUploadData,
  PortalUploadDocumentItem,
  PortalUploadHistoryEntry,
  SampleDetailsData,
  SampleDetailsHistoryEntry,
  Stage,
  Status,
  SubmitInWebsiteData,
  SubmitInWebsiteHistoryEntry,
  TechnicalOpenCheckData,
  TechnicalOpenCheckHistoryEntry,
  TechnicalOpenStatus,
  Tender,
  TenderBidDetails,
  WorkOrderData,
  WorkOrderHistoryEntry,
} from '@/types/tender'
import { uploadToSupabaseBucket, STAGE_FOLDERS } from '@/lib/supabase-storage'

// ====================================================================
// MASTERS & CONFIGURATION
// ====================================================================

export const defaultMasters: Masters = {
  states: [],
  departments: [],
  firms: [],
  tenderTypes: [],
}

export async function fetchMastersFromSupabase(): Promise<Masters> {
  try {
    const { data, error } = await supabase
      .from('master_categories')
      .select('category_type, name')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })

    if (error || !data || data.length === 0) {
      return defaultMasters
    }

    const masters: Masters = {
      states: [],
      departments: [],
      firms: [],
      tenderTypes: [],
    }

    for (const row of data) {
      const type = row.category_type as MasterKey
      if (masters[type] && !masters[type].includes(row.name)) {
        masters[type].push(row.name)
      }
    }

    return {
      states: masters.states,
      departments: masters.departments,
      firms: masters.firms,
      tenderTypes: masters.tenderTypes,
    }
  } catch (err) {
    console.error('fetchMastersFromSupabase error:', err)
    return defaultMasters
  }
}

export async function addMasterCategoryToSupabase(categoryType: MasterKey, name: string) {
  try {
    const { error } = await supabase.from('master_categories').upsert(
      {
        category_type: categoryType,
        name: name.trim(),
        is_active: true,
      },
      { onConflict: 'category_type, name' }
    )
    if (error) throw error
  } catch (err) {
    console.error('addMasterCategoryToSupabase error:', err)
    throw err
  }
}

export async function deleteMasterCategoryFromSupabase(categoryType: MasterKey, name: string) {
  try {
    const { error } = await supabase
      .from('master_categories')
      .delete()
      .eq('category_type', categoryType)
      .eq('name', name)
    if (error) throw error
  } catch (err) {
    console.error('deleteMasterCategoryFromSupabase error:', err)
    throw err
  }
}

export async function updateMasterCategoryInSupabase(
  categoryType: MasterKey,
  oldName: string,
  newName: string
) {
  try {
    const trimmedOld = oldName.trim()
    const trimmedNew = newName.trim()
    if (trimmedOld === trimmedNew) return

    const { error } = await supabase
      .from('master_categories')
      .update({ name: trimmedNew })
      .eq('category_type', categoryType)
      .eq('name', trimmedOld)

    if (error) {
      console.warn('Direct update failed, falling back to delete & add:', error)
      await deleteMasterCategoryFromSupabase(categoryType, trimmedOld)
      await addMasterCategoryToSupabase(categoryType, trimmedNew)
    }
  } catch (err) {
    console.error('updateMasterCategoryInSupabase error:', err)
    throw err
  }
}


// ====================================================================
// SELF / COMPANY BANK ACCOUNTS
// ====================================================================

export async function fetchSelfAccountsFromSupabase(): Promise<BankAccountDetails[]> {
  try {
    const { data, error } = await supabase
      .from('master_bank_accounts')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    if (error || !data) {
      console.warn('Could not fetch bank accounts from Supabase:', error?.message)
      return []
    }

    return data.map(row => ({
      bankName: row.bank_name,
      accountHolder: row.account_holder || '',
      accountNo: row.account_no,
      ifsc: row.ifsc,
      branch: row.branch || '',
    }))
  } catch (err) {
    console.error('fetchSelfAccountsFromSupabase error:', err)
    return []
  }
}

export async function saveSelfAccountToSupabase(account: BankAccountDetails) {
  try {
    const { error } = await supabase.from('master_bank_accounts').upsert(
      {
        bank_name: account.bankName,
        account_holder: account.accountHolder || '',
        account_no: account.accountNo,
        ifsc: account.ifsc,
        branch: account.branch || '',
        is_active: true,
      },
      { onConflict: 'account_no' }
    )
    if (error) throw error
  } catch (err) {
    console.error('saveSelfAccountToSupabase error:', err)
    throw err
  }
}

export async function deleteSelfAccountFromSupabase(accountNo: string) {
  try {
    const { error } = await supabase
      .from('master_bank_accounts')
      .delete()
      .eq('account_no', accountNo)
    if (error) throw error
  } catch (err) {
    console.error('deleteSelfAccountFromSupabase error:', err)
    throw err
  }
}

export async function updateSelfAccountInSupabase(
  oldAccountNo: string,
  account: BankAccountDetails
) {
  try {
    if (oldAccountNo !== account.accountNo) {
      await deleteSelfAccountFromSupabase(oldAccountNo)
    }
    await saveSelfAccountToSupabase(account)
  } catch (err) {
    console.error('updateSelfAccountInSupabase error:', err)
    throw err
  }
}


// ====================================================================
// COMPANY MASTER DOCUMENTS (Settings: Turnover, Networth, Experience)
// ====================================================================

export async function fetchCompanyDocsFromSupabase(): Promise<CompanyMasterDocuments> {
  try {
    const { data, error } = await supabase
      .from('master_company_documents')
      .select('*')

    if (error || !data || data.length === 0) {
      return {}
    }

    const docs: CompanyMasterDocuments = {}
    for (const row of data) {
      const key = row.doc_key as keyof CompanyMasterDocuments
      if (key) {
        docs[key] = {
          name: row.file_name || row.doc_title || '',
          size: Number(row.file_size) || 0,
          type: row.mime_type || 'application/pdf',
          uploadedAt: row.uploaded_at || row.created_at || new Date().toISOString(),
          dataUrl: row.file_url || '',
          value: row.doc_value || '',
          notes: row.notes || '',
        }
      }
    }
    return docs
  } catch (err) {
    console.warn('fetchCompanyDocsFromSupabase note:', err)
    return {}
  }
}

export async function saveCompanyDocToSupabase(
  key: keyof CompanyMasterDocuments,
  doc: CompanyDocumentItem | null
): Promise<void> {
  try {
    if (!doc) {
      await supabase
        .from('master_company_documents')
        .delete()
        .eq('doc_key', key)
      return
    }

    const titleMap: Record<keyof CompanyMasterDocuments, string> = {
      turnoverDoc: 'Company Turnover Document',
      networthDoc: 'Networth Certificate',
      experienceDoc: 'Work Completion / Experience Certificate',
      signatureDoc: 'Authorised Signatory / Signature',
      sealDoc: 'Company Seal / Stamp',
      signatureSealDoc: 'Company Signature and Seal',
    }

    let finalFileUrl = doc.dataUrl || null
    if (finalFileUrl && finalFileUrl.startsWith('data:')) {
      const isImg = doc.type?.startsWith('image/') || /\.(png|jpg|jpeg|webp)$/i.test(doc.name || '')
      const ext = isImg ? (doc.name?.split('.').pop() || 'png') : 'pdf'
      const uploadRes = await uploadToSupabaseBucket({
        dataUrl: finalFileUrl,
        fileName: doc.name || `${key}.${ext}`,
        folder: STAGE_FOLDERS.MASTER_SETTINGS,
        tenderId: key,
      })
      if (uploadRes.storage === 'bucket' && uploadRes.url) {
        finalFileUrl = uploadRes.url
        doc.dataUrl = uploadRes.url
      }
    }

    await supabase
      .from('master_company_documents')
      .upsert(
        {
          doc_key: key,
          doc_title: titleMap[key] || key,
          file_name: doc.name,
          file_size: doc.size,
          mime_type: doc.type,
          file_url: finalFileUrl,
          doc_value: doc.value || null,
          notes: doc.notes || null,
          uploaded_at: doc.uploadedAt || new Date().toISOString(),
        },
        { onConflict: 'doc_key' }
      )
  } catch (err) {
    console.warn(`saveCompanyDocToSupabase (${key}) notice:`, err)
  }
}

// ====================================================================
// HEALTH & CONNECTIVITY DIAGNOSTICS
// ====================================================================

export interface SupabaseHealthStatus {
  connected: boolean
  url: string
  tendersCount: number
  tables: {
    tenders: boolean
    master_categories: boolean
    master_bank_accounts: boolean
    stage_01_eligibility_check: boolean
    master_company_documents?: boolean
    storageBucket?: boolean
  }
  error?: string
}

export async function checkSupabaseHealth(): Promise<SupabaseHealthStatus> {
  const status: SupabaseHealthStatus = {
    connected: false,
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://vypmvumfxzxvhtqcbmuv.supabase.co',
    tendersCount: 0,
    tables: {
      tenders: false,
      master_categories: false,
      master_bank_accounts: false,
      stage_01_eligibility_check: false,
      storageBucket: false,
    },
  }

  try {
    const { data: tendersData, error: tErr } = await supabase
      .from('tenders')
      .select('id')
      .limit(500)

    if (tErr) {
      status.error = tErr.message
      return status
    }

    status.tables.tenders = true
    status.tendersCount = tendersData?.length || 0
    status.connected = true

    // Check optional tables and storage bucket
    const [{ error: mErr }, { error: bErr }, { error: ecErr }, { error: cdErr }] = await Promise.all([
      supabase.from('master_categories').select('id').limit(1),
      supabase.from('master_bank_accounts').select('id').limit(1),
      supabase.from('stage_01_eligibility_check').select('id').limit(1),
      supabase.from('master_company_documents').select('id').limit(1),
    ])

    status.tables.master_categories = !mErr
    status.tables.master_bank_accounts = !bErr
    status.tables.stage_01_eligibility_check = !ecErr
    status.tables.master_company_documents = !cdErr

    // Check / auto-create tender-documents storage bucket
    try {
      const { data: bucket, error: bucketErr } = await supabase.storage.getBucket('tender-documents')
      if (bucket && !bucketErr) {
        status.tables.storageBucket = true
      } else {
        const { data: created, error: cErr } = await supabase.storage.createBucket('tender-documents', {
          public: true,
        })
        status.tables.storageBucket = !cErr && !!created
      }
    } catch {
      status.tables.storageBucket = false
    }

    return status
  } catch (err: any) {
    status.error = err?.message || 'Connection failed'
    return status
  }
}

// ====================================================================
// TENDERS - MAP DB RECORD GRAPH TO APP MODEL
// ====================================================================

export function mapDbRowToTender(row: any): Tender {
  // Map Bid Details
  let bid: TenderBidDetails | undefined = undefined
  const bidRow = Array.isArray(row.tender_bid_details)
    ? row.tender_bid_details[0]
    : row.tender_bid_details

  if (bidRow) {
    bid = {
      rfsNo: bidRow.rfs_no || '',
      rfsDate: bidRow.rfs_date || '',
      corrigendum: bidRow.corrigendum || '',
      workName: bidRow.work_name || '',
      shortWorkName: bidRow.short_work_name || '',
      authorityFullName: bidRow.authority_full_name || '',
      addresseeDesignation: bidRow.addressee_designation || '',
      authorityAddress: bidRow.authority_address || '',
      bidDeadlineTime: bidRow.bid_deadline_time || '',
      tenderFeePerPackage: bidRow.tender_fee_per_package || '',
      gstSection: bidRow.gst_section || '',
      tenderFeePlusGst: bidRow.tender_fee_plus_gst || '',
      testReportCompliance: bidRow.test_report_compliance || '',
      mafRequirement: bidRow.maf_requirement || '',
      experienceRequirement: bidRow.experience_requirement || '',
      turnoverRequirement: bidRow.turnover_requirement || '',
      bidValidityDays: bidRow.bid_validity_days || '180',
      financialRequirementCr: bidRow.financial_requirement_cr || '',
      technicalRequirement: bidRow.technical_requirement || '',
      jurisdiction: bidRow.jurisdiction || '',
      signingDate: bidRow.signing_date || '',
      place: bidRow.signing_place || 'Anand',
      packages: (row.tender_packages || []).map((p: any) => ({
        code: p.code,
        region: p.region || '',
        rfx: p.rfx || '',
        emdLakh: p.emd_lakh || '',
      })),
      technicalComponents: (row.tender_technical_components || []).map((c: any) => ({
        item: c.item_name,
        make: c.make || '',
        compliance: c.compliance || '',
      })),
      beneficiaryBank: {
        accountHolder: bidRow.beneficiary_account_holder || '',
        bankName: bidRow.beneficiary_bank_name || '',
        branch: bidRow.beneficiary_branch || '',
        accountNo: bidRow.beneficiary_account_no || '',
        ifsc: bidRow.beneficiary_ifsc || '',
        accountType: bidRow.beneficiary_account_type || '',
      },
    }
  }

  // Map Corrigenda
  const corrigenda: CorrigendumRecord[] = (row.tender_corrigenda || []).map((c: any) => ({
    id: c.id,
    corrigendumNo: c.corrigendum_no,
    issueDate: c.issue_date,
    tenderRef: c.tender_ref,
    fileName: c.file_name || '',
    uploadedAt: c.uploaded_at || '',
    overview: c.overview || '',
    changes: (c.tender_corrigendum_changes || []).map((ch: any): CorrigendumChangeItem => ({
      id: ch.id,
      type: ch.change_type,
      category: ch.category || 'standard',
      targetField: ch.target_field,
      originalValue: ch.original_value || '',
      revisedValue: ch.revised_value || '',
      description: ch.description || '',
      pageClauseRef: ch.page_clause_ref,
      isCritical: ch.is_critical,
      applied: ch.applied,
    })),
  }))

  // Map Stage 01: Eligibility Check
  let eligibilityCheck: EligibilityCheckData | undefined = undefined
  const ecRow = Array.isArray(row.stage_01_eligibility_check)
    ? row.stage_01_eligibility_check[0]
    : row.stage_01_eligibility_check
  if (ecRow) {
    eligibilityCheck = {
      turnoverDoc: ecRow.turnover_doc || null,
      experienceDoc: ecRow.experience_doc || null,
      vendorRegDoc: ecRow.vendor_reg_doc || null,
      otherDoc: ecRow.other_doc || null,
      remarks: ecRow.remarks || '',
      completedAt: ecRow.completed_at || undefined,
    }
  }

  // Map Stage 02: Sample Details
  let sampleDetails: SampleDetailsData | undefined = undefined
  const sdRow = Array.isArray(row.stage_02_sample_details)
    ? row.stage_02_sample_details[0]
    : row.stage_02_sample_details
  if (sdRow) {
    sampleDetails = {
      mafLetter: sdRow.maf_letter || null,
      testReport: sdRow.test_report || null,
      bisCertificate: sdRow.bis_certificate || null,
      productSample: sdRow.product_sample || null,
      otherDocs: sdRow.other_docs || [],
      remarks: sdRow.remarks || '',
      completedAt: sdRow.completed_at || undefined,
      completedBy: sdRow.completed_by || undefined,
      history: (row.sample_details_history || []).map((h: any): SampleDetailsHistoryEntry => ({
        id: h.id,
        submittedAt: h.submitted_at,
        submittedBy: h.submitted_by || 'Admin',
        mafLetter: h.maf_letter || null,
        testReport: h.test_report || null,
        bisCertificate: h.bis_certificate || null,
        productSample: h.product_sample || null,
        otherDocs: h.other_docs || [],
        remarks: h.remarks || '',
        previousStage: h.previous_stage,
        advancedToStage: h.advanced_to_stage,
        updateSummary: h.update_summary,
      })),
    }
  }

  // Map Stage 03: EMD Ready
  let emdReady: EmdReadyData | undefined = undefined
  const emdRow = Array.isArray(row.stage_03_emd_ready)
    ? row.stage_03_emd_ready[0]
    : row.stage_03_emd_ready
  if (emdRow) {
    emdReady = {
      amount: emdRow.amount || '',
      amountSource: emdRow.amount_source || '',
      departmentAccount: {
        bankName: emdRow.dept_bank_name || '',
        accountHolder: emdRow.dept_account_holder || '',
        accountNo: emdRow.dept_account_no || '',
        ifsc: emdRow.dept_ifsc || '',
        branch: emdRow.dept_branch || '',
      },
      selfAccount: {
        bankName: emdRow.self_bank_name || '',
        accountHolder: emdRow.self_account_holder || '',
        accountNo: emdRow.self_account_no || '',
        ifsc: emdRow.self_ifsc || '',
        branch: emdRow.self_branch || '',
      },
      utrNumber: emdRow.utr_number || '',
      date: emdRow.payment_date || '',
      remarks: emdRow.remarks || '',
      completedAt: emdRow.completed_at || undefined,
      completedBy: emdRow.completed_by || undefined,
      history: (row.emd_ready_history || []).map((h: any): EmdReadyHistoryEntry => ({
        id: h.id,
        submittedAt: h.submitted_at,
        submittedBy: h.submitted_by || 'Admin',
        amount: h.amount,
        amountSource: h.amount_source,
        departmentAccount: h.dept_bank_details || {},
        selfAccount: h.self_bank_details || {},
        utrNumber: h.utr_number,
        date: h.payment_date,
        remarks: h.remarks,
      })),
    }
  }

  // Map Stage 04: Document Ready
  let documentReady: DocumentReadyData | undefined = undefined
  const drRow = Array.isArray(row.stage_04_document_ready)
    ? row.stage_04_document_ready[0]
    : row.stage_04_document_ready
  if (drRow) {
    documentReady = {
      customDocs: drRow.custom_docs || [],
      remarks: drRow.remarks || '',
      completedAt: drRow.completed_at || undefined,
      completedBy: drRow.completed_by || undefined,
    }
  }

  // Map Stage 05: Portal Upload
  let portalUpload: PortalUploadData | undefined = undefined
  const puRow = Array.isArray(row.stage_05_portal_upload)
    ? row.stage_05_portal_upload[0]
    : row.stage_05_portal_upload
  if (puRow) {
    let checklist: PortalChecklistItem[] = []
    let userRemarks = puRow.remarks || ''
    let checklistSource = ''
    let checklistGeneratedAt = ''

    if (puRow.remarks && puRow.remarks.startsWith('{') && puRow.remarks.includes('"checklist"')) {
      try {
        const parsed = JSON.parse(puRow.remarks)
        checklist = parsed.checklist || []
        userRemarks = parsed.remarks || ''
        checklistSource = parsed.checklistSource || ''
        checklistGeneratedAt = parsed.checklistGeneratedAt || ''
      } catch {}
    }

    portalUpload = {
      portalName: puRow.portal_name || '',
      portalUrl: puRow.portal_url || '',
      ackNumber: puRow.ack_number || '',
      uploadDate: puRow.upload_date || '',
      remarks: userRemarks,
      checklist: checklist.length > 0 ? checklist : undefined,
      checklistSource: checklistSource || undefined,
      checklistGeneratedAt: checklistGeneratedAt || undefined,
      completedAt: puRow.completed_at || undefined,
      completedBy: puRow.completed_by || undefined,
      documents: (row.portal_upload_documents || []).map((d: any): PortalUploadDocumentItem => ({
        id: d.id,
        fieldKey: d.field_key,
        fieldLabel: d.field_label,
        name: d.name,
        size: d.size,
        type: d.type,
        uploadedAt: d.created_at,
        dataUrl: d.file_url,
        source: d.source,
        status: d.status,
        remarks: d.remarks,
      })),
      history: (row.portal_upload_history || []).map((h: any): PortalUploadHistoryEntry => ({
        id: h.id,
        submittedAt: h.submitted_at,
        submittedBy: h.submitted_by || 'Admin',
        portalName: h.portal_name,
        portalUrl: h.portal_url,
        ackNumber: h.ack_number,
        uploadDate: h.upload_date,
        documents: h.documents_snapshot || [],
        remarks: h.remarks,
      })),
    }
  }

  // Map Stage 06: Submit in website
  let submitInWebsite: SubmitInWebsiteData | undefined = undefined
  const swRow = Array.isArray(row.stage_06_submit_in_website)
    ? row.stage_06_submit_in_website[0]
    : row.stage_06_submit_in_website
  if (swRow) {
    const receipt = swRow.final_submission_receipt || {}
    const rawCategory =
      receipt.tender_category ||
      (receipt.online_offline === 'No' || swRow.submission_token === 'ONLINE_AND_OFFLINE'
        ? 'Online and Offline Tender'
        : 'Online Tender')
    const rawStatus =
      receipt.status ||
      (swRow.actual_date || receipt.status === 'Yes'
        ? 'Yes – Submitted'
        : 'No – Pending')
    const normalizedStatus: 'Yes – Submitted' | 'No – Pending' =
      rawStatus === 'Yes' || rawStatus === 'Yes – Submitted'
        ? 'Yes – Submitted'
        : 'No – Pending'

    submitInWebsite = {
      tenderCategory: rawCategory,
      onlineOffline: rawCategory === 'Online and Offline Tender' ? 'No' : 'Yes',
      status: normalizedStatus,
      remarks: swRow.remarks || receipt.remarks || '',
      submittedAt: swRow.submitted_at || undefined,
      submittedBy: swRow.submitted_by || undefined,
      completedAt: swRow.actual_date || undefined,
      history: Array.isArray(receipt.history) ? receipt.history : [],
    }
  }

  // Map Stage 07: Technical Open Check (Stage 8 in workflow)
  let technicalOpenCheck: TechnicalOpenCheckData | undefined = undefined
  const tocRow = Array.isArray(row.stage_07_technical_open_check)
    ? row.stage_07_technical_open_check[0]
    : row.stage_07_technical_open_check
  if (tocRow) {
    const rawStatus = tocRow.qualification_status
    let status: TechnicalOpenStatus = 'Qualified'
    if (rawStatus === 'Disqualified') status = 'Disqualified'
    else if (rawStatus === 'Tender Cancelled') status = 'Tender Cancelled'

    const extra =
      typeof tocRow.query_response_doc === 'object' && tocRow.query_response_doc
        ? tocRow.query_response_doc
        : {}

    technicalOpenCheck = {
      status,
      openingDate: tocRow.opening_date || extra.openingDate || '',
      openingTime: extra.openingTime || '',
      openingVenueOrPortal: extra.openingVenueOrPortal || '',
      openingSummary: extra.openingSummary || '',
      evaluationDate: extra.evaluationDate || '',
      evaluationTime: extra.evaluationTime || '',
      evaluationVenue: extra.evaluationVenue || '',
      evaluationCriteria: extra.evaluationCriteria || tocRow.committee_queries || '',
      complianceConditions: extra.complianceConditions || '',
      remarks: tocRow.remarks || extra.remarks || '',
      submittedAt: tocRow.evaluated_at || undefined,
      submittedBy: tocRow.evaluated_by || undefined,
      completedAt: tocRow.actual_date || undefined,
      history: Array.isArray(extra.history) ? extra.history : [],
    }
  }

  // Map Stage 08: Financial Open Check (Stage 9 in workflow)
  let financialOpenCheck: FinancialOpenCheckData | undefined = undefined
  const focRow = Array.isArray(row.stage_08_financial_open_check)
    ? row.stage_08_financial_open_check[0]
    : row.stage_08_financial_open_check
  if (focRow) {
    const extra =
      typeof focRow.loa_document === 'object' && focRow.loa_document
        ? focRow.loa_document
        : {}
    const rawRank = focRow.our_rank
    let ranking: FinancialRanking = 'L1'
    if (rawRank === 'L2' || rawRank === 'L3' || rawRank === 'L4' || rawRank === 'Other') {
      ranking = rawRank
    }

    financialOpenCheck = {
      ranking,
      l1BidderName: focRow.l1_bidder_name || '',
      l1Price: focRow.l1_bid_amount || '',
      ourBidPrice: focRow.our_bid_amount || extra.ourBidPrice || '',
      priceVariance: extra.priceVariance || '',
      openingDate: focRow.price_bid_opening_date || '',
      remarks: focRow.final_remarks || extra.remarks || '',
      submittedAt: focRow.completed_at || undefined,
      submittedBy: extra.submittedBy || undefined,
      completedAt: focRow.actual_date || undefined,
      history: Array.isArray(extra.history) ? extra.history : [],
    }
  }

  // Map Stage 10: Negotiation
  let negotiation: NegotiationData | undefined = undefined
  const negRow = Array.isArray(row.stage_09_negotiation)
    ? row.stage_09_negotiation[0]
    : row.stage_09_negotiation
  if (negRow) {
    negotiation = {
      status: negRow.status || 'Not Applicable',
      letterDoc: negRow.letter_doc || null,
      negotiatedPrice: negRow.negotiated_price || '',
      meetingDate: negRow.meeting_date || '',
      remarks: negRow.remarks || '',
      submittedAt: negRow.submitted_at || undefined,
      submittedBy: negRow.submitted_by || undefined,
      completedAt: negRow.actual_date || undefined,
      history: Array.isArray(negRow.history) ? negRow.history : [],
    }
  }

  if (!negotiation) {
    const negRepoDoc = (row.tender_documents_repository || []).find(
      (d: any) => d.document_type === 'negotiation-data'
    )
    if (negRepoDoc && negRepoDoc.file_url) {
      try {
        negotiation = JSON.parse(negRepoDoc.file_url)
      } catch {}
    }
  }

  // Map Stage 11: Work Order
  let workOrder: WorkOrderData | undefined = undefined
  const woRow = Array.isArray(row.stage_10_work_order)
    ? row.stage_10_work_order[0]
    : row.stage_10_work_order
  if (woRow) {
    workOrder = {
      workOrderDoc: woRow.work_order_doc || null,
      workOrderNumber: woRow.work_order_number || '',
      workOrderDate: woRow.work_order_date || '',
      contractValue: woRow.contract_value || '',
      aiSummary: woRow.ai_summary || '',
      bgDoc: woRow.bg_doc || null,
      bgAmount: woRow.bg_amount || '',
      bgBankName: woRow.bg_bank_name || '',
      bgNumber: woRow.bg_number || '',
      bgValidity: woRow.bg_validity || '',
      affidavitRequirements: woRow.affidavit_requirements || '',
      generatedAgreement: woRow.generated_agreement || '',
      remarks: woRow.remarks || '',
      submittedAt: woRow.submitted_at || undefined,
      submittedBy: woRow.submitted_by || undefined,
      completedAt: woRow.actual_date || undefined,
      history: Array.isArray(woRow.history) ? woRow.history : [],
    }
  }
  if (!workOrder) {
    const woRepoDoc = (row.tender_documents_repository || []).find(
      (d: any) => d.document_type === 'work-order-data'
    )
    if (woRepoDoc && woRepoDoc.file_url) {
      try {
        workOrder = JSON.parse(woRepoDoc.file_url)
      } catch {}
    }
  }

  // Map tenderDoc from repository
  let tenderDoc: any = undefined
  const nitDocRow = (row.tender_documents_repository || []).find(
    (d: any) => d.document_type === 'tender-notice'
  )
  if (nitDocRow) {
    tenderDoc = {
      id: nitDocRow.id,
      name: nitDocRow.file_name,
      size: nitDocRow.file_size,
      type: nitDocRow.mime_type,
      uploadedAt: nitDocRow.created_at,
      dataUrl: nitDocRow.file_url,
      source: 'new-tender',
      referenceNote: nitDocRow.document_title,
    }
  }

  return {
    id: row.id,
    title: row.title,
    authority: row.authority,
    department: row.department,
    state: row.state,
    value: row.estimated_value || '',
    stage: row.stage as Stage,
    status: row.status as Status,
    due: row.due_date || '',
    owner: row.owner || 'Admin',
    remarks: row.remarks || '',
    createdAt: row.created_at,
    planned_date: row.planned_date || undefined,
    actual_date: row.actual_date || undefined,
    delay_days: typeof row.delay_days === 'number' ? row.delay_days : 0,
    bid,
    gstSection: bid?.gstSection || '',
    tenderFeePlusGst: bid?.tenderFeePlusGst || '',
    testReportCompliance: bid?.testReportCompliance || '',
    mafRequirement: bid?.mafRequirement || '',
    experienceRequirement: bid?.experienceRequirement || '',
    turnoverRequirement: bid?.turnoverRequirement || '',
    corrigenda,
    eligibilityCheck,
    sampleDetails,
    emdReady,
    documentReady,
    portalUpload,
    submitInWebsite,
    technicalOpenCheck,
    financialOpenCheck,
    negotiation,
    workOrder,
    tenderDoc,
  }
}

// ====================================================================
// TENDERS - RESILIENT MULTI-TIER QUERY
// ====================================================================

export async function fetchTendersFromSupabase(): Promise<Tender[]> {
  // Tier 1: Full Graph Query with all joined child tables
  try {
    const { data, error } = await supabase
      .from('tenders')
      .select(`
        *,
        tender_bid_details (*),
        tender_packages (*),
        tender_technical_components (*),
        tender_corrigenda (
          *,
          tender_corrigendum_changes (*)
        ),
        stage_01_eligibility_check (*),
        stage_02_sample_details (*),
        sample_details_history (*),
        stage_03_emd_ready (*),
        emd_ready_history (*),
        stage_04_document_ready (*),
        stage_05_portal_upload (*),
        stage_06_submit_in_website (*),
        stage_07_technical_open_check (*),
        stage_08_financial_open_check (*),
        portal_upload_documents (*),
        portal_upload_history (*),
        tender_documents_repository (*)
      `)
      .order('created_at', { ascending: false })

    if (!error && data) {
      return data.map(mapDbRowToTender)
    }

    console.warn('fetchTendersFromSupabase Tier 1 query failed:', error?.message, 'Falling back to Tier 2...')
  } catch (t1Err) {
    console.warn('fetchTendersFromSupabase Tier 1 threw exception:', t1Err)
  }

  // Tier 2: Core Stages Query (Without optional repository/history tables)
  try {
    const { data, error } = await supabase
      .from('tenders')
      .select(`
        *,
        tender_bid_details (*),
        tender_packages (*),
        tender_technical_components (*),
        stage_01_eligibility_check (*),
        stage_02_sample_details (*),
        stage_03_emd_ready (*),
        stage_04_document_ready (*),
        stage_05_portal_upload (*),
        stage_06_submit_in_website (*)
      `)
      .order('created_at', { ascending: false })

    if (!error && data) {
      console.log(`fetchTendersFromSupabase Tier 2 succeeded with ${data.length} records.`)
      return data.map(mapDbRowToTender)
    }

    console.warn('fetchTendersFromSupabase Tier 2 query failed:', error?.message, 'Falling back to Tier 3...')
  } catch (t2Err) {
    console.warn('fetchTendersFromSupabase Tier 2 threw exception:', t2Err)
  }

  // Tier 3: Primary Tenders Table Only
  try {
    const { data, error } = await supabase
      .from('tenders')
      .select('*')
      .order('created_at', { ascending: false })

    if (!error && data) {
      console.log(`fetchTendersFromSupabase Tier 3 succeeded with ${data.length} records.`)
      return data.map(mapDbRowToTender)
    }

    // If even basic tenders select failed, throw to preserve local state
    throw new Error(error?.message || 'Database query failed')
  } catch (err: any) {
    console.error('fetchTendersFromSupabase all tiers failed:', err)
    throw err
  }
}

// ====================================================================
// TENDERS - SAVE / UPSERT COMPLETE GRAPH
// ====================================================================

export async function saveTenderToSupabase(tender: Tender): Promise<void> {
  try {
    // 1. Upsert primary tender record
    const { error: tenderError } = await supabase.from('tenders').upsert(
      {
        id: tender.id,
        title: tender.title,
        authority: tender.authority,
        department: tender.department,
        state: tender.state,
        estimated_value: tender.value || null,
        stage: tender.stage,
        status: tender.status,
        due_date: tender.due && /^\d{4}-\d{2}-\d{2}/.test(tender.due) ? tender.due.slice(0, 10) : null,
        owner: tender.owner || 'Admin',
        remarks: tender.remarks || null,
        planned_date: tender.planned_date && /^\d{4}-\d{2}-\d{2}/.test(tender.planned_date)
          ? tender.planned_date.slice(0, 10)
          : null,
        actual_date: tender.actual_date && /^\d{4}-\d{2}-\d{2}/.test(tender.actual_date)
          ? tender.actual_date.slice(0, 10)
          : (tender.status === 'Completed' ? new Date().toISOString().slice(0, 10) : null),
      },
      { onConflict: 'id' }
    )

    if (tenderError) throw tenderError

    // 1.1 Persist tenderDoc in repository if present
    if (tender.tenderDoc) {
      let tenderDocUrl = tender.tenderDoc.dataUrl || null
      let storagePath = 'local'
      if (tenderDocUrl && tenderDocUrl.startsWith('data:')) {
        const uploadRes = await uploadToSupabaseBucket({
          dataUrl: tenderDocUrl,
          fileName: tender.tenderDoc.name || 'tender_notice.pdf',
          folder: STAGE_FOLDERS.STAGE_01_NOTICE,
          tenderId: tender.id,
        })
        if (uploadRes.storage === 'bucket' && uploadRes.url) {
          tenderDocUrl = uploadRes.url
          tender.tenderDoc.dataUrl = uploadRes.url
          storagePath = uploadRes.path
        }
      }

      await supabase.from('tender_documents_repository').delete().eq('tender_id', tender.id).eq('document_type', 'tender-notice')
      await supabase.from('tender_documents_repository').insert({
        tender_id: tender.id,
        stage_origin: 'Tender Details',
        document_type: 'tender-notice',
        document_title: tender.tenderDoc.name,
        file_name: tender.tenderDoc.name,
        storage_path: storagePath,
        file_url: tenderDocUrl,
        file_size: tender.tenderDoc.size || null,
        mime_type: tender.tenderDoc.type || 'application/pdf',
        source: 'manual-upload',
        uploaded_by: tender.owner || 'Admin',
      })
    }

    // 2. Bid details, packages, technical components
    if (tender.bid) {
      const bid = tender.bid
      const fullBidPayload: any = {
        tender_id: tender.id,
        rfs_no: bid.rfsNo || null,
        rfs_date: bid.rfsDate && /^\d{4}-\d{2}-\d{2}/.test(bid.rfsDate) ? bid.rfsDate.slice(0, 10) : null,
        corrigendum: bid.corrigendum || null,
        work_name: bid.workName || null,
        short_work_name: bid.shortWorkName || null,
        authority_full_name: bid.authorityFullName || null,
        addressee_designation: bid.addresseeDesignation || null,
        authority_address: bid.authorityAddress || null,
        bid_deadline_time: bid.bidDeadlineTime || null,
        tender_fee_per_package: bid.tenderFeePerPackage || null,
        gst_section: bid.gstSection || tender.gstSection || null,
        tender_fee_plus_gst: bid.tenderFeePlusGst || tender.tenderFeePlusGst || null,
        test_report_compliance: bid.testReportCompliance || tender.testReportCompliance || null,
        maf_requirement: bid.mafRequirement || tender.mafRequirement || null,
        experience_requirement: bid.experienceRequirement || tender.experienceRequirement || null,
        turnover_requirement: bid.turnoverRequirement || tender.turnoverRequirement || null,
        bid_validity_days: bid.bidValidityDays || '180',
        financial_requirement_cr: bid.financialRequirementCr || null,
        technical_requirement: bid.technicalRequirement || null,
        jurisdiction: bid.jurisdiction || null,
        signing_date: bid.signingDate && /^\d{4}-\d{2}-\d{2}/.test(bid.signingDate) ? bid.signingDate.slice(0, 10) : null,
        signing_place: bid.place || 'Anand',
        beneficiary_account_holder: bid.beneficiaryBank?.accountHolder || null,
        beneficiary_bank_name: bid.beneficiaryBank?.bankName || null,
        beneficiary_branch: bid.beneficiaryBank?.branch || null,
        beneficiary_account_no: bid.beneficiaryBank?.accountNo || null,
        beneficiary_ifsc: bid.beneficiaryBank?.ifsc || null,
        beneficiary_account_type: bid.beneficiaryBank?.accountType || null,
      }

      let { error: bidError } = await supabase.from('tender_bid_details').upsert(
        fullBidPayload,
        { onConflict: 'tender_id' }
      )

      if (bidError) {
        console.warn('Upsert tender_bid_details error, attempting safe fallback:', bidError.message)
        const fallbackPayload = { ...fullBidPayload }
        delete fallbackPayload.gst_section
        delete fallbackPayload.tender_fee_plus_gst
        delete fallbackPayload.test_report_compliance
        delete fallbackPayload.maf_requirement
        delete fallbackPayload.experience_requirement
        delete fallbackPayload.turnover_requirement
        const { error: fbErr } = await supabase.from('tender_bid_details').upsert(
          fallbackPayload,
          { onConflict: 'tender_id' }
        )
        if (fbErr) console.error('Fallback error saving bid details:', fbErr)
      }

      // Replace packages
      if (bid.packages && bid.packages.length > 0) {
        await supabase.from('tender_packages').delete().eq('tender_id', tender.id)
        await supabase.from('tender_packages').insert(
          bid.packages.map(p => ({
            tender_id: tender.id,
            code: p.code,
            region: p.region || null,
            rfx: p.rfx || null,
            emd_lakh: p.emdLakh || null,
          }))
        )
      }

      // Replace technical components
      if (bid.technicalComponents && bid.technicalComponents.length > 0) {
        await supabase.from('tender_technical_components').delete().eq('tender_id', tender.id)
        await supabase.from('tender_technical_components').insert(
          bid.technicalComponents.map(c => ({
            tender_id: tender.id,
            item_name: c.item,
            make: c.make || null,
            compliance: c.compliance || null,
          }))
        )
      }
    }

    // 3. Corrigenda
    if (tender.corrigenda && tender.corrigenda.length > 0) {
      for (const c of tender.corrigenda) {
        const { data: insertedCorr, error: corrErr } = await supabase
          .from('tender_corrigenda')
          .upsert(
            {
              tender_id: tender.id,
              corrigendum_no: c.corrigendumNo,
              issue_date: c.issueDate && /^\d{4}-\d{2}-\d{2}/.test(c.issueDate) ? c.issueDate.slice(0, 10) : null,
              tender_ref: c.tenderRef || null,
              file_name: c.fileName || null,
              overview: c.overview || null,
            },
            { onConflict: 'id' }
          )
          .select('id')
          .single()

        if (!corrErr && insertedCorr && c.changes && c.changes.length > 0) {
          await supabase.from('tender_corrigendum_changes').delete().eq('corrigendum_id', insertedCorr.id)
          await supabase.from('tender_corrigendum_changes').insert(
            c.changes.map(ch => ({
              corrigendum_id: insertedCorr.id,
              change_type: ch.type,
              category: ch.category || 'standard',
              target_field: ch.targetField || null,
              original_value: ch.originalValue || null,
              revised_value: ch.revisedValue || null,
              description: ch.description || null,
              page_clause_ref: ch.pageClauseRef || null,
              is_critical: ch.isCritical || false,
              applied: ch.applied || false,
            }))
          )
        }
      }
    }

    // 4. Stage 01: Eligibility Check
    if (tender.eligibilityCheck) {
      const ec = tender.eligibilityCheck
      await supabase.from('stage_01_eligibility_check').upsert(
        {
          tender_id: tender.id,
          turnover_doc: ec.turnoverDoc || null,
          experience_doc: ec.experienceDoc || null,
          vendor_reg_doc: ec.vendorRegDoc || null,
          other_doc: ec.otherDoc || null,
          remarks: ec.remarks || null,
          completed_at: ec.completedAt || null,
          actual_date: ec.completedAt ? ec.completedAt.slice(0, 10) : null,
        },
        { onConflict: 'tender_id' }
      )
    }

    // 5. Stage 02: Sample Details
    if (tender.sampleDetails) {
      const sd = tender.sampleDetails
      await supabase.from('stage_02_sample_details').upsert(
        {
          tender_id: tender.id,
          maf_letter: (sd as any).maf_letter || sd.mafLetter || null,
          test_report: (sd as any).test_report || sd.testReport || null,
          bis_certificate: (sd as any).bis_certificate || sd.bisCertificate || null,
          product_sample: (sd as any).product_sample || sd.productSample || null,
          other_docs: sd.otherDocs || [],
          remarks: sd.remarks || null,
          completed_by: sd.completedBy || null,
          completed_at: sd.completedAt || null,
          actual_date: sd.completedAt ? sd.completedAt.slice(0, 10) : null,
        },
        { onConflict: 'tender_id' }
      )
    }

    // 6. Stage 03: EMD Ready
    if (tender.emdReady) {
      const emd = tender.emdReady
      await supabase.from('stage_03_emd_ready').upsert(
        {
          tender_id: tender.id,
          amount: emd.amount,
          amount_source: emd.amountSource || null,
          dept_bank_name: emd.departmentAccount?.bankName || null,
          dept_account_holder: emd.departmentAccount?.accountHolder || null,
          dept_account_no: emd.departmentAccount?.accountNo || null,
          dept_ifsc: emd.departmentAccount?.ifsc || null,
          dept_branch: emd.departmentAccount?.branch || null,
          self_bank_name: emd.selfAccount?.bankName || null,
          self_account_holder: emd.selfAccount?.accountHolder || null,
          self_account_no: emd.selfAccount?.accountNo || null,
          self_ifsc: emd.selfAccount?.ifsc || null,
          self_branch: emd.selfAccount?.branch || null,
          utr_number: emd.utrNumber || null,
          payment_date: emd.date && /^\d{4}-\d{2}-\d{2}/.test(emd.date) ? emd.date.slice(0, 10) : null,
          remarks: emd.remarks || null,
          completed_by: emd.completedBy || null,
          completed_at: emd.completedAt || null,
          actual_date: emd.completedAt ? emd.completedAt.slice(0, 10) : null,
        },
        { onConflict: 'tender_id' }
      )
    }

    // 7. Stage 04: Document Ready
    if (tender.documentReady) {
      const dr = tender.documentReady
      await supabase.from('stage_04_document_ready').upsert(
        {
          tender_id: tender.id,
          custom_docs: dr.customDocs || [],
          remarks: dr.remarks || null,
          completed_by: dr.completedBy || null,
          completed_at: dr.completedAt || null,
          actual_date: dr.completedAt ? dr.completedAt.slice(0, 10) : null,
        },
        { onConflict: 'tender_id' }
      )
    }

    // 8. Stage 05: Portal Upload
    if (tender.portalUpload) {
      const pu = tender.portalUpload
      const remarksPayload = JSON.stringify({
        remarks: pu.remarks || '',
        checklist: pu.checklist || [],
        checklistSource: pu.checklistSource || '',
        checklistGeneratedAt: pu.checklistGeneratedAt || '',
      })

      const { data: savedPu, error: puErr } = await supabase
        .from('stage_05_portal_upload')
        .upsert(
          {
            tender_id: tender.id,
            portal_name: pu.portalName || null,
            portal_url: pu.portalUrl || null,
            ack_number: pu.ackNumber || null,
            upload_date: pu.uploadDate && /^\d{4}-\d{2}-\d{2}/.test(pu.uploadDate) ? pu.uploadDate.slice(0, 10) : null,
            remarks: remarksPayload,
            completed_by: pu.completedBy || null,
            completed_at: pu.completedAt || null,
            actual_date: pu.completedAt ? pu.completedAt.slice(0, 10) : null,
          },
          { onConflict: 'tender_id' }
        )
        .select('id')
        .single()

      if (!puErr && savedPu && pu.documents && pu.documents.length > 0) {
        for (const d of pu.documents) {
          if (d.dataUrl && d.dataUrl.startsWith('data:')) {
            const upRes = await uploadToSupabaseBucket({
              dataUrl: d.dataUrl,
              fileName: d.name || `${d.fieldKey}.pdf`,
              folder: STAGE_FOLDERS.STAGE_06_PORTAL,
              tenderId: tender.id,
            })
            if (upRes.storage === 'bucket' && upRes.url) {
              d.dataUrl = upRes.url
            }
          }
        }

        await supabase.from('portal_upload_documents').delete().eq('tender_id', tender.id)
        await supabase.from('portal_upload_documents').insert(
          pu.documents.map(d => ({
            portal_upload_id: savedPu.id,
            tender_id: tender.id,
            field_key: d.fieldKey,
            field_label: d.fieldLabel,
            name: d.name,
            file_url: d.dataUrl || null,
            size: d.size || null,
            type: d.type || null,
            source: d.source || null,
            status: d.status || 'Uploaded',
            remarks: d.remarks || null,
          }))
        )
      }
    }

    // 9. Stage 06: Submit in website
    if (tender.submitInWebsite) {
      const sw = tender.submitInWebsite
      const tenderCategory =
        sw.tenderCategory ||
        (sw.onlineOffline === 'No' ? 'Online and Offline Tender' : 'Online Tender')
      const isSubmitted =
        sw.status === 'Yes – Submitted' || sw.status === 'Yes'
      const statusValue: 'Yes – Submitted' | 'No – Pending' = isSubmitted
        ? 'Yes – Submitted'
        : 'No – Pending'

      const currentHistory: SubmitInWebsiteHistoryEntry[] = Array.isArray(sw.history)
        ? [...sw.history]
        : []

      const nowIso = sw.submittedAt || new Date().toISOString()
      const alreadyLogged = currentHistory.some(
        h =>
          h.submittedAt === nowIso &&
          h.tenderCategory === tenderCategory &&
          h.status === statusValue
      )
      if (!alreadyLogged) {
        currentHistory.unshift({
          id: `sub-hist-${Date.now()}`,
          tenderId: tender.id,
          tenderCategory,
          status: statusValue,
          remarks: sw.remarks || '',
          submittedAt: nowIso,
          submittedBy: sw.submittedBy || tender.owner || 'Admin',
          completedAt: isSubmitted ? sw.completedAt || nowIso : undefined,
        })
      }

      await supabase.from('stage_06_submit_in_website').upsert(
        {
          tender_id: tender.id,
          submission_token:
            tenderCategory === 'Online and Offline Tender' ? 'ONLINE_AND_OFFLINE' : 'ONLINE',
          remarks: sw.remarks || null,
          submitted_by: sw.submittedBy || 'Admin',
          submitted_at: isSubmitted
            ? sw.submittedAt || new Date().toISOString()
            : sw.submittedAt || null,
          actual_date: isSubmitted
            ? sw.submittedAt
              ? sw.submittedAt.slice(0, 10)
              : new Date().toISOString().slice(0, 10)
            : null,
          final_submission_receipt: {
            tender_category: tenderCategory,
            online_offline: tenderCategory === 'Online and Offline Tender' ? 'No' : 'Yes',
            status: statusValue,
            remarks: sw.remarks || '',
            history: currentHistory,
          },
        },
        { onConflict: 'tender_id' }
      )
    }

    // 10. Stage 07: Technical Open Check (Stage 8 in workflow)
    if (tender.technicalOpenCheck) {
      const toc = tender.technicalOpenCheck
      const currentHistory: TechnicalOpenCheckHistoryEntry[] = Array.isArray(toc.history)
        ? [...toc.history]
        : []

      const nowIso = toc.submittedAt || new Date().toISOString()
      const alreadyLogged = currentHistory.some(
        h => h.submittedAt === nowIso && h.status === toc.status
      )
      if (!alreadyLogged) {
        currentHistory.unshift({
          id: `toc-hist-${Date.now()}`,
          tenderId: tender.id,
          status: toc.status,
          openingDate: toc.openingDate,
          openingTime: toc.openingTime,
          openingVenueOrPortal: toc.openingVenueOrPortal,
          openingSummary: toc.openingSummary,
          evaluationDate: toc.evaluationDate,
          evaluationTime: toc.evaluationTime,
          evaluationVenue: toc.evaluationVenue,
          evaluationCriteria: toc.evaluationCriteria,
          complianceConditions: toc.complianceConditions,
          remarks: toc.remarks || '',
          submittedAt: nowIso,
          submittedBy: toc.submittedBy || tender.owner || 'Admin',
          completedAt: toc.completedAt || (toc.status === 'Qualified' ? nowIso : undefined),
        })
      }

      await supabase.from('stage_07_technical_open_check').upsert(
        {
          tender_id: tender.id,
          opening_date: toc.openingDate && /^\d{4}-\d{2}-\d{2}/.test(toc.openingDate) ? toc.openingDate.slice(0, 10) : null,
          qualification_status: toc.status,
          is_responsive: toc.status === 'Qualified',
          remarks: toc.remarks || null,
          committee_queries: toc.evaluationCriteria || null,
          evaluated_by: toc.submittedBy || 'Admin',
          evaluated_at: toc.submittedAt || nowIso,
          actual_date: toc.completedAt ? toc.completedAt.slice(0, 10) : (toc.status === 'Qualified' ? nowIso.slice(0, 10) : null),
          query_response_doc: {
            openingDate: toc.openingDate,
            openingTime: toc.openingTime,
            openingVenueOrPortal: toc.openingVenueOrPortal,
            openingSummary: toc.openingSummary,
            evaluationDate: toc.evaluationDate,
            evaluationTime: toc.evaluationTime,
            evaluationVenue: toc.evaluationVenue,
            evaluationCriteria: toc.evaluationCriteria,
            complianceConditions: toc.complianceConditions,
            remarks: toc.remarks,
            history: currentHistory,
          },
        },
        { onConflict: 'tender_id' }
      )
    }

    // 11. Stage 08: Financial Open Check (Stage 9 in workflow)
    if (tender.financialOpenCheck) {
      const foc = tender.financialOpenCheck
      const currentHistory: FinancialOpenCheckHistoryEntry[] = Array.isArray(foc.history)
        ? [...foc.history]
        : []

      const nowIso = foc.submittedAt || new Date().toISOString()
      const alreadyLogged = currentHistory.some(
        h => h.submittedAt === nowIso && h.ranking === foc.ranking
      )
      if (!alreadyLogged) {
        currentHistory.unshift({
          id: `foc-hist-${Date.now()}`,
          tenderId: tender.id,
          ranking: foc.ranking,
          l1BidderName: foc.l1BidderName,
          l1Price: foc.l1Price,
          ourBidPrice: foc.ourBidPrice,
          priceVariance: foc.priceVariance,
          openingDate: foc.openingDate,
          remarks: foc.remarks || '',
          submittedAt: nowIso,
          submittedBy: foc.submittedBy || tender.owner || 'Admin',
          completedAt: foc.completedAt || nowIso,
        })
      }

      await supabase.from('stage_08_financial_open_check').upsert(
        {
          tender_id: tender.id,
          price_bid_opening_date: foc.openingDate && /^\d{4}-\d{2}-\d{2}/.test(foc.openingDate) ? foc.openingDate.slice(0, 10) : null,
          our_rank: foc.ranking,
          l1_bidder_name: foc.l1BidderName || null,
          l1_bid_amount: foc.l1Price || null,
          our_bid_amount: foc.ourBidPrice || null,
          is_awarded: foc.ranking === 'L1',
          final_remarks: foc.remarks || null,
          completed_at: foc.completedAt || nowIso,
          actual_date: foc.completedAt ? foc.completedAt.slice(0, 10) : nowIso.slice(0, 10),
          loa_document: {
            ranking: foc.ranking,
            l1BidderName: foc.l1BidderName,
            l1Price: foc.l1Price,
            ourBidPrice: foc.ourBidPrice,
            priceVariance: foc.priceVariance,
            remarks: foc.remarks,
            history: currentHistory,
          },
        },
        { onConflict: 'tender_id' }
      )
    }

    // 12. Stage 10: Negotiation
    if (tender.negotiation) {
      const neg = tender.negotiation
      try {
        await supabase.from('stage_09_negotiation').upsert(
          {
            tender_id: tender.id,
            status: neg.status,
            letter_doc: neg.letterDoc || null,
            negotiated_price: neg.negotiatedPrice || null,
            meeting_date: neg.meetingDate && /^\d{4}-\d{2}-\d{2}/.test(neg.meetingDate) ? neg.meetingDate.slice(0, 10) : null,
            remarks: neg.remarks || null,
            submitted_by: neg.submittedBy || 'Admin',
            submitted_at: neg.submittedAt || new Date().toISOString(),
            actual_date: neg.completedAt ? neg.completedAt.slice(0, 10) : new Date().toISOString().slice(0, 10),
            history: neg.history || [],
          },
          { onConflict: 'tender_id' }
        )
      } catch (negErr) {
        console.warn('stage_09_negotiation optional note:', negErr)
      }

      // If attached letter doc exists, also persist to tender_documents_repository
      if (neg.letterDoc && neg.letterDoc.dataUrl) {
        let negDocUrl = neg.letterDoc.dataUrl
        let negStoragePath = `stage-10-negotiation/${tender.id}/${neg.letterDoc.name}`
        if (negDocUrl.startsWith('data:')) {
          const up = await uploadToSupabaseBucket({
            dataUrl: negDocUrl,
            fileName: neg.letterDoc.name || 'negotiation_letter.pdf',
            folder: STAGE_FOLDERS.STAGE_10_NEGOTIATION,
            tenderId: tender.id,
          })
          if (up.storage === 'bucket' && up.url) {
            negDocUrl = up.url
            neg.letterDoc.dataUrl = up.url
            negStoragePath = up.path
          }
        }

        try {
          await supabase.from('tender_documents_repository').upsert(
            {
              tender_id: tender.id,
              stage_origin: 'Negotiation',
              document_type: 'negotiation-letter',
              document_title: 'Negotiation Attached Letter',
              file_name: neg.letterDoc.name,
              storage_path: negStoragePath,
              file_url: negDocUrl,
              file_size: neg.letterDoc.size || null,
              mime_type: neg.letterDoc.type || 'application/pdf',
              source: 'manual-upload',
            },
            { onConflict: 'tender_id, storage_path' }
          )
        } catch {}
      }

      // Persist snapshot to tender_documents_repository as resilient fallback
      try {
        await supabase.from('tender_documents_repository').upsert(
          {
            tender_id: tender.id,
            stage_origin: 'Negotiation',
            document_type: 'negotiation-data',
            document_title: 'Negotiation Stage State',
            file_name: 'negotiation-data.json',
            storage_path: `tenders/${tender.id}/negotiation/negotiation-data.json`,
            file_url: JSON.stringify(neg),
            mime_type: 'application/json',
            source: 'system-snapshot',
          },
          { onConflict: 'tender_id, storage_path' }
        )
      } catch {}
    }

    // 13. Stage 11: Work Order
    if (tender.workOrder) {
      const wo = tender.workOrder
      try {
        await supabase.from('stage_10_work_order').upsert(
          {
            tender_id: tender.id,
            work_order_doc: wo.workOrderDoc || null,
            work_order_number: wo.workOrderNumber || null,
            work_order_date: wo.workOrderDate && /^\d{4}-\d{2}-\d{2}/.test(wo.workOrderDate) ? wo.workOrderDate.slice(0, 10) : null,
            contract_value: wo.contractValue || null,
            ai_summary: wo.aiSummary || null,
            bg_doc: wo.bgDoc || null,
            bg_amount: wo.bgAmount || null,
            bg_bank_name: wo.bgBankName || null,
            bg_number: wo.bgNumber || null,
            bg_validity: wo.bgValidity && /^\d{4}-\d{2}-\d{2}/.test(wo.bgValidity) ? wo.bgValidity.slice(0, 10) : null,
            affidavit_requirements: wo.affidavitRequirements || null,
            generated_agreement: wo.generatedAgreement || null,
            remarks: wo.remarks || null,
            submitted_by: wo.submittedBy || 'Admin',
            submitted_at: wo.submittedAt || new Date().toISOString(),
            actual_date: wo.completedAt ? wo.completedAt.slice(0, 10) : new Date().toISOString().slice(0, 10),
            history: wo.history || [],
          },
          { onConflict: 'tender_id' }
        )
      } catch (woErr) {
        console.warn('stage_10_work_order optional note:', woErr)
      }

      // Persist documents to repository
      if (wo.workOrderDoc && wo.workOrderDoc.dataUrl) {
        let woDocUrl = wo.workOrderDoc.dataUrl
        let woStoragePath = `stage-11-work-order/${tender.id}/${wo.workOrderDoc.name}`
        if (woDocUrl.startsWith('data:')) {
          const up = await uploadToSupabaseBucket({
            dataUrl: woDocUrl,
            fileName: wo.workOrderDoc.name || 'work_order.pdf',
            folder: STAGE_FOLDERS.STAGE_11_WORK_ORDER,
            tenderId: tender.id,
          })
          if (up.storage === 'bucket' && up.url) {
            woDocUrl = up.url
            wo.workOrderDoc.dataUrl = up.url
            woStoragePath = up.path
          }
        }

        try {
          await supabase.from('tender_documents_repository').upsert(
            {
              tender_id: tender.id,
              stage_origin: 'Work Order',
              document_type: 'work-order-document',
              document_title: 'Official Work Order',
              file_name: wo.workOrderDoc.name,
              storage_path: woStoragePath,
              file_url: woDocUrl,
              file_size: wo.workOrderDoc.size || null,
              mime_type: wo.workOrderDoc.type || 'application/pdf',
              source: 'manual-upload',
            },
            { onConflict: 'tender_id, storage_path' }
          )
        } catch {}
      }

      if (wo.bgDoc && wo.bgDoc.dataUrl) {
        let bgDocUrl = wo.bgDoc.dataUrl
        let bgStoragePath = `stage-11-work-order/${tender.id}/bg_${wo.bgDoc.name}`
        if (bgDocUrl.startsWith('data:')) {
          const up = await uploadToSupabaseBucket({
            dataUrl: bgDocUrl,
            fileName: wo.bgDoc.name || 'performance_bg.pdf',
            folder: STAGE_FOLDERS.STAGE_11_WORK_ORDER,
            tenderId: tender.id,
          })
          if (up.storage === 'bucket' && up.url) {
            bgDocUrl = up.url
            wo.bgDoc.dataUrl = up.url
            bgStoragePath = up.path
          }
        }

        try {
          await supabase.from('tender_documents_repository').upsert(
            {
              tender_id: tender.id,
              stage_origin: 'Work Order',
              document_type: 'bank-guarantee',
              document_title: 'Bank Guarantee (PBG)',
              file_name: wo.bgDoc.name,
              storage_path: bgStoragePath,
              file_url: bgDocUrl,
              file_size: wo.bgDoc.size || null,
              mime_type: wo.bgDoc.type || 'application/pdf',
              source: 'manual-upload',
            },
            { onConflict: 'tender_id, storage_path' }
          )
        } catch {}
      }

      // Persist snapshot to tender_documents_repository as resilient fallback
      try {
        await supabase.from('tender_documents_repository').upsert(
          {
            tender_id: tender.id,
            stage_origin: 'Work Order',
            document_type: 'work-order-data',
            document_title: 'Work Order Stage State',
            file_name: 'work-order-data.json',
            storage_path: `tenders/${tender.id}/work_order/work-order-data.json`,
            file_url: JSON.stringify(wo),
            mime_type: 'application/json',
            source: 'system-snapshot',
          },
          { onConflict: 'tender_id, storage_path' }
        )
      } catch {}
    }
  } catch (err) {
    console.error('saveTenderToSupabase error:', err)
    throw err
  }
}

// ====================================================================
// DELETE TENDER (CASCADE DELETES ALL STAGES & BID DETAILS)
// ====================================================================

export async function deleteTenderFromSupabase(id: string): Promise<void> {
  try {
    const { error } = await supabase.from('tenders').delete().eq('id', id)
    if (error) throw error
  } catch (err) {
    console.error('deleteTenderFromSupabase error:', err)
    throw err
  }
}
