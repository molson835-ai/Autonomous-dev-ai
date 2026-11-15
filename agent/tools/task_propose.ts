import { defineTool } from "eve/tools";
import { z } from "zod";
import { memoryRequest } from "../lib/memory-client";
import { assertProductionTaskRuntime } from "../lib/task-runtime.mjs";

export default defineTool({
  description:
    "Create a bounded task under EVE’s standing revenue mission. Safe allowlisted task types (market_research, product_development, testing, documentation, customer_discovery, customer_outreach, offer_publication) are automatically queued under the owner-delegated mandate when the scope contains no financial commitment or prohibited action. Other task types remain proposed for owner review. This does not authorize purchases, payments, paid services, account access, Production deployment, or any expense. Outreach/publication may use only tools actually available in this runtime and must be truthful, relevant, lawful, privacy-respecting, and platform-compliant; if no action tool exists, prepare drafts and record the blocker.",
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
