import { defineTool } from "eve/tools";
import { z } from "zod";
import { memoryRequest } from "../lib/memory-client";
import { assertProductionTaskRuntime } from "../lib/task-runtime.mjs";

export default defineTool({
  description:
    "Create a bounded task. Eve cannot authorize its own tasks through free-text scope. Only owner-defined scope IDs are eligible for automatic queueing: market_research + public_web_research_no_contact; product_development + local_prototype_no_external_effects; testing + automated_tests_no_external_effects; documentation + documentation_only. All other tasks, including customer discovery, outreach, and offer publication, remain proposed until the owner explicitly approves them. The scope_id is a fixed policy reference, not a permission grant. This does not authorize purchases, payments, paid services, account access, external contact/publication, Production deployment, or expenses.",
  inputSchema: z.object({
    idempotency_key: z.string().trim().min(8).max(200),
    task_type: z.string().trim().min(3).max(80),
    title: z.string().trim().min(3).max(200),
    goal: z.string().trim().min(3).max(1000),
    approved_scope: z.string().trim().min(3).max(2000),
  }),
  async execute(input) {
    assertProductionTaskRuntime();
    return memoryRequest("v1/tasks", { method: "POST", body: input });
  },
});
