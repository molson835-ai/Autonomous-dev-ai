import { defineTool } from "eve/tools";
import { z } from "zod";
import { canUseWriteTools, isExplicitReadOnlyTurn } from "../lib/tool-access";
import { buildRuntimeDiagnostic } from "../lib/runtime-diagnostics.mjs";

export default defineTool({
  description:
    "Read-only diagnostic of the current Eve session identity, owner verification, write-gate decision, source-defined tool inventory, and verification limits. Makes no network requests and changes no state. It explicitly distinguishes repository source files from the effective live runtime tool manifest, which is not exposed through the documented ToolContext API. Never report a source-defined tool as live-available solely because it appears in the source list.",
  inputSchema: z.object({}),
  async execute(_input, ctx) {
    const session = ctx.session;
    const principal = session.auth?.current ?? null;
    const ownerGithubId = process.env.OWNER_GITHUB_ID;
    // ToolContext.messages is the model input for this step and can include
    // prior conversation history. Evaluate only the newest user message so an
    // earlier read-only request cannot incorrectly govern a later turn.
    const latestUserMessage = [...ctx.messages].reverse().find(message => message.role === "user") ?? null;
    const readOnlyTurn = isExplicitReadOnlyTurn(latestUserMessage);
    const accessContext = {
      session: {
        auth: session.auth,
        schedule: (session as unknown as { schedule?: unknown }).schedule ?? null,
      },
      turn: { input: latestUserMessage },
    } as Parameters<typeof canUseWriteTools>[0];
    const writeToolsAllowed = canUseWriteTools(accessContext);

    return buildRuntimeDiagnostic({
      principal,
      ownerGithubId,
      vercelEnv: process.env.VERCEL_ENV,
      readOnlyTurn,
      writeToolsAllowed,
      toolName: ctx.toolName,
    });
  },
});
