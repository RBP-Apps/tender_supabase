import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function dataUrlToBlobUrl(dataUrl: string): string {
  try {
    if (!dataUrl || !dataUrl.startsWith('data:')) return dataUrl
    const parts = dataUrl.split(',')
    if (parts.length < 2) return dataUrl
    const mime = parts[0].match(/:(.*?);/)?.[1] || 'application/pdf'
    const binary = atob(parts[1])
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    const blob = new Blob([bytes], { type: mime })
    return URL.createObjectURL(blob)
  } catch (err) {
    console.warn('Could not convert dataUrl to Blob URL:', err)
    return dataUrl
  }
}
