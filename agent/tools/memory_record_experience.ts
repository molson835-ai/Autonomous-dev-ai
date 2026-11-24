import { defineDynamic, defineTool } from "eve/tools";
import { z } from "zod";
import { memoryRequest } from "../lib/memory-client";
import { canUseWriteTools } from "../lib/tool-access";

const tool = defineTool({
  description:
    "Record a meaningful completed task as an experience so future sessions can learn from what was attempted and what actually happened. Use after significant work, especially failures, corrections, and verified successes. Set result to success only after observing completion; use failure when the attempt failed and partial when it did not complete or verification is incomplete. Describe what actually happened in outcome, not an intention or attempted action. Optionally attach a stable external_id for exact future retrieval. Do not store credentials, secrets, private personal data, or sensitive financial/medical details. Evidence must describe observed results, not assumptions.",
  inputSchema: z.object({
    task: z.string().min(3).max(1000),
    outcome: z.string().min(3).max(2000),
    result: z.enum(["success", "failure", "partial"]),
    external_id: z.string().trim().min(1).max(200).optional(),
    evidence: z.string().max(2000).optional(),
  }),
  async execute(input) {
    return memoryRequest("v1/experiences", { method: "POST", body: input });
  },
});

export default defineDynamic(ctx => canUseWriteTools(ctx) ? tool : null);
