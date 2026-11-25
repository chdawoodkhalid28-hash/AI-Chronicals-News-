-- Private department knowledge and evaluation records.
create table if not exists public.department_knowledge (
  id uuid primary key,
  department text not null,
  kind text not null check (kind in ('knowledge', 'evaluation')),
  title text not null check (char_length(title) between 1 and 240),
  content text not null,
  source_url text not null default '',
  tags text[] not null default '{}',
  status text not null check (status in ('draft', 'approved')),
  created_at timestamptz not null default now(),
  constraint department_knowledge_department_check check (
    department in (
      'global','newsroom','assignment_desk','pakistan_desk','provincial_local_desk',
      'politics_desk','world_desk','crime_desk','courts_legal_desk',
      'business_economy_desk','finance_markets_desk','sports_desk',
      'technology_ai_desk','science_health_desk','climate_environment_desk',
      'education_desk','agriculture_desk','research_desk',
      'open_source_verification_desk','fact_check_desk','urdu_english_desk',
      'copy_editing_desk','photo_visuals_desk','audience_social_desk',
      'seo_distribution_desk','ethics_standards_desk','security_privacy_desk'
    )
  )
);

create index if not exists department_knowledge_scope_created_idx
  on public.department_knowledge (department, created_at desc);
create index if not exists department_knowledge_status_kind_idx
  on public.department_knowledge (status, kind);

alter table public.department_knowledge enable row level security;
revoke all on table public.department_knowledge from anon, authenticated;
grant all on table public.department_knowledge to service_role;

comment on table public.department_knowledge is
  'Private internal knowledge and evaluation records for newsroom departments.';

-- Refresh PostgREST so newly created tables are immediately visible to the API.
notify pgrst, 'reload schema';
