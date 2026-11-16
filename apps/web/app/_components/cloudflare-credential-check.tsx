"use client";

import { useState, type FormEvent } from "react";

type ResultState = "idle" | "checking" | "success" | "failure";
type CloudflareError = { code?: number; extensionCode?: string | number; message?: string };
type CheckResult = {
  ok?: boolean;
  credential?: string;
  permission?: string;
  error?: string;
  tokenStatus?: string;
  verificationHttpStatus?: number;
  graphqlHttpStatus?: number;
  cloudflareErrors?: CloudflareError[];
};

const safeMessages: Record<string, string> = {
  unauthorized: "The diagnostic token was not accepted. Check that EVE_DIAGNOSTIC_TOKEN is set for this deployment.",
  production_environment_incomplete: "This deployment is missing CLOUDFLARE_API_TOKEN or a valid CLOUDFLARE_ACCOUNT_ID.",
  cloudflare_token_verification_failed: "Cloudflare rejected the token verification request for the configured account. The details below identify the response.",
  cloudflare_token_inactive: "Cloudflare verified the token, but reports that it is not active.",
  cloudflare_permission_denied: "The token is active, but Cloudflare denied access to the account analytics dataset.",
  analytics_query_rejected: "Cloudflare accepted the token but rejected the analytics query or one of its requested fields.",
  cloudflare_account_not_available: "Cloudflare did not return the configured account or its analytics data.",
  cloudflare_graphql_error: "Cloudflare returned a GraphQL error. Review the safe error details below.",
  cloudflare_graphql_http_error: "Cloudflare returned an HTTP error for the GraphQL analytics request.",
  cloudflare_invalid_response: "Cloudflare returned a response that was not valid JSON.",
  analytics_result_invalid: "Cloudflare responded, but the analytics result did not match the expected structure.",
  cloudflare_request_timeout: "The Cloudflare request timed out.",
  cloudflare_network_error: "This deployment could not complete its connection to Cloudflare.",
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
      setMessage("Enter the diagnostic token from this Vercel deployment.");
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

      if (response.ok && result.ok === true && result.credential === "valid" && result.permission === "analytics_read") {
        setMessage("Verified: this deployment’s Cloudflare token is active and can read account AI analytics.");
        setState("success");
      } else {
        setMessage(safeMessages[result.error ?? ""] ?? "The credential check could not be completed. Review any safe Cloudflare response details below.");
        setState("failure");
      }
    } catch {
      setMessage("Could not reach the diagnostic endpoint. Check your connection and try again.");
      setDetails(null);
      setState("failure");
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl items-center px-5 py-12">
      <section className="w-full rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">EVE · Owner tools</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Cloudflare credential check</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          This one-time check verifies the Cloudflare API token stored in this Vercel deployment. It first checks token status for the configured account, then tests the same AI analytics dataset used by EVE’s quota guard. It does not run AI inference, change settings, or consume Workers AI neurons.
        </p>

        <form className="mt-7 space-y-4" onSubmit={runCheck}>
          <label className="block text-sm font-medium" htmlFor="diagnostic-token">EVE_DIAGNOSTIC_TOKEN</label>
          <input
            id="diagnostic-token"
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            inputMode="text"
            placeholder="Paste the token from Vercel"
            className="w-full rounded-lg border bg-background px-3 py-3 text-base outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
            disabled={state === "checking"}
          />
          <button type="submit" disabled={state === "checking" || token.trim().length < 32} className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">
            {state === "checking" ? "Checking…" : "Run read-only check"}
          </button>
        </form>

        {message ? (
          <div role="status" aria-live="polite" className={`mt-5 rounded-lg border p-3 text-sm leading-6 ${state === "success" ? "border-emerald-500/40 bg-emerald-500/10" : "border-destructive/40 bg-destructive/5"}`}>
            <p>{message}</p>
            {details ? (
              <dl className="mt-3 space-y-1 text-xs">
                {details.tokenStatus ? <div><dt className="inline font-semibold">Token status: </dt><dd className="inline">{details.tokenStatus}</dd></div> : null}
                {typeof details.verificationHttpStatus === "number" ? <div><dt className="inline font-semibold">Token verification HTTP: </dt><dd className="inline">{details.verificationHttpStatus}</dd></div> : null}
                {typeof details.graphqlHttpStatus === "number" ? <div><dt className="inline font-semibold">Analytics HTTP: </dt><dd className="inline">{details.graphqlHttpStatus}</dd></div> : null}
                {details.error ? <div><dt className="inline font-semibold">Diagnostic code: </dt><dd className="inline">{details.error}</dd></div> : null}
              </dl>
            ) : null}
            {details?.cloudflareErrors?.length ? (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-xs">
                {details.cloudflareErrors.map((item, index) => (
                  <li key={index}>
                    {item.code !== undefined ? `Code ${item.code}: ` : ""}
                    {item.extensionCode !== undefined ? `(${item.extensionCode}) ` : ""}
                    {item.message ?? "Cloudflare returned an unspecified error."}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <p className="mt-6 text-xs leading-5 text-muted-foreground">
          The diagnostic token is held only in this page’s temporary input state, cleared before the request, and sent to this deployment over HTTPS. It is never saved in browser storage or displayed in the result. Cloudflare response details are limited and redacted server-side.
        </p>
      </section>
    </main>
  );
}