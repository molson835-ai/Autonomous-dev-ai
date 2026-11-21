export interface SkillSummary {
  id: string;
  description: string;
}

export interface SkillCatalogResult {
  status: "catalog";
  skills: SkillSummary[];
}

export interface LoadedSkillResult {
  status: "loaded";
  skill: string;
  description: string;
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

export function listSkills(): SkillSummary[];
export function loadSkill(
  id: string,
  maxChars?: number
): Promise<LoadedSkillResult | MissingSkillResult | InvalidSkillLimitResult>;
