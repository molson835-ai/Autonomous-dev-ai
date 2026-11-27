export interface TaskCloseoutCall {
  readonly name: string;
  readonly kind?: string;
  readonly state?: string;
  readonly turnId?: string;
  readonly output?: unknown;
  readonly error?: { readonly name?: string } | null;
  readonly errorName?: string;
}

export interface TaskCloseoutInput {
  readonly calls: readonly TaskCloseoutCall[];
  readonly outcome: string;
  readonly sessionId: string;
  readonly turnId: string;
}

export interface TaskCloseoutRecovery {
  readonly taskId: string;
  readonly status: "waiting" | "paused";
  readonly resumeAfterSeconds?: 5;
  readonly checkpointSummary: string;
}

export function recoverableTaskCloseout(
  input: TaskCloseoutInput,
): TaskCloseoutRecovery | null;
