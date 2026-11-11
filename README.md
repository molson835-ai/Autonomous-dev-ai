# Autonomous Dev AI

An Android-first software development agent intended to help turn a requested outcome into researched plans and, in later permissioned milestones, tested software deliverables.

## Current milestone: Android-first chat foundation

- [x] Establish the project and operating rules.
- [x] Add the Eve-based TypeScript project foundation.
- [x] Install dependencies and validate the generated app in Node.js 24 CI.
- [x] Commit the official Eve Web Chat Next.js scaffold under `apps/web/`.
- [x] Add a planning-only agent contract and automated safety/session-route tests.
- [ ] Verify live model responses, streaming, and durable session restoration.
- [x] Configure Cloudflare Workers AI as the first direct model provider; credentials and live calls remain pending.
- [ ] Verify the experience in Chrome on an Android phone.
- [ ] Configure production authentication and an approved no-cost hosting path.
- [ ] Add permissioned GitHub repository inspection and development workflows.

This is a source/build-verified foundation, not yet a live deployed chat product. Capabilities count as complete only after implementation and appropriate verification.

## Architecture

- Runtime: [Eve](https://github.com/vercel/eve), an open-source framework for durable agents, tools, and approvals.
- Language: TypeScript.
- Web interface: official Eve Web Chat scaffold using Next.js and React, located in `apps/web/`.
- Sessions: generated Eve client wiring with URL-addressed session routes under `/s/` and `/s/[sessionId]/`.
- Agent scope: planning-only for the first milestone.
- Workflow: inspect → plan → implement → verify → report, with implementation capabilities added only in later approved stages.
- Model provider: Cloudflare Workers AI direct API using `@cf/zai-org/glm-4.7-flash` (131,072-token context; function calling and reasoning supported).
- Model access: Workers Free allowance only; no AI Gateway, paid-model fallback, or paid-provider fallback is configured. Cloudflare's Workers Free plan currently includes 10,000 Neurons/day and rejects further requests after the allowance is exhausted. Keep the Cloudflare account on Workers Free; Workers Paid usage above the allowance is billable.
- Provider credentials: `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` are runtime environment variables and are never committed. Missing credentials use deliberately invalid placeholders, so requests fail rather than silently routing elsewhere.

## Requirements

- Node.js 24 or newer
- npm
- A Cloudflare account kept on the Workers Free plan, plus a Workers AI Read API token and account ID stored as runtime environment variables. Do not enable Workers Paid or attach a paid billing method for this project.

## Development commands

Install dependencies:

```bash
npm install
```

Start the Next.js web interface:

```bash
npm run dev:web
```

Start the Eve development process:

```bash
npm run dev
```

Build and verify:

```bash
npm run build:web
npm run build
node --test tests/*.test.mjs
```

The production build and contract tests are verified in GitHub Actions. Local development-server startup and live model interaction have not yet been verified. The Cloudflare provider source is configured, but no credentials have been supplied and no live request has been made. The web app is not deployed and does not yet have production sign-in configured.

## Verification status

The current CI workflow:
- generates the official Web Chat scaffold when it is not already present;
- commits generated source to the feature branch;
- builds the Next.js app and Eve workspace;
- runs planning, financial-safety, and session-route source-contract tests.

The tests verify source-level contracts. They do not establish that a real model provider is configured, that live streaming works, that sessions persist across a deployed restart, or that the layout has been tested on a physical Android device.

## Financial and safety boundaries

**The user's personal funds and personal credit are permanently off limits.**

- No personal cards, bank accounts, credit, subscriptions, borrowing, or indirect spending.
- Target zero out-of-pocket operation; use open-source tools and free tiers, and pause rather than silently incur charges when free limits are reached.
- Any future business purchases may use only cleared revenue received into a separate business account, with explicit approval for each purchase.
- Future hardware acquisitions must be approved by the user and may be shipped to the user for setup.
- The first milestone has no repository-write, shell-execution, deployment, purchasing, financial-account, or payment capabilities.

## License

MIT. See [LICENSE](LICENSE).
