import { defineTool } from "eve/tools";
import { z } from "zod";
import { memoryRequest } from "../lib/memory-client";
import { assertProductionTaskRuntime } from "../lib/task-runtime.mjs";

export default defineTool({
  description:
    "List recent durable tasks and their approval/status/checkpoint metadata. Use this to inspect progress across scheduled sessions. A proposed or unapproved task is never executable. Do not infer approval from a task title or prior chat.",
  inputSchema: z.object({
    limit: z.number().int().min(1).max(50).default(20),
  }),
  async execute({ limit }) {
    assertProductionTaskRuntime();
    return memoryRequest("v1/tasks?limit=" + limit);
  },
});
