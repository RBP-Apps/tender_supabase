import { supabase } from '@/lib/supabaseClient'

export const BUCKET_NAME = 'tender-documents'

/**
 * Standard folder naming for all 11 stages and master settings
 */
export const STAGE_FOLDERS = {
  // Stage 1: Tender Details / NIT
  STAGE_01_NOTICE: 'stage-01-tender-notice',
  // Stage 2: Eligibility Check
  STAGE_02_ELIGIBILITY: 'stage-02-eligibility',
  // Stage 3: Sample Details
  STAGE_03_SAMPLE: 'stage-03-sample',
  // Stage 4: EMD Ready
  STAGE_04_EMD: 'stage-04-emd',
  // Stage 5: Document Ready / Dossier
  STAGE_05_DOSSIER: 'stage-05-dossier',
  // Stage 6: Portal Upload
  STAGE_06_PORTAL: 'stage-06-portal',
  // Stage 7: Submit in Website
  STAGE_07_SUBMIT_WEBSITE: 'stage-07-submit-website',
  // Stage 8: Technical Open Check
  STAGE_08_TECHNICAL_OPEN: 'stage-08-technical-open',
  // Stage 9: Financial Open Check
  STAGE_09_FINANCIAL_OPEN: 'stage-09-financial-open',
  // Stage 10: Negotiation
  STAGE_10_NEGOTIATION: 'stage-10-negotiation',
  // Stage 11: Work Order
  STAGE_11_WORK_ORDER: 'stage-11-work-order',
  // Company Master Settings (Turnover, Networth, Experience)
  MASTER_SETTINGS: 'master-settings',
} as const

export type StageFolderKey = keyof typeof STAGE_FOLDERS

/**
 * Convert base64 dataUrl string to binary Blob
 */
export function dataUrlToBlob(dataUrl: string): { blob: Blob; mime: string } {
  try {
    const parts = dataUrl.split(',')
    const mimeMatch = parts[0].match(/:(.*?);/)
    const mime = mimeMatch ? mimeMatch[1] : 'application/pdf'
    const bstr = atob(parts[1])
    let n = bstr.length
    const u8arr = new Uint8Array(n)
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n)
    }
    return { blob: new Blob([u8arr], { type: mime }), mime }
  } catch (err) {
    console.warn('dataUrlToBlob parsing fallback:', err)
    return { blob: new Blob([]), mime: 'application/octet-stream' }
  }
}

/**
 * Sanitize filename for Supabase Storage (removes special chars & spaces)
 */
export function sanitizeFileName(name: string): string {
  return name.trim().replace(/[^a-zA-Z0-9._-]/g, '_')
}

export interface UploadResult {
  url: string
  path: string
  storage: 'bucket' | 'base64'
  error?: string
}

/**
 * Upload a file (File, Blob, or DataURL) to Supabase Storage Bucket under the given stage folder.
 * If the bucket upload succeeds, returns the public CDN URL and storage path.
 * If the bucket upload fails (e.g. bucket not yet configured), gracefully returns base64 fallback.
 */
export async function uploadToSupabaseBucket(params: {
  file?: File | Blob
  dataUrl?: string
  fileName: string
  folder: string
  tenderId?: string
}): Promise<UploadResult> {
  const { file, dataUrl, fileName, folder, tenderId } = params

  const cleanName = sanitizeFileName(fileName || 'document.pdf')
  const timestamp = Date.now()
  const cleanTenderId = tenderId ? sanitizeFileName(tenderId) : ''
  const storagePath = cleanTenderId
    ? `${folder}/${cleanTenderId}/${timestamp}_${cleanName}`
    : `${folder}/${timestamp}_${cleanName}`

  let uploadBody: File | Blob | null = null
  let mimeType = 'application/pdf'

  if (file) {
    uploadBody = file
    mimeType = (file as File).type || 'application/pdf'
  } else if (dataUrl && dataUrl.startsWith('data:')) {
    const converted = dataUrlToBlob(dataUrl)
    uploadBody = converted.blob
    mimeType = converted.mime
  }

  if (!uploadBody) {
    return {
      url: dataUrl || '',
      path: storagePath,
      storage: 'base64',
      error: 'No valid file or dataUrl provided',
    }
  }

  try {
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(storagePath, uploadBody, {
        cacheControl: '3600',
        upsert: true,
        contentType: mimeType,
      })

    if (error) {
      console.warn(`Supabase Storage upload error for ${storagePath}:`, error.message)
      // Fallback to dataUrl so app remains operational
      return {
        url: dataUrl || '',
        path: storagePath,
        storage: 'base64',
        error: error.message,
      }
    }

    // Get public URL from bucket
    const { data: publicUrlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(storagePath)

    return {
      url: publicUrlData?.publicUrl || '',
      path: storagePath,
      storage: 'bucket',
    }
  } catch (err: any) {
    console.error(`Supabase bucket upload exception for ${storagePath}:`, err)
    return {
      url: dataUrl || '',
      path: storagePath,
      storage: 'base64',
      error: err?.message || 'Storage upload failed',
    }
  }
}
