const ALLOWED_RESOURCE_HOSTS = new Set([
  "developer.mozilla.org",
  "tc39.es",
  "owasp.org",
  "developers.cloudflare.com",
  "vercel.com"
]);

const RESOURCE_TYPES = new Set([
  "documentation", "tutorial", "skill", "repository", "tool",
  "model", "dataset", "benchmark", "hardware_reference",
  "api", "library", "compute", "storage", "asset"
]);

const COST_MODELS = new Set([
  "free_open_source", "free_tier_limited", "paid", "unknown"
]);
const ACCESS_MODES = new Set(["public_read", "authenticated_read", "local_only", "owner_action_required"]);
const PERSISTENCE_VALUES = new Set(["durable", "ephemeral", "unknown"]);
const EXECUTION_MODES = new Set(["none", "browser_local", "server_runtime", "interactive_remote", "unknown"]);
const DATA_CLASSES = new Set(["public", "owner_selected_local", "approved_private"]);
const COMMERCIAL_USE = new Set(["allowed", "prohibited", "conditional", "unknown"]);
const ADAPTER_STATES = new Set(["candidate", "implemented", "tested", "enabled", "paused", "retired"]);
const FAILURE_POLICIES = new Set(["bounded_retry", "pause", "local_fallback", "manual_review"]);
const QUOTA_CONFIDENCE = new Set(["high", "medium", "low", "unknown"]);

const INPUT_FIELDS = new Set([
  "id", "name", "summary", "resource_type", "skill_tags", "source_url",
  "maintainer", "license", "version_or_revision", "cost_model",
  "cost_notes", "dependencies", "permissions",
  "network_or_execution_requirements", "security_notes",
  "retrieved_at", "last_verified_at", "freshness_policy",
  "access_mode", "persistence", "execution", "data_classes_allowed",
  "commercial_use", "quota_evidence", "adapter_status", "failure_policy",
  "deletion_and_export"
]);

function requiredString(value, field, maxLength) {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maxLength) {
    throw new TypeError(`Invalid resource field: ${field}`);
  }
  return value.trim();
}

function stringList(value, field, { maxItems = 100, maxLength = 300 } = {}) {
  if (!Array.isArray(value) || value.length > maxItems ||
      value.some((item) => typeof item !== "string" ||
        item.trim().length === 0 || item.length > maxLength)) {
    throw new TypeError(`Invalid resource field: ${field}`);
  }
  const normalized = value.map((item) => item.trim());
  if (new Set(normalized).size !== normalized.length) {
    throw new TypeError(`Duplicate values in resource field: ${field}`);
  }
  return normalized;
}

function enumValue(value, field, allowed, fallback) {
  const normalized = value ?? fallback;
  if (!allowed.has(normalized)) throw new TypeError(`Invalid resource field: ${field}`);
  return normalized;
}

function enumList(value, field, allowed, fallback) {
  const normalized = stringList(value ?? fallback, field, { maxItems: 10, maxLength: 40 });
  if (normalized.some((item) => !allowed.has(item))) throw new TypeError(`Invalid resource field: ${field}`);
  return normalized;
}

function validDateTime(value) {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , , offsetHourText, offsetMinuteText] = match;
  const year = Number(yearText), month = Number(monthText), day = Number(dayText);
  const hour = Number(hourText), minute = Number(minuteText), second = Number(secondText);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth ||
      hour > 23 || minute > 59 || second > 59) return false;
  if (offsetHourText !== undefined &&
      (Number(offsetHourText) > 23 || Number(offsetMinuteText) > 59)) return false;
  return Number.isFinite(Date.parse(value));
}

function validateQuotaEvidence(value) {
  if (value === undefined) return {
    limits: "unknown",
    confidence: "unknown"
  };
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Invalid resource field: quota_evidence");
  }
  const allowedKeys = new Set(["source_url", "checked_at", "limits", "confidence"]);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    throw new TypeError("Unsupported quota_evidence field");
  }
  const confidence = enumValue(value.confidence, "quota_evidence.confidence", QUOTA_CONFIDENCE, "unknown");
  const result = {
    limits: value.limits === undefined ? "unknown" : requiredString(value.limits, "quota_evidence.limits", 1000),
    confidence
  };
  if (value.source_url !== undefined) {
    const sourceUrl = requiredString(value.source_url, "quota_evidence.source_url", 2048);
    let parsed;
    try { parsed = new URL(sourceUrl); } catch { throw new TypeError("Invalid quota evidence source URL"); }
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port) {
      throw new TypeError("Quota evidence source must be a credential-free HTTPS URL");
    }
    result.source_url = parsed.toString();
  }
  if (value.checked_at !== undefined) {
    if (!validDateTime(value.checked_at)) throw new TypeError("Invalid quota evidence checked_at");
    result.checked_at = value.checked_at;
  }
  if (confidence !== "unknown" && (!result.source_url || !result.checked_at)) {
    throw new TypeError("Verified quota evidence requires source_url and checked_at");
  }
  return result;
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

/**
 * Convert a proposed resource into inert, quarantined catalog metadata.
 * This function performs no network request, install, execution, or approval.
 */
export function prepareResourceCandidate(candidate, now = new Date()) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new TypeError("Resource candidate must be an object");
  }
  for (const key of Object.keys(candidate)) {
    if (!INPUT_FIELDS.has(key)) throw new TypeError(`Unsupported resource field: ${key}`);
  }

  const sourceUrl = requiredString(candidate.source_url, "source_url", 2048);
  let parsedUrl;
  try { parsedUrl = new URL(sourceUrl); }
  catch { throw new TypeError("Resource source_url must be a valid URL"); }
  if (parsedUrl.protocol !== "https:" || parsedUrl.username || parsedUrl.password ||
      parsedUrl.port || !ALLOWED_RESOURCE_HOSTS.has(parsedUrl.hostname.toLowerCase())) {
    throw new TypeError("Resource source_url is outside the HTTPS research allowlist");
  }

  const resourceType = candidate.resource_type;
  if (!RESOURCE_TYPES.has(resourceType)) throw new TypeError("Invalid resource_type");
  const costModel = candidate.cost_model ?? "unknown";
  if (!COST_MODELS.has(costModel)) throw new TypeError("Invalid cost_model");

  let timestamp;
  try { timestamp = now instanceof Date ? now.toISOString() : new Date(now).toISOString(); }
  catch { throw new TypeError("Resource intake time must be a valid date-time"); }
  const retrievedAt = candidate.retrieved_at ?? timestamp;
  const lastVerifiedAt = candidate.last_verified_at ?? retrievedAt;
  if (!validDateTime(retrievedAt) || !validDateTime(lastVerifiedAt)) {
    throw new TypeError("Resource timestamps must be RFC 3339 date-time values");
  }

  const id = requiredString(candidate.id, "id", 160);
  if (!/^[a-z0-9][a-z0-9._:-]*$/.test(id)) throw new TypeError("Invalid resource id");

  const result = {
    id,
    name: requiredString(candidate.name, "name", 240),
    summary: requiredString(candidate.summary, "summary", 2000),
    resource_type: resourceType,
    skill_tags: stringList(candidate.skill_tags ?? [], "skill_tags", { maxItems: 50, maxLength: 100 }),
    source_url: parsedUrl.toString(),
    maintainer: requiredString(candidate.maintainer ?? "unknown", "maintainer", 300),
    license: requiredString(candidate.license ?? "unknown", "license", 300),
    version_or_revision: requiredString(candidate.version_or_revision ?? "unknown", "version_or_revision", 300),
    cost_model: costModel,
    dependencies: stringList(candidate.dependencies ?? [], "dependencies"),
    permissions: stringList(candidate.permissions ?? [], "permissions"),
    network_or_execution_requirements: stringList(candidate.network_or_execution_requirements ?? [], "network_or_execution_requirements"),
    trust_state: "quarantined",
    security_notes: requiredString(candidate.security_notes ?? "Not executed; pending independent review.", "security_notes", 4000),
    retrieved_at: retrievedAt,
    last_verified_at: lastVerifiedAt,
    access_mode: enumValue(candidate.access_mode, "access_mode", ACCESS_MODES, "public_read"),
    persistence: enumValue(candidate.persistence, "persistence", PERSISTENCE_VALUES, "unknown"),
    execution: enumValue(candidate.execution, "execution", EXECUTION_MODES, "none"),
    data_classes_allowed: enumList(candidate.data_classes_allowed, "data_classes_allowed", DATA_CLASSES, ["public"]),
    commercial_use: enumValue(candidate.commercial_use, "commercial_use", COMMERCIAL_USE, "unknown"),
    quota_evidence: validateQuotaEvidence(candidate.quota_evidence),
    adapter_status: enumValue(candidate.adapter_status, "adapter_status", ADAPTER_STATES, "candidate"),
    failure_policy: enumValue(candidate.failure_policy, "failure_policy", FAILURE_POLICIES, "manual_review"),
    deletion_and_export: requiredString(candidate.deletion_and_export ?? "unknown", "deletion_and_export", 1000)
  };
  for (const optional of ["cost_notes", "freshness_policy"]) {
    if (candidate[optional] !== undefined) {
      result[optional] = requiredString(candidate[optional], optional, optional === "freshness_policy" ? 1000 : 2000);
    }
  }
  return deepFreeze(result);
}

export function isResourceHostAllowed(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password &&
      !parsed.port && ALLOWED_RESOURCE_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}
