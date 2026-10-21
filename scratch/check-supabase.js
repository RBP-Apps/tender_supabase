const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '..', '.env.local');
const env = fs.readFileSync(envPath, 'utf-8');
const envVars = {};
for (const line of env.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const idx = trimmed.indexOf('=');
  if (idx !== -1) {
    let k = trimmed.substring(0, idx).trim();
    let v = trimmed.substring(idx + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    envVars[k] = v;
  }
}

const url = envVars.NEXT_PUBLIC_SUPABASE_URL;
const key = envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function checkRest() {
  const endpoint = `${url}/rest/v1/tenders?select=*,tender_bid_details(*),stage_01_eligibility_check(*),stage_02_sample_details(*),sample_details_history(*),stage_03_emd_ready(*),emd_ready_history(*),stage_04_document_ready(*),stage_05_portal_upload(*),portal_upload_documents(*),portal_upload_history(*),tender_documents_repository(*)`;
  
  const res = await fetch(endpoint, {
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`
    }
  });

  console.log('REST status:', res.status, res.statusText);
  const data = await res.json();
  if (!res.ok) {
    console.error('REST Error:', data);
  } else {
    console.log('Tenders count in DB:', data.length);
    console.log('Tenders data:', JSON.stringify(data, null, 2));
  }
}

checkRest().catch(console.error);
