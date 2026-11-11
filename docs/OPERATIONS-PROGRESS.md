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


## 2026-11-11 — Five-area Newsroom Control Center

- Added a sticky five-section navigation to `admin.html`: Main Dashboard, Assignment Center (Buland), Research & Fact-check, Graphics & Presentation, and Editorial Approval.
- Separated the Buland assignment controls from the dashboard overview while preserving the existing API element IDs and workflow handlers.
- Moved the generated research report into the Research & Fact-check workspace.
- Added a Graphics & Presentation workspace explaining the admin-triggered image generation workflow and source/licensing checks; no autonomous image/video publishing is enabled.
- Kept the private Approval Queue panel and server sync controls in the Editorial Approval workspace.
- Static markup checks: all section tags balanced, no duplicate element IDs, no broken in-page navigation anchors.
- GitHub Actions run #21 passed for commit `bf04da0125475fc5602abddd2fdeb68202b04cb1`: https://github.com/chdawoodkhalid28-hash/AI-Chronicals-News-/actions/runs/42994393060
- Vercel Preview deployment is READY: https://ai-chronicals-news-r92iyxdvg-chdawoodkhalid28-5713.vercel.app/admin.html
- Preview page fetch confirmed all five sections. Preview health returned online with private Blob configured and publishing disabled. No runtime errors were found in the selected one-hour window.
- Owner confirmed the Preview website opened and manual server Sync completed successfully. Still not verified: individual queue decision PATCH and DELETE; actual Buland + 26 team run; graphics generation persistence; scheduled automatic news research. Full AI run remains gated due to cost.
- Production remains untouched; all stories remain pending admin approval.


## 2026-11-11 — Automated layout regression checks

- Added `tests/admin-layout.test.js` to verify all five newsroom navigation areas and their links, unique element IDs, balanced section markup, report placement inside Research & Fact-check, and visible publication-safety language.
- GitHub Actions run #25 passed for test commit `d458ac747ed08c58f27ea4e289a99d01b01f44e7`; approval-queue tests, newsroom layout tests, API syntax checks, and ES module/CommonJS guard all passed: https://github.com/chdawoodkhalid28-hash/AI-Chronicals-News-/actions/runs/42994582879
- Vercel Preview deployment for the test commit is READY: https://ai-chronicals-news-kbzygcvq3-chdawoodkhalid28-5713.vercel.app/admin.html
- The five-area UI itself was verified on the prior Preview deployment for the same dashboard source commit. No production deployment was made.


## 2026-11-11 — Newsroom graphics and layout draft
- Created `graphics/newsroom-templates.html` as a self-contained responsive, editable HTML draft (no image-generation credits required).
- Includes newsroom master control dashboard; breaking-news 16:9; anchor lower-third/ticker; square social news card; vertical mobile story cover; data explainer; and editorial decision slate.
- Text placeholders are editable in-browser and the page supports Print / Save PDF. No live claims or fabricated news data are included.
- Linked the draft from the Admin Graphics & Presentation workspace.
- Verified deployed Preview URL returns the graphics page and Admin page links to it: `https://ai-chronicals-news-l4cvkfyy3-chdawoodkhalid28-5713.vercel.app/graphics/newsroom-templates.html`.
- GitHub Actions run #29 passed for the Admin link commit `46f29e65b7bc0617f315a2e70d9989c5e825b08e`; Vercel Preview deployment reached READY.
- Canva design generation was blocked by exhausted credits; MagicPath project creation was blocked by exhausted API quota; fal image generation account balance is exhausted. The editable HTML template draft was built and deployed instead.
- Publication remains disabled; all designs are placeholders and require editorial verification and admin approval before any real content is used.


## 2026-11-11 — Vibrant digital newsroom visual refresh
- Updated `graphics/newsroom-templates.html` on the working branch `ai-newsroom-foundation` with a richer digital broadcast visual system: layered midnight-blue gradients, electric cyan/blue/violet/pink accents, subtle grid and orbital motifs, brighter headline hierarchy, glass-style control bar, gradient status treatments, upgraded cards, social templates, and responsive mobile spacing.
- Preserved all seven existing template/workspace concepts, editable placeholder copy, print/save-PDF behavior, and publication safety wording. No live news claims, licensed imagery assumptions, or auto-publishing behavior were introduced.
- Commit: `8694cf4c2eab184e87555cd83a47a32e2efd784b`.
- Pending verification: GitHub CI and Vercel Preview build/route fetch. Production remains untouched.
