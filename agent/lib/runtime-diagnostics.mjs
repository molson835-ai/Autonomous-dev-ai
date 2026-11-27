export const SOURCE_DEFINED_TOOL_NAMES = Object.freeze([
  "assess_service_opportunity",
  "create_artifact",
  "create_csv_artifact",
  "data_workbench",
  "discover_resources",
  "evaluate_opportunity",
  "get_artifact",
  "memory_decide",
  "memory_propose",
  "memory_recall",
  "memory_record_experience",
  "memory_review",
  "plan_task_skills",
  "propose_tool",
  "report_capability_benchmark",
  "repository_readonly",
  "research_opportunity_evidence",
  "research_revenue_opportunity",
  "research_sources",
  "research_web",
  "runtime_diagnostics",
  "search_news",
  "skill_library",
  "task_claim_next",
  "task_heartbeat",
  "task_list",
  "task_propose",
  "task_transition",
]);

export function latestUserMessage(messages) {
  if (!Array.isArray(messages)) return null;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") return messages[index];
  }
  return null;
}

export const DYNAMICALLY_GATED_TOOL_NAMES = Object.freeze([
  "create_artifact",
  "discover_resources",
  "memory_propose",
  "memory_record_experience",
  "propose_tool",
  "task_claim_next",
  "task_heartbeat",
  "task_propose",
  "task_transition",
]);

export function buildRuntimeDiagnostic({
  principal,
  ownerGithubId,
  vercelEnv,
  readOnlyTurn,
  writeToolsAllowed,
  toolName,
}) {
  const principalId = typeof principal?.principalId === "string" ? principal.principalId : null;
  const verifiedOwner = Boolean(
    principal?.authenticator === "github-owner" &&
    principal?.principalType === "user" &&
    ownerGithubId &&
    principalId === ownerGithubId
  );

  return {
    diagnosticVersion: 1,
    invokedTool: toolName ?? "unknown",
    identity: {
      authenticated: Boolean(principal),
      authenticator: principal?.authenticator ?? null,
      issuer: principal?.issuer ?? null,
      principalType: principal?.principalType ?? null,
      role: principal?.attributes?.role ?? null,
      verifiedGithubOwner: verifiedOwner,
      principalId: "[redacted]",
    },
    permissions: {
      vercelEnvironment: vercelEnv ?? "unset",
      explicitReadOnlyTurn: Boolean(readOnlyTurn),
      statefulToolsAllowedForThisTurn: Boolean(writeToolsAllowed),
      dynamicallyGatedTools: DYNAMICALLY_GATED_TOOL_NAMES.map(name => ({
        name,
        status: writeToolsAllowed ? "gate-allows" : "withheld-by-gate",
      })),
      ownerMemoryDecisionTool: "disabled-inside-Eve",
    },
    inventory: {
      sourceDefinedToolNames: [...SOURCE_DEFINED_TOOL_NAMES],
      sourceDefinedToolCount: SOURCE_DEFINED_TOOL_NAMES.length,
      effectiveRuntimeToolManifest: "unavailable-through-documented-ToolContext",
      note: "This source list is not proof that every tool is registered or available in this live session. This invocation proves only that the reported diagnostic tool itself was callable.",
    },
    integrations: {
      probesPerformed: [],
      status: "not-tested",
      note: "This diagnostic performs no network requests. Integration health must be tested separately with bounded read-only checks.",
    },
  };
}
