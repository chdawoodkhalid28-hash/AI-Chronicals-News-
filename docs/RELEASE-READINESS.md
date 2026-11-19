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

## 16 November 2026 — Latest Preview acceptance check

- Latest source commit: `0ed6445d7d7381350a70b12ca393c1bc93197789` on `ai-newsroom-foundation`.
- Latest Vercel Preview: `dpl_9V811VCYVjNmdukWjm25NWmkkgVg` — READY at https://ai-chronicals-news-osa244isi-chdawoodkhalid28-5713.vercel.app .
- Live smoke tests: homepage, `/admin.html`, `/admin-news.html`, and `/graphics/department-templateflyers.html` all returned HTTP 200. Standard `/api/health` returned HTTP 200 with publication disabled.
- GitHub Actions: Node.js unit and safety tests passed; backend JavaScript validation passed. Earlier full workflow pass on commit `714037e957b4b8d3f629f4fef62da2c440102061` also passed the isolated department-team tests. The latest code-only change does not alter department workflow source.
- Supabase read-only probe returned HTTP 503 with `status: invalid_configuration` and `reasonCode: SUPABASE_URL_INVALID`. Both Supabase environment variable names are present in Preview, but the configured `SUPABASE_URL` value fails URL parsing. The value was not retrieved or exposed. Replace it with the exact Project URL from Supabase Project Settings → API (normally `https://<project-ref>.supabase.co`), then redeploy and rerun the probe. Do not change or share the service-role key.
- A separate Cloudflare check named `Workers Builds: ai-chronicals-news` reported failure against its Production Worker build. Vercel Preview is READY; the Cloudflare failure is not a Vercel build failure, and Cloudflare build logs were not accessible through the current connected tools. If Cloudflare is intended as a release host, investigate that check before promotion.
- Production branch `main` remains untouched; no Production promotion, news publication, or social posting occurred.

**Current release decision: BLOCKED pending correction of the Preview Supabase Project URL, successful live database probe, owner-entered authenticated News Management/queue acceptance, and review of the separate Cloudflare failure if Cloudflare is part of the target hosting plan.**


## 19 November 2026 — Middleware hardening and Supabase Preview configuration

- Fixed the Preview middleware runtime failure caused by assuming request headers always expose a `.get()` method. The middleware now safely handles missing headers, plain-object headers, and Web-Headers-like requests.
- Added `tests/middleware.test.js` for those three request shapes.
- GitHub Actions for commit `78f8179269f90fce238a4387f28bf1bda891aa1d` passed: Newsroom Test Suite, Newsroom API and safety tests, Backend source checks, and Department Team Safeguard Tests.
- Vercel Preview deployment for commit `78f8179269f90fce238a4387f28bf1bda891aa1d` reached READY. Production was not changed.
- Corrected the Preview-only `SUPABASE_URL` environment variable using the previously owner-supplied project URL. Existing Supabase service-role credentials were not read, changed, or exposed. A new deployment and read-only health probe are required to confirm database connectivity.
- The existing Supabase key has a prior recorded authentication rejection. If the read-only probe still reports `credentials_rejected`, the owner must replace the Preview service-role key directly in Vercel using the current Supabase Project Settings → API key. Never paste the key into chat or source control.
- The six-table migration exists in `supabase/migrations/202611160001_newsroom_core.sql`, but the live migration state has not been independently confirmed. Apply it in the Supabase SQL Editor if the read-only probe reports `schema_not_ready`.
- The Admin News Management page uses `/api/admin/queue?resource=news`; the shared authenticated route delegates to the PostgreSQL CRUD handler. Automated tests cover this route and its unauthenticated rejection. The live authenticated CRUD round-trip still requires the owner to enter the password in their own browser.
- Full 26-department execution remains gated: the existing run may issue about 157 model requests. No live multi-agent run, image generation, news publication, or social posting was triggered in this pass.

**Current release decision: Preview-only.** Next acceptance gates: deploy the corrected Preview environment, run `/api/health?supabase=all`, resolve any remaining credential/schema result, and complete owner-authenticated News Management and private queue acceptance. Production remains untouched.


## 19 November 2026 — Live Preview smoke-test results

- Preview deployment `dpl_B33LMGoTJbrJ8JiVSn7L13dQpzwK` (commit `b9436374a1c0579e4d4f74de08481c2596bd34c5`) reached READY.
- Live read-only `GET /api/health?supabase=all` returned HTTP 200: all six configured tables responded successfully — `news_articles`, `news_sources`, `news_verification_checks`, `editorial_events`, `department_outputs`, and `media_assets`.
- The Preview health endpoint reports admin password, OpenAI key, Gemini key, private Blob token, and Supabase configuration present. Values were not exposed.
- Homepage, `/admin.html`, `/admin-news.html`, and `/graphics/department-templateflyers.html` returned HTTP 200.
- The Gemini live probe using the previous `gemini-3.8-flash` setting timed out at the 20-second client timeout. Source has now been updated to the owner-preferred, lower-cost `gemini-3.5-flash-lite` model with a 45-second request timeout and regression tests. Its live result must be checked on the next READY Preview deployment.
- An unauthenticated `GET /api/admin/access` returned HTTP 405, as expected for the POST-only login endpoint. Authenticated News Management and private Blob queue operations were not attempted because they require the owner-entered admin password.
- Runtime error aggregation still displays the historical middleware exception from deployment `dpl_6P7AdMmnhyYoCa49CPDKRpbV3ZX7`, last seen before the fix was deployed. The new middleware code passed automated regression tests; a fresh post-deployment error window is required to certify the runtime fix.

**Release decision remains Preview-only.** Live database connectivity is now verified; remaining acceptance includes the new Gemini probe, owner-authenticated CRUD/queue round-trip, fresh runtime error check, and cost-approved controlled agent test. Production remains untouched.
