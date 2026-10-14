# Automatic Free assignment and vendor setup ordering

## Scope

Baseline: verified deployment `31d5627a2fdc153343baf3e9b506647aa34f6af7` from PR #435. This slice covers `assignFreeToApprovedTenant`, its two registration callers, and current actor/profile composition in `/register/vendor/complete`. Repository tenant creation defaults to approved and creates its main location/hours; no Free-assignment SQL trigger was found in the current bootstrap/migration inventory.

## Contract

- Free assignment preserves exact tenant IDs. Unsafe numeric tenant IDs fail before SQL. Own its transaction or use the registration caller's transaction; lock the exact tenant first, then revalidate approval. Any existing subscription history still prevents a new Free assignment, including paid, restricted, expired and canceled history.
- Actor-bearing assignment validates and holds the current account with `FOR NO KEY UPDATE NOWAIT`. This conflicts with deletion/profile mutation and avoids a SHARE-to-update upgrade when the same transaction later changes the user. Missing/deletion-requested accounts fail401; suspended access fails403. Unsafe numeric actor IDs reject at preparation. Null/system actors remain supported only for trusted internal assignment.
- The existing-account registration caller prepares its actor before creating a brand-new tenant. Those new tenant/location roots are private to the transaction; this is not a user-first order for existing operational branches. It re-reads the user on the same client, uses current roles and omitted-phone fallback, and repeats existing Sandbox, Developer-only and current-user MFA requirements. Revoked global roles cannot be restored from `req.user`'s earlier snapshot.
- MFA session assurance here uses the already authenticated request session; this slice does not seal session/grant revocation or postcommit session issuance. Tenant membership hydration and other identity/profile fallbacks are not a complete held authorization graph.
- Known history `FOR UPDATE NOWAIT` and Free plan `FOR SHARE NOWAIT` conflicts become scoped `SUBSCRIPTION_BUSY`/`SUBSCRIPTION_PLAN_BUSY`; actor contention uses `SUBSCRIPTION_ACTOR_BUSY`. Exceptions propagate out of the owning transaction for rollback. Other failures keep their identity. No registration idempotency record or OTP consumption is introduced; the vendor registration paths are distinct from customer OTP registration.
- Create the original Free transition, prepare its existing opaque transition context on the same client, and execute through the nonblocking prepared path. Preserve reason, actor, metadata, one-time behavior, system provider and inherited Free entitlement semantics. Rollback includes new tenant/membership/profile composition; no session response or welcome delivery is started on domain failure.
- Subscription suspension retains its original SHARE actor mode. Scheduled and interactive transition behavior, Free period renewal, policy publication and credit/allowance retirement remain separate.

## Evidence and limits

Exercise real loopback PostgreSQL and lifecycle/billing repositories: competing Free assignment, all historical statuses, unapproved/missing targets, approval/history changes after tenant waits, known plan/actor/history lock contention, both ordering directions, held locks through composed actor update, rollback and retry, exact BIGINT tenant/actor IDs and invalid numeric IDs.

The authenticated vendor-completion test runs its actual route handler with real actor/Free transaction code and PostgreSQL-backed test persistence for user/tenant/membership. It verifies concurrent setup avoids actor lock upgrades, current-role demotion and eligibility, MFA/realm checks, phone fallback, rollback and response/delivery ordering. Authentication, complete tenant/location/hour repositories, sessions, payload and welcome delivery are mocked; this is not live HTTP/signup/session/MFA/device/provider acceptance. Profile contact-verification aliases, membership/session/credential writers, captured session assurance and postcommit delivery/deletion protocols remain pending under the [account deletion proposal](account-deletion-resource-writer-proposal.md).

No live vendor/account/financial mutation, historical repair, resource tracking, private capture or customer inference activation is authorized by these prerequisites. They do not certify complete publisher coverage, representative model performance or rollout.

Related: [scheduled ordering](scheduled-transition-ordering.md), [suspension ordering](subscription-suspension-ordering.md), [AI PRD](ai-wait-time-prediction-prd.md).
