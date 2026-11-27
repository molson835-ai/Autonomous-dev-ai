import { defineDynamic, defineTool } from "eve/tools";
import { z } from "zod";
import { memoryRequest } from "../lib/memory-client";
import { assertProductionTaskRuntime } from "../lib/task-runtime.mjs";
import { canUseWriteTools } from "../lib/tool-access";

const tool = defineTool({
  description:
    "Create a bounded task proposal. Tasks outside an owner-approved goal remain proposed for owner review. The only active autonomous goal is ebay-inventory-audit-development; the Worker validates task type and exact project path and assigns its server-owned scope. Supplying a goal ID never expands the goal or authorizes external actions. Task proposals do not authorize purchases, payments, paid services, account access, external contact/publication, Production deployment, or expenses.",
  inputSchema: z.object({
    idempotency_key: z.string().trim().min(8).max(200),
    task_type: z.string().trim().min(3).max(80),
    title: z.string().trim().min(3).max(200),
    goal: z.string().trim().min(3).max(1000),
    approved_scope: z.string().trim().min(3).max(2000),
    goal_id: z.enum(["ebay-inventory-audit-development"]).optional(),
  }),
  async execute(input) {
    assertProductionTaskRuntime();
    return memoryRequest("v1/tasks", { method: "POST", body: input });
  },
});

export default defineDynamic(ctx => canUseWriteTools(ctx) ? tool : null);
