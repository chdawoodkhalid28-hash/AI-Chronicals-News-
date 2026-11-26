import test from "node:test";
import assert from "node:assert/strict";
import worker from "../cloudflare/worker.js";

const ARTICLE_ID = "123e4567-e89b-42d3-a456-426614174000";
const origin = "https://preview.example";
const secret = "only-for-unit-tests";
const originalFetch = globalThis.fetch;
const limiter = { async limit() { return { success: true }; } };

function mockSupabase(resolver) {
  const calls = [];
  const fetch = async (input, options = {}) => {
    const url = new URL(String(input));
    const call = {
      table: url.pathname.split("/").pop(),
      method: options.method || "GET",
      query: url.searchParams,
      body: options.body ? JSON.parse(options.body) : undefined,
      headers: options.headers
    };
    calls.push(call);
    const result = await resolver(call, calls.length - 1);
    return new Response(JSON.stringify(result.data ?? result), {
      status: result.status || 200,
      headers: { "Content-Type": "application/json" }
    });
  };
  return { fetch, calls };
}

function envFor(fetch) {
  globalThis.fetch = fetch;
  return {
    ADMIN_PASSWORD: "test-admin-password",
    ADMIN_SESSION_SECRET: secret,
    LOGIN_RATE_LIMITER: limiter,
    SUPABASE_URL: "https://test-project.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role-secret",
    OFFICIAL_SOURCE_DOMAINS: "gov.example",
    fetch
  };
}

async function cookieFor(env) {
  const response = await worker.fetch(new Request(origin + "/api/admin/access", {
    method: "POST",
    headers: {
      Origin: origin,
      "CF-Connecting-IP": "192.0.2.10",
      Authorization: "Bearer test-admin-password"
    }
  }), env);
  assert.equal(response.status, 200);
  return response.headers.get("set-cookie").match(/acn_admin_session=([^;]+)/)[1];
}

async function request(env, cookie, method, path = "/api/admin/news", body) {
  const response = await worker.fetch(new Request(origin + path, {
    method,
    headers: {
      Cookie: "acn_admin_session=" + cookie,
      ...(body === undefined ? {} : { "Content-Type": "application/json", Origin: origin })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  }), env);
  return { response, body: await response.json() };
}

function article(overrides = {}) {
  return {
    headline: "A sufficiently detailed newsroom headline",
    summary: "Synthetic summary",
    body: "Synthetic body",
    language: "en",
    category: "technology",
    assignedDesk: "technology_ai_desk",
    sources: [
      { url: "https://one.example/story", title: "Source One" },
      { url: "https://two.example/story", title: "Source Two" }
    ],
    ...overrides
  };
}

test.afterEach(() => { globalThis.fetch = originalFetch; });

test("news API is protected by the signed Admin session", async () => {
  const { fetch } = mockSupabase(() => { throw new Error("database must not be called"); });
  const env = envFor(fetch);
  const result = await request(env, "invalid-cookie", "GET");
  assert.equal(result.response.status, 401);
  assert.equal(result.body.error, "Admin session required");
});

test("GET returns articles and grouped source records through the legacy queue route", async () => {
  const { fetch, calls } = mockSupabase(({ table }) => table === "news_articles"
    ? [{ id: ARTICLE_ID, headline: "Stored headline", editorial_status: "pending_verification", publication_status: "disabled" }]
    : [{ article_id: ARTICLE_ID, source_url: "https://one.example/story" }]);
  const env = envFor(fetch);
  const cookie = await cookieFor(env);
  const result = await request(env, cookie, "GET", "/api/admin/queue?resource=news");
  assert.equal(result.response.status, 200);
  assert.equal(result.body.items.length, 1);
  assert.equal(result.body.items[0].sources.length, 1);
  assert.equal(result.body.publication, "DISABLED");
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.headers.apikey === "test-service-role-secret"));
  assert.ok(calls.every(call => call.headers.Authorization === "Bearer test-service-role-secret"));
});

test("POST creates a draft with source attribution and keeps publication disabled", async () => {
  const { fetch, calls } = mockSupabase(({ table, method, body }) => {
    if (table === "news_articles" && method === "POST") {
      assert.equal(body.editorial_status, "pending_verification");
      assert.equal(body.publication_status, "disabled");
      return { data: [{ id: ARTICLE_ID, ...body }] };
    }
    return { data: [] };
  });
  const env = envFor(fetch);
  const cookie = await cookieFor(env);
  const result = await request(env, cookie, "POST", "/api/admin/news", { article: article() });
  assert.equal(result.response.status, 201);
  assert.equal(result.body.item.sources.length, 2);
  assert.equal(result.body.publication, "DISABLED");
  assert.equal(calls.filter(call => call.method === "POST").length, 3);
});

test("POST rejects invalid or untrusted source URLs before database writes", async () => {
  let calls = 0;
  const env = envFor(async () => { calls++; throw new Error("database must not be called"); });
  const cookie = await cookieFor(env);
  const result = await request(env, cookie, "POST", "/api/admin/news", {
    article: article({ sources: ["http://insecure.example/news"] })
  });
  assert.equal(result.response.status, 400);
  assert.equal(calls, 0);
});

test("verification requires two distinct publishers or one configured official domain", async () => {
  const { fetch } = mockSupabase(({ table, method }) => {
    if (table === "news_articles" && method === "GET") return [{ id: ARTICLE_ID, editorial_status: "pending_verification" }];
    if (table === "news_sources") return [
      { source_url: "https://same.example/one", publisher: "forged-one" },
      { source_url: "https://same.example/two", publisher: "forged-two" }
    ];
    return { data: [] };
  });
  const env = envFor(fetch);
  const cookie = await cookieFor(env);
  const result = await request(env, cookie, "PATCH", "/api/admin/news", { id: ARTICLE_ID, editorialStatus: "verified" });
  assert.equal(result.response.status, 409);
  assert.equal(result.body.publication, "DISABLED");
});

test("verification accepts configured official domains and never enables publishing", async () => {
  const { fetch } = mockSupabase(({ table, method, body }) => {
    if (table === "news_articles" && method === "GET") return [{ id: ARTICLE_ID, editorial_status: "pending_verification" }];
    if (table === "news_sources") return [{ source_url: "https://sub.gov.example/notice" }];
    if (table === "news_articles" && method === "PATCH") {
      assert.equal(body.editorial_status, "verified");
      assert.equal(body.publication_status, "disabled");
      return [{ id: ARTICLE_ID, ...body }];
    }
    return { data: [] };
  });
  const env = envFor(fetch);
  const cookie = await cookieFor(env);
  const result = await request(env, cookie, "PATCH", "/api/admin/news", { id: ARTICLE_ID, editorialStatus: "verified", note: "Official notice" });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.item.publication_status, "disabled");
  assert.equal(result.body.publication, "DISABLED");
});

test("approval before verification is rejected", async () => {
  const { fetch } = mockSupabase(({ table, method }) => {
    if (table === "news_articles" && method === "GET") return [{ id: ARTICLE_ID, editorial_status: "pending_verification" }];
    if (table === "news_sources") return [];
    return { data: [] };
  });
  const env = envFor(fetch);
  const cookie = await cookieFor(env);
  const result = await request(env, cookie, "PATCH", "/api/admin/news", { id: ARTICLE_ID, editorialStatus: "approved_not_published" });
  assert.equal(result.response.status, 409);
});

test("DELETE requires explicit confirmation and a valid UUID", async () => {
  let calls = 0;
  const env = envFor(async () => { calls++; return new Response("[]"); });
  const cookie = await cookieFor(env);
  const invalid = await request(env, cookie, "DELETE", "/api/admin/news", { id: "not-a-uuid", confirmDelete: true });
  assert.equal(invalid.response.status, 400);
  assert.equal(calls, 0);
});

test("missing Supabase secrets fail closed without disclosing secrets", async () => {
  const env = envFor(async () => { throw new Error("database must not be called"); });
  delete env.SUPABASE_SERVICE_ROLE_KEY;
  const cookie = await cookieFor(env);
  const result = await request(env, cookie, "GET");
  assert.equal(result.response.status, 503);
  assert.equal(result.body.code, "SUPABASE_NOT_CONFIGURED");
  assert.equal(JSON.stringify(result.body).includes("test-service-role-secret"), false);
});

test("news route is not available for unauthenticated requests, and publishing remains disabled", async () => {
  const { fetch } = mockSupabase(() => []);
  const env = envFor(fetch);
  const health = await worker.fetch(new Request(origin + "/api/health"), env);
  const body = await health.json();
  assert.equal(body.capabilities.newsCrud, true);
  assert.equal(body.publishing, "DISABLED");
});
