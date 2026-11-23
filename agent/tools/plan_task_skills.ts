import { defineTool } from "eve/tools";
import { z } from "zod";
import { planTaskSkills } from "../planning/task-skill-planner";

const requirement = z.object({
  skill: z.string().trim().min(1).max(100),
  requiredStatus: z.enum(["untested", "practiced", "demonstrated"]),
  acceptanceCriteria: z.array(z.string().trim().min(1).max(500)).min(1).max(10),
});
const evidence = z.object({
  skill: z.string().trim().min(1).max(100),
  status: z.enum(["untested", "practiced", "demonstrated"]),
  evidenceRefs: z.array(z.string().trim().min(1).max(500)).max(20),
  reviewerType: z.enum(["owner", "independent_reviewer", "automated_test", "agent"]),
});
const resource = z.object({
  id: z.string().min(1).max(160),
  name: z.string().min(1).max(240),
  summary: z.string().min(1).max(2000),
  skill_tags: z.array(z.string().min(1).max(100)).max(50),
  source_url: z.string().url().max(2000),
  license: z.string().min(1).max(300),
  cost_model: z.enum(["free_open_source", "free_tier_limited", "paid", "unknown"]),
  trust_state: z.enum(["discovered", "quarantined", "reviewed", "approved", "rejected", "stale"]),
  access_mode: z.enum(["public_read", "authenticated_read", "local_only", "owner_action_required"]).optional(),
  persistence: z.enum(["durable", "ephemeral", "unknown"]).optional(),
  execution: z.enum(["none", "browser_local", "server_runtime", "interactive_remote", "unknown"]).optional(),
  data_classes_allowed: z.array(z.enum(["public", "owner_selected_local", "approved_private"])).max(3).optional(),
  commercial_use: z.enum(["allowed", "prohibited", "conditional", "unknown"]).optional(),
  quota_evidence: z.object({
    source_url: z.string().max(2048),
    checked_at: z.string().max(80),
    limits: z.string().max(2000),
    confidence: z.enum(["high", "medium", "low", "unknown"]),
  }).optional(),
  adapter_status: z.enum(["candidate", "implemented", "tested", "enabled", "paused", "retired"]).optional(),
  failure_policy: z.enum(["bounded_retry", "pause", "local_fallback", "manual_review"]).optional(),
  deletion_and_export: z.string().max(2000).optional(),
});

export default defineTool({
  description: "Create a bounded task-to-skill plan from supplied requirements, skill evidence, and resource catalog metadata. Match exact normalized skill tags, identify evidence gaps, and list objective acceptance criteria. This is planning only: it does not search, verify sources, run tests, install resources, change skill status, or approve memories. Agent self-reports do not count as practice or demonstration.",
  inputSchema: z.object({
    task: z.string().trim().min(1).max(2000),
    requirements: z.array(requirement).min(1).max(30),
    skillEvidence: z.array(evidence).max(200),
    resources: z.array(resource).max(200),
  }),
  async execute(input) {
    return planTaskSkills(input);
  },
});
