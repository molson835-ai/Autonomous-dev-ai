import { defineTool } from "eve/tools";
import { z } from "zod";
import { memoryRequest } from "../lib/memory-client";

export default defineTool({
  description:
    "List pending learning proposals for the owner to inspect. Do not approve or reject proposals yourself; present their content, source, and confidence and wait for an explicit owner decision.",
  inputSchema: z.object({
    limit: z.number().int().min(1).max(20).default(10),
  }),
  async execute({ limit }) {
    return memoryRequest("v1/proposals?limit=" + limit);
  },
});
