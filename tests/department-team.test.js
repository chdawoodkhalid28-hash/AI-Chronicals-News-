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
    if (payload.messages[0].content.includes("Department Head Agent")) {
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({"directorSummary":"Synthetic Director review only.","handoffChecks":["All five synthetic handoffs received."],"unresolvedIssues":[],"nextActions":["Continue controlled testing."],"recommendation":"REVISE"}) } }]
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
  assert.equal(calls.length, 7, "one search, five specialists and one Director review");
  assert.equal(res.body.ok, true);
  assert.equal(res.body.status, "REVISE");
  assert.equal(res.body.result.editorialStatus, "PENDING_ADMIN_APPROVAL");
  assert.equal(res.body.result.publication, "DISABLED");
  assert.equal(res.body.result.executionModel.specialistRoles, 5);
    assert.equal(res.body.result.executionModel.directorRole, "one distinct Department Head model invocation");
    assert.equal(res.body.result.directorReview.recommendation, "REVISE");
});


test("routes all 26 configured department keys through the same five-role pipeline", async () => {
  const departmentKeys = [
    "newsroom", "assignment_desk", "pakistan_desk", "provincial_local_desk",
    "politics_desk", "world_desk", "crime_desk", "courts_legal_desk",
    "business_economy_desk", "finance_markets_desk", "sports_desk",
    "technology_ai_desk", "science_health_desk", "climate_environment_desk",
    "education_desk", "agriculture_desk", "research_desk",
    "open_source_verification_desk", "fact_check_desk", "urdu_english_desk",
    "copy_editing_desk", "photo_visuals_desk", "audience_social_desk",
    "seo_distribution_desk", "ethics_standards_desk", "security_privacy_desk"
  ];
  const roleOutputs = [
    { keyFacts: [], timeline: [], context: "Synthetic only", claimsNeedingVerification: [], sourceLimitations: [] },
    { headline: "Synthetic headline", dek: "Synthetic department test", article: "Not for publication." },
    { overallStatus: "PASS", claimChecks: [{ claim: "Synthetic test", evidence: "Synthetic test source", status: "SUPPORTED_FOR_TEST" }], missingEvidence: [], riskNotes: [] },
    { visualConcept: "Synthetic graphic", layoutBrief: "No real data", infographicData: [], imagePrompt: "Synthetic", caption: "Test", altText: "Test", rightsAndAuthenticityChecks: [] },
    { contentOrder: [], websitePresentation: "Draft only", socialVariants: [], seoTitle: "Test", metaDescription: "Test", keywords: [] }
  ];
  let invocationCount = 0;
  globalThis.fetch = async (_url, options) => {
    const payload = JSON.parse(options.body);
    invocationCount++;
    if (payload.model === "gpt-5-search-api") {
      return new Response(JSON.stringify({
        choices: [{ message: {
          content: "Synthetic department research dossier.",
          annotations: [{ url_citation: { title: "Synthetic test source", url: "https://example.com/department-test" } }]
        } }]
      }), { status: 200 });
    }
    if (payload.messages[0].content.includes("Department Head Agent")) {
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({"directorSummary":"Synthetic Director review only.","handoffChecks":["All five synthetic handoffs received."],"unresolvedIssues":[],"nextActions":["Continue controlled testing."],"recommendation":"REVISE"}) } }]
      }), { status: 200 });
    }
    const roleIndex = (invocationCount - 2) % 5;
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(roleOutputs[roleIndex]) } }]
    }), { status: 200 });
  };

  for (const department of departmentKeys) {
    const res = responseRecorder();
    await handler(request({ body: {
      department,
      instruction: "Run a synthetic department routing and safeguard test",
      language: "en"
    } }), res);
    assert.equal(res.statusCode, 200, department + " should be accepted");
    assert.match(res.body.directorTitle, /^Director /);
    assert.equal(res.body.result.executionModel.specialistRoles, 5);
    assert.equal(res.body.result.editorialStatus, "PENDING_ADMIN_APPROVAL");
    assert.equal(res.body.result.publication, "DISABLED");
  }
  assert.equal(invocationCount, 26 * 7, "each department should run one search, five specialist calls and one Director review");
});
