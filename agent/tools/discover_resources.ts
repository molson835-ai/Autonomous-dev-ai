import { defineDynamic, defineTool } from "eve/tools";
import { z } from "zod";
import { memoryRequest } from "../lib/memory-client";
import { discoverPublicResources } from "../research/resource-discovery.mjs";
import { canUseWriteTools } from "../lib/tool-access";

const tool = defineTool({
  description: "Discover public software, model, and library resources using bounded, keyless queries to GitHub, Hugging Face, and npm catalogs. Returns untrusted discovery leads and submits only inert metadata to Eve's existing quarantined resource registry. New entries require owner review; this tool never downloads, installs, executes, enables, or approves resources. Queries are sent to the selected public providers; never include private data, credentials, or personal information. Public visibility does not prove free use or commercial rights.",
  inputSchema: z.object({
    query: z.string().trim().min(3).max(160),
    catalogs: z.array(z.enum(["github", "huggingface", "npm"])).min(1).max(3).default(["github", "huggingface", "npm"]),
    limitPerCatalog: z.number().int().min(1).max(3).default(2)
  }),
  async execute({ query, catalogs, limitPerCatalog }) {
    return discoverPublicResources({
      query,
      catalogs,
      limitPerCatalog,
      submitCandidate: candidate => memoryRequest<{ id: string; trust_state: string; created: boolean }>(
        "v1/resources", { method: "POST", body: candidate }
      )
    });
  }
});

export default defineDynamic(ctx => canUseWriteTools(ctx) ? tool : null);
