-- ====================================================================
-- SAFE MIGRATION: Add 6 AI Auto-Fill Tender Fields to tender_bid_details
-- Preserves existing records, completely backward compatible
-- ====================================================================

ALTER TABLE tender_bid_details 
  ADD COLUMN IF NOT EXISTS gst_section TEXT,
  ADD COLUMN IF NOT EXISTS tender_fee_plus_gst VARCHAR(255),
  ADD COLUMN IF NOT EXISTS test_report_compliance TEXT,
  ADD COLUMN IF NOT EXISTS maf_requirement TEXT,
  ADD COLUMN IF NOT EXISTS experience_requirement TEXT,
  ADD COLUMN IF NOT EXISTS turnover_requirement TEXT;

-- Verify columns
COMMENT ON COLUMN tender_bid_details.gst_section IS 'Applicable GST rate, GST amount, and conditions';
COMMENT ON COLUMN tender_bid_details.tender_fee_plus_gst IS 'Total Tender Fee = Tender Fee + Applicable GST Amount';
COMMENT ON COLUMN tender_bid_details.test_report_compliance IS '3-5 line summary of test reports and standards';
COMMENT ON COLUMN tender_bid_details.maf_requirement IS '3-5 line summary of Manufacturer Authorization Form requirements';
COMMENT ON COLUMN tender_bid_details.experience_requirement IS 'Exact experience eligibility criteria preserved verbatim';
COMMENT ON COLUMN tender_bid_details.turnover_requirement IS 'Exact turnover eligibility criteria preserved verbatim';
