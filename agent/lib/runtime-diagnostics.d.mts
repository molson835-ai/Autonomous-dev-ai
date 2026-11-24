export const SOURCE_DEFINED_TOOL_NAMES: readonly string[];
export const DYNAMICALLY_GATED_TOOL_NAMES: readonly string[];
export function latestUserMessage(messages: unknown): unknown;

export interface RuntimeDiagnosticInput {
  principal?: {
    authenticator?: string;
    issuer?: string;
    principalType?: string;
    principalId?: string;
    attributes?: { role?: string };
  } | null;
  ownerGithubId?: string;
  vercelEnv?: string;
  readOnlyTurn: boolean;
  writeToolsAllowed: boolean;
  toolName?: string;
}

export function buildRuntimeDiagnostic(input: RuntimeDiagnosticInput): {
  diagnosticVersion: number;
  invokedTool: string;
  identity: {
    authenticated: boolean;
    authenticator: string | null;
    issuer: string | null;
    principalType: string | null;
    role: string | null;
    verifiedGithubOwner: boolean;
    principalId: "[redacted]";
  };
  permissions: {
    vercelEnvironment: string;
    explicitReadOnlyTurn: boolean;
    statefulToolsAllowedForThisTurn: boolean;
    dynamicallyGatedTools: Array<{ name: string; status: string }>;
    ownerMemoryDecisionTool: string;
  };
  inventory: {
    sourceDefinedToolNames: string[];
    sourceDefinedToolCount: number;
    effectiveRuntimeToolManifest: string;
    note: string;
  };
  integrations: {
    probesPerformed: string[];
    status: string;
    note: string;
  };
};
