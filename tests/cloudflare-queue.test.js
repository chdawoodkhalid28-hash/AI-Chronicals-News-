import test from "node:test";
import assert from "node:assert/strict";
import worker from "../cloudflare/worker.js";

function makeBucket() {
  const records = new Map();
  return {
    records,
    async get(key) {
      const value = records.get(key);
      return value === undefined ? null : { async text() { return value; } };
    },
    async put(key, value) { records.set(key, String(value)); },
    async delete(key) { records.delete(key); },
    async list({ prefix }) {
      return {
        objects: [...records.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key })),
        truncated: false
      };
    }
  };
}

async function adminCookie(env) {
  const origin = "https://preview.example";
  const response = await worker.fetch(new Request(origin + "/api/admin/access", {
    method: "POST",
    headers: { Origin: origin, Authorization: "Bearer test-password-only" }
  }), env);
  assert.equal(response.status, 200);
  return response.headers.get("set-cookie").match(/acn_admin_session=([^;]+)/)[1];
}

function item(id = "run-test_001") {
  return {
    id,
    instruction: "Test draft",
    completedDepartments: 26,
    decision: "PENDING_ADMIN_REVIEW",
    payload: {
      buland: { status: "completed" },
      executionSummary: { publication: "SHOULD_BE_OVERRIDDEN", editorialStatus: "DRAFT" },
      departmentTeams: { newsroom: {} }
    }
  };
}

test("session-protected R2 approval queue supports create, list, decision and delete", async () => {
  const bucket = makeBucket();
  const env = {
    ADMIN_PASSWORD: "test-password-only",
    ADMIN_SESSION_SECRET: "test-session-secret-only",
    APPROVAL_QUEUE: bucket,
    ASSETS: { async fetch() { return new Response("asset"); } }
  };
  const origin = "https://preview.example";
  const cookie = await adminCookie(env);
  const headers = { Cookie: "acn_admin_session=" + cookie, "Content-Type": "application/json", Origin: origin };

  const created = await worker.fetch(new Request(origin + "/api/admin/queue", {
    method: "POST", headers, body: JSON.stringify({ item: item() })
  }), env);
  assert.equal(created.status, 200);
  const createdBody = await created.json();
  assert.equal(createdBody.publication, "DISABLED");
  assert.equal(createdBody.item.payload.executionSummary.publication, "DISABLED");
  assert.equal(createdBody.item.payload.executionSummary.editorialStatus, "PENDING_ADMIN_APPROVAL");

  const listed = await worker.fetch(new Request(origin + "/api/admin/queue", { headers: { Cookie: headers.Cookie } }), env);
  assert.equal(listed.status, 200);
  assert.equal((await listed.json()).count, 1);

  const patched = await worker.fetch(new Request(origin + "/api/admin/queue", {
    method: "PATCH", headers, body: JSON.stringify({ id: "run-test_001", decision: "APPROVED_BY_ADMIN — NOT PUBLISHED" })
  }), env);
  assert.equal(patched.status, 200);
  const patchedBody = await patched.json();
  assert.equal(patchedBody.item.decision, "APPROVED_BY_ADMIN — NOT PUBLISHED");
  assert.ok(patchedBody.item.decisionAt);
  assert.equal(patchedBody.publication, "DISABLED");

  const deleted = await worker.fetch(new Request(origin + "/api/admin/queue", {
    method: "DELETE", headers, body: JSON.stringify({ id: "run-test_001" })
  }), env);
  assert.equal(deleted.status, 200);
  assert.equal(bucket.records.size, 0);
});

test("queue rejects cross-origin state changes even with a valid session", async () => {
  const env = {
    ADMIN_PASSWORD: "test-password-only",
    ADMIN_SESSION_SECRET: "test-session-secret-only",
    APPROVAL_QUEUE: makeBucket(),
    ASSETS: { async fetch() { return new Response("asset"); } }
  };
  const origin = "https://preview.example";
  const cookie = await adminCookie(env);
  const response = await worker.fetch(new Request(origin + "/api/admin/queue", {
    method: "POST",
    headers: { Cookie: "acn_admin_session=" + cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ item: item() })
  }), env);
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, "Same-origin request required");
});

test("queue refuses access when private R2 bucket is not configured", async () => {
  const env = {
    ADMIN_PASSWORD: "test-password-only",
    ADMIN_SESSION_SECRET: "test-session-secret-only",
    ASSETS: { async fetch() { return new Response("asset"); } }
  };
  const origin = "https://preview.example";
  const cookie = await adminCookie(env);
  const response = await worker.fetch(new Request(origin + "/api/admin/queue", {
    headers: { Cookie: "acn_admin_session=" + cookie }
  }), env);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "PRIVATE_R2_BUCKET_NOT_CONFIGURED");
});

test("queue rejects malformed records and unsupported decisions", async () => {
  const env = {
    ADMIN_PASSWORD: "test-password-only",
    ADMIN_SESSION_SECRET: "test-session-secret-only",
    APPROVAL_QUEUE: makeBucket(),
    ASSETS: { async fetch() { return new Response("asset"); } }
  };
  const origin = "https://preview.example";
  const cookie = await adminCookie(env);
  const headers = { Cookie: "acn_admin_session=" + cookie, "Content-Type": "application/json" };

  const invalid = await worker.fetch(new Request(origin + "/api/admin/queue", {
    method: "POST", headers, body: JSON.stringify({ item: { id: "../escape" } })
  }), env);
  assert.equal(invalid.status, 400);

  const decision = await worker.fetch(new Request(origin + "/api/admin/queue", {
    method: "PATCH", headers, body: JSON.stringify({ id: "run-test_001", decision: "PUBLISHED" })
  }), env);
  assert.equal(decision.status, 400);
});
