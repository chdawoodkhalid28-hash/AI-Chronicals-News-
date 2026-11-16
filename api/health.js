export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const hasAdminPassword = Boolean(
    process.env.ADMIN_PASSWORD || process.env.ADMINPASSWORD
  );

  return res.status(200).json({
    service: "AI Chronicals News",
    status: "online",
    mode: "foundation",
    capabilities: {
      adminPasswordConfigured: hasAdminPassword,
      openAIKeyConfigured: Boolean(process.env.OPENAI_API_KEY),
      geminiKeyConfigured: Boolean(process.env.GEMINI_API_KEY),
      geminiProvider: "Gemini 2.5 Flash",
      blobTokenConfigured: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
      supabaseConfigured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
      approvalQueuePersistence: process.env.BLOB_READ_WRITE_TOKEN ? "private-vercel-blob-with-local-browser-fallback" : "browser-local-only"
    },
    publishing: "disabled-pending-admin-approval",
    checkedAt: new Date().toISOString()
  });
}
