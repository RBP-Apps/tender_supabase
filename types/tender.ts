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
}

export interface EligibilityDocument {
  name: string
  size?: number
  type?: string
  uploadedAt: string
  dataUrl?: string
  letterContent?: any
}

export interface EligibilityCheckData {
  turnoverDoc?: EligibilityDocument | null
  experienceDoc?: EligibilityDocument | null
  vendorRegDoc?: EligibilityDocument | null
  otherDoc?: EligibilityDocument | null
  remarks?: string
  completedAt?: string
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
}

export interface BankAccountDetails {
  bankName: string
  accountHolder?: string
  accountNo: string
  ifsc: string
  branch?: string
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
}

export interface DocumentReadyData {
  customDocs?: SampleDocumentItem[]
  remarks?: string
  completedAt?: string
  completedBy?: string
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
