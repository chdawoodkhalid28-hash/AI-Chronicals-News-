# AI CHRONICALS NEWS

**Be Informed. Be Ahead.**

Official website and newsroom foundation for AI Chronicals News.

## Hosting

The production project is connected to Vercel and this GitHub repository:
- Repository: `chdawoodkhalid28-hash/AI-Chronicals-News-`
- Production branch: `main`
- Preview work branch: `ai-newsroom-foundation`

## Current website

- `index.html`: public Urdu news homepage.
- `admin.html`: admin draft workspace (opening the page does not publish anything).
- `api/health.js`: safe configuration health check; reports configuration presence only.
- `api/admin/draft.js`: password-protected legacy AI draft endpoint.\n- `api/admin/buland.js`: password-protected Buland research endpoint using live web search.

## Newsroom workflow status

The admin dashboard is controlled by Buland: the admin gives one natural-language instruction, Buland performs live web research with the OpenAI web-search model, returns a cited research brief, and passes the discovered HTTPS sources to the newsroom workflow. The browser then runs a real multi-agent sequence:
1. The Newsroom Lead makes the initial unpublished draft.
2. The other 25 department agents are invoked through separate authenticated API requests, in small batches, and independently review the same draft and supplied source excerpts.
3. The dashboard gathers the 25 reviews, records failed calls, and presents the draft and review results to the admin.

The 26 roles are department directors, each with a defined mandate, duties, and mandatory quality gates in `api/admin/agent.js`. Every director returns a structured executive summary, department findings, decisions and rationale, action plan, issues, recommended changes, claims needing verification, source limitations, escalation flag, and director recommendation. The Newsroom Director / Editor-in-Chief produces the initial unpublished draft; the other 25 directors independently assess it from their own specialist mandates. Buland is the central coordinator and is not counted among the 26 directors.

Director portfolios:
1. Newsroom / Editor-in-Chief — editorial leadership and initial draft.
2. Assignment Desk — prioritization and reporting plan.
3. Pakistan — national affairs and institutions.
4. Provincial & Local — province, district, city, and community reporting.
5. Politics — parties, elections, policy, and political claims.
6. World — international affairs and diplomacy.
7. Crime & Public Safety — crime, policing, emergencies, and victim safety.
8. Courts & Legal Affairs — court proceedings, legal terminology, and due process.
9. Business & Economy — trade, industry, jobs, and economic data.
10. Finance & Markets — banking, currency, equities, rates, and market timestamps.
11. Sports — competitions, teams, players, scores, and records.
12. Technology & AI — technology, AI, software, telecom, and cybersecurity.
13. Science & Health — research quality, medicine, and public health.
14. Climate & Environment — weather, climate, pollution, and disasters.
15. Education — schools, universities, examinations, and policy.
16. Agriculture & Rural Affairs — crops, farmers, inputs, water, and rural economy.
17. Research — background, primary documents, and evidence mapping.
18. Open-Source Verification — digital source assessment and media verification limits.
19. Fact-Check — claim-by-claim evidence classification.
20. Urdu & English — translation, transliteration, and bilingual accuracy.
21. Copy Editing — headline, grammar, structure, and clarity.
22. Photo & Visuals — image integrity, captions, credits, and visual planning.
23. Audience & Social Media — reader needs and responsible social framing.
24. SEO & Distribution — accurate metadata and distribution planning.
25. Ethics & Standards — fairness, privacy, harm minimization, and corrections.
26. Security & Privacy — source protection, data minimization, and newsroom security.

These are 26 separate model invocations, not 26 separately hosted services or persistent autonomous workers. All 25 specialist directors currently receive the same Buland research/source package and initial draft, then apply their own specialist mandate; they do not yet run separate independent web-research jobs. Their assessments are model-generated editorial reviews, not external human verification. The admin browser tab must remain open during execution. Results currently exist in the browser response only; persistent storage and a durable approval queue are not implemented. Each run consumes model API usage.

The dashboard uses `api/admin/agent.js` for the 26-agent sequence. The older `api/admin/draft.js` endpoint remains as a legacy endpoint and is not used by the new dashboard. All results remain `PENDING_ADMIN_APPROVAL`; publishing is disabled.
 
## Required Vercel environment variables

- `OPENAI_API_KEY`
- `ADMIN_PASSWORD` (or legacy `ADMINPASSWORD`)

Never put secrets in source files, commits, browser code, or chat messages.

## Important limitations

Persistent draft storage, a durable approval/rejection queue, independent external fact-checking integrations, and scheduled/background autonomous workflows still need implementation and testing. Buland currently runs on demand from the admin browser; keep the dashboard open until the run completes. The admin supplies only an instruction and language, while Buland discovers sources and coordinates the 26 department calls. The 26 director outputs are not saved after the browser session. Public Blob storage is intentionally not used for drafts and remains deferred.

No story is automatically published. Production publishing remains disabled pending explicit admin authorization.
