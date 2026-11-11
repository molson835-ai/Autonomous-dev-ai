import { localDev, verifyHttpBasic, type AuthFn } from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";
import { env } from "node:process";

const username = env.ROUTE_AUTH_BASIC_USER;
const password = env.ROUTE_AUTH_BASIC_PASSWORD;

// Use a custom verifier so failed credentials return an API 401 rather than
// triggering the browser's native HTTP Basic sign-in dialog. The operator
// principal can also read /eve/v1/info, which the browser uses to verify sign-in.
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
  auth: [ownerAuth, localDev()],
});
