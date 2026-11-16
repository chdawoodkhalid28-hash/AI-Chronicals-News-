import test from "node:test";
import assert from "node:assert/strict";
import { validateArticleInput, canMarkVerified } from "../lib/news-validation.js";

test("requires HTTPS sources and a valid headline", () => {
  assert.equal(validateArticleInput({ headline: "Short", sources: ["https://example.com"] }).ok, false);
  assert.equal(validateArticleInput({ headline: "A verified headline", sources: ["http://example.com"] }).ok, false);
});
test("normalizes valid article payload and keeps publication disabled", () => {
  const result = validateArticleInput({ headline: "A sufficiently long headline", summary: "Summary", body: "Copy", sources: ["https://example.com/story"] });
  assert.equal(result.ok, true);
  assert.equal(result.article.editorial_status, "pending_verification");
  assert.equal(result.article.publication_status, "disabled");
});
test("requires two sources or one official source for verification", () => {
  assert.equal(canMarkVerified([{ is_official: false }]), false);
  assert.equal(canMarkVerified([{ is_official: false, publisher: "one.example" }, { is_official: false, publisher: "two.example" }]), true);
  assert.equal(canMarkVerified([{ is_official: true }]), true);
});
test("deduplicates sources and rejects credentials in URLs", () => {
  const result = validateArticleInput({ headline: "A sufficiently long headline", sources: ["https://example.com/a", "https://example.com/a"] });
  assert.equal(result.sources.length, 1);
  const bad = validateArticleInput({ headline: "A sufficiently long headline", sources: ["https://user:pass@example.com/a"] });
  assert.equal(bad.ok, false);
});

test("requires distinct publisher domains for the two-source verification path", () => {
  assert.equal(canMarkVerified([{ publisher: "publisher.example" }, { publisher: "publisher.example" }]), false);
  assert.equal(canMarkVerified([{ publisher: "one.example" }, { publisher: "two.example" }]), true);
});
test("infers a publisher domain when source metadata is omitted", () => {
  const result = validateArticleInput({ headline: "A sufficiently long headline", sources: ["https://one.example/a", "https://two.example/b"] });
  assert.equal(result.ok, true);
  assert.equal(result.sources[0].publisher, "one.example");
  assert.equal(result.sources[1].publisher, "two.example");
});
