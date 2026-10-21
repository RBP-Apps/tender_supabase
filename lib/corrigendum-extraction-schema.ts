import { z } from 'zod'

const nullableText = (description: string) => z.string().nullable().describe(description)

export const corrigendumChangeSchema = z.object({
  type: z
    .enum([
      'Deadline Extension',
      'Date / Schedule',
      'EMD / Financial',
      'Eligibility Criteria',
      'Technical Specification',
      'Scope / Quantity',
      'Terms & Conditions',
      'Clarification / Q&A',
      'Other',
    ])
    .describe('Category of this specific change or amendment'),
  targetField: z
    .enum([
      'due', // Submission Deadline Date (YYYY-MM-DD)
      'bidDeadlineTime', // Bid Submission Deadline Time (e.g. 15:00 Hrs.)
      'corrigendumRef', // Corrigendum title/reference e.g. "Corrigendum-1 dated 03.09.2026"
      'value', // Estimated tender value
      'tenderFeePerPackage', // Tender fee per package
      'gstSection', // Applicable GST conditions
      'tenderFeePlusGst', // Total tender fee including GST
      'testReportCompliance', // Test report compliance requirements
      'mafRequirement', // MAF requirements
      'experienceRequirement', // Experience eligibility requirements
      'turnoverRequirement', // Turnover eligibility requirements
      'financialRequirementCr', // Financial requirement in Rs. Cr
      'technicalRequirement', // Technical requirement summary
      'bidValidityDays', // Bid validity days
      'workName', // Scope / name of work
      'none', // Non-scalar clause / general condition / clarification
    ])
    .describe('Which tender field this update maps to, or "none" if it is an unmapped clause or clarification'),
  originalValue: z
    .string()
    .describe('The previous / original value or condition before this amendment (from document or current tender details)'),
  revisedValue: z
    .string()
    .describe('The revised value or condition announced in this corrigendum'),
  description: z
    .string()
    .describe('Clear, detailed explanation of the change and what is modified'),
  pageClauseRef: nullableText('Reference page number, section, or clause number if mentioned, or null'),
  isCritical: z
    .boolean()
    .describe('True if this is a high-impact change like deadline extension, EMD alteration, eligibility change, or tech spec revision'),
})

export const corrigendumExtractionSchema = z.object({
  corrigendumNo: z
    .string()
    .describe('Official identifier / title of this corrigendum, e.g. "Corrigendum No. 1", "Amendment-2", "Addendum-I", "Clarification No. 1"'),
  issueDate: nullableText('Publication or issue date of the corrigendum formatted as YYYY-MM-DD, or null if not stated'),
  tenderRef: nullableText('The tender / NIT / RfS reference number explicitly mentioned in the document, or null if not stated'),
  overview: z
    .string()
    .describe('A brief 1-2 sentence executive summary of the changes announced in this corrigendum'),
  changes: z
    .array(corrigendumChangeSchema)
    .describe('List of every identifiable change, correction, extension, or clarification. Extract all updates, not just the first one.'),
})

export type CorrigendumChangeExtracted = z.infer<typeof corrigendumChangeSchema>
export type CorrigendumExtraction = z.infer<typeof corrigendumExtractionSchema>
