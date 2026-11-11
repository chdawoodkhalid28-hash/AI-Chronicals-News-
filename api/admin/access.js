import { createHmac, timingSafeEqual } from "node:crypto";

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !a || !b) return false;
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Vary", "Authorization");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const expected = process.env.ADMIN_PASSWORD || process.env.ADMINPASSWORD;
  const supplied = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!safeEqual(supplied, expected)) {
    return res.status(401).json({ ok: false, error: "Admin authentication failed" });
  }
  const expiresAt = String(Date.now() + 30 * 60 * 1000);
  const signature = createHmac("sha256", expected).update(expiresAt).digest("base64url");
  const token = expiresAt + "." + signature;
  res.setHeader("Set-Cookie", "acn_admin_access=" + token + "; Path=/connectors.html; Max-Age=1800; HttpOnly; Secure; SameSite=Strict");
  return res.status(200).json({
    ok: true,
    role: "ADMIN",
    access: ["connectors", "tools", "integration-status"],
    expiresAt: Number(expiresAt)
  });
}
