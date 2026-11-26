import { handleAdminAuth, verifyAdminSession } from "./admin-auth.js";
import { handleQueueRequest } from "./approval-queue.js";

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
          adminLoginRateLimitConfigured: Boolean(env.LOGIN_RATE_LIMITER && typeof env.LOGIN_RATE_LIMITER.limit === "function"),
          approvalQueueStorageConfigured: Boolean(env.APPROVAL_QUEUE),
          adminApi: false,
          approvalQueue: Boolean(env.APPROVAL_QUEUE),
          supabase: false,
          privateMediaStorage: false
        },
        publishing: "DISABLED",
        message: "Signed admin sessions and the private R2 approval queue adapter are available; remaining newsroom APIs and production bindings are not yet migrated."
      });
    }

    if (url.pathname.startsWith("/api/admin/")) {
      const authResponse = await handleAdminAuth(request, env);
      if (authResponse) return authResponse;
      if (!(await verifyAdminSession(request, env))) {
        return json(401, { ok: false, error: "Admin session required" });
      }
      if (url.pathname === "/api/admin/queue") return handleQueueRequest(request, env);
      return json(503, {
        ok: false,
        error: "CLOUDFLARE_BACKEND_MIGRATION_PENDING",
        message: "Admin session verified. This newsroom API is not migrated yet."
      });
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
