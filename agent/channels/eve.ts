import { none, vercelOidc, type AuthFn } from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";
import { verifyOwnerGithubToken } from "../../memory/worker/src/owner-auth";

const OWNER_COOKIE = "eve_agent_owner";

function cookieValue(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get("cookie") ?? "";
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) {
      const value = part.slice(separator + 1).trim();
      return value.length > 0 && value.length <= 4096 ? value : null;
    }
  }
  return null;
}

/** Verify the same OAuth app and immutable GitHub owner ID used by the Owner Console. */
const ownerCookieAuth: AuthFn<Request> = async request => {
  const token = cookieValue(request, OWNER_COOKIE);
  if (!token) return null;

  const result = await verifyOwnerGithubToken(token, {
    GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
    OWNER_GITHUB_ID: process.env.OWNER_GITHUB_ID,
  });
  if (result !== "owner_auth_ok") return null;

  const ownerId = process.env.OWNER_GITHUB_ID;
  if (!ownerId) return null;
  return {
    authenticator: "github-owner",
    issuer: "github",
    principalType: "user",
    principalId: ownerId,
    attributes: { role: "owner" },
  };
};

/*
 * Owner-cookie sessions can use approved stateful tools. Vercel's verified
 * service identity is reserved for internal/scheduled work. Anonymous chat
 * remains available, but dynamic tool policy exposes it read-only.
 */
export default eveChannel({
  auth: [ownerCookieAuth, vercelOidc(), none()],
});
