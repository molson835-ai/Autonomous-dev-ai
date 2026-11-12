import { defineTool } from "eve/tools";
import { z } from "zod";
import { memoryRequest } from "../memory/client";

export default defineTool({
  description:
    "Approve or reject one pending memory proposal only after the owner explicitly instructs that exact decision. Approval makes the record eligible for recall; rejection permanently marks that proposal rejected. Never infer approval from silence or general encouragement.",
  inputSchema: z.object({
    id: z.string().uuid(),
    decision: z.enum(["approve", "reject"]),
  }),
  async execute({ id, decision }) {
    return memoryRequest("v1/proposals/" + encodeURIComponent(id) + "/decision", {
      method: "POST",
      body: { decision },
    });
  },
});
