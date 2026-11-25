import test from "node:test";
import assert from "node:assert/strict";
import queueHandler from "../api/admin/queue.js";
import draftHandler from "../api/admin/draft.js";
import graphicsHandler from "../api/admin/graphics.js";

const originalEnv = { ...process.env };
const ADMIN_TOKEN = "synthetic-admin-token-for-route-smoke-tests";

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

function req(method, authorization, body = {}, query = {}) {
  return { method, headers: authorization ? { authorization } : {}, body, query };
}

test.beforeEach(() => {
  process.env.ADMIN_PASSWORD = ADMIN_TOKEN;
  process.env.OPENAI_API_KEY = "synthetic-not-used";
  process.env.SUPABASE_URL = "https://synthetic-project.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY1 = "synthetic-not-used";
});

test.after(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
});

for (const [name, handler] of [
  ["queue", queueHandler],
  ["draft", draftHandler],
  ["graphics", graphicsHandler]
]) {
  test(name + " rejects missing and incorrect admin credentials", async () => {
    for (const authorization of [undefined, "Bearer wrong-token"]) {
      const res = responseRecorder();
      await handler(req("POST", authorization, {}), res);
      assert.equal(res.statusCode, 401, name + " must reject invalid credentials");
    }
  });
}

test("queue accepts the synthetic admin token and validates before any database write", async () => {
  const res = responseRecorder();
  await queueHandler(req("POST", "Bearer " + ADMIN_TOKEN, { item: { id: "invalid" } }), res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /Invalid approval queue record/);
  assert.equal(res.body.publication, undefined);
});

test("draft accepts the synthetic admin token and rejects an invalid topic before calling an AI provider", async () => {
  const res = responseRecorder();
  await draftHandler(req("POST", "Bearer " + ADMIN_TOKEN, {
    topic: "short",
    sources: [{ title: "Synthetic", url: "https://example.invalid/source", excerpt: "Synthetic excerpt" }]
  }), res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /at least 8 characters/);
});

test("graphics accepts the synthetic admin token and rejects missing director before image generation", async () => {
  const res = responseRecorder();
  await graphicsHandler(req("POST", "Bearer " + ADMIN_TOKEN, {
    prompt: "A synthetic visual test prompt with enough characters",
    headline: "Synthetic test only"
  }), res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /department director is required/);
});

test("queue, draft, and graphics methods advertise allowed HTTP methods", async () => {
  const cases = [
    [queueHandler, "PUT", "GET, POST, PATCH, DELETE"],
    [draftHandler, "GET", "POST"],
    [graphicsHandler, "PUT", "GET, POST, DELETE"]
  ];
  for (const [handler, method, allowed] of cases) {
    const res = responseRecorder();
    await handler(req(method, "Bearer " + ADMIN_TOKEN), res);
    assert.equal(res.statusCode, 405);
    assert.equal(res.headers.Allow, allowed);
  }
});
