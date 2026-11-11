# AI Chronicals News — Operations Progress

Last updated: 2026-11-11
Repository: `chdawoodkhalid28-hash/AI-Chronicals-News-`
Working branch: `ai-newsroom-foundation`

## Safety and operating rules

- Publishing remains disabled. Every story stays pending explicit administrator approval.
- Do not deploy to Production or merge/promote to `main` without explicit owner authorization.
- Do not run the full 26-department AI workflow without explicit cost approval.
- Never place API keys, admin passwords, Blob tokens, or other secrets in source control or progress reports.
- AI agents may research and prepare content; the owner retains final editorial and publishing control.

## Completed and verified in source / CI

- Private Vercel Blob approval queue API at `/api/admin/queue` with authenticated GET, POST, PATCH, DELETE.
- Queue records are sanitized server-side; publication is forced to `DISABLED` and editorial state to `PENDING_ADMIN_APPROVAL`.
- Queue validation helpers and four automated tests in `tests/queue-core.test.js`.
- GitHub Actions workflow checks API syntax, dependency import, and queue tests.
- Buland coordinator endpoint and the 26-department team workflow are present in the working branch.
- Each department workflow includes search/research, storyline, evidence audit, graphics brief, and presentation/distribution workstreams.
- Admin dashboard has a private server queue panel, local browser fallback, JSON import/export, and manual server sync.
- 2026-11-11 update: fixed queue synchronization so manual Sync uploads newer local records to private server storage before merging; corrected stale copy that claimed queue was local-only.

## Current deployment baseline

- Latest previously verified Preview deployment: READY.
- Branch: `ai-newsroom-foundation`.
- Latest previously verified deployed commit before the 2026-11-11 queue-sync update: `9f9eb694cac62142bc7bb1824d040c2690c1d0eb`.
- Queue-sync source commit `246f1b66938d2b31b62a3e49319a8bee73a60c16` passed GitHub Actions and received a READY Preview deployment on 2026-11-11.
- Production remains untouched.

## Outstanding work

1. Verify authenticated positive-path queue GET/POST/PATCH/DELETE from the admin dashboard; this requires the owner to enter the admin password in their own browser.
2. Verify the new queue upload-and-merge sync behavior on Preview after CI/deployment.
3. Reconcile and implement the five-part newsroom layout: Main Dashboard, Assignment Center, Research & Fact-check, Graphics & Presentation, Editorial Approval.
4. Run a controlled, cost-approved end-to-end test of Buland and all 26 department teams. Estimated full-run scale from current orchestration: about 157 model requests; do not start without explicit approval.
5. Improve graphics asset persistence and verify source/licensing metadata.
6. Implement and test scheduled newsroom research/report automation; do not enable autonomous publishing.
7. Review outstanding Vercel environment-secret metadata warnings without exposing values or changing credentials without approval.
8. Complete final security, reliability, and operational acceptance tests.

## 2026-11-11 verification update

- GitHub Actions run #17 for the queue-sync code commit completed successfully: https://github.com/chdawoodkhalid28-hash/AI-Chronicals-News-/actions/runs/42993739815
- Preview deployment for commit `246f1b66938d2b31b62a3e49319a8bee73a60c16` is READY.
- Preview admin page was fetched successfully.
- Preview `/api/health` returned `status: online`, private Blob configured, admin password configured, OpenAI key configured, and `publishing: disabled-pending-admin-approval`.
- Unauthenticated `/api/admin/queue` returned HTTP 401 as expected. Authenticated positive-path queue operations still require owner testing in the dashboard.
- No runtime errors were found in the selected 60-minute Vercel window.

## Known limitations

- Department roles are coordinated model stages, not 26 permanently running hosted services.
- Search citations do not prove every linked page was opened or independently authenticated.
- Graphics briefs are produced by the team workflow; actual image generation is a separate admin-triggered action.
- Authenticated queue positive-path has not yet been tested by the owner.
- A successful CI run does not prove the full AI newsroom has completed a real API run.

## Change log

### 2026-11-11 — Private queue sync correction
- Updated `admin.html` so manual server sync uploads local records that are missing or newer on the private server, then reloads and merges server/local records.
- Added clearer status text for local-only fallback and failed server persistence.
- Removed the outdated localStorage-only limitation from the newsroom run report.
- Commit: `246f1b66938d2b31b62a3e49319a8bee73a60c16`.
- Verified after commit: CI passed and Preview deployment is READY; authenticated queue round-trip remains pending.
