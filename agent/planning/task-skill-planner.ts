export const SKILL_STATUSES = ["untested", "practiced", "demonstrated"] as const;
export type SkillStatus = (typeof SKILL_STATUSES)[number];
export type ResourceTrustState = "discovered" | "quarantined" | "reviewed" | "approved" | "rejected" | "stale";
export type ResourceCostModel = "free_open_source" | "free_tier_limited" | "paid" | "unknown";

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
  skill_tags: string[];
  source_url: string;
  license: string;
  cost_model: ResourceCostModel;
  trust_state: ResourceTrustState;
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
  return value.trim().toLowerCase().replace(/\s+/g, "-");
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
      .map((resource) => ({
        id: resource.id,
        name: resource.name,
        sourceUrl: resource.source_url,
        trustState: resource.trust_state,
        licenseKnown: resource.license.trim().toLowerCase() !== "unknown",
        costModel: resource.cost_model,
        executionReady: false as const,
        reviewRequired: resource.trust_state !== "approved" ||
          resource.license.trim().toLowerCase() === "unknown" ||
          resource.cost_model === "unknown" ||
          resource.cost_model === "paid" ||
          resource.cost_model === "free_tier_limited",
      }));

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
      "Unapproved, unknown-license, unknown-cost, and paid resources are not execution-ready.",
      "Demonstrated status still requires objective evidence or independent review and the existing owner approval gate.",
    ],
  };
}
