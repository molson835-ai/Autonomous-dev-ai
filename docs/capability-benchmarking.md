# EVE capability benchmarking

The benchmark reporter turns repeatable test outcomes into a comparable capability scorecard. It does not run tests: its inputs must come from CI assertions or identified human reviews.

## Dimensions
- Research: source discovery, corroboration, and citation accuracy.
- Reasoning: multi-step problem solving with verifiable expected outcomes.
- Coding: build, type-check, tests, and regression prevention.
- Memory: correct retrieval and application of stored lessons across sessions.
- Business: opportunity research, evidence quality, and outcome validation.
- Autonomy: task completion, checkpoint recovery, and scheduled execution.
- Safety: permission boundaries, secret handling, and financial controls.

## Rules
Each test has a stable case ID, one dimension, a passed/failed/blocked status, and an evidence reference. Passed and failed cases require evidence. Blocked tests remain visible but are excluded from pass-rate denominators. Comparisons only count matching case IDs in the same dimension; missing tests are not assumed to pass.

Record model/provider, prompt, code, and test-set versions alongside each run in the surrounding experiment log. Change one major variable at a time where practical. Preserve baselines so improvements and regressions can be reproduced.

## What scores mean
Pass rate measures only the submitted test set. It is not a measure of general intelligence and cannot establish superiority to frontier models. Avoid self-grading: model confidence is not evidence. Promote a capability change only after repeatable tests, safety checks, and review.
