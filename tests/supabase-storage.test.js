import test from "node:test";
import assert from "node:assert/strict";
import {
  supabaseStorageRequest,
  getPrivateSupabaseObject,
  deletePrivateSupabaseObject,
  restorePrivateSupabaseObject
} from "../lib/supabase-storage.js";

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

test.afterEach(() => {
  process.env = { ...originalEnv };
  globalThis.fetch = originalFetch;
});

function configure() {
  process.env.SUPABASE_URL = "https://test-project.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY1 = "sb_secret_test-key";
  process.env.SUPABASE_MEDIA_BUCKET = "newsroom-private-media";
}

test("private storage upload uses the configured private bucket and secret-key header", async () => {
  configure();
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options };
    return new Response("", { status: 200 });
  };

  await supabaseStorageRequest(
    "POST",
    "newsroom-private-media",
    "newsroom-uploads/test image.png",
    Buffer.from("image-bytes"),
    "image/png"
  );

  assert.equal(
    request.url,
    "https://test-project.supabase.co/storage/v1/object/newsroom-private-media/newsroom-uploads/test%20image.png"
  );
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers.apikey, "sb_secret_test-key");
  assert.equal("Authorization" in request.options.headers, false);
  assert.equal(request.options.headers["Content-Type"], "image/png");
  assert.equal(request.options.headers["x-upsert"], "false");
  assert.equal(Buffer.from(request.options.body).toString(), "image-bytes");
});

test("legacy service-role JWT is sent as both apikey and bearer authorization", async () => {
  configure();
  process.env.SUPABASE_SERVICE_ROLE_KEY1 = "legacy-service-role-jwt";
  let headers;
  globalThis.fetch = async (_url, options) => {
    headers = options.headers;
    return new Response("", { status: 200 });
  };

  await supabaseStorageRequest("POST", "newsroom-private-media", "newsroom-graphics/test.png", Buffer.from("x"), "image/png");
  assert.equal(headers.apikey, "legacy-service-role-jwt");
  assert.equal(headers.Authorization, "Bearer legacy-service-role-jwt");
});

test("private object retrieval returns the storage response stream and content type", async () => {
  configure();
  const bytes = new Uint8Array([1, 2, 3]);
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options };
    return new Response(bytes, { status: 200, headers: { "Content-Type": "image/webp" } });
  };

  const result = await getPrivateSupabaseObject("newsroom-graphics/item.webp");
  assert.equal(request.options.method, "GET");
  assert.equal(request.options.headers.apikey, "sb_secret_test-key");
  assert.equal(result.contentType, "image/webp");
  assert.deepEqual([...new Uint8Array(await new Response(result.stream).arrayBuffer())], [1, 2, 3]);
});

test("private object deletion targets only the supplied object prefix", async () => {
  configure();
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options };
    return new Response("", { status: 200 });
  };

  await deletePrivateSupabaseObject("newsroom-uploads/item.jpg");
  assert.equal(request.url, "https://test-project.supabase.co/storage/v1/object/newsroom-private-media");
  assert.equal(request.options.method, "DELETE");
  assert.deepEqual(JSON.parse(request.options.body), { prefixes: ["newsroom-uploads/item.jpg"] });
});

test("private object restoration overwrites the same object with its original MIME type", async () => {
  configure();
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options };
    return new Response("", { status: 200 });
  };

  await restorePrivateSupabaseObject("newsroom-uploads/item.jpg", Buffer.from("original"), "image/jpeg");
  assert.equal(request.options.method, "PUT");
  assert.equal(request.url, "https://test-project.supabase.co/storage/v1/object/newsroom-private-media/newsroom-uploads/item.jpg");
  assert.equal(request.options.headers["x-upsert"], "true");
  assert.equal(request.options.headers["Content-Type"], "image/jpeg");
  assert.equal(Buffer.from(request.options.body).toString(), "original");
});

test("private storage rejects wrong buckets, insecure URLs, and unsupported methods", async () => {
  configure();
  await assert.rejects(
    () => supabaseStorageRequest("GET", "public", "item.png"),
    /Unexpected media bucket/
  );
  process.env.SUPABASE_URL = "http://test-project.supabase.co";
  await assert.rejects(
    () => supabaseStorageRequest("GET", "newsroom-private-media", "item.png"),
    /must use HTTPS/
  );
  process.env.SUPABASE_URL = "https://test-project.supabase.co";
  await assert.rejects(
    () => supabaseStorageRequest("PATCH", "newsroom-private-media", "item.png"),
    /Unsupported Supabase Storage operation/
  );
});

test("private storage failures surface bounded status and response details", async () => {
  configure();
  globalThis.fetch = async () => new Response("storage unavailable", { status: 503 });
  await assert.rejects(
    () => supabaseStorageRequest("GET", "newsroom-private-media", "newsroom-graphics/item.png"),
    error => error.statusCode === 502 && /503/.test(error.message) && /storage unavailable/.test(error.message)
  );
});
