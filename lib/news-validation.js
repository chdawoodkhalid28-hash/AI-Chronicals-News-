export const EDITORIAL_STATUSES = new Set([
  "pending_verification", "verified", "needs_revision",
  "approved_not_published", "rejected"
]);

export function validateArticleInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "Article payload is required" };
  const headline = typeof input.headline === "string" ? input.headline.trim() : "";
  const summary = typeof input.summary === "string" ? input.summary.trim() : "";
  const body = typeof input.body === "string" ? input.body.trim() : "";
  const language = input.language === "en" ? "en" : "ur";
  const category = typeof input.category === "string" ? input.category.trim().slice(0, 80) : "general";
  const assignedDesk = typeof input.assignedDesk === "string" ? input.assignedDesk.trim().slice(0, 100) : "newsroom";
  if (headline.length < 8 || headline.length > 240) return { ok: false, error: "Headline must contain 8 to 240 characters" };
  if (summary.length > 1200 || body.length > 30000) return { ok: false, error: "Summary or body exceeds the allowed length" };
  if (!category || !assignedDesk) return { ok: false, error: "Category and assigned desk are required" };
  const rawSources = Array.isArray(input.sources) ? input.sources.slice(0, 20) : [];
  if (!rawSources.length) return { ok: false, error: "At least one source URL is required" };
  const sources = [];
  const seen = new Set();
  for (const source of rawSources) {
    const rawUrl = typeof source === "string" ? source : source && source.url;
    let url;
    try { url = new URL(rawUrl); } catch { return { ok: false, error: "Every source must be a valid HTTPS URL" }; }
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return { ok: false, error: "Every source must be a valid HTTPS URL" };
    const normalized = url.toString();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    sources.push({
      source_url: normalized,
      source_title: typeof source === "object" && source ? String(source.title || "").slice(0, 240) : "",
      publisher: typeof source === "object" && source ? String(source.publisher || "").slice(0, 160) : "",
      source_type: source && source.official ? "official" : "independent",
      is_official: Boolean(source && source.official)
    });
  }
  if (!sources.length) return { ok: false, error: "At least one valid source is required" };
  return { ok: true, article: { headline, summary, body, language, category, assigned_desk: assignedDesk, editorial_status: "pending_verification", publication_status: "disabled" }, sources };
}

export function canMarkVerified(sources) {
  if (!Array.isArray(sources)) return false;
  return sources.some(source => source.is_official === true) || sources.length >= 2;
}
