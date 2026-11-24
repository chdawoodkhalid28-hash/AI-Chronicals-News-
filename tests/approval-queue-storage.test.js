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
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("must not access database"); };
  const res = responseRecorder();
  await handler({ method: "GET", headers: {}, query: {} }, res);
  assert.equal(res.statusCode, 503);
  assert.equal(calls, 0);
});
