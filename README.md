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

The foundation draft endpoint coordinates seven editorial review roles:
1. Newsroom
2. Research
3. Fact-check
4. Urdu/English desk
5. Politics and world desk
6. Business, sports and technology desk
7. Standards editor

Draft generation requires source URLs and source excerpts. The endpoint labels every result `PENDING_ADMIN_APPROVAL`. It does not publish stories.

## Required Vercel environment variables

- `OPENAI_API_KEY`
- `ADMIN_PASSWORD` (or legacy `ADMINPASSWORD`)

Never put secrets in source files, commits, browser code, or chat messages.

## Important limitations

This is the first newsroom foundation, not a fully autonomous production system. Persistent editorial storage, source discovery/ingestion, independent fact-checking integrations, approval/publishing controls, and scheduled department workflows still need implementation and testing.

No story is automatically published. Production publishing remains disabled pending explicit admin authorization.
