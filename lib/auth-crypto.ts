/**
 * Secure password hashing using Web Crypto API SHA-256.
 * Zero external dependencies, runs seamlessly in browser and Node.js.
 */

const SALT_PREFIX = 'TENDER_FMS_SECURE_AUTH_2026_'

export async function hashPassword(password: string): Promise<string> {
  if (!password) return ''
  try {
    const encoder = new TextEncoder()
    const data = encoder.encode(`${SALT_PREFIX}${password}`)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  } catch (err) {
    // Fallback simple hash for environments without crypto.subtle
    console.warn('crypto.subtle not available, fallback hashing:', err)
    let hash = 0
    const str = `${SALT_PREFIX}${password}`
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash |= 0
    }
    return `fb_${Math.abs(hash).toString(16)}`
  }
}

export async function verifyPassword(password: string, expectedHash?: string): Promise<boolean> {
  if (!password || !expectedHash) return false
  const calculated = await hashPassword(password)
  return calculated === expectedHash
}
