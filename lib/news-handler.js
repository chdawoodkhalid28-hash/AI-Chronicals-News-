import { supabaseRequest } from "./supabase-rest.js";
import { EDITORIAL_STATUSES, validateArticleInput, canMarkVerified } from "./news-validation.js";

function responseError(res, error) {
  const status = Number.isInteger(error.statusCode) ? error.statusCode : 502;
  return res.status(status).json({ error: status === 503 ? error.message : "News database operation failed", detail: status === 503 ? undefined : error.message, publication: "DISABLED" });
}

export async function handleNewsRequest(req, res) {
  try {
    if (req.method === "GET") {
      const params = new URLSearchParams({ select: "*", order: "created_at.desc", limit: "100" });
      const status = typeof req.query?.status === "string" ? req.query.status : "";
      if (status && EDITORIAL_STATUSES.has(status)) params.set("editorial_status", "eq." + status);
      const rows = await supabaseRequest("news_articles", { query: params.toString() }) || [];
      const ids = rows.map(row => row.id);
      let sources = [];
      if (ids.length) {
        const sourceParams = new URLSearchParams({ select: "*", article_id: "in.(" + ids.join(",") + ")", order: "created_at.asc" });
        sources = await supabaseRequest("news_sources", { query: sourceParams.toString() }) || [];
      }
      const grouped = new Map();
      for (const source of sources) {
        if (!grouped.has(source.article_id)) grouped.set(source.article_id, []);
        grouped.get(source.article_id).push(source);
      }
      return res.status(200).json({ ok: true, items: rows.map(row => ({ ...row, sources: grouped.get(row.id) || [] })), publication: "DISABLED" });
    }

    if (req.method === "POST") {
      const validated = validateArticleInput(req.body && req.body.article);
      if (!validated.ok) return res.status(400).json({ error: validated.error });
      const inserted = await supabaseRequest("news_articles", { method: "POST", body: validated.article });
      const article = Array.isArray(inserted) ? inserted[0] : inserted;
      try {
        await supabaseRequest("news_sources", { method: "POST", body: validated.sources.map(source => ({ ...source, article_id: article.id })) });
      } catch (error) {
        const rollback = new URLSearchParams({ id: "eq." + article.id });
        await supabaseRequest("news_articles", { method: "DELETE", query: rollback.toString(), prefer: "return=minimal" }).catch(() => {});
        throw error;
      }
      await supabaseRequest("editorial_events", { method: "POST", body: { article_id: article.id, new_status: "pending_verification", note: "Article created; publication remains disabled.", actor: "admin" } });
      return res.status(201).json({ ok: true, item: { ...article, sources: validated.sources }, publication: "DISABLED" });
    }

    if (req.method === "PATCH") {
      const id = typeof req.body?.id === "string" ? req.body.id : "";
      const nextStatus = typeof req.body?.editorialStatus === "string" ? req.body.editorialStatus : "";
      const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 3000) : "";
      if (!/^[0-9a-f-]{36}$/i.test(id) || !EDITORIAL_STATUSES.has(nextStatus)) return res.status(400).json({ error: "Valid article ID and editorial status are required" });
      const currentRows = await supabaseRequest("news_articles", { query: new URLSearchParams({ select: "*", id: "eq." + id, limit: "1" }).toString() });
      const current = currentRows && currentRows[0];
      if (!current) return res.status(404).json({ error: "Article not found" });
      const sourceRows = await supabaseRequest("news_sources", { query: new URLSearchParams({ select: "*", article_id: "eq." + id }).toString() }) || [];
      if (nextStatus === "verified" && !canMarkVerified(sourceRows)) return res.status(409).json({ error: "Verification requires two independent sources or one official source" });
      if (nextStatus === "approved_not_published" && current.editorial_status !== "verified") return res.status(409).json({ error: "Only a verified article can be marked approved; publishing remains disabled" });
      const updatedRows = await supabaseRequest("news_articles", {
        method: "PATCH",
        query: new URLSearchParams({ id: "eq." + id }).toString(),
        body: { editorial_status: nextStatus, verification_notes: note, publication_status: "disabled" }
      });
      await supabaseRequest("editorial_events", { method: "POST", body: { article_id: id, previous_status: current.editorial_status, new_status: nextStatus, note, actor: "admin" } });
      return res.status(200).json({ ok: true, item: Array.isArray(updatedRows) ? updatedRows[0] : updatedRows, publication: "DISABLED" });
    }

    res.setHeader("Allow", "GET, POST, PATCH");
    return res.status(405).json({ error: "Method not allowed", publication: "DISABLED" });
  } catch (error) {
    return responseError(res, error);
  }
}
