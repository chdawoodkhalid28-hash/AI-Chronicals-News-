import test from "node:test";
import assert from "node:assert/strict";
import { resolveTemplate } from "../api/admin/templateflyer-routing.js";
import graphicsHandler from "../api/admin/graphics.js";
import { readFile } from "node:fs/promises";

test("fixed directors retain their approved master", async () => {
  const result = await resolveTemplate("Director Politics", "sports");
  assert.equal(result.status, "ROUTED");
  assert.equal(result.template, "Politics & Government");
  assert.equal(result.routingSource, "fixed_director");
});

test("dynamic director inherits an explicitly assigned fixed desk", async () => {
  const result = await resolveTemplate("Research", "", { assignedDesk: "Politics" });
  assert.equal(result.status, "ROUTED");
  assert.equal(result.template, "Politics & Government");
  assert.equal(result.assignedDesk, "Politics");
  assert.equal(result.routingSource, "assigned_desk");
});

test("dynamic director keeps legacy story-beat routing when no desk is supplied", async () => {
  const result = await resolveTemplate("Fact-Check", "climate emergency");
  assert.equal(result.status, "ROUTED");
  assert.equal(result.template, "Weather & Disasters");
  assert.equal(result.routingSource, "story_beat");
});

test("dynamic assigned desk uses the verified story beat", async () => {
  const result = await resolveTemplate("Research", "courts", { assignedDesk: "Assignment Desk" });
  assert.equal(result.status, "ROUTED");
  assert.equal(result.template, "Courts & Judiciary");
  assert.equal(result.routingSource, "assigned_desk_story_beat");
});

test("unknown assigned desk is held", async () => {
  const result = await resolveTemplate("Research", "politics", { assignedDesk: "Imaginary Desk" });
  assert.equal(result.status, "HOLD");
  assert.equal(result.reason, "unknown_assigned_desk");
});

test("conflicting assigned desk cannot override a fixed director", async () => {
  const result = await resolveTemplate("Sports", "sports", { assignedDesk: "Politics" });
  assert.equal(result.status, "HOLD");
  assert.equal(result.reason, "assigned_desk_conflicts_with_fixed_director");
});

test("agriculture special routing remains unchanged", async () => {
  const normal = await resolveTemplate("Agriculture & Rural Affairs", "agriculture");
  const weather = await resolveTemplate("Agriculture & Rural Affairs", "climate emergency");
  assert.equal(normal.template, "Business & Economy");
  assert.equal(weather.template, "Weather & Disasters");
});

test("unmapped story beat remains on HOLD", async () => {
  const result = await resolveTemplate("Research", "unmapped topic");
  assert.equal(result.status, "HOLD");
  assert.equal(result.reason, "unmapped_story_beat");
});

test("director prefix normalization remains backward compatible", async () => {
  const result = await resolveTemplate("Director Research", "politics");
  assert.equal(result.status, "ROUTED");
  assert.equal(result.template, "Politics & Government");
});

test("graphics API rejects unmapped routing before any image-generation request", async () => {
  const originalFetch = globalThis.fetch;
  const originalPassword = process.env.ADMIN_PASSWORD;
  const originalKey = process.env.OPENAI_API_KEY;
  let fetchCalls = 0;
  globalThis.fetch = async () => { fetchCalls++; throw new Error("Unexpected upstream call in routing HOLD test"); };
  process.env.ADMIN_PASSWORD = "unit-test-admin";
  process.env.OPENAI_API_KEY = "unit-test-placeholder";
  const response = {
    statusCode: 200,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
  try {
    await graphicsHandler({
      method: "POST",
      headers: { authorization: "Bearer unit-test-admin" },
      body: { prompt: "A sufficiently long test prompt for a graphics request", director: "Research", storyBeat: "" }
    }, response);
    assert.equal(response.statusCode, 422);
    assert.equal(response.body.status, "HOLD");
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalPassword === undefined) delete process.env.ADMIN_PASSWORD; else process.env.ADMIN_PASSWORD = originalPassword;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey;
  }
});

test("all 26 configured directors resolve to one of the ten approved masters", async () => {
  const config = JSON.parse(await readFile(new URL("../graphics/templateflyer-routing.json", import.meta.url), "utf8"));
  for (const item of config.directors) {
    const result = await resolveTemplate(item.director, "politics");
    assert.equal(result.status, "ROUTED", item.director + " should resolve for a mapped politics beat");
    assert.ok(config.masters.includes(result.template), item.director + " resolved outside the approved master list");
  }
});

test("graphics API passes assigned desk routing and preserves the response contract using a mocked provider", async () => {
  const originalFetch = globalThis.fetch;
  const originalPassword = process.env.ADMIN_PASSWORD;
  const originalKey = process.env.OPENAI_API_KEY;
  let providerPrompt = "";
  globalThis.fetch = async (_url, options) => {
    providerPrompt = JSON.parse(options.body).prompt;
    return { ok: true, json: async () => ({ data: [{ b64_json: "dGVzdA==" }] }) };
  };
  process.env.ADMIN_PASSWORD = "unit-test-admin";
  process.env.OPENAI_API_KEY = "unit-test-placeholder";
  const response = {
    statusCode: 200,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
  try {
    await graphicsHandler({
      method: "POST",
      headers: { authorization: "Bearer unit-test-admin" },
      body: { prompt: "A sufficiently long test prompt for a graphics request", director: "Research", assignedDesk: "Politics", storyBeat: "" }
    }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.templateName, "Politics & Government");
    assert.equal(response.body.director, "Research");
    assert.equal(response.body.assignedDesk, "Politics");
    assert.match(providerPrompt, /Politics & Government/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalPassword === undefined) delete process.env.ADMIN_PASSWORD; else process.env.ADMIN_PASSWORD = originalPassword;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey;
  }
});
