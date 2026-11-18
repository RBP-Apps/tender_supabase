-- ====================================================================
-- COMPREHENSIVE SUPABASE DATABASE MIGRATION SCRIPT
-- Direct Database Connection & Full Schema Synchronization for Tender FMS
-- Safe, Idempotent, and Non-Destructive (can be run multiple times safely)
-- ====================================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ====================================================================
-- 2. TENDERS & TENDER_BID_DETAILS: Core & AI Auto-fill Columns
-- ====================================================================

ALTER TABLE tenders 
  ADD COLUMN IF NOT EXISTS tender_doc JSONB,
  ADD COLUMN IF NOT EXISTS corrigenda JSONB,
  ADD COLUMN IF NOT EXISTS gst_section TEXT,
  ADD COLUMN IF NOT EXISTS tender_fee_plus_gst VARCHAR(255),
  ADD COLUMN IF NOT EXISTS test_report_compliance TEXT,
  ADD COLUMN IF NOT EXISTS maf_requirement TEXT,
  ADD COLUMN IF NOT EXISTS experience_requirement TEXT,
  ADD COLUMN IF NOT EXISTS turnover_requirement TEXT,
  ADD COLUMN IF NOT EXISTS ai_metadata JSONB,
  ADD COLUMN IF NOT EXISTS planned_date DATE,
  ADD COLUMN IF NOT EXISTS actual_date DATE,
  ADD COLUMN IF NOT EXISTS delay_days INT DEFAULT 0;

ALTER TABLE tender_bid_details 
  ADD COLUMN IF NOT EXISTS tender_doc JSONB,
  ADD COLUMN IF NOT EXISTS gst_section TEXT,
  ADD COLUMN IF NOT EXISTS tender_fee_plus_gst VARCHAR(255),
  ADD COLUMN IF NOT EXISTS test_report_compliance TEXT,
  ADD COLUMN IF NOT EXISTS maf_requirement TEXT,
  ADD COLUMN IF NOT EXISTS experience_requirement TEXT,
  ADD COLUMN IF NOT EXISTS turnover_requirement TEXT;

-- ====================================================================
-- 3. STAGE 01: ELIGIBILITY CHECK (AI Verification & Other Docs Columns)
-- ====================================================================

CREATE TABLE IF NOT EXISTS stage_01_eligibility_check (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id VARCHAR(100) NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  turnover_doc JSONB,
  experience_doc JSONB,
  vendor_reg_doc JSONB,
  other_doc JSONB,
  other_docs JSONB DEFAULT '[]'::jsonb,
  checklist_items JSONB DEFAULT '[]'::jsonb,
  ai_verification JSONB,
  remarks TEXT,
  completed_by VARCHAR(100),
  completed_at TIMESTAMPTZ,
  planned_date DATE,
  actual_date DATE,
  delay_days INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tender_id)
);

-- Ensure columns exist if table was already created
ALTER TABLE stage_01_eligibility_check 
  ADD COLUMN IF NOT EXISTS ai_verification JSONB,
  ADD COLUMN IF NOT EXISTS other_docs JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS checklist_items JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS actual_date DATE,
  ADD COLUMN IF NOT EXISTS planned_date DATE,
  ADD COLUMN IF NOT EXISTS delay_days INT DEFAULT 0;

COMMENT ON COLUMN stage_01_eligibility_check.ai_verification IS 'AI-based tender document eligibility verification result, status (Eligible / Not Eligible), and criteria breakdown';
COMMENT ON COLUMN stage_01_eligibility_check.other_docs IS 'List of supporting eligibility documents attached by bidder';

-- ====================================================================
-- 4. STAGE 02: SAMPLE DETAILS (AI Requirements Audit & History)
-- ====================================================================

CREATE TABLE IF NOT EXISTS stage_02_sample_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id VARCHAR(100) NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  maf_letter JSONB,
  test_report JSONB,
  bis_certificate JSONB,
  product_sample JSONB,
  other_docs JSONB DEFAULT '[]'::jsonb,
  ai_requirements_audit JSONB,
  remarks TEXT,
  completed_by VARCHAR(100),
  completed_at TIMESTAMPTZ,
  planned_date DATE,
  actual_date DATE,
  delay_days INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tender_id)
);

ALTER TABLE stage_02_sample_details 
  ADD COLUMN IF NOT EXISTS ai_requirements_audit JSONB,
  ADD COLUMN IF NOT EXISTS other_docs JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS actual_date DATE,
  ADD COLUMN IF NOT EXISTS planned_date DATE,
  ADD COLUMN IF NOT EXISTS delay_days INT DEFAULT 0;

COMMENT ON COLUMN stage_02_sample_details.ai_requirements_audit IS 'AI evidence-based audit for MAF Letter, Test Report, BIS Certificate, and Product Sample';

CREATE TABLE IF NOT EXISTS sample_details_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id VARCHAR(100) NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  submitted_by VARCHAR(100),
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  maf_letter JSONB,
  test_report JSONB,
  bis_certificate JSONB,
  product_sample JSONB,
  other_docs JSONB DEFAULT '[]'::jsonb,
  remarks TEXT,
  previous_stage VARCHAR(100),
  advanced_to_stage VARCHAR(100),
  update_summary TEXT
);

-- ====================================================================
-- 5. STAGE 03: EMD READY & HISTORY
-- ====================================================================

CREATE TABLE IF NOT EXISTS stage_03_emd_ready (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id VARCHAR(100) NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  amount VARCHAR(100) NOT NULL,
  amount_source VARCHAR(100),
  dept_bank_name VARCHAR(255),
  dept_account_holder VARCHAR(255),
  dept_account_no VARCHAR(100),
  dept_ifsc VARCHAR(50),
  dept_branch VARCHAR(255),
  self_bank_name VARCHAR(255),
  self_account_holder VARCHAR(255),
  self_account_no VARCHAR(100),
  self_ifsc VARCHAR(50),
  self_branch VARCHAR(255),
  utr_number VARCHAR(100),
  payment_date DATE,
  payment_proof_doc JSONB,
  remarks TEXT,
  completed_by VARCHAR(100),
  completed_at TIMESTAMPTZ,
  planned_date DATE,
  actual_date DATE,
  delay_days INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tender_id)
);

ALTER TABLE stage_03_emd_ready
  ADD COLUMN IF NOT EXISTS payment_proof_doc JSONB,
  ADD COLUMN IF NOT EXISTS actual_date DATE,
  ADD COLUMN IF NOT EXISTS planned_date DATE,
  ADD COLUMN IF NOT EXISTS delay_days INT DEFAULT 0;

CREATE TABLE IF NOT EXISTS emd_ready_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id VARCHAR(100) NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  submitted_by VARCHAR(100),
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  amount VARCHAR(100),
  amount_source VARCHAR(100),
  dept_bank_details JSONB,
  self_bank_details JSONB,
  utr_number VARCHAR(100),
  payment_date DATE,
  remarks TEXT
);

-- ====================================================================
-- 6. STAGE 04: DOCUMENT READY
-- ====================================================================

CREATE TABLE IF NOT EXISTS stage_04_document_ready (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id VARCHAR(100) NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  checklist JSONB DEFAULT '[]'::jsonb,
  custom_docs JSONB DEFAULT '[]'::jsonb,
  remarks TEXT,
  completed_by VARCHAR(100),
  completed_at TIMESTAMPTZ,
  planned_date DATE,
  actual_date DATE,
  delay_days INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tender_id)
);

ALTER TABLE stage_04_document_ready
  ADD COLUMN IF NOT EXISTS checklist JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS custom_docs JSONB DEFAULT '[]'::jsonb;

-- ====================================================================
-- 7. STAGE 05: PORTAL UPLOAD
-- ====================================================================

CREATE TABLE IF NOT EXISTS stage_05_portal_upload (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id VARCHAR(100) NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  portal_name VARCHAR(255),
  reference_no VARCHAR(255),
  documents JSONB DEFAULT '[]'::jsonb,
  remarks TEXT,
  completed_by VARCHAR(100),
  completed_at TIMESTAMPTZ,
  planned_date DATE,
  actual_date DATE,
  delay_days INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tender_id)
);

CREATE TABLE IF NOT EXISTS portal_upload_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id VARCHAR(100) NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  document_name VARCHAR(255) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_url TEXT,
  file_size BIGINT,
  mime_type VARCHAR(100),
  source VARCHAR(100),
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS portal_upload_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id VARCHAR(100) NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  submitted_by VARCHAR(100),
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  portal_name VARCHAR(255),
  reference_no VARCHAR(255),
  documents JSONB DEFAULT '[]'::jsonb,
  remarks TEXT
);

-- ====================================================================
-- 8. STAGES 06, 07, 08: WEBSITE SUBMIT, TECHNICAL & FINANCIAL OPEN
-- ====================================================================

CREATE TABLE IF NOT EXISTS stage_06_submit_in_website (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id VARCHAR(100) NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  portal_name VARCHAR(255),
  confirmation_no VARCHAR(255),
  submitted_date DATE,
  proof_doc JSONB,
  remarks TEXT,
  completed_by VARCHAR(100),
  completed_at TIMESTAMPTZ,
  planned_date DATE,
  actual_date DATE,
  delay_days INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tender_id)
);

CREATE TABLE IF NOT EXISTS stage_07_technical_open_check (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id VARCHAR(100) NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  evaluation_status VARCHAR(100),
  disqualification_reason TEXT,
  committee_notes TEXT,
  evaluation_doc JSONB,
  remarks TEXT,
  completed_by VARCHAR(100),
  completed_at TIMESTAMPTZ,
  planned_date DATE,
  actual_date DATE,
  delay_days INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tender_id)
);

CREATE TABLE IF NOT EXISTS stage_08_financial_open_check (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id VARCHAR(100) NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  l1_bidder VARCHAR(255),
  l1_rate VARCHAR(100),
  our_rank VARCHAR(50),
  our_rate VARCHAR(100),
  opening_doc JSONB,
  remarks TEXT,
  completed_by VARCHAR(100),
  completed_at TIMESTAMPTZ,
  planned_date DATE,
  actual_date DATE,
  delay_days INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tender_id)
);

-- ====================================================================
-- 9. STAGES 09 & 10: NEGOTIATION & WORK ORDER
-- ====================================================================

CREATE TABLE IF NOT EXISTS stage_09_negotiation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id VARCHAR(100) NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL DEFAULT 'Not Applicable',
  letter_doc JSONB,
  negotiated_price VARCHAR(100),
  meeting_date DATE,
  remarks TEXT,
  submitted_by VARCHAR(100) DEFAULT 'Admin',
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  actual_date DATE,
  planned_date DATE,
  delay_days INT DEFAULT 0,
  history JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tender_id)
);

CREATE TABLE IF NOT EXISTS stage_10_work_order (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id VARCHAR(100) NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  work_order_doc JSONB,
  work_order_number VARCHAR(100),
  work_order_date DATE,
  contract_value VARCHAR(100),
  ai_summary TEXT,
  bg_doc JSONB,
  bg_amount VARCHAR(100),
  bg_bank_name VARCHAR(255),
  bg_number VARCHAR(100),
  bg_validity DATE,
  affidavit_requirements TEXT,
  generated_agreement TEXT,
  remarks TEXT,
  submitted_by VARCHAR(100) DEFAULT 'Admin',
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  actual_date DATE,
  planned_date DATE,
  delay_days INT DEFAULT 0,
  history JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tender_id)
);

-- ====================================================================
-- 10. TENDER DOCUMENTS REPOSITORY & CORRIGENDA
-- ====================================================================

CREATE TABLE IF NOT EXISTS tender_documents_repository (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id VARCHAR(100) NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  stage_origin VARCHAR(100) NOT NULL,
  document_type VARCHAR(100) NOT NULL,
  document_title VARCHAR(255) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  storage_path TEXT,
  file_url TEXT,
  file_size BIGINT,
  mime_type VARCHAR(100),
  source VARCHAR(100) DEFAULT 'manual-upload',
  extracted_text TEXT,
  ai_summary TEXT,
  is_verified BOOLEAN DEFAULT false,
  verified_by VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tender_corrigenda (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id VARCHAR(100) NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  corrigendum_no VARCHAR(100) NOT NULL,
  issue_date DATE,
  tender_ref VARCHAR(255),
  file_name VARCHAR(255),
  file_url TEXT,
  overview TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE tender_corrigenda 
  ADD COLUMN IF NOT EXISTS file_url TEXT,
  ADD COLUMN IF NOT EXISTS overview TEXT;

CREATE TABLE IF NOT EXISTS tender_corrigendum_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  corrigendum_id UUID NOT NULL REFERENCES tender_corrigenda(id) ON DELETE CASCADE,
  tender_id VARCHAR(100) NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  field_name VARCHAR(100) NOT NULL,
  old_value TEXT,
  new_value TEXT,
  description TEXT,
  page_clause_ref VARCHAR(255),
  is_critical BOOLEAN DEFAULT false,
  applied BOOLEAN DEFAULT false,
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS master_company_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_key VARCHAR(100) NOT NULL UNIQUE,
  file_name VARCHAR(255) NOT NULL,
  file_url TEXT,
  file_size BIGINT,
  mime_type VARCHAR(100),
  value_claimed VARCHAR(255),
  notes TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ====================================================================
-- 11. ROW LEVEL SECURITY (RLS) & PUBLIC FULL ACCESS POLICIES
-- Ensures frontend and backend can read and write without 401/403 errors
-- ====================================================================

DO $$
DECLARE
  tbl text;
  tables_to_secure text[] := ARRAY[
    'tenders',
    'tender_bid_details',
    'tender_packages',
    'tender_technical_components',
    'tender_corrigenda',
    'tender_corrigendum_changes',
    'stage_01_eligibility_check',
    'stage_02_sample_details',
    'sample_details_history',
    'stage_03_emd_ready',
    'emd_ready_history',
    'stage_04_document_ready',
    'stage_05_portal_upload',
    'portal_upload_documents',
    'portal_upload_history',
    'stage_06_submit_in_website',
    'stage_07_technical_open_check',
    'stage_08_financial_open_check',
    'stage_09_negotiation',
    'stage_10_work_order',
    'tender_documents_repository',
    'master_categories',
    'master_bank_accounts',
    'master_company_documents',
    'app_users'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables_to_secure
  LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = tbl) THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "Public full access" ON %I;', tbl);
      EXECUTE format('CREATE POLICY "Public full access" ON %I FOR ALL USING (true) WITH CHECK (true);', tbl);
    END IF;
  END LOOP;
END $$;

