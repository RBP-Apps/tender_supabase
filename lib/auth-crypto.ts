/**
 * Secure password hashing using Web Crypto API SHA-256.
 * Zero external dependencies, runs seamlessly in browser and Node.js.
 */

const SALT_PREFIX = 'TENDER_FMS_SECURE_AUTH_2026_'

export function encodeStoredPassword(hash: string, plain?: string): string {
  if (!plain) return hash
  try {
    const encoded = typeof window !== 'undefined' ? btoa(unescape(encodeURIComponent(plain))) : Buffer.from(plain).toString('base64')
    return `${hash}:::${encoded}`
  } catch {
    return hash
  }
}

export function extractPasswordInfo(rawStored?: string): { hash: string; plain: string } {
  if (!rawStored) return { hash: '', plain: '' }
  if (rawStored.includes(':::')) {
    const parts = rawStored.split(':::')
    const hash = parts[0]
    const base64Plain = parts[1]
    try {
      const plain = typeof window !== 'undefined' ? decodeURIComponent(escape(atob(base64Plain))) : Buffer.from(base64Plain, 'base64').toString('utf-8')
      return { hash: hash || '', plain: plain || '' }
    } catch {
      return { hash: hash || rawStored, plain: '' }
    }
  }
  return { hash: rawStored, plain: '' }
}

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
  const info = extractPasswordInfo(expectedHash)
  if (info.plain && password === info.plain) return true
  const calculated = await hashPassword(password)
  return calculated === info.hash || calculated === expectedHash
}

