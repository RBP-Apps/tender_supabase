import React from 'react'
import { COMPANY } from '@/lib/company'
import { DocData } from '@/lib/tender-docs'

export const TABLE = 'w-full border-collapse border border-black mb-6 table-fixed text-[11px] leading-tight break-words'
export const CELL = 'border border-black p-1 break-words hyphens-auto'
export const HEAD_ROW = 'bg-green-700 text-white'

export const DocumentHeader = () => (
  <div className="flex justify-between items-center mb-8 border-b-2 border-slate-900 pb-4">
    <div className="flex items-center gap-3.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={COMPANY.logoUrl} alt="RBP Logo" className="h-12 w-auto object-contain" crossOrigin="anonymous" />
      <h1 className="text-lg font-extrabold text-slate-950 uppercase tracking-wide">{COMPANY.name}</h1>
    </div>
  </div>
)

// Same peach footer banner on every generated document page.
export const DocumentFooter = () => (
  <div
    className="absolute left-0 right-0 bottom-0 px-8 py-2.5 flex items-center justify-between gap-4 text-[10px] leading-snug border-t"
    style={{ backgroundColor: '#FCD497', borderColor: '#E8B975', color: '#42372A' }}
  >
    <div>
      <p><strong>Regd. Office:</strong> {COMPANY.regdOfficeLine1}</p>
      <p>{COMPANY.regdOfficeLine2}</p>
    </div>
    <div className="h-8 w-px opacity-70" style={{ backgroundColor: '#B8925E' }} />
    <div>
      <p><strong>e:</strong> {COMPANY.email} &nbsp;|&nbsp; <strong>w:</strong> {COMPANY.website}</p>
      <p><strong>Sales:</strong> {COMPANY.salesPhone} &nbsp;|&nbsp; <strong>Service:</strong> {COMPANY.servicePhone}</p>
    </div>
  </div>
)

export const SignatureBlock = ({ doc }: { doc: DocData }) => (
  <div className="mt-16 pt-8 border-t border-slate-200">
    <p className="font-bold mb-8 text-slate-700">For {COMPANY.name}</p>
    <p className="text-slate-600 font-medium">
      ({COMPANY.signatory} — {COMPANY.signatoryDesignation})
    </p>
    <div className="flex justify-between mt-4 text-slate-500 text-sm font-medium">
      <p>Date: {doc.signDate}</p>
      <p>Place: {doc.place}</p>
    </div>
  </div>
)

export const A4Page = ({ children, letterhead = true }: { children: React.ReactNode; letterhead?: boolean }) => (
  <div className="a4-page bg-white w-[210mm] min-h-[297mm] mx-auto p-12 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.15)] mb-16 text-sm text-slate-800 leading-relaxed font-sans border border-slate-200 rounded-sm relative overflow-hidden">
    {letterhead && <DocumentHeader />}
    {children}
    {letterhead && <div className="h-16" />}
    {letterhead && <DocumentFooter />}
  </div>
)

export const FormatTag = ({ children }: { children: React.ReactNode }) => (
  <div className="text-right font-bold underline mb-4">{children}</div>
)

export const DocTitle = ({ children }: { children: React.ReactNode }) => (
  <h2 className="text-center font-bold text-green-600 text-lg mb-6">{children}</h2>
)

export const StampNote = ({ notarised = false }: { notarised?: boolean }) => (
  <p className="text-center italic text-xs mb-8 text-gray-500">
    (To be printed/executed on non-judicial stamp paper of appropriate value
    {notarised ? ' and duly NOTARISED' : ''}.)
  </p>
)

export const WitnessNotary = () => (
  <div className="flex justify-between items-center text-sm border-t border-gray-300 pt-8">
    <p>WITNESSES: 1. ________________ 2. ________________</p>
    <p>NOTARY (Seal & Signature): __________________</p>
  </div>
)
