import { defineTool } from "eve/tools";
import { z } from "zod";
import { memoryRequest } from "../memory/client";

export default defineTool({
  description:
    "Submit a candidate lesson, fact, procedure, or preference for owner review. Proposals are not trusted or automatically recalled. Include a source or experience reference and explain uncertainty. Never store credentials, secrets, private personal data, or sensitive financial/medical details. Ask the owner to review before treating a proposal as approved knowledge.",
  inputSchema: z.object({
    kind: z.enum(["fact", "procedure", "preference", "lesson"]),
    content: z.string().min(5).max(6000),
    source: z.string().min(3).max(2000),
    confidence: z.number().min(0).max(1),
  }),
  async execute(input) {
    return memoryRequest("v1/proposals", { method: "POST", body: input });
  },
});
