export type DataScalar = string | number | boolean | null;
export type DataRecord = Record<string, DataScalar>;
export interface DataWorkbenchInput {
  operation: "summarize" | "deduplicate" | "project" | "sort" | "filter" | "group_count";
  records: DataRecord[];
  field?: string;
  fields?: string[];
  direction?: "asc" | "desc";
  operator?: "eq" | "ne" | "contains" | "gt" | "gte" | "lt" | "lte" | "is_empty" | "is_not_empty";
  value?: DataScalar;
  max_output?: number;
}
export function runDataWorkbench(input: DataWorkbenchInput): Record<string, unknown>;
