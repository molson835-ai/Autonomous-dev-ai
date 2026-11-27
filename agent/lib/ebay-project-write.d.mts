export interface CreateBranchInput {
  action: "create_branch";
  branchName: string;
  expectedBaseSha: string;
}
export interface WriteFileInput {
  action: "write_file";
  branchName: string;
  path: string;
  content: string;
  message: string;
  expectedHeadSha: string;
}
export interface OpenPullRequestInput {
  action: "open_pull_request";
  branchName: string;
  expectedHeadSha: string;
  title: string;
  body?: string;
}
export type EbayProjectWriteInput = CreateBranchInput | WriteFileInput | OpenPullRequestInput;
export function runEbayProjectWrite(
  input: EbayProjectWriteInput,
  token?: string,
  fetchImpl?: typeof fetch,
): Promise<Record<string, unknown>>;
export const EBayProjectWritePolicy: Readonly<{
  repository: string;
  branchPrefix: string;
  productPath: string;
  maxFileBytes: number;
  maxResponseBytes: number;
  timeoutMs: number;
  allowedExtensions: string[];
}>;
