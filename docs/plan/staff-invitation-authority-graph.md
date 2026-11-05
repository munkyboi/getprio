# Staff invitation authority and resource transaction graph

Selected invitation implementation based on deployed main `0cc669f6a25cbbc4e26701d1004654fc516ff828`, including the explicit held commercial reader in #448. This is the next bounded B2 prerequisite for AI issue #378, coordinated with the queue owner. Its focused PostgreSQL evidence below proves the selected path, not complete writer coverage.

## Pre-implementation path

`handleInviteStaff` resolves the vendor, checks captured actor permission, normalizes the email and requires an existing global account. `staffAccessEmailService.change` then locks the tenant, reads the target and location grants, invokes the callback and persists changed-access email intents on the same client. The callback reads entitlements through the default pool, enumerates current staff on the transaction client, rejects any existing membership with 409, checks seats and owner/admin assignment rules, and calls the membership upsert.

The existing-member protection and exact SQL identity prerequisites remain required. Invitation must not become an edit/reactivation or resend endpoint. A membership in another vendor does not block a new membership in the selected vendor. Preserve 201 `{ userId }`, current seat counting and role rules.

## Source gaps

- Tenant-first invitation cannot acquire branch locks later: that would invert the existing branch-first staff/catalog writer order.
- Captured `req.user` permission and membership role do not hold current actor flags, membership or grants through commit.
- The target is discovered by email before the transaction. Current target deletion/suspension and identity/email changes are not held by that discovery.
- Tenant serialization protects absence and seat decisions only against cooperating tenant writers. It is not complete membership publisher certification.
- `getTenantEntitlements` reads the active subscription and catalog plan through separate default-pool operations. Forwarding a client alone would not prove stable plan policy or compatible publisher order.
- Current invitation writes no affected branch revisions. Email intents are atomic with membership today; delivery authorization/suppression remains a separate worker protocol.

## Selected transaction graph and remaining bounds

1. Use the existing tenant catalog transaction boundary: exact branch IDs in numeric order, tenant root, then rediscover the complete branch set. Do not nest an independently committed email transaction.
2. Hold current actor and target users with compatible SHARE locks in deterministic numeric identity order, including deletion/suspension flags; then hold the actor's exact active membership and resolve `tenant.staff.invite` plus the current role assignment rules. Reject stale or absent authority before membership insertion or notices. Existing staff edit/removal uses actor user/membership SHARE followed by target user SHARE and target membership UPDATE. Keep actor/current-member/owner-recipient locks compatible SHARE; only the eligible new target upgrades to UPDATE NOWAIT to protect absent counter-assignment insertion through its user FK. Include implicit membership and notice-recipient foreign-key locks; target membership absence cannot be row-locked. Other writers do not acquire a complete deterministic user order today, so invitation ordering alone does not certify the graph. User-first deletion compatibility needs bounded contention and rechecks, rather than backward waits beneath held branch/tenant roots.
3. Recheck the exact target's current identity and eligible existing-account state. Proposed admission: compare the held current normalized email to the submitted normalized lookup email; if changed during the wait, return a bounded conflict/reload before writes. Do not silently invite a captured ID at another address or switch accounts by repeating email lookup. The implementation rejects current target deletion/suspension or changed email before writes; no identity/profile mutation belongs here.
4. Under the tenant root, recheck all existing memberships, seat usage and owner restrictions. Existing-member 409 precedes seat rejection and writes. Use current membership rows where authority or counts require stability; test legacy membership-first writers with bounded contention rather than waiting into an inversion.
5. Use the explicit same-client held subscription and plan reader from #448. Reuse current commercial semantics; do not introduce a new active-period interpretation, entitlement fallback or plan override policy in the invitation adapter.
6. Insert exactly one new membership, advance only affected branch revisions (owner/admin affects all branches; ordinary staff affects the exact union of current explicit location grants and eligible counter-assignment branches; no branch revision is justified for a new ordinary staff membership with neither grant type), and persist changed-access email intents on the same client. Roll back every write on failure. Keep delivery/provider acceptance outside this transaction proof.

The selected actor/target/membership/commercial order is implemented and exercised against PostgreSQL, not certified as the complete application lock graph. Existing deletion, staff removal/edit, identity/email, counter assignment, subscription, plan publishers and recipient enumeration remain part of the complete writer graph; the selected cases tested here do not certify them all. Counter assignments can already exist for a globally registered target without vendor membership: invitation may restore operational access to those branches. Exclude foreign-tenant grants, hold current grant state and do not invent default-location access or occupancy effects. Queue owns account-deletion protocols and authoritative snapshots; API owns shared billing/permission contracts; AI owns this invitation audit and the subsequently agreed adapter.

## Required focused evidence

- Actor revocation/demotion/deletion/suspension and target deletion/suspension/email change win first: no membership, revision or notice writes.
- Invitation wins first: accepted authority stays held through commit; later changes retain their reviewed behavior.
- Branch creation/movement and legacy tenant/membership-first contention in both orders, with rollback and bounded retry behavior.
- Concurrent invitations for the same account: one insertion/notice; later requests conflict. Concurrent different accounts cannot exceed the existing seat/owner policy.
- Existing active/inactive owner/admin/staff memberships remain unchanged, including full-seat duplicate conflicts; other-vendor membership remains eligible.
- Subscription/plan policy changes in both orders, same-client reads and no default-pool escape.
- Exact adjacent BIGINT user/tenant/member/branch IDs; commit and injected membership/revision/outbox failures; zero-branch vendors, ordinary staff without grants, preexisting counter grants, foreign-tenant grants and concurrent assignments, and unchanged response contracts.

No tracking, reconciliation repair, capture, customer inference or model rollout follows from this audit or adapter. Complete session/realm/MFA graphs and other membership publishers remain independent gates.

## Selected implementation checkpoint

The selected commercial helper was deployed unconnected in #448. This slice connects it only inside the invitation adapter’s branch-first tenant catalog transaction; merge, deployment and live acceptance of this connection remain separate gates. Current owner-notice recipients need compatible user SHARE NOWAIT holds too: an outbox recipient FK must not create a reverse wait behind a deletion transaction holding that user. Discover a bounded complete membership set under the tenant root, hold exact actor/target/current-member user identities in numeric order, then hold and recheck memberships; a changed discovery set requires rollback rather than late out-of-order locks. Complete recipient delivery suppression remains separately owned.

Counter effects use only active counters belonging to this vendor and their exact location IDs. A new ordinary staff membership with no grant does not invent access. Existing counter assignments can restore operational reach when membership is added. Hold counter/assignment rows compatibly or return bounded contention, and advance affected revisions with membership and email intents on one client.

The former handler callback used the tenant-first email service; this slice replaces that path and adds actual handler, resource-service and real PostgreSQL regressions. Preserve existing-member409 before seat rejection, normalized existing-account lookup, admin-can-invite-staff-only, owner assignment rules and 201 userId. The handler now delegates admission to staffInvitationResourceService; its preflight remains a lookup, and the service holds current authority and target state before mutation.

## Implemented acceptance evidence and limits

Actual handler regressions preserve existing active/inactive owner/admin/staff membership409, self-invitation protection, duplicate-before-full-seat behavior, normalized global account lookup, exact identities, role restrictions and 201 userId. The domain tests execute branch/tenant roots, user and membership holds, the deployed held-entitlement reader, actual user repository and email-intent service on one disposable PostgreSQL schema.

Cases cover committed actor demotion and target deletion/suspension/email changes after root waits, admission-first identity holding, both absent counter-assignment orders, legacy FK-first inversion and fresh retry, inactive-counter activation and assignment deletion waits, rollback at membership/revision/notice writes, held commercial plan changes, reciprocal cross-vendor target upgrades, exact adjacent BIGINT accounts/vendors, zero-branch vendors, foreign grants and revisioned owner/admin versus ordinary staff access. The new-target UPDATE is deliberately nonblocking and justified by the absent-assignment FK race; actor and other member/recipient users remain SHARE-held. Later assignment publication needs its own authoritative writer.

Existing intended owner notice recipients are held before user-FK insertion; an already restricted verified active-owner recipient fails closed with STAFF_NOTICE_RECIPIENT_UNAVAILABLE before admission rather than inventing a new suppression or delivery policy. Delivery workers and provider acceptance remain separate. Invalid seat policy and oversized membership/counter inventories also fail before membership writes; no truncated inventory is accepted. Known row contention requires rollback before retry. Existing-member conflict after a successful repeated POST remains the legacy contract; this change adds no idempotency/replay protocol.

Current session/realm/MFA, all other membership/counter/plan publishers, deletion/cleanup protocols, historical reconciliation, resource configuration/plan watermarks, complete snapshots and AI rollout remain pending gates. This selected invitation integration neither removes tracking/coverage constraints nor authorizes capture, repairs or customer inference. No live invitation or business mutation was performed.
