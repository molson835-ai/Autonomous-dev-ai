export interface SkillSummary {
  id: string;
  category: string;
  description: string;
  capabilities: string[];
  prerequisites: string[];
  benchmarkTasks: string[];
}

export interface SkillCatalogResult {
  status: "catalog";
  skills: SkillSummary[];
}

export interface LoadedSkillResult {
  status: "loaded";
  skill: string;
  category: string;
  description: string;
  capabilities: string[];
  prerequisites: string[];
  benchmarkTasks: string[];
  content: string;
  truncated: boolean;
  totalCharacters: number;
}

export interface MissingSkillResult {
  status: "not_found";
  available: string[];
}

export interface InvalidSkillLimitResult {
  status: "invalid_limit";
  allowed: "500-8000 characters";
}

export function listSkills(filters?: { category?: string; capability?: string }): SkillSummary[];
export function loadSkill(
  id: string,
  maxChars?: number
): Promise<LoadedSkillResult | MissingSkillResult | InvalidSkillLimitResult>;
