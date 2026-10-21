const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://vypmvumfxzxvhtqcbmuv.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ5cG12dW1meHp4dmh0cWNibXV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwMzk4OTAsImV4cCI6MjEwNzYxNTg5MH0.iaYFJ05l7DNfGZbttyS2fkdlgfSG9dcIPnk-U_LKrMg';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function test() {
  const { data, error } = await supabase
    .from('tenders')
    .select(`
      *,
      tender_bid_details (*),
      tender_packages (*),
      tender_technical_components (*),
      tender_corrigenda (
        *,
        tender_corrigendum_changes (*)
      ),
      stage_01_eligibility_check (*),
      stage_02_sample_details (*),
      sample_details_history (*),
      stage_03_emd_ready (*),
      emd_ready_history (*),
      stage_04_document_ready (*),
      stage_05_portal_upload (*),
      portal_upload_documents (*),
      portal_upload_history (*)
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('ERROR:', error);
  } else {
    console.log('SUCCESS! Number of tenders returned:', data.length);
    console.log('First Tender:', data[0].id, data[0].title);
    console.log('Stage 01 Eligibility Check:', JSON.stringify(data[0].stage_01_eligibility_check, null, 2));
  }
}
test();
