# Backend & Database Reliability Closure

Branch: feat/supabase-private-media-storage
Scope: source-code review and test planning only. Production publishing remains DISABLED.

## Verified code controls
- Admin graphics API uses constant-time token comparison and no-store responses.
- Private media upload validates MIME type, base64, signatures and a 3 MB size cap.
- Media uploads and generated graphics index private objects and roll back storage objects if metadata insertion fails.
- Retrieval/deletion path validation restricts objects to newsroom-uploads/ and newsroom-graphics/ single-file paths.
- News API creates articles in pending_verification with publication disabled.
- Verification requires two distinct publisher hosts or one official source.
- Article edits reset editorial state to pending_verification and publication_status disabled.
- Deletes require explicit confirmation and existence check.

## Known reliability risks requiring implementation and tests
1. News article PATCH is not transactional across article, source, and editorial_events REST calls. A source-delete/source-insert or event-write failure can leave partial state. Needs compensating rollback or a database RPC transaction.
2. News POST inserts article, then sources, then editorial event. Source failure triggers article rollback, but rollback failure is swallowed; event failure occurs after article/sources and may return an error despite persisted records.
3. News PATCH currently deletes prior sources before inserting replacements. If source insertion fails, the previous source set is lost.
4. Media delete removes storage object before metadata. If metadata deletion fails, metadata may point to a missing object. Needs compensation/retry or transactional cleanup.
5. Database credentials/schema connectivity are not owner-authenticated in this audit. Supabase health previously showed 401, so live table checks cannot be marked complete until credentials are corrected.
6. No live deployment or production mutation is part of this closure; Vercel deployment quota is a known blocker.

## Required tests before closure
- Fault-injection tests for each database call in news POST/PATCH/DELETE and media delete.
- Assert rollback/compensation and preserve the original error.
- Idempotent retry behavior for duplicate submissions.
- Schema smoke tests for all eight configured tables.
- Supabase owner-authenticated read/write/delete in a disposable test record.
- Run CI and inspect all workflow results for the commit.

## Closure rule
Backend/database reliability must remain OPEN until risks 1-4 are fixed and tested, live Supabase schema/access is verified, and CI is green. Publication stays disabled.
