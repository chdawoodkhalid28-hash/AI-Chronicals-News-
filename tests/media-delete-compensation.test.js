import test from "node:test";
import assert from "node:assert/strict";
import { createGraphicsHandler } from "../api/admin/graphics.js";

function responseRecorder() {
  return {
    statusCode: 200, headers: {}, body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; }
  };
}

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;
const ASSET_ID = "123e4567-e89b-12d3-a456-426614174000";

test.afterEach(() => {
  process.env = { ...originalEnv };
  globalThis.fetch = originalFetch;
});

test("media deletion restores the private object when metadata deletion fails", async () => {
  process.env.ADMIN_PASSWORD = "graphics-test-password";
  process.env.SUPABASE_URL = "https://test-project.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY1 = "test-db-key";
  const originalBytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
  const calls = [];
  const handler = createGraphicsHandler({
    findMediaAsset: async id => [{ id, blob_pathname: "newsroom-uploads/recover-me.png", media_type: "image" }],
    getPrivateBlob: async pathname => {
      calls.push(["read", pathname]);
      return {
        statusCode: 200,
        contentType: "image/png",
        stream: new ReadableStream({
          start(controller) { controller.enqueue(originalBytes); controller.close(); }
        })
      };
    },
    deletePrivateBlob: async pathname => { calls.push(["delete-object", pathname]); },
    deleteMediaAsset: async () => { calls.push(["delete-metadata"]); throw new Error("synthetic metadata outage"); },
    restorePrivateBlob: async (pathname, bytes, contentType) => {
      calls.push(["restore-object", pathname, [...bytes], contentType]);
    }
  });
  const res = responseRecorder();

  await handler({
    method: "DELETE",
    headers: { authorization: "Bearer graphics-test-password" },
    query: { id: ASSET_ID }
  }, res);

  assert.equal(res.statusCode, 502);
  assert.match(res.body.detail, /synthetic metadata outage/);
  assert.deepEqual(calls, [
    ["read", "newsroom-uploads/recover-me.png"],
    ["delete-object", "newsroom-uploads/recover-me.png"],
    ["delete-metadata"],
    ["restore-object", "newsroom-uploads/recover-me.png", [...originalBytes], "image/png"]
  ]);
});

test("media deletion reports when both metadata deletion and object restoration fail", async () => {
  process.env.ADMIN_PASSWORD = "graphics-test-password";
  process.env.SUPABASE_URL = "https://test-project.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY1 = "test-db-key";
  const handler = createGraphicsHandler({
    findMediaAsset: async id => [{ id, blob_pathname: "newsroom-uploads/recover-me.png", media_type: "image" }],
    getPrivateBlob: async () => ({
      statusCode: 200,
      contentType: "image/png",
      stream: new ReadableStream({
        start(controller) { controller.enqueue(new Uint8Array([1, 2, 3])); controller.close(); }
      })
    }),
    deletePrivateBlob: async () => {},
    deleteMediaAsset: async () => { throw new Error("synthetic metadata outage"); },
    restorePrivateBlob: async () => { throw new Error("synthetic storage restore outage"); }
  });
  const res = responseRecorder();

  await handler({
    method: "DELETE",
    headers: { authorization: "Bearer graphics-test-password" },
    query: { id: ASSET_ID }
  }, res);

  assert.equal(res.statusCode, 502);
  assert.match(res.body.detail, /private object restoration failed/);
  assert.match(res.body.detail, /synthetic storage restore outage/);
});
