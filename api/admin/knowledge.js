import { timingSafeEqual } from "node:crypto";
import { knowledgeStore } from "../../lib/knowledge-store.js";

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !a || !b) return false;
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const expected = process.env.ADMIN_PASSWORD || process.env.ADMINPASSWORD;
  const supplied = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!safeEqual(supplied, expected)) return res.status(401).json({ error: "Admin authentication failed" });
  if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(503).json({ error: "Private knowledge storage is not configured" });

  const body = req.body || {};
  try {
    if (body.action === "save") {
      const saved = await knowledgeStore.save({
        department: body.department,
        title: body.title,
        content: body.content,
        sourceUrl: body.sourceUrl || "",
        status: body.status || "draft",
        kind: body.kind || "knowledge",
        tags: body.tags || []
      });
      return res.status(201).json({ ok: true, saved });
    }
    if (body.action === "search") {
      const records = await knowledgeStore.search({
        department: body.department,
        query: body.query,
        limit: body.limit
      });
      return res.status(200).json({ ok: true, records, retrieval: "private-blob-keyword-rag", vectorEmbeddings: false });
    }
    return res.status(400).json({ error: "Action must be save or search" });
  } catch (error) {
    const status = /Unknown department|Unsupported record kind|Invalid record status|Title must|Content must|Source URL/.test(error.message) ? 400 : 502;
    return res.status(status).json({ error: "Knowledge operation failed", detail: error.message });
  }
}
