import test from "node:test";
import assert from "node:assert/strict";
import { persistGeneratedImage, persistUploadedImage } from "../lib/media-storage.js";

const originalEnv = { ...process.env };

test.afterEach(() => {
  process.env = { ...originalEnv };
});

test("generated graphics are uploaded privately and indexed with rights pending review", async () => {
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
      uploaded = { pathname, bytes: Buffer.from(bytes) };
      return { pathname };
    },
    insert: async record => {
      inserted = record;
      return [{ id: "123e4567-e89b-12d3-a456-426614174000", ...record }];
    }
  });

  assert.match(uploaded.pathname, /^newsroom-graphics\/.+\.png$/);
  assert.equal(uploaded.bytes.toString(), "synthetic-png");
  assert.equal(inserted.blob_pathname, uploaded.pathname);
  assert.equal(inserted.media_type, "image");
  assert.equal(inserted.rights_status, "pending_review");
  assert.equal(inserted.source_url, "");
  assert.equal(asset.id, "123e4567-e89b-12d3-a456-426614174000");
  assert.equal(asset.storage, "supabase-private-storage");
  assert.equal(asset.rightsStatus, "pending_review");
});

test("generated graphics roll back the private Supabase object if metadata indexing fails", async () => {
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
  delete process.env.SUPABASE_SERVICE_ROLE_KEY1;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = "https://test-project.supabase.co";
  await assert.rejects(
    () => persistGeneratedImage({ imageData: "cG5n" }, {
      upload: async () => { throw new Error("must not upload"); }
    }),
    error => error.statusCode === 503 && error.code === "SUPABASE_NOT_CONFIGURED"
  );
});


test("manual image uploads validate PNG signatures and store privately for rights review", async () => {
  process.env.SUPABASE_URL = "https://test-project.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY1 = "test-db-key";
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
  let uploaded, inserted;
  const asset = await persistUploadedImage({
    imageData: png.toString("base64"),
    mimeType: "image/png",
    altText: "Uploaded test graphic"
  }, {
    upload: async (pathname, bytes) => { uploaded = { pathname, bytes: Buffer.from(bytes) }; },
    insert: async record => { inserted = record; return [{ id: "123e4567-e89b-12d3-a456-426614174000", ...record }]; }
  });
  assert.ok(uploaded.pathname.startsWith("newsroom-uploads/") && uploaded.pathname.endsWith(".png"));
  assert.deepEqual(uploaded.bytes, png);
  assert.equal(inserted.blob_pathname, uploaded.pathname);
  assert.equal(inserted.rights_status, "pending_review");
  assert.equal(inserted.source_url, "");
  assert.equal(asset.storage, "supabase-private-storage");
});

test("manual image uploads reject mismatched file signatures before storage", async () => {
  process.env.SUPABASE_URL = "https://test-project.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY1 = "test-db-key";
  let uploads = 0;
  await assert.rejects(
    () => persistUploadedImage({ imageData: Buffer.from("not a png").toString("base64"), mimeType: "image/png" }, {
      upload: async () => { uploads++; }
    }),
    error => error.statusCode === 415
  );
  assert.equal(uploads, 0);
});

test("manual image uploads roll back private objects if metadata insertion fails", async () => {
  process.env.SUPABASE_URL = "https://test-project.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY1 = "test-db-key";
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  let removed = "";
  await assert.rejects(
    () => persistUploadedImage({ imageData: png.toString("base64"), mimeType: "image/png" }, {
      upload: async pathname => ({ pathname }),
      insert: async () => { throw new Error("synthetic upload index failure"); },
      remove: async pathname => { removed = pathname; }
    }),
    /synthetic upload index failure/
  );
  assert.ok(removed.startsWith("newsroom-uploads/") && removed.endsWith(".png"));
});
