import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/admin/graphics.js";

function responseRecorder() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    sent: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    send(value) { this.sent = value; return this; }
  };
}

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

test.afterEach(() => {
  process.env = { ...originalEnv };
  globalThis.fetch = originalFetch;
});

test("private graphics library rejects unauthenticated reads before database access", async () => {
  process.env.ADMIN_PASSWORD = "graphics-test-password";
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("database must not be called"); };
  const res = responseRecorder();

  await handler({ method: "GET", headers: {}, query: {} }, res);

  assert.equal(res.statusCode, 401);
  assert.equal(calls, 0);
});

test("private graphics library returns metadata without public Blob URLs", async () => {
  process.env.ADMIN_PASSWORD = "graphics-test-password";
  process.env.BLOB_READ_WRITE_TOKEN = "test-blob-token";
  process.env.SUPABASE_URL = "https://test-project.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY1 = "test-db-key";
  globalThis.fetch = async (url, options) => {
    assert.match(String(url), /\/rest\/v1\/media_assets\?/);
    assert.equal(options.method || "GET", "GET");
    return new Response(JSON.stringify([{
      id: "123e4567-e89b-12d3-a456-426614174000",
      media_type: "image",
      alt_text: "Synthetic graphic",
      rights_status: "pending_review",
      created_at: "2026-11-19T00:00:00Z"
    }]), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const res = responseRecorder();

  await handler({
    method: "GET",
    headers: { authorization: "Bearer graphics-test-password" },
    query: {}
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.storage, "private");
  assert.equal(res.body.items.length, 1);
  assert.equal(res.body.items[0].rights_status, "pending_review");
  assert.equal("url" in res.body.items[0], false);
});

test("graphics generation refuses to incur image-generation cost if private storage is missing", async () => {
  process.env.ADMIN_PASSWORD = "graphics-test-password";
  process.env.OPENAI_API_KEY = "test-openai-key";
  process.env.BLOB_READ_WRITE_TOKEN = "";
  process.env.SUPABASE_URL = "https://test-project.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY1 = "test-db-key";
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("image generation must not run"); };
  const res = responseRecorder();

  await handler({
    method: "POST",
    headers: { authorization: "Bearer graphics-test-password" },
    body: { prompt: "A sufficiently long synthetic graphics prompt", director: "Agriculture" }
  }, res);

  assert.equal(res.statusCode, 503);
  assert.equal(calls, 0);
});
