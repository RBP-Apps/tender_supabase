import { supabase } from '@/lib/supabaseClient'
import { AppUser, APP_MODULES } from '@/types/user'
import { hashPassword, verifyPassword, extractPasswordInfo, encodeStoredPassword } from '@/lib/auth-crypto'

export const ALL_PAGE_PATHS = APP_MODULES.map(m => m.path)

// No hardcoded users: users are queried and maintained strictly in Supabase app_users table
export const DEFAULT_USERS: AppUser[] = []

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

  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash || '',
    passwordPlain: pwdInfo.plain || undefined,
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
 */
export async function fetchUsersFromSupabase(): Promise<AppUser[]> {
  try {
    const { data, error } = await supabase
      .from('app_users')
      .select('*')
      .order('created_at', { ascending: true })

    if (error) {
      console.warn('Supabase app_users fetch notice:', error.message)
      return []
    }

    if (data && data.length > 0) {
      return data.map(mapDbRowToAppUser)
    }

    return []
  } catch (err) {
    console.error('fetchUsersFromSupabase exception:', err)
    return []
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
    if (!usernameOrEmail) {
      return { success: false, error: 'Username or email is required.' }
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
      return { success: false, error: 'Database connection error: ' + error.message }
    }

    if (!data || data.length === 0) {
      return { success: false, error: 'User does not exist in database. Please check username or email.' }
    }

    const targetUser = mapDbRowToAppUser(data[0])

    if (!targetUser.isActive) {
      return { success: false, error: 'This user account has been deactivated in the database. Contact an administrator.' }
    }

    if (password) {
      const isMatch = await verifyPassword(password, targetUser.passwordHash)
      if (!isMatch) {
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
  return []
}

export function saveStoredLocalUsers(_users: AppUser[]): void {
  // Purely in-memory: no localStorage write
}

export function getStoredCurrentUser(): AppUser | null {
  return null
}

export function saveStoredCurrentUser(_user: AppUser | null): void {
  // Purely in-memory: no localStorage write
}
