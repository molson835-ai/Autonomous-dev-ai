import { defineTool } from "eve/tools";
import { z } from "zod";
import { memoryRequest } from "../lib/memory-client";

export default defineTool({
  description:
    "Checkpoint or finish the currently running owner-approved task. Use waiting with next_run_at for a safe, bounded continuation on a later schedule; use waiting without next_run_at when blocked on owner input or an external dependency. Use succeeded only after verification, failed for a confirmed failure, and paused to stop. You cannot approve, resume a paused task, change approved scope, or mark a task queued.",
  inputSchema: z.object({
    id: z.string().uuid(),
    status: z.enum(["waiting", "succeeded", "failed", "paused"]),
    checkpoint_summary: z.string().max(2000).optional(),
    result_summary: z.string().max(4000).optional(),
    evidence_refs: z.array(z.string().max(500)).max(20).optional(),
    next_run_at: z.string().datetime().nullable().optional(),
  }),
  async execute({ id, ...body }) {
    return memoryRequest("v1/tasks/" + encodeURIComponent(id) + "/transition", {
      method: "POST",
      body,
    });
  },
});
