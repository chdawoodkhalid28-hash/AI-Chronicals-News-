import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/admin/department-team.js";

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

function request({ method = "POST", authorization = "Bearer pilot-admin", body = {} } = {}) {
  return { method, headers: { authorization }, body };
}

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

test.beforeEach(() => {
  process.env.ADMIN_PASSWORD = "pilot-admin";
  process.env.OPENAI_API_KEY = "pilot-test-key";
});

test.afterEach(() => {
  process.env = { ...originalEnv };
  globalThis.fetch = originalFetch;
});

test("rejects non-POST requests without calling AI", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("unexpected fetch"); };
  const res = responseRecorder();
  await handler(request({ method: "GET" }), res);
  assert.equal(res.statusCode, 405);
  assert.equal(calls, 0);
});

test("rejects unauthenticated requests", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("unexpected fetch"); };
  const res = responseRecorder();
  await handler(request({ authorization: "Bearer wrong" }), res);
  assert.equal(res.statusCode, 401);
  assert.equal(calls, 0);
});

test("rejects unknown departments and short instructions before AI calls", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("unexpected fetch"); };

  const unknown = responseRecorder();
  await handler(request({ body: { department: "not_a_department", instruction: "Research this topic" } }), unknown);
  assert.equal(unknown.statusCode, 400);

  const short = responseRecorder();
  await handler(request({ body: { department: "newsroom", instruction: "short" } }), short);
  assert.equal(short.statusCode, 400);
  assert.equal(calls, 0);
});

test("holds the package when search has no citable HTTPS source", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(JSON.stringify({
      choices: [{ message: { content: "A synthetic pilot research brief.", annotations: [] } }]
    }), { status: 200 });
  };

  const res = responseRecorder();
  await handler(request({ body: { department: "newsroom", instruction: "Review a synthetic public policy scenario" } }), res);
  assert.equal(res.statusCode, 422);
  assert.equal(res.body.status, "HOLD");
  assert.equal(calls, 1);
});

test("runs five separate specialist invocations and keeps the package unpublished", async () => {
  const calls = [];
  const roleOutputs = [
    { keyFacts: [], timeline: [], context: "Synthetic test only", claimsNeedingVerification: ["Test claim"], sourceLimitations: [] },
    { headline: "Synthetic pilot headline", dek: "Synthetic test only", article: "Not for publication." },
    { overallStatus: "REVISE", claimChecks: [{ claim: "Test claim", evidence: "Synthetic only", status: "NOT_CHECKABLE" }], missingEvidence: ["No real evidence supplied"], riskNotes: [] },
    { visualConcept: "Test graphic", layoutBrief: "No real data", infographicData: [], imagePrompt: "Synthetic test", caption: "Test", altText: "Test", rightsAndAuthenticityChecks: [] },
    { contentOrder: [], websitePresentation: "Draft only", socialVariants: [], seoTitle: "Test", metaDescription: "Test", keywords: [] }
  ];

  globalThis.fetch = async (_url, options) => {
    const payload = JSON.parse(options.body);
    calls.push(payload);
    if (payload.model === "gpt-5-search-api") {
      return new Response(JSON.stringify({
        choices: [{ message: {
          content: "Synthetic research dossier. No real-world claim is asserted.",
          annotations: [{ url_citation: { title: "Synthetic source placeholder", url: "https://example.com/pilot-source" } }]
        } }]
      }), { status: 200 });
    }
    const roleIndex = calls.length - 2;
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(roleOutputs[roleIndex]) } }]
    }), { status: 200 });
  };

  const res = responseRecorder();
  await handler(request({ body: {
    department: "newsroom",
    instruction: "Run the synthetic newsroom pilot and report evidence limitations",
    centralBrief: "Synthetic context only",
    language: "en"
  } }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(calls.length, 6, "one search plus five specialist calls");
  assert.equal(res.body.ok, true);
  assert.equal(res.body.status, "REVISE");
  assert.equal(res.body.result.editorialStatus, "PENDING_ADMIN_APPROVAL");
  assert.equal(res.body.result.publication, "DISABLED");
  assert.equal(res.body.result.executionModel.specialistRoles, 5);
});
