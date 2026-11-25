/**
 * Build the cookie header for the Eve channel from the already-verified owner
 * session token. This is only used server-to-server; Eve independently
 * verifies the OAuth app and immutable GitHub owner ID before authenticating.
 */
export function buildOwnerChannelCookieHeader(cookieName, token) {
  if (typeof cookieName !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(cookieName)) return null;
  if (typeof token !== "string" || token.length < 1 || token.length > 4096) return null;
  // GitHub OAuth access tokens are URL/cookie-safe opaque strings. Reject
  // separators rather than allowing caller-controlled cookie attributes.
  if (!/^[A-Za-z0-9_-]+$/.test(token)) return null;
  return cookieName + "=" + token;
}
