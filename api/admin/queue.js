import { del, get, list, put } from "@vercel/blob";
import { timingSafeEqual } from "node:crypto";
import { ALLOWED_DECISIONS, isValidId, sanitizeItem, validateItem } from "./queue-core.js";

const PREFIX = "approval-queue/";
const MAX_RECORDS = 20;

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !a || !b) return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function recordPath(id) {
  return PREFIX + id + ".json";
}

async function readRecord(pathname) {
  const result = await get(pathname, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  const raw = await new Response(result.stream).text();
  return JSON.parse(raw);
}

async function writeRecord(item) {
  await put(recordPath(item.id), JSON.stringify(item), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json; charset=utf-8",
    cacheControlMaxAge: 60
  });
}

async function readAllRecords() {
  const found = [];
  let cursor;
  let hasMore = true;
  while (hasMore && found.length < MAX_RECORDS * 5) {
    const page = await list({ prefix: PREFIX, limit: 100, cursor });
    for (const blob of page.blobs || []) {
      if (!blob.pathname.endsWith(".json")) continue;
      try {
        const item = await readRecord(blob.pathname);
        if (item && validateItem(item)) found.push(item);
      } catch {
        // Skip an unreadable/corrupt record without failing the entire admin queue.
      }
    }
    hasMore = Boolean(page.hasMore);
    cursor = page.cursor;
    if (!cursor) break;
  }
  return found
    .sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || "")))
    .slice(0, MAX_RECORDS);
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
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({ error: "Private Blob storage is not configured" });
  }

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
      const item = await readRecord(recordPath(id));
      if (!item || !validateItem(item)) return res.status(404).json({ error: "Queue record not found" });
      item.decision = decision;
      item.decisionAt = new Date().toISOString();
      await writeRecord(item);
      return res.status(200).json({ ok: true, item, publication: "DISABLED" });
    }

    if (req.method === "DELETE") {
      const id = req.body && req.body.id;
      if (!isValidId(id)) return res.status(400).json({ error: "Invalid queue record id" });
      await del(recordPath(id), { access: "private" });
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
