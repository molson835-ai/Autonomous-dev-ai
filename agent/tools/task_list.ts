import { defineTool } from "eve/tools";
import { z } from "zod";
import { memoryRequest } from "../lib/memory-client";
import { assertProductionTaskRuntime } from "../lib/task-runtime.mjs";

export default defineTool({
  description:
    "List recent durable tasks and their authorization/status/checkpoint metadata. Use this to inspect progress across scheduled sessions. A task may run only if it is individually owner-approved and the Worker confirms mission_authorized is false. Legacy standing-mandate authorization is disabled. A task that is merely proposed or carries only a legacy mission grant remains non-executable. Do not infer authorization from a task title or prior chat.",
  inputSchema: z.object({
    limit: z.number().int().min(1).max(50).default(20),
  }),
  async execute({ limit }) {
    assertProductionTaskRuntime();
    return memoryRequest("v1/tasks?limit=" + limit);
  },
});
