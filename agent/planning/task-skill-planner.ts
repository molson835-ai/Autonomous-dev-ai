export const SKILL_STATUSES = ["untested", "practiced", "demonstrated"] as const;
export type SkillStatus = (typeof SKILL_STATUSES)[number];
export type ResourceTrustState = "discovered" | "quarantined" | "reviewed" | "approved" | "rejected" | "stale";
export type ResourceCostModel = "free_open_source" | "free_tier_limited" | "paid" | "unknown";
export type ResourceAccessMode = "public_read" | "authenticated_read" | "local_only" | "owner_action_required";
export type ResourceAdapterStatus = "candidate" | "implemented" | "tested" | "enabled" | "paused" | "retired";

export interface SkillRequirement {
  skill: string;
  requiredStatus: SkillStatus;
  acceptanceCriteria: string[];
}

export interface SkillEvidence {
  skill: string;
  status: SkillStatus;
  evidenceRefs: string[];
  reviewerType: "owner" | "independent_reviewer" | "automated_test" | "agent";
}

export interface PlannerResource {
  id: string;
  name: string;
  summary: string;
  resource_type?: string;
  skill_tags: string[];
  source_url: string;
  maintainer?: string;
  license: string;
  version_or_revision?: string;
  cost_model: ResourceCostModel;
  trust_state: ResourceTrustState;
  cost_notes?: string;
  dependencies?: string[];
  permissions?: string[];
  network_or_execution_requirements?: string[];
  security_notes?: string;
  freshness_policy?: string;
  retrieved_at?: string;
  last_verified_at?: string;
  access_mode?: ResourceAccessMode;
  persistence?: "durable" | "ephemeral" | "unknown";
  execution?: "none" | "browser_local" | "server_runtime" | "interactive_remote" | "unknown";
  data_classes_allowed?: Array<"public" | "owner_selected_local" | "approved_private">;
  commercial_use?: "allowed" | "prohibited" | "conditional" | "unknown";
  quota_evidence?: { source_url: string; checked_at: string; limits: string; confidence: "high" | "medium" | "low" | "unknown" };
  adapter_status?: ResourceAdapterStatus;
  failure_policy?: "bounded_retry" | "pause" | "local_fallback" | "manual_review";
  deletion_and_export?: string;
}

export interface TaskSkillPlanInput {
  task: string;
  requirements: SkillRequirement[];
  skillEvidence: SkillEvidence[];
  resources: PlannerResource[];
}

const statusRank: Record<SkillStatus, number> = {
  untested: 0,
  practiced: 1,
  demonstrated: 2,
};

function normalizeTag(value: string): string {
  return value.trim().toLowerCase().replace(/\\s+/g, "-");
}

function bestEvidenceStatus(skill: string, evidence: SkillEvidence[]): SkillStatus {
  const matching = evidence.filter((item) => normalizeTag(item.skill) === normalizeTag(skill));
  const supported = matching.filter((item) =>
    item.evidenceRefs.length > 0 &&
    item.reviewerType !== "agent"
  );
  if (supported.some((item) => item.status === "demonstrated")) return "demonstrated";
  if (supported.some((item) => item.status === "practiced")) return "practiced";
  return "untested";
}

function resourceReviewGaps(resource: PlannerResource): string[] {
  const quota = resource.quota_evidence;
  const gaps: string[] = [];
  if (!resource.maintainer || resource.maintainer.trim().toLowerCase() === "unknown") gaps.push("maintainer");
  if (!resource.version_or_revision || resource.version_or_revision.trim().toLowerCase() === "unknown") gaps.push("revision");
  if (!resource.license || resource.license.trim().toLowerCase() === "unknown") gaps.push("license");
  if (!resource.security_notes || !resource.security_notes.trim()) gaps.push("security_notes");
  if (!resource.last_verified_at || resource.last_verified_at.trim().toLowerCase() === "unknown") gaps.push("last_verified_at");
  if (!resource.access_mode || resource.access_mode !== "public_read") gaps.push("access_mode");
  if (!resource.persistence || resource.persistence === "unknown") gaps.push("persistence");
  if (!resource.execution || resource.execution === "unknown") gaps.push("execution");
  if (!resource.data_classes_allowed || resource.data_classes_allowed.length === 0) gaps.push("data_classes_allowed");
  if (!resource.commercial_use || resource.commercial_use !== "allowed") gaps.push("commercial_use");
  if (!quota || quota.confidence !== "high" || quota.source_url === "unknown" ||
      quota.checked_at === "unknown" || quota.limits === "unknown") gaps.push("quota_evidence");
  if (!resource.failure_policy) gaps.push("failure_policy");
  if (!resource.deletion_and_export || resource.deletion_and_export.trim().toLowerCase() === "unknown") gaps.push("deletion_and_export");
  if (!resource.adapter_status || !["tested", "enabled"].includes(resource.adapter_status)) gaps.push("adapter_status");
  if (!resource.trust_state || resource.trust_state !== "approved") gaps.push("owner_approval");
  if (resource.cost_model !== "free_open_source") gaps.push("cost_model");
  return gaps;
}

/**
 * Produce a bounded task-to-skill plan. This function only classifies supplied
 * metadata; it does not verify sources, install resources, run tests, or promote skills.
 */
export function planTaskSkills(input: TaskSkillPlanInput) {
  if (!input || typeof input.task !== "string" || !input.task.trim() || input.task.length > 2000) {
    throw new Error("A bounded task description is required.");
  }
  if (!Array.isArray(input.requirements) || input.requirements.length < 1 || input.requirements.length > 30) {
    throw new Error("Provide 1 to 30 skill requirements.");
  }
  if (!Array.isArray(input.skillEvidence) || input.skillEvidence.length > 200) {
    throw new Error("Skill evidence must contain at most 200 entries.");
  }
  if (!Array.isArray(input.resources) || input.resources.length > 200) {
    throw new Error("Resources must contain at most 200 entries.");
  }

  const seen = new Set<string>();
  const skills = input.requirements.map((requirement) => {
    const skill = normalizeTag(requirement.skill);
    if (!skill || skill.length > 100 || seen.has(skill)) {
      throw new Error("Skill requirements must be non-empty and unique.");
    }
    seen.add(skill);
    if (!SKILL_STATUSES.includes(requirement.requiredStatus)) {
      throw new Error("Unknown required skill status.");
    }
    if (!Array.isArray(requirement.acceptanceCriteria) || requirement.acceptanceCriteria.length < 1 ||
        requirement.acceptanceCriteria.length > 10 ||
        requirement.acceptanceCriteria.some((item) => typeof item !== "string" || !item.trim() || item.length > 500)) {
      throw new Error("Each skill needs 1 to 10 bounded acceptance criteria.");
    }

    const currentStatus = bestEvidenceStatus(skill, input.skillEvidence);
    const gap = statusRank[currentStatus] < statusRank[requirement.requiredStatus];
    const matchingResources = input.resources
      .filter((resource) => resource.skill_tags.some((tag) => normalizeTag(tag) === skill))
      .filter((resource) => resource.trust_state !== "rejected" && resource.trust_state !== "stale")
      .slice(0, 10)
      .map((resource) => {
        const missingReviewEvidence = resourceReviewGaps(resource);
        return {
          id: resource.id,
          name: resource.name,
          summary: resource.summary,
          resourceType: resource.resource_type ?? "unknown",
          sourceUrl: resource.source_url,
          maintainer: resource.maintainer ?? "unknown",
          revision: resource.version_or_revision ?? "unknown",
          trustState: resource.trust_state,
          license: resource.license,
          licenseKnown: resource.license.trim().toLowerCase() !== "unknown",
          costModel: resource.cost_model,
          costNotes: resource.cost_notes ?? "unknown",
          dependencies: resource.dependencies ?? [],
          permissions: resource.permissions ?? [],
          networkOrExecutionRequirements: resource.network_or_execution_requirements ?? [],
          securityNotes: resource.security_notes ?? "unknown",
          freshnessPolicy: resource.freshness_policy ?? "unknown",
          retrievedAt: resource.retrieved_at ?? "unknown",
          lastVerifiedAt: resource.last_verified_at ?? "unknown",
          accessMode: resource.access_mode ?? "unknown",
          persistence: resource.persistence ?? "unknown",
          execution: resource.execution ?? "unknown",
          dataClassesAllowed: resource.data_classes_allowed ?? ["public"],
          commercialUse: resource.commercial_use ?? "unknown",
          quotaEvidence: resource.quota_evidence ?? {
            source_url: "unknown", checked_at: "unknown", limits: "unknown", confidence: "unknown" as const,
          },
          adapterStatus: resource.adapter_status ?? "candidate",
          failurePolicy: resource.failure_policy ?? "manual_review",
          deletionAndExport: resource.deletion_and_export ?? "unknown",
          missingReviewEvidence,
          executionReady: false as const,
          reviewRequired: missingReviewEvidence.length > 0,
        };
      });

    return {
      skill,
      currentStatus,
      requiredStatus: requirement.requiredStatus,
      gap,
      acceptanceCriteria: requirement.acceptanceCriteria,
      matchingResources,
      nextStep: gap
        ? "Create a bounded practice task and run the listed objective acceptance tests."
        : "Review the evidence references and confirm they apply to this task.",
    };
  });

  return {
    task: input.task.trim(),
    skills,
    gaps: skills.filter((item) => item.gap).map((item) => item.skill),
    unmatchedSkills: skills.filter((item) => item.matchingResources.length === 0).map((item) => item.skill),
    limitations: [
      "Skill evidence and resource metadata are supplied inputs; this planner does not independently verify them.",
      "Agent self-reports never count as practiced or demonstrated evidence.",
      "A plan does not run tests, install resources, grant permissions, or change skill status.",
      "Execution readiness is always false here; this planner never enables or executes a resource.",
      "Resources remain review-required until owner approval and complete provenance, security, cost, quota, access, persistence, execution, and lifecycle evidence are supplied.",
      "Demonstrated status still requires objective evidence or independent review and the existing owner approval gate.",
    ],
  };
}
