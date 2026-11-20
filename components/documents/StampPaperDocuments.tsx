import React from 'react'
import { COMPANY } from '@/lib/company'
import { DocData } from '@/lib/tender-docs'
import { A4Page, DocTitle, FormatTag, StampNote, WitnessNotary } from './primitives'

export function StampPaperDocuments({ doc }: { doc: DocData }) {
  return (
    <>
      {/* Format-5: Power of Attorney */}
      <A4Page>
        <FormatTag>FORMAT-5</FormatTag>
        <DocTitle>POWER OF ATTORNEY</DocTitle>
        <StampNote notarised />
        <p className="mb-4 text-justify">
          Know all men by these presents, We, {COMPANY.name}{COMPANY.formerName ? ` (formerly ${COMPANY.formerName})` : ''}, having our Registered
          Office at {COMPANY.address}, do hereby constitute, appoint and authorize {COMPANY.signatory},{' '}
          {COMPANY.signatoryDesignation}, as our true and lawful attorney, to do in our name and on our behalf all acts,
          deeds and things necessary in connection with or incidental to the submission of our bid for {doc.workName},
          against Packages {doc.packagesLabel}, in response to RfS No. {doc.rfsFull}, issued by {doc.authority},
          including signing and submission of the bid and all related documents, undertakings, declarations, guarantees
          and bank guarantees, and generally dealing with {doc.authority}. We ratify all acts lawfully done by our said
          attorney pursuant to this Power of Attorney.
        </p>
        <p className="mb-12">
          Signed for {COMPANY.name} through the hand of the person duly authorized vide Board Resolution dated{' '}
          {doc.signDate}.
        </p>
        <p className="mb-8">
          Accepted: ________________________ ({COMPANY.signatory}, {COMPANY.signatoryDesignation})
        </p>
        <div className="mb-12">
          <p>
            For {COMPANY.name}: ________________________ ({COMPANY.managingDirector})
          </p>
        </div>
        <WitnessNotary />
      </A4Page>

      {/* Annexure-D: Declaration of Authorization */}
      <A4Page>
        <FormatTag>ANNEXURE-D</FormatTag>
        <DocTitle>DECLARATION OF AUTHORIZATION</DocTitle>
        <StampNote />
        <p className="mb-12 text-justify">
          We, {COMPANY.name}, having our Registered Office at {COMPANY.address}, do hereby constitute, appoint and
          authorize {COMPANY.signatory}, {COMPANY.signatoryDesignation}, to do in our name and on our behalf all acts,
          deeds and things necessary in connection with the submission of our bid for {doc.shortWorkName} (Packages{' '}
          {doc.packagesLabel}) in response to RfS No. {doc.rfsFull} issued by {doc.authority}. We ratify all acts
          lawfully done by our authorized representative.
        </p>
        <div className="flex flex-wrap justify-between items-end gap-y-8 mb-12">
          <p>For {COMPANY.name}</p>
          <p>Name: {COMPANY.signatory.replace(/^Mr\.\s*/, '')}</p>
          <p>Designation: {COMPANY.signatoryDesignation}</p>
          <p>Date: {doc.signDate}</p>
        </div>
        <WitnessNotary />
      </A4Page>

      {/* Annexure-H: Bid Security Declaration */}
      <A4Page>
        <FormatTag>ANNEXURE-H</FormatTag>
        <DocTitle>BID SECURITY DECLARATION</DocTitle>
        <StampNote />
        <div className="flex justify-between mb-8">
          <p>Ref: ____________</p>
          <p>Date: {doc.signDate}</p>
        </div>
        <p className="mb-12 text-justify">
          We, {COMPANY.name}, hereby undertake to {doc.authority} in respect of our response to RfS No. {doc.rfs}{' '}
          (Packages {doc.packagesLabel}) that we will abide by the provisions of the RfS during the bid validity period
          and shall not withdraw or modify our bid during the bid validity period. In case we withdraw or modify our
          response during the bid validity period, or violate other provisions of the RfS which make the bid
          non-responsive, we (including our Parent, Ultimate Parent and Affiliates) shall be suspended / debarred from
          participating in upcoming tenders issued by any department of the {doc.state} Government for a period of 5
          years from the date of default as notified by {doc.authority}.
        </p>
        <p className="mb-12">
          (Name & Signature of the Authorised Signatory — {COMPANY.signatory}, {COMPANY.signatoryDesignation},{' '}
          {COMPANY.name})
        </p>
        <WitnessNotary />
      </A4Page>

      {/* Annexure-E: Indemnity Bond */}
      <A4Page>
        <FormatTag>ANNEXURE-E</FormatTag>
        <DocTitle>INDEMNITY BOND</DocTitle>
        <StampNote notarised />
        <p className="mb-12 text-justify">
          This Indemnity Bond is made this {doc.signDateLong} by {COMPANY.name}, having its Registered Office at{' '}
          {COMPANY.address} (the &apos;Vendor&apos;), in favour of {doc.authorityFullName} (&apos;{doc.authority}&apos;).
          Whereas {doc.authority} is required to release CFA to the Vendor for erection, operation and maintenance of
          the Solar Power Plant, and whereas the Vendor is required to establish an Insurance Cover for third-party
          liability, the Vendor undertakes to keep {doc.authority} harmless against any past or future unforeseen loss
          or damage caused due to non-establishment of the Insurance Cover under the contract against which CFA has been
          released. This Indemnity Bond is irrevocable.
        </p>
        <p className="mb-12">For {COMPANY.name} (Authorised Representative): ________________________</p>
        <WitnessNotary />
      </A4Page>
    </>
  )
}
