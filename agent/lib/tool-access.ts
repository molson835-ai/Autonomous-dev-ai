import { env } from "node:process";

type AuthPrincipal = {
  authenticator?: string;
  principalType?: string;
  principalId?: string;
} | null | undefined;

type ToolAccessContext = {
  session: {
    auth?: { current?: AuthPrincipal };
    schedule?: unknown;
  };
  turn?: { input?: unknown } | null;
};

function collectText(value: unknown, depth = 0): string {
  if (depth > 6 || value == null) return "";
  if (typeof value === "string") return value.slice(0, 20_000);
  if (Array.isArray(value)) return value.slice(0, 30).map(item => collectText(item, depth + 1)).join("\n");
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>)
      .slice(0, 30)
      .map(item => collectText(item, depth + 1))
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

/** Fail closed for an explicitly read-only current turn, regardless of caller role. */
export function isExplicitReadOnlyTurn(input: unknown): boolean {
  const text = collectText(input);
  return /\bread[\s-]?only\b|\bno\s+(?:writes?|writing|mutations?|changes?)\b|\bdo\s+not\s+(?:write|save|record|modify|change|create|persist)\b|\bdon['’]t\s+(?:write|save|record|modify|change|create|persist)\b|\bwithout\s+(?:writing|saving|recording|modifying|changing|persisting)\b/i.test(text);
}

/**
 * Stateful tools are available only to the verified owner, trusted Vercel
 * service calls, or scheduled invocations. Anonymous chat remains read-only.
 * The current turn's explicit read-only request always wins.
 */
export function canUseWriteTools(context: ToolAccessContext): boolean {
  if (isExplicitReadOnlyTurn(context.turn?.input)) return false;

  const principal = context.session.auth?.current;
  const ownerId = env.OWNER_GITHUB_ID;
  const verifiedOwner =
    principal?.authenticator === "github-owner" &&
    principal.principalType === "user" &&
    !!ownerId &&
    principal.principalId === ownerId;

  const trustedService = principal?.principalType === "service";
  const scheduledInvocation = context.session.schedule !== undefined && context.session.schedule !== null;

  return verifiedOwner || trustedService || scheduledInvocation;
}
