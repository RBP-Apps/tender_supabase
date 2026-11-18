-- =============================================================================
-- Tender document page index (approved proposals C + D)
--
-- document_index : one row per (tender, document file). Tracks extraction status.
-- document_pages : one row per physical PDF page: extracted text (pdf.js / OCR /
--                  OpenAI Vision), extraction method, and an OpenAI embedding
--                  (text-embedding-3-small, 1536 dims) for semantic search.
--
-- Every query is scoped by tender_id AND document, so evidence can never come
-- from another tender's document.
--
-- Run once in Supabase → SQL Editor. Safe to re-run.
-- =============================================================================

create extension if not exists vector with schema extensions;

create table if not exists public.document_index (
  id                uuid primary key default gen_random_uuid(),
  tender_id         text not null,
  doc_role          text not null default 'tender'
                    check (doc_role in ('tender', 'corrigendum', 'bidder', 'chat')),
  doc_name          text not null,
  doc_hash          text not null,                 -- sha256 of the file bytes
  source_url        text,                          -- Supabase Storage URL of the file
  page_count        integer,
  pages_done        integer not null default 0,    -- pages processed so far (batched ingestion)
  status            text not null default 'processing'
                    check (status in ('processing', 'ready', 'partial', 'failed')),
  unreadable_pages  integer[] not null default '{}',
  ocr_pages         integer[] not null default '{}',
  vision_pages      integer[] not null default '{}',
  warnings          text[] not null default '{}',
  error             text,
  embedding_model   text,
  metadata          jsonb not null default '{}'::jsonb,  -- cached tender-specific requirement extractions
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (tender_id, doc_role, doc_hash)
);

create index if not exists document_index_tender_idx on public.document_index (tender_id, doc_role);
create index if not exists document_index_source_url_idx on public.document_index (source_url);

create table if not exists public.document_pages (
  id                 uuid primary key default gen_random_uuid(),
  index_id           uuid not null references public.document_index (id) on delete cascade,
  tender_id          text not null,
  doc_hash           text not null,
  doc_name           text not null,
  page_number        integer not null check (page_number > 0),
  total_pages        integer,
  content            text not null,
  section_title      text,
  clause_ref         text,
  extraction_method  text not null
                     check (extraction_method in ('text', 'ocr', 'vision', 'text+ocr', 'text+vision', 'ocr+vision', 'failed')),
  ocr_confidence     real,
  is_scanned         boolean not null default false,
  has_tables         boolean not null default false,
  quality_flags      text[] not null default '{}',
  embedding          extensions.vector(1536),
  created_at         timestamptz not null default now(),
  unique (index_id, page_number)
);

-- FK index (cascade deletes / joins) + tender scoping
create index if not exists document_pages_index_id_idx on public.document_pages (index_id);
create index if not exists document_pages_tender_idx on public.document_pages (tender_id, doc_hash);
-- Approximate nearest-neighbour search on embeddings (cosine)
create index if not exists document_pages_embedding_idx
  on public.document_pages using hnsw (embedding extensions.vector_cosine_ops);

-- Semantic search restricted to the given documents of ONE tender.
create or replace function public.match_document_pages(
  p_tender_id text,
  p_index_ids uuid[],
  p_query_embedding extensions.vector(1536),
  p_match_count integer default 20
)
returns table (id uuid, index_id uuid, page_number integer, similarity double precision)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select p.id, p.index_id, p.page_number,
         1 - (p.embedding <=> p_query_embedding) as similarity
  from public.document_pages p
  where p.tender_id = p_tender_id
    and p.index_id = any (p_index_ids)
    and p.embedding is not null
  order by p.embedding <=> p_query_embedding
  limit least(greatest(p_match_count, 1), 100);
$$;

-- Same access model as the rest of this project (anon key + app-level login).
alter table public.document_index enable row level security;
alter table public.document_pages enable row level security;
drop policy if exists "Public full access" on public.document_index;
create policy "Public full access" on public.document_index for all using (true) with check (true);
drop policy if exists "Public full access" on public.document_pages;
create policy "Public full access" on public.document_pages for all using (true) with check (true);

grant execute on function public.match_document_pages(text, uuid[], extensions.vector, integer) to anon, authenticated;
