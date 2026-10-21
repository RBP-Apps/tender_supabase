-- ====================================================================
-- SUPABASE STORAGE BUCKET & POLICIES FOR TENDER FMS
-- Creates 'tender-documents' bucket with public access for all stages
-- ====================================================================

-- 1. Create the Storage Bucket (if not already existing)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'tender-documents',
  'tender-documents',
  true,
  104857600, -- 100MB max per file
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

-- 2. Drop existing policies if any to avoid duplicates
DO $$
BEGIN
  DROP POLICY IF EXISTS "Public Select tender-documents" ON storage.objects;
  DROP POLICY IF EXISTS "Allow Uploads tender-documents" ON storage.objects;
  DROP POLICY IF EXISTS "Allow Updates tender-documents" ON storage.objects;
  DROP POLICY IF EXISTS "Allow Deletes tender-documents" ON storage.objects;
END $$;

-- 3. Policy: Allow Anyone (Public & Authenticated) to Read/Download Files
CREATE POLICY "Public Select tender-documents"
ON storage.objects FOR SELECT
USING (bucket_id = 'tender-documents');

-- 4. Policy: Allow Anyone to Upload / Insert Files
CREATE POLICY "Allow Uploads tender-documents"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'tender-documents');

-- 5. Policy: Allow Anyone to Update / Overwrite Files
CREATE POLICY "Allow Updates tender-documents"
ON storage.objects FOR UPDATE
USING (bucket_id = 'tender-documents')
WITH CHECK (bucket_id = 'tender-documents');

-- 6. Policy: Allow Deletion of Files
CREATE POLICY "Allow Deletes tender-documents"
ON storage.objects FOR DELETE
USING (bucket_id = 'tender-documents');
