"use client";

import { useCallback, useEffect, useState } from "react";


type Task = {
  id: string;
  title: string;
  goal: string;
  approved_scope: string;
  scope_id: string;
  goal_id: string | null;
  status: string;
  owner_approved: boolean;
  mission_authorized: boolean;
  attempt_count: number;
  max_attempts: number;
  step_count: number;
  max_steps: number;
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
type ArtifactSummary = { id: string; name: string; filename: string; media_type: string; bytes: number; created_at: string };
type ArtifactDetail = ArtifactSummary & { content: string };
type QueueStatus = { queue_paused: boolean; reason: string | null; running_tasks: number; queued_tasks: number; updated_at: string };
type TavilyCreditStatus = {
  month: string;
  source: string;
  monthly_limit: number;
  used_credits: number;
  reserved_credits: number;
  outstanding_reservations: number;
  oldest_outstanding_reservation_at: string | null;
  remaining_budget: number;
  updated_at: string | null;
};
type QuotaStatus = {
  day: string;
  source: string;
  target_neurons: number;
  protected_reserve_neurons: number;
  observed_neurons: number | null;
  observed_at: string | null;
  local_estimated_neurons: number;
  active_reserved_neurons: number;
  projected_neurons: number;
  remaining_to_target: number;
  circuit_open: boolean;
  model_calls_allowed: boolean;
  updated_at: string | null;
};
type QuotaCall = {
  reservation_id: string;
  day: string;
  settled_at: string;
  model_id: string;
  input_tokens: number | null;
  output_tokens: number | null;
  estimated_neurons: number;
  accounting_source: string;
  settlement_reason: string;
};
type QuotaCalls = { day: string; source: string; retention_days: number; count: number; calls: QuotaCall[] };
type MemoryProbe = {
  name: string;
  status: number | null;
  elapsed_ms: number;
  cf_ray: string | null;
  error_code: string | null;
};
type MemoryDiagnostic = {
  checked_at: string;
  environment: string;
  configuration: string;
  host_matches_expected: boolean;
  checks: MemoryProbe[];
};

type RuntimeTool = {
  name: string;
  source: string;
  source_kind: string;
  owner: string;
  has_execute: boolean;
  requires_approval: boolean;
  has_auth: boolean;
};
type RuntimeToolResolver = { slug: string; source: string; source_kind: string; owner: string };
type RuntimeCapabilities = {
  checked_at: string;
  environment: string;
  agent_name: string;
  model_id: string;
  agent_info_version: number | null;
  manifest_scope: string;
  static_tools: RuntimeTool[];
  dynamic_tool_resolvers: RuntimeToolResolver[];
  disabled_definitions: string[];
  shadowed_definitions: string[];
  discovery_errors: number | null;
  discovery_warnings: number | null;
  limitations: string[];
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
  const [selectedTaskScopes, setSelectedTaskScopes] = useState<Record<string, string>>({});
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [artifacts, setArtifacts] = useState<ArtifactSummary[]>([]);
  const [artifactStoreAvailable, setArtifactStoreAvailable] = useState(true);
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);
  const [quotaStatus, setQuotaStatus] = useState<QuotaStatus | null>(null);
  const [quotaCalls, setQuotaCalls] = useState<QuotaCalls | null>(null);
  const [tavilyCreditStatus, setTavilyCreditStatus] = useState<TavilyCreditStatus | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [memoryDiagnostic, setMemoryDiagnostic] = useState<MemoryDiagnostic | null>(null);
  const [runtimeCapabilities, setRuntimeCapabilities] = useState<RuntimeCapabilities | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("Verify Eve Runtime Memory and Research");
  const [newTaskGoal, setNewTaskGoal] = useState("Verify live Eve memory recall, enumerate actual runtime tools, and research one evidence-backed zero-cost revenue opportunity. Prepare a controlled memory write/read-back test plan but do not write to Production.");
  const [newTaskScope, setNewTaskScope] = useState("Read-only runtime verification and public research only. Do not write Production memory or proposals, deploy, merge, spend, contact anyone, publish, purchase, or change queue controls. Stop and request separate owner approval before any memory write.");

  const load = useCallback(async (): Promise<boolean> => {
    if (!authenticated) return false;
    setBusy("load");
    setMessage("");
    try {
      const [taskData, proposalData, statusData, resourceData, artifactData, quotaData, quotaCallData, tavilyData] = await Promise.all([
        ownerRequest<{ tasks: Task[] }>("/v1/owner/tasks?limit=30"),
        ownerRequest<{ proposals: Proposal[] }>("/v1/owner/proposals?limit=30"),
        ownerRequest<QueueStatus>("/v1/owner/status"),
        ownerRequest<{ resources: Resource[] }>("/v1/owner/resources?limit=50"),
        ownerRequest<{ artifacts: ArtifactSummary[] }>("/v1/owner/artifacts?limit=20").catch(() => null),
        ownerRequest<QuotaStatus>("/v1/owner/quota/status").catch(() => null),
        ownerRequest<QuotaCalls>("/v1/owner/quota/calls?limit=50").catch(() => null),
        ownerRequest<TavilyCreditStatus>("/v1/owner/research/credits/status").catch(() => null),
      ]);
      setTasks(taskData.tasks);
      setProposals(proposalData.proposals);
      setResources(resourceData.resources);
      setArtifacts(artifactData?.artifacts ?? []);
      setArtifactStoreAvailable(artifactData !== null);
      setQueueStatus(statusData);
      setQuotaStatus(quotaData);
      setQuotaCalls(quotaCallData);
      setTavilyCreditStatus(tavilyData);
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

  async function runRuntimeCapabilityDiagnostic() {
    setBusy("runtime-capabilities");
    setMessage("");
    try {
      const response = await fetch("/api/owner/runtime-capabilities", { cache: "no-store" });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const reason = payload && typeof payload === "object" && "reason_code" in payload
          ? String((payload as { reason_code: unknown }).reason_code)
          : "Runtime capability inspection failed (" + response.status + ").";
        throw new Error(reason);
      }
      setRuntimeCapabilities(payload as RuntimeCapabilities);
      setMessage("Eve's compiled Production tool definitions were inspected. Session-specific availability remains separate.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Runtime capability inspection failed.");
    } finally {
      setBusy(null);
    }
  }

  async function downloadArtifact(id: string) {
    setBusy("artifact-download");
    setMessage("");
    try {
      const result = await ownerRequest<{ artifact: ArtifactDetail }>("/v1/owner/artifacts/" + encodeURIComponent(id));
      const blob = new Blob([result.artifact.content], { type: result.artifact.media_type });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.artifact.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage("Artifact download started: " + result.artifact.filename);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not download artifact.");
    } finally {
      setBusy(null);
    }
  }

  async function deleteArtifact(id: string, name: string) {
    if (!window.confirm("Permanently delete the stored artifact “" + name + "”? This cannot be undone.")) return;
    await perform(id, "/v1/owner/artifacts/" + encodeURIComponent(id) + "/delete", "POST");
  }

  async function createTaskProposal() {
    setBusy("create-task");
    setMessage("");
    try {
      const result = await ownerRequest<{ task: Task; created: boolean }>("/v1/owner/tasks", "POST", {
        idempotency_key: "owner-console:" + crypto.randomUUID(),
        task_type: "verification",
        title: newTaskTitle.trim(),
        goal: newTaskGoal.trim(),
        approved_scope: newTaskScope.trim(),
      });
      await load();
      setMessage(result.created
        ? "Task proposal created. It remains unapproved and cannot run until you separately approve it."
        : "An existing task proposal with this idempotency key was returned. No duplicate was created.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create the task proposal.");
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
    setArtifacts([]);
    setArtifactStoreAvailable(true);
    setQueueStatus(null);
    setQuotaStatus(null);
    setTavilyCreditStatus(null);
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
                    <span className="text-sm font-medium">{check.status === null ? (check.error_code ?? "No response") : "HTTP " + check.status + (check.error_code ? " · " + check.error_code : check.status >= 200 && check.status < 300 ? " · OK" : " · HTTP error")}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {check.elapsed_ms} ms{check.cf_ray ? " · Cloudflare trace " + check.cf_ray : ""}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {authenticated && (
        <section className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
          <div className="space-y-1">
            <h2 className="font-semibold">Production runtime tool inventory</h2>
            <p className="text-sm text-muted-foreground">Reads Eve's authenticated /eve/v1/info inspection endpoint through Vercel OIDC. It reports compiled static tool definitions and dynamic resolvers without exposing instructions, schemas, credentials, or source contents. This is read-only and does not invoke any tool or change state.</p>
          </div>
          <button type="button" onClick={() => void runRuntimeCapabilityDiagnostic()} disabled={busy !== null} className="rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50">
            {busy === "runtime-capabilities" ? "Inspecting Production…" : "Inspect Production tool inventory"}
          </button>
          {runtimeCapabilities && (
            <div className="space-y-3" aria-live="polite">
              <p className="text-xs text-muted-foreground">
                Checked {new Date(runtimeCapabilities.checked_at).toLocaleString()} · {runtimeCapabilities.environment} · {runtimeCapabilities.agent_name} · {runtimeCapabilities.model_id}
              </p>
              <p className="text-sm font-medium">
                {runtimeCapabilities.static_tools.length} static tool definitions · {runtimeCapabilities.dynamic_tool_resolvers.length} dynamic tool resolvers · agent-info v{runtimeCapabilities.agent_info_version ?? "unknown"}
              </p>
              {runtimeCapabilities.discovery_errors !== null && runtimeCapabilities.discovery_errors > 0 && <p className="text-sm">Discovery errors: {runtimeCapabilities.discovery_errors}</p>}
              {runtimeCapabilities.discovery_warnings !== null && runtimeCapabilities.discovery_warnings > 0 && <p className="text-sm">Discovery warnings: {runtimeCapabilities.discovery_warnings}</p>}
              <div className="space-y-2">
                {runtimeCapabilities.static_tools.map(tool => (
                  <article key={tool.name} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong className="text-sm">{tool.name}</strong>
                      <span className="text-xs text-muted-foreground">{tool.owner} · {tool.source_kind}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{tool.source}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {tool.has_execute ? "Execute handler present" : "No execute handler"} · {tool.requires_approval ? "Approval required" : "No static approval flag"} · {tool.has_auth ? "Auth resolver present" : "No auth resolver"}
                    </p>
                  </article>
                ))}
              </div>
              {runtimeCapabilities.dynamic_tool_resolvers.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Dynamic tool resolvers</h3>
                  {runtimeCapabilities.dynamic_tool_resolvers.map(item => (
                    <p key={item.slug} className="text-sm">{item.slug} <span className="text-xs text-muted-foreground">· {item.source}</span></p>
                  ))}
                </div>
              )}
              {(runtimeCapabilities.disabled_definitions.length > 0 || runtimeCapabilities.shadowed_definitions.length > 0) && (
                <div className="space-y-1 text-sm">
                  {runtimeCapabilities.disabled_definitions.length > 0 && <p>Disabled: {runtimeCapabilities.disabled_definitions.join(", ")}</p>}
                  {runtimeCapabilities.shadowed_definitions.length > 0 && <p>Shadowed: {runtimeCapabilities.shadowed_definitions.join(", ")}</p>}
                </div>
              )}
              <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                {runtimeCapabilities.limitations.map(item => <li key={item}>{item}</li>)}
              </ul>
            </div>
          )}
        </section>
      )}

      {loaded && (
        <>
          {quotaStatus && (
            <section className="space-y-2 rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold">Workers AI neuron budget</h2>
                <span className="text-xs font-medium">{quotaStatus.circuit_open ? "Provider circuit open" : quotaStatus.model_calls_allowed ? "Model calls permitted by local ledger" : "Paused by local quota guard"}</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {quotaStatus.local_estimated_neurons.toLocaleString()} locally estimated · {quotaStatus.active_reserved_neurons.toLocaleString()} reserved · {quotaStatus.remaining_to_target.toLocaleString()} remaining to Eve's {quotaStatus.target_neurons.toLocaleString()} target
              </p>
              <p className="text-xs text-muted-foreground">
                Source: local model estimate, not Cloudflare's live account meter. The target leaves a {quotaStatus.protected_reserve_neurons.toLocaleString()}-neuron buffer below the published free allocation; other account usage is not included. UTC day: {quotaStatus.day}.
              </p>
              {quotaStatus.updated_at && <p className="text-xs text-muted-foreground">Last local ledger update: {new Date(quotaStatus.updated_at).toLocaleString()}</p>}
              {quotaStatus.circuit_open && <p className="text-sm">A confirmed provider quota error opened the safety circuit. This cannot be cleared by changing local estimates.</p>}
              <div className="space-y-2 border-t pt-3">
                <h3 className="text-sm font-semibold">Settled model calls · {quotaCalls?.day ?? quotaStatus.day}</h3>
                {quotaCalls ? (
                  <>
                    <p className="text-xs text-muted-foreground">{quotaCalls.count} recorded call(s) · up to {quotaCalls.retention_days} days retained. Per-call estimates are not provider telemetry.</p>
                    {quotaCalls.calls.length > 0 ? (
                      <div className="space-y-2">
                        {quotaCalls.calls.map(call => (
                          <div key={call.reservation_id} className="rounded-lg border p-3 text-xs">
                            <div className="flex flex-wrap justify-between gap-2">
                              <span className="font-medium">{new Date(call.settled_at).toLocaleString()}</span>
                              <span className="font-semibold">{call.estimated_neurons.toLocaleString()} estimated neurons</span>
                            </div>
                            <p className="mt-1 text-muted-foreground">{call.model_id} · input {call.input_tokens?.toLocaleString() ?? "unknown"} / output {call.output_tokens?.toLocaleString() ?? "unknown"} tokens</p>
                            <p className="mt-1 break-words text-muted-foreground">Accounting: {call.accounting_source} · {call.settlement_reason}</p>
                          </div>
                        ))}
                      </div>
                    ) : <p className="text-xs text-muted-foreground">No settled calls recorded for this UTC day.</p>}
                    <p className="text-xs text-muted-foreground">Ledger source: {quotaCalls.source}</p>
                  </>
                ) : <p className="text-xs text-muted-foreground">Quota call history is currently unavailable. Refresh reviews to retry.</p>}
              </div>
            </section>
          )}
          <section className="space-y-2 rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">Tavily monthly research credits</h2>
              <span className="text-xs font-medium">{tavilyCreditStatus ? tavilyCreditStatus.month : "Status unavailable"}</span>
            </div>
            {tavilyCreditStatus ? (
              <>
                <p className="text-sm text-muted-foreground">
                  {tavilyCreditStatus.used_credits.toLocaleString()} settled · {tavilyCreditStatus.reserved_credits.toLocaleString()} reserved · {tavilyCreditStatus.remaining_budget.toLocaleString()} remaining of {tavilyCreditStatus.monthly_limit.toLocaleString()} Eve-budget credits
                </p>
                <p className="text-sm text-muted-foreground">
                  {tavilyCreditStatus.outstanding_reservations.toLocaleString()} outstanding reservation(s)
                  {tavilyCreditStatus.oldest_outstanding_reservation_at ? " · Oldest: " + new Date(tavilyCreditStatus.oldest_outstanding_reservation_at).toLocaleString() : ""}
                </p>
                {tavilyCreditStatus.updated_at && <p className="text-xs text-muted-foreground">Last settlement update: {new Date(tavilyCreditStatus.updated_at).toLocaleString()}</p>}
                <p className="text-xs text-muted-foreground">Source: Eve's Cloudflare Durable Object ledger ({tavilyCreditStatus.source}). This is not Tavily account-wide usage; manual searches and other API keys/apps are excluded. The 200-credit headroom below the advertised 1,000-credit free allowance is a buffer, not an account-wide provider limit.</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Could not load the owner-only Tavily ledger status. Use Refresh reviews to retry. No search or ledger mutation is performed by this panel.</p>
            )}
          </section>
          {queueStatus && (
            <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
              <div className="space-y-1">
                <p className="font-semibold">Background task queue: {queueStatus.queue_paused ? "Paused" : "Active"}</p>
                <p className="text-sm text-muted-foreground">
                  {queueStatus.running_tasks} running · {queueStatus.queued_tasks} queued (owner-approved or approved-goal)
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
          <section className="space-y-3 rounded-xl border bg-card p-4">
            <div className="space-y-1">
              <h2 className="font-semibold">Propose a new task</h2>
              <p className="text-sm text-muted-foreground">Creates a proposed record only. New tasks are always unapproved, not queued, and cannot run until you review and approve them separately.</p>
            </div>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Task title</span>
              <input value={newTaskTitle} onChange={event => setNewTaskTitle(event.target.value)} maxLength={200} disabled={busy !== null} className="min-h-10 rounded-lg border bg-background px-3 py-2" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Goal</span>
              <textarea value={newTaskGoal} onChange={event => setNewTaskGoal(event.target.value)} maxLength={1000} rows={3} disabled={busy !== null} className="rounded-lg border bg-background px-3 py-2" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Requested scope and safety limits</span>
              <textarea value={newTaskScope} onChange={event => setNewTaskScope(event.target.value)} maxLength={2000} rows={4} disabled={busy !== null} className="rounded-lg border bg-background px-3 py-2" />
            </label>
            <button type="button" disabled={busy !== null || !newTaskTitle.trim() || !newTaskGoal.trim() || !newTaskScope.trim()} onClick={() => void createTaskProposal()} className="rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50">
              {busy === "create-task" ? "Creating proposal…" : "Create unapproved task proposal"}
            </button>
          </section>
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
                  <p className="mt-2 text-xs text-muted-foreground">Current classification: {task.scope_id || "owner_review_required"}</p>
                </div>
                {task.checkpoint_summary && (
                  <section aria-label="Task checkpoint and recovery diagnostics" className="space-y-2 rounded-lg border border-amber-500/30 bg-muted/40 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {task.checkpoint_summary.startsWith("Automatic safety checkpoint:") ? "Automatic recovery checkpoint · diagnostic evidence" : "Checkpoint"}
                    </p>
                    <p className="break-words text-sm text-muted-foreground">{task.checkpoint_summary}</p>
                  </section>
                )}
                {task.result_summary && <p className="text-sm text-muted-foreground">Result: {task.result_summary}</p>}
                <p className="text-xs text-muted-foreground">Steps: {task.step_count}/{task.max_steps} · stale retries: {task.attempt_count}/{task.max_attempts} · {task.mission_authorized ? "Blocked: legacy authorization" : task.owner_approved ? "Owner approved" : task.goal_id === "ebay-inventory-audit-development" && task.scope_id === "ebay_inventory_audit_development" ? "Approved goal: eBay inventory-audit development" : "Awaiting owner approval"} · ID {task.id}</p>
                <div className="flex flex-wrap gap-2">
                  {task.status === "proposed" && (
                    <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-end">
                      <label className="flex flex-1 flex-col gap-1 text-sm">
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Owner-approved task scope</span>
                        <select
                          value={selectedTaskScopes[task.id] ?? "owner_review_required"}
                          onChange={event => setSelectedTaskScopes(current => ({ ...current, [task.id]: event.target.value }))}
                          disabled={busy !== null}
                          className="min-h-10 rounded-lg border bg-background px-3 py-2 text-sm"
                        >
                          <option value="owner_review_required">General owner approval only (no provider scope)</option>
                          <option value="product_development">Product development</option>
                          <option value="testing">Testing</option>
                          <option value="documentation">Documentation</option>
                          <option value="market_research">Market research</option>
                        </select>
                      </label>
                      <button type="button" disabled={busy !== null} onClick={() => void perform(task.id, "/v1/tasks/" + task.id + "/approve", "POST", { scope_id: selectedTaskScopes[task.id] ?? "owner_review_required" })} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
                        Approve with selected scope
                      </button>
                    </div>
                  )}
                  {["queued", "running", "waiting"].includes(task.status) && (
                    <button type="button" disabled={busy !== null} onClick={() => void perform(task.id, "/v1/tasks/" + task.id + "/owner-control", "POST", { action: "pause" })} className="rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50">
                      Pause
                    </button>
                  )}
                  {task.status === "waiting" && !task.mission_authorized && (task.owner_approved || (task.goal_id === "ebay-inventory-audit-development" && task.scope_id === "ebay_inventory_audit_development")) && (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => {
                        if (window.confirm("Move this exact waiting, authorized task back to the queue? Its checkpoint, evidence, and approved scope will be preserved. No other task will be changed.")) {
                          void perform(task.id, "/v1/tasks/" + task.id + "/owner-control", "POST", { action: "resume" });
                        }
                      }}
                      className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                    >
                      {busy === task.id ? "Resuming…" : "Resume this task now"}
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
              <h2 className="text-xl font-semibold">Durable artifacts</h2>
              <span className="text-sm text-muted-foreground">{artifacts.length} stored</span>
            </div>
            <p className="text-sm text-muted-foreground">Validated HTML deliverables saved by Eve. Only the verified owner can list, download, or delete them; there are no public artifact links.</p>
            {!artifactStoreAvailable && <p role="status" className="rounded-lg border bg-muted p-3 text-sm">Artifact storage is not available from the Worker yet. Deploy the matching Worker update before using this section. Other Owner Console controls remain available.</p>}
            {artifacts.length === 0 && <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">No stored artifacts yet.</p>}
            {artifacts.map(artifact => (
              <article key={artifact.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
                <div className="min-w-0 space-y-1">
                  <h3 className="font-semibold">{artifact.name}</h3>
                  <p className="text-xs text-muted-foreground">{artifact.filename} · {artifact.bytes.toLocaleString()} bytes · {new Date(artifact.created_at).toLocaleString()}</p>
                  <p className="break-all text-xs text-muted-foreground">ID {artifact.id}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={busy !== null} onClick={() => void downloadArtifact(artifact.id)} className="rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50">
                    {busy === "artifact-download" ? "Preparing…" : "Download"}
                  </button>
                  <button type="button" disabled={busy !== null} onClick={() => void deleteArtifact(artifact.id, artifact.name)} className="rounded-lg border border-destructive px-3 py-2 text-sm font-medium text-destructive disabled:opacity-50">
                    Delete
                  </button>
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
