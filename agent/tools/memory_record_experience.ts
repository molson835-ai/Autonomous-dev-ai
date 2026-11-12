import { defineTool } from "eve/tools";
import { z } from "zod";
import { memoryRequest } from "../memory/client";

export default defineTool({
  description:
    "Record a meaningful completed task as an experience so future sessions can learn from what was attempted and what actually happened. Use after significant work, especially failures, corrections, and verified successes. Do not store credentials, secrets, private personal data, or sensitive financial/medical details. Evidence must describe observed results, not assumptions.",
  inputSchema: z.object({
    task: z.string().min(3).max(1000),
    outcome: z.string().min(3).max(2000),
    result: z.enum(["success", "failure", "partial"]),
    evidence: z.string().max(2000).optional(),
  }),
  async execute(input) {
    return memoryRequest("v1/experiences", { method: "POST", body: input });
  },
});
