import React from 'react'
import { COMPANY } from '@/lib/company'
import { BLANK, DocData, ResolvedPackage } from '@/lib/tender-docs'
import { A4Page, CELL, FormatTag, HEAD_ROW, TABLE } from './primitives'

function BankGuaranteeSection({ doc, pkg }: { doc: DocData; pkg: ResolvedPackage }) {
  return (
    <div className="mb-12 border-b border-dashed border-gray-300 pb-12">
      <p className="font-bold mb-4 uppercase">
        PACKAGE {pkg.code} — {pkg.region} (RFX No. {pkg.rfx}) — Bid Security: Rs. {pkg.amountStr} (Rupees{' '}
        {pkg.amountWords})
      </p>
      <div className="flex gap-16 mb-4">
        <p>Bank Guarantee No.: ____________________</p>
        <p>Date: {doc.signDate}</p>
      </div>
      <p className="mb-4 text-justify">
        In consideration of M/s {COMPANY.name}{COMPANY.formerName ? ` (formerly ${COMPANY.formerName})` : ''}, having its Registered Office at{' '}
        {COMPANY.address} (the “Bidder”), submitting its Bid inter alia for Response to RfS No. {doc.rfs}
        {doc.corrigendum ? ` (read with ${doc.corrigendum})` : ''} for “{doc.workName}”, against Package {pkg.code} (
        {pkg.region}), issued by {doc.authorityFullName.toUpperCase()} (“{doc.authority}”), the ______________________
        [insert name & address of the issuing Scheduled Commercial Bank] (“Guarantor Bank”) hereby agrees
        unequivocally, irrevocably and unconditionally to pay to {doc.authority} or its authorized representative at{' '}
        {doc.authorityFullName}, {doc.authorityAddress.replace(/\n/g, ', ')}, forthwith on demand in writing, an amount
        not exceeding Rs. {pkg.amountStr} (Rupees {pkg.amountWords}), on behalf of the Bidder.
      </p>
      <p className="mb-4 text-justify">
        This guarantee shall be valid up to and including ______________ ({doc.bidValidityDays} days of bid validity
        plus claim period) and shall not be terminable by notice or any change in the constitution of the Guarantor
        Bank. The Guarantor Bank shall make payment on first demand without demur, restriction or conditions and
        notwithstanding any objection by the Bidder, and shall not require {doc.authority} to justify the invocation.
        Interpreted under the laws of India; the courts at {doc.jurisdiction} shall have exclusive jurisdiction.
      </p>
      <div className="flex justify-between mb-4 mt-8">
        <p>Signature: ____________</p>
        <p>Name: ____________</p>
        <p>Designation & Bank Stamp: ____________</p>
      </div>
      <div className="flex gap-4 mb-2">
        <p>For ______________________ [Name of the Bank]</p>
        <p>Attorney/PoA No.: ____________</p>
        <p>WITNESSES: 1. ________</p>
      </div>
      <p>2. ________</p>
    </div>
  )
}

export function EmdGuarantees({ doc }: { doc: DocData }) {
  const bank = doc.bank
  const bankRows: [string, string][] = [
    ['Name & Address of Account Holder', bank.accountHolder],
    ['Bank Name', bank.bankName],
    ['Branch Name', bank.branch],
    ['Account No.', bank.accountNo],
    ['IFSC Code', bank.ifsc],
    ['Type of Account', bank.accountType],
  ]
  const hasBank = bankRows.some(([, v]) => v.trim())

  return (
    <A4Page>
      <FormatTag>ANNEXURE-K</FormatTag>
      <h2 className="text-center font-bold text-green-600 text-lg mb-2">
        EMD / BID SECURITY — BANK GUARANTEES ({COMPANY.name})
      </h2>
      <p className="text-center italic text-xs mb-8 text-gray-600">
        (Each Bank Guarantee to be executed by a Scheduled Commercial Bank on non-judicial stamp paper in the name of the
        executing Bank — one BG per package)
      </p>

      <table className={`${TABLE} mb-8`}>
        <thead>
          <tr className={`${HEAD_ROW} text-left`}>
            <th className={CELL}>Package</th>
            <th className={CELL}>Region</th>
            <th className={CELL}>Bid Security (EMD)</th>
          </tr>
        </thead>
        <tbody>
          {doc.packages.map((p, i) => (
            <tr key={i}>
              <td className={CELL}>{p.code}</td>
              <td className={CELL}>{p.region}</td>
              <td className={CELL}>Rs. {p.emdLakh.toFixed(2)} Lakh</td>
            </tr>
          ))}
          <tr className="font-bold bg-gray-100">
            <td className={CELL} colSpan={2}>Total</td>
            <td className={CELL}>
              Rs. {doc.totalEmdLakh} Lakh (Rs. {doc.totalEmdCrore} Crore)
            </td>
          </tr>
        </tbody>
      </table>

      {doc.packages.map((pkg, idx) => (
        <BankGuaranteeSection key={idx} doc={doc} pkg={pkg} />
      ))}

      {hasBank && (
        <div className="mt-12">
          <p className="font-bold mb-4">
            Beneficiary ({doc.authority}) bank details for confirmation of the Bank Guarantee (SFMS) / electronic
            transfer:
          </p>
          <table className={TABLE}>
            <tbody>
              {bankRows.map(([label, value]) => (
                <tr key={label}>
                  <td className={`${CELL} font-bold`}>{label}</td>
                  <td className={CELL}>{value.trim() || BLANK}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="italic text-xs text-gray-500 mt-2">
            Note: The stamp paper shall be in the name of the executing Bank and of appropriate value; the BG shall be
            confirmed to {doc.authority} (SFMS to the above bank branch).
          </p>
        </div>
      )}
    </A4Page>
  )
}
