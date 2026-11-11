# AI Chronicals News — Implementation & Data-Save Status

Updated: 2026-11-11
Repository: https://github.com/chdawoodkhalid28-hash/AI-Chronicals-News-
Working branch: `ai-newsroom-foundation`
Branch head: `6c98a117017b3d2a3752e6dbb7df678c457497b8`
Production branch: `main` exists at `1d9cd9a28b0c0725aeb1b67e8e47cfd1e91155f0`; it is not synchronized with the current preview branch implementation.

## Current implementation

- 26 department-specific training tracks and 130 specialist role assignments.
- One separate Department Head review invocation per department task.
- Seven task-scoped invocations per department: one independent search, five specialists, one Director review.
- Director PASS/REVISE/HOLD recommendation participates in the editorial status gate.
- Publication remains `DISABLED`; all newsroom packages remain `PENDING_ADMIN_APPROVAL`.
- Private knowledge store and keyword RAG are implemented on `ai-newsroom-foundation`. Only Admin-approved `kind=knowledge` records are retrieved. Draft and evaluation records are excluded.
- RAG retrieval returns up to five matching records from global and assigned-department namespaces. It is lexical/keyword retrieval, not vector embeddings or semantic embedding search.
- These are task-scoped model invocations, not 130 persistent background workers or separately fine-tuned models.

## Four rollout workstreams

| Workstream | Status | Evidence / blocker |
|---|---|---|
| Latest CI regression run | Passed | GitHub Actions run 43071350193: Department Team Safeguard Tests, 48 passed / 0 failed. Run 43071350155: Backend source checks, 48 passed / 0 failed. Both ran against branch head `bce16bc825507fcc79803aa3a4871529759e2bc4`. |
| Real API-backed department pilot | Blocked | Vercel environment metadata shows `OPENAI_API_KEY` entry with empty value. Admin must configure a valid key directly in Vercel; never paste it into chat or repository. |
| Activate/populate private memory and verify retrieval | Code implemented; activation pending | `BLOB_READ_WRITE_TOKEN` is connected. Admin-only endpoint is `POST /api/admin/knowledge`. Records are written only when Admin explicitly saves them; no seed records have been inserted in this implementation pass. Preview deployment and authenticated write/read verification remain pending. Vercel deployment API previously returned a 24-hour build-rate-limit retry block. |
| Production release | Not performed by this implementation pass | Requires current preview branch verification, real API-backed pilot, private memory read/write verification, code synchronization/review between branches, and explicit Admin release approval. No production deploy or secret mutation was made here. |

## CI details

- `.github/workflows/department-team-tests.yml` now supports push, pull-request and manual `workflow_dispatch` triggers.
- It installs dependencies and runs `npm test`.
- A test assertion originally expected an unrelated global memory record to match a wheat-only query. The test query was corrected to include the global record's approval term; the knowledge retrieval code was not weakened.
- The rerun passed all 48 tests.

## Branch synchronization warning

- `ai-newsroom-foundation` contains the current private knowledge store, Admin knowledge endpoint, and `@vercel/blob ^2.3.1` dependency.
- `main` is at `1d9cd9a28b0c0725aeb1b67e8e47cfd1e91155f0`; inspected main files show the older department-team implementation and `@vercel/blob ^2.0.0`, and the private knowledge endpoint/library are absent there.
- Do not assume a GitHub commit to `main` means the current preview implementation is deployed. Review and reconcile branch differences before any production release.

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
   - `.github/workflows/department-team-tests.yml` — push/PR/manual regression workflow.

2. **Dropbox master backups**
   - Primary Paper master: `AI CHRONICALS NEWS — MASTER WEBSITE BACKUP`, doc ID `id:HVxaWcXuMhkAAAAAAAAABg`, verified revision 44.
   - Secondary Paper source: `AI CHRONICALS NEWS — Website Master Backup (PDF Source)`, doc ID `id:HVxaWcXuMhkAAAAAAAAADA`, verified revision 7.
   - Dropbox remains documentation backup; two-way automated sync is not implemented.

3. **Vercel private storage**
   - Project: `ai-chronicals-news`, linked to this GitHub repository.
   - Private Blob store token is configured.
   - Future approved knowledge records use private namespace `acn-knowledge/<department>/<record-id>.json`.
   - No public URL is used for knowledge records. Do not store secrets, credentials, personal sensitive data or unpublished source identities in general-purpose memory.

4. **Vercel environment variables**
   - Private Blob read/write token is connected.
   - `OPENAI_API_KEY` is present as a variable entry but currently empty; real AI pilot cannot execute until Admin configures it.
   - Secret values are intentionally not copied into GitHub or Dropbox.

## Deployment status

- The latest inspected READY Vercel Preview belongs to commit `4845dbefe2ac11b1e18a0c73e9dd95f02d809b45`, not the current branch head.
- The latest branch commit does not have a matching Vercel deployment record.
- Vercel commit status reports build-rate-limit failure. Do not repeatedly retry while quota is blocked.
- The project currently has existing Vercel domains, but this does not prove the latest branch build is live.

## Admin knowledge API contract

- `POST /api/admin/knowledge` with Admin Bearer authentication.
- `action: "save"`: save a `knowledge` or `evaluation` record; default status is `draft`. Only Admin-supplied `status: "approved"` knowledge enters agent retrieval.
- `action: "search"`: retrieve matching approved knowledge for `global` or one of the 26 department keys.
- HTTPS is required for any source URL.
- Evaluation records are kept separate from agent knowledge retrieval.
- Runtime RAG failure is non-fatal to the newsroom task and is reported as a memory retrieval status; current web search remains independently required.

## Release safety

Do not merge or deploy Production until the latest CI is green, the API-backed pilot is run and reviewed, private memory writes/retrieval are verified on Preview, the branch differences are reconciled, and the Admin explicitly approves release. No agent may publish or bypass human approval.
