-- AI Chronicals News: PostgreSQL foundation
-- Apply in Supabase SQL Editor. No public/anon access is granted.
create extension if not exists pgcrypto;

create table if not exists public.news_articles (
  id uuid primary key default gen_random_uuid(),
  headline text not null check (char_length(headline) between 8 and 240),
  summary text not null default '' check (char_length(summary) <= 1200),
  body text not null default '' check (char_length(body) <= 30000),
  language text not null default 'ur' check (language in ('ur','en')),
  category text not null default 'general' check (char_length(category) between 1 and 80),
  assigned_desk text not null default 'newsroom' check (char_length(assigned_desk) between 1 and 100),
  editorial_status text not null default 'pending_verification'
    check (editorial_status in ('pending_verification','verified','needs_revision','approved_not_published','rejected')),
  publication_status text not null default 'disabled' check (publication_status = 'disabled'),
  verification_notes text not null default '' check (char_length(verification_notes) <= 5000),
  created_by text not null default 'admin' check (char_length(created_by) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.news_sources (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.news_articles(id) on delete cascade,
  source_url text not null check (source_url ~ '^https://'),
  source_title text not null default '' check (char_length(source_title) <= 240),
  publisher text not null default '' check (char_length(publisher) <= 160),
  source_type text not null default 'independent' check (source_type in ('independent','official','primary_document','eyewitness')),
  is_official boolean not null default false,
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  unique(article_id, source_url)
);

create table if not exists public.news_verification_checks (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.news_articles(id) on delete cascade,
  check_type text not null check (check_type in ('source_independence','claim_accuracy','date_context','media_rights','legal_ethics','editorial_review')),
  outcome text not null check (outcome in ('pass','revise','hold','fail')),
  notes text not null default '' check (char_length(notes) <= 5000),
  checked_by text not null default 'admin' check (char_length(checked_by) <= 120),
  created_at timestamptz not null default now()
);

create table if not exists public.editorial_events (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.news_articles(id) on delete cascade,
  previous_status text,
  new_status text not null,
  note text not null default '' check (char_length(note) <= 3000),
  actor text not null default 'admin' check (char_length(actor) <= 120),
  created_at timestamptz not null default now()
);

create table if not exists public.department_outputs (
  id uuid primary key default gen_random_uuid(),
  article_id uuid references public.news_articles(id) on delete set null,
  run_id text not null default '',
  department_key text not null check (char_length(department_key) between 1 and 100),
  output_type text not null check (output_type in ('research','storyline','fact_check','graphics_brief','presentation','recommendation')),
  content jsonb not null default '{}'::jsonb,
  editorial_status text not null default 'pending_admin_review'
    check (editorial_status in ('pending_admin_review','accepted','revision_required','rejected')),
  publication_status text not null default 'disabled' check (publication_status = 'disabled'),
  created_at timestamptz not null default now()
);

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  article_id uuid references public.news_articles(id) on delete set null,
  blob_pathname text not null unique,
  media_type text not null check (media_type in ('image','document','other')),
  alt_text text not null default '' check (char_length(alt_text) <= 500),
  source_url text not null default '' check (source_url = '' or source_url ~ '^https://'),
  rights_status text not null default 'pending_review'
    check (rights_status in ('pending_review','licensed','public_domain','permission_granted','rejected')),
  created_at timestamptz not null default now()
);

create index if not exists news_articles_status_created_idx on public.news_articles(editorial_status, created_at desc);
create index if not exists news_articles_desk_idx on public.news_articles(assigned_desk, created_at desc);
create index if not exists news_sources_article_idx on public.news_sources(article_id);
create index if not exists editorial_events_article_idx on public.editorial_events(article_id, created_at desc);
create index if not exists department_outputs_article_idx on public.department_outputs(article_id, created_at desc);
create index if not exists media_assets_article_idx on public.media_assets(article_id);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists news_articles_set_updated_at on public.news_articles;
create trigger news_articles_set_updated_at before update on public.news_articles
for each row execute function public.set_updated_at();

alter table public.news_articles enable row level security;
alter table public.news_sources enable row level security;
alter table public.news_verification_checks enable row level security;
alter table public.editorial_events enable row level security;
alter table public.department_outputs enable row level security;
alter table public.media_assets enable row level security;

-- Intentionally no anon/authenticated policies. Server-side service-role access only.
