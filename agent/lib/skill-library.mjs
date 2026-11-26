import { readFile } from "node:fs/promises";

const SKILLS = Object.freeze({
  "earned-growth": {
    file: "earned-growth.md",
    category: "business-operations",
    description: "Evaluate and prepare evidence-backed small-business improvement opportunities.",
    capabilities: ["service-research", "business-analysis", "evidence-synthesis", "process-improvement"],
    prerequisites: [],
    benchmarkTasks: ["Produce a sourced business snapshot with facts, hypotheses, unknowns, and a measurable low-cost test."]
  },
  "planning-output": {
    file: "planning-output.md",
    category: "planning-and-delivery",
    description: "Produce concise, actionable plans with clear owners, dependencies, and acceptance criteria.",
    capabilities: ["task-decomposition", "acceptance-criteria", "dependency-mapping", "risk-analysis"],
    prerequisites: [],
    benchmarkTasks: ["Turn a bounded request into a sequenced plan with owners, dependencies, risks, and testable acceptance criteria."]
  },
  "resource-discovery": {
    file: "resource-discovery.md",
    category: "research-and-knowledge",
    description: "Discover, inspect, compare, and quarantine tools, skills, models, datasets, and learning resources.",
    capabilities: ["source-discovery", "provenance", "license-review", "security-triage", "resource-comparison"],
    prerequisites: [],
    benchmarkTasks: ["Compare three candidate resources using provenance, license, cost, quota, permissions, freshness, and security evidence."]
  },
  "revenue-mission": {
    file: "revenue-mission.md",
    category: "business-operations",
    description: "Apply Eve's long-term revenue-development mission and earn-before-spend boundaries.",
    capabilities: ["opportunity-selection", "unit-economics", "experiment-design", "revenue-evidence"],
    prerequisites: ["earned-growth"],
    benchmarkTasks: ["Compare two low-cost opportunities with sourced evidence, explicit unknowns, unit economics, and an owner-approved next experiment."]
  },
  "software-delivery": {
    file: "software-delivery.md",
    category: "software-engineering",
    description: "Plan, implement, verify, and report bounded software changes.",
    capabilities: ["architecture", "implementation", "testing", "debugging", "git", "ci"],
    prerequisites: ["planning-output"],
    benchmarkTasks: ["Implement a small isolated change, add regression tests, run focused checks, and report the exact commit and evidence."]
  },
  "toolsmith": {
    file: "toolsmith.md",
    category: "software-engineering",
    description: "Specify and safely develop bounded internal tools without expanding authority.",
    capabilities: ["tool-design", "schema-design", "threat-modeling", "permission-review", "integration-testing"],
    prerequisites: ["software-delivery", "resource-discovery"],
    benchmarkTasks: ["Specify a read-only tool with bounded inputs, explicit permissions, adversarial tests, and observable acceptance criteria."]
  },
  "seller-operations": {
    file: "seller-operations.md",
    category: "commerce-and-operations",
    description: "Research ecommerce opportunities, product economics, listing drafts, and seller workflows.",
    capabilities: ["marketplace-research", "inventory-accuracy", "unit-economics", "listing-drafts", "fulfillment-planning"],
    prerequisites: ["earned-growth"],
    benchmarkTasks: ["Prepare a draft listing and transparent per-unit margin model that distinguishes sold evidence from active asking prices."]
  }
});

export function listSkills({ category, capability } = {}) {
  const normalizedCategory = typeof category === "string" ? category.trim().toLowerCase() : "";
  const normalizedCapability = typeof capability === "string" ? capability.trim().toLowerCase() : "";
  return Object.entries(SKILLS)
    .filter(([, skill]) => !normalizedCategory || skill.category === normalizedCategory)
    .filter(([, skill]) => !normalizedCapability || skill.capabilities.includes(normalizedCapability))
    .map(([id, skill]) => ({
      id,
      category: skill.category,
      description: skill.description,
      capabilities: [...skill.capabilities],
      prerequisites: [...skill.prerequisites],
      benchmarkTasks: [...skill.benchmarkTasks]
    }));
}

export async function loadSkill(id, maxChars = 6000) {
  if (typeof id !== "string" || !Object.hasOwn(SKILLS, id)) {
    return { status: "not_found", available: listSkills().map((skill) => skill.id) };
  }
  if (!Number.isInteger(maxChars) || maxChars < 500 || maxChars > 8000) {
    return { status: "invalid_limit", allowed: "500-8000 characters" };
  }

  const entry = SKILLS[id];
  const content = await readFile(new URL(`../skills/${entry.file}`, import.meta.url), "utf8");
  return {
    status: "loaded",
    skill: id,
    category: entry.category,
    description: entry.description,
    capabilities: [...entry.capabilities],
    prerequisites: [...entry.prerequisites],
    benchmarkTasks: [...entry.benchmarkTasks],
    content: content.slice(0, maxChars),
    truncated: content.length > maxChars,
    totalCharacters: content.length
  };
}
