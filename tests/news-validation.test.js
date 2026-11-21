import test from "node:test";
import assert from "node:assert/strict";
import { validateArticleInput, canMarkVerified } from "../lib/news-validation.js";

test("requires a valid headline and rejects malformed or non-HTTPS sources", () => {
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
  assert.equal(canMarkVerified([{ is_official: true, source_url: "https://untrusted.example/story" }]), false);
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
test("ignores spoofed publisher labels and normalizes www hostnames", () => {
  const result = validateArticleInput({
    headline: "A sufficiently long headline",
    sources: [
      { url: "https://www.example.com/first", publisher: "Publisher One" },
      { url: "https://example.com/second", publisher: "Publisher Two" }
    ]
  });
  assert.equal(result.ok, true);
  assert.equal(result.sources[0].publisher, "example.com");
  assert.equal(result.sources[1].publisher, "example.com");
  assert.equal(canMarkVerified(result.sources), false);
});


test("allows a source-less draft but never treats it as verified", () => {
  const result = validateArticleInput({
    headline: "A sufficiently detailed draft headline",
    summary: "Unverified draft",
    body: "Draft awaiting source links",
    sources: []
  });
  assert.equal(result.ok, true);
  assert.equal(result.sources.length, 0);
  assert.equal(result.article.editorial_status, "pending_verification");
  assert.equal(result.article.publication_status, "disabled");
  assert.equal(canMarkVerified(result.sources), false);
});


test("ignores client-supplied official flags and trusts only configured official domains", () => {
  const previous = process.env.OFFICIAL_SOURCE_DOMAINS;
  delete process.env.OFFICIAL_SOURCE_DOMAINS;
  assert.equal(canMarkVerified([{ is_official: true, publisher: "gov.example", source_url: "https://untrusted.example/story" }]), false);
  const spoofed = validateArticleInput({
    headline: "A sufficiently long headline",
    sources: [{ url: "https://untrusted.example/story", official: true }]
  });
  assert.equal(spoofed.ok, true);
  assert.equal(spoofed.sources[0].is_official, false);
  assert.equal(spoofed.sources[0].source_type, "independent");

  process.env.OFFICIAL_SOURCE_DOMAINS = "gov.example, official.gov.pk";
  const trusted = validateArticleInput({
    headline: "A sufficiently long headline",
    sources: [{ url: "https://www.gov.example/notice", official: false }]
  });
  assert.equal(trusted.sources[0].is_official, true);
  assert.equal(canMarkVerified(trusted.sources), true);
  if (previous === undefined) delete process.env.OFFICIAL_SOURCE_DOMAINS;
  else process.env.OFFICIAL_SOURCE_DOMAINS = previous;
});
