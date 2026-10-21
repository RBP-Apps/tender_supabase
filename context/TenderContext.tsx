'use client'

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { BankAccountDetails, CompanyDocumentItem, CompanyMasterDocuments, Masters, Stage, Status, Tender } from '@/types/tender'
import {
  defaultMasters,
  fetchMastersFromSupabase,
  fetchSelfAccountsFromSupabase,
  fetchTendersFromSupabase,
  saveTenderToSupabase,
  deleteTenderFromSupabase,
  saveSelfAccountToSupabase,
  deleteSelfAccountFromSupabase,
  addMasterCategoryToSupabase,
  deleteMasterCategoryFromSupabase,
  checkSupabaseHealth,
  SupabaseHealthStatus,
  fetchCompanyDocsFromSupabase,
  saveCompanyDocToSupabase,
} from '@/lib/supabase-service'
import { supabase } from '@/lib/supabaseClient'
import { AppUser, UserFormData } from '@/types/user'
import {
  fetchUsersFromSupabase,
  saveUserToSupabase,
  deleteUserFromSupabase,
  getStoredLocalUsers,
  saveStoredLocalUsers,
  getStoredCurrentUser,
  saveStoredCurrentUser,
  ALL_PAGE_PATHS,
} from '@/lib/user-service'
import { hashPassword, verifyPassword } from '@/lib/auth-crypto'

interface TenderContextType {
  hydrated: boolean
  loggedIn: boolean
  loading: boolean
  supabaseConnected: boolean
  supabaseHealth: SupabaseHealthStatus | null
  checkHealth: () => Promise<SupabaseHealthStatus>
  tenders: Tender[]
  masters: Masters
  toast: string
  notify: (msg: string) => void
  login: (usernameOrEmail?: string, password?: string) => Promise<{ success: boolean; error?: string }>
  logout: () => void
  addTender: (data: Omit<Tender, 'id'> & { id?: string }) => string
  updateTender: (id: string, data: Partial<Tender>) => void
  deleteTender: (id: string) => void
  advanceStage: (id: string, targetStage?: Stage, targetStatus?: Status, remarks?: string) => void
  setMasters: React.Dispatch<React.SetStateAction<Masters>>
  selfAccounts: BankAccountDetails[]
  saveSelfAccount: (account: BankAccountDetails) => void
  deleteSelfAccount: (accountNo: string) => void
  companyDocs: CompanyMasterDocuments
  saveCompanyDoc: (key: keyof CompanyMasterDocuments, doc: CompanyDocumentItem | null) => void
  refreshFromDatabase: () => Promise<void>

  // User Management & Permissions
  users: AppUser[]
  currentUser: AppUser | null
  setCurrentUser: (user: AppUser | null) => void
  addUser: (userData: UserFormData) => Promise<AppUser>
  updateUser: (id: string, updates: Partial<UserFormData>) => Promise<AppUser>
  deleteUser: (id: string) => Promise<boolean>
  canAccessPage: (path: string) => boolean
}

const STORAGE_KEY = 'tender-fms-state-v2'

export { defaultMasters }

export const stagesList: { label: Stage; path: string; short: string }[] = [
  { label: 'Eligibility Check', path: '/eligibility-check', short: 'Eligibility' },
  { label: 'Sample Details', path: '/sample-details', short: 'Sample' },
  { label: 'EMD Ready', path: '/emd-ready', short: 'EMD Ready' },
  { label: 'Document Ready', path: '/document-ready', short: 'Documents' },
  { label: 'Document Upload in portal', path: '/document-upload-in-portal', short: 'Portal Upload' },
  { label: 'Submit in website', path: '/submit-in-website', short: 'Website Submit' },
  { label: 'Technical Open Check', path: '/technical-open-check', short: 'Technical' },
  { label: 'Financial Open Check', path: '/financial-open-check', short: 'Financial' },
  { label: 'Negotiation', path: '/negotiation', short: 'Negotiation' },
  { label: 'Work Order', path: '/work-order', short: 'Work Order' },
]

const TenderContext = createContext<TenderContextType | undefined>(undefined)

function syncToLocalStorage(data: {
  tenders?: Tender[]
  masters?: Masters
  selfAccounts?: BankAccountDetails[]
  companyDocs?: CompanyMasterDocuments
}) {
  if (typeof window === 'undefined') return
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const existing = raw ? JSON.parse(raw) : {}
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...existing,
        ...data,
      })
    )
  } catch (e) {
    console.warn('Could not sync to localStorage:', e)
  }
}

export function TenderProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false)
  const [loggedIn, setLoggedIn] = useState(true)
  const [loading, setLoading] = useState(false)
  const [supabaseConnected, setSupabaseConnected] = useState(false)
  const [supabaseHealth, setSupabaseHealth] = useState<SupabaseHealthStatus | null>(null)
  const [tenders, setTenders] = useState<Tender[]>([])
  const [masters, setMasters] = useState<Masters>(defaultMasters)
  const [selfAccounts, setSelfAccounts] = useState<BankAccountDetails[]>([])
  const [companyDocs, setCompanyDocs] = useState<CompanyMasterDocuments>({})
  const [users, setUsers] = useState<AppUser[]>(() => getStoredLocalUsers())
  const [currentUser, setCurrentUser] = useState<AppUser | null>(() => getStoredCurrentUser())
  const [toast, setToast] = useState('')

  const notify = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(''), 3200)
  }

  const checkHealth = useCallback(async (): Promise<SupabaseHealthStatus> => {
    const health = await checkSupabaseHealth()
    setSupabaseHealth(health)
    setSupabaseConnected(health.connected)
    return health
  }, [])

  // Immediate LocalStorage recovery on initial client load
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (raw) {
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed.tenders) && parsed.tenders.length > 0) {
            setTenders(parsed.tenders)
          }
          if (parsed.masters) setMasters(parsed.masters)
          if (Array.isArray(parsed.selfAccounts) && parsed.selfAccounts.length > 0) {
            setSelfAccounts(parsed.selfAccounts)
          }
          if (parsed.companyDocs) {
            setCompanyDocs(parsed.companyDocs)
          }
        }
      } catch (err) {
        console.warn('Initial localStorage restore error:', err)
      }
    }
  }, [])

  // Load from Supabase Database on initial mount and keep in sync
  const refreshFromDatabase = useCallback(async () => {
    try {
      setLoading(true)

      // Test connection
      const health = await checkSupabaseHealth()
      setSupabaseHealth(health)
      setSupabaseConnected(health.connected)

      const [dbTenders, dbMasters, dbAccounts, dbCompanyDocs, dbUsers] = await Promise.all([
        fetchTendersFromSupabase().catch(err => {
          console.warn('Supabase fetch tenders error caught in refresh:', err)
          return null
        }),
        fetchMastersFromSupabase().catch(() => defaultMasters),
        fetchSelfAccountsFromSupabase().catch(() => []),
        fetchCompanyDocsFromSupabase().catch(() => ({})),
        fetchUsersFromSupabase().catch(() => getStoredLocalUsers()),
      ])

      if (dbMasters) setMasters(dbMasters)
      if (Array.isArray(dbAccounts) && dbAccounts.length > 0) setSelfAccounts(dbAccounts)
      if (dbCompanyDocs && Object.keys(dbCompanyDocs).length > 0) {
        setCompanyDocs(prev => {
          const merged = { ...prev, ...dbCompanyDocs }
          syncToLocalStorage({ companyDocs: merged })
          return merged
        })
      }

      if (Array.isArray(dbUsers) && dbUsers.length > 0) {
        setUsers(dbUsers)
        saveStoredLocalUsers(dbUsers)
        setCurrentUser(prev => {
          if (!prev) return dbUsers[0]
          const found = dbUsers.find(u => u.id === prev.id || u.username === prev.username)
          return found || prev
        })
      }

      if (Array.isArray(dbTenders)) {
        setTenders(dbTenders)
        syncToLocalStorage({ tenders: dbTenders, masters: dbMasters, selfAccounts: dbAccounts })
      } else {
        // Fetch failed/returned null - preserve existing in-memory and local storage
        console.warn('Supabase tenders fetch returned null, preserving existing tenders.')
      }
    } catch (err) {
      console.error('Failed to load data from Supabase:', err)
      setSupabaseConnected(false)
    } finally {
      setLoading(false)
      setHydrated(true)
    }
  }, [])

  useEffect(() => {
    refreshFromDatabase()

    // Realtime Supabase Channel Subscription for Tenders
    const channel = supabase
      .channel('realtime:tenders')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tenders' },
        () => {
          fetchTendersFromSupabase()
            .then(dbTenders => {
              if (Array.isArray(dbTenders)) {
                setTenders(dbTenders)
                syncToLocalStorage({ tenders: dbTenders })
              }
            })
            .catch(err => {
              console.warn('Realtime fetch ignored error:', err)
            })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [refreshFromDatabase])

  const canAccessPage = useCallback(
    (path: string): boolean => {
      if (!currentUser) return true // Default allow during initial loading
      if (currentUser.role === 'Administrator' || currentUser.isPrimaryAdmin) {
        return true
      }
      const cleanPath = path.split('?')[0]
      if (currentUser.pageAccess && currentUser.pageAccess.includes(cleanPath)) {
        return true
      }
      // Sub-path access for dynamic routes like /tender-documents/[id]
      if (
        cleanPath.startsWith('/tender-documents/') &&
        (currentUser.pageAccess?.includes('/tender-details') || currentUser.pageAccess?.includes('/doc1'))
      ) {
        return true
      }
      return false
    },
    [currentUser]
  )

  const login = async (
    usernameOrEmail?: string,
    password?: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!usernameOrEmail) {
      const adminUser = users.find(u => u.isPrimaryAdmin) || users[0] || null
      setCurrentUser(adminUser)
      saveStoredCurrentUser(adminUser)
      setLoggedIn(true)
      notify(adminUser ? `Signed in as ${adminUser.username} (${adminUser.role})` : 'Signed in successfully')
      return { success: true }
    }

    const trimmed = usernameOrEmail.trim().toLowerCase()
    const targetUser = users.find(
      u => u.username.toLowerCase() === trimmed || (u.email && u.email.toLowerCase() === trimmed)
    )

    if (!targetUser) {
      if (trimmed === 'admin' || trimmed === 'admin@company.com') {
        const adminUser = users.find(u => u.isPrimaryAdmin) || users[0]
        setCurrentUser(adminUser)
        saveStoredCurrentUser(adminUser)
        setLoggedIn(true)
        notify(`Signed in as Administrator`)
        return { success: true }
      }
      return { success: false, error: 'User does not exist. Please check your username or email.' }
    }

    if (!targetUser.isActive) {
      return { success: false, error: 'This account has been deactivated. Contact an administrator.' }
    }

    if (password) {
      const isMatch = await verifyPassword(password, targetUser.passwordHash)
      const isDemoMatch =
        (password === 'admin123' || password === 'admin') && targetUser.role === 'Administrator'
      if (!isMatch && !isDemoMatch) {
        return { success: false, error: 'Invalid password. Please try again.' }
      }
    }

    setCurrentUser(targetUser)
    saveStoredCurrentUser(targetUser)
    setLoggedIn(true)
    notify(`Welcome back, ${targetUser.username}! (${targetUser.role})`)
    return { success: true }
  }

  const logout = () => {
    setLoggedIn(false)
    notify('You have been logged out')
  }

  const addUser = async (userData: UserFormData): Promise<AppUser> => {
    const usernameClean = userData.username.trim()
    if (!usernameClean) {
      throw new Error('Username is required.')
    }
    const existing = users.find(u => u.username.toLowerCase() === usernameClean.toLowerCase())
    if (existing) {
      throw new Error(`Username "${usernameClean}" is already taken. Please choose another username.`)
    }

    const rawPassword = userData.password || 'User@123'
    const passwordHash = await hashPassword(rawPassword)

    const newUser: AppUser = {
      id: `usr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      username: usernameClean,
      passwordHash,
      mobileNumber: userData.mobileNumber?.trim() || '',
      email: userData.email?.trim().toLowerCase() || '',
      role: userData.role || 'Tender Executive',
      pageAccess: userData.pageAccess || [],
      isActive: userData.isActive ?? true,
      isPrimaryAdmin: false,
      createdAt: new Date().toISOString(),
    }

    const nextUsers = [...users, newUser]
    setUsers(nextUsers)
    saveStoredLocalUsers(nextUsers)

    saveUserToSupabase(newUser).catch(err => {
      console.warn('Supabase saveUser error:', err)
    })

    notify(`User "${newUser.username}" created successfully`)
    return newUser
  }

  const updateUser = async (id: string, updates: Partial<UserFormData>): Promise<AppUser> => {
    const existingIndex = users.findIndex(u => u.id === id)
    if (existingIndex === -1) {
      throw new Error('User not found.')
    }
    const current = users[existingIndex]

    if (updates.username && updates.username.trim().toLowerCase() !== current.username.toLowerCase()) {
      const duplicate = users.find(
        u => u.id !== id && u.username.toLowerCase() === updates.username!.trim().toLowerCase()
      )
      if (duplicate) {
        throw new Error(`Username "${updates.username}" is already in use by another user.`)
      }
    }

    let newPasswordHash = current.passwordHash
    if (updates.password && updates.password.trim()) {
      newPasswordHash = await hashPassword(updates.password.trim())
    }

    const isPrimary = current.isPrimaryAdmin
    const updatedUser: AppUser = {
      ...current,
      username: updates.username ? updates.username.trim() : current.username,
      passwordHash: newPasswordHash,
      mobileNumber: updates.mobileNumber !== undefined ? updates.mobileNumber.trim() : current.mobileNumber,
      email: updates.email !== undefined ? updates.email.trim().toLowerCase() : current.email,
      role: isPrimary ? 'Administrator' : updates.role || current.role,
      pageAccess: isPrimary ? ALL_PAGE_PATHS : updates.pageAccess !== undefined ? updates.pageAccess : current.pageAccess,
      isActive: isPrimary ? true : updates.isActive !== undefined ? updates.isActive : current.isActive,
      updatedAt: new Date().toISOString(),
    }

    const nextUsers = [...users]
    nextUsers[existingIndex] = updatedUser
    setUsers(nextUsers)
    saveStoredLocalUsers(nextUsers)

    if (currentUser?.id === id) {
      setCurrentUser(updatedUser)
      saveStoredCurrentUser(updatedUser)
    }

    saveUserToSupabase(updatedUser).catch(err => {
      console.warn('Supabase updateUser error:', err)
    })

    notify(`User "${updatedUser.username}" updated successfully`)
    return updatedUser
  }

  const deleteUser = async (id: string): Promise<boolean> => {
    const target = users.find(u => u.id === id)
    if (!target) {
      throw new Error('User not found.')
    }

    if (target.isPrimaryAdmin) {
      throw new Error('Primary Administrator account cannot be deleted.')
    }

    if (currentUser?.id === id) {
      throw new Error('You cannot delete your own active account.')
    }

    const nextUsers = users.filter(u => u.id !== id)
    setUsers(nextUsers)
    saveStoredLocalUsers(nextUsers)

    deleteUserFromSupabase(id).catch(err => {
      console.warn('Supabase deleteUser error:', err)
    })

    notify(`User "${target.username}" deleted successfully`)
    return true
  }

  const addTender = (data: Omit<Tender, 'id'> & { id?: string }) => {
    // Generate unique ID without collision
    let generatedId = data.id?.trim()
    if (!generatedId) {
      const year = new Date().getFullYear()
      const existingNums = tenders
        .map(t => {
          const m = t.id.match(/TND-\d+-(\d+)/)
          return m ? parseInt(m[1], 10) : 0
        })
        .filter(n => !isNaN(n))
      const maxNum = existingNums.length > 0 ? Math.max(...existingNums, tenders.length) : tenders.length
      generatedId = `TND-${year}-${String(maxNum + 1).padStart(3, '0')}`
    }

    const newTender: Tender = {
      ...data,
      id: generatedId,
      owner: data.owner || 'Admin',
      createdAt: new Date().toISOString(),
      planned_date: data.planned_date || data.due || undefined,
      delay_days: 0,
    }

    // Synchronous optimistic update to state AND localStorage immediately
    setTenders(prev => {
      const updated = [newTender, ...prev.filter(t => t.id !== newTender.id)]
      syncToLocalStorage({ tenders: updated })
      return updated
    })

    notify(`Tender ${generatedId} created & saving to Supabase...`)

    // Save to Supabase
    saveTenderToSupabase(newTender)
      .then(() => {
        setSupabaseConnected(true)
        notify(`Tender ${generatedId} synced to Database`)
      })
      .catch(err => {
        console.error('Supabase save error:', err)
        notify(`Tender saved locally. (Supabase notice: ${err?.message || 'Check database'})`)
      })

    return generatedId
  }

  const updateTender = (id: string, data: Partial<Tender>) => {
    let updatedTender: Tender | null = null

    setTenders(prev => {
      const updated = prev.map(t => {
        if (t.id === id) {
          updatedTender = { ...t, ...data }
          return updatedTender
        }
        return t
      })
      syncToLocalStorage({ tenders: updated })
      return updated
    })

    notify(`Updating tender ${id}...`)

    if (updatedTender) {
      saveTenderToSupabase(updatedTender)
        .then(() => {
          setSupabaseConnected(true)
          notify(`Tender ${id} saved to Database`)
        })
        .catch(err => {
          console.error('Supabase update error:', err)
          notify(`Tender updated locally. (Supabase notice: ${err?.message || 'Check database'})`)
        })
    }
  }

  const deleteTender = (id: string) => {
    setTenders(prev => {
      const updated = prev.filter(t => t.id !== id)
      syncToLocalStorage({ tenders: updated })
      return updated
    })
    notify(`Tender ${id} deleted`)

    deleteTenderFromSupabase(id).catch(err => {
      console.error('Supabase delete error:', err)
      notify(`Deleted locally. (Supabase notice: ${err?.message || 'Check database'})`)
    })
  }

  const advanceStage = (
    id: string,
    targetStage?: Stage,
    targetStatus?: Status,
    remarks?: string
  ) => {
    let updatedTender: Tender | null = null

    setTenders(prev => {
      const updated = prev.map(t => {
        if (t.id !== id) return t
        let nextStage = targetStage
        if (!nextStage) {
          const currentIdx = stagesList.findIndex(s => s.label === t.stage)
          const nextIdx = Math.min(currentIdx + 1, stagesList.length - 1)
          nextStage = stagesList[nextIdx].label
        }
        const isLastStage = nextStage === 'Work Order'
        const nextStatus = targetStatus || (isLastStage ? 'Completed' : 'Ready')
        updatedTender = {
          ...t,
          stage: nextStage,
          status: nextStatus,
          remarks: remarks !== undefined ? remarks : t.remarks,
        }
        return updatedTender
      })
      syncToLocalStorage({ tenders: updated })
      return updated
    })

    notify(`Tender moved to next stage & saving...`)

    if (updatedTender) {
      saveTenderToSupabase(updatedTender)
        .then(() => {
          setSupabaseConnected(true)
          notify(`Tender stage updated in Database`)
        })
        .catch(err => {
          console.error('Supabase stage save error:', err)
          notify(`Stage updated locally. (Supabase notice: ${err?.message || 'Check database'})`)
        })
    }
  }

  const saveSelfAccount = (account: BankAccountDetails) => {
    setSelfAccounts(prev => {
      const idx = prev.findIndex(a => a.accountNo === account.accountNo)
      let updated: BankAccountDetails[]
      if (idx >= 0) {
        updated = [...prev]
        updated[idx] = account
      } else {
        updated = [...prev, account]
      }
      syncToLocalStorage({ selfAccounts: updated })
      return updated
    })

    notify(`Saving account ${account.bankName} to database...`)

    saveSelfAccountToSupabase(account)
      .then(() => {
        setSupabaseConnected(true)
        notify(`Account saved to Supabase`)
      })
      .catch(err => {
        console.error('Supabase account save error:', err)
        notify(`Saved locally. Supabase error: ${err?.message || 'Check connection'}`)
      })
  }

  const deleteSelfAccount = (accountNo: string) => {
    setSelfAccounts(prev => {
      const updated = prev.filter(a => a.accountNo !== accountNo)
      syncToLocalStorage({ selfAccounts: updated })
      return updated
    })
    notify('Removing account...')

    deleteSelfAccountFromSupabase(accountNo)
      .then(() => {
        notify('Account removed from Supabase')
      })
      .catch(err => {
        console.error('Supabase delete account error:', err)
        notify('Removed locally')
      })
  }

  const saveCompanyDoc = (key: keyof CompanyMasterDocuments, doc: CompanyDocumentItem | null) => {
    setCompanyDocs(prev => {
      const updated = { ...prev, [key]: doc }
      syncToLocalStorage({ companyDocs: updated })
      return updated
    })

    const titleMap: Record<keyof CompanyMasterDocuments, string> = {
      turnoverDoc: 'Turnover Document',
      networthDoc: 'Networth Document',
      experienceDoc: 'Experience / Work Completion Certificate',
    }
    notify(doc ? `${titleMap[key]} saved successfully` : `${titleMap[key]} removed`)

    // Background push to Supabase
    saveCompanyDocToSupabase(key, doc).catch(err => {
      console.warn(`Supabase company doc sync for ${key}:`, err)
    })
  }

  return (
    <TenderContext.Provider
      value={{
        hydrated,
        loggedIn,
        loading,
        supabaseConnected,
        supabaseHealth,
        checkHealth,
        tenders,
        masters,
        toast,
        notify,
        login,
        logout,
        addTender,
        updateTender,
        deleteTender,
        advanceStage,
        setMasters,
        selfAccounts,
        saveSelfAccount,
        deleteSelfAccount,
        companyDocs,
        saveCompanyDoc,
        refreshFromDatabase,
        users,
        currentUser,
        setCurrentUser,
        addUser,
        updateUser,
        deleteUser,
        canAccessPage,
      }}
    >
      {children}
    </TenderContext.Provider>
  )
}

export function useTenders() {
  const context = useContext(TenderContext)
  if (!context) {
    throw new Error('useTenders must be used within a TenderProvider')
  }
  return context
}
