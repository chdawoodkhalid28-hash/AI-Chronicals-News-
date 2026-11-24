# Cloudflare Test Migration — Audit & Plan

Status: preparation branch only; no production deployment or DNS changes.
Repository: chdawoodkhalid28-hash/AI-Chronicals-News-
Base branch: ai-newsroom-foundation
Migration branch: cloudflare-test-migration

## Audit findings (verified from repository files)

- The application is an ESM Node/Vercel-style project. The preview branch package.json currently has only the `@vercel/blob` runtime dependency and a Node test script.
- Public frontend entry: `index.html`; admin dashboard: `admin.html`.
- API routes include `api/health.js`, `api/admin/buland.js`, `api/admin/department-team.js`, `api/admin/agent.js`, `api/admin/draft.js`, `api/admin/queue.js`, and `api/admin/graphics.js`.
- The API handlers use the Vercel Node request/response shape (`handler(req, res)`), Node crypto/Buffer patterns, and environment variables.
- Private approval queue persistence in `api/admin/queue.js` imports `get/list/put/del` from `@vercel/blob` with private access.
- Graphics storage also imports Vercel Blob and delegates persistence to `lib/media-storage.js`.
- Supabase is accessed through `lib/supabase-rest.js`; this can remain an external managed database service if its credentials and network access are configured.
- Existing documentation says all news is held for admin approval and publication is disabled. Preserve this safeguard.
- Existing documentation says development is kept on `ai-newsroom-foundation`; Production must not be changed without explicit admin authorization.

## Migration architecture

1. Cloudflare Workers + Static Assets for the public site and admin UI.
2. Workers-compatible Fetch API router for `/api/*`; convert Node/Vercel handlers to Web Request/Response handlers or add a tested compatibility adapter.
3. Cloudflare R2 private bucket for approval-queue records and generated media; enforce private access through authenticated Worker routes (never public object URLs for drafts).
4. Keep Supabase REST integration initially; move secrets to Cloudflare Worker secrets.
5. Use GitHub Actions or Cloudflare Git integration for preview deployment only.
6. Keep the current Vercel deployment untouched as rollback until all acceptance tests pass.

## Required Cloudflare configuration (not yet available to this workspace)

- Cloudflare account and Workers entitlement.
- Worker name and test subdomain.
- R2 bucket for private newsroom records/media.
- Worker secrets: ADMIN_PASSWORD, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or current supported key variable), and any configured AI provider key.
- R2 bucket binding and least-privilege access.
- No secrets may be committed to this repository.

## Blocking compatibility work

- Replace `@vercel/blob` usage in queue and media storage with a private R2 adapter.
- Port all API route handlers away from the Vercel `req/res` contract.
- Audit Node built-ins and enable `nodejs_compat` only where needed; remove unsupported runtime assumptions.
- Reconcile the actual AI provider: current source includes Gemini helpers and OpenAI-specific endpoints. Preserve existing provider behavior; do not silently switch models or incur paid API use.
- Add Worker-specific integration tests for auth, queue CRUD, health checks, media access, CORS/cache headers, and error paths.
- Confirm static asset paths and all frontend API calls against the Worker router.

## Test deployment acceptance checklist

- [ ] Worker preview deploy succeeds without touching Production.
- [ ] Homepage and all static graphics load.
- [ ] Admin page loads on mobile and desktop.
- [ ] Unauthenticated admin API requests are rejected.
- [ ] Authenticated health diagnostics do not expose secrets.
- [ ] Supabase read-only health probe passes for configured tables.
- [ ] Private queue create/read/update/delete passes and drafts are not publicly accessible.
- [ ] Image/media upload and retrieval pass with private R2 storage.
- [ ] All 26 department workflow endpoints pass safe smoke tests (no real publishing).
- [ ] Browser console and Worker logs have no blocking errors.
- [ ] Existing Vercel production remains available for rollback.

## Current result

A dedicated migration branch has been created from `ai-newsroom-foundation`. No production branch, production deployment, custom domain, DNS record, existing Vercel Blob object, or secret has been changed.

A live Cloudflare test deployment cannot yet be truthfully reported: this workspace has no connected Cloudflare account/deployment action or Cloudflare credentials. The next required step is to connect/provide Cloudflare access and configure the test Worker and R2 bucket. Do not paste API tokens or passwords into chat or commit them.
