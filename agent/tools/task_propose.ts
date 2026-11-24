import { defineDynamic, defineTool } from "eve/tools";
import { z } from "zod";
import { memoryRequest } from "../lib/memory-client";
import { assertProductionTaskRuntime } from "../lib/task-runtime.mjs";
import { canUseWriteTools } from "../lib/tool-access";

const tool = defineTool({
  description:
    "Create a bounded task proposal. Every task remains proposed until the owner explicitly approves it; Eve cannot grant itself standing authorization or choose a scope ID. Task proposals do not authorize purchases, payments, paid services, account access, external contact/publication, Production deployment, or expenses.",
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

export default defineDynamic(ctx => canUseWriteTools(ctx) ? tool : null);
