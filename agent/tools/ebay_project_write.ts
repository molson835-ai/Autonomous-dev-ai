import { defineDynamic, defineTool } from "eve/tools";
import { z } from "zod";
import { runEbayProjectWrite } from "../lib/ebay-project-write.mjs";
import { canUseWriteTools } from "../lib/tool-access";

const tool = defineTool({
  description:
    "Bounded GitHub development access for Eve's owner-authorized eBay inventory audit project only. Uses the EVE_GITHUB_REPO_TOKEN secret and fixed repository molson835-ai/Autonomous-dev-AI. Can create branches only under eve/ebay-inventory-audit/, write small text files only under products/ebay-inventory-audit/, and open draft PRs to main only after verifying every changed file remains inside that directory. Writes require the caller's current expected commit SHA. Cannot write main, merge, deploy, delete files, access other paths/repositories, run shell commands, or contact customers. Token is never returned. All PRs are draft and require owner review.",
  inputSchema: z.discriminatedUnion("action", [
    z.object({
      action: z.literal("create_branch"),
      branchName: z.string().min(1).max(100),
      expectedBaseSha: z.string().regex(/^[a-f0-9]{40}$/i),
    }).strict(),
    z.object({
      action: z.literal("write_file"),
      branchName: z.string().min(1).max(100),
      path: z.string().min(1).max(240),
      content: z.string().min(1).max(65536),
      message: z.string().trim().min(5).max(120),
      expectedHeadSha: z.string().regex(/^[a-f0-9]{40}$/i),
    }).strict(),
    z.object({
      action: z.literal("open_pull_request"),
      branchName: z.string().min(1).max(100),
      expectedHeadSha: z.string().regex(/^[a-f0-9]{40}$/i),
      title: z.string().trim().min(5).max(120),
      body: z.string().max(5000).optional(),
    }).strict(),
  ]),
  async execute(input) {
    return runEbayProjectWrite(input, process.env.EVE_GITHUB_REPO_TOKEN);
  },
});

export default defineDynamic(ctx => canUseWriteTools(ctx) ? tool : null);
