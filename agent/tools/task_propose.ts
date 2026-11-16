import { defineTool } from "eve/tools";
import { z } from "zod";
import { memoryRequest } from "../lib/memory-client";
import { assertProductionTaskRuntime } from "../lib/task-runtime.mjs";

export default defineTool({
  description:
    "Create a bounded internal task. The standing mission can auto-queue only these exact type/scope pairs: market_research + internal_research, product_development + internal_code_changes, testing + internal_tests, or documentation + internal_docs. The scope_id is an owner-defined capability boundary, not free-text permission. Customer discovery, outreach, publishing, purchases, payments, account access, paid services, Production deployment, and external commitments always require separate owner approval.",
  inputSchema: z.object({
    idempotency_key: z.string().trim().min(8).max(200),
    task_type: z.string().trim().min(3).max(80),
    title: z.string().trim().min(3).max(200),
    goal: z.string().trim().min(3).max(1000),
    approved_scope: z.string().trim().min(3).max(2000),
    scope_id: z.string().trim().min(3).max(80).optional(),
  }),
  async execute(input) {
    assertProductionTaskRuntime();
    return memoryRequest("v1/tasks", { method: "POST", body: input });
  },
});
