import test from "node:test";
import assert from "node:assert/strict";
import { handleAdminAuth, verifyAdminSession } from "../cloudflare/admin-auth.js";

const env = { ADMIN_PASSWORD: "test-password-only", ADMIN_SESSION_SECRET: "test-session-secret-only" };
const origin = "https://preview.example";

test("rejects login without same-origin Origin", async () => {
  const request = new Request(origin + "/api/admin/access", {
    method: "POST",
    headers: { Authorization: "Bearer test-password-only" }
  });
  const response = await handleAdminAuth(request, env);
  assert.equal(response.status, 403);
});

test("issues HttpOnly Secure SameSite session and validates it", async () => {
  const request = new Request(origin + "/api/admin/access", {
    method: "POST",
    headers: { Origin: origin, Authorization: "Bearer test-password-only" }
  });
  const response = await handleAdminAuth(request, env);
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
  const badLogin = new Request(origin + "/api/admin/access", {
    method: "POST",
    headers: { Origin: origin, Authorization: "Bearer wrong-password" }
  });
  assert.equal((await handleAdminAuth(badLogin, env)).status, 401);

  const login = new Request(origin + "/api/admin/access", {
    method: "POST",
    headers: { Origin: origin, Authorization: "Bearer test-password-only" }
  });
  const response = await handleAdminAuth(login, env);
  const token = response.headers.get("set-cookie").match(/acn_admin_session=([^;]+)/)[1];
  const [payload, signature] = token.split(".");
  const tampered = payload + "." + (signature[0] === "a" ? "b" : "a") + signature.slice(1);
  assert.equal(await verifyAdminSession(new Request(origin, { headers: { Cookie: "acn_admin_session=" + tampered } }), env), false);
  assert.equal(await verifyAdminSession(new Request(origin, { headers: { Cookie: "acn_admin_session=" + token } }), env, Date.now() + 31 * 60 * 1000), false);
});
