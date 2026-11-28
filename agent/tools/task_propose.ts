import { defineDynamic, defineTool } from "eve/tools";
import { z } from "zod";
import { memoryRequest } from "../lib/memory-client";
import { assertProductionTaskRuntime } from "../lib/task-runtime.mjs";
import { canUseWriteTools } from "../lib/tool-access";

const tool = defineTool({
  description:
    "Create a bounded durable task. When a verified owner requests work inside the exact active goal ebay-inventory-audit-development, the Worker validates the task type and exact project path, assigns its server-owned scope, creates the task as queued with owner_approved=false and mission_authorized=false, and schedules its Durable Object wake-up. This existing goal authorization does not require a second Owner Console approval. Tasks outside an owner-approved goal remain proposed for owner review. Supplying a goal ID never expands the goal or authorizes external actions. This tool does not authorize purchases, payments, paid services, account access, external contact/publication, Production deployment, or expenses.",
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
