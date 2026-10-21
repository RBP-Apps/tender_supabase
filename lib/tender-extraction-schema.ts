import { z } from 'zod'

// Single source of truth for "what must be filled to auto-fill the bid documents".
// Used to (a) build the JSON schema the model must follow, and (b) validate/type
// the extracted result before it is applied to the tender form.
//
// Every field is nullable: the model must report `null` for anything the PDF does
// not actually state, rather than guessing. Required-for-documents checking lives
// separately in lib/tender-docs.ts (missingDocFields), since a field can be legally
// absent from a given tender PDF yet still needed before printing.

const nullableText = (description: string) => z.string().nullable().describe(description)

export const packageSchema = z.object({
  code: z.string().describe('Package / lot code, e.g. "P-1". Use "P-1" if the tender has no packages.'),
  region: z.string().describe('Region / area / lot name covered by this package'),
  rfx: z.string().describe('RFX / event / lot reference number for this package; empty string if none'),
  emdLakh: z.string().describe('EMD / bid security for this package in Rs. Lakh, digits only, e.g. "92" or "12.5"'),
})

export const technicalComponentSchema = z.object({
  item: z.string().describe('Component / line item, e.g. "Solar PV Module", "Cable", "Civil Works"'),
  make: z.string().describe('Make(s) / brand(s) proposed or permitted for this item; empty string if not stated'),
  compliance: z.string().describe('Required technical standard / compliance for this item, e.g. an IS/IEC code; empty string if not stated'),
})

export const beneficiaryBankSchema = z.object({
  accountHolder: nullableText('Name & address of the account holder (the authority receiving the EMD/BG)'),
  bankName: nullableText('Bank name for the beneficiary account'),
  branch: nullableText('Branch name/address for the beneficiary account'),
  accountNo: nullableText('Beneficiary bank account number'),
  ifsc: nullableText('Beneficiary bank IFSC code'),
  accountType: nullableText('Type of account, e.g. "Current Account"'),
})

export const tenderExtractionSchema = z.object({
  title: nullableText('Short title / name of work of the tender'),
  authority: nullableText('Short name or abbreviation of the issuing authority, e.g. CSPDCL, NHAI'),
  authorityFullName: nullableText('Full legal name of the issuing authority'),
  addresseeDesignation: nullableText('Officer to whom bids are addressed, e.g. "The Executive Director (RA&PM)"'),
  authorityAddress: nullableText('Full postal address for bid submission'),
  department: nullableText('Sector / department, e.g. Energy, Public Works, Water Resources'),
  state: nullableText('Indian state where the work is executed'),
  estimatedValue: nullableText('Estimated tender value with currency, e.g. "₹ 45 Cr"'),
  rfsNo: nullableText('Tender / NIT / RfS / RFP reference number'),
  rfsDate: nullableText('Date of the tender notice, formatted YYYY-MM-DD'),
  corrigendum: nullableText('Latest corrigendum reference, e.g. "Corrigendum-1 dated 03.09.2026"'),
  workName: nullableText('Full name / scope of work exactly as written in the tender'),
  shortWorkName: nullableText('One-line name of work, short enough for an envelope label'),
  bidDeadlineDate: nullableText('Last date of bid submission, formatted YYYY-MM-DD'),
  bidDeadlineTime: nullableText('Bid submission deadline time, e.g. "15:00 Hrs."'),
  tenderFeePerPackage: nullableText('Tender / processing fee per package in rupees, digits with commas, e.g. "10,000"'),
  gstSection: nullableText(
    'Applicable GST rate, GST amount, and other relevant GST conditions specified for tender fee and contract. ' +
    'If multiple GST rates or conditions are mentioned, capture them accurately with appropriate context. ' +
    'Null if not mentioned in the tender document.'
  ),
  tenderFeePlusGst: nullableText(
    'Automatically calculated total tender fee including GST using formula: Total Tender Fee = Tender Fee + Applicable GST Amount. ' +
    'If the tender specifies an inclusive amount, use that amount without adding GST again. ' +
    'Do not assume a GST rate if not specified in document. Clearly distinguish base tender fee, GST amount, and total amount ' +
    '(e.g. "₹ 11,800 (Base: ₹ 10,000 + 18% GST: ₹ 1,800)"). Null if tender fee is not found.'
  ),
  testReportCompliance: nullableText(
    'Concise summary of approximately 3-5 lines of exact test report requirements: ' +
    'required test reports, applicable standards (IS/IEC), testing authority or laboratory requirements (e.g. NABL/BIS accredited), ' +
    'report validity, and compliance conditions. Do not omit mandatory requirements or invent missing details. Null if not mentioned.'
  ),
  mafRequirement: nullableText(
    'Concise summary of approximately 3-5 lines of Manufacturer Authorization Form (MAF) requirements: ' +
    'manufacturer authorization requirements, prescribed format, manufacturer eligibility, validity, signatures, stamps, ' +
    'and submission conditions. If MAF is not required, explicitly report "Not Required" only when clearly confirmed. Null if not mentioned.'
  ),
  experienceRequirement: nullableText(
    'Exact experience eligibility requirements preserved verbatim from the tender document as much as possible. ' +
    'Include required years of experience, completed or ongoing work conditions, similar-work criteria, required project values, ' +
    'completion certificates, and documentary proof. Preserve all important numbers, dates, amounts, percentages, and conditions.'
  ),
  turnoverRequirement: nullableText(
    'Exact turnover requirements preserved verbatim from the tender document. ' +
    'Capture minimum annual turnover, average turnover (MAAT), required financial years, amount, currency, CA certification, ' +
    'audited financial statements, and supporting documents. Preserve original conditions and distinguish average vs individual year turnover.'
  ),
  bidValidityDays: nullableText('Bid validity period in days, digits only'),
  financialRequirementCr: nullableText('Cumulative financial eligibility requirement (turnover/MAAT/net worth) in Rs. Crore, digits only'),
  technicalRequirement: nullableText('Cumulative technical eligibility requirement, short phrase, e.g. "60,100 kWp OR 10,000 installations"'),
  jurisdiction: nullableText('City whose courts have exclusive jurisdiction over disputes'),
  packages: z.array(packageSchema).describe('Every package / lot / region in the tender. One entry if the tender is not split into packages.'),
  technicalComponents: z
    .array(technicalComponentSchema)
    .describe('Every component / equipment line item with a required make or technical standard, e.g. from a "technical details of proposed components" table. Empty array if the tender has no such table.'),
  beneficiaryBank: beneficiaryBankSchema,
})

export type TenderExtraction = z.infer<typeof tenderExtractionSchema>
