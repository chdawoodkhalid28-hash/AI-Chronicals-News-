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


const UPLOAD_TYPES = new Map([
  ["image/png", { extension: "png", matches: bytes => bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) }],
  ["image/jpeg", { extension: "jpg", matches: bytes => bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff }],
  ["image/webp", { extension: "webp", matches: bytes => bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP" }]
]);

export async function persistUploadedImage(input, adapters = {}) {
  if (!process.env.SUPABASE_URL || !(process.env.SUPABASE_SERVICE_ROLE_KEY1 || process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    throw storageError("Supabase private media storage is not configured", "SUPABASE_NOT_CONFIGURED");
  }
  if (!input || typeof input.imageData !== "string" || !input.imageData.trim()) {
    const error = new Error("Image data is required");
    error.statusCode = 400;
    throw error;
  }
  const type = UPLOAD_TYPES.get(input.mimeType);
  if (!type) {
    const error = new Error("Only PNG, JPEG and WebP images are accepted");
    error.statusCode = 415;
    throw error;
  }
  const encoded = input.imageData.replace(/^data:image\/(?:png|jpeg|webp);base64,/i, "");
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    const error = new Error("Image data must be valid base64");
    error.statusCode = 400;
    throw error;
  }
  const bytes = Buffer.from(encoded, "base64");
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) {
    const error = new Error("Image must be between 1 byte and 5 MB");
    error.statusCode = 413;
    throw error;
  }
  if (!type.matches(bytes)) {
    const error = new Error("Image content does not match the declared file type");
    error.statusCode = 415;
    throw error;
  }

  const bucket = process.env.SUPABASE_MEDIA_BUCKET || "newsroom-private-media";
  const pathname = "newsroom-uploads/" + Date.now() + "-" + randomUUID() + "." + type.extension;
  const upload = adapters.upload || ((path, data) => supabaseStorageRequest("POST", bucket, path, data, input.mimeType));
  const remove = adapters.remove || (path => supabaseStorageRequest("DELETE", bucket, path));
  const insert = adapters.insert || (record => supabaseRequest("media_assets", { method: "POST", body: record }));
  let uploadedPath = "";
  try {
    await upload(pathname, bytes);
    uploadedPath = pathname;
    const inserted = await insert({
      blob_pathname: uploadedPath,
      media_type: "image",
      alt_text: String(input.altText || "Uploaded newsroom image").slice(0, 500),
      source_url: "",
      rights_status: "pending_review"
    });
    const asset = Array.isArray(inserted) ? inserted[0] : inserted;
    if (!asset || typeof asset.id !== "string") throw new Error("Supabase did not return the saved media asset ID");
    return { id: asset.id, pathname: uploadedPath, mediaType: "image", mimeType: input.mimeType, rightsStatus: "pending_review", storage: "supabase-private-storage" };
  } catch (error) {
    if (uploadedPath) {
      try { await remove(uploadedPath); } catch { /* Preserve the original error. */ }
    }
    throw error;
  }
}
