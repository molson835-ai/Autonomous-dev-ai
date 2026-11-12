# Phase 2 — repeatable benchmark prompts

Run these prompts in a live Eve session without adding paid tools. Save each prompt, complete raw output, elapsed time, and any test output as a separate evidence artifact. Do not let Eve assign its own score.

## 1. Research synthesis

**Prompt**

> Using only the fact pack below, create a claim/evidence matrix with columns for claim, evidence supplied, confidence, and unknowns. Do not browse or invent details. Separate direct facts from inference. Identify any conflicting or ambiguous information.
>
> Fact A: A small bakery's public homepage lists a physical address and weekly hours. The Thursday–Saturday closing time is displayed as “6m”.
>
> Fact B: The homepage says custom-order customers should share the occasion, event date, and serving size.
>
> Fact C: The homepage presents three paths: custom orders, ready-to-order treats, and ice cream visits.
>
> Fact D: No analytics, sales, inquiry, or customer-survey data was supplied.

**Pass conditions**
- All four facts are represented accurately.
- “6m” is flagged as ambiguous, not silently rewritten.
- No sales, conversion, demand, or customer behavior is inferred.
- Unknowns are explicitly listed.

## 2. Business writing

**Prompt**

> Turn the same fact pack into a concise one-page improvement memo for the business owner. Give no more than three low-cost recommendations. For each, include the observed fact, a clearly labeled hypothesis, the smallest next step, and a measurable indicator. Do not invent business policies or promise revenue or ranking improvements.

**Pass conditions**
- Plain-language executive summary.
- Recommendations trace to supplied facts.
- Hypotheses are not presented as proven problems.
- Every recommendation has a measurable next step.
- No unsupported policy, price, or performance claim.

## 3. Data analysis

**Prompt**

> Analyze this synthetic two-week funnel dataset. Show formulas, denominators, percentages to two decimal places, percentage-point changes, and relative change. State that the data is synthetic.
>
> Week 1: 400 website visits, 20 inquiries, 8 orders.
>
> Week 2: 450 website visits, 27 inquiries, 12 orders.
>
> Calculate inquiry rate (inquiries divided by visits), order rate (orders divided by visits), and inquiry-to-order rate (orders divided by inquiries). Compare each week. For order rate, report both the percentage-point change and relative percentage change.

**Expected results**
- Week 1 inquiry rate: 5.00%.
- Week 2 inquiry rate: 6.00%.
- Week 1 order rate: 2.00%.
- Week 2 order rate: 2.67%.
- Order-rate absolute change: +0.67 percentage points (using unrounded rates).
- Order-rate relative change: +33.33%.
- Week 1 inquiry-to-order rate: 40.00%.
- Week 2 inquiry-to-order rate: 44.44%.

**Pass conditions**
- Correct values and denominators.
- Uses unrounded values for the change calculation.
- Distinguishes percentage points from relative percentage change.
- Does not claim the synthetic data predicts real business performance.

## 4. Coding

**Prompt**

> Implement a pure JavaScript function that calculates funnel rates from an object with visits, inquiries, and orders. Return inquiry rate, order rate, and inquiry-to-order rate as percentages. Reject negative values, non-finite values, and counts where inquiries exceed visits or orders exceed inquiries. Define and test zero-denominator behavior. Do not add dependencies or modify unrelated files.

**Pass conditions**
- Function is deterministic and has no side effects.
- Valid inputs produce the expected rates from task 3.
- Zero visits and zero inquiries are handled explicitly and consistently.
- Invalid counts throw a clear error or return a documented validation result.
- Tests cover valid, zero, negative, non-finite, and impossible funnel values.
- Exact test command and observed result are recorded.

## Review and recording

- Use the rubric in docs/phase-2-skill-benchmark.md.
- The owner or an independent reviewer scores research and writing. Automated tests may verify the objective data and coding outputs.
- Store the prompt, raw output, test results, elapsed time, reviewer, and evidence reference.
- Keep skill status practiced until the owner explicitly approves a demonstrated-skill proposal.
