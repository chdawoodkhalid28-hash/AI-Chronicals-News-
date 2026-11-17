# Supabase PostgreSQL setup — AI Chronicals News

## Architecture
- Supabase PostgreSQL is the authoritative database for articles, source records, verification checks, editorial history, department outputs and media metadata.
- Vercel Blob remains private media/object storage; do not store public media URLs or expose private Blob tokens.
- Vercel hosts the server-side API. The browser never receives a Supabase secret/service-role key.
- GitHub stores source code and migrations.
- Publishing is hard-disabled in the database schema and API. `approved_not_published` is an editorial decision, not a publish command.

## One-time Supabase setup
1. Open the Supabase project and select **SQL Editor → New query**.
2. Open the migration file: [202611160001_newsroom_core.sql](../supabase/migrations/202611160001_newsroom_core.sql).
3. Copy the complete SQL file into the SQL Editor and click **Run**. This creates the newsroom tables, indexes, update trigger and restrictive RLS setup. It does not publish anything.
4. In **Project Settings → API Keys**, use a server-side **Secret key** (starts with `sb_secret_`) or legacy **service_role** key. Never use the anon/publishable key for this server-only API.
5. In Vercel → Project → Settings → Environment Variables, set Preview:
   - `SUPABASE_URL` = `https://YOUR_PROJECT_REF.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY1` = the Secret key or legacy service_role key
6. Keep the variable server-only: do not add a `NEXT_PUBLIC_` prefix, and do not paste the key into GitHub, chat, screenshots or browser code.
7. Redeploy the Preview deployment so the serverless functions receive the variables.

The backend accepts `SUPABASE_SERVICE_ROLE_KEY1` first and falls back to `SUPABASE_SERVICE_ROLE_KEY`. For a modern `sb_secret_` key, it sends the key in the `apikey` header; for a legacy service_role JWT it also sends the Bearer authorization header. Do not create another key or share the value in chat.

## Admin API
All routes require `Authorization: Bearer <ADMIN_PASSWORD>`.
- `GET /api/admin/news` — latest 100 articles and their sources.
- `GET /api/admin/news?status=pending_verification` — filter by editorial status.
- `POST /api/admin/news` with an article object containing headline, summary, body, language, category, assignedDesk and sources.
- `PATCH /api/admin/news` with article id, editorialStatus and note.
Allowed editorial states: `pending_verification`, `verified`, `needs_revision`, `approved_not_published`, `rejected`.
Verification requires two source records or one explicitly marked official. Only a verified article may become `approved_not_published`.

## Security and release notes
- RLS is enabled on every table. No anon/authenticated policies are created. Server-side secret/service-role access is required.
- The API has no publish endpoint and all article writes force `publication_status=disabled`.
- Keep database backups/export before schema changes. Review Supabase Free plan limits and project pausing/retention terms before relying on it for critical operations.
- Do not add the secret key to Production until a separate release review.

## Preview connectivity verification
After applying the migration and confirming the Preview variables, open:

`https://YOUR-PREVIEW-DOMAIN/api/health?supabase=1`

Expected success: HTTP 200 with `provider: "supabase"`, `status: "connected"`, and `probe: "read_only_select"`. This performs only a `SELECT id ... LIMIT 1` against `news_articles`; it does not return article data or expose credentials.

If the response is HTTP 503 with `status: "schema_not_ready"`, the migration has not been applied to the connected project (or the API schema cache needs a refresh). Apply the migration in Supabase SQL Editor and retry the probe. A `credentials_rejected` response means the key is wrong or not accepted; `database_unavailable` indicates a connection/project issue.
