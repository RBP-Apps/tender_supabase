import { NextResponse } from 'next/server'
import { createOpenAI } from '@ai-sdk/openai'
import { generateText } from 'ai'
import { COMPANY } from '@/lib/company'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { mode, tender, requirements, contractValue, workOrderNumber } = body

    if (!tender) {
      return NextResponse.json({ error: 'Tender object is required.' }, { status: 400 })
    }

    const title = tender.title || 'Government Tender Contract'
    const authority = tender.authority || 'Tendering Authority'
    const dept = tender.department || 'Department'
    const bid = tender.bid || {}
    const rfsNo = bid.rfsNo || 'N/A'
    const val = contractValue || tender.value || 'As per Contract'
    const woNum = workOrderNumber || `WO/${authority.slice(0, 4).toUpperCase()}/${new Date().getFullYear()}/001`
    const companyName = COMPANY.name
    const companyAddress = COMPANY.address || 'Industrial Area, India'

    const apiKey = process.env.OPENAI_API_KEY

    // ================================================================
    // MODE 1: TERMS & CONDITIONS SUMMARY
    // ================================================================
    if (mode === 'summary') {
      if (apiKey) {
        try {
          const openai = createOpenAI({ apiKey })
          const modelName = process.env.OPENAI_MODEL || 'gpt-4o'

          const prompt = `
You are an expert procurement analyst for Indian Government tenders.
Generate a structured, professional summary of Applicable Terms & Conditions for the Work Order / Contract Agreement for:

Tender Title: ${title}
Client Authority: ${authority} (${dept})
RFS / NIT Ref: ${rfsNo}
Contract Value: ${val}
Awardee Firm: ${companyName}

Generate a clear, bulleted summary covering:
1. Scope of Work & Deliverables
2. Contract Execution Period & Delivery Milestones
3. Payment Terms & Release Schedule (e.g. 70% on delivery, 20% on commissioning, 10% on warranty)
4. Performance Bank Guarantee (PBG) Requirements (typically 3% to 10% of contract value)
5. Warranty & Comprehensive Annual Maintenance (CAMC)
6. Liquidated Damages (LD) & Penalty Clauses for delay
7. Dispute Resolution, Arbitration & Legal Jurisdiction
`
          const { text } = await generateText({
            model: openai(modelName),
            prompt,
          })

          return NextResponse.json({ success: true, summary: text.trim(), source: 'ai' })
        } catch (aiErr: any) {
          console.warn('AI Work Order summary fallback:', aiErr?.message || aiErr)
        }
      }

      // Fallback Summary
      const fallbackSummary = [
        `### SUMMARY OF APPLICABLE TERMS & CONDITIONS — WORK ORDER`,
        `**Work Order Ref:** ${woNum} | **Tender Ref:** ${rfsNo}`,
        `**Client:** ${authority} (${dept}) | **Contractor:** M/s ${companyName}`,
        ``,
        `1. **Scope of Work:** Complete supply, testing, installation, and commissioning for "${title}".`,
        `2. **Contract Value:** ${val} inclusive of all applicable statutory taxes, GST, duties, and freight.`,
        `3. **Delivery Schedule:** Material delivery within 60 days from the date of Work Order issuance; site commissioning within 30 days thereafter.`,
        `4. **Payment Terms:**`,
        `   • 70% against delivery and physical inspection of materials at site.`,
        `   • 20% upon successful installation, testing, and joint commissioning certification.`,
        `   • 10% against submission of Performance Bank Guarantee (PBG) valid across warranty period.`,
        `5. **Performance Bank Guarantee (PBG):** 5% of contract value from a Scheduled Commercial Bank, valid for 60 months plus 60 days claim period.`,
        `6. **Warranty & Support:** Comprehensive onsite warranty of 5 years including periodic preventive maintenance and emergency breakdown resolution within 48 hours.`,
        `7. **Liquidated Damages (LD):** 0.5% per week of delay or part thereof, capped at a maximum of 10% of total contract value.`,
        `8. **Jurisdiction:** Courts in ${tender.state || 'Headquarters'} shall have exclusive jurisdiction in all matters.`,
      ].join('\n')

      return NextResponse.json({ success: true, summary: fallbackSummary, source: 'heuristic' })
    }

    // ================================================================
    // MODE 2: FORMAL EDITABLE AFFIDAVIT / AGREEMENT GENERATION
    // ================================================================
    if (mode === 'agreement') {
      const userReqs = requirements?.trim() || 'Standard non-judicial stamp paper agreement with indemnity and warranty commitments.'

      if (apiKey) {
        try {
          const openai = createOpenAI({ apiKey })
          const modelName = process.env.OPENAI_MODEL || 'gpt-4o'

          const prompt = `
You are a senior legal counsel specializing in Indian Public Procurement & Commercial Contracts.
Draft a formal, comprehensive, legally binding "ARTICLES OF CONTRACT AGREEMENT / AFFIDAVIT" based on the following:

Tender Title: ${title}
Tendering Authority (First Party): ${authority}, ${dept}
Contractor / Awardee (Second Party): M/s ${companyName}, having its registered office at ${companyAddress}
Contract Value: ${val}
Work Order Number: ${woNum}
Tender Reference No: ${rfsNo}
User Custom Requirements:
${userReqs}

Draft the complete legal agreement with:
- Formal Preamble & Recitals (WHEREAS the First Party invited tenders...)
- Consideration & Covenants
- Scope of Work & Performance Standards
- Specific Clauses incorporating the user's custom requirements verbatim
- Indemnification & Intellectual Property Rights
- Performance Security & Bank Guarantee Terms
- Breach of Agreement, Termination & Liquidated Damages
- Force Majeure & Dispute Resolution / Arbitration Clause
- Jurisdiction of Courts
- IN WITNESS WHEREOF signature and seal blocks for First Party and Second Party, with two witness blocks.

Make it thorough, formal, ready for execution on judicial stamp paper.
`
          const { text } = await generateText({
            model: openai(modelName),
            prompt,
          })

          return NextResponse.json({ success: true, agreement: text.trim(), source: 'ai' })
        } catch (aiErr: any) {
          console.warn('AI Agreement generation fallback:', aiErr?.message || aiErr)
        }
      }

      // Fallback Formal Agreement Draft
      const todayFormatted = new Date().toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })

      const fallbackAgreement = [
        `ARTICLES OF CONTRACT AGREEMENT`,
        `(To be executed on Non-Judicial Stamp Paper of specified value)`,
        ``,
        `THIS AGREEMENT made and entered into this ${todayFormatted}, by and between:`,
        ``,
        `1. THE ${authority.toUpperCase()}, through its authorized representative, having its principal office at ${dept}, ${tender.state || 'India'} (hereinafter referred to as the "FIRST PARTY / EMPLOYER", which expression shall unless repugnant to the context include its successors and assigns);`,
        `   AND`,
        `2. M/s ${companyName.toUpperCase()}, a company incorporated under the laws of India, having its registered office at ${companyAddress} (hereinafter referred to as the "SECOND PARTY / CONTRACTOR", which expression shall unless repugnant to the context include its legal representatives, successors, and permitted assigns).`,
        ``,
        `WHEREAS the First Party invited competitive bids for "${title}" under Tender Ref No: ${rfsNo};`,
        `AND WHEREAS the Second Party submitted its technical and commercial bid in response thereto and was declared the successful responsive bidder;`,
        `AND WHEREAS the First Party has issued Work Order / Letter of Award No: ${woNum} for the agreed contract price of ${val};`,
        ``,
        `NOW THIS AGREEMENT WITNESSETH AS FOLLOWS:`,
        ``,
        `1. COVENANTS & DOCUMENTS CONSTITUTING THE CONTRACT:`,
        `The following documents shall form an integral part of this Agreement:`,
        `   (a) Original Tender Notification, Technical Specifications, and Addenda/Corrigenda;`,
        `   (b) The Second Party's Technical and Commercial Bid submissions;`,
        `   (c) Work Order No. ${woNum} and official letters of acceptance;`,
        `   (d) Performance Bank Guarantee submitted by the Second Party;`,
        `   (e) Specific conditions and commitments incorporated hereunder.`,
        ``,
        `2. SPECIAL CONDITIONS & USER REQUIREMENTS:`,
        `The Second Party strictly covenants to abide by the following requirements:`,
        `   ${userReqs}`,
        ``,
        `3. PERFORMANCE SECURITY & BANK GUARANTEE:`,
        `The Contractor shall furnish and maintain a valid Performance Bank Guarantee (PBG) equivalent to the required percentage of the contract value from a Nationalized/Scheduled Bank, valid through the entire execution and warranty period.`,
        ``,
        `4. TIME OF COMPLETION & LIQUIDATED DAMAGES:`,
        `Time is the essence of this contract. Delivery and commissioning must be completed strictly within stipulated timelines. Delay shall attract Liquidated Damages @ 0.5% per week up to a maximum of 10% of the contract value.`,
        ``,
        `5. WARRANTY & INDEMNIFICATION:`,
        `The Second Party hereby provides comprehensive 5-year onsite warranty and explicitly indemnifies the First Party against all patent, copyright, or third-party claims arising out of supply or operation.`,
        ``,
        `6. JURISDICTION & ARBITRATION:`,
        `Any dispute arising under or in connection with this contract shall be referred to arbitration in accordance with the Arbitration and Conciliation Act, 1996. The Courts at ${tender.state || 'Jurisdiction'} shall have exclusive legal jurisdiction.`,
        ``,
        `IN WITNESS WHEREOF, the parties hereto have signed and executed this Agreement on the day, month, and year first written above.`,
        ``,
        `FOR AND ON BEHALF OF THE FIRST PARTY:           FOR AND ON BEHALF OF THE SECOND PARTY:`,
        `Name: _______________________________           Name: _______________________________`,
        `Designation: ________________________           Designation: Authorized Signatory`,
        `Authority: ${authority}                         Company: M/s ${companyName}`,
        `[Official Seal]                                 [Company Seal]`,
        ``,
        `WITNESS 1:                                      WITNESS 2:`,
        `Signature: __________________________           Signature: __________________________`,
        `Name & Address: ____________________           Name & Address: ____________________`,
      ].join('\n')

      return NextResponse.json({ success: true, agreement: fallbackAgreement, source: 'heuristic' })
    }

    return NextResponse.json({ error: 'Invalid mode. Use "summary" or "agreement".' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error processing work order AI' }, { status: 500 })
  }
}
