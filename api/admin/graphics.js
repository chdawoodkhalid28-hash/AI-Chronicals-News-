import { timingSafeEqual } from "node:crypto";
import { get } from "@vercel/blob";
import { supabaseRequest } from "../../lib/supabase-rest.js";
import { persistGeneratedImage } from "../../lib/media-storage.js";
import { resolveTemplate } from "./templateflyer-routing.js";

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !a || !b) return false;
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createGraphicsHandler({\n  persistImage = persistGeneratedImage,\n  listMediaAssets = query => supabaseRequest("media_assets", { query }),\n  findMediaAsset = assetId => supabaseRequest("media_assets", { query: new URLSearchParams({ select: "id,blob_pathname,media_type,rights_status", id: "eq." + assetId, limit: "1" }).toString() }),\n  getPrivateBlob = get\n} = {}) {
return async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST" && req.method !== "GET") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const expected = process.env.ADMIN_PASSWORD || process.env.ADMINPASSWORD;
  const supplied = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!safeEqual(supplied, expected)) return res.status(401).json({ error: "Admin authentication failed" });

  if (req.method === "GET") {
    if (!process.env.BLOB_READ_WRITE_TOKEN || !process.env.SUPABASE_URL ||
        !(process.env.SUPABASE_SERVICE_ROLE_KEY1 || process.env.SUPABASE_SERVICE_ROLE_KEY)) {
      return res.status(503).json({ error: "Private graphics storage is not fully configured" });
    }
    try {
      const assetId = typeof req.query?.id === "string" ? req.query.id : "";
      if (!assetId) {
        const items = await listMediaAssets(new URLSearchParams({
          select: "id,media_type,alt_text,rights_status,created_at",
          order: "created_at.desc",
          limit: "50"
        }).toString());
        return res.status(200).json({ ok: true, items: items || [], storage: "private", publication: "DISABLED" });
      }
      if (!/^[0-9a-f-]{36}$/i.test(assetId)) {
        return res.status(400).json({ error: "A valid media asset ID is required" });
      }
      const rows = await findMediaAsset(assetId);
      const asset = rows && rows[0];
      if (!asset) return res.status(404).json({ error: "Media asset not found" });
      const blob = await getPrivateBlob(asset.blob_pathname, { access: "private", useCache: false });
      if (!blob || blob.statusCode !== 200 || !blob.stream) {
        return res.status(404).json({ error: "Private media object not found" });
      }
      const bytes = Buffer.from(await new Response(blob.stream).arrayBuffer());
      res.setHeader("Content-Type", asset.media_type === "image" ? "image/png" : "application/octet-stream");
      res.setHeader("Content-Disposition", 'inline; filename="newsroom-graphic.png"');
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).send(bytes);
    } catch (error) {
      return res.status(Number.isInteger(error.statusCode) ? error.statusCode : 502)
        .json({ error: "Private graphics library request failed", detail: error.message });
    }
  }

  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: "OPENAI_API_KEY is not configured" });

  const body = req.body || {};
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const headline = typeof body.headline === "string" ? body.headline.trim().slice(0, 240) : "";
  const director = typeof body.director === "string" ? body.director.trim().slice(0, 120) : "";
  const storyBeat = typeof body.storyBeat === "string" ? body.storyBeat.trim().slice(0, 120) : "";
  const assignedDesk = typeof body.assignedDesk === "string" ? body.assignedDesk.trim().slice(0, 120) : "";
  if (prompt.length < 20 || prompt.length > 5000) {
    return res.status(400).json({ error: "Graphics prompt must contain 20 to 5000 characters" });
  }
  if (!director) return res.status(400).json({ error: "A department director is required for TemplateFlyer routing" });

  let route;
  try {
    route = await resolveTemplate(director, storyBeat, { assignedDesk });
  } catch (error) {
    return res.status(500).json({ error: "TemplateFlyer routing configuration could not be loaded", detail: error.message });
  }
  if (route.status !== "ROUTED" || !route.template) {
    return res.status(422).json({
      error: "Story beat is not mapped to an approved master TemplateFlyer. Hold for Assignment Desk.",
      status: "HOLD",
      director: route.director || director,
      storyBeat,
      reason: route.reason
    });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN || !process.env.SUPABASE_URL ||
      !(process.env.SUPABASE_SERVICE_ROLE_KEY1 || process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    return res.status(503).json({ error: "Private graphics storage is not fully configured; refusing to generate an unpersisted asset" });
  }

  const finalPrompt = [
    "Create one polished editorial news graphic for a professional digital newsroom.",
    "Use the approved AI Chronicals News master TemplateFlyer: " + route.template + ".",
    "Follow this department master consistently; do not invent a new department template or alter its identity.",
    "Use a clean, credible, modern visual-journalism style, strong hierarchy, restrained palette, excellent composition and legible negative space.",
    "Do not invent factual details, numbers, logos, flags, people, quotations, or document text. Avoid photorealistic depictions of identifiable real people.",
    "Do not add a publication logo or watermark. Prefer a visual illustration or infographic-style composition rather than text-heavy artwork.",
    headline ? "Story headline for context: " + headline : "",
    "Creative direction: " + prompt
  ].filter(Boolean).join("\n");

  try {
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env.OPENAI_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ model: "gpt-image-1", prompt: finalPrompt, size: "1024x1024", quality: "medium" })
    });
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data && data.error && data.error.message ? data.error.message : "Image generation failed");
      error.status = response.status === 429 ? 429 : 502;
      throw error;
    }
    const image = data && data.data && data.data[0] && data.data[0].b64_json;
    if (!image) throw new Error("Image provider returned no image data");
    const asset = await persistImage({
      imageData: image,
      headline,
      director: route.director,
      altText: typeof body.altText === "string" ? body.altText : headline
    });
    return res.status(200).json({
      ok: true,
      mimeType: "image/png",
      imageData: image,
      asset,
      templateName: route.template,
      director: route.director,
      storyBeat,
      assignedDesk: route.assignedDesk || "",
      rightsStatus: "pending_review",
      publication: "DISABLED"
    });
  } catch (error) {
    return res.status(error.status || error.statusCode || 502).json({
      error: "Graphics generation failed",
      detail: error.message
    });
  }
};
}

export default createGraphicsHandler();