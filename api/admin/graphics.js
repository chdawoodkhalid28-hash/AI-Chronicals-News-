function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !a || !b) return false;
  const crypto = require("crypto");
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const expected = process.env.ADMIN_PASSWORD || process.env.ADMINPASSWORD;
  const supplied = (req.headers.authorization || "").replace(/^Bearer\\s+/i, "");
  if (!safeEqual(supplied, expected)) return res.status(401).json({ error: "Admin authentication failed" });
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: "OPENAI_API_KEY is not configured" });

  const body = req.body || {};
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const headline = typeof body.headline === "string" ? body.headline.trim().slice(0, 240) : "";
  if (prompt.length < 20 || prompt.length > 5000) {
    return res.status(400).json({ error: "Graphics prompt must contain 20 to 5000 characters" });
  }

  const finalPrompt = [
    "Create one polished editorial news graphic for a professional digital newsroom.",
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
    return res.status(200).json({ ok: true, mimeType: "image/png", imageData: image });
  } catch (error) {
    return res.status(error.status || 502).json({
      error: "Graphics generation failed",
      detail: error.message
    });
  }
}
