import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/admin/queue.js";

function responseRecorder() {
  return {
    statusCode: 200, headers: {}, body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; }
  };
}

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;
test.afterEach(() => {
  process.env = { ...originalEnv };
  globalThis.fetch = originalFetch;
});

function validItem(id = "run-test-123") {
  return {
    id,
    savedAt: "2026-11-24T00:00:00.000Z",
    instruction: "Test queue record",
    completedDepartments: 1,
    decision: "PENDING_ADMIN_REVIEW",
    payload: {
      buland: {},
      executionSummary: { publication: "ENABLED", editorialStatus: "DRAFT" },
      departmentTeams: {}
    }
  };
}

test("approval queue reads private Supabase records and forces publication disabled", async () => {
  process.env.ADMIN_PASSWORD = "queue-test-password";
  process.env.SUPABASE_URL = "https://test-project.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY1 = "sb_secret_test-key";
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options };
    return new Response(JSON.stringify([{ record: validItem() }]), {
      status: 200, headers: { "Content-Type": "application/json" }
    });
  };
  const res = responseRecorder();
  await handler({ method: "GET", headers: { authorization: "Bearer queue-test-password" }, query: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.count, 1);
  assert.equal(res.body.publication, "DISABLED");
  assert.equal(res.body.items[0].payload.executionSummary.publication, "DISABLED");
  assert.match(request.url, /\/rest\/v1\/approval_queue\?/);
  assert.equal(request.options.headers.apikey, "sb_secret_test-key");
  assert.equal("Authorization" in request.options.headers, false);
});

test("approval queue writes records to Supabase with publication disabled", async () => {
  process.env.ADMIN_PASSWORD = "queue-test-password";
  process.env.SUPABASE_URL = "https://test-project.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY1 = "sb_secret_test-key";
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options };
    return new Response(JSON.stringify([{ id: "run-test-123" }]), {
      status: 201, headers: { "Content-Type": "application/json" }
    });
  };
  const res = responseRecorder();
  await handler({
    method: "POST",
    headers: { authorization: "Bearer queue-test-password" },
    query: {},
    body: { item: validItem() }
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.publication, "DISABLED");
  assert.equal(res.body.item.payload.executionSummary.publication, "DISABLED");
  assert.match(request.url, /on_conflict=id/);
  const saved = JSON.parse(request.options.body);
  assert.equal(saved.id, "run-test-123");
  assert.equal(saved.record.payload.executionSummary.publication, "DISABLED");
});

test("approval queue rejects unauthenticated requests before database access", async () => {
  delete process.env.ADMIN_PASSWORD;
  delete process.env.ADMINPASSWORD;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("must not access database"); };
  const res = responseRecorder();
  await handler({ method: "GET", headers: {}, query: {} }, res);
  assert.equal(res.statusCode, 503);
  assert.equal(calls, 0);
});


test("approval queue PATCH updates only an allowed admin decision and preserves publication lock", async () => {
  process.env.ADMIN_PASSWORD = "queue-test-password";
  process.env.SUPABASE_URL = "https://test-project.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY1 = "sb_secret_test-key";
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (options.method === "GET") {
      return new Response(JSON.stringify([{ record: validItem() }]), { status: 200 });
    }
    return new Response(JSON.stringify([{ id: "run-test-123" }]), { status: 201 });
  };
  const res = responseRecorder();
  await handler({
    method: "PATCH",
    headers: { authorization: "Bearer queue-test-password" },
    query: {},
    body: { id: "run-test-123", decision: "APPROVED_BY_ADMIN — NOT PUBLISHED" }
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.item.decision, "APPROVED_BY_ADMIN — NOT PUBLISHED");
  assert.equal(res.body.item.payload.executionSummary.publication, "DISABLED");
  assert.equal(res.body.publication, "DISABLED");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.method || "GET", "GET");
  assert.equal(calls[1].options.method, "POST");
  const saved = JSON.parse(calls[1].options.body);
  assert.equal(saved.record.decision, "APPROVED_BY_ADMIN — NOT PUBLISHED");
  assert.equal(saved.record.payload.executionSummary.publication, "DISABLED");
});

test("approval queue DELETE removes only a validated run ID", async () => {
  process.env.ADMIN_PASSWORD = "queue-test-password";
  process.env.SUPABASE_URL = "https://test-project.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY1 = "sb_secret_test-key";
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options };
    return new Response(null, { status: 204 });
  };
  const res = responseRecorder();
  await handler({
    method: "DELETE",
    headers: { authorization: "Bearer queue-test-password" },
    query: {},
    body: { id: "run-test-123" }
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.publication, "DISABLED");
  assert.equal(request.options.method, "DELETE");
  assert.match(request.url, /id=eq\.run-test-123/);
});

test("approval queue rejects invalid PATCH decisions and malformed DELETE IDs before database access", async () => {
  process.env.ADMIN_PASSWORD = "queue-test-password";
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("must not access database"); };
  const patchRes = responseRecorder();
  await handler({
    method: "PATCH",
    headers: { authorization: "Bearer queue-test-password" },
    query: {},
    body: { id: "run-test-123", decision: "PUBLISH_NOW" }
  }, patchRes);
  assert.equal(patchRes.statusCode, 400);
  const deleteRes = responseRecorder();
  await handler({
    method: "DELETE",
    headers: { authorization: "Bearer queue-test-password" },
    query: {},
    body: { id: "../unsafe" }
  }, deleteRes);
  assert.equal(deleteRes.statusCode, 400);
  assert.equal(calls, 0);
});
