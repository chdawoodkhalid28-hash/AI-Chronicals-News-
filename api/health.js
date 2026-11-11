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
      blobStorageConfigured: Boolean(process.env.BLOB_READ_WRITE_TOKEN)
    },
    publishing: "disabled-pending-admin-approval",
    checkedAt: new Date().toISOString()
  });
}
