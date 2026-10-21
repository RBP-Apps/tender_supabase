import { supabase } from '@/lib/supabaseClient'
import { AppUser, APP_MODULES } from '@/types/user'
import { hashPassword } from '@/lib/auth-crypto'

export const ALL_PAGE_PATHS = APP_MODULES.map(m => m.path)

// Default seed users with pre-hashed passwords ('admin123' for admin, 'manager123', 'exec123')
export const DEFAULT_USERS: AppUser[] = [
  {
    id: 'usr_admin_001',
    username: 'admin',
    passwordHash: '8e8749a46a6f1d52033bc699042b78b668d27b9c97b830720485a53be8880620', // admin123
    mobileNumber: '+91 98765 43210',
    email: 'admin@company.com',
    role: 'Administrator',
    pageAccess: ALL_PAGE_PATHS,
    isActive: true,
    isPrimaryAdmin: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'usr_mgr_002',
    username: 'rajesh.verma',
    passwordHash: 'c4e4cbe778b05615d8525b6a3d90733c7f9ea93e3d484e511470404097f4803d', // manager123
    mobileNumber: '+91 98123 45678',
    email: 'rajesh@company.com',
    role: 'Tender Manager',
    pageAccess: [
      '/',
      '/tender-query',
      '/tender-details',
      '/eligibility-check',
      '/sample-details',
      '/emd-ready',
      '/document-ready',
      '/document-upload-in-portal',
      '/submit-in-website',
      '/technical-open-check',
      '/financial-open-check',
      '/negotiation',
      '/work-order',
      '/doc1',
    ],
    isActive: true,
    createdAt: '2026-02-15T09:30:00.000Z',
  },
  {
    id: 'usr_exec_003',
    username: 'priya.singh',
    passwordHash: 'f41753c150b001cbe6520ab3ec8fefcfca8df20b22a075306ec78465fc950ea6', // exec123
    mobileNumber: '+91 98234 56789',
    email: 'priya@company.com',
    role: 'Tender Executive',
    pageAccess: [
      '/',
      '/tender-details',
      '/eligibility-check',
      '/sample-details',
      '/emd-ready',
      '/document-ready',
      '/document-upload-in-portal',
      '/doc1',
    ],
    isActive: true,
    createdAt: '2026-03-01T10:15:00.000Z',
  },
]

export const USERS_STORAGE_KEY = 'tender_fms_app_users_v1'
export const CURRENT_USER_STORAGE_KEY = 'tender_fms_current_user_v1'

/**
 * Fetch users from Supabase or fallback to LocalStorage/Default
 */
export async function fetchUsersFromSupabase(): Promise<AppUser[]> {
  try {
    const { data, error } = await supabase
      .from('app_users')
      .select('*')
      .order('created_at', { ascending: true })

    if (error) {
      console.warn('Could not fetch app_users from Supabase (using local/defaults):', error.message)
      return getStoredLocalUsers()
    }

    if (data && data.length > 0) {
      const mapped: AppUser[] = data.map((row: any) => ({
        id: row.id,
        username: row.username,
        passwordHash: row.password_hash,
        mobileNumber: row.mobile_number || '',
        email: row.email || '',
        role: row.role || 'Tender Executive',
        pageAccess: Array.isArray(row.page_access)
          ? row.page_access
          : typeof row.page_access === 'string'
          ? JSON.parse(row.page_access)
          : ALL_PAGE_PATHS,
        isActive: row.is_active ?? true,
        isPrimaryAdmin: row.is_primary_admin ?? false,
        createdAt: row.created_at || new Date().toISOString(),
        updatedAt: row.updated_at || undefined,
      }))
      saveStoredLocalUsers(mapped)
      return mapped
    }

    // Table is empty, seed defaults to Supabase and return
    const defaults = getStoredLocalUsers()
    for (const u of defaults) {
      await saveUserToSupabase(u).catch(() => {})
    }
    return defaults
  } catch (err) {
    console.error('fetchUsersFromSupabase exception:', err)
    return getStoredLocalUsers()
  }
}

/**
 * Upsert a user to Supabase app_users table
 */
export async function saveUserToSupabase(user: AppUser): Promise<void> {
  try {
    const payload = {
      id: user.id,
      username: user.username.trim(),
      password_hash: user.passwordHash || '',
      mobile_number: user.mobileNumber ? user.mobileNumber.trim() : null,
      email: user.email ? user.email.trim().toLowerCase() : null,
      role: user.role,
      page_access: user.pageAccess || [],
      is_active: user.isActive,
      is_primary_admin: user.isPrimaryAdmin || false,
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase.from('app_users').upsert(payload, { onConflict: 'id' })
    if (error) {
      console.warn('Supabase app_users upsert notice:', error.message)
    }
  } catch (err) {
    console.error('saveUserToSupabase exception:', err)
  }
}

/**
 * Delete a user from Supabase app_users table
 */
export async function deleteUserFromSupabase(id: string): Promise<void> {
  try {
    const { error } = await supabase.from('app_users').delete().eq('id', id)
    if (error) {
      console.warn('Supabase app_users delete notice:', error.message)
    }
  } catch (err) {
    console.error('deleteUserFromSupabase exception:', err)
  }
}

export function getStoredLocalUsers(): AppUser[] {
  if (typeof window === 'undefined') return DEFAULT_USERS
  try {
    const raw = window.localStorage.getItem(USERS_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
      }
    }
  } catch {}
  return DEFAULT_USERS
}

export function saveStoredLocalUsers(users: AppUser[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users))
  } catch (e) {
    console.warn('Could not save users to local storage:', e)
  }
}

export function getStoredCurrentUser(): AppUser | null {
  if (typeof window === 'undefined') return DEFAULT_USERS[0]
  try {
    const raw = window.localStorage.getItem(CURRENT_USER_STORAGE_KEY)
    if (raw) {
      return JSON.parse(raw)
    }
  } catch {}
  return DEFAULT_USERS[0]
}

export function saveStoredCurrentUser(user: AppUser | null): void {
  if (typeof window === 'undefined') return
  try {
    if (user) {
      window.localStorage.setItem(CURRENT_USER_STORAGE_KEY, JSON.stringify(user))
    } else {
      window.localStorage.removeItem(CURRENT_USER_STORAGE_KEY)
    }
  } catch {}
}
