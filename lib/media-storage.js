import { randomUUID } from "node:crypto";
import { supabaseStorageRequest } from "./supabase-storage.js";
import { supabaseRequest } from "./supabase-rest.js";

function storageError(message, code) {
  const error = new Error(message);
  error.statusCode = 503;
  error.code = code;
  return error;
}

export async function persistGeneratedImage(input, adapters = {}) {
  if (!process.env.SUPABASE_URL || !(process.env.SUPABASE_SERVICE_ROLE_KEY1 || process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    throw storageError("Supabase private media storage is not configured", "SUPABASE_NOT_CONFIGURED");
  }
  if (!input || typeof input.imageData !== "string" || !input.imageData.trim()) {
    const error = new Error("Generated image data is required");
    error.statusCode = 400;
    throw error;
  }

  const bucket = process.env.SUPABASE_MEDIA_BUCKET || "newsroom-private-media";
  const pathname = "newsroom-graphics/" + Date.now() + "-" + randomUUID() + ".png";
  const upload = adapters.upload || ((path, bytes) => supabaseStorageRequest("POST", bucket, path, bytes, "image/png"));
  const remove = adapters.remove || (path => supabaseStorageRequest("DELETE", bucket, path));
  const insert = adapters.insert || (record => supabaseRequest("media_assets", { method: "POST", body: record }));

  let uploadedPath = "";
  try {
    await upload(pathname, Buffer.from(input.imageData, "base64"));
    uploadedPath = pathname;
    const inserted = await insert({
      blob_pathname: uploadedPath,
      media_type: "image",
      alt_text: String(input.altText || input.headline || ("Editorial graphic for " + String(input.director || "newsroom"))).slice(0, 500),
      source_url: "",
      rights_status: "pending_review"
    });
    const asset = Array.isArray(inserted) ? inserted[0] : inserted;
    if (!asset || typeof asset.id !== "string") throw new Error("Supabase did not return the saved media asset ID");
    return { id: asset.id, pathname: uploadedPath, mediaType: "image", rightsStatus: "pending_review", storage: "supabase-private-storage" };
  } catch (error) {
    if (uploadedPath) {
      try { await remove(uploadedPath); } catch { /* Preserve the original error. */ }
    }
    throw error;
  }
}
