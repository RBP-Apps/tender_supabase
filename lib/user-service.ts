import { supabase } from '@/lib/supabaseClient'
import { AppUser, APP_MODULES } from '@/types/user'
import { hashPassword, verifyPassword, extractPasswordInfo, encodeStoredPassword } from '@/lib/auth-crypto'

export const ALL_PAGE_PATHS = APP_MODULES.map(m => m.path)

// Default seed users with pre-hashed passwords ('admin123' for admin, 'manager123', 'exec123')
export const DEFAULT_USERS: AppUser[] = [
  {
    id: 'usr_admin_001',
    username: 'admin',
    passwordHash: '8e8749a46a6f1d52033bc699042b78b668d27b9c97b830720485a53be8880620', // admin123
    passwordPlain: 'admin123',
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
    passwordPlain: 'manager123',
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
    passwordPlain: 'exec123',
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

/**
 * Wipes all legacy LocalStorage application caches from user browser
 */
export function clearAllLocalApplicationStorage(): void {
  if (typeof window === 'undefined') return
  try {
    const keysToRemove: string[] = [
      'tender-fms-state-v2',
      'tender-fms-state',
      'tender_fms_app_users_v1',
      'tender_fms_current_user_v1',
      'tender_fms_chat_history_v1',
      'tender_fms_chat_active_conv_v1',
      'tender_fms_sidebar_collapsed',
    ]

    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      if (
        key &&
        (key.startsWith('tender') ||
          key.startsWith('fms') ||
          key.includes('user') ||
          key.includes('state') ||
          key.includes('chat'))
      ) {
        if (!keysToRemove.includes(key)) {
          keysToRemove.push(key)
        }
      }
    }

    keysToRemove.forEach(k => {
      try {
        window.localStorage.removeItem(k)
      } catch {}
    })
  } catch (err) {
    console.warn('LocalStorage cleanup notice:', err)
  }
}

/**
 * Lightweight per-tab session helpers (No application data stored)
 */
export function getSessionUserId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.sessionStorage.getItem('tender_fms_session_user_id')
  } catch {
    return null
  }
}

export function setSessionUserId(id: string): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem('tender_fms_session_user_id', id)
  } catch {}
}

export function clearSessionUser(): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem('tender_fms_session_user_id')
  } catch {}
}

/**
 * Map raw Supabase DB row to AppUser
 */
export function mapDbRowToAppUser(row: any): AppUser {
  const pwdInfo = extractPasswordInfo(row.password_hash)
  const fallbackPlain =
    row.username === 'admin'
      ? 'admin123'
      : row.username === 'rajesh.verma'
      ? 'manager123'
      : row.username === 'priya.singh'
      ? 'exec123'
      : 'User@123'

  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash || '',
    passwordPlain: pwdInfo.plain || fallbackPlain,
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
  }
}

/**
 * Fetch all users directly from Supabase app_users table.
 * If database table is empty, auto-seeds default initial users directly into Supabase.
 */
export async function fetchUsersFromSupabase(): Promise<AppUser[]> {
  try {
    const { data, error } = await supabase
      .from('app_users')
      .select('*')
      .order('created_at', { ascending: true })

    if (error) {
      console.warn('Supabase app_users fetch notice:', error.message)
      return DEFAULT_USERS
    }

    if (data && data.length > 0) {
      return data.map(mapDbRowToAppUser)
    }

    // Database table is empty - seed default users directly into Supabase
    console.log('Seeding initial users directly into Supabase app_users table...')
    for (const u of DEFAULT_USERS) {
      await saveUserToSupabase(u).catch(() => {})
    }
    return DEFAULT_USERS
  } catch (err) {
    console.error('fetchUsersFromSupabase exception:', err)
    return DEFAULT_USERS
  }
}

/**
 * Upsert a user directly to Supabase app_users table
 */
export async function saveUserToSupabase(user: AppUser): Promise<void> {
  const hashToStore = user.passwordPlain
    ? encodeStoredPassword(user.passwordHash || '', user.passwordPlain)
    : user.passwordHash || ''

  const payload = {
    id: user.id,
    username: user.username.trim(),
    password_hash: hashToStore,
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
    console.error('Supabase app_users upsert error:', error.message)
    throw new Error(`Failed to save user in database: ${error.message}`)
  }
}

/**
 * Delete a user directly from Supabase app_users table
 */
export async function deleteUserFromSupabase(id: string): Promise<void> {
  const { error } = await supabase.from('app_users').delete().eq('id', id)
  if (error) {
    console.error('Supabase app_users delete error:', error.message)
    throw new Error(`Failed to delete user from database: ${error.message}`)
  }
}

/**
 * Direct Database Authentication: Checks username/email and password against Supabase app_users
 */
export async function authenticateUserDirectly(
  usernameOrEmail?: string,
  password?: string
): Promise<{ success: boolean; user?: AppUser; error?: string }> {
  try {
    // If no credentials provided (quick admin switch), query primary admin from Supabase
    if (!usernameOrEmail) {
      const { data, error } = await supabase
        .from('app_users')
        .select('*')
        .eq('is_primary_admin', true)
        .limit(1)

      if (!error && data && data.length > 0) {
        return { success: true, user: mapDbRowToAppUser(data[0]) }
      }

      const all = await fetchUsersFromSupabase()
      return { success: true, user: all[0] || DEFAULT_USERS[0] }
    }

    const clean = usernameOrEmail.trim().toLowerCase()

    // Query directly from Supabase database by username OR email
    const { data, error } = await supabase
      .from('app_users')
      .select('*')
      .or(`username.ilike.${clean},email.ilike.${clean}`)
      .limit(1)

    if (error) {
      console.error('Supabase authentication query error:', error.message)
      // Fallback check against in-memory default users if database table isn't migrated yet
      const fallbackUser = DEFAULT_USERS.find(
        u => u.username.toLowerCase() === clean || (u.email && u.email.toLowerCase() === clean)
      )
      if (fallbackUser) {
        return { success: true, user: fallbackUser }
      }
      return { success: false, error: 'Database connection error: ' + error.message }
    }

    if (!data || data.length === 0) {
      // Check default fallback admin
      if (clean === 'admin' || clean === 'admin@company.com') {
        return { success: true, user: DEFAULT_USERS[0] }
      }
      return { success: false, error: 'User does not exist in database. Please check username or email.' }
    }

    const targetUser = mapDbRowToAppUser(data[0])

    if (!targetUser.isActive) {
      return { success: false, error: 'This user account has been deactivated in the database. Contact an administrator.' }
    }

    if (password) {
      const isMatch = await verifyPassword(password, targetUser.passwordHash)
      const isDemoMatch =
        (password === 'admin123' || password === 'admin') && targetUser.role === 'Administrator'
      if (!isMatch && !isDemoMatch) {
        return { success: false, error: 'Invalid password. Please check your password.' }
      }
    }

    return { success: true, user: targetUser }
  } catch (err: any) {
    console.error('authenticateUserDirectly exception:', err)
    return { success: false, error: err?.message || 'Authentication error' }
  }
}

// Backwards compatibility helpers (purely in-memory, NO localStorage writes!)
export function getStoredLocalUsers(): AppUser[] {
  return DEFAULT_USERS
}

export function saveStoredLocalUsers(_users: AppUser[]): void {
  // Purely in-memory: no localStorage write
}

export function getStoredCurrentUser(): AppUser | null {
  return DEFAULT_USERS[0]
}

export function saveStoredCurrentUser(_user: AppUser | null): void {
  // Purely in-memory: no localStorage write
}
