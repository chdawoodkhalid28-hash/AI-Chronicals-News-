import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/admin/knowledge.js";

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

test("knowledge rejects non-POST and unauthenticated requests before database access", async () => {
  process.env.ADMIN_PASSWORD = "knowledge-test-password";
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("database must not be called"); };
  const getRes = responseRecorder();
  await handler({ method: "GET", headers: {}, body: {} }, getRes);
  assert.equal(getRes.statusCode, 405);
  assert.equal(getRes.headers.Allow, "POST");
  const authRes = responseRecorder();
  await handler({ method: "POST", headers: {}, body: { action: "search", department: "global", query: "news" } }, authRes);
  assert.equal(authRes.statusCode, 401);
  assert.equal(calls, 0);
});

test("knowledge saves a draft by default to the private Supabase table", async () => {
  process.env.ADMIN_PASSWORD = "knowledge-test-password";
  process.env.SUPABASE_URL = "https://test-project.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY1 = "sb_secret_test-key";
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options };
    const saved = JSON.parse(options.body);
    return new Response(JSON.stringify([saved]), { status: 201, headers: { "Content-Type": "application/json" } });
  };
  const res = responseRecorder();
  await handler({
    method: "POST",
    headers: { authorization: "Bearer knowledge-test-password" },
    body: { action: "save", department: "agriculture_desk", title: "Wheat advisory", content: "Verify district and crop season." }
  }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.saved.status, "draft");
  assert.equal(request.options.method, "POST");
  assert.match(request.url, /\/rest\/v1\/department_knowledge/);
  const record = JSON.parse(request.options.body);
  assert.equal(record.department, "agriculture_desk");
  assert.equal(record.status, "draft");
  assert.equal(record.source_url, "");
});

test("knowledge search returns approved keyword matches only", async () => {
  process.env.ADMIN_PASSWORD = "knowledge-test-password";
  process.env.SUPABASE_URL = "https://test-project.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY1 = "sb_secret_test-key";
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options };
    return new Response(JSON.stringify([
      { id: "approved-1", department: "agriculture_desk", kind: "knowledge", title: "Wheat advisory", content: "Verify wheat crop season and district.", tags: ["wheat"], status: "approved", created_at: "2026-11-25T00:00:00Z" },
      { id: "draft-1", department: "agriculture_desk", kind: "knowledge", title: "Wheat draft", content: "Wheat notes.", tags: [], status: "draft", created_at: "2026-11-25T00:00:00Z" }
    ]), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const res = responseRecorder();
  await handler({
    method: "POST",
    headers: { authorization: "Bearer knowledge-test-password" },
    body: { action: "search", department: "agriculture_desk", query: "wheat crop" }
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.retrieval, "supabase-private-keyword-rag");
  assert.equal(res.body.vectorEmbeddings, false);
  assert.deepEqual(res.body.records.map(item => item.id), ["approved-1"]);
  assert.match(request.url, /department_knowledge/);
  assert.match(request.url, /department=in/);
});

test("knowledge rejects invalid departments without database access", async () => {
  process.env.ADMIN_PASSWORD = "knowledge-test-password";
  process.env.SUPABASE_URL = "https://test-project.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY1 = "sb_secret_test-key";
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("must not write"); };
  const res = responseRecorder();
  await handler({
    method: "POST",
    headers: { authorization: "Bearer knowledge-test-password" },
    body: { action: "save", department: "unknown_desk", title: "Invalid", content: "This must not be stored." }
  }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(calls, 0);
});
