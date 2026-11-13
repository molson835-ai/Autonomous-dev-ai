import { defineTool } from "eve/tools";
import { z } from "zod";
import { memoryRequest } from "../lib/memory-client";

export default defineTool({
  description:
    "Atomically claim at most one due task that is already owner-approved. The task store blocks a second running task and enforces attempt limits. If no task is returned, stop. Never bypass approval, change task scope, or attempt external actions not explicitly inside the approved scope.",
  inputSchema: z.object({}),
  async execute() {
    return memoryRequest("v1/tasks/claim-next", { method: "POST", body: {} });
  },
});
