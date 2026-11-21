import { defineTool } from "eve/tools";
import { z } from "zod";
import { runDataWorkbench } from "../lib/data-workbench.mjs";

const scalar = z.union([z.string().max(2000), z.number().finite(), z.boolean(), z.null()]);
const row = z.record(z.string().max(80), scalar);

export default defineTool({
  description: "Perform bounded deterministic operations on caller-supplied JSON records: summarize fields and numeric ranges, deduplicate, project columns, sort, filter, or count groups. Accepts at most 500 records, 50 fields per record, 2,000 characters per string value, and 256 KiB total input; returns at most 100 rows. Pure in-memory processing only: no filesystem, network, persistence, code execution, model calls, or external side effects. This tool does not verify source data or infer facts beyond the supplied records.",
  inputSchema: z.object({
    operation: z.enum(["summarize", "deduplicate", "project", "sort", "filter", "group_count"]),
    records: z.array(row).max(500),
    field: z.string().max(80).optional(),
    fields: z.array(z.string().max(80)).max(50).optional(),
    direction: z.enum(["asc", "desc"]).optional(),
    operator: z.enum(["eq", "ne", "contains", "gt", "gte", "lt", "lte", "is_empty", "is_not_empty"]).optional(),
    value: scalar.optional(),
    max_output: z.number().int().min(1).max(100).default(50)
  }).strict(),
  async execute(input) {
    return runDataWorkbench(input);
  }
});
