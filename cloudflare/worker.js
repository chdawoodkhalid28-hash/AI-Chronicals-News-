import { handleAdminAuth, verifyAdminSession } from "./admin-auth.js";

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
        backendMigration: "in_progress",
        capabilities: {
          staticAssets: Boolean(env.ASSETS),
          adminSessionConfigured: Boolean(env.ADMIN_PASSWORD && env.ADMIN_SESSION_SECRET),
          adminApi: false,
          approvalQueue: false,
          supabase: false,
          privateMediaStorage: false
        },
        publishing: "DISABLED",
        message: "Admin session foundation is available; newsroom APIs and storage remain disabled until migrated and tested."
      });
    }

    if (url.pathname.startsWith("/api/admin/")) {
      const authResponse = await handleAdminAuth(request, env);
      if (authResponse) return authResponse;
      if (await verifyAdminSession(request, env)) {
        return json(503, {
          ok: false,
          error: "CLOUDFLARE_BACKEND_MIGRATION_PENDING",
          message: "Admin session verified. This newsroom API is not migrated yet."
        });
      }
      return json(401, { ok: false, error: "Admin session required" });
    }

    if (url.pathname.startsWith("/api/")) {
      return json(503, {
        ok: false,
        error: "CLOUDFLARE_BACKEND_MIGRATION_PENDING",
        message: "This preview does not execute the existing Vercel serverless API."
      });
    }

    return env.ASSETS.fetch(request);
  }
};
