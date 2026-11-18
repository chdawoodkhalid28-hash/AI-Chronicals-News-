import { timingSafeEqual } from "node:crypto";
import { handleNewsRequest } from "../../lib/news-handler.js";

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !a || !b) return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  const expected = process.env.ADMIN_PASSWORD || process.env.ADMINPASSWORD;
  const supplied = (req.headers.authorization || "").replace(/^Bearer\\s+/i, "");
  if (!safeEqual(supplied, expected)) {
    return res.status(401).json({
      ok: false,
      error: "Admin authentication failed",
      publication: "DISABLED"
    });
  }

  return handleNewsRequest(req, res);
}
