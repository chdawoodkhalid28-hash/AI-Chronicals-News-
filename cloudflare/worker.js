import { handleAdminAuth, verifyAdminSession } from "./admin-auth.js";
import { handleQueueRequest } from "./approval-queue.js";
import { handleNewsApi } from "./news-api.js";
import { handlePrivateMedia } from "./media-api.js";

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
      const supabaseConfigured = Boolean(env.SUPABASE_URL && (env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY1));
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
          newsCrud: supabaseConfigured,
          approvalQueue: Boolean(env.APPROVAL_QUEUE),
          supabase: supabaseConfigured,
          privateMediaStorageApi: true,
          privateMediaStorageConfigured: supabaseConfigured
        },
        publishing: "DISABLED",
        message: "Admin sessions, R2 approval queue, Supabase News CRUD and private Supabase media APIs are implemented; remaining newsroom APIs and production bindings are not yet migrated."
      });
    }

    if (url.pathname.startsWith("/api/admin/")) {
      const authResponse = await handleAdminAuth(request, env);
      if (authResponse) return authResponse;
      if (!(await verifyAdminSession(request, env))) {
        return json(401, { ok: false, error: "Admin session required" });
      }
      if (url.pathname === "/api/admin/queue" && url.searchParams.get("resource") !== "news") return handleQueueRequest(request, env);
      if (url.pathname === "/api/admin/news" || (url.pathname === "/api/admin/queue" && url.searchParams.get("resource") === "news")) {
        return handleNewsApi(request, env);
      }
      if (url.pathname === "/api/admin/graphics") return handlePrivateMedia(request, env);
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
