export const config = {
  matcher: ["/connectors.html"]
};

function readCookie(request, name) {
  const cookieHeader = request.headers.get("cookie") || "";
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
  return Response.redirect(new URL("/admin.html#assignmentPanel", request.url), 302);
}
