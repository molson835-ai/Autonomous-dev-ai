import { defineTool } from "eve/tools";
import { z } from "zod";
import { memoryRequest } from "../lib/memory-client";
import { assertProductionTaskRuntime } from "../lib/task-runtime.mjs";

export default defineTool({
  description:
    "List recent durable tasks and their authorization/status/checkpoint metadata. Use this to inspect progress across scheduled sessions. A task may run only if it is explicitly owner-approved or marked mission_authorized by the Worker’s restricted standing-mandate allowlist. A task that is merely proposed and has neither authorization remains non-executable. Do not infer authorization from a task title or prior chat.",
  inputSchema: z.object({
    limit: z.number().int().min(1).max(50).default(20),
  }),
  async execute({ limit }) {
    assertProductionTaskRuntime();
    return memoryRequest("v1/tasks?limit=" + limit);
  },
});
