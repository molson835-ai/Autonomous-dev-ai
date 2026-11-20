const MAX_TIMEOUT_MS = 60_000;
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Return a deny-by-default Vercel Sandbox configuration for an untrusted
 * execution job. This is configuration only; it does not create a sandbox.
 * Keep credentials, network access, persistence, and exposed ports absent.
 */
export function createIsolatedExecutionPolicy() {
  return Object.freeze({
    timeout: DEFAULT_TIMEOUT_MS,
    persistent: false,
    resources: Object.freeze({ vcpus: 1 }),
    networkPolicy: "deny-all",
    ports: Object.freeze([]),
    env: Object.freeze({}),
    limits: Object.freeze({
      maxTimeoutMs: MAX_TIMEOUT_MS,
      maxOutputBytes: 64 * 1024,
      maxInputBytes: 80 * 1024,
      maxFiles: 5,
      filesystemScope: "ephemeral-sandbox-only",
      packageInstallation: false,
      sudo: false,
      credentials: false,
      network: false,
      persistence: false,
      exposedPorts: false,
      automaticToolRegistration: false,
      automaticExecutionOfGeneratedTools: false,
    }),
  });
}

/**
 * Validate an execution request before a future sandbox adapter is called.
 * Only bounded, already-reviewed command profiles are representable.
 * This stage intentionally has no command execution implementation.
 */
export function validateIsolatedExecutionRequest(request) {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    return { valid: false, reason: "An execution request object is required." };
  }
  const allowedKeys = new Set(["profile", "inputBytes", "timeoutMs"]);
  if (Object.keys(request).some((key) => !allowedKeys.has(key))) {
    return { valid: false, reason: "Unsupported execution request property." };
  }
  if (request.profile !== "node-test-pure-js") {
    return { valid: false, reason: "Only the reviewed pure-JavaScript test profile is defined." };
  }
  if (!Number.isInteger(request.inputBytes) || request.inputBytes < 1 || request.inputBytes > 80 * 1024) {
    return { valid: false, reason: "inputBytes must be an integer from 1 to 81920." };
  }
  const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
    return { valid: false, reason: "timeoutMs must be an integer from 1 to 60000." };
  }
  return {
    valid: true,
    profile: "node-test-pure-js",
    timeoutMs,
    policy: createIsolatedExecutionPolicy(),
    status: "validated_not_executed",
  };
}
