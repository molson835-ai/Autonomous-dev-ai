import { defineDynamic, defineTool } from "eve/tools";
import { z } from "zod";
import { validateHtmlArtifact } from "../lib/artifact-policy.mjs";
import { memoryRequest } from "../lib/memory-client";
import { canUseWriteTools } from "../lib/tool-access";

const tool = defineTool({
  description: "Create and persist one bounded standalone HTML artifact. Supply a complete responsive HTML5 document. The tool validates the file, stores it in the authenticated Durable Object artifact library, and returns a stable artifact ID plus the sandbox-preview HTML. The verified owner can list, download, or delete stored artifacts in the Owner Console. It does not write to a server filesystem, execute code, access the network except the authenticated memory Worker, install packages, commit, or deploy. Only one HTML file up to 64 KiB is accepted per call; external assets and scripts are prohibited.",
  inputSchema: z.object({ name: z.string().trim().min(1).max(80), content: z.string().min(1).max(65536) }).strict(),
  async execute(input) {
    const validated = validateHtmlArtifact(input);
    if (!validated.valid) return validated;
    const stored = await memoryRequest<{ stored: boolean; artifact: { id: string; name: string; filename: string; media_type: string; bytes: number; created_at: string } }>(
      "v1/artifacts",
      { method: "POST", body: input },
    );
    return {
      ...validated,
      status: "artifact_persisted",
      artifact: { ...validated.artifact, id: stored.artifact.id },
      persistence: { stored: stored.stored, created_at: stored.artifact.created_at, owner_library: "Owner Console" },
    };
  },
});

export default defineDynamic(ctx => canUseWriteTools(ctx) ? tool : null);
