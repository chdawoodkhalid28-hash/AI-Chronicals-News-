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
- `api/admin/draft.js`: password-protected AI draft endpoint.

## Newsroom workflow status

The admin dashboard runs a real multi-agent sequence:
1. The Newsroom Lead makes the initial unpublished draft.
2. The other 25 department agents are invoked through separate authenticated API requests, in small batches, and independently review the same draft and supplied source excerpts.
3. The dashboard gathers the 25 reviews, records failed calls, and presents the draft and review results to the admin.

The 26 department roles are Editor-in-Chief/Newsroom, Assignment, Pakistan, Provincial & Local, Politics, World, Crime & Public Safety, Courts & Legal Affairs, Business & Economy, Finance & Markets, Sports, Technology & AI, Science & Health, Climate & Environment, Education, Agriculture & Rural Affairs, Research, Open-Source Verification, Fact-Check, Urdu & English, Copy Editing, Photo & Visuals, Audience & Social Media, SEO & Distribution, Ethics & Standards, and Security & Privacy.

These are separate model invocations, not 26 separately hosted services or long-running autonomous agents. AI review is not independent external verification. The admin browser tab must remain open while the sequence runs. Results currently exist in the browser response only; persistent storage and an approval queue are not implemented. Each run makes 26 model requests and consumes API usage.

The dashboard uses `api/admin/agent.js` for the 26-agent sequence. The older `api/admin/draft.js` endpoint remains as a legacy endpoint and is not used by the new dashboard. All results remain `PENDING_ADMIN_APPROVAL`; publishing is disabled.
 
## Required Vercel environment variables

- `OPENAI_API_KEY`
- `ADMIN_PASSWORD` (or legacy `ADMINPASSWORD`)

Never put secrets in source files, commits, browser code, or chat messages.

## Important limitations

Source discovery, persistent draft storage, a durable approval/rejection queue, independent external fact-checking integrations, and scheduled autonomous workflows still need implementation and testing. The 26 agent outputs are not saved after the browser session. Public Blob storage is intentionally not used for drafts and remains deferred.

No story is automatically published. Production publishing remains disabled pending explicit admin authorization.
