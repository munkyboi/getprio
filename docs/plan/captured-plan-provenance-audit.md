# Captured-plan provenance: source audit and implementation gates

Status: source-only audit at main `1c6400670d7bc9c2f4842cabe437ce537564303e`, 15 October 2026 (Asia/Manila). This follows the [provenance watermark proposal](resource-provenance-watermarks.md) for [AI delivery #378](https://github.com/munkyboi/getprio/issues/378). It changes no schema, issuance, deletion, source binding, capture, snapshot acceptance or customer estimate. Source observations below are not a production database census or PostgreSQL acceptance results.

## Current writer inventory

| Entry point | Observed transaction/content behavior | Evidence still required |
| --- | --- | --- |
| Vendor walk-in with a selected service | [Vendor handler](../../backend/src/routes/vendorQueueHandlers.js) passes the selected service to [queue issuance](../../backend/src/services/queueService.js). Its persistence callback inserts the ticket, calls `captureStaffPlan` with that client, and appends the queue event. Vendor issuance uses the open vendor queue transaction. | Plan identity/version and plan-set invalidation must be minted in that same transaction. Current scope revision changes are not a certified plan-set generation. |
| Walk-in without a selected service | The same callback skips capture when the service is absent or empty. | Preserve explicitly unplanned work; neither capture nor readiness may invent a default requirement. |
| Booking arrival by staff/customer | [Booking check-in](../../backend/src/services/bookingService.js) runs in a resource scope transaction, re-reads/locks the booking, creates a ticket, captures its booking plan, links check-in and advances the operational scope on the same client. | Retain the same-client boundary when adding provenance; verify every failure rolls back issuance, lineage and generations together. Do not certify the wider authorization/deletion graph from this observation. |
| Customer check-in retry | A linked ticket returns before creating another ticket/plan. Staff duplicate check-in is rejected. | A replay must return the original frozen identity and advance no generation. This is not a general plan-write idempotency protocol. |
| Other queue issuance branches | The shared `createTicket` callback can run under customer issuance or a generic transaction depending on channel/project. `createTicketForTenantInTransaction` is also exported and called by booking check-in. | An optional parameter or exported helper is not an authorized plan writer. Reinventory actual callers and current admission/locking before widening capture to another source. No Developer API parity is claimed. |

The repository search at this checkpoint found two production calls to the capture functions above and one shared SQL insert in [ticketServicePlanService](../../backend/src/services/ticketServicePlanService.js). It found no dedicated application plan replacement/deletion API. That scoped search does not exclude operator SQL, dynamic SQL, future workers or external maintenance tooling.

## Frozen content and missing provenance

The [original plan migration](../../database/migrations/20261006_add_ticket_service_plans.sql) and [bootstrap schema](../../database/init.sql) use `ticket_id` as the plan primary key and scoped ticket/booking foreign keys. They constrain source, execution mode and a nonempty bounded JSON array. They add no plan generation, plan-set generation, source epoch, immutable-content trigger or plan tombstone. The migration's “immutable issuance snapshots” comment is intent, not database enforcement.

The service captures booking item lineage/schedule, configured durations and requirement/pool snapshots; staff capture reads an active service/assignment with SHARE locks and then its configured requirement. Booking capture selects bundle items or its single-item fallback. Requirement reads use the supplied transaction client. These facts do not establish complete configuration provenance or prove that every configuration publisher shares the required lock boundary. Preserve missing mappings and unsupported composition rather than substituting current catalog facts later.

Booking capture reads requirement mappings at check-in and combines them with the booking's captured items/schedule. Agreement with the earlier protected reservation/demand and allocation binding is not established by freezing those bytes. Before authoritative acceptance, explicitly verify or reconcile that agreement across mapping changes; this is an unproven gate, not a reproduced defect or permission to recalculate an existing plan.

`getTicketPlan().version = 1` describes the response format, including responses without captured content. It is not an immutable plan version, a monotonic generation or proof of historical completeness. `created_at`, a content hash and captured requirement/pool revisions also cannot substitute for that evidence. The [source assessment](../../backend/src/services/resourceSourceAssessmentAnalysis.js) correctly retains null plan/configuration watermarks, `not_ready` and a null snapshot.

`getTicketPlan` reads through its own default pool and accepts no caller transaction client. Its presentation response cannot attest a coherent observation of plan, configuration, work and revisions. The future bounded reader needs an explicit same-client consistency contract; callers must not compose separate presentation reads into authoritative provenance.

The immutable operational content boundary must include scoped work identity, source/booking lineage, execution mode, captured items and capture time. Catalog edits must not rewrite those facts. Which copied display fields require retention/redaction must be explicitly reviewed with privacy ownership; this audit does not authorize keeping copied personal data forever.

## Removal, privacy and maintenance inventory

| Path | Current source fact | Required treatment before provenance acceptance |
| --- | --- | --- |
| Ticket or booking deletion | Plan scoped foreign keys use `ON DELETE CASCADE`. An independently deleted booking can remove its plan even while the ticket remains; other constraints may prevent a particular parent deletion. | Trace the full deletion graph and held reservations/allocations before permitting removal. Missing rows cannot stand for released occupancy. Retain authorized scoped removal evidence sufficient to invalidate prior results and account for remaining work. |
| Actor deletion/anonymization | `created_by_user_id` uses `ON DELETE SET NULL`. [Approved anonymization](../../backend/src/services/accountDeletionAnonymizationService.js) explicitly clears this reference; [inventory policy](../../backend/src/services/accountDeletionInventoryService.js) enumerates it. | Permit the reviewed attribution redaction without changing frozen resource demand or treating it as new work. A blanket UPDATE prohibition would break this path. Privacy evidence/retention remain separate from forecast provenance. |
| Account-deletion request | [Deletion request service](../../backend/src/services/accountDeletionService.js) cancels waiting work and suppresses notifications; it does not call the plan capture functions. | Queue owner retains cancellation/protection/order integration. Do not add plan deletion or a new plan version just to represent a terminal work state. |
| Approved cleanup worker | [Deletion worker](../../backend/src/services/accountDeletionWorker.js) inventories references and delegates reviewed anonymization under its transaction. Its scan explicitly marks copied JSON and backup/restore coverage incomplete. | Do not equate FK inventory with a scan of plan JSON or complete deletion compliance. Coordinate immutable-content exceptions and future deletion evidence with this owner. |
| Bootstrap/rebuild and diagnostic cleanup | [Database apply](../../scripts/db-apply.sh) has an explicit rebuild flow; bootstrap drops tables. [Queue smoke](../../scripts/queue-lifecycle-smoke.mjs) cleans its tenant fixture. | Treat restore/rebuild/replacement and fixture teardown as source lifecycle events, not ordinary admitted plan changes. Reinventory any real maintenance job before declaring coverage. Never run these as a provenance repair. |
| Ordinary cancellation/claim/view | The plan service exposes capture and read, not a plan-edit operation. | Keep work-state revisions distinct from frozen content versions. Verify cancellation, claiming, carry-over, screens and service sessions cannot silently replace/duplicate a plan; broad lifecycle coverage remains unproven. |

No absence of a direct `DELETE FROM ticket_service_plans` statement proves deletion coverage: FK cascades bypass such a text search. Tenant/location and ticket/booking dependency chains must be enumerated under the actual schema, including RESTRICT edges. This audit does not authorize changing cascade policy or deleting retained operational evidence.

## Contract to review before implementation

1. **Trusted source epoch:** define how the server obtains a database/source incarnation, where it is stored/configured, and how restore/replacement invalidates old observations before acceptance resumes. Request input, hostname, database name, a timestamp or an initialized counter is insufficient. A fixed configured source binding by itself does not attest restore detection.
2. **Frozen plan identity/version:** choose a durable identity and positive exact decimal version bound to tenant/location/work/source epoch and captured content. Do not reuse an old identity after removal/recreation. A format version stays separate. Existing rows remain unknown; initializing new-write counters does not backfill provenance.
3. **Scope plan-set generation:** define durable creation/removal/supersession evidence and increment once per changed scope transaction, atomically with plan facts and required operational invalidation. Independently committed changes each advance; rollback, failed capture and successful replay advance nothing. All BIGINT values remain exact; overflow fails rather than resets.
4. **Database invariants:** prohibit unauthorized changes to operational identity/content, while explicitly allowing reviewed attribution anonymization. Decide how cascades produce scoped removal evidence and how parent deletion interacts with retained work/allocations. A trigger must not introduce a child-first/branch-first lock cycle or publish an epoch before facts commit.
5. **Writer admission:** capture helpers remain internal to an authorized caller-owned transaction. Preserve existing branch-first scope locks/current authority and same-client writes. Specify conflict/retry semantics rather than treating an insert uniqueness error as a successful replay. No helper may acquire late root locks inside an unknown caller transaction.
6. **Bounded coherent reads:** include plan identity, source epoch, plan-set/configuration evidence and operational work state in one authorized bounded observation. Reject stale asynchronous results or unknown/changed dependencies before use. Missing/unsupported plans, multi-pool/bundle/stage cases and unreleased occupancy remain visible.

These are review requirements, not a selected storage design or an implemented protocol. Schema/runtime integration requires queue operational-contract and API schema-owner review first. Reconciliation, tombstone retention/deletion and source reset handling must be specified together; choosing a counter alone cannot unblock a ready producer.

## Executable acceptance plan for the implementation slices

Use disposable PostgreSQL and actual selected caller boundaries. Existing tests are not counted as new proof in this source audit.

- Staff/booking capture commits ticket, frozen plan, booking lineage, operational revision and plan-set generation on the same client. Inject failure at each stage and COMMIT; no independent writes escape rollback.
- Retry/no-op/conflict cases distinguish a linked booking replay, duplicate plan insert, true changed transaction and new independent transaction. Verify exact adjacent BIGINT identities and overflow behavior.
- Catalog edits leave existing captured demand unchanged. Attempts to update identity/content fail. Reviewed actor nulling succeeds without changing content/version or inventing a new work plan.
- Check-in mapping changes cannot silently assert agreement between a captured plan and protected reservation/allocation demand. Verify supported binding or retain an unavailable reason; never rewrite prior demand to make the comparison pass.
- Delete/recreate, booking/ticket/tenant/location cascades and independent commits preserve durable scoped invalidation and retained allocation/work evidence. Both lock orders and legacy conflicting writers fail safely without deadlock-prone late lock upgrades.
- Missing selected service stays unplanned; missing mapping, unsupported bundle/stage/multiple pools and historic unknown plans keep honest reasons. No synthesized actual starts, default demand, retroactive mapping or version-1 backfill.
- Old/new readers see coherent epochs/facts/generations. Restore/replacement, reset, removed/recreated identities and delayed acceptance fail closed. Independently test exact scoped authorization and incomplete/oversized horizons.
- Preserve customer/vendor check-in semantics, queue lifecycle/service sessions, attribution cleanup and existing v1 consumers. Capture privacy, model evaluation and web/mobile/API delivery retain their own PRD tests and approvals.

## Next bounded slice and ownership

Review the source epoch, frozen-content exception and removal/retention contract with queue/API owners before choosing a migration. Then implement one actual capture path with atomic generation evidence and the tests above, listing all remaining writers/cascades. Queue owns deletion/session/provider graphs, historical reconciliation and complete snapshot/stream assembly; AI owns forecast acceptance/evaluation implications. Platform/Vendor/Mobile consumers need no new controls or public fields from this audit.

Until those gates are met, retain unknown watermarks, disabled tracking/coverage guarantees, `not_ready`, null accepted snapshot and existing customer estimates. #450's deployed offline evaluator does not provide any missing operational provenance, privacy approval or model-rollout evidence.
