import test from "node:test";
import assert from "node:assert/strict";
import { handleAdminAuth, verifyAdminSession } from "../cloudflare/admin-auth.js";

const origin = "https://preview.example";
const allowedLimiter = { async limit({ key }) { assert.match(key, /^admin-login:/); return { success: true }; } };
const env = {
  ADMIN_PASSWORD: "test-password-only",
  ADMIN_SESSION_SECRET: "test-session-secret-only",
  LOGIN_RATE_LIMITER: allowedLimiter
};

function loginRequest(password = "test-password-only", extraHeaders = {}) {
  return new Request(origin + "/api/admin/access", {
    method: "POST",
    headers: {
      Origin: origin,
      "CF-Connecting-IP": "192.0.2.10",
      Authorization: "Bearer " + password,
      ...extraHeaders
    }
  });
}

test("rejects login without same-origin Origin", async () => {
  const request = new Request(origin + "/api/admin/access", {
    method: "POST",
    headers: { Authorization: "Bearer test-password-only", "CF-Connecting-IP": "192.0.2.10" }
  });
  assert.equal((await handleAdminAuth(request, env)).status, 403);
});

test("fails closed when login rate limiter is missing or cannot identify the client", async () => {
  assert.equal((await handleAdminAuth(loginRequest(), { ...env, LOGIN_RATE_LIMITER: undefined })).status, 503);
  assert.equal((await handleAdminAuth(new Request(origin + "/api/admin/access", {
    method: "POST",
    headers: { Origin: origin, Authorization: "Bearer test-password-only" }
  }), env)).status, 503);
});

test("fails closed when the rate limit is exceeded or binding errors", async () => {
  const limited = { async limit() { return { success: false }; } };
  const broken = { async limit() { throw new Error("binding unavailable"); } };
  assert.equal((await handleAdminAuth(loginRequest(), { ...env, LOGIN_RATE_LIMITER: limited })).status, 503);
  assert.equal((await handleAdminAuth(loginRequest(), { ...env, LOGIN_RATE_LIMITER: broken })).status, 503);
});

test("issues HttpOnly Secure SameSite session and validates it", async () => {
  const response = await handleAdminAuth(loginRequest(), env);
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Strict/);
  const token = cookie.match(/acn_admin_session=([^;]+)/)[1];
  const sessionRequest = new Request(origin + "/api/admin/session", {
    headers: { Cookie: "acn_admin_session=" + token }
  });
  assert.equal(await verifyAdminSession(sessionRequest, env), true);
});

test("rejects invalid passwords and tampered or expired sessions", async () => {
  assert.equal((await handleAdminAuth(loginRequest("wrong-password"), env)).status, 401);

  const response = await handleAdminAuth(loginRequest(), env);
  const token = response.headers.get("set-cookie").match(/acn_admin_session=([^;]+)/)[1];
  const [payload, signature] = token.split(".");
  const tampered = payload + "." + (signature[0] === "a" ? "b" : "a") + signature.slice(1);
  assert.equal(await verifyAdminSession(new Request(origin, { headers: { Cookie: "acn_admin_session=" + tampered } }), env), false);
  assert.equal(await verifyAdminSession(new Request(origin, { headers: { Cookie: "acn_admin_session=" + token } }), env, Date.now() + 31 * 60 * 1000), false);
});
