import { defineDynamic, defineTool } from "eve/tools";
import { z } from "zod";
import { generateToolScaffold } from "../lib/toolsmith.mjs";
import { canUseWriteTools } from "../lib/tool-access";

const field = z.object({
  name: z.string().min(1).max(40),
  type: z.enum(["string", "number", "boolean"]),
  required: z.boolean().optional(),
  maxLength: z.number().int().min(1).max(2000).optional(),
  min: z.number().finite().optional(),
  max: z.number().finite().optional(),
}).strict();

const tool = defineTool({
  description: "Generate a proposal-only TypeScript scaffold for a small pure deterministic tool from a bounded declarative specification. It does not write files, run code, install packages, access the network or filesystem, register tools, or grant permissions. Generated code is inert and requires developer implementation, tests, review, and owner approval before use.",
  inputSchema: z.object({
    name: z.string().min(2).max(48),
    description: z.string().min(1).max(300),
    purpose: z.string().min(1).max(500),
    capability: z.literal("pure"),
    fields: z.array(field).min(1).max(8),
  }).strict(),
  async execute(input) {
    return generateToolScaffold(input);
  },
});

export default defineDynamic(ctx => canUseWriteTools(ctx) ? tool : null);
