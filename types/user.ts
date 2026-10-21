export type UserRole =
  | 'Administrator'
  | 'Tender Manager'
  | 'Tender Executive'
  | 'Auditor / Viewer'

export interface AppModule {
  key: string
  name: string
  path: string
  category: 'Overview' | 'Tender Workflow' | 'Documentation' | 'System'
  description: string
}

export const APP_MODULES: AppModule[] = [
  {
    key: 'dashboard',
    name: 'Dashboard',
    path: '/',
    category: 'Overview',
    description: 'Overview metrics, recent tenders, and pipeline statistics',
  },
  {
    key: 'tender-query',
    name: 'Tender Query (AI)',
    path: '/tender-query',
    category: 'Overview',
    description: 'AI tender document analysis, queries, and summaries',
  },
  {
    key: 'tender-details',
    name: '1. Tender Details',
    path: '/tender-details',
    category: 'Tender Workflow',
    description: 'NIT creation, basic info, and document parsing',
  },
  {
    key: 'eligibility-check',
    name: '2. Eligibility Check',
    path: '/eligibility-check',
    category: 'Tender Workflow',
    description: 'Turnover, experience, and qualification verification',
  },
  {
    key: 'sample-details',
    name: '3. Sample Details',
    path: '/sample-details',
    category: 'Tender Workflow',
    description: 'MAF letter, test reports, and BIS certificates',
  },
  {
    key: 'emd-ready',
    name: '4. EMD Ready',
    path: '/emd-ready',
    category: 'Tender Workflow',
    description: 'EMD calculation, bank account setup, and UTR tracking',
  },
  {
    key: 'document-ready',
    name: '5. Document Ready',
    path: '/document-ready',
    category: 'Tender Workflow',
    description: 'Master document dossier, affidavits, and annexures',
  },
  {
    key: 'document-upload-in-portal',
    name: '6. Document Upload in portal',
    path: '/document-upload-in-portal',
    category: 'Tender Workflow',
    description: 'Portal uploads, checklists, and acknowledgements',
  },
  {
    key: 'submit-in-website',
    name: '7. Submit in website',
    path: '/submit-in-website',
    category: 'Tender Workflow',
    description: 'Final portal submission verification and history',
  },
  {
    key: 'technical-open-check',
    name: '8. Technical Open Check',
    path: '/technical-open-check',
    category: 'Tender Workflow',
    description: 'Technical bid opening dates, AI extraction, and status',
  },
  {
    key: 'financial-open-check',
    name: '9. Financial Open Check',
    path: '/financial-open-check',
    category: 'Tender Workflow',
    description: 'L1/L2 ranking, lowest quote prices, and financial check',
  },
  {
    key: 'negotiation',
    name: '10. Negotiation',
    path: '/negotiation',
    category: 'Tender Workflow',
    description: 'Negotiation status, price revisions, and meeting letters',
  },
  {
    key: 'work-order',
    name: '11. Work Order',
    path: '/work-order',
    category: 'Tender Workflow',
    description: 'Award of contract, BG validity, and performance guarantee',
  },
  {
    key: 'all-documents',
    name: 'All Document',
    path: '/doc1',
    category: 'Documentation',
    description: 'Consolidated document archive and downloads',
  },
  {
    key: 'user-management',
    name: 'User Management',
    path: '/user-management',
    category: 'System',
    description: 'User accounts, role assignment, and page access permissions',
  },
  {
    key: 'settings',
    name: 'Settings',
    path: '/settings',
    category: 'System',
    description: 'Company master documents, dropdowns, and bank accounts',
  },
]

export interface AppUser {
  id: string
  username: string
  passwordHash?: string
  passwordPlain?: string
  mobileNumber?: string
  email?: string
  pageAccess: string[] // List of paths, e.g. ['/', '/tender-details', '/eligibility-check']
  role: UserRole
  isActive: boolean
  isPrimaryAdmin?: boolean
  createdAt: string
  updatedAt?: string
}

export interface UserFormData {
  username: string
  password?: string
  passwordPlain?: string
  mobileNumber?: string
  email?: string
  pageAccess: string[]
  role: UserRole
  isActive: boolean
}

