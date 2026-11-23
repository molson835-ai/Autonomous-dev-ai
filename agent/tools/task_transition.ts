import { defineTool } from "eve/tools";
import { z } from "zod";
import { memoryRequest } from "../lib/memory-client";
import { assertProductionTaskRuntime } from "../lib/task-runtime.mjs";

export default defineTool({
  description:
    "Required closeout: after claiming a task, call this tool exactly once before ending the invocation, including after partial work or a tool failure. Checkpoint or finish the currently running owner-approved task. Use waiting with resume_after_minutes (15–1440) for a safe, bounded continuation on a later schedule; use waiting without it when blocked on owner input or an external dependency. Use succeeded only after verification, failed for a confirmed failure, and paused to stop. If closeout fails, report that exact failure and do not claim the task was checkpointed. You cannot approve, resume a paused task, change approved scope, or mark a task queued.",
  inputSchema: z.object({
    id: z.string().uuid(),
    status: z.enum(["waiting", "succeeded", "failed", "paused"]),
    checkpoint_summary: z.string().max(2000).optional(),
    result_summary: z.string().max(4000).optional(),
    evidence_refs: z.array(z.string().max(500)).max(20).optional(),
    resume_after_minutes: z.number().int().min(15).max(1440).optional(),
  }),
  async execute({ id, resume_after_minutes, ...body }) {
    assertProductionTaskRuntime();
    if (resume_after_minutes !== undefined && body.status !== "waiting") {
      throw new Error("resume_after_minutes is only valid when status is waiting.");
    }
    const next_run_at = body.status === "waiting"
      ? (resume_after_minutes === undefined ? null : new Date(Date.now() + resume_after_minutes * 60_000).toISOString())
      : undefined;
    return memoryRequest("v1/tasks/" + encodeURIComponent(id) + "/transition", {
      method: "POST",
      body: { ...body, ...(body.status === "waiting" ? { next_run_at } : {}) },
    });
  },
});
