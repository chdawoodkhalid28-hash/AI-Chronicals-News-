export const config = {
  matcher: ["/connectors.html"]
};

function headerValue(request, name) {
  const headers = request && request.headers;
  if (!headers) return "";
  if (typeof headers.get === "function") return headers.get(name) || "";
  const target = name.toLowerCase();
  const key = Object.keys(headers).find(item => item.toLowerCase() === target);
  return key ? String(headers[key] || "") : "";
}

function readCookie(request, name) {
  const cookieStore = request && request.cookies;
  if (cookieStore && typeof cookieStore.get === "function") {
    const found = cookieStore.get(name);
    if (found) return typeof found === "string" ? found : String(found.value || "");
  }
  const cookieHeader = headerValue(request, "cookie");
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    if (key === name) return part.slice(separator + 1).trim();
  }
  return "";
}

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function redirectToAdmin(request) {
  const forwardedHost = headerValue(request, "x-forwarded-host") || headerValue(request, "host");
  const forwardedProto = headerValue(request, "x-forwarded-proto") || "https";
  const fallbackOrigin = forwardedHost ? forwardedProto + "://" + forwardedHost : "https://ai-chronicals-news.vercel.app";
  const requestUrl = request && typeof request.url === "string" ? request.url : fallbackOrigin + "/";
  return Response.redirect(new URL("/admin.html#assignmentPanel", requestUrl), 302);
}

export default async function middleware(request) {
  const secret = process.env.ADMIN_PASSWORD || process.env.ADMINPASSWORD;
  const token = readCookie(request, "acn_admin_access");
  const [expiresAt, signature, extra] = token.split(".");
  let authorized = false;

  if (
    secret &&
    expiresAt &&
    signature &&
    !extra &&
    /^\d{13}$/.test(expiresAt) &&
    Number(expiresAt) > Date.now()
  ) {
    try {
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"]
      );
      authorized = await crypto.subtle.verify(
        "HMAC",
        key,
        decodeBase64Url(signature),
        new TextEncoder().encode(expiresAt)
      );
    } catch {
      authorized = false;
    }
  }

  if (authorized) return;
  return redirectToAdmin(request);
}
