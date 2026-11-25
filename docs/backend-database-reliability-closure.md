# Backend & Database Reliability Closure

Branch: feat/supabase-private-media-storage
Last reviewed: 2026-11-25
Production publishing: DISABLED

## Confirmed in Preview
- Supabase read-only health probes connected to all 8 configured tables: news_articles, news_sources, news_verification_checks, editorial_events, department_outputs, media_assets, approval_queue, department_knowledge.
- This is a read-only connectivity result. It is not a live write/delete certification.
- Vercel runtime logs for the checked Preview deployment returned no warning/error/fatal records in the checked 30-minute window.
- No production data or publication state was changed.

## Implemented safeguards
- Admin APIs use constant-time bearer-token comparison and no-store responses.
- News article creation starts at pending_verification with publication_status disabled.
- Verification requires two distinct publisher hosts or one configured official source.
- Article edits reset editorial state to pending_verification and publication remains disabled.
- Article deletion requires explicit confirmation and an existence check.
- News POST compensates source/article inserts if source or editorial-event insertion fails, preserving the original failure and appending cleanup failures.
- News PATCH snapshots the prior article and sources and attempts compensating restoration if source/event writes fail.
- Private media uploads validate PNG/JPEG/WebP signatures, size and MIME type; metadata insertion failure triggers private object cleanup.
- Private media deletion snapshots the private object before removal. If metadata deletion fails, the object is restored to the same private path with its original bytes/content type. If restoration also fails, the failure detail records both problems.
- Private media remains private; no public Blob URL is emitted. Rights status remains pending_review.
- Graphics, queue and draft responses preserve publication DISABLED.

## Automated verification
- Existing test coverage includes news create/edit compensation, verification rules, admin authorization, private media upload/retrieval/deletion, and queue validation.
- Added tests for media deletion compensation when metadata deletion fails, including the double-failure case where storage restoration also fails.
- Added endpoint smoke tests using a synthetic admin token for queue, draft and graphics: all three reject missing/incorrect credentials; each accepts the synthetic token and reaches request validation; method restrictions are checked. These tests do not access the live admin password or mutate Supabase.
- Latest CI for commit `dad828bb45e8c30bf6adfa97be84c22875b4601c`: 148/148 Node tests passed; all five workflows passed (Node tests, backend source checks, newsroom suite, newsroom API/safety, department-team safeguards).
- Backend source checks now run on this Preview branch.
- CI verified green on code commit `17e780c6fa12ce8be770ca66f646ee780a7ebf06`: 141/141 Node tests passed, and all five Preview-branch workflows passed (Node tests, backend source checks, newsroom suite, newsroom API/safety, department-team safeguards).
- A subsequent documentation-only commit updates this closure record; no application code changed after the green test commit.

## Still OPEN — required before closure
1. Confirm all CI workflows pass on the latest commit.
2. Establish an authenticated Admin Panel browser session or equivalent secure runtime to run the disposable approval_queue CRUD test (create/read/update/delete/confirm absent). Browser automation is currently unavailable because its wallet is negative; do not require that provider if a no-cost secure alternative is available. Never use production newsroom records.
3. Run a disposable private-media upload/read/delete test and verify metadata and object are both removed; run a controlled metadata-failure test only through mocks, not live fault injection.
4. Verify admin queue, draft, graphics and news endpoints in the authenticated Preview session.
5. Confirm all 8 tables' expected columns/constraints against the live schema, not just SELECT access.
6. Decide whether to replace REST multi-call compensation with PostgreSQL RPC transactions. Compensation is not equivalent to a database transaction and cannot guarantee atomicity if both primary and rollback calls fail.
7. Recheck that publishing remains disabled in Preview and Production.

## Closure rule
Keep this work OPEN until CI is green, authenticated disposable CRUD/media tests pass, schema details are checked, and the compensation/transaction decision is resolved. Production publishing stays disabled.


## 25 November 2026 — Preview verification and Gemini timeout recovery

- Preview code commit: `6b0f001dc63eb894d7c62030aba6c809597055ee`; deployment `dpl_GumtBRSVarcg98rP9RsxM4LhVbC7` reached READY at https://ai-chronicals-news-47u0519ab-chdawoodkhalid28-5713.vercel.app .
- Live public-route smoke tests returned HTTP 200 for 13/13 paths: homepage, Admin Panel, News Management, connectors page, master TemplateFlyer page, broadcast VFX suite, image gallery, ready-made flyer library, three review drafts, and two existing news pages.
- Live read-only Supabase health check returned HTTP 200: all 8/8 tables connected. The single-table `news_articles` probe also returned HTTP 200.
- Initial live Gemini diagnostic timed out. Fixed text-only Gemini generation to use bounded request timeouts and retry the lightweight `gemini-3.5-flash-lite` model after primary-model timeout. Grounded Google Search requests deliberately do not fall back to an ungrounded model.
- Live `/api/health?gemini=1` then returned HTTP 200 with `status: connected`; the successful test used `gemini-3.5-flash-lite` and reported 17 total tokens.
- Added regression tests for timeout fallback and for preserving the no-fallback rule on grounded research.
- Latest Node test workflow passed 152/152 tests, zero failures. All five workflows passed on commit `f33c653d79c46c70048d3cf32dd1c40d3c0509c5`: Node tests, backend source checks, newsroom suite, newsroom API/safety, and department-team safeguards.
- Live authenticated Admin login, disposable queue CRUD, real private-media upload/read/delete, and live draft creation remain unverified because the available deployment fetch path cannot submit the owner's admin credentials. Do not claim those operations passed; use the owner's secure browser session for the remaining acceptance tests.
- Production deployment and all news/social publishing remain disabled. This Preview is not a Production release.

**Status: Preview foundation and read-only database/AI diagnostics pass; authenticated write-path acceptance remains open.**


## 25 November 2026 — Latest verification follow-up

- Rechecked the current Preview deployment: it remains READY. Live read-only Supabase health returned HTTP 200 with 8/8 tables connected; live Gemini diagnostic returned HTTP 200 and generated a response using the working fallback model `gemini-3.5-flash-lite` after the configured primary model did not complete promptly.
- Latest branch commit `f33c653d79c46c70048d3cf32dd1c40d3c0509c5` passed all five GitHub Actions workflows; Node test log confirms 152/152 tests passed.
- The branch now includes the expected-column Supabase read-only probe. The currently deployed Preview is older than this commit, so that new schema probe is not yet live-verified.
- Attempted a new Preview deployment from the latest tested commit. Vercel rejected the deployment request because the account/team has exceeded its 100-deployments-per-day API limit; Vercel reports retry after 24 hours. No Production deployment was attempted and no settings or billing were changed.
- Authenticated live Admin Panel actions, disposable queue CRUD, and real private-media upload/read/delete remain open. The deployment fetch path can serve public HTML and health diagnostics but rejects authenticated admin API paths; do not claim live write-path acceptance.
- Production publishing remains disabled.
