# AI CHRONICALS NEWS

Official website and AI newsroom foundation for AI Chronicals News.

## Hosting and branches
- Repository: `chdawoodkhalid28-hash/AI-Chronicals-News-`
- Production branch: `main`
- Development / preview branch: `ai-newsroom-foundation`
- All current newsroom development is kept on the preview branch. Do not merge to `main` or enable production publishing without explicit admin authorization.

## Main application files
- `index.html`: public Urdu news homepage.
- `admin.html`: password-protected admin newsroom dashboard.
- `api/health.js`: safe configuration health check; reports configuration presence only.
- `api/admin/buland.js`: authenticated central Buland research and assignment brief.
- `api/admin/department-team.js`: authenticated independent department Search & Research plus Director-coordinated newsroom package pipeline.
- `api/admin/agent.js`: original 26-director review endpoint retained for specialist review workflows.
- `api/admin/draft.js`: legacy draft endpoint; not used by the current department-team dashboard.
- `api/admin/queue.js`: authenticated private Blob approval-queue API (list, save, update admin decision, delete).

## Newsroom hierarchy
Buland is the central AI coordinator and is not counted among the 26 department directors. Each director owns a dedicated department workflow:
1. Newsroom / Editor-in-Chief
2. Assignment Desk
3. Pakistan
4. Provincial & Local
5. Politics
6. World
7. Crime & Public Safety
8. Courts & Legal Affairs
9. Business & Economy
10. Finance & Markets
11. Sports
12. Technology & AI
13. Science & Health
14. Climate & Environment
15. Education
16. Agriculture & Rural Affairs
17. Research
18. Open-Source Verification
19. Fact-Check
20. Urdu & English
21. Copy Editing
22. Photo & Visuals
23. Audience & Social Media
24. SEO & Distribution
25. Ethics & Standards
26. Security & Privacy

## Department team workflow
For each admin assignment:
1. Buland researches the overall instruction and creates a central assignment brief with cited HTTPS links.
2. The dashboard calls all 26 department team endpoints in small batches.
3. Each department makes its own independent web-search request focused on its remit; it does not simply reuse Buland's central brief.
4. Each Director coordinates one independent Search request and five separate specialist model invocations: Research, Storyline, Evidence Audit, Graphics, and Presentation.
5. Each department returns an unpublished package containing its research dossier, source links, key facts, timeline/context, claims needing verification, headline, article, social caption, graphics creative brief/image prompt/caption/alt text, presentation order, social variants, SEO metadata, findings, action plan, and recommendation.
6. The dashboard gathers successes and failures, displays readable department report cards with source links, retains raw JSON details, and offers JSON exports for the admin.

The five specialist roles are separate model invocations coordinated by the department Director; they are not persistent background services. This is a meaningful separation of AI tasks, but not five long-running agents with their own hosting or memory. Graphics briefs include a prompt. An admin can optionally generate an actual image on demand from each department report using the authenticated `api/admin/graphics` endpoint (`gpt-image-1`, medium quality, 1024×1024); images are returned to the browser for review/download and are not automatically published or stored in Blob. Image generation may incur API usage costs. The system does not grant image licensing or factual authenticity.

## Editorial safeguards and known limitations
- Every result is marked `PENDING_ADMIN_APPROVAL`; publication is disabled.
- A model's web-search citations do not prove that every linked page was opened or independently authenticated. Claims needing verification must remain visible.
- AI assessments are not external human verification. Primary-source review and real-world confirmation may still be required.
- The admin dashboard stores completed run records and review decisions in a private Vercel Blob store (`ai-chronicals-news-private-persistence`, region `bom1`, access `private`) through the authenticated `/api/admin/queue` endpoint. The browser localStorage queue remains as a local fallback and JSON import/export backup; use the admin Sync control to load and merge records across devices.
- Queue API access requires the admin bearer password. Queue records are private and are never exposed as public Blob URLs. The API supports list, save, update decision, and delete. Admin approval is a review state only; it does not publish a story. All queue records are forced to `PENDING_ADMIN_APPROVAL` and `publication: DISABLED` when saved.
- The older public Blob store (`ai-chronicals-news-media`, region `bom1`) is retained as a legacy store and must not be used for private newsroom drafts or approval decisions.
- The admin browser tab must remain open until the run completes.
- A full run can consume substantial model API usage because it performs central research plus 26 department search and package workflows. Department runs are throttled in batches of two, with a short pause between batches; transient upstream failures receive one retry and requests have a timeout. These safeguards reduce but do not eliminate rate-limit failures.
- The legacy public Blob store is not used for draft persistence.
- No news is automatically published. Do not enable publishing or production deployment without explicit admin approval.

## Graphics and department TemplateFlyers
- Ten distinct department master flyers: [Open the 10 Department Master TemplateFlyers](/graphics/department-templateflyers.html).
- Director-to-template routing rules: `graphics/templateflyer-routing.json`.
- The ten masters are reusable by all 26 director workflows; cross-functional teams inherit the story's assigned beat. Unclear beats are held for Assignment Desk.
- Preview-only; no automatic publishing. All stories remain pending explicit admin approval.

## Required Vercel environment variables
- `OPENAI_API_KEY`
- `ADMIN_PASSWORD` (or legacy `ADMINPASSWORD`)
- `BLOB_READ_WRITE_TOKEN` (connected to the private newsroom Blob store)

Never put secrets in source files, commits, browser code, logs, or chat messages.

## Operational reliability improvements
- The admin dashboard now shows a live per-department state (queued, running, successful, failed) during a newsroom run.
- Department requests receive one client-side retry for network, rate-limit, and server errors; authentication and validation errors are not retried.
- If a run stops after some departments have completed, the dashboard renders and attempts to save a clearly marked partial report. Missing departments can be retried from the report; successful retries update the same local queue record. Missing departments must be completed before editorial assessment.
- The public health endpoint is surfaced through a safe admin diagnostics panel. It reports only whether required environment variables are present; it never returns secret values.
- Department PASS status is now gated on a valid evidence-audit structure, at least one claim check, a recognized audit status, and no declared verification gaps. Malformed or incomplete audits are HOLD, not PASS.
- All six JavaScript API handlers are configured as ES modules; every `require()` call was removed from the API source and Node crypto uses the native `node:crypto` import. The latest preview deployment passed live health and API method-guard checks, with no runtime error logs in the checked 30-minute window. A full live 26-department run, real upstream OpenAI calls, and cross-device persistence have not yet been verified.
