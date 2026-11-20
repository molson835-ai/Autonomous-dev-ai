const MAX_TIMEOUT_MS = 60_000;
const PROFILES = Object.freeze({
  "node-test-pure-js": Object.freeze({ timeoutMs: 30_000, maxInputBytes: 80 * 1024, maxOutputBytes: 64 * 1024 }),
  "bounded-analysis": Object.freeze({ timeoutMs: 45_000, maxInputBytes: 48 * 1024, maxOutputBytes: 48 * 1024 }),
});
const PROVIDERS = Object.freeze({
  vercel: Object.freeze({ id: "vercel", status: "candidate", networkPolicy: "deny-all", persistent: false, secrets: false }),
  cloudflare: Object.freeze({ id: "cloudflare", status: "candidate", networkPolicy: "deny-all", persistent: false, secrets: false }),
});

/** Provider-neutral plan only. It cannot create a sandbox or invoke a provider. */
export function createExecutionPlan(request) {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    return { valid: false, reason: "An execution request object is required." };
  }
  if (Object.keys(request).some((key) => !["profile", "provider", "timeoutMs", "inputBytes"].includes(key))) {
    return { valid: false, reason: "Unsupported execution request property." };
  }
  const profile = PROFILES[request.profile];
  if (!profile) return { valid: false, reason: "Unknown execution profile." };
  const provider = PROVIDERS[request.provider];
  if (!provider) return { valid: false, reason: "Provider must be vercel or cloudflare." };
  if (!Number.isInteger(request.inputBytes) || request.inputBytes < 1 || request.inputBytes > profile.maxInputBytes) {
    return { valid: false, reason: "Input exceeds the selected profile limit." };
  }
  const timeoutMs = request.timeoutMs ?? profile.timeoutMs;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
    return { valid: false, reason: "Timeout must be an integer from 1 to 60000." };
  }
  return {
    valid: true,
    status: "planned_not_executed",
    provider: provider.id,
    providerStatus: provider.status,
    profile: request.profile,
    timeoutMs,
    limits: { ...profile, timeoutMs, network: "deny-all", persistent: false, credentials: false, packageInstallation: false, shell: false, exposedPorts: false },
    activationAllowed: false,
  };
}

export function listExecutionProviders() {
  return Object.values(PROVIDERS).map((provider) => ({ ...provider, activationAllowed: false }));
}

export function getExecutionProfile(name) {
  const profile = PROFILES[name];
  return profile ? { ...profile } : null;
}
