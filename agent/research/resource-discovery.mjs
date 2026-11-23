const CATALOGS = Object.freeze({
  github: {
    host: "api.github.com",
    resourceType: "repository",
    endpoint(query, limit) {
      const url = new URL("https://api.github.com/search/repositories");
      url.searchParams.set("q", query);
      url.searchParams.set("sort", "stars");
      url.searchParams.set("order", "desc");
      url.searchParams.set("per_page", String(limit));
      return url;
    },
    headers: { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "Eve-Resource-Discovery" },
    items(payload) { return Array.isArray(payload?.items) ? payload.items : []; },
    candidate(item, query) {
      const fullName = safeText(item?.full_name, 180);
      if (!fullName || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(fullName)) return null;
      const sourceUrl = "https://github.com/" + fullName;
      return baseCandidate({
        id: "github." + slug(fullName), name: fullName,
        summary: safeText(item.description, 1000) || "Public repository discovered from GitHub search.",
        resource_type: "repository", source_url: sourceUrl,
        maintainer: safeText(item.owner?.login, 200) || "unknown",
        license: normalizeLicense(item.license?.spdx_id),
        version_or_revision: safeText(item.default_branch, 200) || "unknown",
        skill_tags: uniqueTags(["software-development", "resource-discovery", ...(Array.isArray(item.topics) ? item.topics : [])]),
        query
      });
    }
  },
  huggingface: {
    host: "huggingface.co",
    resourceType: "model",
    endpoint(query, limit) {
      const url = new URL("https://huggingface.co/api/models");
      url.searchParams.set("search", query);
      url.searchParams.set("limit", String(limit));
      url.searchParams.set("sort", "downloads");
      url.searchParams.set("direction", "-1");
      return url;
    },
    headers: { accept: "application/json", "user-agent": "Eve-Resource-Discovery" },
    items(payload) { return Array.isArray(payload) ? payload : []; },
    candidate(item, query) {
      const modelId = safeText(item?.modelId ?? item?.id, 180);
      if (!modelId || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(modelId)) return null;
      return baseCandidate({
        id: "hf." + slug(modelId), name: modelId,
        summary: "Public model catalog entry" + (safeText(item.pipeline_tag, 100) ? " for " + safeText(item.pipeline_tag, 100) : "") + ". Model-card details and usage terms require review.",
        resource_type: "model", source_url: "https://huggingface.co/" + modelId,
        maintainer: safeText(item.author, 200) || modelId.split("/")[0],
        license: safeText(item.cardData?.license, 100) || "unknown",
        version_or_revision: safeText(item.sha, 100) || safeText(item.lastModified, 100) || "unknown",
        skill_tags: uniqueTags(["machine-learning", "model-evaluation", ...(Array.isArray(item.tags) ? item.tags : [])]),
        query
      });
    }
  },
  npm: {
    host: "registry.npmjs.org",
    resourceType: "library",
    endpoint(query, limit) {
      const url = new URL("https://registry.npmjs.org/-/v1/search");
      url.searchParams.set("text", query);
      url.searchParams.set("size", String(limit));
      url.searchParams.set("quality", "0.5");
      return url;
    },
    headers: { accept: "application/json", "user-agent": "Eve-Resource-Discovery" },
    items(payload) { return Array.isArray(payload?.objects) ? payload.objects : []; },
    candidate(item, query) {
      const pkg = item?.package ?? {};
      const name = safeText(pkg.name, 180);
      if (!name || !/^(@[A-Za-z0-9_.-]+\/)?[A-Za-z0-9_.-]+$/.test(name)) return null;
      return baseCandidate({
        id: "npm." + slug(name), name,
        summary: safeText(pkg.description, 1000) || "Public npm package registry entry; inspect package contents and provenance before use.",
        resource_type: "library", source_url: "https://www.npmjs.com/package/" + name,
        maintainer: safeText(pkg.publisher?.username, 200) || "unknown",
        license: safeText(pkg.license, 100) || "unknown",
        version_or_revision: safeText(pkg.version, 100) || "unknown",
        skill_tags: uniqueTags(["javascript", "software-development", ...(Array.isArray(pkg.keywords) ? pkg.keywords : [])]),
        query
      });
    }
  }
});

function safeText(value, max) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}
function normalizeLicense(value) {\n  const license = safeText(value, 100);\n  return !license || license.toUpperCase() === "NOASSERTION" ? "unknown" : license;\n}\nfunction slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "").slice(0, 130);
}
function uniqueTags(values) {
  return [...new Set(values.map(value => safeText(value, 60).toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-")).filter(Boolean))].slice(0, 20);
}
function baseCandidate(input) {
  return {
    id: input.id,
    name: input.name,
    summary: input.summary,
    resource_type: input.resource_type,
    skill_tags: input.skill_tags,
    source_url: input.source_url,
    maintainer: input.maintainer,
    license: input.license,
    version_or_revision: input.version_or_revision,
    cost_model: "unknown",
    access_mode: "public_read",
    persistence: "unknown",
    execution: "unknown",
    data_classes_allowed: ["public"],
    commercial_use: "unknown",
    quota_evidence: { source_url: "unknown", checked_at: "unknown", limits: "unknown", confidence: "unknown" },
    adapter_status: "candidate",
    failure_policy: "manual_review",
    deletion_and_export: "No local copy created by discovery; remove catalog entry through owner review if no longer useful.",
    dependencies: [],
    permissions: [],
    network_or_execution_requirements: ["One bounded HTTPS catalog query; no package/model download or execution."],
    security_notes: "Untrusted public catalog metadata. No code, model, package, or linked content was fetched or executed. Owner review required.",
    cost_notes: "Unknown. Public listing does not establish free use, commercial rights, or quota.",
    freshness_policy: "Recheck upstream metadata before approval or use.",
    retrieved_at: new Date().toISOString(),
    last_verified_at: new Date().toISOString()
  };
}

async function readBoundedJson(response) {
  if (!response || !response.ok) throw new Error("catalog_http_" + (response?.status ?? "unknown"));
  const raw = await response.text();
  if (raw.length > 500_000) throw new Error("catalog_response_too_large");
  try { return JSON.parse(raw); } catch { throw new Error("catalog_invalid_json"); }
}

/**
 * Search public catalogs and optionally submit inert metadata to the existing
 * quarantined resource registry. No result is installed, executed, or approved.
 */
export async function discoverPublicResources({
  query, catalogs = ["github", "huggingface", "npm"], limitPerCatalog = 2,
  fetchImpl = fetch, submitCandidate, now = () => new Date().toISOString()
}) {
  const normalizedQuery = safeText(query, 160);
  if (normalizedQuery.length < 3) throw new TypeError("Search query must contain at least 3 characters.");
  if (!Array.isArray(catalogs) || catalogs.length < 1 || catalogs.length > 3 ||
      catalogs.some(name => !Object.hasOwn(CATALOGS, name)) || new Set(catalogs).size !== catalogs.length) {
    throw new TypeError("Select one to three supported public catalogs.");
  }
  if (!Number.isInteger(limitPerCatalog) || limitPerCatalog < 1 || limitPerCatalog > 3) {
    throw new TypeError("limitPerCatalog must be between 1 and 3.");
  }
  if (submitCandidate !== undefined && typeof submitCandidate !== "function") {
    throw new TypeError("submitCandidate must be a function.");
  }

  const results = await Promise.all(catalogs.map(async name => {
    const catalog = CATALOGS[name];
    try {
      const response = await fetchImpl(catalog.endpoint(normalizedQuery, limitPerCatalog).toString(), {
        method: "GET", headers: catalog.headers, redirect: "error", signal: AbortSignal.timeout(6000)
      });
      const payload = await readBoundedJson(response);
      const candidates = catalog.items(payload).slice(0, limitPerCatalog)
        .map(item => catalog.candidate(item, normalizedQuery)).filter(Boolean);
      const records = [];
      for (const candidate of candidates) {
        const timestamp = now();
        candidate.retrieved_at = timestamp;
        candidate.last_verified_at = timestamp;
        let stored = "not_requested";
        if (submitCandidate) {
          try {
            const response = await submitCandidate(candidate);
            stored = response?.trust_state === "quarantined" ? (response.created ? "quarantined_new" : "already_catalogued") : "not_confirmed";
          } catch {
            stored = "storage_failed";
          }
        }
        records.push({ ...candidate, storage_result: stored });
      }
      return { catalog: name, status: "ok", count: records.length, candidates: records };
    } catch (error) {
      return { catalog: name, status: "unavailable", count: 0, candidates: [], error: error instanceof Error ? error.message.slice(0, 120) : "catalog_error" };
    }
  }));
  return {
    query: normalizedQuery,
    catalogs_checked: catalogs,
    discovered_count: results.reduce((sum, result) => sum + result.count, 0),
    stored_quarantined_count: results.reduce((sum, result) => sum + result.candidates.filter(candidate => candidate.storage_result === "quarantined_new" || candidate.storage_result === "already_catalogued").length, 0),
    results,
    limitations: [
      "Search results are incomplete discovery leads, not endorsements or verified quality rankings.",
      "Licensing, commercial rights, security, maintenance, quotas, and dependencies remain unverified; unknown values stay unknown.",
      "New entries are inert metadata in the existing owner-review quarantine. Nothing is installed, downloaded, executed, enabled, or approved.",
      "Queries are sent to the selected public catalog providers. Do not include private information, credentials, or personal data."
    ]
  };
}
