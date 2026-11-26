import test from "node:test";
import assert from "node:assert/strict";
import worker from "../cloudflare/worker.js";

function assetBinding() {
  return {
    async fetch(request) {
      return new Response("STATIC_ASSET_OK:" + new URL(request.url).pathname, { status: 200 });
    }
  };
}

test("health endpoint is explicit that preview backend is not migrated", async () => {
  const response = await worker.fetch(
    new Request("https://preview.example/api/health"),
    { ASSETS: assetBinding() }
  );
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.status, "partial-preview");
  assert.equal(body.ok, false);
  assert.equal(body.backendMigration, "in_progress");
  assert.equal(body.capabilities.adminLoginRateLimitConfigured, false);
  assert.equal(body.publishing, "DISABLED");
});

test("unmigrated admin APIs require a valid session before returning migration status", async () => {
  const response = await worker.fetch(
    new Request("https://preview.example/api/admin/queue", { method: "GET" }),
    { ASSETS: assetBinding() }
  );
  const body = await response.json();
  assert.equal(response.status, 401);
  assert.equal(body.error, "Admin session required");
});

test("public static paths are served through the assets binding", async () => {
  const response = await worker.fetch(
    new Request("https://preview.example/admin.html"),
    { ASSETS: assetBinding() }
  );
  assert.equal(response.status, 200);
  assert.match(await response.text(), /STATIC_ASSET_OK:\/admin.html/);
});
