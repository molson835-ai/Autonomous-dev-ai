import { env } from "node:process";

type AuthPrincipal = {
  authenticator?: string;
  principalType?: string;
  principalId?: string;
} | null | undefined;

type ToolAccessContext = {
  session: {
    auth?: { current?: AuthPrincipal };
    schedule?: { definition?: string } | null;
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

/**
 * Fail closed for an explicitly read-only current turn, regardless of caller
 * role. A prohibition scoped to other/another/unrelated resources must not
 * suppress a separately authorized, bounded operation on the named resource.
 */
export function isExplicitReadOnlyTurn(input: unknown): boolean {
  const text = collectText(input);
  const absoluteReadOnly =
    /\\bread[\\s-]?only\\b|\\bno\\s+(?:writes?|writing|mutations?|changes?)\\b|\\bwithout\\s+(?:writing|saving|recording|modifying|changing|persisting)\\b/i;

  if (absoluteReadOnly.test(text)) return true;

  const prohibitedWrite =
    /\\bdo\\s+not\\s+(?:write|save|record|modify|change|create|persist)\\b|\\bdon['’]t\\s+(?:write|save|record|modify|change|create|persist)\\b/i;

  return text
    .split(/(?<=[.!?])\\s+|\\n+/)
    .some(sentence =>
      prohibitedWrite.test(sentence) && !/\\b(?:another|other|unrelated)\\b/i.test(sentence)
    );
}

/**
 * Stateful tools are available only to the verified owner, trusted Vercel
 * service calls, or Eve's one explicitly authorized scheduled work loop.
 * The current turn's explicit read-only request always wins.
 */
export function canUseWriteTools(context: ToolAccessContext): boolean {
  if (isExplicitReadOnlyTurn(context.turn?.input)) return false;
  // Preview and local deployments must never write to shared Production services.
  if (env.VERCEL_ENV !== "production") return false;

  const principal = context.session.auth?.current;
  const ownerId = env.OWNER_GITHUB_ID;
  const verifiedOwner =
    principal?.authenticator === "github-owner" &&
    principal.principalType === "user" &&
    !!ownerId &&
    principal.principalId === ownerId;

  const trustedService = principal?.principalType === "service";
  // The schedule name is framework-owned provenance. Require the framework's
  // app principal too; schedule metadata by itself is not authorization.
  const scheduledOwnerWorkLoop =
    context.session.schedule?.definition === "owner-approved-work-loop" &&
    principal?.authenticator === "app" &&
    principal.principalId === "eve:app" &&
    principal.principalType === "runtime";

  return verifiedOwner || trustedService || scheduledOwnerWorkLoop;
}
