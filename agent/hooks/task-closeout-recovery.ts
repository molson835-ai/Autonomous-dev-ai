import { calls } from "eve/events";
import { defineHook } from "eve/hooks";
import { memoryRequest } from "../lib/memory-client";
import { assertProductionTaskRuntime } from "../lib/task-runtime.mjs";
import { recoverableTaskCloseout } from "../lib/task-closeout-recovery.mjs";

export default defineHook({
  events: {
    async "turn.settled"(event, ctx) {
      const recovery = recoverableTaskCloseout({
        calls: calls(ctx.view, { turnId: event.data.turnId, kind: "tool" }),
        outcome: event.data.outcome,
        sessionId: ctx.session.id,
        turnId: event.data.turnId,
      });
      if (!recovery) return;

      try {
        assertProductionTaskRuntime();
        const next_run_at = recovery.resumeAfterMinutes === undefined
          ? undefined
          : new Date(ctx.now.getTime() + recovery.resumeAfterMinutes * 60_000).toISOString();
        await memoryRequest(`v1/tasks/${encodeURIComponent(recovery.taskId)}/transition`, {
          method: "POST",
          body: {
            status: recovery.status,
            checkpoint_summary: recovery.checkpointSummary,
            ...(next_run_at === undefined ? {} : { next_run_at }),
          },
        });
        console.warn("Eve task closeout was recovered after a settled turn omitted task_transition.", {
          taskId: recovery.taskId,
          status: recovery.status,
          sessionId: ctx.session.id,
          turnId: event.data.turnId,
        });
      } catch (error) {
        console.error("Eve task closeout recovery failed; the existing stale-lease recovery remains the fallback.", {
          taskId: recovery.taskId,
          sessionId: ctx.session.id,
          turnId: event.data.turnId,
          errorName: error instanceof Error ? error.name : "UnknownError",
        });
      }
    },
  },
});
