"use client";

import { useState, type FormEvent } from "react";

type ResultState = "idle" | "checking" | "success" | "failure";

export default function CloudflareCredentialCheck() {
  const [token, setToken] = useState("");
  const [state, setState] = useState<ResultState>("idle");
  const [message, setMessage] = useState("");

  async function runCheck(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const suppliedToken = token.trim();
    if (suppliedToken.length < 32) {
      setMessage("Enter the diagnostic token from the Vercel Preview environment.");
      setState("failure");
      return;
    }

    // Keep the secret only in component memory and clear the input before sending.
    setToken("");
    setMessage("");
    setState("checking");

    try {
      const response = await fetch("/api/internal/cloudflare-credential-check", {
        method: "POST",
        headers: { Authorization: `Bearer ${suppliedToken}` },
        cache: "no-store",
        credentials: "same-origin",
      });
      const result: { ok?: boolean; credential?: string; permission?: string; error?: string } =
        await response.json();

      if (response.ok && result.ok === true &&
          result.credential === "valid" && result.permission === "analytics_read") {
        setMessage("Verified: the Vercel-held Cloudflare token can read account AI analytics.");
        setState("success");
      } else if (response.status === 401) {
        setMessage("The diagnostic token was not accepted. Check that EVE_DIAGNOSTIC_TOKEN is set for Preview.");
        setState("failure");
      } else if (response.status === 503) {
        setMessage("The Preview runtime is missing a required Cloudflare environment variable.");
        setState("failure");
      } else {
        setMessage("The credential check could not be completed. No token or account details were returned.");
        setState("failure");
      }
    } catch {
      setMessage("Could not reach the diagnostic endpoint. Check your connection and try again.");
      setState("failure");
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl items-center px-5 py-12">
      <section className="w-full rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          EVE · Owner tools
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Cloudflare credential check</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          This one-time check verifies that the Cloudflare API token stored in this Vercel Preview
          can read AI analytics. It does not run AI inference, change settings, or consume Workers AI
          neurons.
        </p>

        <form className="mt-7 space-y-4" onSubmit={runCheck}>
          <label className="block text-sm font-medium" htmlFor="diagnostic-token">
            EVE_DIAGNOSTIC_TOKEN
          </label>
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
          <button
            type="submit"
            disabled={state === "checking" || token.trim().length < 32}
            className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {state === "checking" ? "Checking…" : "Run read-only check"}
          </button>
        </form>

        {message ? (
          <p
            role="status"
            aria-live="polite"
            className={`mt-5 rounded-lg border p-3 text-sm leading-6 ${
              state === "success"
                ? "border-emerald-500/40 bg-emerald-500/10"
                : "border-destructive/40 bg-destructive/5"
            }`}
          >
            {message}
          </p>
        ) : null}

        <p className="mt-6 text-xs leading-5 text-muted-foreground">
          The token is held only in this page’s temporary input state, cleared before the request,
          and sent directly to this Preview deployment over HTTPS. It is never saved in browser
          storage or displayed in the result.
        </p>
      </section>
    </main>
  );
}
