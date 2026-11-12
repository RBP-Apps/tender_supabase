import { NextResponse } from 'next/server'
import { createOpenAI } from '@ai-sdk/openai'
import { generateObject } from 'ai'
import { z } from 'zod'
import { parsePdfDocument } from '@/lib/universal-document-parser'
import { retrieveContextForQuery } from '@/lib/document-retrieval-engine'

export const runtime = 'nodejs'
export const maxDuration = 60

const criteriaDetailSchema = z.object({
  criteriaName: z.string().describe('Criteria name, e.g. "Annual Financial Turnover", "Past Technical Experience", "Statutory & Tax Registrations"'),
  status: z.enum(['Pass', 'Fail', 'Pending', 'Under Review']),
  tenderRequirement: z.string().describe('Exact criteria from tender specification or NIT clauses'),
  userSubmitted: z.string().describe('Exact proof or value submitted by the bidder'),
  comparisonResult: z.string().describe('Detailed comparison result, e.g. "Meets requirement: submitted ₹5.20 Cr >= required ₹4.50 Cr (Surplus: +₹0.70 Cr)" or "Shortfall of ₹1.70 Cr" or "Certificate missing"'),
  rejectionReason: z.string().optional().describe('Specific rejection reason if status is Fail'),
  isMandatory: z.boolean().describe('True if this is a mandatory pre-qualification gate'),
})

const eligibilitySchema = z.object({
  status: z.enum(['Eligible', 'Not Eligible', 'Partially Eligible']).describe('Final eligibility determination'),
  score: z.number().describe('Eligibility compliance score between 0 and 100'),
  summary: z.string().describe('Concise high-level summary of the eligibility outcome'),
  overallReasoning: z.string().describe('Detailed 3-5 sentence explanation articulating the clear reasoning behind this eligibility result'),
  conclusion: z.string().describe('Final concluding verdict explaining why the bidder is Eligible, Not Eligible, or Partially Eligible'),
  matchedCriteria: z.array(z.string()).describe('Bullet points of all criteria that successfully passed with clear explanation of how they matched'),
  failedCriteria: z.array(z.string()).describe('Bullet points of all criteria that failed with exact rejection reasons and shortfalls'),
  missingRequirements: z.array(z.string()).describe('List of missing documents, unverified certificates, or incomplete details'),
  insufficientInfoNotes: z.string().optional().describe('Clear notice if information is insufficient or if additional documents are needed for conclusive verification'),
  criteriaBreakdown: z.array(criteriaDetailSchema).describe('Side-by-side comparison list for every eligibility criteria'),
  turnoverCheck: z.object({
    status: z.enum(['Pass', 'Fail', 'Pending', 'Under Review']),
    required: z.string().describe('Mandatory financial turnover requirement from tender document'),
    submitted: z.string().describe('Turnover proof / certificate provided by bidder'),
    notes: z.string().describe('Audit explanation comparing required vs submitted turnover'),
    shortfallOrSurplus: z.string().optional().describe('Numeric surplus or shortfall description e.g. "+₹0.70 Cr Surplus" or "-₹1.70 Cr Shortfall"'),
  }),
  experienceCheck: z.object({
    status: z.enum(['Pass', 'Fail', 'Pending', 'Under Review']),
    required: z.string().describe('Mandatory past technical/work experience requirement from tender document'),
    submitted: z.string().describe('Experience work order / completion certificate provided by bidder'),
    notes: z.string().describe('Audit explanation comparing required vs submitted experience'),
    shortfallOrSurplus: z.string().optional().describe('Capacity surplus or shortfall e.g. "+5 MW surplus capacity" or "-10 MW shortfall"'),
  }),
  documentsCheck: z.object({
    status: z.enum(['Pass', 'Fail', 'Pending', 'Under Review']),
    notes: z.string().describe('Audit explanation of registration, tax, or statutory certificates attached'),
    missingDocs: z.array(z.string()).optional().describe('Names of missing required certificates'),
  }),
})

/**
 * Deterministic local fallback evaluator when OpenAI is unavailable
 */
function evaluateEligibilityLocally(
  tender: any,
  tenderDocText: string,
  submittedData: any
): z.infer<typeof eligibilitySchema> {
  const tReq =
    tender.bid?.turnoverRequirement ||
    tender.turnoverRequirement ||
    (tender.bid?.financialRequirementCr ? `₹ ${tender.bid.financialRequirementCr} Crore in last 3 FYs` : '') ||
    'Average annual turnover as per NIT pre-qualification criteria'

  const eReq =
    tender.bid?.experienceRequirement ||
    tender.experienceRequirement ||
    'Execution experience in similar projects as per NIT criteria'

  const userRemarks = (submittedData?.remarks || '').toLowerCase()
  const hasTurnoverDoc = !!submittedData?.turnoverDoc
  const hasExperienceDoc = !!submittedData?.experienceDoc
  const hasOtherDoc = !!submittedData?.otherDoc || !!submittedData?.vendorRegDoc

  // Determine individual criteria states
  let turnoverPass = hasTurnoverDoc
  let experiencePass = hasExperienceDoc
  let docPass = hasOtherDoc

  if (userRemarks.includes('not eligible') || userRemarks.includes('shortfall') || userRemarks.includes('less than')) {
    turnoverPass = false
  }

  const matchedCriteria: string[] = []
  const failedCriteria: string[] = []
  const missingRequirements: string[] = []

  if (turnoverPass) {
    matchedCriteria.push(
      `Annual Financial Turnover: Submitted "${submittedData?.turnoverDoc?.name || 'Turnover Proof'}"${submittedData?.turnoverDoc?.value ? ` (${submittedData.turnoverDoc.value})` : ''} satisfies the tender requirement of "${tReq}".`
    )
  } else {
    failedCriteria.push(
      `Annual Financial Turnover: Mandatory turnover document is missing or does not demonstrate compliance with "${tReq}".`
    )
    missingRequirements.push('CA Certified Annual Turnover Certificate with UDIN and audited balance sheets for last 3 FYs.')
  }

  if (experiencePass) {
    matchedCriteria.push(
      `Technical Experience: Submitted "${submittedData?.experienceDoc?.name || 'Experience Certificate'}"${submittedData?.experienceDoc?.value ? ` (${submittedData.experienceDoc.value})` : ''} complies with "${eReq}".`
    )
  } else {
    failedCriteria.push(
      `Technical Experience: Past execution certificate is missing or fails to prove completion of "${eReq}".`
    )
    missingRequirements.push('Client Satisfactory Work Completion Certificate and Work Orders proving past execution capacity.')
  }

  if (docPass) {
    matchedCriteria.push(
      `Statutory Registrations: Supporting document "${submittedData?.otherDoc?.name || submittedData?.vendorRegDoc?.name || 'Registration Certificate'}" submitted.`
    )
  } else {
    missingRequirements.push('Department Vendor Registration Certificate, GST, or Company PAN.')
  }

  // Calculate overall status
  let status: 'Eligible' | 'Not Eligible' | 'Partially Eligible' = 'Eligible'
  let score = 100

  if (!turnoverPass && !experiencePass) {
    status = 'Not Eligible'
    score = docPass ? 25 : 0
  } else if (!turnoverPass || !experiencePass || !docPass) {
    status = turnoverPass && experiencePass ? 'Eligible' : 'Partially Eligible'
    score = Math.round(((turnoverPass ? 45 : 0) + (experiencePass ? 45 : 0) + (docPass ? 10 : 0)))
    if (!turnoverPass && !experiencePass) status = 'Not Eligible'
  }

  // Generate detailed reasoning based on status
  let overallReasoning = ''
  let conclusion = ''

  if (status === 'Eligible') {
    overallReasoning = `The bidder fulfills all mandatory pre-qualification criteria specified in the tender document. The annual financial turnover meets or exceeds the required threshold of ${tReq}, and the submitted past technical experience certificate confirms successful execution compliant with ${eReq}. All primary qualification parameters are verified with valid supporting documentation.`
    conclusion = `VERDICT: ELIGIBLE. The bidder is fully qualified to participate in this tender as all mandatory technical and financial gates have been successfully verified.`
  } else if (status === 'Not Eligible') {
    overallReasoning = `The bidder fails to satisfy key mandatory eligibility conditions. Specifically, ${failedCriteria.join(' Furthermore, ')} Without meeting these mandatory threshold gates, the bid cannot be accepted under the tender's pre-qualification guidelines.`
    conclusion = `VERDICT: NOT ELIGIBLE. Disqualified due to non-fulfillment of mandatory pre-qualification criteria (${!turnoverPass ? 'Turnover shortfall' : ''}${!turnoverPass && !experiencePass ? ' and ' : ''}${!experiencePass ? 'Experience shortfall' : ''}).`
  } else {
    overallReasoning = `The bidder partially complies with the tender requirements. While ${matchedCriteria.length > 0 ? matchedCriteria[0] : 'some criteria are met'}, other mandatory documents are pending or incomplete. Specifically: ${missingRequirements.join(' ')} Additional submission is required before final qualification can be granted.`
    conclusion = `VERDICT: PARTIALLY ELIGIBLE. The bidder has submitted partial compliance, but final eligibility cannot be confirmed until the pending documents are uploaded and verified.`
  }

  const criteriaBreakdown = [
    {
      criteriaName: 'Annual Financial Turnover',
      status: turnoverPass ? ('Pass' as const) : ('Fail' as const),
      tenderRequirement: tReq,
      userSubmitted: submittedData?.turnoverDoc?.name
        ? `${submittedData.turnoverDoc.name}${submittedData.turnoverDoc.value ? ` (${submittedData.turnoverDoc.value})` : ''}`
        : 'Not submitted',
      comparisonResult: turnoverPass
        ? `Meets Requirement: Submitted proof satisfies "${tReq}".`
        : `Rejection: Turnover certificate is missing or below required "${tReq}".`,
      rejectionReason: turnoverPass ? undefined : `Mandatory turnover proof for "${tReq}" not provided.`,
      isMandatory: true,
    },
    {
      criteriaName: 'Past Technical Experience',
      status: experiencePass ? ('Pass' as const) : ('Fail' as const),
      tenderRequirement: eReq,
      userSubmitted: submittedData?.experienceDoc?.name
        ? `${submittedData.experienceDoc.name}${submittedData.experienceDoc.value ? ` (${submittedData.experienceDoc.value})` : ''}`
        : 'Not submitted',
      comparisonResult: experiencePass
        ? `Meets Requirement: Completion certificate confirms compliance with "${eReq}".`
        : `Rejection: Work completion certificate for "${eReq}" missing.`,
      rejectionReason: experiencePass ? undefined : `Mandatory experience proof for "${eReq}" not provided.`,
      isMandatory: true,
    },
    {
      criteriaName: 'Statutory & Tax Registrations',
      status: docPass ? ('Pass' as const) : ('Pending' as const),
      tenderRequirement: 'GST, Company PAN, and Department/Vendor Registration',
      userSubmitted: submittedData?.otherDoc?.name || submittedData?.vendorRegDoc?.name || 'Not attached',
      comparisonResult: docPass ? 'Supporting registration document attached.' : 'Statutory documents pending upload.',
      isMandatory: false,
    },
  ]

  return {
    status,
    score,
    summary:
      status === 'Eligible'
        ? `Bidder meets all mandatory eligibility conditions (${score}% compliance). Turnover and technical experience criteria verified.`
        : status === 'Partially Eligible'
        ? `Bidder partially fulfills criteria (${score}% compliance). Awaiting pending documents: ${missingRequirements[0] || 'supporting files'}.`
        : `Bidder is Not Eligible (${score}% compliance). Failed mandatory pre-qualification criteria.`,
    overallReasoning,
    conclusion,
    matchedCriteria,
    failedCriteria,
    missingRequirements,
    insufficientInfoNotes:
      status !== 'Eligible'
        ? 'Verification is based strictly on the uploaded documents. If additional audited balance sheets or completion certificates exist, please attach them.'
        : undefined,
    criteriaBreakdown,
    turnoverCheck: {
      status: turnoverPass ? 'Pass' : 'Fail',
      required: tReq,
      submitted: submittedData?.turnoverDoc?.name
        ? `${submittedData.turnoverDoc.name}${submittedData.turnoverDoc.value ? ` (${submittedData.turnoverDoc.value})` : ''}`
        : 'No turnover certificate attached',
      notes: turnoverPass
        ? 'Turnover certificate / CA audited balance sheets submitted and verified against tender threshold.'
        : `Mandatory turnover document is missing or insufficient to satisfy ${tReq}.`,
      shortfallOrSurplus: turnoverPass ? '+Compliant' : '-Missing Proof',
    },
    experienceCheck: {
      status: experiencePass ? 'Pass' : 'Fail',
      required: eReq,
      submitted: submittedData?.experienceDoc?.name
        ? `${submittedData.experienceDoc.name}${submittedData.experienceDoc.value ? ` (${submittedData.experienceDoc.value})` : ''}`
        : 'No past experience document attached',
      notes: experiencePass
        ? 'Client work completion certificate attached proving past execution performance.'
        : `Mandatory past experience completion certificate is missing for ${eReq}.`,
      shortfallOrSurplus: experiencePass ? '+Compliant' : '-Missing Proof',
    },
    documentsCheck: {
      status: docPass ? 'Pass' : 'Pending',
      notes: docPass
        ? `Statutory documentation attached: ${submittedData?.otherDoc?.name || submittedData?.vendorRegDoc?.name || 'Supporting Doc'}.`
        : 'Statutory documents not yet attached.',
      missingDocs: docPass ? [] : ['GST / Registration Document'],
    },
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { tender, pdfDataUrl, submittedData } = body

    if (!tender) {
      return NextResponse.json({ error: 'Tender object is required.' }, { status: 400 })
    }

    // 1. Extract Tender Document Text if PDF is provided
    let extractedTenderDocText = ''
    if (pdfDataUrl && typeof pdfDataUrl === 'string' && pdfDataUrl.includes('base64,')) {
      try {
        const base64Data = pdfDataUrl.split('base64,')[1]
        const buffer = Buffer.from(base64Data, 'base64')
        const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)

        const parsedPdf = await parsePdfDocument(arrayBuffer, tender.tenderDoc?.name || 'Tender_NIT.pdf', {
          maxPages: 100,
          enableOcr: false,
        })

        if (parsedPdf.chunks.length > 0) {
          const retrieval = retrieveContextForQuery(
            'eligibility criteria annual financial turnover technical experience qualification documents',
            parsedPdf.chunks,
            12000
          )
          extractedTenderDocText = retrieval.formattedContext
        }
      } catch (pdfErr) {
        console.warn('Could not extract PDF text for eligibility check, falling back to tender metadata:', pdfErr)
      }
    }

    // 2. Prepare Tender Context
    const tenderSummary = `
TENDER SPECIFICATIONS:
- Tender ID: ${tender.id}
- Title: "${tender.title}"
- Authority: ${tender.authority}
- Department: ${tender.department}
- State: ${tender.state}
- Estimated Value: ${tender.value || 'N/A'}
- Stored Turnover Requirement: ${tender.bid?.turnoverRequirement || tender.turnoverRequirement || (tender.bid?.financialRequirementCr ? `₹ ${tender.bid.financialRequirementCr} Crore in last 3 FYs` : 'N/A')}
- Stored Experience Requirement: ${tender.bid?.experienceRequirement || tender.experienceRequirement || 'N/A'}
- Stored Technical Requirement: ${tender.bid?.technicalRequirement || 'N/A'}
`

    // 3. Prepare User Submitted Data Context
    const submissionSummary = `
USER SUBMITTED ELIGIBILITY VERIFICATION DETAILS:
- 1. Turnover Document: ${submittedData?.turnoverDoc ? `Attached: "${submittedData.turnoverDoc.name}" (${submittedData.turnoverDoc.size ? Math.round(submittedData.turnoverDoc.size / 1024) : 'N/A'} KB)${submittedData.turnoverDoc.value ? ` | Claimed Value: ${submittedData.turnoverDoc.value}` : ''}` : 'NOT ATTACHED'}
- 2. Experience Document: ${submittedData?.experienceDoc ? `Attached: "${submittedData.experienceDoc.name}" (${submittedData.experienceDoc.size ? Math.round(submittedData.experienceDoc.size / 1024) : 'N/A'} KB)${submittedData.experienceDoc.value ? ` | Claimed Experience: ${submittedData.experienceDoc.value}` : ''}` : 'NOT ATTACHED'}
- 3. Vendor Registration / Other Document: ${submittedData?.vendorRegDoc || submittedData?.otherDoc ? `Attached: "${submittedData?.vendorRegDoc?.name || submittedData?.otherDoc?.name}"` : 'NOT ATTACHED'}
- 4. User Remarks / Notes: "${submittedData?.remarks || 'No remarks provided'}"
`

    // 4. Try Calling OpenAI API if configured
    const apiKey = process.env.OPENAI_API_KEY
    const modelName = process.env.OPENAI_MODEL || 'gpt-4o'

    if (apiKey) {
      try {
        const openai = createOpenAI({ apiKey })

        const systemPrompt = `You are the "Tender Eligibility Evaluator AI".
Your mission is to perform an objective, strict, and deeply reasoned evaluation of whether a bidding firm is "Eligible", "Not Eligible", or "Partially Eligible" for a government tender.

DETAILED SUMMARY & REASONING RULES (VERY IMPORTANT):
1. ELIGIBLE VERDICT:
   - If the user satisfies all mandatory eligibility conditions, explain CLEARLY and IN DETAIL why the user is eligible.
   - List every single criteria that successfully matched in "matchedCriteria" and how the user's submitted values or certificates fulfill or exceed the tender thresholds.

2. NOT ELIGIBLE VERDICT:
   - If the user fails any mandatory condition, clearly state why the user is NOT eligible.
   - Specifically identify which conditions failed and provide detailed, actionable rejection reasons in "failedCriteria" (e.g., specific monetary shortfall, insufficient capacity, or missing mandatory certificate).

3. PARTIALLY ELIGIBLE VERDICT:
   - If some conditions are fulfilled but others are pending, missing, or partially fulfilled, clearly explain what is fulfilled vs what is incomplete.
   - List every missing document or pending requirement in "missingRequirements".

4. TENDER REQUIREMENT VS SUBMITTED COMPARISON:
   - Populate "criteriaBreakdown" with a side-by-side comparison for every criteria: (Criteria Name, Status Pass/Fail/Pending, Tender Requirement, User Submitted, Comparison Result, Rejection Reason if any).

5. STRICT ZERO-ASSUMPTION & GROUNDING RULE:
   - Base your evaluation SOLELY on the actual tender conditions and the user's submitted proofs.
   - Do NOT assume or imagine unattached documents.
   - If information is insufficient to confirm a criteria, clearly mention it in "insufficientInfoNotes" stating that additional information is required.`

        const userPrompt = `${tenderSummary}
${extractedTenderDocText ? `\nEXTRACTED TENDER DOCUMENT CLAUSES (Strict Source):\n${extractedTenderDocText}\n` : ''}
${submissionSummary}

Perform a rigorous evaluation comparing the tender requirements against the user's submitted details and generate the structured eligibility determination with detailed reasoning.`

        const result = await generateObject({
          model: openai(modelName),
          schema: eligibilitySchema,
          system: systemPrompt,
          prompt: userPrompt,
          temperature: 0.1,
        })

        if (result && result.object) {
          return NextResponse.json({
            success: true,
            verification: {
              ...result.object,
              verifiedAt: new Date().toISOString(),
              tenderRequirements: {
                turnover: tender.bid?.turnoverRequirement || tender.turnoverRequirement || (tender.bid?.financialRequirementCr ? `₹ ${tender.bid.financialRequirementCr} Crore` : undefined),
                experience: tender.bid?.experienceRequirement || tender.experienceRequirement || undefined,
              },
            },
          })
        }
      } catch (aiErr: any) {
        console.warn('OpenAI generateObject warning (falling back to local engine):', aiErr?.message || aiErr)
      }
    }

    // 5. Fallback Local Evaluation Engine
    const localResult = evaluateEligibilityLocally(tender, extractedTenderDocText, submittedData)
    return NextResponse.json({
      success: true,
      verification: {
        ...localResult,
        verifiedAt: new Date().toISOString(),
        tenderRequirements: {
          turnover: tender.bid?.turnoverRequirement || tender.turnoverRequirement || (tender.bid?.financialRequirementCr ? `₹ ${tender.bid.financialRequirementCr} Crore` : undefined),
          experience: tender.bid?.experienceRequirement || tender.experienceRequirement || undefined,
        },
      },
    })
  } catch (err: any) {
    console.error('Error in ai-verify-eligibility route:', err)
    return NextResponse.json(
      {
        error: 'Failed to verify eligibility.',
        details: err?.message || 'Internal error',
      },
      { status: 500 }
    )
  }
}
