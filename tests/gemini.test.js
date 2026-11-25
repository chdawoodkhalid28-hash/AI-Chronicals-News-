import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MODEL, generateGeminiText } from "../lib/gemini.js";

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

test.afterEach(() => {
  process.env = { ...originalEnv };
  globalThis.fetch = originalFetch;
});

test("Gemini defaults to the configured primary Flash model", () => {
  assert.equal(DEFAULT_MODEL, "gemini-3.8-flash");
});

test("Gemini generation calls the configured model without exposing the API key", async () => {
  process.env.GEMINI_API_KEY = "test-only-gemini-key";
  let requestUrl = "";
  let requestOptions;
  globalThis.fetch = async (url, options) => {
    requestUrl = String(url);
    requestOptions = options;
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: "GEMINI_CONNECTION_OK" }] } }],
      usageMetadata: { totalTokenCount: 5 }
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const result = await generateGeminiText("Reply with a connection check", { maxOutputTokens: 32 });

  assert.ok(requestUrl.endsWith("/models/gemini-3.8-flash:generateContent"));
  assert.equal(requestOptions.headers["x-goog-api-key"], "test-only-gemini-key");
  assert.ok(requestOptions.signal);
  assert.equal(result.text, "GEMINI_CONNECTION_OK");
  assert.equal(result.model, "gemini-3.8-flash");
  assert.equal(JSON.stringify(result).includes("test-only-gemini-key"), false);
});

test("Gemini fails safely when no API key is configured", async () => {
  delete process.env.GEMINI_API_KEY;
  await assert.rejects(
    () => generateGeminiText("test"),
    error => error.code === "GEMINI_KEY_MISSING"
  );
});
