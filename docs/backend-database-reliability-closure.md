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
- Backend source checks now run on this Preview branch.
- CI verified green on code commit `17e780c6fa12ce8be770ca66f646ee780a7ebf06`: 141/141 Node tests passed, and all five Preview-branch workflows passed (Node tests, backend source checks, newsroom suite, newsroom API/safety, department-team safeguards).
- A subsequent documentation-only commit updates this closure record; no application code changed after the green test commit.

## Still OPEN — required before closure
1. Confirm all CI workflows pass on the latest commit.
2. Establish an authenticated Admin Panel browser session to run the disposable approval_queue CRUD test (create/read/update/delete/confirm absent). Never use production newsroom records.
3. Run a disposable private-media upload/read/delete test and verify metadata and object are both removed; run a controlled metadata-failure test only through mocks, not live fault injection.
4. Verify admin queue, draft, graphics and news endpoints in the authenticated Preview session.
5. Confirm all 8 tables' expected columns/constraints against the live schema, not just SELECT access.
6. Decide whether to replace REST multi-call compensation with PostgreSQL RPC transactions. Compensation is not equivalent to a database transaction and cannot guarantee atomicity if both primary and rollback calls fail.
7. Recheck that publishing remains disabled in Preview and Production.

## Closure rule
Keep this work OPEN until CI is green, authenticated disposable CRUD/media tests pass, schema details are checked, and the compensation/transaction decision is resolved. Production publishing stays disabled.
