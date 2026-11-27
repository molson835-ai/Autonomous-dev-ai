export const REPOSITORY_READONLY_LIMITS: Readonly<{
  maxFilesPerCall: number;
  maxTreeEntries: number;
  maxFileBytes: number;
  maxFileChars: number;
  maxResponseBytes: number;
  timeoutMs: number;
}>;

export interface RepositoryReadOnlyInput {
  action: "metadata" | "tree" | "read_files" | "commit";
  paths?: string[];
  commitSha?: string;
}

export function runRepositoryReadOnly(
  input: RepositoryReadOnlyInput,
  fetchImpl?: typeof fetch,
): Promise<Record<string, unknown>>;
