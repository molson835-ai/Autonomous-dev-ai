# EVE opportunity evaluation

The evaluator is a deterministic triage heuristic, not a market forecast, investment recommendation, or promise of revenue.

## Signals
Each candidate is assessed on demand evidence (20%), competition (10%, inverse), startup cost (15%, inverse with logarithmic scaling), time to first sale (15%, inverse with logarithmic scaling), gross margin (15%), execution risk (15%, inverse), and evidence strength (10%).

Confidence is separate from score. High confidence requires at least three evidence references and evidence strength >= 4; medium requires at least one reference and strength >= 2; otherwise confidence is low. Evidence references must point to independently checked sources; the tool cannot establish source truth by itself.

## Decisions
- `small_test`: score >= 70, confidence is not low, and startup cost is exactly $0.
- `investigate`: score >= 45, or a higher score that does not meet the small-test gate.
- `deprioritize`: score < 45.

These labels only prioritize research. They do not authorize outreach, publishing, spending, inventory, subscriptions, accepting money, or ordering/shipping goods. Expenses remain blocked until cleared EVE revenue exists and the owner approves the exact expense. Prefer reversible no-cost tests and record outcomes for later evaluation.

## Learning loop
For every evaluated candidate, retain the assumptions, source references, score, confidence, decision, and later observed outcome as an experience. Compare predicted ranking with actual results; propose rubric changes as reviewable knowledge, never silently rewrite the scoring system based on one outcome.
