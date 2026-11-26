const MAX_CSV_BYTES = 64 * 1024;
const MAX_ROWS = 500;
const MAX_COLUMNS = 50;
const MAX_CELL_LENGTH = 8_000;

function byteLength(value) {
  return new TextEncoder().encode(value).byteLength;
}

function parseCsv(value) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  let afterQuote = false;
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (quoted) {
      if (char === '"') {
        if (value[i + 1] === '"') { cell += '"'; i += 1; }
        else { quoted = false; afterQuote = true; }
      } else cell += char;
      continue;
    }
    if (afterQuote && char !== "," && char !== "\r" && char !== "\n") return { valid: false, error: "Unexpected characters after a quoted CSV field." };
    if (char === '"') {
      if (cell.length !== 0 || afterQuote) return { valid: false, error: "A quote may only begin an empty CSV field." };
      quoted = true;
    } else if (char === ",") {
      row.push(cell); cell = ""; afterQuote = false;
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && value[i + 1] === "\n") i += 1;
      row.push(cell); rows.push(row); row = []; cell = ""; afterQuote = false;
      if (rows.length > MAX_ROWS) return { valid: false, error: "CSV exceeds the 500-row limit." };
    } else {
      if (afterQuote) return { valid: false, error: "Unexpected characters after a quoted CSV field." };
      cell += char;
    }
    if (cell.length > MAX_CELL_LENGTH) return { valid: false, error: "A CSV cell exceeds the 8,000-character limit." };
  }
  if (quoted) return { valid: false, error: "CSV contains an unterminated quoted field." };
  if (cell.length || row.length || afterQuote) { row.push(cell); rows.push(row); }
  if (rows.length > MAX_ROWS) return { valid: false, error: "CSV exceeds the 500-row limit." };
  return { valid: true, rows };
}

export function validateCsvArtifact(input) {
  const errors = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) return { valid: false, errors: ["An artifact object is required."] };
  if (Object.keys(input).some(key => !["name", "content"].includes(key))) errors.push("Only name and content are supported.");
  if (typeof input.name !== "string" || input.name.trim().length < 1 || input.name.length > 80) errors.push("name must contain 1–80 characters.");
  if (typeof input.content !== "string" || input.content.trim().length === 0) return { valid: false, errors: [...errors, "content must be non-empty CSV text."] };
  if (byteLength(input.content) > MAX_CSV_BYTES) errors.push("CSV artifact exceeds the 64 KiB limit.");
  if (input.content.charCodeAt(0) === 0xFEFF) errors.push("CSV must not include a byte-order mark.");
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(input.content)) errors.push("CSV contains disallowed control characters.");
  if (errors.length) return { valid: false, errors };
  const parsed = parseCsv(input.content);
  if (!parsed.valid) return { valid: false, errors: [parsed.error] };
  const rows = parsed.rows;
  if (!rows.length || !rows[0].length || rows[0].length > MAX_COLUMNS) return { valid: false, errors: ["CSV must have between 1 and 50 columns."] };
  if (rows.some(item => item.length !== rows[0].length)) return { valid: false, errors: ["Every CSV row must have the same number of columns."] };
  const headers = rows[0].map(value => value.trim().toLocaleLowerCase("en-US"));
  if (headers.some(value => !value) || new Set(headers).size !== headers.length) return { valid: false, errors: ["CSV headers must be non-empty and unique."] };
  for (const item of rows) for (const value of item) {
    if (/^\s*[=@]/u.test(value) || (/^\s*[+-]/u.test(value) && !/^\s*[+-]?\d+(?:\.\d+)?\s*$/u.test(value))) return { valid: false, errors: ["CSV contains a spreadsheet formula-like cell. Prefix intentional text with an apostrophe before creating the artifact."] };
  }
  const safeName = input.name.trim().replace(/[^a-z0-9 _-]/gi, "").replace(/\s+/g, "-").slice(0, 48) || "eve-artifact";
  const content = input.content.replace(/\r?\n/g, "\r\n");
  return {
    valid: true,
    status: "artifact_validated_not_executed",
    artifact: { name: input.name.trim(), filename: safeName + ".csv", mediaType: "text/csv; charset=utf-8", bytes: byteLength(content), content },
    limits: { maxBytes: MAX_CSV_BYTES, maxRows: MAX_ROWS, maxColumns: MAX_COLUMNS, filesPerCall: 1, externalNetwork: false, serverFilesystem: false, codeExecutionByAgent: false, spreadsheetFormulas: false, persistence: false },
  };
}
