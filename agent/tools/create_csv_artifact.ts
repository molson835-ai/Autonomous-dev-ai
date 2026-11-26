import { defineDynamic, defineTool } from "eve/tools";
import { z } from "zod";
import { validateCsvArtifact } from "../lib/csv-artifact-policy.mjs";
import { memoryRequest } from "../lib/memory-client";
import { canUseWriteTools } from "../lib/tool-access";

const tool = defineTool({
  description: "Create and persist one bounded CSV data artifact. Provide a name, complete CSV text with a unique non-empty header row, and a UUID idempotency_key. The tool validates consistent columns, quoting, limits and spreadsheet-formula safety, then stores it in the authenticated artifact library. Reuse the same key for an identical retry. The verified owner can download or delete it in the Owner Console. CSV is data only: formulas are rejected, and no spreadsheet is executed. Maximum 64 KiB, 500 rows and 50 columns. Do not include credentials, secrets, private personal data, or sensitive financial/medical information. No filesystem, network, package installation, commit or deployment access.",
  inputSchema: z.object({ name: z.string().trim().min(1).max(80), content: z.string().min(1).max(65536), idempotency_key: z.string().uuid() }).strict(),
  async execute(input) {
    const validated = validateCsvArtifact({ name: input.name, content: input.content });
    if (!validated.valid) return validated;
    const stored = await memoryRequest<{ stored: boolean; duplicate: boolean; artifact: { id: string; name: string; filename: string; media_type: string; bytes: number; created_at: string; sha256: string } }>(
      "v1/artifacts/csv",
      { method: "POST", body: input },
    );
    return {
      ...validated,
      status: stored.duplicate ? "artifact_already_persisted" : "artifact_persisted",
      artifact: { ...validated.artifact, id: stored.artifact.id, sha256: stored.artifact.sha256 },
      persistence: { stored: stored.stored, duplicate: stored.duplicate ?? false, created_at: stored.artifact.created_at, owner_library: "Owner Console" },
    };
  },
});

export default defineDynamic(ctx => canUseWriteTools(ctx) ? tool : null);
