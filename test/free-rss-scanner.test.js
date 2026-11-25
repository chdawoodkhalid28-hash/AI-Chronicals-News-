import test from "node:test";
import assert from "node:assert/strict";
import { parseRss, scanFeeds } from "../lib/free-rss-scanner.js";

test("parses RSS entries as unverified candidates only", () => {
  const xml = '<rss><channel><item><title>Test &amp; story</title><link>https://example.org/a</link><pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate></item></channel></rss>';
  const rows = parseRss(xml, { id: "test", label: "Test Feed" });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, "Test & story");
  assert.equal(rows[0].status, "candidate_unverified");
});
test("drops missing titles, non-HTTPS links and deduplicates URLs", async () => {
  const feeds = [{ id: "f1", label: "F1", url: "https://feed.test/rss" }, { id: "f2", label: "F2", url: "https://feed.test/rss2" }];
  const xml = '<rss><item><title>Good</title><link>https://example.org/x</link></item><item><title>Bad</title><link>http://example.org/y</link></item></rss>';
  const report = await scanFeeds({ feeds, fetchImpl: async () => ({ ok: true, status: 200, text: async () => xml }) });
  assert.equal(report.candidateCount, 1);
  assert.equal(report.candidates[0].status, "candidate_unverified");
});
test("feed failures are recorded without stopping other feeds", async () => {
  const feeds = [{ id: "bad", label: "Bad", url: "https://feed.test/bad" }, { id: "good", label: "Good", url: "https://feed.test/good" }];
  const report = await scanFeeds({ feeds, fetchImpl: async (url) => { if (url.endsWith("/bad")) throw new Error("network timeout"); return { ok: true, status: 200, text: async () => '<rss><item><title>ok</title><link>https://example.com</link></item></rss>' }; } });
  assert.equal(report.errors.length, 1);
  assert.equal(report.candidateCount, 1);
});
