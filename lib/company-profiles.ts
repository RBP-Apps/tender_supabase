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
  {
    id: 'arjun-infra',
    name: 'ARJUN INFRA PVT. LTD.',
    formerName: 'Arjun Civil Engineering Works',
    tagline: 'Excellence in Infrastructure & Engineering Construction',
    cin: 'U45200DL2018PTC334512',
    address: 'Plot No. 45, Okhla Industrial Area, Phase-III, New Delhi – 110020, India',
    phone: '+91 11 41526370',
    email: 'tenders@arjuninfra.com',
    website: 'www.arjuninfra.com',
    signatory: 'Mr. Rajesh Sharma',
    signatoryDesignation: 'Director / Authorised Signatory',
    pan: 'AAACA7890L',
    gst: '07AAACA7890L1ZD',
    brandColor: '#4f46e5', // Indigo-600
    accentColor: '#f59e0b', // Amber-500
    logoText: 'ARJUN',
    logoType: 'standard',
  },
  {
    id: 'sharma-projects',
    name: 'SHARMA PROJECTS & INFRASTRUCTURE',
    tagline: 'Delivering Quality Infrastructure Projects Across India',
    cin: 'U45400MH2016PTC281903',
    address: 'Commerce Center, Bandra-Kurla Complex, Mumbai – 400051, Maharashtra',
    phone: '+91 22 67891234',
    email: 'contact@sharmaprojects.in',
    website: 'www.sharmaprojects.in',
    signatory: 'Mr. Vipin Sharma',
    signatoryDesignation: 'Partner / Authorised Signatory',
    pan: 'AABCS5544R',
    gst: '27AABCS5544R1Z5',
    brandColor: '#0f766e', // Teal-700
    accentColor: '#06b6d4', // Cyan-500
    logoText: 'SHARMA',
    logoType: 'standard',
  },
  {
    id: 'apex-builders',
    name: 'APEX BUILDERS & CONTRACTORS PVT. LTD.',
    tagline: 'Precision Building & Civil Infrastructure Contractors',
    cin: 'U70102GJ2015PTC083421',
    address: 'Apex Tower, S.G. Highway, Ahmedabad – 380054, Gujarat, India',
    phone: '+91 79 26859900',
    email: 'bids@apexbuilders.co.in',
    website: 'www.apexbuilders.co.in',
    signatory: 'Mr. Kamlesh Patel',
    signatoryDesignation: 'Managing Director',
    pan: 'AABCA4321P',
    gst: '24AABCA4321P1Z2',
    brandColor: '#b91c1c', // Red-700
    accentColor: '#f97316', // Orange-500
    logoText: 'APEX',
    logoType: 'standard',
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
