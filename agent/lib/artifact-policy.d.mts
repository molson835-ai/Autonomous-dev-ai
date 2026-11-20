export type HtmlArtifactInput = {
  readonly name: string;
  readonly content: string;
};

export type HtmlArtifactSuccess = {
  readonly valid: true;
  readonly status: "artifact_validated_not_executed";
  readonly artifact: {
    readonly name: string;
    readonly filename: string;
    readonly mediaType: "text/html";
    readonly bytes: number;
    readonly content: string;
    readonly previewHtml: string;
  };
  readonly limits: {
    readonly maxBytes: number;
    readonly filesPerCall: 1;
    readonly externalNetwork: false;
    readonly serverFilesystem: false;
    readonly codeExecutionByAgent: false;
    readonly browserPreviewSandboxed: true;
    readonly persistence: false;
  };
};

export type HtmlArtifactFailure = {
  readonly valid: false;
  readonly errors: string[];
};

export declare function validateHtmlArtifact(
  input: HtmlArtifactInput | unknown,
): HtmlArtifactSuccess | HtmlArtifactFailure;
