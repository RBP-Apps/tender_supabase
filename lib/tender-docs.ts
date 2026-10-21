import { Tender, TenderBidDetails } from '@/types/tender'

export const BLANK = '__________'

export const emptyBid = (): TenderBidDetails => ({
  rfsNo: '',
  rfsDate: '',
  corrigendum: '',
  workName: '',
  shortWorkName: '',
  authorityFullName: '',
  addresseeDesignation: '',
  authorityAddress: '',
  bidDeadlineTime: '',
  tenderFeePerPackage: '',
  gstSection: '',
  tenderFeePlusGst: '',
  testReportCompliance: '',
  mafRequirement: '',
  experienceRequirement: '',
  turnoverRequirement: '',
  bidValidityDays: '180',
  financialRequirementCr: '',
  technicalRequirement: '',
  jurisdiction: '',
  signingDate: new Date().toISOString().slice(0, 10),
  place: 'Anand',
  packages: [],
  technicalComponents: [],
  beneficiaryBank: {
    accountHolder: '',
    bankName: '',
    branch: '',
    accountNo: '',
    ifsc: '',
    accountType: '',
  },
})

// A tender with every dynamic field left blank. Used by the /doc1 "blank template"
// preview pages so it's obvious, at a glance, which parts of each document are
// filled in from the tender form / PDF upload (shown as `__________`) versus the
// fixed company letterhead details (name, CIN, signatory, ...) that never change.
export const BLANK_TENDER: Tender = {
  id: 'BLANK-TEMPLATE',
  title: '',
  authority: '',
  department: '',
  state: '',
  value: '',
  stage: 'Document Ready',
  status: 'In Progress',
  due: '',
  owner: 'Admin',
  // emptyBid() picks sensible defaults (today's date, 180-day validity, "Anand")
  // for a brand-new tender form; override those so the preview stays fully blank.
  bid: { ...emptyBid(), bidValidityDays: '', signingDate: '', place: '' },
}

// The original CSPDCL tender the document templates were built from.
// Used by the /doc1 preview pages.
export const SAMPLE_TENDER: Tender = {
  id: 'SAMPLE-CSPDCL',
  title: 'Grid-Connected Rooftop Solar Plants (Residential) — PM-Surya Ghar ULA, EPC (CAPEX)',
  authority: 'CSPDCL',
  department: 'Energy',
  state: 'Chhattisgarh',
  value: '',
  stage: 'Document Ready',
  status: 'In Progress',
  due: '2026-09-10',
  owner: 'Admin',
  bid: {
    rfsNo: 'CSPDCL/NIT/ULA-114.23 MW-/1095',
    rfsDate: '2026-07-14',
    corrigendum: 'Corrigendum-1 dated 03.09.2026',
    workName:
      'Design, Supply, Erection, Testing and Commissioning including Warranty, Comprehensive Operation & Maintenance of ' +
      'Grid-Connected Rooftop Solar Plants of Various Capacities in the Residential Sector under the Utility-Led Aggregation ' +
      '(ULA) Models of PM-Surya Ghar: Muft Bijli Yojana of MNRE under EPC (CAPEX) in the State of Chhattisgarh',
    shortWorkName:
      'Grid-Connected Rooftop Solar Plants (Residential) under PM-Surya Ghar: Muft Bijli Yojana — Utility-Led Aggregation (ULA) Models, EPC (CAPEX), Chhattisgarh',
    authorityFullName: 'Chhattisgarh State Power Distribution Company Limited',
    addresseeDesignation: 'The Executive Director (RA&PM)',
    authorityAddress: '4th Floor, Sewa Bhawan, Danganiya, Raipur – 492013 (C.G.)',
    bidDeadlineTime: '15:00 Hrs.',
    tenderFeePerPackage: '10,000',
    gstSection: '18% GST applicable on tender fee (₹ 1,800). Works contract GST applicable extra as per statutory rates.',
    tenderFeePlusGst: '₹ 11,800 (Base: ₹ 10,000 + 18% GST: ₹ 1,800)',
    testReportCompliance:
      'Type test reports from NABL/BIS accredited laboratories as per IS 14286 / IEC 61215 and IEC 61730-1,2 for Solar PV Modules. Inverter compliance certificates as per IEC 61683 and IEC 60068-2. Valid as on date of bid opening.',
    mafRequirement:
      'Manufacturer Authorization Form (MAF) in prescribed Format-11 from OEM for Solar PV Modules and PCU/Inverter, duly signed and stamped by OEM authorized signatory with warranty commitment.',
    experienceRequirement:
      'Bidder must have installed and commissioned grid-connected solar rooftop plants having cumulative capacity not less than 60,100 kWp or 10,000 installations in government or private sectors in last 5 financial years. Satisfactory commissioning certificates required.',
    turnoverRequirement:
      'Minimum Average Annual Turnover (MAAT) of ₹ 301.00 Crore during last 3 financial years (FY 2021-22, 2022-23, and 2023-24). Audited balance sheets, profit & loss statements, and CA Certificate with UDIN required.',
    bidValidityDays: '180',
    financialRequirementCr: '301.00',
    technicalRequirement: '60,100 kWp OR 10,000 installations',
    jurisdiction: 'Raipur',
    signingDate: '2026-09-09',
    place: 'Anand',
    packages: [
      { code: 'P-1', region: 'Raipur Rural', rfx: '8100052802', emdLakh: '92' },
      { code: 'P-2', region: 'Raipur City', rfx: '8100052825', emdLakh: '24' },
      { code: 'P-3', region: 'Durg', rfx: '8100052828', emdLakh: '81' },
      { code: 'P-4', region: 'Bilaspur', rfx: '8100052832', emdLakh: '96' },
      { code: 'P-5', region: 'Rajnandgaon', rfx: '8100052833', emdLakh: '54' },
      { code: 'P-6', region: 'Raigarh', rfx: '8100052843', emdLakh: '88' },
      { code: 'P-7', region: 'Jagdalpur', rfx: '8100052844', emdLakh: '157' },
    ],
    technicalComponents: [
      { item: 'Solar PV Module', make: 'Premier / Novasys / Alpex / Cosmic', compliance: 'IEC 61215/IS 14286; IEC 61730-1,2 (DCR, ALMM List-I; cells List-II) — Yes' },
      { item: 'Module Mounting Structure', make: 'Varyaa / RBP', compliance: 'Hot-dip Galvanized MS (IS 2062 & IS 4759) — Yes' },
      { item: 'Junction Box', make: 'RBP / Statcon', compliance: 'IP 65 & IEC 62208 — Yes' },
      { item: 'DC Distribution Box (DCDB)', make: 'RBP / Statcon', compliance: 'IP 65 — Yes' },
      { item: 'AC Distribution Box (ACDB)', make: 'RBP / Statcon', compliance: 'IEC/IS 60947 Part I,II,III; IP 65/54 — Yes' },
      { item: 'PCU / Inverter', make: 'Statcon', compliance: 'IEC 61683/IS 61683; IEC 60068-2; QCO 30.08.2017 — Yes' },
      { item: 'Cable', make: 'KEI / Polycab or Equivalent', compliance: 'IEC 60227/IS 694; IEC 60502/IS 1554 — Yes' },
      { item: 'Net / Smart Meter', make: 'By CSPDCL', compliance: 'IS 16444 — Yes' },
      { item: 'Civil Works', make: 'RBP', compliance: 'Relevant IS — Yes' },
    ],
    beneficiaryBank: {
      accountHolder: 'Manager (CAU), CSPDCL, Raipur (C.G.)',
      bankName: 'Punjab National Bank',
      branch: 'Jaistambh Chowk Branch, Raipur (C.G.)',
      accountNo: '0399002100077705',
      ifsc: 'PUNB0039900',
      accountType: 'Current Account',
    },
  },
}

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
]
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function twoDigits(n: number): string {
  if (n < 20) return ONES[n]
  return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : '')
}

function threeDigits(n: number): string {
  const hundreds = Math.floor(n / 100)
  const rest = n % 100
  return [hundreds ? `${ONES[hundreds]} Hundred` : '', rest ? twoDigits(rest) : ''].filter(Boolean).join(' ')
}

// Indian numbering system: 15700000 -> "One Crore Fifty-Seven Lakh"
export function numberToIndianWords(value: number): string {
  const n = Math.round(value)
  if (n === 0) return 'Zero'
  const crore = Math.floor(n / 10000000)
  const lakh = Math.floor((n % 10000000) / 100000)
  const thousand = Math.floor((n % 100000) / 1000)
  const rest = n % 1000
  return [
    crore ? `${numberToIndianWords(crore)} Crore` : '',
    lakh ? `${twoDigits(lakh)} Lakh` : '',
    thousand ? `${twoDigits(thousand)} Thousand` : '',
    rest ? threeDigits(rest) : '',
  ]
    .filter(Boolean)
    .join(' ')
}

export function toNumber(value: string): number {
  const n = parseFloat(String(value ?? '').replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) ? n : 0
}

// "2026-09-09" -> "09.09.2026"
export function formatDocDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '')
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso || BLANK
}

// "2026-09-09" -> "9th day of September 2026"
export function formatDocDateLong(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '')
  if (!m) return iso || BLANK
  const day = Number(m[3])
  const suffix =
    day % 10 === 1 && day !== 11 ? 'st' : day % 10 === 2 && day !== 12 ? 'nd' : day % 10 === 3 && day !== 13 ? 'rd' : 'th'
  const month = new Date(Number(m[1]), Number(m[2]) - 1, 1).toLocaleString('en-IN', { month: 'long' })
  return `${day}${suffix} day of ${month} ${m[1]}`
}

const or = (value: string | undefined) => value?.trim() || BLANK

export interface ResolvedPackage {
  code: string
  region: string
  rfx: string
  emdLakh: number
  amountStr: string
  amountWords: string
}

export type DocData = ReturnType<typeof buildDocData>

// Resolves a tender into every string the document templates print.
export function buildDocData(tender: Tender) {
  const bid = tender.bid ?? emptyBid()

  // Fall back to one blank row so per-package sections (bank guarantees, envelope
  // labels, ...) still print in the correct shape before any package is added.
  const hasPackages = bid.packages.length > 0
  const packages: ResolvedPackage[] = (hasPackages ? bid.packages : [{ code: '', region: '', rfx: '', emdLakh: '' }]).map(p => {
    const emdLakh = toNumber(p.emdLakh)
    const rupees = Math.round(emdLakh * 100000)
    return {
      code: or(p.code),
      region: or(p.region),
      rfx: or(p.rfx),
      emdLakh,
      amountStr: hasPackages ? `${rupees.toLocaleString('en-IN')}/-` : BLANK,
      amountWords: hasPackages ? `${numberToIndianWords(rupees)} only` : BLANK,
    }
  })

  const totalEmdLakh = packages.reduce((sum, p) => sum + p.emdLakh, 0)
  const rfs = `${or(bid.rfsNo)} dated ${formatDocDate(bid.rfsDate)}`
  const corrigendum = bid.corrigendum.trim()

  return {
    tender,
    bid,
    authority: or(tender.authority),
    authorityFullName: or(bid.authorityFullName),
    addressee: or(bid.addresseeDesignation),
    authorityAddress: or(bid.authorityAddress),
    state: or(tender.state),
    rfs,
    rfsFull: corrigendum ? `${rfs} read with ${corrigendum}` : rfs,
    corrigendum,
    workName: or(bid.workName || tender.title),
    shortWorkName: or(bid.shortWorkName || tender.title),
    packages,
    packagesLabel: packages.length
      ? packages.map(p => `${p.code} (${p.region})`).join(', ')
      : BLANK,
    packageCount: packages.length,
    packageRange: packages.length > 1 ? `${packages[0].code} to ${packages[packages.length - 1].code}` : packages[0]?.code ?? BLANK,
    totalEmdLakh: packages.length ? totalEmdLakh.toFixed(2) : BLANK,
    totalEmdCrore: packages.length ? (totalEmdLakh / 100).toFixed(2) : BLANK,
    tenderFee: or(bid.tenderFeePerPackage),
    bidValidityDays: or(bid.bidValidityDays),
    financialRequirementCr: bid.financialRequirementCr.trim(),
    technicalRequirement: bid.technicalRequirement.trim(),
    jurisdiction: or(bid.jurisdiction),
    signDate: formatDocDate(bid.signingDate),
    signDateLong: formatDocDateLong(bid.signingDate),
    place: or(bid.place),
    deadline: [formatDocDate(tender.due), bid.bidDeadlineTime.trim()].filter(Boolean).join(', '),
    bank: bid.beneficiaryBank,
    technicalComponents: bid.technicalComponents.length
      ? bid.technicalComponents.map(c => ({
          item: or(c.item),
          make: (c.make || '').trim() || BLANK,
          compliance: (c.compliance || '').trim() || BLANK,
        }))
      : [{ item: BLANK, make: BLANK, compliance: BLANK }],
  }
}

// Fields that should be filled before the documents are printed.
export function missingDocFields(tender: Tender): string[] {
  const bid = tender.bid
  if (!bid) return ['Tender document details']
  const checks: [string, string][] = [
    ['RfS / Tender No.', bid.rfsNo],
    ['RfS / Tender Date', bid.rfsDate],
    ['Name of Work', bid.workName],
    ['Authority Full Name', bid.authorityFullName],
    ['Addressee Designation', bid.addresseeDesignation],
    ['Authority Address', bid.authorityAddress],
    ['Tender Fee per Package', bid.tenderFeePerPackage],
    ['Jurisdiction', bid.jurisdiction],
    ['Signing Date', bid.signingDate],
  ]
  const missing = checks.filter(([, v]) => !v?.trim()).map(([label]) => label)
  if (!bid.packages.length) missing.push('At least one Package')
  if (bid.packages.some(p => !p.emdLakh.trim())) missing.push('EMD amount for every Package')
  if (!bid.technicalComponents.length) missing.push('Technical Components (Format-12)')
  return missing
}
