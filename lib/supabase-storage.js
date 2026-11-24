function config() {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY1 || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) {
    const error = new Error("Supabase private storage is not configured");
    error.statusCode = 503;
    throw error;
  }
  let parsed;
  try { parsed = new URL(base); } catch { throw new Error("SUPABASE_URL is invalid"); }
  if (parsed.protocol !== "https:") throw new Error("SUPABASE_URL must use HTTPS");
  const bucket = process.env.SUPABASE_MEDIA_BUCKET || "newsroom-private-media";
  return { base: parsed.origin, key, bucket };
}

export async function supabaseStorageRequest(method, bucketName, pathname, bytes, contentType = "application/octet-stream") {
  const { base, key, bucket } = config();
  if (bucketName !== bucket) throw new Error("Unexpected media bucket");
  const objectPath = pathname.split("/").map(encodeURIComponent).join("/");
  const url = base + "/storage/v1/object/" + encodeURIComponent(bucket) + "/" + objectPath;
  const headers = { apikey: key, Authorization: "Bearer " + key };
  let response;
  if (method === "POST") {
    response = await fetch(url, { method, headers: { ...headers, "Content-Type": contentType, "x-upsert": "false" }, body: bytes, signal: AbortSignal.timeout(20000) });
  } else if (method === "GET") {
    response = await fetch(url, { method, headers, signal: AbortSignal.timeout(20000) });
  } else if (method === "DELETE") {
    response = await fetch(base + "/storage/v1/object/" + encodeURIComponent(bucket), {
      method, headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: [pathname] }), signal: AbortSignal.timeout(20000)
    });
  } else throw new Error("Unsupported Supabase Storage operation");
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    const error = new Error("Supabase Storage request failed (" + response.status + "): " + detail);
    error.statusCode = response.status >= 500 ? 502 : response.status;
    throw error;
  }
  return method === "GET" ? { statusCode: response.status, stream: response.body, contentType: response.headers.get("content-type") || "" } : true;
}

export async function getPrivateSupabaseObject(pathname) {
  const { bucket } = config();
  return supabaseStorageRequest("GET", bucket, pathname);
}
