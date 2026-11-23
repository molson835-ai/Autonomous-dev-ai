export type ResourceCatalog = "github" | "huggingface" | "npm";

export interface ResourceCandidate {
  id: string;
  name: string;
  summary: string;
  resource_type: "repository" | "model" | "library";
  skill_tags: string[];
  source_url: string;
  maintainer: string;
  license: string;
  version_or_revision: string;
  cost_model: "unknown";
  access_mode: "public_read";
  persistence: "unknown";
  execution: "unknown";
  data_classes_allowed: ["public"];
  commercial_use: "unknown";
  quota_evidence: { source_url: "unknown"; checked_at: "unknown"; limits: "unknown"; confidence: "unknown" };
  adapter_status: "candidate";
  failure_policy: "manual_review";
  deletion_and_export: string;
  dependencies: string[];
  permissions: string[];
  network_or_execution_requirements: string[];
  security_notes: string;
  cost_notes: string;
  freshness_policy: string;
  retrieved_at: string;
  last_verified_at: string;
}

export interface ResourceDiscoveryResult {
  query: string;
  catalogs_checked: ResourceCatalog[];
  discovered_count: number;
  stored_quarantined_count: number;
  results: Array<{
    catalog: ResourceCatalog;
    status: "ok" | "unavailable";
    count: number;
    candidates: Array<ResourceCandidate & {
      storage_result: "not_requested" | "quarantined_new" | "already_catalogued" | "not_confirmed" | "storage_failed";
    }>;
    error?: string;
  }>;
  limitations: string[];
}

export function discoverPublicResources(options: {
  query: string;
  catalogs?: ResourceCatalog[];
  limitPerCatalog?: number;
  fetchImpl?: typeof fetch;
  submitCandidate?: (candidate: ResourceCandidate) => Promise<{ id: string; trust_state: string; created: boolean }>;
  now?: () => string;
}): Promise<ResourceDiscoveryResult>;
