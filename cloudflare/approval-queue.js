const PREFIX = "approval-queue/";
const MAX_RECORD_BYTES = 3_000_000;
const MAX_RECORDS = 20;
const DECISIONS = new Set([
  "PENDING_ADMIN_REVIEW",
  "APPROVED_BY_ADMIN — NOT PUBLISHED",
  "REVISION_REQUIRED"
]);

const json = (status, payload, headers = {}) => new Response(JSON.stringify(payload), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...headers
  }
});

function validId(value) {
  return typeof value === "string" && /^run-[A-Za-z0-9_-]{1,100}$/.test(value);
}

function validItem(item) {
  return Boolean(
    item && typeof item === "object" && !Array.isArray(item) &&
    validId(item.id) &&
    item.payload && typeof item.payload === "object" && !Array.isArray(item.payload) &&
    item.payload.buland && typeof item.payload.buland === "object" && !Array.isArray(item.payload.buland) &&
    item.payload.executionSummary && typeof item.payload.executionSummary === "object" && !Array.isArray(item.payload.executionSummary) &&
    item.payload.departmentTeams && typeof item.payload.departmentTeams === "object"
  );
}

function sanitizeItem(item) {
  const payload = JSON.parse(JSON.stringify(item.payload));
  payload.executionSummary.publication = "DISABLED";
  payload.executionSummary.editorialStatus = "PENDING_ADMIN_APPROVAL";
  const safe = {
    id: item.id,
    savedAt: typeof item.savedAt === "string" ? item.savedAt.slice(0, 64) : new Date().toISOString(),
    instruction: String(item.instruction || "").slice(0, 2000),
    completedDepartments: Math.max(0, Math.min(26, Number(item.completedDepartments) || 0)),
    decision: DECISIONS.has(item.decision) ? item.decision : "PENDING_ADMIN_REVIEW",
    payload
  };
  if (typeof item.decisionAt === "string") safe.decisionAt = item.decisionAt.slice(0, 64);
  if (new TextEncoder().encode(JSON.stringify(safe)).byteLength > MAX_RECORD_BYTES) {
    throw Object.assign(new Error("Queue record is too large"), { status: 413 });
  }
  return safe;
}

async function readRecord(bucket, id) {
  const object = await bucket.get(PREFIX + id + ".json");
  if (!object) return null;
  try {
    const item = JSON.parse(await object.text());
    return validItem(item) ? sanitizeItem(item) : null;
  } catch {
    return null;
  }
}

async function writeRecord(bucket, item) {
  await bucket.put(PREFIX + item.id + ".json", JSON.stringify(item), {
    httpMetadata: { contentType: "application/json; charset=utf-8" }
  });
}

async function readAllRecords(bucket) {
  const keys = [];
  let cursor;
  for (let pageNumber = 0; pageNumber < 5; pageNumber++) {
    const page = await bucket.list({ prefix: PREFIX, limit: 100, ...(cursor ? { cursor } : {}) });
    for (const object of page.objects || []) {
      if (object.key && object.key.endsWith(".json")) keys.push(object.key);
    }
    if (!page.truncated || !page.cursor) break;
    cursor = page.cursor;
  }
  const records = [];
  for (const key of keys.slice(0, 100)) {
    const id = key.slice(PREFIX.length, -5);
    if (!validId(id)) continue;
    const item = await readRecord(bucket, id);
    if (item) records.push(item);
  }
  return records.sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt))).slice(0, MAX_RECORDS);
}

async function readJson(request) {
  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (declaredLength > MAX_RECORD_BYTES) {
    throw Object.assign(new Error("Request body is too large"), { status: 413 });
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_RECORD_BYTES) {
    throw Object.assign(new Error("Request body is too large"), { status: 413 });
  }
  try { return raw ? JSON.parse(raw) : {}; }
  catch { throw Object.assign(new Error("Invalid JSON body"), { status: 400 }); }
}

export async function handleQueueRequest(request, env) {
  if (["POST", "PATCH", "DELETE"].includes(request.method)) {
    const origin = request.headers.get("Origin");
    if (!origin || origin !== new URL(request.url).origin) {
      return json(403, { ok: false, error: "Same-origin request required" });
    }
  }
  const bucket = env.APPROVAL_QUEUE;
  if (!bucket) return json(503, { ok: false, error: "PRIVATE_R2_BUCKET_NOT_CONFIGURED" });

  try {
    if (request.method === "GET") {
      const items = await readAllRecords(bucket);
      return json(200, { ok: true, items, count: items.length, publication: "DISABLED" });
    }

    if (request.method === "POST") {
      const body = await readJson(request);
      if (!validItem(body.item)) return json(400, { ok: false, error: "Invalid approval queue record" });
      const item = sanitizeItem(body.item);
      await writeRecord(bucket, item);
      return json(200, { ok: true, item, publication: "DISABLED" });
    }

    if (request.method === "PATCH") {
      const body = await readJson(request);
      if (!validId(body.id) || !DECISIONS.has(body.decision)) {
        return json(400, { ok: false, error: "Invalid queue decision" });
      }
      const current = await readRecord(bucket, body.id);
      if (!current) return json(404, { ok: false, error: "Queue record not found" });
      current.decision = body.decision;
      current.decisionAt = new Date().toISOString();
      const item = sanitizeItem(current);
      await writeRecord(bucket, item);
      return json(200, { ok: true, item, publication: "DISABLED" });
    }

    if (request.method === "DELETE") {
      const body = await readJson(request);
      if (!validId(body.id)) return json(400, { ok: false, error: "Invalid queue record id" });
      await bucket.delete(PREFIX + body.id + ".json");
      return json(200, { ok: true, id: body.id, publication: "DISABLED" });
    }

    return json(405, { ok: false, error: "Method not allowed" }, { allow: "GET, POST, PATCH, DELETE" });
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 500;
    return json(status, { ok: false, error: status === 500 ? "Approval queue operation failed" : error.message });
  }
}
