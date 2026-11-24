# Eve session-scoped write permissions

## Goal

Keep Eve's useful state-changing capabilities while preventing an anonymous or explicitly read-only session from using them.

## Enforcement

- The public chat channel remains available through the explicit anonymous fallback.
- The channel first attempts to authenticate the owner using a separate HttpOnly cookie scoped to `/eve`. The token is verified against the configured GitHub OAuth App and the immutable `OWNER_GITHUB_ID`, using the same verifier as the Owner Console's Worker.
- The channel also accepts Vercel OIDC for trusted internal service calls. The OIDC helper validates tokens for the current Vercel project.
- Stateful tools are dynamic. They are offered only to a verified owner, a trusted service principal, or a platform-scheduled invocation.
- The latest turn's input is checked for an explicit read-only/no-write instruction. That instruction takes precedence over owner, service, and schedule permissions.
- Anonymous chat receives read-only tools. It does not receive memory writes, task mutations, resource-registry intake, tool scaffolding, or artifact creation.
- Owner-only memory decisions remain disabled inside Eve. Owner approvals continue through the separately authenticated Owner Console.

## Stateful tools gated

`memory_record_experience`, `memory_propose`, `task_propose`, `task_claim_next`, `task_heartbeat`, `task_transition`, `discover_resources`, `propose_tool`, and `create_artifact`.

The scheduled work loop retains the task claim/checkpoint and memory/resource capabilities it needs. The existing task store continues to enforce individual owner approval, mission authorization state, task lifecycle, and attempt limits. Dynamic tool visibility is an additional boundary, not a replacement for those checks.

## Owner sign-in

1. Sign in at `/owner` using the configured GitHub OAuth App.
2. The OAuth callback sets the existing Owner Console cookie at `/api/owner` and a separate HttpOnly Eve cookie at `/eve`.
3. The Eve channel verifies the Eve cookie on each new inbound request. It does not expose the token to browser JavaScript or to the model.
4. Owner logout clears both cookies.

If owner verification fails or configuration is missing, the request falls through to anonymous access; stateful tools remain unavailable.

## Read-only behavior

The explicit read-only check is performed against the current turn input on every dynamic tool evaluation. Matching requests hide stateful tools even for the owner or scheduled service. This is fail-closed: a phrase that might indicate a no-write request can suppress stateful tools for that turn, but cannot grant additional permissions.

## Verification

Unit tests cover anonymous denial, verified-owner access, trusted service/scheduled access, explicit read-only precedence, and structured message input. CI must also run the EVE build, TypeScript typecheck, and full test suite.

## Non-goals

This change does not delete or alter existing production memory/task records, change Worker data, approve tasks, deploy Production, grant customer-contact/publishing/payment/purchasing permissions, or add paid services.
