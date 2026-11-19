import test from "node:test";
import assert from "node:assert/strict";
import middleware from "../middleware.js";

test("middleware redirects safely when request headers are absent", async () => {
  const response = await middleware({ url: "https://example.vercel.app/connectors.html" });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "https://example.vercel.app/admin.html#assignmentPanel");
});

test("middleware accepts plain-object headers without throwing", async () => {
  const response = await middleware({
    url: "https://example.vercel.app/connectors.html",
    headers: { host: "example.vercel.app", cookie: "" }
  });
  assert.equal(response.status, 302);
  assert.match(response.headers.get("location"), /\/admin\.html#assignmentPanel$/);
});

test("middleware accepts a Web-Headers-like request with no cookie", async () => {
  const response = await middleware({
    url: "https://example.vercel.app/connectors.html",
    headers: { get: () => null }
  });
  assert.equal(response.status, 302);
});
