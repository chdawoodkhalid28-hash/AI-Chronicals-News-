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
4. Each Director coordinates structured workstreams for Search, Research, Storyline, Graphics, and Presentation.
5. Each department returns an unpublished package containing its research dossier, source links, key facts, timeline/context, claims needing verification, headline, article, social caption, graphics creative brief/image prompt/caption/alt text, presentation order, social variants, SEO metadata, findings, action plan, and recommendation.
6. The dashboard gathers successes and failures and shows the packages to the admin.

The team workstreams are coordinated stages in each department's workflow, not separate persistent hosted services or separate independent model instances for every role. Each department currently uses one web-search model request and one structured package-generation model request. Graphics output is a creative brief and image prompt; the endpoint does not render or license an image file.

## Editorial safeguards and known limitations
- Every result is marked `PENDING_ADMIN_APPROVAL`; publication is disabled.
- A model's web-search citations do not prove that every linked page was opened or independently authenticated. Claims needing verification must remain visible.
- AI assessments are not external human verification. Primary-source review and real-world confirmation may still be required.
- The admin dashboard now stores completed run records and local review decisions in the current browser's localStorage and provides JSON export backups. This is device/browser-specific, is not server-side storage, does not sync across devices, and may be lost if browser data is cleared. Export backups regularly.
- No server-side persistent approval queue is configured. Public Vercel Blob remains deferred as requested; do not connect or use it without explicit authorization.
- The admin browser tab must remain open until the run completes.
- A full run can consume substantial model API usage because it performs central research plus 26 department search and package workflows.
- Public Vercel Blob storage is intentionally deferred and is not used for draft persistence.
- No news is automatically published. Do not enable publishing or production deployment without explicit admin approval.

## Required Vercel environment variables
- `OPENAI_API_KEY`
- `ADMIN_PASSWORD` (or legacy `ADMINPASSWORD`)

Never put secrets in source files, commits, browser code, logs, or chat messages.
