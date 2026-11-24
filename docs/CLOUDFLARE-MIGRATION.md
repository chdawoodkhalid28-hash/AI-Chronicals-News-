# Cloudflare Migration — Test Deployment

## Safety boundary

This branch is an isolated Cloudflare **static preview** only. It does not replace Vercel, change DNS, modify the production branch, or enable publishing.

The preview worker serves repository static assets. It deliberately returns a clear 503 for existing API routes and reports `ok: false` at `/api/health` until the backend is migrated. Do not use this preview for admin work or newsroom operations.

## Current architecture blockers found in source

- Existing API handlers use the Vercel Node.js request/response function contract.
- The approval queue imports `@vercel/blob` and uses private Vercel Blob operations.
- Admin authentication uses Node crypto and environment variables.
- Supabase is accessed through REST helpers and needs Cloudflare bindings/secrets plus live read-only tests.
- Existing Gemini/OpenAI integrations and all admin routes need runtime compatibility and secret configuration tests.

## Deploying the isolated preview

1. In the existing GitHub repository settings, add Actions secrets:
   - `CLOUDFLARE_API_TOKEN` with Workers Scripts edit permission for the intended account.
   - `CLOUDFLARE_ACCOUNT_ID`.
2. Open Actions → Cloudflare preview deployment → Run workflow on branch `cloudflare-test-deployment`.
3. The workflow deploys only the Wrangler `preview` environment named `ai-chronicals-news-test-preview`.

No credentials belong in source code, commits, issues, or chat.

## Full migration still required

1. Replace Vercel request/response adapters with standard Fetch API handlers.
2. Replace private Vercel Blob persistence with private Cloudflare R2 (or another supported private store); preserve record validation and admin-only access.
3. Configure and test Supabase bindings and least-privilege access.
4. Port every API endpoint and verify methods, authentication, rate limits, headers, and error behavior.
5. Run end-to-end admin queue GET/POST/PATCH/DELETE tests, database read-only probes, static asset tests, and security checks.
6. Only after all tests pass, request owner approval for DNS/production cutover.

## Acceptance rule

A successful static preview deployment is not a successful backend migration. The health endpoint intentionally stays `ok: false` until all required backend capabilities are implemented and verified.
