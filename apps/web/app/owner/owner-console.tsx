"use client";

import { useCallback, useState } from "react";

const MEMORY_API = "https://autonomous-dev-memory.molson835.workers.dev";

type Task = {
  id: string;
  title: string;
  goal: string;
  approved_scope: string;
  status: string;
  owner_approved: boolean;
  attempt_count: number;
  max_attempts: number;
  checkpoint_summary?: string | null;
  result_summary?: string | null;
  created_at: string;
};

type Proposal = {
  id: string;
  kind: string;
  content: string;
  source: string;
  confidence: number;
  created_at: string;
};

type OwnerData = { tasks: Task[]; proposals: Proposal[] };

async function ownerRequest<T>(token: string, path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(MEMORY_API + path, {
    method,
    headers: {
      authorization: "Bearer " + token,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    credentials: "omit",
  });
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    throw new Error("The owner service returned an unreadable response.");
  }
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload
      ? String((payload as { error: unknown }).error)
      : "Owner request failed (" + response.status + ").";
    throw new Error(message);
  }
  return payload as T;
}

export default function OwnerConsole() {
  const [token, setToken] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async (): Promise<boolean> => {
    if (!token.trim()) {
      setMessage("Enter the owner-only token to load pending reviews.");
      return false;
    }
    setBusy("load");
    setMessage("");
    try {
      const [taskData, proposalData] = await Promise.all([
        ownerRequest<{ tasks: Task[] }>(token, "/v1/owner/tasks?limit=30"),
        ownerRequest<{ proposals: Proposal[] }>(token, "/v1/owner/proposals?limit=30"),
      ]);
      setTasks(taskData.tasks);
      setProposals(proposalData.proposals);
      setLoaded(true);
      setMessage("Owner review data loaded. The token remains in this page's memory only.");
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Owner request failed.");
      setLoaded(false);
      return false;
    } finally {
      setBusy(null);
    }
  }, [token]);

  async function perform(id: string, path: string, method: string, body?: unknown) {
    setBusy(id);
    setMessage("");
    try {
      await ownerRequest(token, path, method, body);
      if (await load()) setMessage("Owner action confirmed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Owner action failed.");
    } finally {
      setBusy(null);
    }
  }

  function forgetToken() {
    setToken("");
    setTasks([]);
    setProposals([]);
    setLoaded(false);
    setMessage("Token cleared from this page.");
    setBusy(null);
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Owner-only controls</p>
        <h1 className="text-3xl font-semibold tracking-tight">Eve Owner Console</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Review proposed tasks and learning proposals. This console is separate from Eve's model tools.
          The token is kept in page memory only; it is not saved to browser storage or sent to Eve.
        </p>
      </header>

      <section className="rounded-xl border bg-card p-4 shadow-sm">
        <label htmlFor="owner-token" className="mb-2 block text-sm font-medium">Owner approval token</label>
        <input
          id="owner-token"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={token}
          onChange={event => setToken(event.target.value)}
          placeholder="Paste the separate owner-only token"
          className="w-full rounded-lg border bg-background px-3 py-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={busy !== null || !token.trim()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {busy === "load" ? "Loading…" : "Load reviews"}
          </button>
          <button
            type="button"
            onClick={forgetToken}
            disabled={!token && !loaded}
            className="rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            Forget token
          </button>
        </div>
        {message && <p role="status" className="mt-3 text-sm text-muted-foreground">{message}</p>}
      </section>

      {loaded && (
        <>
          <section className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-xl font-semibold">Task approvals</h2>
              <span className="text-sm text-muted-foreground">{tasks.length} tasks</span>
            </div>
            {tasks.length === 0 && <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">No task records yet.</p>}
            {tasks.map(task => (
              <article key={task.id} className="space-y-3 rounded-xl border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">{task.title}</h3>
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">{task.status}</span>
                </div>
                <p className="text-sm">{task.goal}</p>
                <div className="rounded-lg bg-muted/60 p-3 text-sm">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Requested scope</p>
                  {task.approved_scope}
                </div>
                {task.checkpoint_summary && <p className="text-sm text-muted-foreground">Checkpoint: {task.checkpoint_summary}</p>}
                {task.result_summary && <p className="text-sm text-muted-foreground">Result: {task.result_summary}</p>}
                <p className="text-xs text-muted-foreground">Attempts: {task.attempt_count}/{task.max_attempts} · {task.owner_approved ? "Owner approved" : "Not approved"} · ID {task.id}</p>
                <div className="flex flex-wrap gap-2">
                  {task.status === "proposed" && (
                    <button type="button" disabled={busy !== null} onClick={() => void perform(task.id, "/v1/tasks/" + task.id + "/approve", "POST")} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
                      Approve task
                    </button>
                  )}
                  {["queued", "running", "waiting"].includes(task.status) && (
                    <button type="button" disabled={busy !== null} onClick={() => void perform(task.id, "/v1/tasks/" + task.id + "/owner-control", "POST", { action: "pause" })} className="rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50">
                      Pause
                    </button>
                  )}
                  {task.status === "paused" && (
                    <button type="button" disabled={busy !== null} onClick={() => void perform(task.id, "/v1/tasks/" + task.id + "/owner-control", "POST", { action: "resume" })} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
                      Resume
                    </button>
                  )}
                </div>
              </article>
            ))}
          </section>

          <section className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-xl font-semibold">Memory proposals</h2>
              <span className="text-sm text-muted-foreground">{proposals.length} pending</span>
            </div>
            {proposals.length === 0 && <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">No pending memory proposals.</p>}
            {proposals.map(proposal => (
              <article key={proposal.id} className="space-y-3 rounded-xl border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">{proposal.kind}</h3>
                  <span className="text-xs text-muted-foreground">Confidence: {proposal.confidence}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm">{proposal.content}</p>
                <p className="text-sm text-muted-foreground">Source: {proposal.source}</p>
                <p className="text-xs text-muted-foreground">ID {proposal.id}</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={busy !== null} onClick={() => void perform(proposal.id, "/v1/proposals/" + proposal.id + "/decision", "POST", { decision: "approve" })} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
                    Approve proposal
                  </button>
                  <button type="button" disabled={busy !== null} onClick={() => void perform(proposal.id, "/v1/proposals/" + proposal.id + "/decision", "POST", { decision: "reject" })} className="rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50">
                    Reject proposal
                  </button>
                </div>
              </article>
            ))}
          </section>
        </>
      )}
    </main>
  );
}
