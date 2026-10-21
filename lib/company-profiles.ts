export interface CompanyProfile {
  id: string
  name: string
  formerName?: string
  tagline: string
  cin: string
  address: string
  phone: string
  email: string
  website: string
  signatory: string
  signatoryDesignation: string
  pan?: string
  gst?: string
  brandColor: string
  accentColor: string
  logoText: string
  logoType: 'rbp' | 'rotomag' | 'standard'
}

export const COMPANY_PROFILES: CompanyProfile[] = [
  {
    id: 'rbp-energy',
    name: 'RBP ENERGY (INDIA) PVT. LTD.',
    formerName: 'RBP Solar and Infrastructure Projects',
    tagline: 'Powering Sustainable Future · Renewable Energy & Turnkey Solutions',
    cin: 'U40106GJ2020PTC115890',
    address: '2102/3 & 4, GIDC Estate, Vitthal Udyognagar, Anand – 388 121, Gujarat, India',
    phone: '+91 9227110023 / 24',
    email: 'info@rbpenergy.com',
    website: 'www.rbpenergy.com',
    signatory: 'Mr. Anirudha Singh',
    signatoryDesignation: 'Authorised Signatory',
    pan: 'AABCR1234F',
    gst: '24AABCR1234F1Z8',
    brandColor: '#0284c7', // Sky-600
    accentColor: '#10b981', // Emerald-500
    logoText: 'RBP',
    logoType: 'rbp',
  },
  {
    id: 'rotomag-enertec',
    name: 'ROTOMAG ENERTEC LIMITED',
    formerName: 'Rotomag Motors and Controls Pvt. Ltd.',
    tagline: 'water · energy · motion',
    cin: 'U34100GJ1993PLC020063',
    address: '2102/3 & 4, GIDC Estate, Vitthal Udyognagar, Anand – 388 121, Gujarat, India',
    phone: '9227110023/24',
    email: 'mail@rotomag.com',
    website: 'www.rotomag.com',
    signatory: 'Mr. Anirudha Singh',
    signatoryDesignation: 'Authorised Signatory',
    pan: 'AAACR9061K',
    gst: '24AAACR9061K1Z3',
    brandColor: '#15803d', // Green-700
    accentColor: '#84cc16', // Lime-500
    logoText: 'ROTOMAG',
    logoType: 'rotomag',
  },
]

export const DEFAULT_COMPANY = COMPANY_PROFILES[0] // RBP ENERGY (INDIA) PVT. LTD.

export function getCompanyProfile(idOrName?: string): CompanyProfile {
  if (!idOrName) return DEFAULT_COMPANY
  const found = COMPANY_PROFILES.find(
    c =>
      c.id.toLowerCase() === idOrName.toLowerCase() ||
      c.name.toLowerCase().includes(idOrName.toLowerCase()) ||
      idOrName.toLowerCase().includes(c.logoText.toLowerCase())
  )
  return found || DEFAULT_COMPANY
}
