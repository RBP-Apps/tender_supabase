import React from 'react'
import { CA_FIRM, COMPANY, EXPERIENCE, FINANCIAL_DATA, FINANCIAL_YEARS, MAAT_CR } from '@/lib/company'
import { DocData } from '@/lib/tender-docs'
import { A4Page, CELL, DocTitle, FormatTag, HEAD_ROW, SignatureBlock, TABLE } from './primitives'

const packagesBid = (doc: DocData) =>
  `the ${doc.packageCount} package${doc.packageCount === 1 ? '' : 's'} bid`

export function BidDocuments({ doc }: { doc: DocData }) {
  const netWorth = FINANCIAL_DATA.find(r => r.label.startsWith('Net Worth'))!.values
  const turnover = FINANCIAL_DATA.find(r => r.label === 'Annual Turnover')!.values

  return (
    <>
      {/* Format-2: Covering Letter */}
      <A4Page>
        <FormatTag>FORMAT-2</FormatTag>
        <h2 className="text-center font-bold text-green-600 underline text-lg mb-6">COVERING LETTER</h2>

        <div className="flex justify-between mb-4">
          <p>RfS No: {doc.rfs}</p>
          <p>Dated: {doc.signDate}</p>
        </div>

        <div className="mb-4">
          <p>To,</p>
          <p>{doc.addressee},</p>
          <p>{doc.authorityFullName},</p>
          <p className="whitespace-pre-line">{doc.authorityAddress}</p>
        </div>

        <p className="font-bold mb-4 text-justify">
          Sub: Request for Selection (RfS) for {doc.workName}, against Packages {doc.packagesLabel}, with RfS No.{' '}
          {doc.rfsFull}.
        </p>

        <p className="mb-4">Dear Sir,</p>
        <p className="mb-4 text-justify">
          We, {COMPANY.name}{COMPANY.formerName ? ` (formerly ${COMPANY.formerName})` : ''}, having read, examined and understood the Request for
          Selection{doc.corrigendum ? ` read with ${doc.corrigendum}` : ''}, hereby submit our bid, as an
          individual bidder (single entity), against Packages {doc.packagesLabel}, comprising the Techno-Commercial Bid
          and the Price Bid. We confirm that neither we nor any of our Parent Company / Affiliate has submitted any other
          bid, directly or indirectly, in response to this RfS, and that we are not participating in any consortium under
          this tender.
        </p>
        <ul className="list-decimal pl-5 mb-6 space-y-2 text-justify">
          <li>Non-refundable Tender Processing Fee of Rs. {doc.tenderFee}/- per package has been submitted online for each package bid.</li>
          <li>Bid Security (EMD) — Rs. {doc.totalEmdCrore} Crore in total for the packages bid — has been furnished as Bank Guarantee(s) in the prescribed format (Annexure-K).</li>
          <li>Our Price Bid has been submitted online strictly as per this RfS, without deviation, condition or assumption.</li>
          <li>We independently meet the cumulative technical and financial eligibility for all packages bid; our Net Worth is positive for the latest 3 financial years.</li>
          <li>All terms and conditions of our bid are valid for {doc.bidValidityDays} days from the Bid deadline; we have taken no deviation (Zero-Deviation bidding).</li>
        </ul>

        <p className="font-bold mb-2">Packages applied for:</p>
        <table className={TABLE}>
          <thead>
            <tr className={`${HEAD_ROW} text-left`}>
              <th className={CELL}>S.No.</th>
              <th className={CELL}>Package & Region</th>
              <th className={CELL}>RFX No.</th>
              <th className={CELL}>EMD (Rs. Lakh)</th>
            </tr>
          </thead>
          <tbody>
            {doc.packages.map((p, i) => (
              <tr key={i}>
                <td className={CELL}>{i + 1}</td>
                <td className={CELL}>Package {p.code}: {p.region}</td>
                <td className={CELL}>{p.rfx}</td>
                <td className={CELL}>{p.emdLakh}</td>
              </tr>
            ))}
            <tr className="font-bold bg-gray-100">
              <td className={CELL} colSpan={3}>Total EMD</td>
              <td className={CELL}>{doc.totalEmdLakh} (Rs. {doc.totalEmdCrore} Cr)</td>
            </tr>
          </tbody>
        </table>

        <p className="mt-8">Thanking you, Yours faithfully,</p>
        <SignatureBlock doc={doc} />
      </A4Page>

      {/* Format-1: General Particulars */}
      <A4Page>
        <FormatTag>FORMAT-1</FormatTag>
        <DocTitle>GENERAL PARTICULARS OF THE BIDDER</DocTitle>
        <table className={TABLE}>
          <tbody>
            {[
              { label: 'Name of the Bidder', value: `${COMPANY.name}${COMPANY.formerName ? ` (formerly ${COMPANY.formerName})` : ''}` },
              { label: 'Registered Office Address', value: COMPANY.address },
              { label: 'Contact No. / E-mail / Website', value: `${COMPANY.phone} / ${COMPANY.email} / ${COMPANY.website}` },
              { label: 'Authorized Contact Person', value: `${COMPANY.signatory}, ${COMPANY.signatoryDesignation}` },
              { label: 'Year of Incorporation', value: COMPANY.yearOfIncorporation || '______________' },
              { label: 'CIN', value: COMPANY.cin || '______________' },
              { label: 'Ever debarred by any Govt. Dept./Undertaking', value: 'No' },
              { label: 'Whether wishes to form a Project Company', value: 'No – bidding as an individual entity' },
              { label: 'Bidding company listed in India', value: 'No' },
              { label: 'GST No.', value: COMPANY.gst || '______________' },
              { label: 'PAN No.', value: COMPANY.pan || '______________' },
              { label: 'Certificate of Incorporation / name-change enclosed', value: 'Yes' },
              { label: 'MoA/AoA, GST & PAN enclosed', value: 'Yes' },
            ].map((row, i) => (
              <tr key={i}>
                <td className={`${CELL} font-bold w-1/3`}>{row.label}</td>
                <td className={`${CELL} w-2/3`}>{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <SignatureBlock doc={doc} />
      </A4Page>

      {/* Format-6: Financial Eligibility */}
      <A4Page>
        <FormatTag>FORMAT-6</FormatTag>
        <DocTitle>FINANCIAL ELIGIBILITY CRITERIA REQUIREMENT</DocTitle>
        <p className="font-bold mb-4">
          Name of Financially Evaluated Entity: {COMPANY.name}{COMPANY.formerName ? ` (formerly ${COMPANY.formerName})` : ''}
        </p>
        <table className={`${TABLE} text-center`}>
          <thead>
            <tr className={HEAD_ROW}>
              <th className={CELL}>Financial Year</th>
              <th className={CELL}>Annual Turnover (Rs. Cr)</th>
              <th className={CELL}>MAAT Value (Rs. Cr)</th>
              <th className={CELL}>Net Worth (Rs. Cr)</th>
            </tr>
          </thead>
          <tbody>
            {FINANCIAL_YEARS.map((fy, i) => (
              <tr key={fy}>
                <td className={CELL}>{fy}</td>
                <td className={CELL}>{turnover[i]}</td>
                <td className={CELL}>{turnover[i]}</td>
                <td className={CELL}>{netWorth[i]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="italic text-sm text-justify mb-8">
          MAAT (average of the best three of five audited financial years — FY 2025-26, 2024-25 & 2023-24) = Rs.{' '}
          {MAAT_CR} Crore
          {doc.financialRequirementCr
            ? `, against the cumulative requirement of Rs. ${doc.financialRequirementCr} Crore for ${packagesBid(doc)}`
            : ''}
          . Net Worth is positive and increasing for all years shown. Figures are per audited financial statements
          {COMPANY.formerName ? `(audited in the erstwhile name '${COMPANY.formerName}'; name-change certificate enclosed).` : ''}
        </p>
        <div className="mb-8">
          <p className="font-bold mb-8">For {COMPANY.name}</p>
          <p>({COMPANY.signatory} — {COMPANY.signatoryDesignation})</p>
          <div className="flex justify-between mt-2">
            <p>Date: {doc.signDate}</p>
            <p>Place: {doc.place}</p>
          </div>
        </div>
        <div className="pt-8">
          <p className="font-bold mb-4">Certified by Chartered Accountant / Statutory Auditor:</p>
          <p className="mb-2">
            For {CA_FIRM.name} — FRN {CA_FIRM.frn} — ({CA_FIRM.partner}), M.No. {CA_FIRM.membershipNo}.
          </p>
          <div className="flex gap-8 mb-4">
            <p>UDIN: {CA_FIRM.udinFormat6}</p>
            <p>Date: {doc.signDate}</p>
            <p>Place: {doc.place}.</p>
          </div>
          <p className="italic text-xs text-gray-500">(The CA-certified Format-6 & Format-9 on the Company letterhead are enclosed.)</p>
        </div>
      </A4Page>

      {/* Format-9: Financial Data */}
      <A4Page>
        <FormatTag>FORMAT-9</FormatTag>
        <DocTitle>FINANCIAL DATA</DocTitle>
        <div className="flex justify-between font-bold mb-4">
          <p>Applicant&apos;s legal name: {COMPANY.name}</p>
          <p>Date: {doc.signDate}</p>
        </div>
        <table className={`${TABLE} text-right`}>
          <thead>
            <tr className={HEAD_ROW}>
              <th className={`${CELL} text-left`}>Description</th>
              {FINANCIAL_YEARS.map(fy => (
                <th key={fy} className={CELL}>{fy}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FINANCIAL_DATA.map(row => (
              <tr key={row.label}>
                <td className={`${CELL} text-left`}>{row.label}</td>
                {row.values.map((v, i) => (
                  <td key={i} className={CELL}>{v}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="italic text-sm text-justify">
          Figures in Rs. Crore; audited data for a continuous five-year block (Return on Equity in %). Certified by{' '}
          {CA_FIRM.name} (FRN {CA_FIRM.frn}) — {CA_FIRM.partner}, M.No. {CA_FIRM.membershipNo}. UDIN:{' '}
          {CA_FIRM.udinFormat9}. Date: {doc.signDate}, Place: {doc.place}. Audited balance sheets and income statements
          for the block are enclosed.
        </p>
      </A4Page>

      {/* Format-7: Work Experience */}
      <A4Page>
        <FormatTag>FORMAT-7</FormatTag>
        <DocTitle>WORK EXPERIENCE</DocTitle>
        <div className="flex gap-8 mb-4">
          <p>Bidder&apos;s legal name: {COMPANY.name}</p>
          <p>Date: {doc.signDate}</p>
        </div>
        <p className="mb-4 text-justify">{EXPERIENCE.summary}</p>
        <table className={`${TABLE} text-center mb-4`}>
          <thead>
            <tr className={HEAD_ROW}>
              <th className={`${CELL} text-left`}>Division (APSPDCL)</th>
              <th className={CELL}>Installed & Commissioned (No. of Sets)</th>
              <th className={CELL}>Installed & Commissioned Capacity (MW)</th>
              <th className={CELL}>Grid-Synchronized (No. of Sets)</th>
              <th className={CELL}>Grid-Synchronized Capacity (MW)</th>
            </tr>
          </thead>
          <tbody>
            {EXPERIENCE.rows.map(r => (
              <tr key={r.division}>
                <td className={`${CELL} text-left`}>{r.division}</td>
                <td className={CELL}>{r.sets}</td>
                <td className={CELL}>{r.mw}</td>
                <td className={CELL}>{r.gridSets}</td>
                <td className={CELL}>{r.gridMw}</td>
              </tr>
            ))}
            <tr className="font-bold bg-gray-100">
              <td className={`${CELL} text-left`}>TOTAL</td>
              <td className={CELL}>{EXPERIENCE.total.sets}</td>
              <td className={CELL}>{EXPERIENCE.total.mw}</td>
              <td className={CELL}>{EXPERIENCE.total.gridSets}</td>
              <td className={CELL}>{EXPERIENCE.total.gridMw}</td>
            </tr>
          </tbody>
        </table>
        <p className="italic text-sm text-justify mb-8">
          Total installed & commissioned = {EXPERIENCE.total.mw} MW across {EXPERIENCE.total.sets} systems; total
          grid-synchronized (power evacuation commenced) = {EXPERIENCE.total.gridMw} MW across{' '}
          {EXPERIENCE.total.gridSets} systems.
          {doc.technicalRequirement
            ? ` Against the cumulative requirement for ${packagesBid(doc)} of ${doc.technicalRequirement}, the bidder meets the technical eligibility criterion.`
            : ''}{' '}
          The experience is for a Government DISCOM (APSPDCL) under PM-Surya Ghar rooftop (ULA/CAPEX), and the
          certificate is issued before the last date of bid submission. Work Order (NREDCAP LOA) and this Work Completion
          / Experience Certificate are enclosed.
        </p>
        <SignatureBlock doc={doc} />
      </A4Page>

      {/* Format-10: Declaration / Undertaking */}
      <A4Page>
        <FormatTag>FORMAT-10</FormatTag>
        <DocTitle>DECLARATION / UNDERTAKING</DocTitle>
        <p className="mb-4">We, {COMPANY.name}, do hereby solemnly undertake and declare the following:</p>
        <p className="mb-4 text-justify">1. No Business Banning: {doc.authority}, any Central/State Government Department, PSU, other government entity or local body has not banned or blacklisted business with us as on the date of tender submission.</p>
        <p className="mb-4 text-justify">2. No Contract Termination: None of the work awarded to us has been rescinded or terminated by {doc.authority}, any Central/State Government Department, PSU, other government entity or local body during the last three (3) years due to our non-performance.</p>
        <p className="mb-4 text-justify">3. No Bankruptcy/Insolvency: We have not suffered bankruptcy or insolvency during the last five (5) years.</p>
        <p className="mb-8 text-justify">4. No Severe Penalties/Liquidated Damages: During the last five (5) years, we have not paid liquidated damages of 10% (or more) of the contract value in any contract due to delay, nor incurred a penalty of 10% (or more) of the contract value due to any other reason.</p>
        <SignatureBlock doc={doc} />
      </A4Page>

      {/* Format-12: Technical Details */}
      <A4Page>
        <FormatTag>FORMAT-12</FormatTag>
        <DocTitle>TECHNICAL DETAILS OF THE PROPOSED COMPONENTS</DocTitle>
        <table className={TABLE}>
          <thead>
            <tr className={`${HEAD_ROW} text-left`}>
              <th className={CELL}>Sl.</th>
              <th className={CELL}>Item</th>
              <th className={CELL}>Make proposed by Bidder</th>
              <th className={CELL}>Technical Compliance as per RfS</th>
            </tr>
          </thead>
          <tbody>
            {doc.technicalComponents.map((c, i) => (
              <tr key={i}>
                <td className={CELL}>{i + 1}</td>
                <td className={CELL}>{c.item}</td>
                <td className={CELL}>{c.make}</td>
                <td className={CELL}>{c.compliance}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="font-bold mt-8 mb-8">STAMP & SIGNATURE OF AUTHORIZED SIGNATORY</p>
        <SignatureBlock doc={doc} />
      </A4Page>
    </>
  )
}
