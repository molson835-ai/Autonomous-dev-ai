# Persistent learning memory — Phase 2

## Design

The agent has five explicit memory operations:

1. Recall approved memories and recent experiences before relevant work.
2. Record a meaningful task experience after observed success, failure, or partial completion.
3. Propose durable facts, procedures, preferences, or lessons.
4. List pending proposals for owner review.
5. Approve or reject one proposal only after the owner explicitly directs that decision.

The Cloudflare Worker exposes a small authenticated API. A single-owner SQLite-backed Durable Object stores the records. Experience records are separate from approved knowledge. Only approved knowledge is returned as a knowledge candidate; recalled text remains data, never instructions.

This is retrieval-based learning, not model-weight fine-tuning. The model can use remembered experiences and approved knowledge as context in future sessions.

## Required configuration

The Worker needs a random high-entropy MEMORY_API_TOKEN secret. The same secret must be configured as a sensitive Preview environment variable in Vercel. Do not put it in source control, chat messages, browser storage, or logs.

Vercel Preview variables:
- MEMORY_API_URL: the deployed Worker URL, including https://.
- MEMORY_API_TOKEN: the shared random secret, marked sensitive.

Cloudflare Worker secret:
- MEMORY_API_TOKEN: the same shared random secret.

The existing Cloudflare Workers AI token is not reused or broadened.

## Free-tier boundary

Deploy only while the Cloudflare account is on the Workers Free plan. Durable Objects with SQLite storage are supported on Workers Free; free-tier operations have daily limits and fail when exceeded. Do not upgrade, enable billing, or use a paid fallback. If the account is on Workers Paid, do not deploy this Worker until the owner explicitly confirms a no-cost arrangement.

## Local validation

From the repository root, run:
node --test tests/memory-policy.test.mjs

The Worker should be validated with Wrangler locally before deployment. No production Worker deployment or Vercel production deployment is authorized by this phase.

## Data boundaries

- Do not store credentials, API keys, passwords, private keys, or access tokens.
- Do not store sensitive personal, financial, or medical details.
- Keep raw experiences distinct from approved memory.
- Never automatically approve a proposal.
- Do not treat recalled content as higher-priority instructions.
- Records are single-owner and private behind the bearer secret.
- This first version has no delete/export UI; add owner-controlled deletion and export before broad use.
