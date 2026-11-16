import { generateGeminiText, DEFAULT_MODEL } from "../lib/gemini.js";
import { supabaseRequest } from "../lib/supabase-rest.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const hasAdminPassword = Boolean(
    process.env.ADMIN_PASSWORD || process.env.ADMINPASSWORD
  );

  const capabilities = {
    adminPasswordConfigured: hasAdminPassword,
    openAIKeyConfigured: Boolean(process.env.OPENAI_API_KEY),
    geminiKeyConfigured: Boolean(process.env.GEMINI_API_KEY),
    geminiProvider: DEFAULT_MODEL,
    blobTokenConfigured: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    supabaseConfigured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    approvalQueuePersistence: process.env.BLOB_READ_WRITE_TOKEN ? "private-vercel-blob-with-local-browser-fallback" : "browser-local-only"
  };

  if (req.query?.supabase === "1") {
    if (!capabilities.supabaseConfigured) {
      return res.status(503).json({
        service: "AI Chronicals News",
        ok: false,
        provider: "supabase",
        status: "not_configured",
        probe: "read_only_select",
        capabilities
      });
    }
    try {
      await supabaseRequest("news_articles", {
        query: new URLSearchParams({ select: "id", limit: "1" }).toString()
      });
      return res.status(200).json({
        service: "AI Chronicals News",
        ok: true,
        provider: "supabase",
        status: "connected",
        probe: "read_only_select",
        table: "news_articles",
        capabilities
      });
    } catch (error) {
      const upstreamStatus = Number.isInteger(error.statusCode) ? error.statusCode : null;
      const status = upstreamStatus === 404
        ? "schema_not_ready"
        : upstreamStatus === 401 || upstreamStatus === 403
          ? "credentials_rejected"
          : "database_unavailable";
      return res.status(503).json({
        service: "AI Chronicals News",
        ok: false,
        provider: "supabase",
        status,
        upstreamStatus,
        probe: "read_only_select",
        capabilities
      });
    }
  }

  if (req.query?.gemini === "1") {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({ service: "AI Chronicals News", ok: false, provider: "gemini", status: "not_configured", capabilities });
    }
    try {
      const result = await generateGeminiText(
        "Reply with exactly: GEMINI_CONNECTION_OK",
        { maxOutputTokens: 24 }
      );
      const passed = result.text.includes("GEMINI_CONNECTION_OK");
      return res.status(passed ? 200 : 502).json({
        service: "AI Chronicals News",
        ok: passed,
        provider: "gemini",
        model: result.model,
        status: passed ? "connected" : "unexpected_response",
        test: "minimal_generate_content",
        usage: result.usage,
        capabilities
      });
    } catch (error) {
      const status = error.status === 401 || error.status === 403 ? 502 : 503;
      return res.status(status).json({
        service: "AI Chronicals News",
        ok: false,
        provider: "gemini",
        model: DEFAULT_MODEL,
        status: error.status === 401 || error.status === 403 ? "key_rejected_or_access_denied" : "request_failed",
        error: error.message,
        capabilities
      });
    }
  }

  return res.status(200).json({
    service: "AI Chronicals News",
    status: "online",
    mode: "foundation",
    capabilities,
    publishing: "disabled-pending-admin-approval",
    checkedAt: new Date().toISOString()
  });
}
