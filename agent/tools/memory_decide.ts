import { defineTool } from "eve/tools";
import { z } from "zod";

export default defineTool({
  description:
    "Disabled for the Eve runtime. Memory proposal approval or rejection is an owner-only action and must be performed through a separately authenticated owner-side interface. Never attempt to approve or reject proposals yourself.",
  inputSchema: z.object({
    id: z.string().uuid(),
    decision: z.enum(["approve", "reject"]),
  }),
  async execute() {
    throw new Error("Memory proposal decisions are unavailable from the Eve agent. The owner-only approval interface is not configured.");
  },
});
