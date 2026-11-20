const THRESHOLDS = Object.freeze({ observe: 50, warn: 75, stopOptional: 90, stopAll: 100 });

function finiteNonNegative(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** Evaluate provider-reported usage. Unknown values fail closed; no billing API is called. */
export function evaluateExecutionUsage(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { valid: false, reason: "Usage snapshot is required.", action: "block" };
  }
  const allowed = new Set(["provider", "period", "cpuUsed", "cpuLimit", "memoryUsed", "memoryLimit", "creationsUsed", "creationsLimit", "spendUsed", "spendLimit", "currency", "sourceVerified"]);
  if (Object.keys(input).some((key) => !allowed.has(key))) {
    return { valid: false, reason: "Unsupported usage field.", action: "block" };
  }
  if (!["vercel", "cloudflare"].includes(input.provider) || typeof input.period !== "string" || !input.period ||
      input.sourceVerified !== true || typeof input.currency !== "string" || !/^[A-Z]{3}$/.test(input.currency)) {
    return { valid: false, reason: "Provider, period, verified source, and currency are required.", action: "block" };
  }
  const pairs = [["cpuUsed","cpuLimit"],["memoryUsed","memoryLimit"],["creationsUsed","creationsLimit"],["spendUsed","spendLimit"]];
  const ratios = [];
  for (const [used, limit] of pairs) {
    if (input[used] === undefined && input[limit] === undefined) continue;
    if (!finiteNonNegative(input[used]) || !finiteNonNegative(input[limit]) || input[limit] <= 0) {
      return { valid: false, reason: `Invalid or incomplete usage pair: ${used}/${limit}.`, action: "block" };
    }
    ratios.push(input[used] / input[limit] * 100);
  }
  if (ratios.length === 0) return { valid: false, reason: "At least one verified usage pair is required.", action: "block" };
  const percent = Math.max(...ratios);
  const action = percent >= THRESHOLDS.stopAll ? "stop_all"
    : percent >= THRESHOLDS.stopOptional ? "stop_optional"
    : percent >= THRESHOLDS.warn ? "warn"
    : percent >= THRESHOLDS.observe ? "observe" : "allow_within_configured_budget";
  return { valid: true, provider: input.provider, period: input.period, utilizationPercent: Math.round(percent * 100) / 100, action, thresholds: { ...THRESHOLDS }, status: "assessment_only" };
}

export function getUsageThresholds() { return { ...THRESHOLDS }; }
