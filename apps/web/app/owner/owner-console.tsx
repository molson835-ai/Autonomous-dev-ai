"use client";

import { useCallback, useEffect, useState } from "react";


type Task = {
  id: string;
  title: string;
  goal: string;
  approved_scope: string;
  status: string;
  owner_approved: boolean;
  mission_authorized: boolean;
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

type Resource = { id: string; resource: Record<string, unknown> | null; trust_state: string; created_at: string; reviewer: string | null; reviewed_at: string | null; review_evidence: string[] };
type QueueStatus = { queue_paused: boolean; reason: string | null; running_tasks: number; queued_tasks: number; updated_at: string };
type MemoryProbe = {
  name: string;
  status: number | null;
  ok: boolean;
  duration_ms: number;
  result: "ok" | "http_error" | "timeout" | "network_error";
  content_type?: string;
  body_kind?: "json" | "non_json" | "empty";
  response_bytes?: number;
  response_keys?: string[];
};
type MemoryDiagnostic = {
  checked_at: string;
  environment: string;
  configured: boolean;
  configuration: string;
  host_matches_expected: boolean | null;
  checks: MemoryProbe[];
};


async function ownerRequest<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch("/api/owner" + path, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
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
  const [authenticated, setAuthenticated] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [memoryDiagnostic, setMemoryDiagnostic] = useState<MemoryDiagnostic | null>(null);

  const load = useCallback(async (): Promise<boolean> => {
    if (!authenticated) return false;
    setBusy("load");
    setMessage("");
    try {
      const [taskData, proposalData, statusData, resourceData] = await Promise.all([
        ownerRequest<{ tasks: Task[] }>("/v1/owner/tasks?limit=30"),
        ownerRequest<{ proposals: Proposal[] }>("/v1/owner/proposals?limit=30"),
        ownerRequest<QueueStatus>("/v1/owner/status"),
        ownerRequest<{ resources: Resource[] }>("/v1/owner/resources?limit=50"),
      ]);
      setTasks(taskData.tasks);
      setProposals(proposalData.proposals);
      setResources(resourceData.resources);
      setQueueStatus(statusData);
      setLoaded(true);
      setMessage("Owner review data loaded. Your GitHub identity is verified server-side.");
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Owner request failed.");
      setLoaded(false);
      return false;
    } finally {
      setBusy(null);
    }
  }, [authenticated]);

  async function perform(id: string, path: string, method: string, body?: unknown) {
    setBusy(id);
    setMessage("");
    try {
      await ownerRequest(path, method, body);
      if (await load()) setMessage("Owner action confirmed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Owner action failed.");
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    let active = true;
    fetch("/api/owner/session", { cache: "no-store" })
      .then(response => response.ok ? response.json() : { authenticated: false })
      .then(session => {
        if (!active) return;
        setAuthenticated(session.authenticated === true);
        if (session.authenticated !== true) setMessage("Sign in with the owner GitHub account to review pending approvals.");
      })
      .catch(() => { if (active) setMessage("Could not verify the owner session."); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (authenticated) void load();
  }, [authenticated, load]);

  async function runApprovedTaskNow() {
    setBusy("run-now");
    setMessage("");
    try {
      const response = await fetch("/api/owner/run-now", {
        method: "POST",
        cache: "no-store",
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const errorMessage = payload && typeof payload === "object" && "error" in payload
          ? String((payload as { error: unknown }).error)
          : "Run-now request failed (" + response.status + ").";
        throw new Error(errorMessage);
      }
      const sessionId = payload && typeof payload === "object" && "session_id" in payload
        ? String((payload as { session_id: unknown }).session_id)
        : "accepted";
      await load();
      setMessage("Eve Production session accepted. Task claim and completion are not yet confirmed. Session: " + sessionId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not start Eve.");
    } finally {
      setBusy(null);
    }
  }

  async function runMemoryDiagnostic() {
    setBusy("memory-diagnostic");
    setMessage("");
    try {
      const response = await fetch("/api/owner/memory-diagnostic", { cache: "no-store" });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const errorMessage = payload && typeof payload === "object" && "error" in payload
          ? String((payload as { error: unknown }).error)
          : "Memory diagnostic request failed (" + response.status + ").";
        throw new Error(errorMessage);
      }
      setMemoryDiagnostic(payload as MemoryDiagnostic);
      setMessage("Memory endpoint checks completed. Review each HTTP result below.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Memory diagnostic failed.");
    } finally {
      setBusy(null);
    }
  }

  async function forgetToken() {
    await fetch("/api/auth/github/logout", { method: "POST" });
    setAuthenticated(false);
    setTasks([]);
    setProposals([]);
    setResources([]);
    setQueueStatus(null);
    setLoaded(false);
    setMessage("Signed out of the owner console.");
    setBusy(null);
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Owner-only controls</p>
        <h1 className="text-3xl font-semibold tracking-tight">Eve Owner Console</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Review proposed tasks and learning proposals. This console is separate from Eve's model tools.
          Owner access is verified by GitHub and the session credential stays in an HttpOnly cookie.
        </p>
      </header>

      <section className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">{authenticated ? "Signed in with the owner GitHub account" : "Owner authentication required"}</p>
            <p className="mt-1 text-sm text-muted-foreground">Only the GitHub account molson835-ai can access approvals and queue controls. No owner credential is entered into this page.</p>
          </div>
          {authenticated ? (
            <button type="button" onClick={() => void forgetToken()} disabled={busy !== null} className="rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50">Sign out</button>
          ) : (
            <a href="/api/auth/github" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Sign in with GitHub</a>
          )}
        </div>
        {authenticated && <button type="button" onClick={() => void load()} disabled={busy !== null} className="mt-3 rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50">{busy === "load" ? "Loading…" : "Refresh reviews"}</button>}
        {message && <p role="status" className="mt-3 text-sm text-muted-foreground">{message}</p>}
      </section>

      {authenticated && (
        <section className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
          <div className="space-y-1">
            <h2 className="font-semibold">Persistent memory connection test</h2>
            <p className="text-sm text-muted-foreground">Checks both read-only memory endpoints using the server-side Production/Preview configuration. Memory contents and credentials are never displayed; no tasks or records are changed.</p>
          </div>
          <button type="button" onClick={() => void runMemoryDiagnostic()} disabled={busy !== null} className="rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50">
            {busy === "memory-diagnostic" ? "Testing memory…" : "Run memory connection test"}
          </button>
          {memoryDiagnostic && (
            <div className="space-y-3" aria-live="polite">
              <p className="text-xs text-muted-foreground">
                Checked {new Date(memoryDiagnostic.checked_at).toLocaleString()} · Environment: {memoryDiagnostic.environment}
              </p>
              <p className="text-sm">
                Configuration: <strong>{memoryDiagnostic.configuration}</strong>
                {memoryDiagnostic.host_matches_expected === true ? " · Expected Worker host confirmed" : memoryDiagnostic.host_matches_expected === false ? " · Worker host mismatch or invalid URL; no credential was sent" : ""}
              </p>
              {memoryDiagnostic.checks.length === 0 && <p className="text-sm text-muted-foreground">No requests were sent. Check the Vercel environment configuration before proceeding.</p>}
              {memoryDiagnostic.checks.map(check => (
                <article key={check.name} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="text-sm">{check.name}</strong>
                    <span className="text-sm font-medium">{check.status === null ? check.result : "HTTP " + check.status + " · " + check.result}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {check.duration_ms} ms{check.content_type ? " · " + check.content_type : ""}{check.response_bytes !== undefined ? " · " + check.response_bytes + " response bytes" : ""}
                  </p>
                  {check.response_keys && <p className="mt-1 break-words text-xs text-muted-foreground">Response fields: {check.response_keys.join(", ")}</p>}
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {loaded && (
        <>
          {queueStatus && (
            <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
              <div className="space-y-1">
                <p className="font-semibold">Background task queue: {queueStatus.queue_paused ? "Paused" : "Active"}</p>
                <p className="text-sm text-muted-foreground">
                  {queueStatus.running_tasks} running · {queueStatus.queued_tasks} queued (owner-approved)
                  {queueStatus.reason ? " · " + queueStatus.reason : ""}
                </p>
                <p className="text-xs text-muted-foreground">Pausing prevents new claims; an already-running invocation may finish its current bounded step.</p>
              </div>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void perform("queue", "/v1/owner/control", "POST", queueStatus.queue_paused ? { action: "resume" } : { action: "pause", reason: "Paused from owner console" })}
                className="rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50"
              >
                {queueStatus.queue_paused ? "Resume queue" : "Pause queue"}
              </button>
              <button
                type="button"
                disabled={busy !== null || queueStatus.queue_paused || queueStatus.running_tasks !== 0 || queueStatus.queued_tasks < 1}
                onClick={() => void runApprovedTaskNow()}
                className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {busy === "run-now" ? "Starting Eve…" : "Run next approved task now"}
              </button>
            </section>
          )}
          <section className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-xl font-semibold">Task queue & approvals</h2>
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
                <p className="text-xs text-muted-foreground">Attempts: {task.attempt_count}/{task.max_attempts} · {task.mission_authorized ? "Blocked: legacy authorization" : task.owner_approved ? "Owner approved" : "Awaiting owner approval"} · ID {task.id}</p>
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
                    <>
                      <button type="button" disabled={busy !== null} onClick={() => void perform(task.id, "/v1/tasks/" + task.id + "/owner-control", "POST", { action: "resume" })} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
                        Resume
                      </button>
                      <button type="button" disabled={busy !== null} onClick={() => {
                        if (window.confirm("Cancel this paused task? Its history will be preserved, and it cannot be resumed.")) {
                          void perform(task.id, "/v1/tasks/" + task.id + "/owner-control", "POST", { action: "cancel" });
                        }
                      }} className="rounded-lg border border-destructive px-3 py-2 text-sm font-medium text-destructive disabled:opacity-50">
                        Cancel task
                      </button>
                    </>
                  )}
                </div>
              </article>
            ))}
          </section>

          <section className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-xl font-semibold">Resource catalog & security review</h2>
              <span className="text-sm text-muted-foreground">{resources.length} resources</span>
            </div>
            <p className="text-sm text-muted-foreground">New entries remain quarantined. Approval records owner evidence only; it does not install, execute, fetch, or grant permissions to a resource.</p>
            {resources.length === 0 && <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">No resource candidates have been submitted.</p>}
            {resources.map(item => (
              <article key={item.id} className="space-y-3 rounded-xl border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">{String(item.resource?.name ?? item.id)}</h3>
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">{item.trust_state}</span>
                </div>
                <p className="text-sm">{String(item.resource?.summary ?? "Metadata unavailable")}</p>
                <p className="break-all text-xs text-muted-foreground">Source: {String(item.resource?.source_url ?? "unknown")}</p>
                <p className="text-xs text-muted-foreground">Type: {String(item.resource?.resource_type ?? "unknown")} · License: {String(item.resource?.license ?? "unknown")} · Cost: {String(item.resource?.cost_model ?? "unknown")}</p>
                <p className="text-xs text-muted-foreground">ID {item.id}</p>
                {item.review_evidence.length > 0 && <p className="text-sm text-muted-foreground">Review evidence: {item.review_evidence.join(" · ")}</p>}
                {(item.trust_state === "quarantined" || item.trust_state === "reviewed") && (
                  <div className="flex flex-wrap gap-2">
                    {(["reviewed", "approve", "reject", "stale"] as const).map(decision => (
                      <button key={decision} type="button" disabled={busy !== null} onClick={() => {
                        const evidence = window.prompt("Enter review evidence for this decision (required):");
                        if (!evidence?.trim()) return;
                        void perform(item.id, "/v1/owner/resources/" + encodeURIComponent(item.id) + "/decision", "POST", { decision, review_evidence: [evidence.trim()] });
                      }} className="rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50">
                        {decision === "approve" ? "Approve metadata" : decision === "reject" ? "Reject" : decision === "stale" ? "Mark stale" : "Mark reviewed"}
                      </button>
                    ))}
                  </div>
                )}
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
