# Supabase PostgreSQL setup — AI Chronicals News

## Architecture
- Supabase PostgreSQL is the authoritative database for articles, source records, verification checks, editorial history, department outputs and media metadata.
- Vercel Blob remains private media/object storage; do not store public media URLs or expose private Blob tokens.
- Vercel hosts the server-side API. The browser never receives the Supabase service-role key.
- GitHub stores source code and migrations.
- Publishing is hard-disabled in the database schema and API. `approved_not_published` is an editorial decision, not a publish command.

## One-time Supabase setup
1. Create a Supabase project using the Free plan.
2. Open **SQL Editor → New query**.
3. Copy and run `supabase/migrations/202611160001_newsroom_core.sql`.
4. In **Project Settings → API**, copy the Project URL and the **service_role** key. Never use the anon key for this server-only API.
5. In Vercel → Project → Settings → Environment Variables, add:
   - `SUPABASE_URL` = Project URL
   - `SUPABASE_SERVICE_ROLE_KEY` = service_role key
6. Add these to Preview first. Do not expose either variable with a `NEXT_PUBLIC_` prefix. Add Production only after a separate release review.
7. Redeploy the Preview deployment so the serverless functions receive the variables.

## Admin API
All routes require `Authorization: Bearer <ADMIN_PASSWORD>`.
- `GET /api/admin/news` — latest 100 articles and their sources.
- `GET /api/admin/news?status=pending_verification` — filter by editorial status.
- `POST /api/admin/news` with `{ "article": { "headline": "...", "summary": "...", "body": "...", "language": "ur", "category": "general", "assignedDesk": "newsroom", "sources": [{ "url": "https://...", "title": "...", "publisher": "...", "official": false }] } }`
- `PATCH /api/admin/news` with `{ "id": "<uuid>", "editorialStatus": "verified", "note": "..." }`.
Allowed editorial states: `pending_verification`, `verified`, `needs_revision`, `approved_not_published`, `rejected`.
Verification requires two source records or one explicitly marked official. Only a verified article may become `approved_not_published`.

## Security and release notes
- RLS is enabled on every table. No anon/authenticated policies are created. Server-side service-role access is required.
- Do not put secrets in GitHub, source files, screenshots, chat messages or browser JavaScript.
- The API has no publish endpoint and all article writes force `publication_status=disabled`.
- Keep database backups/export before schema changes. Review Supabase Free plan limits and project pausing/retention terms before relying on it for critical operations.
- This migration and API require Preview integration verification after environment variables are configured. No live database test can pass until those variables are set in Vercel and the migration is applied.
