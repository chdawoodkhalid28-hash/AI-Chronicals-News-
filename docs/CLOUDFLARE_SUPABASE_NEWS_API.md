# Cloudflare Supabase News API

## Worker secrets

Configure these as encrypted Worker secrets/variables in the **test Worker only**:

- `SUPABASE_URL`: HTTPS project URL, e.g. `https://<project-ref>.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service-role key (secret; never expose to browser code)
- `OFFICIAL_SOURCE_DOMAINS`: optional comma-separated official publisher domains, e.g. `gov.pk, example.gov`

The Worker uses the Supabase PostgREST API over HTTPS and enforces a bounded 8-second request timeout. RLS should remain enabled with no anon/authenticated policies; service-role access is server-side only.

## Routes

Both authenticated routes are supported:

- `/api/admin/news`
- `/api/admin/queue?resource=news` (compatibility with the existing Admin frontend)

All requests require the signed Admin session cookie. Supported methods: GET, POST, PATCH, DELETE. The API caps list results at 100, validates HTTPS source URLs, derives publisher identity from URL hosts, and requires two independent publishers or one configured official domain to mark an article verified.

Every response forces `publication: "DISABLED"` or equivalent database `publication_status: "disabled"`. No route publishes content.

## Database compatibility

The adapter uses the existing `news_articles`, `news_sources`, and `editorial_events` tables and fields from the newsroom migrations. Confirm the deployed Supabase schema is the newer `202611160001_newsroom_core.sql` (or compatible) before enabling the API. This branch does not apply migrations or modify any database data.

## Release gates

1. Configure Worker secrets in the test environment only.
2. Verify the deployed schema and RLS/service-role grants using read-only probes.
3. Run the preview CI and authenticated CRUD acceptance tests against synthetic records.
4. Keep the PR Draft until owner review; do not deploy or promote Production.
