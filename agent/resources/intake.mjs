const ALLOWED_RESOURCE_HOSTS = new Set([
  "developer.mozilla.org",
  "tc39.es",
  "owasp.org",
  "developers.cloudflare.com",
  "vercel.com"
]);

const RESOURCE_TYPES = new Set([
  "documentation", "tutorial", "skill", "repository", "tool",
  "model", "dataset", "benchmark", "hardware_reference"
]);

const COST_MODELS = new Set([
  "free_open_source", "free_tier_limited", "paid", "unknown"
]);

const INPUT_FIELDS = new Set([
  "id", "name", "summary", "resource_type", "skill_tags", "source_url",
  "maintainer", "license", "version_or_revision", "cost_model",
  "cost_notes", "dependencies", "permissions",
  "network_or_execution_requirements", "security_notes",
  "retrieved_at", "last_verified_at", "freshness_policy"
]);

function requiredString(value, field, maxLength) {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maxLength) {
    throw new TypeError(`Invalid resource field: ${field}`);
  }
  return value.trim();
}

function stringList(value, field, maxItems = 100) {
  if (!Array.isArray(value) || value.length > maxItems ||
      value.some((item) => typeof item !== "string" || item.length > 300)) {
    throw new TypeError(`Invalid resource field: ${field}`);
  }
  if (new Set(value).size !== value.length) {
    throw new TypeError(`Duplicate values in resource field: ${field}`);
  }
  return value.map((item) => item.trim());
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

  const timestamp = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  const retrievedAt = candidate.retrieved_at ?? timestamp;
  const lastVerifiedAt = candidate.last_verified_at ?? retrievedAt;
  if (!Number.isFinite(Date.parse(retrievedAt)) || !Number.isFinite(Date.parse(lastVerifiedAt))) {
    throw new TypeError("Resource timestamps must be valid date-time values");
  }

  const id = requiredString(candidate.id, "id", 160);
  if (!/^[a-z0-9][a-z0-9._:-]*$/.test(id)) throw new TypeError("Invalid resource id");

  const result = {
    id,
    name: requiredString(candidate.name, "name", 240),
    summary: requiredString(candidate.summary, "summary", 2000),
    resource_type: resourceType,
    skill_tags: stringList(candidate.skill_tags ?? [], "skill_tags", 50),
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
    last_verified_at: lastVerifiedAt
  };
  for (const optional of ["cost_notes", "freshness_policy"]) {
    if (candidate[optional] !== undefined) result[optional] = requiredString(candidate[optional], optional, 2000);
  }
  return Object.freeze(result);
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
