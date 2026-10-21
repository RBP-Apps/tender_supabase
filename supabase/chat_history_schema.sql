-- ====================================================================
-- TENDER QUERY CHAT HISTORY SCHEMA (ChatGPT-Like History)
-- Separate dedicated tables for Conversations and Messages
-- ====================================================================

-- 1. Conversations Table
CREATE TABLE IF NOT EXISTS tender_chat_conversations (
  id VARCHAR(100) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  user_id VARCHAR(100) DEFAULT 'admin',
  tender_scope VARCHAR(100) DEFAULT 'all',
  is_archived BOOLEAN DEFAULT FALSE
);

-- 2. Messages Table
CREATE TABLE IF NOT EXISTS tender_chat_messages (
  id VARCHAR(100) PRIMARY KEY,
  conversation_id VARCHAR(100) NOT NULL REFERENCES tender_chat_conversations(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL, -- 'user' or 'assistant'
  content TEXT NOT NULL,
  timestamp VARCHAR(50) NOT NULL,
  attached_files JSONB DEFAULT '[]'::jsonb,
  generated_files JSONB DEFAULT '[]'::jsonb,
  grounded BOOLEAN DEFAULT TRUE,
  source_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Indexes for fast retrieval
CREATE INDEX IF NOT EXISTS idx_tender_chat_conv_updated ON tender_chat_conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_tender_chat_msg_conv ON tender_chat_messages(conversation_id, created_at ASC);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE tender_chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tender_chat_messages ENABLE ROW LEVEL SECURITY;

-- 5. Permissive policies for authenticated and anon users
DO $$ BEGIN
  CREATE POLICY "Allow select on tender_chat_conversations" 
    ON tender_chat_conversations FOR SELECT USING (true);
  CREATE POLICY "Allow insert on tender_chat_conversations" 
    ON tender_chat_conversations FOR INSERT WITH CHECK (true);
  CREATE POLICY "Allow update on tender_chat_conversations" 
    ON tender_chat_conversations FOR UPDATE USING (true);
  CREATE POLICY "Allow delete on tender_chat_conversations" 
    ON tender_chat_conversations FOR DELETE USING (true);
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "Allow select on tender_chat_messages" 
    ON tender_chat_messages FOR SELECT USING (true);
  CREATE POLICY "Allow insert on tender_chat_messages" 
    ON tender_chat_messages FOR INSERT WITH CHECK (true);
  CREATE POLICY "Allow update on tender_chat_messages" 
    ON tender_chat_messages FOR UPDATE USING (true);
  CREATE POLICY "Allow delete on tender_chat_messages" 
    ON tender_chat_messages FOR DELETE USING (true);
EXCEPTION WHEN duplicate_object THEN null;
END $$;
