const TABLES = new Set([
  "news_articles", "news_sources", "news_verification_checks",
  "editorial_events", "department_outputs", "media_assets"
]);

function configuration() {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY1 || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) {
    const error = new Error("Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY1 (or SUPABASE_SERVICE_ROLE_KEY) in Vercel.");
    error.statusCode = 503;
    throw error;
  }
  let url;
  try { url = new URL(base); } catch {
    const error = new Error("SUPABASE_URL is invalid");
    error.code = "SUPABASE_URL_INVALID";
    error.statusCode = 503;
    throw error;
  }
  if (url.protocol !== "https:") {
    const error = new Error("SUPABASE_URL must use HTTPS");
    error.code = "SUPABASE_URL_HTTPS_REQUIRED";
    error.statusCode = 503;
    throw error;
  }
  return { base: url.origin, key };
}

export async function supabaseRequest(table, { method = "GET", query = "", body, prefer = "return=representation" } = {}) {
  if (!TABLES.has(table)) throw new Error("Unsupported database table");
  const { base, key } = configuration();
  let response;
  try {
    response = await fetch(base + "/rest/v1/" + table + (query ? "?" + query : ""), {
      method,
      headers: {
        apikey: key,
        ...(key.startsWith("sb_secret_") ? {} : { Authorization: "Bearer " + key }),
        "Content-Type": "application/json",
        Accept: "application/json",
        Prefer: prefer
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(8000)
    });
  } catch {
    const error = new Error("Supabase network request failed");
    error.code = "SUPABASE_NETWORK_ERROR";
    error.statusCode = 503;
    throw error;
  }
  const text = await response.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = { message: text.slice(0, 1000) }; } }
  if (!response.ok) {
    const error = new Error(data && (data.message || data.hint || data.details) || "Supabase request failed");
    error.statusCode = response.status >= 500 ? 502 : response.status;
    throw error;
  }
  return data;
}
