export interface CsvArtifactInput {
  name?: unknown;
  content?: unknown;
  [key: string]: unknown;
}

export interface CsvArtifactValidationFailure {
  valid: false;
  errors: string[];
}

export interface CsvArtifactValidationSuccess {
  valid: true;
  status: "artifact_validated_not_executed";
  artifact: {
    name: string;
    filename: string;
    mediaType: "text/csv; charset=utf-8";
    bytes: number;
    content: string;
  };
  limits: {
    maxBytes: number;
    maxRows: number;
    maxColumns: number;
    filesPerCall: number;
    externalNetwork: false;
    serverFilesystem: false;
    codeExecutionByAgent: false;
    spreadsheetFormulas: false;
    persistence: false;
  };
}

export type CsvArtifactValidation =
  | CsvArtifactValidationFailure
  | CsvArtifactValidationSuccess;

/**
 * Validates bounded CSV artifact input and returns normalized, formula-free CSV data.
 * This function validates data only; it does not persist or execute the artifact.
 */
export function validateCsvArtifact(
  input: CsvArtifactInput | null | undefined,
): CsvArtifactValidation;
