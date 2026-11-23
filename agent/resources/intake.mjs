// Exact hosts only. This allowlist governs metadata intake, not arbitrary crawling.
const ALLOWED_RESOURCE_HOSTS = new Set([
  "developer.mozilla.org", "tc39.es", "owasp.org", "developers.cloudflare.com", "vercel.com",
  "data.gov", "api.census.gov", "www.census.gov", "usgs.gov", "www.usgs.gov",
  "noaa.gov", "www.noaa.gov", "openalex.org", "api.openalex.org", "api.crossref.org",
  "arxiv.org", "www.wikidata.org", "query.wikidata.org", "archive.org", "www.archive.org",
  "commoncrawl.org", "huggingface.co", "github.com", "npmjs.com", "pypi.org",
  "crates.io", "openstreetmap.org", "www.openstreetmap.org", "polyhaven.com",
  "openverse.org", "commons.wikimedia.org", "freesound.org", "fonts.google.com"
]);

const RESOURCE_TYPES = new Set([
  "documentation", "tutorial", "skill", "repository", "tool",
  "model", "dataset", "benchmark", "hardware_reference",
  "api", "library", "storage", "compute", "asset"
]);

const COST_MODELS = new Set([
  "free_open_source", "free_tier_limited", "paid", "unknown"
]);

const ACCESS_MODES = new Set(["public_read", "authenticated_read", "local_only", "owner_action_required"]);
const PERSISTENCE_MODES = new Set(["durable", "ephemeral", "unknown"]);
const EXECUTION_MODES = new Set(["none", "browser_local", "server_runtime", "interactive_remote", "unknown"]);
const DATA_CLASSES = new Set(["public", "owner_selected_local", "approved_private"]);
const COMMERCIAL_USE = new Set(["allowed", "prohibited", "conditional", "unknown"]);
const ADAPTER_STATUSES = new Set(["candidate", "implemented", "tested", "enabled", "paused", "retired"]);
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

function enumValue(value, allowed, field, fallback) {
  const normalized = value ?? fallback;
  if (!allowed.has(normalized)) throw new TypeError(`Invalid resource field: ${field}`);
  return normalized;
}

function quotaEvidence(value) {
  if (value === undefined) {
    return { source_url: "unknown", checked_at: "unknown", limits: "unknown", confidence: "unknown" };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Invalid resource field: quota_evidence");
  }
  const allowedKeys = new Set(["source_url", "checked_at", "limits", "confidence"]);
  if (Object.keys(value).some(key => !allowedKeys.has(key))) {
    throw new TypeError("Unsupported quota_evidence field");
  }
  const sourceUrl = requiredString(value.source_url ?? "unknown", "quota_evidence.source_url", 2048);
  if (sourceUrl !== "unknown") {
    let parsed;
    try { parsed = new URL(sourceUrl); } catch { throw new TypeError("Invalid quota evidence URL"); }
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port ||
        !ALLOWED_RESOURCE_HOSTS.has(parsed.hostname.toLowerCase())) {
      throw new TypeError("Quota evidence URL is outside the HTTPS research allowlist");
    }
  }
  const checkedAt = value.checked_at ?? "unknown";
  if (checkedAt !== "unknown" && !validDateTime(checkedAt)) {
    throw new TypeError("Invalid quota evidence checked_at");
  }
  const limits = requiredString(value.limits ?? "unknown", "quota_evidence.limits", 2000);
  const confidence = enumValue(value.confidence, QUOTA_CONFIDENCE, "quota_evidence.confidence", "unknown");
  if (confidence === "high" && (sourceUrl === "unknown" || checkedAt === "unknown" || limits === "unknown")) {
    throw new TypeError("High-confidence quota evidence requires an official source, check date, and stated limits");
  }
  return { source_url: sourceUrl, checked_at: checkedAt, limits, confidence };
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
    access_mode: enumValue(candidate.access_mode, ACCESS_MODES, "access_mode", "public_read"),
    persistence: enumValue(candidate.persistence, PERSISTENCE_MODES, "persistence", "unknown"),
    execution: enumValue(candidate.execution, EXECUTION_MODES, "execution", "unknown"),
    data_classes_allowed: stringList(candidate.data_classes_allowed ?? ["public"], "data_classes_allowed", { maxItems: 3, maxLength: 40 })
      .filter(value => DATA_CLASSES.has(value)),
    commercial_use: enumValue(candidate.commercial_use, COMMERCIAL_USE, "commercial_use", "unknown"),
    quota_evidence: quotaEvidence(candidate.quota_evidence),
    adapter_status: enumValue(candidate.adapter_status, ADAPTER_STATUSES, "adapter_status", "candidate"),
    failure_policy: enumValue(candidate.failure_policy, FAILURE_POLICIES, "failure_policy", "manual_review"),
    deletion_and_export: requiredString(candidate.deletion_and_export ?? "unknown", "deletion_and_export", 2000),
    dependencies: stringList(candidate.dependencies ?? [], "dependencies"),
    permissions: stringList(candidate.permissions ?? [], "permissions"),
    network_or_execution_requirements: stringList(candidate.network_or_execution_requirements ?? [], "network_or_execution_requirements"),
    trust_state: "quarantined",
    security_notes: requiredString(candidate.security_notes ?? "Not executed; pending independent review.", "security_notes", 4000),
    retrieved_at: retrievedAt,
    last_verified_at: lastVerifiedAt
  };
  if (result.data_classes_allowed.length !== (candidate.data_classes_allowed ?? ["public"]).length ||
      result.data_classes_allowed.length === 0) {
    throw new TypeError("Invalid resource field: data_classes_allowed");
  }
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
