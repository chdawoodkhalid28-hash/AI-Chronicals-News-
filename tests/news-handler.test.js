import test from "node:test";
import assert from "node:assert/strict";
import { handleNewsRequest } from "../lib/news-handler.js";

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
const ARTICLE_ID = "123e4567-e89b-12d3-a456-426614174000";

function setDatabaseConfig() {
  process.env.SUPABASE_URL = "https://test-project.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY1 = "test-only-secret";
}

function mockDatabase(resolver) {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const parsed = new URL(String(url));
    const call = {
      table: parsed.pathname.split("/").pop(),
      method: options.method || "GET",
      query: parsed.searchParams,
      body: options.body ? JSON.parse(options.body) : undefined,
      headers: options.headers || {}
    };
    calls.push(call);
    const result = await resolver(call, calls.length - 1);
    return new Response(JSON.stringify(result.data ?? result), {
      status: result.status || 200,
      headers: { "Content-Type": "application/json" }
    });
  };
  return calls;
}

function articleInput(overrides = {}) {
  return {
    headline: "A sufficiently detailed test headline",
    summary: "Synthetic summary",
    body: "Synthetic article body",
    language: "en",
    category: "Technology",
    assignedDesk: "technology_ai_desk",
    sources: [
      { url: "https://one.example/story", title: "Source One", publisher: "one.example" },
      { url: "https://two.example/story", title: "Source Two", publisher: "two.example" }
    ],
    ...overrides
  };
}

test.beforeEach(setDatabaseConfig);
test.afterEach(() => {
  process.env = { ...originalEnv };
  globalThis.fetch = originalFetch;
});

test("GET returns newsroom articles with their source records", async () => {
  const article = { id: ARTICLE_ID, headline: "Stored headline", editorial_status: "pending_verification", publication_status: "disabled" };
  const calls = mockDatabase(({ table }) => table === "news_articles"
    ? [article]
    : [{ article_id: ARTICLE_ID, source_url: "https://one.example/story", publisher: "one.example" }]);
  const res = responseRecorder();

  await handleNewsRequest({ method: "GET", query: {} }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.items.length, 1);
  assert.equal(res.body.items[0].sources.length, 1);
  assert.equal(res.body.publication, "DISABLED");
  assert.equal(calls.length, 2);
  assert.equal(calls.every(call => call.method === "GET"), true);
  assert.equal(calls.every(call => call.headers.apikey === "test-only-secret"), true);
});

test("POST creates a pending article, its sources and an editorial event", async () => {
  const calls = mockDatabase(({ table, method, body }) => {
    if (table === "news_articles" && method === "POST") {
      assert.equal(body.publication_status, "disabled");
      assert.equal(body.editorial_status, "pending_verification");
      return { data: [{ id: ARTICLE_ID, ...body }] };
    }
    return { data: [] };
  });
  const res = responseRecorder();

  await handleNewsRequest({ method: "POST", body: { article: articleInput() } }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.item.id, ARTICLE_ID);
  assert.equal(res.body.item.sources.length, 2);
  assert.equal(res.body.publication, "DISABLED");
  assert.equal(calls.length, 3);
  assert.equal(calls[1].table, "news_sources");
  assert.equal(calls[1].body.every(source => source.article_id === ARTICLE_ID), true);
  assert.equal(calls[2].table, "editorial_events");
});

test("POST compensates article and source writes when editorial event creation fails", async () => {
  const calls = mockDatabase(({ table, method }) => {
    if (table === "news_articles" && method === "POST") return { data: [{ id: ARTICLE_ID }] };
    if (table === "editorial_events" && method === "POST") return { status: 500, data: { message: "event insert failed" } };
    return { data: [] };
  });
  const res = responseRecorder();
  await handleNewsRequest({ method: "POST", body: { article: articleInput() } }, res);
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.publication, "DISABLED");
  assert.deepEqual(calls.map(call => [call.table, call.method]), [
    ["news_articles", "POST"], ["news_sources", "POST"], ["editorial_events", "POST"],
    ["news_sources", "DELETE"], ["news_articles", "DELETE"]
  ]);
});

test("POST compensates article creation when source insertion fails", async () => {
  const calls = mockDatabase(({ table, method }) => {
    if (table === "news_articles" && method === "POST") return { data: [{ id: ARTICLE_ID }] };
    if (table === "news_sources" && method === "POST") return { status: 500, data: { message: "source insert failed" } };
    return { data: [] };
  });
  const res = responseRecorder();
  await handleNewsRequest({ method: "POST", body: { article: articleInput() } }, res);
  assert.equal(res.statusCode, 502);
  assert.deepEqual(calls.map(call => [call.table, call.method]), [
    ["news_articles", "POST"], ["news_sources", "POST"],
    ["news_sources", "DELETE"], ["news_articles", "DELETE"]
  ]);
});

test("POST saves a source-less draft without inserting empty source rows", async () => {
  const calls = mockDatabase(({ table, method, body }) => {
    if (table === "news_articles" && method === "POST") {
      assert.equal(body.editorial_status, "pending_verification");
      assert.equal(body.publication_status, "disabled");
      return { data: [{ id: ARTICLE_ID, ...body }] };
    }
    return { data: [] };
  });
  const res = responseRecorder();

  await handleNewsRequest({
    method: "POST",
    body: { article: articleInput({ sources: [] }) }
  }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.item.sources.length, 0);
  assert.equal(res.body.item.editorial_status, "pending_verification");
  assert.equal(res.body.publication, "DISABLED");
  assert.deepEqual(calls.map(call => call.table), ["news_articles", "editorial_events"]);
});

test("POST rejects an invalid article before any database write", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("unexpected database call"); };
  const res = responseRecorder();

  await handleNewsRequest({ method: "POST", body: { article: { headline: "Short", sources: [] } } }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.publication, "DISABLED");
  assert.equal(calls, 0);
});

test("PATCH edit restores original article and sources if event insert fails", async () => {
  const calls = mockDatabase(({ table, method }) => {
    if (table === "news_articles" && method === "GET") return [{ id: ARTICLE_ID, headline: "Original", editorial_status: "draft" }];
    if (table === "news_sources" && method === "GET") return [{ article_id: ARTICLE_ID, source_url: "https://old.example", publisher: "old.example" }];
    if (table === "editorial_events" && method === "POST") return { status: 500, data: { message: "event failed" } };
    return { data: [] };
  });
  const res = responseRecorder();
  await handleNewsRequest({ method: "PATCH", body: { id: ARTICLE_ID, article: articleInput() } }, res);
  assert.equal(res.statusCode, 502);
  assert.deepEqual(calls.slice(-2).map(c => [c.table, c.method]), [["news_sources", "POST"], ["news_articles", "PATCH"]]);
  assert.equal(calls.at(-1).body.headline, "Original");
});

test("PATCH refuses verification without two independent publishers or one official source", async () => {
  const calls = mockDatabase(({ table, method }) => {
    if (table === "news_articles" && method === "GET") {
      return [{ id: ARTICLE_ID, editorial_status: "pending_verification" }];
    }
    if (table === "news_sources") return [{ publisher: "same.example", is_official: true, source_url: "https://untrusted.example/story" }];
    return [];
  });
  const res = responseRecorder();

  await handleNewsRequest({
    method: "PATCH",
    query: {},
    body: { id: ARTICLE_ID, editorialStatus: "verified", note: "Synthetic test" }
  }, res);

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.publication, "DISABLED");
  assert.equal(calls.some(call => call.method === "PATCH"), false);
});

test("PATCH records a verified editorial status while keeping publication disabled", async () => {
  const calls = mockDatabase(({ table, method, body }) => {
    if (table === "news_articles" && method === "GET") {
      return [{ id: ARTICLE_ID, editorial_status: "pending_verification" }];
    }
    if (table === "news_sources") {
      return [
        { publisher: "one.example", is_official: false, source_url: "https://one.example/story" },
        { publisher: "two.example", is_official: false, source_url: "https://two.example/story" }
      ];
    }
    if (table === "news_articles" && method === "PATCH") {
      assert.equal(body.editorial_status, "verified");
      assert.equal(body.publication_status, "disabled");
      return [{ id: ARTICLE_ID, ...body }];
    }
    return [];
  });
  const res = responseRecorder();

  await handleNewsRequest({
    method: "PATCH",
    query: {},
    body: { id: ARTICLE_ID, editorialStatus: "verified", note: "Two distinct publishers supplied." }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.item.editorial_status, "verified");
  assert.equal(res.body.item.publication_status, "disabled");
  assert.equal(res.body.publication, "DISABLED");
  assert.equal(calls.some(call => call.table === "editorial_events" && call.method === "POST"), true);
});

test("DELETE requires explicit confirmation and checks that the article exists", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(JSON.stringify([{ id: ARTICLE_ID }]), { status: 200 });
  };
  const rejected = responseRecorder();
  await handleNewsRequest({ method: "DELETE", body: { id: ARTICLE_ID, confirmDelete: false } }, rejected);
  assert.equal(rejected.statusCode, 400);
  assert.equal(calls, 0);

  const sequence = [];
  globalThis.fetch = async (_url, options = {}) => {
    sequence.push(options.method || "GET");
    return new Response(JSON.stringify([]), { status: 200 });
  };
  const accepted = responseRecorder();
  await handleNewsRequest({ method: "DELETE", body: { id: ARTICLE_ID, confirmDelete: true } }, accepted);
  assert.equal(accepted.statusCode, 404);
  assert.deepEqual(sequence, ["GET"]);
});

test("DELETE removes only an existing article after explicit confirmation", async () => {
  const sequence = [];
  globalThis.fetch = async (_url, options = {}) => {
    sequence.push(options.method || "GET");
    return new Response(JSON.stringify([{ id: ARTICLE_ID }]), { status: 200 });
  };
  const res = responseRecorder();

  await handleNewsRequest({ method: "DELETE", body: { id: ARTICLE_ID, confirmDelete: true } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.deletedId, ARTICLE_ID);
  assert.equal(res.body.publication, "DISABLED");
  assert.deepEqual(sequence, ["GET", "DELETE"]);
});
