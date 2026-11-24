const json = (status, payload) => new Response(JSON.stringify(payload, null, 2), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer"
  }
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/health" && request.method === "GET") {
      return json(200, {
        service: "AI Chronicals News",
        status: "partial-preview",
        ok: false,
        mode: "cloudflare-static-preview",
        backendMigration: "not_started",
        capabilities: {
          staticAssets: Boolean(env.ASSETS),
          adminApi: false,
          approvalQueue: false,
          supabase: false,
          privateMediaStorage: false
        },
        publishing: "DISABLED",
        message: "This is an isolated static preview. Backend routes are intentionally disabled until their Cloudflare adapters and bindings are migrated."
      });
    }

    if (url.pathname.startsWith("/api/")) {
      return json(503, {
        ok: false,
        error: "CLOUDFLARE_BACKEND_MIGRATION_PENDING",
        message: "This preview does not execute the existing Vercel serverless API. Use the existing Vercel deployment for operational admin workflows."
      });
    }

    return env.ASSETS.fetch(request);
  }
};
