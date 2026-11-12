# Proposed knowledge: calculator repeated-equals behavior

**Status:** Proposed evaluation reference; not automatically promoted to trusted knowledge.

## Rule

After an operation is evaluated, repeated presses of equals reapply the last operator with the last right-hand operand to the current result.

## Reference traces

| Input | Expected trace |
|---|---|
| 5 + 3 = = = = | 8 → 11 → 14 → 17 → 20 |
| 5 − 3 = = = = | 2 → −1 → −4 → −7 → −10 |
| 5 × 3 = = = = | 15 → 45 → 135 → 405 → 1215 |
| 7 ÷ 2 = = = = | 3.5 → 1.75 → 0.875 → 0.4375 → 0.21875 |

## Related state rules

- Pressing equals without a selected operator leaves the current entry unchanged.
- After 5 + 3 =, pressing + prepares 8 + and waits for a new operand; it does not apply the old operand again.
- Clear Entry (C) clears the current entry while preserving the pending operation where applicable.
- All Clear (AC) resets the entire calculator state.

## Numeric precision

For nine-decimal-place output, −8 ÷ 3 rounds symmetrically to −2.666666667 using round-half-away-from-zero.

## Verification

The deterministic reference tests live in `tests/research/calculator-evaluation.test.mjs`. They validate these expected traces as a baseline. They do not claim to test a live model response or a production calculator implementation.

## Promotion requirement

Keep this record proposed until the research engine can attach primary-source evidence where relevant, distinguish mathematical reference cases from sourced API facts, and a reviewer explicitly approves promotion.
