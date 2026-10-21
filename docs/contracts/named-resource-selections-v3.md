# Named resources and nested extras — approved refinement

Source: the approved 2026-10-17 refinement at the top of #461. This supersedes the flat preview's same-pool-only, fixed-duration and whole-group-completion restrictions. **The Vendor contract is implemented and handed off for local Opera acceptance; customer intake remains a separate gate.** Existing v2 tickets and historical evidence remain intact; new nested selection payloads use `contractVersion:3` so consumers cannot mistake a flat preview for the corrected model.

## Confirmed rules

One catalog service contains named resource selections. The exact acceptance example is Pickleball court rental → Court 1 (180 minutes), Court 2 (180), Court 3 (60). Court 1 has Basic equipment and Trainer extras; Court 3 has Basic equipment. Every child has a stable identity and its own duration. All courts share the actual initial Start; each extra shares its parent court's actual Start and may not outlast that court. Offsets and arbitrary delayed starts are unsupported.

All selected extras are required. Availability shown while editing is provisional, never a hold. Call atomically protects every required named court and extra pool in the current stage; future stages remain unreserved. Unavailable required extras produce a persisted wait explanation. Removal before Start requires customer agreement, actor, reason, revisions, audit and a deduplicated linked-customer notification. Failed replacement preserves all old plan/protection.

Expected ends are advisory. Only an explicit outcome releases recorded allocations. A completed extra does not release its parent court; a completed court does not release other courts. Completing a court requires its selected required extras to have completed. Stage/ticket success requires every required child to complete. Partial interruption and selective retry retain completed children and never allocate them again.

Queue-ticket usage remains one unit at publication, independent of root services, named courts, extras, durations or allocation rows. Existing queue fees remain separate. Where no explicit queue rate policy exists, the service quote is `{status:'unavailable',reasonCode:'SERVICE_PRICING_NOT_CONFIGURED'}`. No total, charge or repricing is inferred from `priceDisplay` or booking quantity/Hours settings.

## Input identities and hierarchy

Vendor preview types: `shared/queueSelectionPlanV3.ts`. Customer intake is a separate contract.

```text
serviceSelections[]
  serviceSelectionId, serviceId
  resources[]
    resourceSelectionId, resourceMemberId, quantity, durationMinutes
    extras[]
      extraSelectionId, serviceId, quantity, durationMinutes
```

Selection IDs are stable logical IDs; `resourceMemberId` identifies the scoped physical court. Named selections have quantity 1; purchased duration never changes resource count. Pooled children use quantity × their own configured units requirement. Extras do not inherit or double-count their parent court's demand. Repeated service IDs never merge independent selections. Duplicate selection IDs are invalid; selecting the same named member twice in one simultaneous stage is invalid.

The server captures every leaf's kind, service/root/parent identity, named member when applicable, stage, quantity, duration, immutable service and resource policy revisions, and quote state. Client input never supplies authoritative pool IDs, resource counts, prices, availability or allocation IDs. Drafts may be incomplete and remain inert.

## Execution lineage

Each child execution attempt has its own ID, revision, immutable selection identity and parent link, stage attempt, attempt number and explicit state/outcome. Reservation/allocation groups record the exact expected child-attempt/member set. Shared storage adds named-member and child-attempt bindings; existing v2 rows are not rewritten as named selections.

At initial Start, all group member actual starts match; each member's expected end is actual Start plus its own duration. Named-member exclusivity and pooled capacity are checked together under the location transaction. Actual unreleased occupancy continues after an expected end. Partial group release is valid; the group's final release clock/outcome is derived only when all its members resolve.

Vendor child commands use the existing `POST /plans/:id/complete|interrupt` paths with ticket/plan/stage revisions, `childAttemptId`, `expectedChildRevision`, `allocationGroupId`, and `Idempotency-Key`. The server releases only recorded members. Parent court completion rejects unfinished required extras. Court interruption additionally requires a reason and the exact unfinished active `interruptedExtras: [{childAttemptId,expectedChildRevision}]` set. No dependency is implicitly dropped.

Selective retry preserves completed leaves. `POST /plans/:id/retry` takes the interrupted court's child identity/revision and exact interrupted unfinished extras, together with common ticket/plan/stage revisions and `Idempotency-Key`. It reserves and starts the new tree atomically. Completed extras remain current successful prior attempts, referenced by the new court's `satisfiedDependencyAttemptIds`; their allocations never move to the new group. Unrelated courts keep their allocations. An extra cannot be restarted later inside an existing court attempt. No elapsed-time release or automatic duration/price change is permitted.

## Vendor preview endpoints

All paths are beneath `/api/vendor/tenant/:tenantSlug/queue` and use the existing authenticated branch context (`?location=:locationSlug`).

- `GET /selection-options`: v3 services, queue-specific duration options, eligible extras and named members with explicitly provisional availability.
- `GET|POST /resource-members` (`poolId` query/body), `PATCH /resource-members/:id`: scoped, revisioned named registry. Writes require `Idempotency-Key`; updates require `expectedRevision`.
- `GET /service-policies`, `PUT /service-policies/:serviceId`: explicit queue duration/extra policy, independent of booking duration/price.
- Existing Draft/Publish routes accept `serviceSelections` instead of `lines`; the two models cannot be mixed. Note-only PATCH preserves selections.
- `POST /plans/:id/call`: common revisions and `counterSlug`; protects all current-stage children or commits a capacity-wait projection with no partial holds.
- `POST /plans/:id/start`: common revisions and exact `reservationGroupId`; revalidates all named and pooled members and starts them together.
- `POST /plans/:id/amend`: common revisions, `serviceSelections`, `expectedCatalogRevision`, `reason`, and `{customerAgreement:{confirmed:true}}` for removals or quantity/duration reductions. Before initial Start only. A failed called replacement preserves the previous plan and holds atomically.
- Child outcomes and retry use the commands above. Terminal outcomes are immutable; identical command replay returns its stored result. Changed commands with stale revisions fail.
- Existing multi-station Handoff/Pause/Resume/Reassign remain explicit; future children stay Pending without holds. Parent completion requires every current required child to succeed.

Published v3 DTOs retain nested `serviceSelections`, full `childAttempts` history and recorded reservation/allocation group membership. Child `execution.revision` is sent back as `expectedChildRevision`. Capacity wait identifies the affected `selectionId`, `selectionKind`, parent court selection and display names from trusted frozen demand, alongside plan/stage/observation evidence. Use returned `allowedActions`, `resourceWait`, group `resolutionState` and `resolutionSummary`; do not flatten mixed groups into successful completion or derive the current stage from the parent's first Start.

## Local evidence, 2026-10-17

The verified fixture dump before named migrations preserves all 14 existing tickets. Named Court 1–4 and queue policies were created via normal password/TOTP-authenticated administration endpoints. Equipment/trainer tracking was enabled only in the guarded loopback demo fixture; capacities, catalog names, booking durations and prices were preserved. Production settings and providers were untouched.

The real HTTP run issued VD007 (ticket 15) from one Pickleball Court Rental selection: Court 1/2 180 minutes, Court 3 60 minutes; Court 1 equipment 120 minutes and trainer 60 minutes, Court 3 equipment 60 minutes. Real dispatch/timing completed independent releases, explicit court/trainer interruption, selective retry preserving completed equipment, final parent completion and final-command replay. Database evidence records exactly one parent Start event, one parent Complete event and zero remaining active allocations.

Isolated PostgreSQL draft/publication suite: 50 passing tests. Coverage includes one-ticket allowance, shortage rollback, protection/conversion, per-child durations, release guards, partial/mixed resolution, retry rollback and lineage, agreement, failed called replacement preserving old holds, stale Start, command replay, expiry, validated whole-promise cancellation with actor-linked old/new audit, named multi-stage Handoff, and Retry contention with tenant deactivation. Separate legacy ledger/scoped-session regression: 237 passing tests. API read-only review closed the activity-lock, cancellation-validation and affected-child wait findings. These are backend/runtime evidence, not Opera or Mobile acceptance. Customer-safe v3 intake/projection, linked-customer notification delivery and aggregate browser/device acceptance remain separate gates.

### Corrected Opera functional acceptance

Vendor ran the bound v3 UI against real local API5007. Read-only backend collection independently verified the resulting rows:

| Ticket | Browser acceptance | Recorded execution |
| --- | --- | --- |
| VD008 / 16 | Exact three named courts and extras; independent extra/court releases; explicit court/trainer interrupt and selective retry; stale command from a second browser view rejected | One publication, one parent Start/Complete; six initial members plus two retry members; completed equipment retained on attempt 1; original group mixed and retry group completed |
| VD009 / 17 | Required Trainer quantity 4 shortage names Court 4/Trainor; Waiting without partial court hold; agreed removal; failed called replacement preserves court hold; committed completion response lost then same-key UI retry | One publication, one agreed amendment, one capacity-wait event; one court allocation/release; exactly one receipt for the lost completion operation |
| VD010 / 18 | Committed publication response lost then same-key UI retry; subsequent explicit service completion | One published ticket, one publication event, one allocation/release and one receipt for the lost publication operation |

All three tickets are served, each has exactly one parent Start and Complete event, and the final snapshot has **zero active allocations and zero protected reservations**. Recorded group membership/common Start, extra-parent Start/duration, preserved completed dependency and terminal-parent invariants pass. Runtime allowance operations remain zero because the existing allowance rollout flag is off; one-unit publication is proven in the isolated real-ledger tests, not claimed as runtime consumption. Plan notification outbox rows remain queued; external delivery was not enabled.

Backend verification artifacts are private under `.local-preview/replacement-20261016/`: `named-foundation-verification.json`, `named-lifecycle-verification.json`, and `named-aggregate-evidence.json`. Browser screenshots and replay-operation records are under the local visualization directory `2026/10/17/vendor-multiservice/`, including `v3-six-children-started.png`, `v3-required-extra-wait.png`, `v3-called-replacement-rejected.png`, `v3-selective-retry.png`, `v3-stale-child-command.png`, `v3-committed-response-lost.png`, `v3-publication-response-lost.png`, and `v3-final-parent-complete.png`.

Latest combined ledger/scoped-session/details/inventory regression: **275 passing tests**, in addition to the 50 draft/publication tests. Named source/shared-type lint, backend typecheck and diff whitespace checks pass. Vendor reports **280 frontend tests**, typecheck, lint and build passing. Direct v3 visual review covers 1440 dark, 768 dark and 375 light, including a 360px form without horizontal overflow and an overlong extra retained with its validation warning. Obsolete pool copy claiming no named court assignment was removed. Screens include `v3-review-dark-1440.png`, `v3-review-dark-768.png`, `v3-review-light-375.png`, `v3-editor-light-375.png` and `v3-editor-light-short-375.png`.

The persisted VD008 review is available at `http://127.0.0.1:5187/dashboard/queue?workspace=operations&business=vd-sports-club&request=d897f0c6-4d28-408b-ad9b-2632111bf810`. Opera is left on that server-backed review, with network interception and viewport overrides cleared and dark mode restored. No PR or production activation has been created for this aggregate preview.

## Implementation sequence and gates

1. Scoped named-member registry and immutable member revisions; queue-specific duration and extra eligibility policy.
2. Nested Draft/Publish and immutable snapshots, explicit catalog acceptance, one allowance.
3. Atomic named + pooled Call/Start, persisted unavailable-child reason, agreed pre-start replacement.
4. Independent child outcomes, partial groups, selective retry and parent/stage aggregation.
5. Authoritative Vendor and customer-safe projections, notifications and separate Platform metrics.
6. Exact Opera VD Sports Club acceptance, then separate Mobile customer/Zero32 evidence.

Issues #463/#464 contain the backend refinement; #465 covers stage integration and Vendor administration, #466 audit/notifications/metrics, #467 Mobile, #468 aggregate acceptance. Existing flat Linear acceptance is prior evidence only. No new PR until Carlo approves the corrected aggregate local preview; schedules remain paused and production/provider/inference gates remain unchanged.
