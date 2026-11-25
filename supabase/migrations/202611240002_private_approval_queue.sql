-- Private admin approval queue. Service-role backend access only.
create table if not exists public.approval_queue (
  id text primary key,
  saved_at timestamptz not null,
  record jsonb not null,
  constraint approval_queue_id_format check (id ~ '^run-[A-Za-z0-9_-]{1,100}$')
);

create index if not exists approval_queue_saved_at_idx
  on public.approval_queue (saved_at desc);

alter table public.approval_queue enable row level security;
revoke all on table public.approval_queue from anon, authenticated;
grant all on table public.approval_queue to service_role;

comment on table public.approval_queue is
  'Private admin-only editorial approval queue. Publication remains disabled.';

-- Refresh PostgREST so newly created tables are immediately visible to the API.
notify pgrst, 'reload schema';
