"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { clearAgentCredentials, setAgentCredentials } from "@/app/agent-auth";

function encodeBasic(username: string, password: string) {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `Basic ${btoa(binary)}`;
}

export function AgentAccess({ children }: { readonly children: ReactNode }) {
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);

    const data = new FormData(event.currentTarget);
    const username = String(data.get("username") ?? "").trim();
    const password = String(data.get("password") ?? "");
    if (!username || !password) {
      setError("Enter your username and password.");
      setBusy(false);
      return;
    }

    try {
      const response = await fetch("/eve/v1/info", {
        headers: { authorization: encodeBasic(username, password) },
        cache: "no-store",
      });
      if (!response.ok) {
        setError(response.status === 401 ? "That username or password was not accepted." : "Sign-in could not be verified. Try again.");
        setBusy(false);
        return;
      }
      setAgentCredentials({ username, password });
      setSignedIn(true);
    } catch {
      setError("Could not reach the sign-in service. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!signedIn) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-5 py-10 text-foreground">
        <form onSubmit={signIn} className="w-full max-w-sm space-y-5 rounded-2xl border bg-card p-6 shadow-sm">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">Autonomous Dev AI</h1>
            <p className="text-sm text-muted-foreground">Sign in to your private development workspace.</p>
          </div>
          <label className="block space-y-2 text-sm font-medium">
            Username
            <input name="username" autoComplete="username" required className="w-full rounded-lg border bg-background px-3 py-3 text-base font-normal outline-none focus:ring-2 focus:ring-ring" />
          </label>
          <label className="block space-y-2 text-sm font-medium">
            Password
            <input name="password" type="password" autoComplete="current-password" required className="w-full rounded-lg border bg-background px-3 py-3 text-base font-normal outline-none focus:ring-2 focus:ring-ring" />
          </label>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <button type="submit" disabled={busy} className="w-full rounded-lg bg-primary px-4 py-3 text-base font-medium text-primary-foreground disabled:opacity-60">
            {busy ? "Verifying…" : "Sign in"}
          </button>
          <p className="text-xs leading-relaxed text-muted-foreground">Your credentials stay in this browser tab's memory and are requested again after a refresh or when you close the tab.</p>
        </form>
      </main>
    );
  }

  return (
    <>
      {children}
      <button
        type="button"
        onClick={() => {
          clearAgentCredentials();
          setSignedIn(false);
        }}
        className="fixed top-3 left-3 z-50 rounded-md border bg-background/90 px-3 py-2 text-xs text-muted-foreground shadow-sm backdrop-blur"
      >
        Sign out
      </button>
    </>
  );
}
