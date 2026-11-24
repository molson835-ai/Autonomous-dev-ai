import { defineDynamic, defineTool } from "eve/tools";
import { z } from "zod";
import { memoryRequest } from "../lib/memory-client";
import { assertProductionTaskRuntime } from "../lib/task-runtime.mjs";
import { canUseWriteTools } from "../lib/tool-access";

const tool = defineTool({
  description:
    "Refresh the execution lease for a task that is actively running and individually approved by the owner. Call periodically during long-running work (at least every 10 minutes). This does not approve, resume, or change the scope of a task.",
  inputSchema: z.object({ id: z.string().uuid() }),
  async execute({ id }) {
    assertProductionTaskRuntime();
    return memoryRequest("v1/tasks/" + encodeURIComponent(id) + "/heartbeat", {
      method: "POST",
      body: {},
    });
  },
});

export default defineDynamic(ctx => canUseWriteTools(ctx) ? tool : null);
