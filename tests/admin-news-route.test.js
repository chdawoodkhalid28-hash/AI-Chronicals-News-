import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/admin/queue.js";

function responseRecorder() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
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

test("news CRUD route rejects unauthenticated requests before database access", async () => {
  process.env.ADMIN_PASSWORD = "route-test-password";
  let fetchCalls = 0;
  globalThis.fetch = async () => { fetchCalls++; throw new Error("database must not be called"); };
  const res = responseRecorder();

  await handler({ method: "GET", headers: {}, query: { resource: "news" } }, res);

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, "Admin authentication failed");
  assert.equal(res.headers["Cache-Control"], "no-store");
  assert.equal(fetchCalls, 0);
});

test("news CRUD route delegates an authenticated request to newsroom handler", async () => {
  process.env.ADMIN_PASSWORD = "route-test-password";
  process.env.SUPABASE_URL = "https://test-project.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY1 = "route-test-db-key";
  globalThis.fetch = async () => new Response("[]", {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
  const res = responseRecorder();

  await handler({
    method: "GET",
    headers: { authorization: "Bearer route-test-password" },
    query: { resource: "news" }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.items.length, 0);
  assert.equal(res.body.publication, "DISABLED");
});
