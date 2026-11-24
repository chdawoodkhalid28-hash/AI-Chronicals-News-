# Cloudflare Migration Security Audit

Audit branch: `cloudflare-test-deployment`
Audit date: 2026-11-24
Scope: repository API handlers and Cloudflare preview scaffold. This is a source-code audit, not a penetration test or a live production security certification.

## Verified deployment and test status

- GitHub Actions workflow `.github/workflows/cloudflare-preview-checks.yml` completed successfully.
- GitHub Actions workflow `.github/workflows/cloudflare-preview.yml` completed successfully.
- The temporary Worker was deployed by Wrangler and the deployment log reported:
  `https://ai-chronicals-news-test.honeysuckle-sleet.workers.dev`.
- The Worker health route intentionally reports `partial-preview`, `ok: false`, and `backendMigration: not_started`.
- Every `/api/*` route in the preview returns HTTP 503 until a Cloudflare implementation exists.
- External automated page retrieval was blocked by the host's bot protection, so an independent HTTP response check of the live Worker has not been completed.

## Findings

### 1. Admin authentication is password-per-request

The current Vercel API handlers compare a supplied Bearer credential directly with `ADMIN_PASSWORD` (or the legacy `ADMINPASSWORD`). This pattern is present in the access, queue, agent, Buland, department-team, draft, graphics, and knowledge handlers.

Impact:
- The admin password is sent from the browser on each protected API request.
- There is no shared, independently verified session middleware across these handlers.
- A password compromise grants the same API access as the administrator until the password is rotated.

Required remediation before Cloudflare production:
- Introduce one shared authentication module for all protected routes.
- Prefer a short-lived, signed, HttpOnly, Secure, SameSite cookie session with server-side expiry validation, plus CSRF protection for cookie-authenticated state-changing requests.
- Keep secrets only in Worker Secrets; never put them in `wrangler.jsonc`, source files, client-side storage, or public assets.
- Add rate limiting / failed-login throttling and security-event logging.
- Test unauthenticated, invalid, expired, and authorized requests for every protected route.

### 2. The current access cookie is not the API authorization mechanism

`api/admin/access.js` creates `acn_admin_access` with `Path=/connectors.html`. The queue and other API handlers separately require the Bearer password. The Admin page also stores the active password in a JavaScript variable and sends it in Authorization headers.

Impact:
- The cookie currently controls a limited browser link visibility path; it does not establish a shared API session.
- The UI's hidden/visible connector link is not a security boundary.

Required remediation:
- Replace UI-only access state with server-verified session authorization.
- Do not trust hidden controls or client-side role labels.

### 3. Private Vercel Blob is a migration blocker

The approval queue, graphics/media storage, and knowledge store import `@vercel/blob` and depend on `BLOB_READ_WRITE_TOKEN`.

Required remediation:
- Port these operations to a private Cloudflare R2 bucket using Worker bindings.
- Keep the bucket private; expose media only through authenticated, time-limited access or an explicitly public publishing workflow.
- Add object size, content-type, path, and ownership validation.
- Preserve queue record validation and publication-disabled behavior.

### 4. Supabase adapter exists, but live connectivity is unverified

`lib/supabase-rest.js` uses an allowlist of six table names and HTTPS REST requests. The health handler includes read-only probes for one or all six tables.

Required remediation:
- Configure Supabase URL and secret only as Cloudflare Worker secrets/bindings.
- Run read-only connectivity tests against all six expected tables.
- Verify least-privilege database policies and avoid exposing a service-role credential to the browser.

### 5. Publishing remains disabled

The Cloudflare preview explicitly returns `publishing: DISABLED`, and the queue sanitizer forces publication to disabled / pending admin approval. Keep this behavior until the editorial verification, legal review, approval, and publishing controls are migrated and tested end-to-end.

## Migration acceptance gates

Do not switch production DNS or disable Vercel until all gates pass:

1. Shared Worker authentication/session middleware and negative security tests.
2. Private R2 read/write/list/delete tests and authorization tests.
3. Supabase connectivity and schema/policy checks.
4. Ported API route contract tests for queue, newsroom, departments, drafts, graphics, knowledge, and health.
5. Admin login, session expiry, logout, queue CRUD, and mobile/desktop front-desk tests.
6. Secret scanning and static asset leakage checks.
7. Full preview smoke test from a real browser.
8. Explicit owner approval before production DNS cutover.

## Current disposition

Cloudflare temporary static preview: deployed according to GitHub Actions logs.
Cloudflare live endpoint response: not independently verified by automated retrieval (bot-blocked).
Cloudflare backend/API migration: not started.
R2 storage: not configured.
Supabase on Cloudflare: not configured or tested.
Admin session migration: not started.
Production DNS cutover: not performed.
Publishing: disabled.
