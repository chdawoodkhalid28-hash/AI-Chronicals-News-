-- Private media bucket for AI Chronicals News.
-- Run once in Supabase SQL Editor as project owner.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'newsroom-private-media',
  'newsroom-private-media',
  false,
  10485760,
  array['image/png','image/jpeg','image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- No anon/authenticated policies are added. Server-side service-role access only.
