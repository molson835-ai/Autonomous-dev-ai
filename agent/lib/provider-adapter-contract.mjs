import { createExecutionPlan } from "./provider-runtime-policy.mjs";
import { createIsolatedExecutionPolicy } from "./isolated-execution-policy.mjs";

const PROVIDERS = new Set(["vercel", "cloudflare"]);

/**
 * Offline adapter boundary. The injected client is shape-checked for the
 * later activation milestone, but is deliberately never invoked here.
 */
export function createProviderAdapter({ provider, client } = {}) {
  if (!PROVIDERS.has(provider)) throw new TypeError("provider must be vercel or cloudflare.");
  if (!client || typeof client !== "object" || typeof client.create !== "function" || typeof client.stop !== "function") {
    throw new TypeError("A provider client with create and stop functions is required.");
  }

  return Object.freeze({
    provider,
    prepare(request) {
      const plan = createExecutionPlan({ ...request, provider });
      if (!plan.valid) return { valid: false, status: "blocked", provider, reason: plan.reason, activationAllowed: false };

      const configuration = provider === "vercel"
        ? {
            ...createIsolatedExecutionPolicy(plan.timeoutMs),
            networkPolicy: "deny-all",
            persistent: false,
            credentials: false,
          }
        : {
            runtime: "cloudflare-container-candidate",
            timeoutMs: plan.timeoutMs,
            vcpus: 1,
            networkPolicy: "deny-all",
            persistent: false,
            credentials: false,
            envVars: {},
            exposedPorts: [],
            packageInstallation: false,
          };

      return Object.freeze({
        valid: true,
        status: "prepared_not_executed",
        provider,
        profile: plan.profile,
        timeoutMs: plan.timeoutMs,
        configuration: Object.freeze(configuration),
        activationAllowed: false,
      });
    },
  });
}
