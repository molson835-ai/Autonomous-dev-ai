import { defineDynamic, defineTool } from "eve/tools";
import { z } from "zod";
import { memoryRequest } from "../lib/memory-client";
import { assertProductionTaskRuntime } from "../lib/task-runtime.mjs";
import { canUseWriteTools } from "../lib/tool-access";

const tool = defineTool({
  description:
    "Required closeout: after claiming a task, call this tool exactly once before ending the invocation, including after partial work or a tool failure. Each claim consumes one bounded progress step (up to task.max_steps, currently at most 10); stale-run retries have a separate max_attempts budget. If the step budget is exhausted, pause with the checkpoint rather than scheduling another continuation. Checkpoint or finish the currently running owner-approved task. Use waiting with resume_after_seconds (5–3600) for a prompt bounded continuation, or resume_after_minutes (15–1440) for a longer delay; use waiting without it when blocked on owner input or an external dependency. If any substantive work tool failed, do not set a resume delay; use paused for owner review. Use succeeded only when every material objective in the task goal and approved_scope has been completed and verified. A completed tool call, one research step, a promising lead, or the presence of evidence references does not by itself mean the task is complete. If any approved objective remains unfinished, record a truthful checkpoint with waiting (or paused if owner intervention is required); never use succeeded merely to close the current invocation. Use failed only for a confirmed task failure. If closeout fails, report that exact failure and do not claim the task was checkpointed. You cannot approve, resume a paused task, change approved scope, or mark a task queued.",
  inputSchema: z.object({
    id: z.string().uuid(),
    status: z.enum(["waiting", "succeeded", "failed", "paused"]),
    checkpoint_summary: z.string().max(2000).optional(),
    result_summary: z.string().max(4000).optional(),
    evidence_refs: z.array(z.string().max(500)).max(20).optional(),
    resume_after_seconds: z.number().int().min(5).max(3600).optional(),
    resume_after_minutes: z.number().int().min(15).max(1440).optional(),
  }),
  async execute({ id, resume_after_seconds, resume_after_minutes, ...body }) {
    assertProductionTaskRuntime();
    if (resume_after_seconds !== undefined && resume_after_minutes !== undefined) {
      throw new Error("Choose either resume_after_seconds or resume_after_minutes, not both.");
    }
    if ((resume_after_seconds !== undefined || resume_after_minutes !== undefined) && body.status !== "waiting") {
      throw new Error("A resume delay is only valid when status is waiting.");
    }
    const delayMs = resume_after_seconds !== undefined ? resume_after_seconds * 1000
      : resume_after_minutes !== undefined ? resume_after_minutes * 60_000 : null;
    const next_run_at = body.status === "waiting"
      ? (delayMs === null ? null : new Date(Date.now() + delayMs).toISOString())
      : undefined;
    return memoryRequest("v1/tasks/" + encodeURIComponent(id) + "/transition", {
      method: "POST",
      body: { ...body, ...(body.status === "waiting" ? { next_run_at } : {}) },
    });
  },
});

export default defineDynamic(ctx => canUseWriteTools(ctx) ? tool : null);
