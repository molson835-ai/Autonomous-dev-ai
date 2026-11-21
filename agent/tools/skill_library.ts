import { defineTool } from "eve/tools";
import { z } from "zod";
import { listSkills, loadSkill } from "../lib/skill-library.mjs";

export default defineTool({
  description: "Load Eve's built-in skills only when relevant. Omit skill to get a compact catalog; provide an exact skill id to load one markdown guide. Reads a fixed allowlist of bundled files only, is read-only, and returns at most 8,000 characters. Never loads arbitrary paths or external content.",
  inputSchema: z.object({
    skill: z.string().trim().min(1).max(80).optional(),
    max_chars: z.number().int().min(500).max(8000).default(6000)
  }).strict(),
  async execute({ skill, max_chars }) {
    if (!skill) return { status: "catalog", skills: listSkills() };
    return loadSkill(skill, max_chars);
  }
});
