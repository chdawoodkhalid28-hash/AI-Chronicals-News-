import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/health.js";

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

test("health endpoint reports configured capabilities without exposing secrets", async () => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
  const res = responseRecorder();
  await handler({ method: "GET", query: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.capabilities.supabaseConfigured, true);
  assert.equal(JSON.stringify(res.body).includes("test-service-role"), false);
});

test("Supabase probe refuses to run when database credentials are missing", async () => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = responseRecorder();
  await handler({ method: "GET", query: { supabase: "1" } }, res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.status, "not_configured");
});

test("Supabase probe confirms a read-only table query without returning records", async () => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
  let requestedUrl = "";
  globalThis.fetch = async (url, options) => {
    requestedUrl = String(url);
    assert.equal(options.method, "GET");
    assert.equal(options.headers.Authorization, "Bearer test-service-role");
    return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const res = responseRecorder();
  await handler({ method: "GET", query: { supabase: "1" } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, "connected");
  assert.equal(res.body.probe, "read_only_select");
  assert.match(requestedUrl, /news_articles\?select=id&limit=1$/);
  assert.equal("records" in res.body, false);
});

test("Supabase probe reports an unapplied schema without leaking database details", async () => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
  globalThis.fetch = async () => new Response(JSON.stringify({ message: "relation does not exist" }), {
    status: 404,
    headers: { "Content-Type": "application/json" }
  });
  const res = responseRecorder();
  await handler({ method: "GET", query: { supabase: "1" } }, res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.status, "schema_not_ready");
  assert.equal(JSON.stringify(res.body).includes("relation does not exist"), false);
});

test("Supabase probe identifies rejected credentials by status only", async () => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
  globalThis.fetch = async () => new Response(JSON.stringify({ message: "secret provider detail" }), {
    status: 401,
    headers: { "Content-Type": "application/json" }
  });
  const res = responseRecorder();
  await handler({ method: "GET", query: { supabase: "1" } }, res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.status, "credentials_rejected");
  assert.equal(res.body.upstreamStatus, 401);
  assert.equal(JSON.stringify(res.body).includes("secret provider detail"), false);
});

test("Supabase probe classifies network failures without exposing provider errors", async () => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
  globalThis.fetch = async () => { throw new Error("private network diagnostic"); };
  const res = responseRecorder();
  await handler({ method: "GET", query: { supabase: "1" } }, res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.status, "network_error");
  assert.equal(JSON.stringify(res.body).includes("private network diagnostic"), false);
});

test("Supabase probe classifies invalid project URL configuration", async () => {
  process.env.SUPABASE_URL = "not-a-url";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
  const res = responseRecorder();
  await handler({ method: "GET", query: { supabase: "1" } }, res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.status, "invalid_configuration");
});

test("Supabase probe distinguishes an HTTP URL from a secure project URL", async () => {
  process.env.SUPABASE_URL = "http://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
  const res = responseRecorder();
  await handler({ method: "GET", query: { supabase: "1" } }, res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.status, "invalid_configuration");
  assert.equal(res.body.reasonCode, "SUPABASE_URL_HTTPS_REQUIRED");
});

test("Gemini health probe classifies empty candidate responses without exposing payloads", async () => {
  process.env.GEMINI_API_KEY = "test-gemini-key";
  globalThis.fetch = async () => new Response(JSON.stringify({
    candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [] } }]
  }), { status: 200, headers: { "Content-Type": "application/json" } });
  const res = responseRecorder();
  await handler({ method: "GET", query: { gemini: "1" } }, res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.status, "empty_response");
  assert.equal(res.body.diagnostic.finishReason, "MAX_TOKENS");
  assert.equal(JSON.stringify(res.body).includes("test-gemini-key"), false);
});

test("full Supabase probe checks private approval and department knowledge tables too", async () => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
  const requestedTables = [];
  const requestedQueries = [];
  globalThis.fetch = async url => {
    const parsed = new URL(String(url));
    requestedTables.push(parsed.pathname.split("/").pop());
    requestedQueries.push(parsed.searchParams);
    return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const res = responseRecorder();
  await handler({ method: "GET", query: { supabase: "all" } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.connectedTables, 8);
  assert.equal(res.body.totalTables, 8);
  assert.deepEqual(new Set(requestedTables), new Set([
    "news_articles", "news_sources", "news_verification_checks",
    "editorial_events", "department_outputs", "media_assets",
    "approval_queue", "department_knowledge"
  ]));
  assert.equal(requestedQueries.every(query => query.get("limit") === "0"), true);
  const articlesQuery = requestedQueries[requestedTables.indexOf("news_articles")];
  assert.ok(articlesQuery.get("select").includes("publication_status"));
  assert.ok(articlesQuery.get("select").includes("created_by"));
  assert.equal(res.body.probe, "read_only_select_expected_columns");
  assert.equal(res.body.tables.every(table => table.columnsChecked > 0), true);
});

test("full Supabase probe identifies missing expected columns as schema mismatch", async () => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
  globalThis.fetch = async url => {
    const parsed = new URL(String(url));
    if (parsed.pathname.endsWith("/news_articles")) {
      return new Response(JSON.stringify({ message: "column created_by does not exist" }), {
        status: 400, headers: { "Content-Type": "application/json" }
      });
    }
    return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const res = responseRecorder();
  await handler({ method: "GET", query: { supabase: "all" } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.status, "partial_schema_or_access");
  assert.equal(res.body.tables.find(table => table.table === "news_articles").status, "schema_mismatch");
  assert.equal(JSON.stringify(res.body).includes("created_by does not exist"), false);
});
