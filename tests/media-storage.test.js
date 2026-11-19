import test from "node:test";
import assert from "node:assert/strict";
import { persistGeneratedImage } from "../lib/media-storage.js";

const originalEnv = { ...process.env };

test.afterEach(() => {
  process.env = { ...originalEnv };
});

test("generated graphics are uploaded privately and indexed with rights pending review", async () => {
  process.env.BLOB_READ_WRITE_TOKEN = "test-blob-token";
  process.env.SUPABASE_URL = "https://test-project.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY1 = "test-db-key";
  let uploaded;
  let inserted;
  const asset = await persistGeneratedImage({
    imageData: Buffer.from("synthetic-png").toString("base64"),
    headline: "Synthetic newsroom graphic",
    director: "Agriculture"
  }, {
    upload: async (pathname, bytes, options) => {
      uploaded = { pathname, bytes: Buffer.from(bytes), options };
      return { pathname };
    },
    insert: async record => {
      inserted = record;
      return [{ id: "123e4567-e89b-12d3-a456-426614174000", ...record }];
    }
  });

  assert.match(uploaded.pathname, /^newsroom-graphics\/.+\.png$/);
  assert.equal(uploaded.bytes.toString(), "synthetic-png");
  assert.equal(uploaded.options.access, "private");
  assert.equal(uploaded.options.contentType, "image/png");
  assert.equal(inserted.blob_pathname, uploaded.pathname);
  assert.equal(inserted.media_type, "image");
  assert.equal(inserted.rights_status, "pending_review");
  assert.equal(inserted.source_url, "");
  assert.equal(asset.id, "123e4567-e89b-12d3-a456-426614174000");
  assert.equal(asset.storage, "private-vercel-blob");
  assert.equal(asset.rightsStatus, "pending_review");
});

test("generated graphics roll back the private Blob object if metadata indexing fails", async () => {
  process.env.BLOB_READ_WRITE_TOKEN = "test-blob-token";
  process.env.SUPABASE_URL = "https://test-project.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY1 = "test-db-key";
  let removed = "";
  await assert.rejects(
    () => persistGeneratedImage({ imageData: "cG5n" }, {
      upload: async pathname => ({ pathname }),
      insert: async () => { throw new Error("synthetic database failure"); },
      remove: async pathname => { removed = pathname; }
    }),
    /synthetic database failure/
  );
  assert.match(removed, /^newsroom-graphics\/.+\.png$/);
});

test("generated graphics refuse to run when private storage is unavailable", async () => {
  delete process.env.BLOB_READ_WRITE_TOKEN;
  process.env.SUPABASE_URL = "https://test-project.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY1 = "test-db-key";
  await assert.rejects(
    () => persistGeneratedImage({ imageData: "cG5n" }, {
      upload: async () => { throw new Error("must not upload"); }
    }),
    error => error.statusCode === 503 && error.code === "BLOB_NOT_CONFIGURED"
  );
});
