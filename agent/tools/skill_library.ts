import { defineTool } from "eve/tools";
import { z } from "zod";
import { listSkills, loadSkill } from "../lib/skill-library.mjs";

export default defineTool({
  description: "Inspect Eve's structured built-in skill catalog or load one relevant bundled guide. Catalog entries include capability tags, prerequisites, and objective benchmark examples. Optional category or capability filters narrow the catalog. Loading is read-only, uses a fixed allowlist of bundled files, and returns at most 8,000 characters. Never loads arbitrary paths or external content; metadata is not proof that a skill is demonstrated.",
  inputSchema: z.object({
    skill: z.string().trim().min(1).max(80).optional(),
    category: z.string().trim().min(1).max(80).optional(),
    capability: z.string().trim().min(1).max(80).optional(),
    max_chars: z.number().int().min(500).max(8000).default(6000)
  }).strict(),
  async execute({ skill, category, capability, max_chars }) {
    if (skill) return loadSkill(skill, max_chars);
    return {
      status: "catalog",
      filters: { category: category ?? null, capability: capability ?? null },
      skills: listSkills({ category, capability })
    };
  }
});
