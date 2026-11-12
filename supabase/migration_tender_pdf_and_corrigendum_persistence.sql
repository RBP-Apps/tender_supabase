-- ====================================================================
-- SUPABASE MIGRATION: TENDER PDF & CORRIGENDUM COMPLETE PERSISTENCE
-- Adds missing columns to `tenders` and `tender_bid_details`
-- Ensures `tender_documents_repository` and `tender-documents` storage bucket
-- Completely safe and idempotent (can be run multiple times safely)
-- ====================================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Add JSONB and AI Auto-fill columns to `tenders` table
ALTER TABLE tenders 
  ADD COLUMN IF NOT EXISTS tender_doc JSONB,
  ADD COLUMN IF NOT EXISTS corrigenda JSONB,
  ADD COLUMN IF NOT EXISTS gst_section TEXT,
  ADD COLUMN IF NOT EXISTS tender_fee_plus_gst VARCHAR(255),
  ADD COLUMN IF NOT EXISTS test_report_compliance TEXT,
  ADD COLUMN IF NOT EXISTS maf_requirement TEXT,
  ADD COLUMN IF NOT EXISTS experience_requirement TEXT,
  ADD COLUMN IF NOT EXISTS turnover_requirement TEXT;

COMMENT ON COLUMN tenders.tender_doc IS 'Uploaded NIT/Tender PDF document metadata and file URL';
COMMENT ON COLUMN tenders.corrigenda IS 'List of Corrigendum records, change items, and Corrigendum PDF URLs';

-- 3. Add AI Auto-fill & tender_doc columns to `tender_bid_details` table
ALTER TABLE tender_bid_details 
  ADD COLUMN IF NOT EXISTS tender_doc JSONB,
  ADD COLUMN IF NOT EXISTS gst_section TEXT,
  ADD COLUMN IF NOT EXISTS tender_fee_plus_gst VARCHAR(255),
  ADD COLUMN IF NOT EXISTS test_report_compliance TEXT,
  ADD COLUMN IF NOT EXISTS maf_requirement TEXT,
  ADD COLUMN IF NOT EXISTS experience_requirement TEXT,
  ADD COLUMN IF NOT EXISTS turnover_requirement TEXT;

-- 4. Ensure `tender_corrigenda` table exists and has `file_url`
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
  ADD COLUMN IF NOT EXISTS file_url TEXT;

-- 5. Ensure `tender_corrigendum_changes` table exists
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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Ensure `tender_documents_repository` table exists
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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Ensure Storage Bucket `tender-documents` exists with Public Access
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'tender-documents',
  'tender-documents',
  true,
  104857600, -- 100MB limit
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/zip',
    'text/plain',
    'application/octet-stream'
  ]
)
ON CONFLICT (id) DO UPDATE 
SET public = true, file_size_limit = 104857600;

-- 8. Storage RLS Policies for `tender-documents` Bucket
DO $$
BEGIN
  DROP POLICY IF EXISTS "Public Select tender-documents" ON storage.objects;
  DROP POLICY IF EXISTS "Allow Uploads tender-documents" ON storage.objects;
  DROP POLICY IF EXISTS "Allow Updates tender-documents" ON storage.objects;
  DROP POLICY IF EXISTS "Allow Deletes tender-documents" ON storage.objects;
END $$;

CREATE POLICY "Public Select tender-documents"
ON storage.objects FOR SELECT
USING (bucket_id = 'tender-documents');

CREATE POLICY "Allow Uploads tender-documents"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'tender-documents');

CREATE POLICY "Allow Updates tender-documents"
ON storage.objects FOR UPDATE
USING (bucket_id = 'tender-documents')
WITH CHECK (bucket_id = 'tender-documents');

CREATE POLICY "Allow Deletes tender-documents"
ON storage.objects FOR DELETE
USING (bucket_id = 'tender-documents');

