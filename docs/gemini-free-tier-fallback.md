# Gemini free-tier fallback

## Purpose and scope

Eve may use Google Gemini only when the Cloudflare shared quota reservation is
rejected with the exact safe reason `local_neuron_budget_reached`. This is
Eve's conservative local 7,000-neuron target, not proof that Cloudflare's
account-wide 10,000-neuron free allocation has been consumed.

This fallback does **not** activate for Cloudflare provider error 4006,
`quota_circuit_open`, stale or unavailable quota telemetry, unknown
reservation errors, or arbitrary Cloudflare failures. Those conditions remain
fail-closed and pause model work.

## Fixed provider configuration

- API: Google Gemini Developer API, OpenAI-compatible endpoint
  `https://generativelanguage.googleapis.com/v1beta/openai/`.
- Model allowlist: `gemini-3.8-flash` only.
- No model supplied by a task, prompt, environment variable, or tool may
  override this model ID.
- No Google Search grounding, Maps, URL context, code execution, file search,
  context caching, or other optional paid/metered tools are configured.
- No automatic retry, model escalation, or secondary fallback is performed.
- A Gemini error (including 429, 5xx, 401, or 403) is returned as a failure so
  the task can checkpoint and pause. Eve does not switch back and forth between
  providers.

The model is listed as free-tier eligible on Google's pricing page at the time
this change was authored. Google can change models, eligibility, and rate
limits; re-check the official pricing and rate-limit pages before enabling it.
Free-tier prompts may be used by Google to improve its products. Do not send
credentials, API keys, personal financial data, or other secrets to Gemini.

## Required opt-in and no-billing guard

The integration remains disabled unless all three server-side conditions are
true:

- `GEMINI_API_KEY` is present.
- `GEMINI_FREE_TIER_ENABLED=true` is explicitly set.
- `GEMINI_BILLING_ACCOUNT_ATTACHED=false` is explicitly set.

The last setting is an owner attestation, not an API-verified billing check.
Before setting it, verify in Google Cloud / AI Studio that the project used for
the key has **no billing account linked**. Do not attach a billing account,
payment method, or paid plan. Without that external check, leave the flag
unset and the fallback disabled. A key by itself is never proof of free usage.

Keep the key server-side as a Vercel environment secret; never put it in source,
client code, logs, task prompts, or chat. Add it only after the draft PR is
reviewed and separately approved. No Production deployment is part of this
change.

## Setup after review

1. Create a Gemini API key in Google AI Studio under a project with no billing
   account attached.
2. Confirm that no billing account is linked to that project. Do not add one.
3. Add the three environment variables to the intended server environment:
   `GEMINI_API_KEY` (secret), `GEMINI_FREE_TIER_ENABLED=true`, and
   `GEMINI_BILLING_ACCOUNT_ATTACHED=false`.
4. Keep the fallback disabled in Preview until the owner explicitly chooses to
   test it. Never paste the API key into chat or GitHub.
5. After a separately approved deployment, verify one controlled fallback
   test and confirm no paid billing account is attached.

## Safety and data notes

- Gemini is a separate provider and its free-tier data handling differs from
  Cloudflare. Google states that free-tier content may be used to improve its
  products. Do not send secrets or sensitive data.
- Free-tier access is rate-limited and not guaranteed to be available.
- No billing account is the external hard stop against paid API charges; the
  environment flag is only an explicit owner assertion and cannot prove
  Google's billing configuration.
- If any precondition is missing, Gemini is not called.
- This change does not change task authorization, owner approval, spending,
  memory approval, external-action, merge, or deployment controls.

## Official references

- [Gemini Developer API pricing and free-tier model eligibility](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini API rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)
- [Gemini API OpenAI compatibility](https://ai.google.dev/gemini-api/docs/openai)
- [Create an API key in Google AI Studio](https://aistudio.google.com/apikey)
