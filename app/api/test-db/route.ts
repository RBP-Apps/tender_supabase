import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'
import { fetchTendersFromSupabase, fetchMastersFromSupabase, fetchSelfAccountsFromSupabase } from '@/lib/supabase-service'

export async function GET() {
  const results: Record<string, any> = {}

  try {
    const { data, error } = await supabase.from('tenders').select('id, title, stage, status').limit(5)
    results.tenders = { success: !error, error: error?.message, count: data?.length, sample: data }
  } catch (err: any) {
    results.tenders = { success: false, error: err.message }
  }

  try {
    const { data: buckets, error: bErr } = await supabase.storage.listBuckets()
    results.buckets = { success: !bErr, error: bErr?.message, buckets }

    // Try uploading a small probe file to verify storage write permission
    const { data: uploadData, error: uErr } = await supabase.storage
      .from('tender-documents')
      .upload(`test/ping_${Date.now()}.txt`, 'storage-health-check', {
        contentType: 'text/plain',
        upsert: true,
      })
    results.testUpload = { success: !uErr, error: uErr?.message, uploadData }
    if (!uErr && uploadData?.path) {
      const { data: pUrl } = supabase.storage.from('tender-documents').getPublicUrl(uploadData.path)
      results.publicUrl = pUrl?.publicUrl
    }
  } catch (err: any) {
    results.buckets = { success: false, error: err.message }
  }

  return NextResponse.json(results)
}
