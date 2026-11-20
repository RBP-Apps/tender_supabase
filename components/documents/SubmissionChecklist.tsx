import React from 'react'
import { COMPANY } from '@/lib/company'
import { DocData } from '@/lib/tender-docs'
import { A4Page, CELL, HEAD_ROW, TABLE } from './primitives'

function ChecklistTable({ items }: { items: string[] }) {
  return (
    <table className={TABLE}>
      <thead>
        <tr className={HEAD_ROW}>
          <th className={`${CELL} w-12`}>Sl.</th>
          <th className={`${CELL} text-left`}>Document</th>
          <th className={`${CELL} w-24 text-center`}>Enclosed</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item, idx) => (
          <tr key={idx}>
            <td className={`${CELL} text-center`}>{idx + 1}</td>
            <td className={CELL}>{item}</td>
            <td className={`${CELL} text-center`}>[ ]</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function SubmissionChecklist({ doc }: { doc: DocData }) {
  const envelopeOne = [
    'Covering Letter as per Format-2 (on Company letterhead, signed).',
    `Copy of online Bid Submission Confirmation for Tender Processing Fee (Rs. ${doc.tenderFee}/- per package) — all ${doc.packageCount} package${doc.packageCount === 1 ? '' : 's'}.`,
    'Copy of online Bid Submission Confirmation / proof for Bid Security (EMD).',
    `Original EMD Bank Guarantees (Annexure-K) for ${doc.packageRange} — total Rs. ${doc.totalEmdCrore} Crore (one BG per package).`,
  ]

  const envelopeTwo = [
    'Format-1: General Particulars of the Bidder (signed).',
    COMPANY.formerName
      ? `Certificate of Incorporation + name-change certificate (${COMPANY.formerName} → ${COMPANY.name}).`
      : 'Certificate of Incorporation.',
    'Memorandum & Articles of Association (MoA / AoA).',
    'GST Registration Certificate and PAN card.',
    'Format-2: General particulars / covering letter (copy).',
    'Format-5: Power of Attorney in favour of authorised signatory (notarised, on stamp paper) + Board Resolution.',
    'General Eligibility: Format-10 declaration + supporting undertakings.',
    'Technical Eligibility: Format-7 + Experience Certificate dated 30.06.2026 (APSPDCL) + NREDCAP LOA (Work Order).',
    'Financial Eligibility: Format-6 & Format-9 (CA-certified, Momin & Co., with UDIN).',
    "Audited annual accounts (balance sheet, P&L, auditor's report) for the 5-year block.",
    'Format-10: Declaration / Undertaking (no banning / termination / bankruptcy / penalties).',
    'Format-11: Undertaking for downloaded tender document.',
    'Format-12: Technical details of proposed components (makes).',
    'Annexure-F: ALMM Order declaration.',
    'Annexure-I: Domestic Content Requirement (DCR) self-declaration.',
    'Annexure-D: Declaration of Authorization (on stamp paper).',
    'Annexure-H: Bid Security Declaration (on stamp paper).',
    'Annexure-E: Indemnity Bond (on stamp paper, notarised).',
    `Signed & stamped copy of complete RfS document${doc.corrigendum ? ` including ${doc.corrigendum}` : ''} (each page initialled).`,
  ]

  return (
    <A4Page>
      <h2 className="text-center font-bold text-green-700 text-xl mb-6">BID SUBMISSION CHECKLIST / INDEX</h2>
      <p className="mb-2 text-sm">RfS No.: {doc.rfsFull}.</p>
      <p className="mb-2 text-sm">
        Bidder: {COMPANY.name}{COMPANY.formerName ? ` (formerly ${COMPANY.formerName})` : ''} — Individual Bidder (single entity).
      </p>
      <p className="mb-2 text-sm">Packages: {doc.packagesLabel}.</p>
      <p className="mb-6 text-sm font-bold">Bid Deadline: {doc.deadline}</p>

      <p className="font-bold text-green-700 mb-2">ENVELOPE-I — COVERING LETTER, TENDER FEE & BID SECURITY (EMD)</p>
      <ChecklistTable items={envelopeOne} />

      <p className="font-bold text-green-700 mb-2 mt-4">ENVELOPE-II — TECHNO-COMMERCIAL DOCUMENTS (NO Price Bid)</p>
      <ChecklistTable items={envelopeTwo} />

      <p className="italic text-xs text-gray-500 mt-4 text-justify">
        Note: The complete sealed cover (Envelope-I + Envelope-II) is to reach {doc.addressee}, {doc.authority} by the Bid
        Deadline by registered/speed post, courier or hand delivery. The Offline cover must NOT contain any Price-Bid
        information.
      </p>
    </A4Page>
  )
}
