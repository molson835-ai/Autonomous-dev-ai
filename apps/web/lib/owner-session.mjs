import { createHmac, timingSafeEqual } from "node:crypto";

const ISSUER = "eve-owner-console";
const AUDIENCE = "eve-web-owner-console";
const MAX_SESSION_SECONDS = 8 * 60 * 60;

export function createOwnerSession(ownerId, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (typeof ownerId !== "string" || !/^\d+$/.test(ownerId)) throw new TypeError("invalid_owner_id");
  if (typeof secret !== "string" || secret.length < 32) throw new TypeError("owner_session_signing_secret_missing");
  if (!Number.isSafeInteger(nowSeconds)) throw new TypeError("invalid_session_clock");

  const payload = Buffer.from(JSON.stringify({
    iss: ISSUER,
    aud: AUDIENCE,
    sub: ownerId,
    iat: nowSeconds,
    exp: nowSeconds + MAX_SESSION_SECONDS,
  })).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return payload + "." + signature;
}

export function verifyOwnerSession(token, secret, expectedOwnerId, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (
    typeof token !== "string" || token.length > 2048 ||
    typeof secret !== "string" || secret.length < 32 ||
    typeof expectedOwnerId !== "string" || !/^\d+$/.test(expectedOwnerId) ||
    !Number.isSafeInteger(nowSeconds)
  ) return false;

  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
  try {
    const expected = createHmac("sha256", secret).update(parts[0]).digest();
    const supplied = Buffer.from(parts[1], "base64url");
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return false;

    const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    return payload?.iss === ISSUER &&
      payload?.aud === AUDIENCE &&
      payload?.sub === expectedOwnerId &&
      Number.isSafeInteger(payload?.iat) &&
      Number.isSafeInteger(payload?.exp) &&
      payload.iat <= nowSeconds + 30 &&
      payload.exp > nowSeconds &&
      payload.exp - payload.iat <= MAX_SESSION_SECONDS &&
      nowSeconds - payload.iat <= MAX_SESSION_SECONDS + 30;
  } catch {
    return false;
  }
}
