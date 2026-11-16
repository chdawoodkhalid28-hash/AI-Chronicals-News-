import { generateGeminiText, DEFAULT_MODEL } from "../lib/gemini.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({ ok: false, provider: "gemini", status: "not_configured" });
  }

  try {
    const result = await generateGeminiText(
      "Reply with exactly: GEMINI_CONNECTION_OK",
      { maxOutputTokens: 24 }
    );
    const passed = result.text.includes("GEMINI_CONNECTION_OK");
    return res.status(passed ? 200 : 502).json({
      ok: passed,
      provider: "gemini",
      model: result.model,
      status: passed ? "connected" : "unexpected_response",
      test: "minimal_generate_content",
      usage: result.usage
    });
  } catch (error) {
    const status = error.status === 401 || error.status === 403 ? 502 : 503;
    return res.status(status).json({
      ok: false,
      provider: "gemini",
      model: DEFAULT_MODEL,
      status: error.status === 401 || error.status === 403 ? "key_rejected_or_access_denied" : "request_failed",
      error: error.message
    });
  }
}
