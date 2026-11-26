const TABLES = new Set(["news_articles", "news_sources", "editorial_events"]);
const STATUSES = new Set(["pending_verification", "verified", "needs_revision", "approved_not_published", "rejected"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const json = (status, body, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    ...headers
  }
});
const fail = (status, error, extra = {}) => json(status, { ok: false, error, publication: "DISABLED", ...extra });

function config(env) {
  const rawUrl = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY1;
  if (!rawUrl || !key) throw Object.assign(new Error("Supabase Worker secrets are not configured"), { status: 503, code: "SUPABASE_NOT_CONFIGURED" });
  let url;
  try { url = new URL(rawUrl); } catch {
    throw Object.assign(new Error("SUPABASE_URL is invalid"), { status: 503, code: "SUPABASE_URL_INVALID" });
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw Object.assign(new Error("SUPABASE_URL must be a clean HTTPS project URL"), { status: 503, code: "SUPABASE_URL_INVALID" });
  }
  return { base: url.origin, key };
}

async function db(env, table, { method = "GET", query = "", body, prefer = "return=representation" } = {}) {
  if (!TABLES.has(table)) throw new Error("Unsupported database table");
  const { base, key } = config(env);
  let response;
  try {
    response = await fetch(base + "/rest/v1/" + table + (query ? "?" + query : ""), {
      method,
      headers: {
        apikey: key,
        Authorization: "Bearer " + key,
        "Content-Type": "application/json",
        Accept: "application/json",
        Prefer: prefer
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(8000)
    });
  } catch {
    throw Object.assign(new Error("Supabase network request failed"), { status: 503, code: "SUPABASE_NETWORK_ERROR" });
  }
  const raw = await response.text();
  let data = null;
  if (raw) {
    try { data = JSON.parse(raw); } catch { data = { message: raw.slice(0, 500) }; }
  }
  if (!response.ok) {
    const status = response.status >= 500 ? 502 : response.status;
    throw Object.assign(new Error(data?.message || "Supabase request failed"), { status, code: "SUPABASE_REQUEST_FAILED" });
  }
  return data;
}

function validateArticle(input, officialDomains) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "Article payload is required" };
  const headline = typeof input.headline === "string" ? input.headline.trim() : "";
  const summary = typeof input.summary === "string" ? input.summary.trim() : "";
  const body = typeof input.body === "string" ? input.body.trim() : "";
  const language = input.language === "en" ? "en" : "ur";
  const category = typeof input.category === "string" ? input.category.trim().slice(0, 80) : "general";
  const assignedDesk = typeof input.assignedDesk === "string" ? input.assignedDesk.trim().slice(0, 100) : "newsroom";
  if (headline.length < 8 || headline.length > 240) return { error: "Headline must contain 8 to 240 characters" };
  if (summary.length > 1200 || body.length > 30000) return { error: "Summary or body exceeds the allowed length" };
  if (!category || !assignedDesk) return { error: "Category and assigned desk are required" };
  const domains = String(officialDomains || "").split(",").map(x => x.trim().toLowerCase().replace(/^www\./, "")).filter(Boolean);
  const rawSources = Array.isArray(input.sources) ? input.sources.slice(0, 20) : [];
  const sources = [], seen = new Set();
  for (const source of rawSources) {
    const rawUrl = typeof source === "string" ? source : source && source.url;
    let url;
    try { url = new URL(rawUrl); } catch { return { error: "Every source must be a valid HTTPS URL" }; }
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return { error: "Every source must be a valid HTTPS URL" };
    const normalized = url.toString();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    const publisher = url.hostname.toLowerCase().replace(/^www\./, "");
    const official = domains.some(domain => publisher === domain || publisher.endsWith("." + domain));
    sources.push({
      source_url: normalized,
      source_title: typeof source === "object" && source ? String(source.title || "").slice(0, 240) : "",
      publisher,
      source_type: official ? "official" : "independent",
      is_official: official
    });
  }
  return {
    article: {
      headline, summary, body, language, category, assigned_desk: assignedDesk,
      editorial_status: "pending_verification", publication_status: "disabled"
    },
    sources
  };
}

function canVerify(sources, officialDomains) {
  if (!Array.isArray(sources)) return false;
  const domains = String(officialDomains || "").split(",").map(x => x.trim().toLowerCase().replace(/^www\./, "")).filter(Boolean);
  const publishers = new Set();
  for (const source of sources) {
    try {
      const url = new URL(source.source_url);
      if (url.protocol !== "https:" || !url.hostname || url.username || url.password) continue;
      const host = url.hostname.toLowerCase().replace(/^www\./, "");
      if (domains.some(domain => host === domain || host.endsWith("." + domain))) return true;
      publishers.add(host);
    } catch {}
  }
  return publishers.size >= 2;
}

async function listArticleSources(env, ids) {
  if (!ids.length) return [];
  const query = new URLSearchParams({ select: "*", article_id: "in.(" + ids.join(",") + ")", order: "created_at.asc" });
  return await db(env, "news_sources", { query: query.toString() }) || [];
}

async function recordEvent(env, articleId, previousStatus, nextStatus, note) {
  await db(env, "editorial_events", {
    method: "POST",
    body: {
      article_id: articleId,
      previous_status: previousStatus || null,
      new_status: nextStatus,
      note: String(note || "").slice(0, 3000),
      actor: "admin"
    }
  });
}

export async function handleNewsApi(request, env) {
  try {
    const url = new URL(request.url);
    if (request.method === "GET") {
      const params = new URLSearchParams({ select: "*", order: "created_at.desc", limit: "100" });
      const status = url.searchParams.get("status") || "";
      if (status && STATUSES.has(status)) params.set("editorial_status", "eq." + status);
      const rows = await db(env, "news_articles", { query: params.toString() }) || [];
      const sources = await listArticleSources(env, rows.map(row => row.id));
      const grouped = new Map();
      for (const source of sources) {
        if (!grouped.has(source.article_id)) grouped.set(source.article_id, []);
        grouped.get(source.article_id).push(source);
      }
      return json(200, { ok: true, items: rows.map(row => ({ ...row, sources: grouped.get(row.id) || [] })), publication: "DISABLED" });
    }

    if (request.method === "POST") {
      const raw = await request.text();
      if (new TextEncoder().encode(raw).byteLength > 1_000_000) return fail(413, "Request body is too large");
      let input;
      try { input = raw ? JSON.parse(raw) : {}; } catch { return fail(400, "Invalid JSON body"); }
      const validated = validateArticle(input.article, env.OFFICIAL_SOURCE_DOMAINS);
      if (validated.error) return fail(400, validated.error);
      const inserted = await db(env, "news_articles", { method: "POST", body: validated.article });
      const article = Array.isArray(inserted) ? inserted[0] : inserted;
      if (!article?.id || !UUID.test(article.id)) throw new Error("Database did not return a valid article ID");
      try {
        if (validated.sources.length) {
          await db(env, "news_sources", { method: "POST", body: validated.sources.map(source => ({ ...source, article_id: article.id })) });
        }
        await recordEvent(env, article.id, null, "pending_verification", "Article created; publication remains disabled.");
      } catch (error) {
        await db(env, "news_articles", { method: "DELETE", query: new URLSearchParams({ id: "eq." + article.id }).toString(), prefer: "return=minimal" }).catch(() => {});
        throw error;
      }
      return json(201, { ok: true, item: { ...article, sources: validated.sources }, publication: "DISABLED" });
    }

    if (request.method === "PATCH") {
      const raw = await request.text();
      if (new TextEncoder().encode(raw).byteLength > 1_000_000) return fail(413, "Request body is too large");
      let body;
      try { body = raw ? JSON.parse(raw) : {}; } catch { return fail(400, "Invalid JSON body"); }
      const id = typeof body.id === "string" ? body.id : "";
      if (!UUID.test(id)) return fail(400, "Valid article ID is required");
      const currentRows = await db(env, "news_articles", { query: new URLSearchParams({ select: "*", id: "eq." + id, limit: "1" }).toString() });
      const current = currentRows?.[0];
      if (!current) return fail(404, "Article not found");

      if (body.article && typeof body.article === "object") {
        const validated = validateArticle(body.article, env.OFFICIAL_SOURCE_DOMAINS);
        if (validated.error) return fail(400, validated.error);
        const previousSources = await db(env, "news_sources", { query: new URLSearchParams({ select: "*", article_id: "eq." + id }).toString() }) || [];
        const updatedRows = await db(env, "news_articles", {
          method: "PATCH",
          query: new URLSearchParams({ id: "eq." + id }).toString(),
          body: { ...validated.article, editorial_status: "pending_verification", publication_status: "disabled" }
        });
        try {
          await db(env, "news_sources", { method: "DELETE", query: new URLSearchParams({ article_id: "eq." + id }).toString(), prefer: "return=minimal" });
          if (validated.sources.length) await db(env, "news_sources", { method: "POST", body: validated.sources.map(source => ({ ...source, article_id: id })) });
          await recordEvent(env, id, current.editorial_status, "pending_verification", "Article content or sources edited; verification must be repeated.");
        } catch (error) {
          await db(env, "news_sources", { method: "DELETE", query: new URLSearchParams({ article_id: "eq." + id }).toString(), prefer: "return=minimal" }).catch(() => {});
          if (previousSources.length) await db(env, "news_sources", { method: "POST", body: previousSources.map(({ id: _id, ...source }) => source) }).catch(() => {});
          await db(env, "news_articles", { method: "PATCH", query: new URLSearchParams({ id: "eq." + id }).toString(), body: current }).catch(() => {});
          throw error;
        }
        const article = Array.isArray(updatedRows) ? updatedRows[0] : updatedRows;
        return json(200, { ok: true, item: { ...article, sources: validated.sources }, publication: "DISABLED" });
      }

      const nextStatus = typeof body.editorialStatus === "string" ? body.editorialStatus : "";
      const note = typeof body.note === "string" ? body.note.trim().slice(0, 3000) : "";
      if (!STATUSES.has(nextStatus)) return fail(400, "A valid editorial status or article update is required");
      const sources = await db(env, "news_sources", { query: new URLSearchParams({ select: "*", article_id: "eq." + id }).toString() }) || [];
      if (nextStatus === "verified" && !canVerify(sources, env.OFFICIAL_SOURCE_DOMAINS)) {
        return fail(409, "Verification requires two independent sources or one configured official source");
      }
      if (nextStatus === "approved_not_published" && current.editorial_status !== "verified") {
        return fail(409, "Only a verified article can be approved; publishing remains disabled");
      }
      const updatedRows = await db(env, "news_articles", {
        method: "PATCH",
        query: new URLSearchParams({ id: "eq." + id }).toString(),
        body: { editorial_status: nextStatus, verification_notes: note, publication_status: "disabled" }
      });
      await recordEvent(env, id, current.editorial_status, nextStatus, note);
      return json(200, { ok: true, item: Array.isArray(updatedRows) ? updatedRows[0] : updatedRows, publication: "DISABLED" });
    }

    if (request.method === "DELETE") {
      const raw = await request.text();
      if (new TextEncoder().encode(raw).byteLength > 100_000) return fail(413, "Request body is too large");
      let body;
      try { body = raw ? JSON.parse(raw) : {}; } catch { return fail(400, "Invalid JSON body"); }
      const id = typeof body.id === "string" ? body.id : "";
      if (!UUID.test(id) || body.confirmDelete !== true) return fail(400, "Valid article ID and confirmDelete=true are required");
      const rows = await db(env, "news_articles", { query: new URLSearchParams({ select: "id", id: "eq." + id, limit: "1" }).toString() });
      if (!rows?.length) return fail(404, "Article not found");
      await db(env, "news_articles", { method: "DELETE", query: new URLSearchParams({ id: "eq." + id }).toString(), prefer: "return=minimal" });
      return json(200, { ok: true, deletedId: id, publication: "DISABLED" });
    }

    return fail(405, "Method not allowed", { allow: "GET, POST, PATCH, DELETE" });
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 502;
    return fail(status, status === 503 ? error.message : "News database operation failed", { code: error.code || "NEWS_DATABASE_ERROR" });
  }
}
