import { timingSafeEqual } from "node:crypto";
import { ALLOWED_DECISIONS, isValidId, sanitizeItem, validateItem } from "./queue-core.js";
import { handleNewsRequest } from "../../lib/news-handler.js";
import { supabaseRequest } from "../../lib/supabase-rest.js";

const MAX_RECORDS = 20;

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !a || !b) return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function readRecord(id) {
  const rows = await supabaseRequest("approval_queue", {
    query: "select=record&id=eq." + encodeURIComponent(id) + "&limit=1"
  });
  return Array.isArray(rows) && rows[0] && rows[0].record ? rows[0].record : null;
}

async function writeRecord(item) {
  await supabaseRequest("approval_queue", {
    method: "POST",
    query: "on_conflict=id",
    body: { id: item.id, saved_at: item.savedAt, record: item },
    prefer: "resolution=merge-duplicates,return=representation"
  });
}

async function readAllRecords() {
  const rows = await supabaseRequest("approval_queue", {
    query: "select=record&order=saved_at.desc&limit=100"
  });
  return (Array.isArray(rows) ? rows : [])
    .map(row => row && row.record)
    .filter(item => item && validateItem(item))
    .map(sanitizeItem)
    .sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || "")))
    .slice(0, MAX_RECORDS);
}

async function deleteRecord(id) {
  await supabaseRequest("approval_queue", {
    method: "DELETE",
    query: "id=eq." + encodeURIComponent(id),
    prefer: "return=minimal"
  });
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Vary", "Authorization");
  res.setHeader("X-Content-Type-Options", "nosniff");

  const expected = process.env.ADMIN_PASSWORD || process.env.ADMINPASSWORD;
  const supplied = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!safeEqual(supplied, expected)) {
    return res.status(expected ? 401 : 503).json({
      error: expected ? "Admin authentication failed" : "Admin password is not configured"
    });
  }
  if (req.query && req.query.resource === "news") return handleNewsRequest(req, res);

  try {
    if (req.method === "GET") {
      const items = await readAllRecords();
      return res.status(200).json({ ok: true, items, count: items.length, publication: "DISABLED" });
    }

    if (req.method === "POST") {
      const item = req.body && req.body.item;
      if (!validateItem(item)) return res.status(400).json({ error: "Invalid approval queue record" });
      const safeItem = sanitizeItem(item);
      await writeRecord(safeItem);
      return res.status(200).json({ ok: true, item: safeItem, publication: "DISABLED" });
    }

    if (req.method === "PATCH") {
      const id = req.body && req.body.id;
      const decision = req.body && req.body.decision;
      if (!isValidId(id) || !ALLOWED_DECISIONS.has(decision)) {
        return res.status(400).json({ error: "Invalid queue decision" });
      }
      const item = await readRecord(id);
      if (!item || !validateItem(item)) return res.status(404).json({ error: "Queue record not found" });
      const safeItem = sanitizeItem(item);
      safeItem.decision = decision;
      safeItem.decisionAt = new Date().toISOString();
      await writeRecord(safeItem);
      return res.status(200).json({ ok: true, item: safeItem, publication: "DISABLED" });
    }

    if (req.method === "DELETE") {
      const id = req.body && req.body.id;
      if (!isValidId(id)) return res.status(400).json({ error: "Invalid queue record id" });
      await deleteRecord(id);
      return res.status(200).json({ ok: true, id, publication: "DISABLED" });
    }

    res.setHeader("Allow", "GET, POST, PATCH, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    const status = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    return res.status(status).json({
      error: status === 500 ? "Approval queue operation failed" : error.message
    });
  }
}
