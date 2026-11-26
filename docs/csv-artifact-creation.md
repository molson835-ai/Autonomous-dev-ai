# CSV Artifact Creation and Delivery

## Scope
Eve can create one standalone UTF-8 CSV data file per call, in addition to the existing standalone HTML artifacts. CSV is intended for structured business deliverables such as inventory counts, receiving discrepancies, research summaries and reconciliation exports.

## Validation
- 64 KiB maximum, 500 rows maximum, 50 columns maximum, 8,000 characters per cell.
- Requires a non-empty header row with unique, non-empty column names; every row must have the same number of columns.
- Supports RFC 4180-style quoted fields, escaped quotes, commas and line breaks; rejects malformed quoting.
- Rejects control characters, byte-order marks and spreadsheet formula-like cells beginning with `=`, `@`, or non-numeric `+` / `-` expressions. Signed numeric values such as negative inventory variances remain allowed.
- Normalizes line endings to CRLF and stores UTF-8 as `text/csv; charset=utf-8`.
- No formulas, macros, external assets, spreadsheet execution or external network access.

## Storage and owner access
- CSV files use a separate additive Durable Object table; the existing HTML table and HTML validation path remain unchanged.
- The same combined artifact limits apply: 20 files and 1 MiB total stored content across HTML and CSV.
- Each logical creation requires a UUID idempotency key. Identical retries return the original artifact; conflicting content returns HTTP 409.
- SHA-256 is stored and checked on agent and owner reads.
- CSV appears in the existing owner artifact list and uses the existing owner-authenticated download and explicit delete controls. No public artifact URLs are created.

## Verification limits
Validation checks CSV structure and spreadsheet formula injection patterns; it does not certify business correctness, reconcile source systems, or guarantee identical import behavior across spreadsheet applications. CSV has no formulas or embedded executable content.
