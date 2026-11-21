import { readFile } from "node:fs/promises";

const SKILLS = Object.freeze({
  "earned-growth": {
    file: "earned-growth.md",
    description: "Evaluate and prepare evidence-backed small-business improvement opportunities."
  },
  "planning-output": {
    file: "planning-output.md",
    description: "Produce concise, actionable plans with clear owners, dependencies, and acceptance criteria."
  },
  "resource-discovery": {
    file: "resource-discovery.md",
    description: "Discover, inspect, compare, and quarantine tools, skills, models, datasets, and learning resources."
  },
  "revenue-mission": {
    file: "revenue-mission.md",
    description: "Apply Eve's long-term revenue-development mission and earn-before-spend boundaries."
  },
  "software-delivery": {
    file: "software-delivery.md",
    description: "Plan, implement, verify, and report bounded software changes."
  },
  "toolsmith": {
    file: "toolsmith.md",
    description: "Specify and safely develop bounded internal tools without expanding authority."
  },
  "seller-operations": {
    file: "seller-operations.md",
    description: "Research ecommerce opportunities, product economics, listing drafts, and seller workflows."
  }
});

export function listSkills() {
  return Object.entries(SKILLS).map(([id, skill]) => ({
    id,
    description: skill.description
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
    description: entry.description,
    content: content.slice(0, maxChars),
    truncated: content.length > maxChars,
    totalCharacters: content.length
  };
}
