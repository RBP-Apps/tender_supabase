-- ====================================================================
-- SUPABASE DATABASE SCHEMA FOR TENDER MANAGEMENT & FMS SYSTEM
-- Complete Schema with Planned, Actual, and Delay Tracking in EVERY Table
-- ====================================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Custom ENUM Types
DO $$ BEGIN
  CREATE TYPE tender_stage_enum AS ENUM (
    'Eligibility Check',
    'Sample Details',
    'EMD Ready',
    'Document Ready',
    'Document Upload in portal',
    'Submit in website',
    'Technical Open Check',
    'Financial Open Check'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE tender_status_enum AS ENUM (
    'In Progress',
    'Ready',
    'Submitted',
    'Completed',
    'At Risk'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ====================================================================
-- 3. REUSABLE TRIGGER FUNCTIONS
-- ====================================================================

-- Auto update updated_at timestamp
CREATE OR REPLACE FUNCTION fn_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Auto calculate delay_days from planned_date & actual_date
CREATE OR REPLACE FUNCTION fn_calculate_delay_days()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.planned_date IS NOT NULL THEN
    IF NEW.actual_date IS NOT NULL THEN
      -- Task completed: difference between actual completion and planned date
      NEW.delay_days := GREATEST(0, (NEW.actual_date - NEW.planned_date));
    ELSE
      -- Task still pending: calculate overdue days relative to CURRENT_DATE
      IF CURRENT_DATE > NEW.planned_date THEN
        NEW.delay_days := GREATEST(0, (CURRENT_DATE - NEW.planned_date));
      ELSE
        NEW.delay_days := 0;
      END IF;
    END IF;
  ELSE
    NEW.delay_days := 0;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ====================================================================
-- 4. MASTER & CONFIGURATION TABLES
-- ====================================================================

-- 4.1 Master Categories (States, Departments, Firms, Tender Types)
CREATE TABLE IF NOT EXISTS master_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_type VARCHAR(50) NOT NULL, -- 'states', 'departments', 'firms', 'tenderTypes'
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50),
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INT DEFAULT 0,
  planned_date DATE,
  actual_date DATE,
  delay_days INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(category_type, name)
);

-- 4.2 Master Bank Accounts (Self / Company Bank Accounts)
CREATE TABLE IF NOT EXISTS master_bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_name VARCHAR(255) NOT NULL,
  account_holder VARCHAR(255),
  account_no VARCHAR(100) NOT NULL UNIQUE,
  ifsc VARCHAR(50) NOT NULL,
  branch VARCHAR(255),
  account_type VARCHAR(50) DEFAULT 'Current',
  is_active BOOLEAN DEFAULT TRUE,
  planned_date DATE,
  actual_date DATE,
  delay_days INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4.3 Master Company Documents (Settings: Turnover, Networth, Experience)
CREATE TABLE IF NOT EXISTS master_company_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_key VARCHAR(50) NOT NULL UNIQUE, -- 'turnoverDoc', 'networthDoc', 'experienceDoc'
  doc_title VARCHAR(255) NOT NULL,
  file_name VARCHAR(255),
  file_size BIGINT,
  mime_type VARCHAR(100),
  file_url TEXT,
  doc_value VARCHAR(255),
  notes TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ====================================================================
-- 5. CORE TENDER TABLES
-- ====================================================================

-- 5.1 Main Tenders Table
CREATE TABLE IF NOT EXISTS tenders (
  id VARCHAR(100) PRIMARY KEY, -- e.g. 'TND-2026-001' or custom code
  title VARCHAR(500) NOT NULL,
  authority VARCHAR(255) NOT NULL,
  department VARCHAR(255) NOT NULL,
  state VARCHAR(100) NOT NULL,
  estimated_value VARCHAR(100),
  stage tender_stage_enum DEFAULT 'Eligibility Check',
  status tender_status_enum DEFAULT 'In Progress',
  due_date DATE,
  owner VARCHAR(100) DEFAULT 'Admin',
  remarks TEXT,
  planned_date DATE,
  actual_date DATE,
  delay_days INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5.2 Tender Bid Details (Extracted/Entered Detailed Parameters)
CREATE TABLE IF NOT EXISTS tender_bid_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id VARCHAR(100) NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  rfs_no VARCHAR(255),
  rfs_date DATE,
  corrigendum VARCHAR(255),
  work_name TEXT,
  short_work_name VARCHAR(255),
  authority_full_name VARCHAR(500),
  addressee_designation VARCHAR(255),
  authority_address TEXT,
  bid_deadline_time VARCHAR(50),
  tender_fee_per_package VARCHAR(100),
  gst_section TEXT,
  tender_fee_plus_gst VARCHAR(255),
  test_report_compliance TEXT,
  maf_requirement TEXT,
  experience_requirement TEXT,
  turnover_requirement TEXT,
  bid_validity_days VARCHAR(50) DEFAULT '180',
  financial_requirement_cr VARCHAR(100),
  technical_requirement TEXT,
  jurisdiction VARCHAR(255),
  signing_date DATE,
  signing_place VARCHAR(100) DEFAULT 'Anand',
  -- Beneficiary Bank
  beneficiary_account_holder VARCHAR(255),
  beneficiary_bank_name VARCHAR(255),
  beneficiary_branch VARCHAR(255),
  beneficiary_account_no VARCHAR(100),
  beneficiary_ifsc VARCHAR(50),
  beneficiary_account_type VARCHAR(50),
  planned_date DATE,
  actual_date DATE,
  delay_days INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tender_id)
);

-- 5.3 Tender Packages / Lots
CREATE TABLE IF NOT EXISTS tender_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id VARCHAR(100) NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  code VARCHAR(100) NOT NULL,
  region VARCHAR(255),
  rfx VARCHAR(100),
  emd_lakh VARCHAR(50),
  planned_date DATE,
  actual_date DATE,
  delay_days INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5.4 Tender Technical Components
CREATE TABLE IF NOT EXISTS tender_technical_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id VARCHAR(100) NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  item_name VARCHAR(255) NOT NULL,
  make VARCHAR(255),
  compliance VARCHAR(255),
  planned_date DATE,
  actual_date DATE,
  delay_days INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5.5 Tender Corrigenda Records
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
  planned_date DATE,
  actual_date DATE,
  delay_days INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5.6 Corrigendum Change Items
CREATE TABLE IF NOT EXISTS tender_corrigendum_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  corrigendum_id UUID NOT NULL REFERENCES tender_corrigenda(id) ON DELETE CASCADE,
  change_type VARCHAR(100) NOT NULL,
  category VARCHAR(50) DEFAULT 'standard',
  target_field VARCHAR(100),
  original_value TEXT,
  revised_value TEXT,
  description TEXT,
  page_clause_ref VARCHAR(100),
  is_critical BOOLEAN DEFAULT FALSE,
  applied BOOLEAN DEFAULT FALSE,
  planned_date DATE,
  actual_date DATE,
  delay_days INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ====================================================================
-- 6. WORKFLOW STAGES (STAGES 01 TO 08)
-- ====================================================================

-- 6.1 Stage 01: Eligibility Check
CREATE TABLE IF NOT EXISTS stage_01_eligibility_check (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id VARCHAR(100) NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  turnover_doc JSONB,     -- { name, size, type, dataUrl/storagePath, uploadedAt }
  experience_doc JSONB,   -- { name, size, type, dataUrl/storagePath, uploadedAt }
  vendor_reg_doc JSONB,   -- { name, size, type, dataUrl/storagePath, uploadedAt }
  other_doc JSONB,        -- { name, size, type, dataUrl/storagePath, uploadedAt }
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

-- 6.2 Stage 02: Sample Details
CREATE TABLE IF NOT EXISTS stage_02_sample_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id VARCHAR(100) NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  maf_letter JSONB,       -- { id, name, size, type, dataUrl, source, referenceNote, uploadedAt }
  test_report JSONB,
  bis_certificate JSONB,
  product_sample JSONB,
  other_docs JSONB DEFAULT '[]'::jsonb,
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

-- 6.2.1 Stage 02: Sample Details Revision History
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
  update_summary TEXT,
  planned_date DATE,
  actual_date DATE,
  delay_days INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6.3 Stage 03: EMD Ready
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

-- 6.3.1 Stage 03: EMD Ready Revision History
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
  remarks TEXT,
  planned_date DATE,
  actual_date DATE,
  delay_days INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6.4 Stage 04: Document Ready (Master Dossier)
CREATE TABLE IF NOT EXISTS stage_04_document_ready (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id VARCHAR(100) NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  custom_docs JSONB DEFAULT '[]'::jsonb,
  dossier_status VARCHAR(50) DEFAULT 'Ready',
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

-- 6.5 Stage 05: Document Upload in Portal
CREATE TABLE IF NOT EXISTS stage_05_portal_upload (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id VARCHAR(100) NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  portal_name VARCHAR(255),
  portal_url TEXT,
  ack_number VARCHAR(100),
  upload_date DATE,
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

-- 6.5.1 Stage 05: Checklist Files Mapped to Portal Slots
CREATE TABLE IF NOT EXISTS portal_upload_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_upload_id UUID NOT NULL REFERENCES stage_05_portal_upload(id) ON DELETE CASCADE,
  tender_id VARCHAR(100) NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  field_key VARCHAR(100) NOT NULL,
  field_label VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  file_url TEXT,
  size BIGINT,
  type VARCHAR(100),
  source VARCHAR(100),
  status VARCHAR(50) DEFAULT 'Uploaded',
  remarks TEXT,
  planned_date DATE,
  actual_date DATE,
  delay_days INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6.5.2 Stage 05: Portal Upload Audit History
CREATE TABLE IF NOT EXISTS portal_upload_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id VARCHAR(100) NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  portal_upload_id UUID REFERENCES stage_05_portal_upload(id) ON DELETE SET NULL,
  submitted_by VARCHAR(100),
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  portal_name VARCHAR(255),
  portal_url TEXT,
  ack_number VARCHAR(100),
  upload_date DATE,
  documents_snapshot JSONB DEFAULT '[]'::jsonb,
  remarks TEXT,
  planned_date DATE,
  actual_date DATE,
  delay_days INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6.6 Stage 06: Submit in Website
CREATE TABLE IF NOT EXISTS stage_06_submit_in_website (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id VARCHAR(100) NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  submission_portal_url TEXT,
  acknowledgement_number VARCHAR(255),
  submission_token VARCHAR(255),
  final_submission_receipt JSONB,
  fee_payment_receipt JSONB,
  submitted_by VARCHAR(100),
  submitted_at TIMESTAMPTZ,
  remarks TEXT,
  planned_date DATE,
  actual_date DATE,
  delay_days INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tender_id)
);

-- 6.7 Stage 07: Technical Open Check
CREATE TABLE IF NOT EXISTS stage_07_technical_open_check (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id VARCHAR(100) NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  opening_date DATE,
  is_responsive BOOLEAN DEFAULT TRUE,
  qualification_status VARCHAR(50) DEFAULT 'Qualified', -- 'Qualified', 'Disqualified', 'Under Scrutiny'
  disqualification_reason TEXT,
  committee_queries TEXT,
  query_response_doc JSONB,
  evaluated_by VARCHAR(100),
  evaluated_at TIMESTAMPTZ,
  remarks TEXT,
  planned_date DATE,
  actual_date DATE,
  delay_days INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tender_id)
);

-- 6.8 Stage 08: Financial Open Check
CREATE TABLE IF NOT EXISTS stage_08_financial_open_check (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id VARCHAR(100) NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  price_bid_opening_date DATE,
  our_bid_amount VARCHAR(100),
  l1_bidder_name VARCHAR(255),
  l1_bid_amount VARCHAR(100),
  our_rank VARCHAR(20), -- 'L1', 'L2', 'L3', etc.
  is_awarded BOOLEAN DEFAULT FALSE,
  loa_number VARCHAR(100),
  loa_date DATE,
  loa_document JSONB,
  final_remarks TEXT,
  completed_at TIMESTAMPTZ,
  planned_date DATE,
  actual_date DATE,
  delay_days INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tender_id)
);

-- ====================================================================
-- 7. MASTER FMS MILESTONE TRACKER (Planned vs Actual vs Delay per Stage)
-- ====================================================================

CREATE TABLE IF NOT EXISTS tender_stage_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id VARCHAR(100) NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  stage_order INT NOT NULL, -- 1 to 8
  stage_name tender_stage_enum NOT NULL,
  status tender_status_enum DEFAULT 'In Progress',
  assigned_to VARCHAR(100),
  planned_date DATE NOT NULL,
  actual_date DATE,
  delay_days INT DEFAULT 0,
  delay_reason TEXT,
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tender_id, stage_name)
);

-- 7.1 Unified Document Vault
CREATE TABLE IF NOT EXISTS tender_documents_repository (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id VARCHAR(100) NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  stage_origin VARCHAR(100) NOT NULL,
  document_type VARCHAR(100),
  document_title VARCHAR(255) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  storage_path TEXT NOT NULL,
  file_url TEXT,
  file_size BIGINT,
  mime_type VARCHAR(100),
  source VARCHAR(50) DEFAULT 'manual-upload',
  uploaded_by VARCHAR(100) DEFAULT 'Admin',
  planned_date DATE,
  actual_date DATE,
  delay_days INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ====================================================================
-- 8. ATTACH AUTOMATIC DELAY TRIGGERS TO ALL TABLES
-- ====================================================================

DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename IN (
      'master_categories',
      'master_bank_accounts',
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
      'tender_stage_milestones',
      'tender_documents_repository'
    )
  LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS trg_calculate_delay ON %I;
      CREATE TRIGGER trg_calculate_delay
      BEFORE INSERT OR UPDATE ON %I
      FOR EACH ROW EXECUTE FUNCTION fn_calculate_delay_days();
    ', tbl, tbl);

    -- Attach update timestamp trigger
    IF tbl NOT IN ('sample_details_history', 'emd_ready_history', 'portal_upload_history') THEN
      EXECUTE format('
        DROP TRIGGER IF EXISTS trg_update_timestamp ON %I;
        CREATE TRIGGER trg_update_timestamp
        BEFORE UPDATE ON %I
        FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
      ', tbl, tbl);
    END IF;
  END LOOP;
END $$;

-- ====================================================================
-- 9. DEFAULT MASTER DATA INSERTION
-- ====================================================================

INSERT INTO master_categories (category_type, name) VALUES
  ('states', 'Madhya Pradesh'),
  ('states', 'Maharashtra'),
  ('states', 'Rajasthan'),
  ('states', 'Delhi'),
  ('states', 'Gujarat'),
  ('states', 'Uttar Pradesh'),
  ('states', 'Karnataka'),
  ('departments', 'Public Works'),
  ('departments', 'Urban Development'),
  ('departments', 'Energy'),
  ('departments', 'Water Resources'),
  ('departments', 'Health Department'),
  ('departments', 'Education'),
  ('firms', 'Arjun Infra Pvt. Ltd.'),
  ('firms', 'Sharma Projects'),
  ('firms', 'Apex Builders'),
  ('tenderTypes', 'Open Tender'),
  ('tenderTypes', 'Limited Tender'),
  ('tenderTypes', 'EOI'),
  ('tenderTypes', 'Global Tender')
ON CONFLICT (category_type, name) DO NOTHING;

-- ====================================================================
-- 10. ROW LEVEL SECURITY (RLS) FOR SUPABASE
-- ====================================================================

ALTER TABLE tenders ENABLE ROW LEVEL SECURITY;
ALTER TABLE tender_bid_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE tender_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE tender_technical_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE tender_corrigenda ENABLE ROW LEVEL SECURITY;
ALTER TABLE tender_corrigendum_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_01_eligibility_check ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_02_sample_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE sample_details_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_03_emd_ready ENABLE ROW LEVEL SECURITY;
ALTER TABLE emd_ready_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_04_document_ready ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_05_portal_upload ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_upload_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_upload_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_06_submit_in_website ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_07_technical_open_check ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_08_financial_open_check ENABLE ROW LEVEL SECURITY;
ALTER TABLE tender_stage_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE tender_documents_repository ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_company_documents ENABLE ROW LEVEL SECURITY;

-- Allow read-write for application
DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename IN (
      'master_categories',
      'master_bank_accounts',
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
      'tender_stage_milestones',
      'tender_documents_repository'
    )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Public full access" ON %I;', tbl);
    EXECUTE format('CREATE POLICY "Public full access" ON %I FOR ALL USING (true);', tbl);
  END LOOP;
END $$;
