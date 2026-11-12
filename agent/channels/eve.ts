import { localDev, none, verifyHttpBasic, type AuthFn } from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";
import { env } from "node:process";

const username = env.ROUTE_AUTH_BASIC_USER;
const password = env.ROUTE_AUTH_BASIC_PASSWORD;

// Preview is intentionally anonymous for owner testing. Production retains
// the existing owner-only Basic authentication and local development fallback.
const isPreview = env.VERCEL_ENV === "preview";

const ownerAuth: AuthFn<Request> = async (request) => {
  if (!username || !password) return null;

  const result = verifyHttpBasic(request.headers.get("authorization"), {
    username,
    password,
  });

  if (!result.ok) return null;

  return {
    ...result.sessionAuth,
    principalType: "service",
  };
};

export default eveChannel({
  auth: isPreview ? [none()] : [ownerAuth, localDev()],
});
