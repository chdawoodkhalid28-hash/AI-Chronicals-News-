# AI Chronicals News — Implementation & Data-Save Status

Updated: 2026-11-11
Repository: https://github.com/chdawoodkhalid28-hash/AI-Chronicals-News-
Working branch: `ai-newsroom-foundation`
Latest recorded branch commit: `098e20eda59bcc53f846d8e406a21282819a556b`
Production branch: unchanged

## Current implementation

- 26 department-specific training tracks and 130 specialist role assignments.
- One separate Department Head review invocation per department task.
- Seven task-scoped invocations per department: one independent search, five specialists, one Director review.
- Director PASS/REVISE/HOLD recommendation participates in the editorial status gate.
- Publication remains `DISABLED`; all newsroom packages remain `PENDING_ADMIN_APPROVAL`.
- Private knowledge store and keyword RAG added on the preview branch. Only Admin-approved `kind=knowledge` records are retrieved. Draft and evaluation records are not supplied to agents.
- RAG retrieval returns up to five matching records from global and assigned-department namespaces. It is lexical/keyword retrieval, not vector embeddings or semantic embedding search.

## Four outstanding workstreams

| Workstream | Status | Evidence / blocker |
|---|---|---|
| Latest CI regression run | Pending confirmation | Workflow installs dependencies and triggers on pushes to this branch; expanded test expects 26 × 7 = 182 mocked calls. Latest successful run has not yet been confirmed by the available run lookup. |
| Real API-backed department pilot | Blocked | Vercel environment metadata shows `OPENAI_API_KEY` entry with empty value. Admin must configure a valid key directly in Vercel; never paste it into chat or repository. |
| Activate/populate private memory and verify retrieval | Code implemented; activation pending | `BLOB_READ_WRITE_TOKEN` is connected. Admin-only endpoint is `POST /api/admin/knowledge`. Records are written only when Admin explicitly saves them; no seed records have been inserted in this implementation pass. Preview deployment and authenticated write/read verification remain pending. Vercel's Hobby API deployment quota is exhausted (more than 100 deployments in the daily window); the API returned a 24-hour retry period. The latest confirmed READY Preview is commit `4845dbefe2ac11b1e18a0c73e9dd95f02d809b45`. |
| Production release | Not performed | Requires successful latest CI, real pilot, verified Preview, explicit Admin release approval, then a controlled merge/deploy. No merge to `main`, secret mutation, or Production deployment was made. |

## Data storage and authoritative locations

1. **GitHub source of truth**
   - `training/130-subagent-training.md` — curriculum, role standards, Department Director workflow and implementation boundaries.
   - `training/26-department-practical-exercises.md` — 26 practical department exercises.
   - `api/admin/department-team.js` — runtime department/search/specialist/Director workflow and RAG retrieval integration.
   - `api/admin/knowledge.js` — Admin-only knowledge save/search API.
   - `lib/knowledge-store.js` — private Blob record storage and lexical RAG retrieval.
   - `tests/department-team.test.js` — department routing, Director and approval safeguards.
   - `tests/knowledge-store.test.js` — private writes, approved-only retrieval, global/department lookup and validation.
   - `package.json` — `@vercel/blob ^2.3.1` for private storage support.
   - `.github/workflows/department-team-tests.yml` — push/PR regression workflow.

2. **Dropbox master backups**
   - Primary Paper master: `AI CHRONICALS NEWS — MASTER WEBSITE BACKUP`, doc ID `id:HVxaWcXuMhkAAAAAAAAABg`, revision 41 after the 11 Nov update.
   - Secondary Paper source: `AI CHRONICALS NEWS — Website Master Backup (PDF Source)`, doc ID `id:HVxaWcXuMhkAAAAAAAAADA`, revision 5 after the 11 Nov update.
   - Both contain the current training/RAG status and rollout boundaries. Dropbox remains documentation backup; two-way automated sync is not implemented.

3. **Vercel private storage**
   - Project: `ai-chronicals-news`, linked to this GitHub repository.
   - Private Blob store token is configured.
   - Future approved knowledge records use private namespace `acn-knowledge/<department>/<record-id>.json`.
   - No public URL is used for knowledge records. Do not store secrets, credentials, personal sensitive data or unpublished source identities in general-purpose memory.

4. **Vercel environment variables**
   - A private Blob read/write token is connected.
   - `OPENAI_API_KEY` is present as a variable entry but currently empty; real AI pilot cannot execute until Admin configures it.
   - Secret values are intentionally not copied into GitHub or Dropbox.

## Admin knowledge API contract

- `POST /api/admin/knowledge` with Admin Bearer authentication.
- `action: "save"`: save a `knowledge` or `evaluation` record; default status is `draft`. Only Admin-supplied `status: "approved"` knowledge enters agent retrieval.
- `action: "search"`: retrieve matching approved knowledge for `global` or one of the 26 department keys.
- HTTPS is required for any source URL.
- Evaluation records are kept separate from agent knowledge retrieval.
- Runtime RAG failure is non-fatal to the newsroom task and is reported as a memory retrieval status; current web search remains independently required.

## Release safety

Do not merge or deploy Production until the latest CI is green, the API-backed pilot is run and reviewed, private memory writes/retrieval are verified on Preview, and the Admin explicitly approves release. No agent may publish or bypass human approval.
