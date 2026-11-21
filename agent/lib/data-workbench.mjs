const MAX_RECORDS = 500;
const MAX_FIELDS = 50;
const MAX_INPUT_BYTES = 256 * 1024;
const MAX_OUTPUT_ROWS = 100;
const MAX_FIELD_NAME = 80;

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isScalar = (value) => value === null || ["string", "number", "boolean"].includes(typeof value);

function validateRecords(records) {
  if (!Array.isArray(records) || records.length > MAX_RECORDS) {
    return "records must be an array of at most 500 objects.";
  }
  for (const [index, row] of records.entries()) {
    if (!isPlainObject(row)) return `records[${index}] must be a plain object.`;
    const keys = Object.keys(row);
    if (keys.length > MAX_FIELDS) return `records[${index}] exceeds 50 fields.`;
    for (const key of keys) {
      if (!key || key.length > MAX_FIELD_NAME || ["__proto__", "prototype", "constructor"].includes(key)) {
        return `records[${index}] contains an invalid field name.`;
      }
      if (!isScalar(row[key])) return `records[${index}].${key} must be a JSON scalar.`;
      if (typeof row[key] === "number" && !Number.isFinite(row[key])) {
        return `records[${index}].${key} must be finite.`;
      }
      if (typeof row[key] === "string" && row[key].length > 2000) {
        return `records[${index}].${key} exceeds 2,000 characters.`;
      }
    }
  }
  return null;
}

const byteLength = (value) => new TextEncoder().encode(value).byteLength;
const isEmpty = (value) => value === null || value === undefined || value === "";

function summarize(records) {
  const columns = [...new Set(records.flatMap((row) => Object.keys(row)))].sort();
  const fields = columns.map((field) => {
    const values = records.map((row) => row[field]).filter((value) => !isEmpty(value));
    const numeric = values.filter((value) => typeof value === "number");
    return {
      field,
      present: values.length,
      missing: records.length - values.length,
      types: [...new Set(values.map((value) => value === null ? "null" : typeof value))].sort(),
      ...(numeric.length ? {
        numeric: {
          count: numeric.length,
          min: Math.min(...numeric),
          max: Math.max(...numeric),
          mean: numeric.reduce((sum, value) => sum + value, 0) / numeric.length
        }
      } : {})
    };
  });
  return { status: "ok", operation: "summarize", recordCount: records.length, fieldCount: columns.length, fields };
}

function compare(left, operator, right) {
  if (operator === "is_empty") return isEmpty(left);
  if (operator === "is_not_empty") return !isEmpty(left);
  if (operator === "eq") return left === right;
  if (operator === "ne") return left !== right;
  if (operator === "contains") return typeof left === "string" && typeof right === "string" && left.toLowerCase().includes(right.toLowerCase());
  if (["gt", "gte", "lt", "lte"].includes(operator)) {
    if (typeof left !== "number" || typeof right !== "number") return false;
    if (operator === "gt") return left > right;
    if (operator === "gte") return left >= right;
    if (operator === "lt") return left < right;
    return left <= right;
  }
  return false;
}

function outputRows(rows, maxOutput) {
  return {
    status: "ok",
    rowCount: rows.length,
    returnedCount: Math.min(rows.length, maxOutput),
    truncated: rows.length > maxOutput,
    records: rows.slice(0, maxOutput)
  };
}

/**
 * Deterministic in-memory operations only. No filesystem, network, persistence,
 * model calls, code execution, or external side effects.
 */
export function runDataWorkbench(input) {
  if (!isPlainObject(input)) return { status: "invalid_input", error: "An input object is required." };
  const allowed = new Set(["operation", "records", "field", "fields", "direction", "operator", "value", "max_output"]);
  if (Object.keys(input).some((key) => !allowed.has(key))) {
    return { status: "invalid_input", error: "Unsupported input property." };
  }
  const { operation, records, field, fields, direction = "asc", operator, value, max_output = 50 } = input;
  const recordError = validateRecords(records);
  if (recordError) return { status: "invalid_input", error: recordError };
  if (byteLength(JSON.stringify(input)) > MAX_INPUT_BYTES) {
    return { status: "input_too_large", maxInputBytes: MAX_INPUT_BYTES };
  }
  if (!Number.isInteger(max_output) || max_output < 1 || max_output > MAX_OUTPUT_ROWS) {
    return { status: "invalid_input", error: "max_output must be an integer from 1 to 100." };
  }
  if (operation === "summarize") return summarize(records);
  if (operation === "deduplicate") {
    if (fields !== undefined && (!Array.isArray(fields) || fields.length < 1 || fields.length > MAX_FIELDS || fields.some((item) => typeof item !== "string"))) {
      return { status: "invalid_input", error: "fields must contain 1–50 field names when supplied." };
    }
    const seen = new Set();
    const unique = records.filter((row) => {
      const key = JSON.stringify(fields ? fields.map((name) => row[name] ?? null) : Object.keys(row).sort().map((name) => [name, row[name]]));
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return { operation, removedCount: records.length - unique.length, ...outputRows(unique, max_output) };
  }
  if (operation === "project") {
    if (!Array.isArray(fields) || fields.length < 1 || fields.length > MAX_FIELDS || fields.some((item) => typeof item !== "string" || item.length > MAX_FIELD_NAME)) {
      return { status: "invalid_input", error: "project requires 1–50 valid field names." };
    }
    const projected = records.map((row) => Object.fromEntries(fields.filter((name) => Object.hasOwn(row, name)).map((name) => [name, row[name]])));
    return { operation, ...outputRows(projected, max_output) };
  }
  if (operation === "sort") {
    if (typeof field !== "string" || field.length > MAX_FIELD_NAME || !["asc", "desc"].includes(direction)) {
      return { status: "invalid_input", error: "sort requires a field and direction asc or desc." };
    }
    const sorted = records.map((row, index) => ({ row, index })).sort((a, b) => {
      const av = a.row[field]; const bv = b.row[field];
      let result = 0;
      if (av === undefined || av === null) result = bv === undefined || bv === null ? 0 : 1;
      else if (bv === undefined || bv === null) result = -1;
      else if (typeof av === "number" && typeof bv === "number") result = av - bv;
      else result = String(av).localeCompare(String(bv));
      return (direction === "desc" ? -result : result) || a.index - b.index;
    }).map(({ row }) => row);
    return { operation, field, direction, ...outputRows(sorted, max_output) };
  }
  if (operation === "filter") {
    const operators = ["eq", "ne", "contains", "gt", "gte", "lt", "lte", "is_empty", "is_not_empty"];
    if (typeof field !== "string" || field.length > MAX_FIELD_NAME || !operators.includes(operator)) {
      return { status: "invalid_input", error: "filter requires a field and supported operator." };
    }
    if (!["is_empty", "is_not_empty"].includes(operator) && !isScalar(value)) {
      return { status: "invalid_input", error: "filter value must be a string, number, boolean, or null." };
    }
    const filtered = records.filter((row) => compare(row[field], operator, value));
    return { operation, field, operator, ...outputRows(filtered, max_output) };
  }
  if (operation === "group_count") {
    if (typeof field !== "string" || field.length > MAX_FIELD_NAME) {
      return { status: "invalid_input", error: "group_count requires a field name." };
    }
    const counts = new Map();
    for (const row of records) {
      const value = row[field] ?? null;
      const key = JSON.stringify(value);
      const existing = counts.get(key) ?? { value, count: 0 };
      existing.count += 1;
      counts.set(key, existing);
    }
    const groups = [...counts.values()].sort((a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value)));
    return { status: "ok", operation, field, groupCount: groups.length, returnedCount: Math.min(groups.length, max_output), truncated: groups.length > max_output, groups: groups.slice(0, max_output) };
  }
  return { status: "invalid_input", error: "Unsupported operation. Use summarize, deduplicate, project, sort, filter, or group_count." };
}
