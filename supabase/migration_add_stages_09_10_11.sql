-- ====================================================================
-- MIGRATION: Add Stages 8, 9, 10 (Negotiation) & 11 (Work Order)
-- ====================================================================

-- 1. Extend tender_stage_enum
DO $$ BEGIN
  ALTER TYPE tender_stage_enum ADD VALUE IF NOT EXISTS 'Negotiation';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TYPE tender_stage_enum ADD VALUE IF NOT EXISTS 'Work Order';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Stage 09: Negotiation Table
CREATE TABLE IF NOT EXISTS stage_09_negotiation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id VARCHAR(100) NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL DEFAULT 'Not Applicable', -- 'Yes', 'No', 'Not Applicable'
  letter_doc JSONB, -- { name, size, type, dataUrl, uploadedAt }
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

-- 3. Stage 10: Work Order Table
CREATE TABLE IF NOT EXISTS stage_10_work_order (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id VARCHAR(100) NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  work_order_doc JSONB, -- { name, size, type, dataUrl, uploadedAt }
  work_order_number VARCHAR(100),
  work_order_date DATE,
  contract_value VARCHAR(100),
  ai_summary TEXT,
  bg_doc JSONB, -- { name, size, type, dataUrl, uploadedAt }
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

-- 4. Automatic Delay Calculation & Updated Timestamp Triggers
DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename IN ('stage_09_negotiation', 'stage_10_work_order')
  LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS trg_calculate_delay ON %I;
      CREATE TRIGGER trg_calculate_delay
      BEFORE INSERT OR UPDATE ON %I
      FOR EACH ROW EXECUTE FUNCTION fn_calculate_delay_days();
      
      DROP TRIGGER IF EXISTS trg_update_timestamp ON %I;
      CREATE TRIGGER trg_update_timestamp
      BEFORE UPDATE ON %I
      FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
    ', tbl, tbl, tbl, tbl);
  END LOOP;
END $$;
