const REQUIRED_EVIDENCE = Object.freeze([
  "planEligibility",
  "commercialUse",
  "usageLimits",
  "billingControls",
  "isolationControls",
]);
const ALLOWED_TOP_LEVEL = new Set(["provider", "ownerApproved", "now", "evidence", "maxEvidenceAgeMs"]);
const MAX_EVIDENCE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function blocked(provider, reasons) {
  return { status: "blocked", provider: provider ?? null, activationAllowed: false, reasons };
}

/**
 * Assess whether evidence is complete enough to request a separate
 * activation review. This function can never authorize activation.
 */
export function evaluateProviderReadiness(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return blocked(null, ["A readiness input object is required."]);
  }
  const extra = Object.keys(input).filter((key) => !ALLOWED_TOP_LEVEL.has(key));
  if (extra.length) return blocked(input.provider, ["Unsupported readiness property."]);
  const { provider, ownerApproved, now, evidence } = input;
  if (provider !== "vercel" && provider !== "cloudflare") return blocked(provider, ["Unsupported provider."]);
  if (ownerApproved !== true) return blocked(provider, ["Explicit owner approval is required for a separate activation review."]);
  if (typeof now !== "string" || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(now) || !Number.isFinite(Date.parse(now))) {
    return blocked(provider, ["A valid timezone-aware assessment timestamp is required."]);
  }
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return blocked(provider, ["Evidence object is required."]);
  const keys = Object.keys(evidence);
  if (keys.length !== REQUIRED_EVIDENCE.length || REQUIRED_EVIDENCE.some((key) => !keys.includes(key))) {
    return blocked(provider, ["Evidence must contain exactly the five required categories."]);
  }
  const nowMs = Date.parse(now);
  const maxAgeMs = input.maxEvidenceAgeMs ?? MAX_EVIDENCE_AGE_MS;
  if (!Number.isInteger(maxAgeMs) || maxAgeMs < 1 || maxAgeMs > MAX_EVIDENCE_AGE_MS) {
    return blocked(provider, ["maxEvidenceAgeMs must be an integer from 1 through 604800000."]);
  }
  const reasons = [];
  for (const key of REQUIRED_EVIDENCE) {
    const item = evidence[key];
    if (!item || typeof item !== "object" || Array.isArray(item) ||
        Object.keys(item).some((field) => !["verified", "evidenceRef", "checkedAt"].includes(field)) ||
        item.verified !== true) {
      reasons.push(`${key}: verified evidence is required.`);
      continue;
    }
    if (typeof item.evidenceRef !== "string" || !/^https:\/\//i.test(item.evidenceRef) || item.evidenceRef.length > 2048) {
      reasons.push(`${key}: a non-empty HTTPS evidence reference is required.`);
    }
    if (typeof item.checkedAt !== "string" ||
        !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(item.checkedAt) ||
        !Number.isFinite(Date.parse(item.checkedAt))) {
      reasons.push(`${key}: a timezone-aware checkedAt timestamp is required.`);
    } else {
      const age = nowMs - Date.parse(item.checkedAt);
      if (age < 0 || age > maxAgeMs) reasons.push(`${key}: evidence is future-dated or stale.`);
    }
  }
  if (reasons.length) return blocked(provider, reasons);
  return {
    status: "ready_for_separate_activation_review",
    provider,
    activationAllowed: false,
    reasons: [],
  };
}
