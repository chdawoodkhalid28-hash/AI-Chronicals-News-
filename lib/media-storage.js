import { randomUUID } from "node:crypto";
import { del, put } from "@vercel/blob";
import { supabaseRequest } from "./supabase-rest.js";

function storageError(message, code) {
  const error = new Error(message);
  error.statusCode = 503;
  error.code = code;
  return error;
}

export async function persistGeneratedImage(input, adapters = {}) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw storageError("Private Blob storage is not configured", "BLOB_NOT_CONFIGURED");
  }
  if (!process.env.SUPABASE_URL || !(process.env.SUPABASE_SERVICE_ROLE_KEY1 || process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    throw storageError("Supabase media metadata storage is not configured", "SUPABASE_NOT_CONFIGURED");
  }
  if (!input || typeof input.imageData !== "string" || !input.imageData.trim()) {
    const error = new Error("Generated image data is required");
    error.statusCode = 400;
    throw error;
  }

  const pathname = "newsroom-graphics/" + Date.now() + "-" + randomUUID() + ".png";
  const upload = adapters.upload || ((path, bytes, options) => put(path, bytes, options));
  const remove = adapters.remove || (path => del(path, { access: "private" }));
  const insert = adapters.insert || (record => supabaseRequest("media_assets", {
    method: "POST",
    body: record
  }));

  let uploadedPath = "";
  try {
    const uploaded = await upload(pathname, Buffer.from(input.imageData, "base64"), {
      access: "private",
      addRandomSuffix: false,
      contentType: "image/png",
      cacheControlMaxAge: 60
    });
    uploadedPath = uploaded && uploaded.pathname ? uploaded.pathname : pathname;

    const inserted = await insert({
      blob_pathname: uploadedPath,
      media_type: "image",
      alt_text: String(input.altText || input.headline || ("Editorial graphic for " + String(input.director || "newsroom"))).slice(0, 500),
      source_url: "",
      rights_status: "pending_review"
    });
    const asset = Array.isArray(inserted) ? inserted[0] : inserted;
    if (!asset || typeof asset.id !== "string") {
      throw new Error("Supabase did not return the saved media asset ID");
    }

    return {
      id: asset.id,
      pathname: uploadedPath,
      mediaType: "image",
      rightsStatus: "pending_review",
      storage: "private-vercel-blob"
    };
  } catch (error) {
    if (uploadedPath) {
      try { await remove(uploadedPath); } catch { /* Keep the original storage error. */ }
    }
    throw error;
  }
}
