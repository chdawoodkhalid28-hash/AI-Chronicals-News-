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

  const supabaseConfigured = Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY1 || process.env.SUPABASE_SERVICE_ROLE_KEY));

  const capabilities = {
    adminPasswordConfigured: hasAdminPassword,
    openAIKeyConfigured: Boolean(process.env.OPENAI_API_KEY),
    geminiKeyConfigured: Boolean(process.env.GEMINI_API_KEY),
    geminiProvider: DEFAULT_MODEL,
    supabaseConfigured,
    supabasePrivateMediaConfigured: supabaseConfigured,
    approvalQueuePersistence: supabaseConfigured ? "supabase-postgres" : "browser-local-only"
  };

  if (req.query?.supabase === "all") {
    if (!capabilities.supabaseConfigured) {
      return res.status(503).json({
        service: "AI Chronicals News",
        ok: false,
        provider: "supabase",
        status: "not_configured",
        probe: "read_only_select_expected_columns",
        tables: [],
        capabilities
      });
    }
    const tableColumns = {
      news_articles: "id,headline,summary,body,language,category,assigned_desk,editorial_status,publication_status,verification_notes,created_by,created_at,updated_at",
      news_sources: "id,article_id,source_url,source_title,publisher,source_type,is_official,checked_at,created_at",
      news_verification_checks: "id,article_id,check_type,outcome,notes,checked_by,created_at",
      editorial_events: "id,article_id,previous_status,new_status,note,actor,created_at",
      department_outputs: "id,article_id,run_id,department_key,output_type,content,editorial_status,publication_status,created_at",
      media_assets: "id,article_id,blob_pathname,media_type,alt_text,source_url,rights_status,created_at",
      approval_queue: "id,saved_at,record",
      department_knowledge: "id,department,kind,title,content,source_url,tags,status,created_at"
    };
    const tableNames = Object.keys(tableColumns);
    const tables = await Promise.all(tableNames.map(async (table) => {
      try {
        await supabaseRequest(table, {
          query: new URLSearchParams({ select: tableColumns[table], limit: "0" }).toString()
        });
        return { table, status: "connected", columnsChecked: tableColumns[table].split(",").length };
      } catch (error) {
        const upstreamStatus = Number.isInteger(error.statusCode) ? error.statusCode : null;
        const status = upstreamStatus === 404
          ? "schema_not_ready"
          : upstreamStatus === 400
            ? "schema_mismatch"
            : upstreamStatus === 401 || upstreamStatus === 403
            ? "credentials_rejected"
            : error.code === "SUPABASE_URL_INVALID" || error.code === "SUPABASE_URL_HTTPS_REQUIRED"
              ? "invalid_configuration"
              : error.code === "SUPABASE_NETWORK_ERROR"
                ? "network_error"
                : "database_unavailable";
        return { table, status, upstreamStatus, reasonCode: error.code || (upstreamStatus ? "SUPABASE_HTTP_" + upstreamStatus : "SUPABASE_REQUEST_FAILED") };
      }
    }));
    const connected = tables.filter((item) => item.status === "connected").length;
    return res.status(200).json({
      service: "AI Chronicals News",
      ok: connected === tableNames.length,
      provider: "supabase",
      status: connected === tableNames.length ? "all_tables_connected" : "partial_schema_or_access",
      probe: "read_only_select_expected_columns",
      connectedTables: connected,
      totalTables: tableNames.length,
      tables,
      capabilities
    });
  }

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
          : error.code === "SUPABASE_URL_INVALID" || error.code === "SUPABASE_URL_HTTPS_REQUIRED"
            ? "invalid_configuration"
            : error.code === "SUPABASE_NETWORK_ERROR"
              ? "network_error"
              : "database_unavailable";
      return res.status(503).json({
        service: "AI Chronicals News",
        ok: false,
        provider: "supabase",
        status,
        upstreamStatus,
        reasonCode: error.code || (upstreamStatus ? "SUPABASE_HTTP_" + upstreamStatus : "SUPABASE_REQUEST_FAILED"),
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
        { maxOutputTokens: 256 }
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
        status: error.status === 401 || error.status === 403
          ? "key_rejected_or_access_denied"
          : error.code === "GEMINI_EMPTY_RESPONSE"
            ? (error.finishReason === "SAFETY" || error.finishReason === "BLOCKLIST" || error.promptBlockReason
              ? "response_blocked"
              : "empty_response")
            : "request_failed",
        diagnostic: error.code === "GEMINI_EMPTY_RESPONSE"
          ? { finishReason: error.finishReason, promptBlockReason: error.promptBlockReason }
          : undefined,
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
