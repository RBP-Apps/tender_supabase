-- ====================================================================
-- TENDER FMS - USER MANAGEMENT & ACCESS CONTROL SCHEMA
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.app_users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    mobile_number TEXT,
    email TEXT,
    role TEXT DEFAULT 'Tender Executive',
    page_access JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT true,
    is_primary_admin BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Quick lookup indices
CREATE INDEX IF NOT EXISTS idx_app_users_username ON public.app_users (username);
CREATE INDEX IF NOT EXISTS idx_app_users_email ON public.app_users (email);

-- Enable Row Level Security (RLS) matching other tables
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'app_users' AND policyname = 'Allow public select on app_users'
    ) THEN
        CREATE POLICY "Allow public select on app_users" ON public.app_users FOR SELECT USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'app_users' AND policyname = 'Allow public insert on app_users'
    ) THEN
        CREATE POLICY "Allow public insert on app_users" ON public.app_users FOR INSERT WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'app_users' AND policyname = 'Allow public update on app_users'
    ) THEN
        CREATE POLICY "Allow public update on app_users" ON public.app_users FOR UPDATE USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'app_users' AND policyname = 'Allow public delete on app_users'
    ) THEN
        CREATE POLICY "Allow public delete on app_users" ON public.app_users FOR DELETE USING (true);
    END IF;
END $$;
