-- AI Chronicals News: private newsroom database foundation
-- Apply only to the intended Supabase project. Public publishing remains disabled.
create extension if not exists pgcrypto;

create table if not exists public.news_articles (
  id uuid primary key default gen_random_uuid(),
  headline text not null,
  summary text not null default '',
  body text not null default '',
  language text not null default 'ur' check (language in ('ur','en')),
  category text not null default 'general',
  assigned_desk text not null default 'newsroom',
  editorial_status text not null default 'pending_verification'
    check (editorial_status in ('pending_verification','verified','needs_revision','approved_not_published','rejected')),
  publication_status text not null default 'disabled' check (publication_status = 'disabled'),
  verification_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.news_sources (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.news_articles(id) on delete cascade,
  source_url text not null,
  source_title text not null default '',
  publisher text not null default '',
  source_type text not null default 'independent',
  is_official boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.news_verification_checks (
  id uuid primary key default gen_random_uuid(),
  article_id uuid references public.news_articles(id) on delete cascade,
  check_type text not null default 'claim',
  claim text not null default '',
  result text not null default 'pending',
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.editorial_events (
  id uuid primary key default gen_random_uuid(),
  article_id uuid references public.news_articles(id) on delete set null,
  previous_status text,
  new_status text not null,
  note text not null default '',
  actor text not null default 'admin',
  created_at timestamptz not null default now()
);

create table if not exists public.department_outputs (
  id uuid primary key default gen_random_uuid(),
  article_id uuid references public.news_articles(id) on delete cascade,
  department text not null default 'newsroom',
  status text not null default 'pending',
  output jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  article_id uuid references public.news_articles(id) on delete cascade,
  asset_type text not null default 'image',
  storage_path text not null default '',
  source_url text,
  rights_status text not null default 'unverified',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists news_articles_created_at_idx on public.news_articles (created_at desc);
create index if not exists news_articles_status_idx on public.news_articles (editorial_status);
create index if not exists news_sources_article_id_idx on public.news_sources (article_id);
create index if not exists editorial_events_article_id_idx on public.editorial_events (article_id);
create index if not exists department_outputs_article_id_idx on public.department_outputs (article_id);
create index if not exists media_assets_article_id_idx on public.media_assets (article_id);

alter table public.news_articles enable row level security;
alter table public.news_sources enable row level security;
alter table public.news_verification_checks enable row level security;
alter table public.editorial_events enable row level security;
alter table public.department_outputs enable row level security;
alter table public.media_assets enable row level security;

revoke all on public.news_articles, public.news_sources, public.news_verification_checks,
  public.editorial_events, public.department_outputs, public.media_assets from anon, authenticated;
grant all on public.news_articles, public.news_sources, public.news_verification_checks,
  public.editorial_events, public.department_outputs, public.media_assets to service_role;

-- No anon/authenticated policies are created. Service-role access is server-side only.
