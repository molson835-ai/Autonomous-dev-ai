"use client";

import { useState, type FormEvent } from "react";

type ResultState = "idle" | "checking" | "success" | "failure";
type DiagnosticError = { code?: number; extensionCode?: string | number; message?: string };
type TestResult = {
  name: string;
  status: "pass" | "fail";
  httpStatus?: number;
  code?: string;
  details?: Record<string, unknown>;
  errors?: DiagnosticError[];
};
type CheckResult = {
  ok?: boolean;
  error?: string;
  tokenStatus?: string;
  verificationHttpStatus?: number;
  tests?: TestResult[];
  note?: string;
  cloudflareErrors?: DiagnosticError[];
};

const labels: Record<string, string> = {
  account_lookup: "1. GraphQL account lookup (no product dataset)",
  schema_introspection: "2. Schema introspection (is the AI analytics field exposed?)",
  dataset_settings: "3a. Dataset settings (enabled and available fields)",
  quota_guard_query: "3b. Exact daily query used by EVE’s quota guard",
};
const messages: Record<string, string> = {
  unauthorized: "The diagnostic token was not accepted. Check the EVE_DIAGNOSTIC_TOKEN configured for this deployment.",
  production_environment_incomplete: "The Production deployment is missing a required Cloudflare environment variable.",
  token_verification_failed: "Cloudflare did not verify the configured token as active for the configured account.",
  cloudflare_request_timeout: "A Cloudflare request timed out. No inference was run.",
  cloudflare_network_error: "The diagnostic could not complete its connection to Cloudflare. No inference was run.",
};

export default function CloudflareCredentialCheck() {
  const [token, setToken] = useState("");
  const [state, setState] = useState<ResultState>("idle");
  const [message, setMessage] = useState("");
  const [details, setDetails] = useState<CheckResult | null>(null);

  async function runCheck(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const suppliedToken = token.trim();
    if (suppliedToken.length < 32) {
      setMessage("Enter the diagnostic token from Vercel.");
      setDetails(null);
      setState("failure");
      return;
    }
    setToken("");
    setMessage("");
    setDetails(null);
    setState("checking");
    try {
      const response = await fetch("/api/internal/cloudflare-credential-check", {
        method: "POST",
        headers: { Authorization: `Bearer ${suppliedToken}` },
        cache: "no-store",
        credentials: "same-origin",
      });
      const result: CheckResult = await response.json();
      setDetails(result);
      if (response.ok && result.ok === true) {
        setMessage("All Cloudflare read-only diagnostic tests passed. EVE’s analytics credential path is working.");
        setState("success");
      } else if (result.tests?.length) {
        setMessage("The diagnostic completed. Review each independent test below; failures are isolated and do not imply that the other tests failed.");
        setState("failure");
      } else {
        setMessage(messages[result.error ?? ""] ?? "The diagnostic could not complete. Review the response details below.");
        setState("failure");
      }
    } catch {
      setMessage("Could not reach the diagnostic endpoint. No inference was run.");
      setDetails(null);
      setState("failure");
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl items-center px-5 py-12">
      <section className="w-full rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">EVE · Owner tools</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Cloudflare GraphQL diagnostics</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Runs separate read-only requests using the Cloudflare token stored in this Vercel deployment: token verification, account lookup, schema introspection, dataset settings, and the exact daily analytics query used by EVE’s quota guard. It does not run inference, reserve neurons, or change Cloudflare settings.
        </p>
        <form className="mt-7 space-y-4" onSubmit={runCheck}>
          <label className="block text-sm font-medium" htmlFor="diagnostic-token">EVE_DIAGNOSTIC_TOKEN</label>
          <input id="diagnostic-token" type="password" value={token}
            onChange={(event) => setToken(event.target.value)} autoComplete="off"
            autoCapitalize="none" spellCheck={false} inputMode="text"
            placeholder="Paste the token from Vercel"
            className="w-full rounded-lg border bg-background px-3 py-3 text-base outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
            disabled={state === "checking"} />
          <button type="submit" disabled={state === "checking" || token.trim().length < 32}
            className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">
            {state === "checking" ? "Running separate read-only tests…" : "Run Cloudflare diagnostics"}
          </button>
        </form>

        {message ? (
          <div role="status" aria-live="polite" className={`mt-5 rounded-lg border p-3 text-sm leading-6 ${state === "success" ? "border-emerald-500/40 bg-emerald-500/10" : "border-destructive/40 bg-destructive/5"}`}>
            <p>{message}</p>
            {details?.tokenStatus ? <p className="mt-2 text-xs">Token status: <strong>{details.tokenStatus}</strong></p> : null}
            {typeof details?.verificationHttpStatus === "number" ? <p className="text-xs">Token verification HTTP: {details.verificationHttpStatus}</p> : null}
            {details?.tests?.length ? (
              <ol className="mt-4 space-y-3">
                {details.tests.map((test) => (
                  <li key={test.name} className="rounded-md border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-xs font-semibold">{labels[test.name] ?? test.name}</p>
                      <span className={test.status === "pass" ? "text-xs font-bold text-emerald-600" : "text-xs font-bold text-destructive"}>{test.status.toUpperCase()}</span>
                    </div>
                    {typeof test.httpStatus === "number" ? <p className="mt-1 text-xs text-muted-foreground">HTTP {test.httpStatus}</p> : null}
                    {test.code ? <p className="mt-1 text-xs">Diagnostic: <code>{test.code}</code></p> : null}
                    {test.details ? <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-xs text-muted-foreground">{JSON.stringify(test.details, null, 2)}</pre> : null}
                    {test.errors?.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">{test.errors.map((error, index) => <li key={index}>{error.code !== undefined ? `Code ${error.code}: ` : ""}{error.extensionCode !== undefined ? `(${error.extensionCode}) ` : ""}{error.message ?? "Unspecified Cloudflare error."}</li>)}</ul> : null}
                  </li>
                ))}
              </ol>
            ) : null}
            {details?.cloudflareErrors?.length ? <ul className="mt-2 list-disc pl-5 text-xs">{details.cloudflareErrors.map((error, index) => <li key={index}>{error.message}</li>)}</ul> : null}
          </div>
        ) : null}

        <p className="mt-6 text-xs leading-5 text-muted-foreground">
          The diagnostic token is held only in temporary page state, cleared before the request, and sent over HTTPS. It is never saved in browser storage or displayed in results. Cloudflare error details are redacted server-side. Each GraphQL test is a separate request so a failure in one does not hide the others.
        </p>
      </section>
    </main>
  );
}
