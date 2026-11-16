# AI Chronicals News — Preview Release Readiness

**Review date:** 16 November 2026  
**Repository:** `chdawoodkhalid28-hash/AI-Chronicals-News-`  
**Release branch:** `ai-newsroom-foundation`  
**Target:** Vercel Preview only; Production remains unchanged.

## Current verified Preview baseline

- Latest pre-hardening Preview deployment: `dpl_GpNTXFXWNPsFrXpYm61r1nqzttHC` — READY.
- Homepage, Admin Newsroom, News Management page, and 10-department TemplateFlyer page returned HTTP 200.
- `/api/health` returned HTTP 200 and reported the configured admin password, OpenAI key, Gemini key, private Blob token, and Supabase environment variables as present. Secret values were not read or exposed.
- Unauthenticated `GET /api/admin/queue` returned HTTP 401, as expected.
- `GET /api/admin/access` returned HTTP 405 and advertised POST only, as expected.
- No Vercel runtime errors were found in the inspected one-hour Preview window.
- The deployment is connected to the `ai-newsroom-foundation` branch. The production branch `main` was not changed.

## Release hardening added

- Added `GET /api/health?supabase=1`, a read-only database readiness probe against `news_articles`.
- Added unit tests for missing credentials, successful connectivity, and missing/unapplied schema handling.
- Added operator instructions to `docs/SUPABASE-SETUP.md`.
- Kept all checks inside the existing health function to respect the Vercel Hobby 12-function limit.

## Required acceptance gates before Production release

- [ ] Latest hardening commit has passing GitHub Actions tests and a READY Preview deployment.
- [ ] `/api/health?supabase=1` returns HTTP 200 and `status: connected`.
- [ ] Owner signs in to `/admin.html` and completes News Management database round-trip: create draft, read list, update editorial status, and confirm publication remains disabled.
- [ ] Owner confirms private approval-queue sync and a queue decision update; do not create a public Blob URL.
- [ ] Admin checks all 26 department cards, all five newsroom workspaces, mobile layout, and all ten master TemplateFlyer links.
- [ ] Run only a cost-controlled synthetic workflow test; do not run all 26 live AI teams without separate cost approval.
- [ ] Confirm required production environment variables and database migration separately; do not copy Preview secrets into Production automatically.
- [ ] Complete security review, source/asset rights review, backups, and rollback plan.
- [ ] Obtain explicit owner approval before merging to `main` or promoting a deployment to Production.

## Known limitations / not represented as complete

- Environment-variable presence is not proof that the Supabase migration was applied or that the database is reachable. The new probe is the required check.
- Authenticated News Management and private queue write operations require the owner to enter the admin password in their own browser; the assistant does not retrieve or transmit that secret.
- Gemini's live generation probe previously timed out or encountered temporary upstream errors; successful Gemini generation is not confirmed.
- The 26 directors are on-demand model workflows, not 26 persistent background services.
- A full live 26-department run may issue approximately 157 model requests and was not run during this release-preparation pass.
- Graphics generation via the current OpenAI image endpoint may incur usage charges; no image generation or publishing was triggered.
- News publication and social posting remain disabled.

## Release decision

**Status: Preview release candidate preparation in progress — NOT approved for Production.**  
The site has a deployable Preview foundation, but the database connectivity check, authenticated admin acceptance tests, latest CI result, and final owner release approval must pass before Production promotion.
