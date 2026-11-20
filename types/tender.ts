export type Stage =
  | 'Eligibility Check'
  | 'Sample Details'
  | 'EMD Ready'
  | 'Document Ready'
  | 'Document Upload in portal'
  | 'Submit in website'
  | 'Technical Open Check'
  | 'Financial Open Check'
  | 'Negotiation'
  | 'Work Order'

export type Status = 'In Progress' | 'Ready' | 'Submitted' | 'Completed' | 'At Risk'

export interface Tender {
  id: string
  title: string
  authority: string
  department: string
  state: string
  value: string
  stage: Stage
  status: Status
  due: string
  
  owner: string
  remarks?: string
  createdAt?: string
  planned_date?: string
  actual_date?: string
  delay_days?: number
  bid?: TenderBidDetails
  // Six AI Auto-Fill Tender Fields (also accessible on bid)
  gstSection?: string
  tenderFeePlusGst?: string
  testReportCompliance?: string
  mafRequirement?: string
  experienceRequirement?: string
  turnoverRequirement?: string
  corrigenda?: CorrigendumRecord[]
  eligibilityCheck?: EligibilityCheckData
  sampleDetails?: SampleDetailsData
  emdReady?: EmdReadyData
  documentReady?: DocumentReadyData
  portalUpload?: PortalUploadData
  submitInWebsite?: SubmitInWebsiteData
  technicalOpenCheck?: TechnicalOpenCheckData
  financialOpenCheck?: FinancialOpenCheckData
  negotiation?: NegotiationData
  workOrder?: WorkOrderData
  tenderDoc?: SampleDocumentItem | null
}

export interface SampleDocumentItem {
  id: string
  name: string
  size?: number
  type?: string
  uploadedAt: string
  dataUrl?: string
  source?: 'auto-fetched' | 'manual-upload' | 'eligibility-docs' | 'technical-components' | 'new-tender'
  referenceNote?: string
  matchReason?: string
  matchConfidence?: 'high' | 'medium' | 'low'
  letterContent?: any
  textContent?: string
  requirementStatus?: 'Required' | 'Not Required' | 'Optional' | MasterRequirementStatus
  requirementReason?: string
  requirementClause?: string
  originalDocumentEvidence?: string
  pageNumber?: number | string
  verificationStatus?: string
}

export type MasterRequirementStatus =
  | 'MANDATORY'
  | 'OPTIONAL'
  | 'NOT REQUIRED'
  | 'CONDITIONAL'
  | 'UNCLEAR'
  | 'DOCUMENT INCOMPLETE'
  | 'MANUAL VERIFICATION REQUIRED'

export type RequirementVerificationStatus =
  | 'VERIFIED_FROM_DOCUMENT'
  | 'NOT_AVAILABLE'
  | 'UNABLE_TO_VERIFY'
  | 'PARTIALLY_VERIFIED'

export interface SampleOtherDocumentRequirement {
  sNo: number
  documentName: string
  requirement: string // 'Mandatory' | 'Required' | 'Dealer/Distributor ke liye' | 'Manufacturer ke liye' | string
  clauseOrSection?: string
  pageNumber?: string
  description?: string
  attachedDocId?: string
  attachedDocName?: string
  /** Verbatim tender text demanding this document */
  evidenceQuote?: string
  /** True when evidenceQuote was found on the cited page of THIS tender's document */
  quoteVerified?: boolean
}

export interface FieldRequirementAudit {
  isRequired: boolean
  status: 'Required' | 'Not Required' | 'Optional' | MasterRequirementStatus
  masterStatus?: MasterRequirementStatus
  clauseOrRef: string
  reasoning: string
  applicableStandards: string[]
  confidence: 'high' | 'medium' | 'low'
  // Master System Prompt fields:
  documentName?: string
  questionOrRequirement?: string
  finalAnswer?: string
  originalDocumentEvidence?: string // exact verbatim quote or "NOT AVAILABLE IN THE PROVIDED DOCUMENT."
  pageNumber?: number | string // physical PDF page number
  printedPageNumber?: string
  clauseOrSection?: string
  detailedExplanation?: string
  missingInformation?: string
  verificationStatus?: RequirementVerificationStatus | string
  finalRecommendation?: string
  // Rich Requirement Analysis additions:
  bulletPoints?: string[]
  importantNotes?: string[]
  corrigendumNote?: string
  requiredDocumentSummary?: string
}

export interface SampleRequirementsAudit {
  mafLetter?: FieldRequirementAudit
  testReport: FieldRequirementAudit
  bisCertificate: FieldRequirementAudit
  productSample?: FieldRequirementAudit
  otherDocuments?: SampleOtherDocumentRequirement[]
  checkedAt?: string
  sourceType?: 'tender-pdf' | 'tender-metadata' | 'heuristic'
  summary?: string
  documentName?: string
  totalPagesAnalyzed?: number
  issuingAuthority?: string
  tenderNumber?: string
  verificationQuality?: 'HIGH_CONFIDENCE_GROUNDED' | 'HEURISTIC_FALLBACK' | 'OCR_GROUNDED' | 'UNABLE_TO_VERIFY'
  /** What was actually read (pages, OCR / Vision pages, unreadable pages) */
  evidenceStatus?: string
  evidenceWarnings?: string[]
}

export interface SampleDetailsHistoryEntry {
  id: string
  submittedAt: string
  submittedBy: string
  mafLetter?: SampleDocumentItem | null
  testReport?: SampleDocumentItem | null
  bisCertificate?: SampleDocumentItem | null
  productSample?: SampleDocumentItem | null
  otherDocs?: SampleDocumentItem[]
  remarks: string
  previousStage?: Stage
  advancedToStage?: Stage
  updateSummary?: string
  aiRequirementsAudit?: SampleRequirementsAudit
}

export interface SampleDetailsData {
  mafLetter?: SampleDocumentItem | null
  testReport?: SampleDocumentItem | null
  bisCertificate?: SampleDocumentItem | null
  productSample?: SampleDocumentItem | null
  otherDocs?: SampleDocumentItem[]
  remarks?: string
  completedAt?: string
  completedBy?: string
  history?: SampleDetailsHistoryEntry[]
  aiRequirementsAudit?: SampleRequirementsAudit
}

export interface EligibilityDocument {
  id?: string
  name: string
  size?: number
  type?: string
  uploadedAt: string
  dataUrl?: string
  letterContent?: any
  referenceNote?: string
}

export interface CriteriaEvaluationDetail {
  criteriaName: string
  status: 'Pass' | 'Fail' | 'Pending' | 'Under Review'
  tenderRequirement: string
  userSubmitted: string
  comparisonResult: string
  rejectionReason?: string
  isMandatory: boolean
  /** Physical PDF page of the tender clause (from the tender document) */
  tenderSourcePage?: string
  /** Verbatim quote of the tender clause */
  tenderSourceQuote?: string
  /** Whether the quote was found verbatim in the extracted tender text */
  tenderQuoteVerified?: boolean
  /** What the evidence situation is for this criterion */
  evidenceSituation?:
    | 'requirement-not-in-tender'
    | 'document-not-uploaded'
    | 'document-unreadable'
    | 'requirement-not-satisfied'
    | 'requirement-satisfied'
    | 'needs-manual-review'
}

export interface AIEligibilityVerification {
  status: 'Eligible' | 'Not Eligible' | 'Partially Eligible' | 'Insufficient Information'
  /** How the tender and each bidder document were actually read */
  evidenceAudit?: {
    tenderDocument: string
    submittedDocuments: Array<{ slot: string; name?: string; situation: string; pagesRead?: number }>
    warnings: string[]
  }
  verifiedAt: string
  score: number // e.g. 100, 80, 40
  summary: string
  overallReasoning?: string
  conclusion?: string
  matchedCriteria?: string[]
  failedCriteria?: string[]
  missingRequirements?: string[]
  insufficientInfoNotes?: string
  criteriaBreakdown?: CriteriaEvaluationDetail[]
  tenderRequirements?: {
    turnover?: string
    experience?: string
    statutory?: string
  }
  turnoverCheck: {
    status: 'Pass' | 'Fail' | 'Pending' | 'Under Review'
    required?: string
    submitted?: string
    notes?: string
    shortfallOrSurplus?: string
  }
  experienceCheck: {
    status: 'Pass' | 'Fail' | 'Pending' | 'Under Review'
    required?: string
    submitted?: string
    notes?: string
    shortfallOrSurplus?: string
  }
  documentsCheck: {
    status: 'Pass' | 'Fail' | 'Pending' | 'Under Review'
    notes?: string
    missingDocs?: string[]
  }
}

export interface EligibilityChecklistItem {
  sNo: number
  documentName: string
  requirement: 'MANDATORY' | 'REQUIRED' | 'CONDITIONAL'
  clauseOrSection: string
  pageNumber: string
  description: string
  matchingCompanyDocKey?: 'networthDoc' | 'turnoverDoc' | 'experienceDoc' | null
  /** Verbatim tender text demanding this document */
  evidenceQuote?: string
  /** True when the quote was found on the cited page of THIS tender's document */
  quoteVerified?: boolean
}

export interface EligibilityCheckData {
  turnoverDoc?: EligibilityDocument | null
  experienceDoc?: EligibilityDocument | null
  vendorRegDoc?: EligibilityDocument | null
  otherDoc?: EligibilityDocument | null
  otherDocs?: EligibilityDocument[]
  remarks?: string
  completedAt?: string
  aiVerification?: AIEligibilityVerification
  checklistItems?: EligibilityChecklistItem[]
}

export interface CompanyDocumentItem {
  name: string
  size?: number
  type?: string
  uploadedAt: string
  dataUrl?: string
  value?: string
  notes?: string
}

export interface CompanyMasterDocuments {
  turnoverDoc?: CompanyDocumentItem | null
  networthDoc?: CompanyDocumentItem | null
  experienceDoc?: CompanyDocumentItem | null
  signatureDoc?: CompanyDocumentItem | null
  sealDoc?: CompanyDocumentItem | null
  signatureSealDoc?: CompanyDocumentItem | null
  panDoc?: CompanyDocumentItem | null
  gstDoc?: CompanyDocumentItem | null
}

export interface BankAccountDetails {
  bankName: string
  accountHolder?: string
  accountNo: string
  ifsc: string
  branch?: string
}

export interface EmdGeneratedDocumentInfo {
  formatTitle: string
  formatSource?: string
  formatType?: 'rtgs_neft' | 'bank_guarantee' | 'demand_draft' | 'portal_challan' | 'custom_undertaking'
  docxFileName: string
  docxDataUrl?: string
  pdfFileName: string
  pdfDataUrl?: string
  status: 'Not Generated' | 'Generated' | 'Modified' | 'Saved' | 'PDF Ready'
  version: number
  generatedAt: string
  lastModifiedAt?: string
  lastSavedAt?: string
  // Editable Document Payload
  subject: string
  addressee: string
  authorityAddress: string
  tenderRefNo: string
  workName: string
  amountInWords?: string
  declarations: string[]
  paymentTerms: string[]
  signatoryName: string
  signatoryDesignation: string
  customNotes?: string
  textContent?: string
}

export interface EmdReadyHistoryEntry {
  id: string
  submittedAt: string
  submittedBy: string
  amount: string
  amountSource?: string
  departmentAccount: BankAccountDetails
  selfAccount: BankAccountDetails
  utrNumber: string
  date: string
  remarks?: string
  generatedDocument?: EmdGeneratedDocumentInfo
}

export interface EmdReadyData {
  amount: string
  amountSource?: string
  departmentAccount: BankAccountDetails
  selfAccount: BankAccountDetails
  utrNumber: string
  date: string
  remarks?: string
  completedAt?: string
  completedBy?: string
  history?: EmdReadyHistoryEntry[]
  generatedDocument?: EmdGeneratedDocumentInfo
}

export interface PortalUploadDocumentItem {
  id: string
  fieldKey: string
  fieldLabel: string
  name: string
  size?: number
  type?: string
  uploadedAt: string
  dataUrl?: string
  source?: string
  status?: 'Pending' | 'Uploaded' | 'Verified'
  remarks?: string
  letterContent?: any
}

export interface PortalChecklistItem {
  id: string
  docName: string
  requirement: string
  applicableDetails?: string
  clauseOrPageRef?: string
  isMandatory?: boolean
  checked: boolean
  matchedFieldKey?: string
  matchedDocumentName?: string
  envelope?: string
}

export interface DocumentReadyData {
  customDocs?: SampleDocumentItem[]
  checklist?: PortalChecklistItem[]
  checklistTitle?: string
  checklistSource?: string
  checklistDocs?: PortalUploadDocumentItem[]
  combinedWordSummary?: any
  remarks?: string
  completedAt?: string
  completedBy?: string
}

export interface PortalUploadHistoryEntry {
  id: string
  submittedAt: string
  submittedBy: string
  portalName?: string
  portalUrl?: string
  ackNumber?: string
  uploadDate?: string
  documents: PortalUploadDocumentItem[]
  checklist?: PortalChecklistItem[]
  remarks?: string
}

export interface PortalUploadData {
  portalName?: string
  portalUrl?: string
  ackNumber?: string
  uploadDate?: string
  documents: PortalUploadDocumentItem[]
  checklist?: PortalChecklistItem[]
  checklistGeneratedAt?: string
  checklistSource?: string
  remarks?: string
  completedAt?: string
  completedBy?: string
  history?: PortalUploadHistoryEntry[]
}

export interface SubmitInWebsiteHistoryEntry {
  id: string
  tenderId: string
  tenderCategory: 'Online Tender' | 'Online and Offline Tender'
  status: 'Yes – Submitted' | 'No – Pending' | 'Yes' | 'No'
  remarks: string
  submittedAt: string
  submittedBy: string
  completedAt?: string
}

export interface SubmitInWebsiteData {
  tenderCategory?: 'Online Tender' | 'Online and Offline Tender'
  onlineOffline?: 'Yes' | 'No'
  status: 'Yes – Submitted' | 'No – Pending' | 'Yes' | 'No'
  remarks: string
  submittedAt?: string
  submittedBy?: string
  completedAt?: string
  history?: SubmitInWebsiteHistoryEntry[]
}

// --------------------------------------------------------------------
// 8. Technical Open Check
// --------------------------------------------------------------------
export type TechnicalOpenStatus = 'Qualified' | 'Disqualified' | 'Tender Cancelled'

export interface TechnicalOpenCheckHistoryEntry {
  id: string
  tenderId: string
  status: TechnicalOpenStatus
  openingDate?: string
  openingTime?: string
  openingVenueOrPortal?: string
  openingSummary?: string
  evaluationDate?: string
  evaluationTime?: string
  evaluationVenue?: string
  evaluationCriteria?: string
  complianceConditions?: string
  remarks: string
  submittedAt: string
  submittedBy: string
  completedAt?: string
}

export interface TechnicalOpenCheckData {
  status: TechnicalOpenStatus
  openingDate?: string
  openingTime?: string
  openingVenueOrPortal?: string
  openingSummary?: string
  evaluationDate?: string
  evaluationTime?: string
  evaluationVenue?: string
  evaluationCriteria?: string
  complianceConditions?: string
  remarks: string
  submittedAt?: string
  submittedBy?: string
  completedAt?: string
  history?: TechnicalOpenCheckHistoryEntry[]
}

// --------------------------------------------------------------------
// 9. Financial Open Check
// --------------------------------------------------------------------
export type FinancialRanking = 'L1' | 'L2' | 'L3' | 'L4' | 'Other'

export interface FinancialOpenCheckHistoryEntry {
  id: string
  tenderId: string
  ranking: FinancialRanking
  l1BidderName: string
  l1Price: string
  ourBidPrice?: string
  priceVariance?: string
  openingDate?: string
  remarks: string
  submittedAt: string
  submittedBy: string
  completedAt?: string
}

export interface FinancialOpenCheckData {
  ranking: FinancialRanking
  l1BidderName: string
  l1Price: string
  ourBidPrice?: string
  priceVariance?: string
  openingDate?: string
  remarks: string
  submittedAt?: string
  submittedBy?: string
  completedAt?: string
  history?: FinancialOpenCheckHistoryEntry[]
}

// --------------------------------------------------------------------
// 10. Negotiation
// --------------------------------------------------------------------
export type NegotiationStatus = 'Yes' | 'No' | 'Not Applicable'

export interface NegotiationHistoryEntry {
  id: string
  tenderId: string
  status: NegotiationStatus
  letterDoc?: SampleDocumentItem | null
  negotiatedPrice?: string
  meetingDate?: string
  remarks: string
  submittedAt: string
  submittedBy: string
  completedAt?: string
}

export interface NegotiationData {
  status: NegotiationStatus
  letterDoc?: SampleDocumentItem | null
  negotiatedPrice?: string
  meetingDate?: string
  remarks: string
  submittedAt?: string
  submittedBy?: string
  completedAt?: string
  history?: NegotiationHistoryEntry[]
}

// --------------------------------------------------------------------
// 11. Work Order
// --------------------------------------------------------------------
export interface WorkOrderHistoryEntry {
  id: string
  tenderId: string
  workOrderDoc?: SampleDocumentItem | null
  workOrderNumber?: string
  workOrderDate?: string
  contractValue?: string
  aiSummary?: string
  bgDoc?: SampleDocumentItem | null
  bgAmount?: string
  bgBankName?: string
  bgNumber?: string
  bgValidity?: string
  affidavitRequirements?: string
  generatedAgreement?: string
  remarks: string
  submittedAt: string
  submittedBy: string
  completedAt?: string
}

export interface WorkOrderData {
  workOrderDoc?: SampleDocumentItem | null
  workOrderNumber?: string
  workOrderDate?: string
  contractValue?: string
  aiSummary?: string
  bgDoc?: SampleDocumentItem | null
  bgAmount?: string
  bgBankName?: string
  bgNumber?: string
  bgValidity?: string
  affidavitRequirements?: string
  generatedAgreement?: string
  remarks: string
  submittedAt?: string
  submittedBy?: string
  completedAt?: string
  history?: WorkOrderHistoryEntry[]
}

export type CorrigendumChangeType =
  | 'Deadline Extension'
  | 'Date / Schedule'
  | 'EMD / Financial'
  | 'Eligibility Criteria'
  | 'Technical Specification'
  | 'Scope / Quantity'
  | 'Terms & Conditions'
  | 'Clarification / Q&A'
  | 'Other'

export interface CorrigendumChangeItem {
  id: string
  type: CorrigendumChangeType
  category: 'critical' | 'important' | 'standard'
  targetField?: string // e.g. 'due', 'bidDeadlineTime', 'corrigendumRef', 'value', 'tenderFeePerPackage', 'none'
  originalValue: string
  revisedValue: string
  description: string
  pageClauseRef?: string | null
  isCritical?: boolean
  applied?: boolean
}

export interface CorrigendumRecord {
  id: string
  corrigendumNo: string // e.g. "Corrigendum No. 1"
  issueDate?: string | null // YYYY-MM-DD
  tenderRef?: string | null // reference number quoted in the corrigendum
  fileName: string
  fileUrl?: string | null
  dataUrl?: string | null
  fileSize?: number | null
  uploadedAt: string // ISO timestamp
  overview: string
  changes: CorrigendumChangeItem[]
}

export interface TenderPackage {
  code: string
  region: string
  rfx: string
  emdLakh: string
}

export interface BeneficiaryBank {
  accountHolder: string
  bankName: string
  branch: string
  accountNo: string
  ifsc: string
  accountType: string
}

// A single row in the "Technical Details of Proposed Components" document —
// varies per tender (different scope needs different equipment/standards), so
// it is stored on the tender's bid details rather than fixed company data.
export interface TechnicalComponent {
  item: string
  make: string
  compliance: string
}

// Tender-specific values that get printed into the generated bid documents.
// Bidder (company) details are fixed and live in lib/company.ts.
export interface TenderBidDetails {
  rfsNo: string
  rfsDate: string
  corrigendum: string
  workName: string
  shortWorkName: string
  authorityFullName: string
  addresseeDesignation: string
  authorityAddress: string
  bidDeadlineTime: string
  tenderFeePerPackage: string
  gstSection: string
  tenderFeePlusGst: string
  testReportCompliance: string
  mafRequirement: string
  experienceRequirement: string
  turnoverRequirement: string
  bidValidityDays: string
  financialRequirementCr: string
  technicalRequirement: string
  jurisdiction: string
  signingDate: string
  place: string
  packages: TenderPackage[]
  technicalComponents: TechnicalComponent[]
  beneficiaryBank: BeneficiaryBank
}

export type MasterKey = 'states' | 'departments' | 'firms' | 'tenderTypes'
export type Masters = Record<MasterKey, string[]>

export interface StageDefinition {
  label: Stage
  path: string
  short: string
  iconName: string
}

export * from './user'
