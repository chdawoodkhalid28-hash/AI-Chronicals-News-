const FEEDS = [
  { id: "bbc-world", label: "BBC News World", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { id: "bbc-top", label: "BBC News Top Stories", url: "https://feeds.bbci.co.uk/news/rss.xml" }
];

const MAX_FEED_BYTES = 1_000_000;
const MAX_ITEMS_PER_FEED = 30;
const FETCH_TIMEOUT_MS = 12_000;

function decodeEntities(value = "") {
  return value.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}
function stripTags(value = "") { return decodeEntities(value.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim(); }
function getTag(item, tag) {
  const match = item.match(new RegExp("<" + tag + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + tag + ">", "i"));
  return match ? stripTags(match[1]) : "";
}
export function parseRss(xml, feed) {
  const entries = xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) || [];
  return entries.slice(0, MAX_ITEMS_PER_FEED).map(item => {
    const link = getTag(item, "link");
    const title = getTag(item, "title");
    const date = getTag(item, "pubDate");
    if (!title || !link || !/^https:\/\//i.test(link)) return null;
    return { title, url: link, publishedAt: date || null, feedId: feed.id, feedName: feed.label, status: "candidate_unverified", discoveredAt: new Date().toISOString() };
  }).filter(Boolean);
}
async function fetchFeed(feed, fetchImpl = fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetchImpl(feed.url, { signal: controller.signal, headers: { "User-Agent": "AIChronicalsNews-RSSCandidateScanner/1.0", accept: "application/rss+xml, application/xml, text/xml" } });
    if (!response.ok) throw new Error("HTTP " + response.status + " from " + feed.id);
    const text = await response.text();
    if (text.length > MAX_FEED_BYTES) throw new Error("Feed exceeded size limit: " + feed.id);
    return parseRss(text, feed);
  } finally { clearTimeout(timeout); }
}
export async function scanFeeds({ feeds = FEEDS, fetchImpl = fetch } = {}) {
  const results = [];
  const errors = [];
  for (const feed of feeds) {
    try { results.push(...await fetchFeed(feed, fetchImpl)); }
    catch (error) { errors.push({ feedId: feed.id, message: String(error?.message || error) }); }
  }
  const seen = new Set();
  const candidates = results.filter(item => {
    const url = item.url.trim();
    if (seen.has(url)) return false;
    seen.add(url); return true;
  });
  return { generatedAt: new Date().toISOString(), feedCount: feeds.length, candidateCount: candidates.length, errors, candidates };
}
export { FEEDS };
