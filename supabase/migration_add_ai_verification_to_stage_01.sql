-- Migration: Add ai_verification column to stage_01_eligibility_check
-- Run this in Supabase SQL Editor to persist AI eligibility verification results

ALTER TABLE stage_01_eligibility_check
ADD COLUMN IF NOT EXISTS ai_verification JSONB;

COMMENT ON COLUMN stage_01_eligibility_check.ai_verification IS 'AI-based tender document eligibility verification result, status (Eligible / Not Eligible), and criteria breakdown';

