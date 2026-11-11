import { httpBasic, localDev, type AuthFn } from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";
import { env } from "node:process";

const username = env.ROUTE_AUTH_BASIC_USER;
const password = env.ROUTE_AUTH_BASIC_PASSWORD;

// Production remains closed until both secrets are configured in Vercel.
const ownerAuth: AuthFn<Request> =
  username && password
    ? httpBasic({ username, password }, { realm: "Autonomous Dev AI" })
    : async () => null;

export default eveChannel({
  auth: [ownerAuth, localDev()],
});
