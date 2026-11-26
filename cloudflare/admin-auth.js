const encoder = new TextEncoder();
const COOKIE = "acn_admin_session";
const SESSION_SECONDS = 30 * 60;

function base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function decodeBase64url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]
  );
}

async function equalSecret(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || !left || !right) return false;
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right))
  ]);
  const aa = new Uint8Array(a), bb = new Uint8Array(b);
  let mismatch = 0;
  for (let i = 0; i < aa.length; i++) mismatch |= aa[i] ^ bb[i];
  return mismatch === 0;
}

function cookieValue(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return "";
}

function originAllowed(request) {
  const origin = request.headers.get("Origin");
  return Boolean(origin) && origin === new URL(request.url).origin;
}

function json(status, payload, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      ...headers
    }
  });
}

async function createToken(secret, now = Date.now()) {
  const expiresAt = now + SESSION_SECONDS * 1000;
  const payload = base64url(encoder.encode(JSON.stringify({
    role: "ADMIN",
    issuedAt: now,
    expiresAt
  })));
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(payload)));
  return { token: payload + "." + base64url(signature), expiresAt };
}

async function allowLoginAttempt(request, env) {
  const limiter = env.LOGIN_RATE_LIMITER;
  if (!limiter || typeof limiter.limit !== "function") return false;
  const ip = request.headers.get("CF-Connecting-IP");
  if (!ip) return false;
  try {
    const result = await limiter.limit({ key: "admin-login:" + ip });
    return result?.success === true;
  } catch {
    return false;
  }
}

export async function verifyAdminSession(request, env, now = Date.now()) {
  if (!env.ADMIN_SESSION_SECRET) return false;
  const token = cookieValue(request, COOKIE);
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(env.ADMIN_SESSION_SECRET),
      decodeBase64url(parts[1]),
      encoder.encode(parts[0])
    );
    if (!valid) return false;
    const payload = JSON.parse(new TextDecoder().decode(decodeBase64url(parts[0])));
    return payload.role === "ADMIN" &&
      Number.isFinite(payload.expiresAt) &&
      payload.expiresAt > now &&
      Number.isFinite(payload.issuedAt) &&
      payload.issuedAt <= now + 60_000 &&
      payload.expiresAt - payload.issuedAt === SESSION_SECONDS * 1000;
  } catch {
    return false;
  }
}

export async function handleAdminAuth(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/api/admin/access") {
    if (request.method !== "POST") return json(405, { ok: false, error: "Method not allowed" }, { allow: "POST" });
    if (!originAllowed(request)) return json(403, { ok: false, error: "Same-origin request required" });
    if (!env.ADMIN_PASSWORD || !env.ADMIN_SESSION_SECRET) {
      return json(503, { ok: false, error: "Admin authentication is not configured" });
    }
    if (!(await allowLoginAttempt(request, env))) {
      return json(503, { ok: false, error: "Admin login rate limiter is unavailable or the request limit was reached" });
    }
    const supplied = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!(await equalSecret(supplied, env.ADMIN_PASSWORD))) {
      return json(401, { ok: false, error: "Admin authentication failed" });
    }
    const { token, expiresAt } = await createToken(env.ADMIN_SESSION_SECRET);
    return json(200, { ok: true, role: "ADMIN", expiresAt }, {
      "set-cookie": COOKIE + "=" + token + "; Path=/api/admin; Max-Age=" + SESSION_SECONDS + "; HttpOnly; Secure; SameSite=Strict"
    });
  }

  if (url.pathname === "/api/admin/session") {
    if (request.method !== "GET") return json(405, { ok: false, error: "Method not allowed" }, { allow: "GET" });
    const ok = await verifyAdminSession(request, env);
    return json(ok ? 200 : 401, { ok, role: ok ? "ADMIN" : null });
  }

  if (url.pathname === "/api/admin/logout") {
    if (request.method !== "POST") return json(405, { ok: false, error: "Method not allowed" }, { allow: "POST" });
    if (!originAllowed(request)) return json(403, { ok: false, error: "Same-origin request required" });
    if (!(await verifyAdminSession(request, env))) return json(401, { ok: false, error: "Admin session is invalid or expired" });
    return json(200, { ok: true }, {
      "set-cookie": COOKIE + "=; Path=/api/admin; Max-Age=0; HttpOnly; Secure; SameSite=Strict"
    });
  }

  return null;
}
