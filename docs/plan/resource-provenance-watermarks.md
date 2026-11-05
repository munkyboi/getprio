# Resource configuration and plan provenance watermarks

Status: proposed implementation contract for Stage B2 of [AI Wait-Time Prediction #378](https://github.com/munkyboi/getprio/issues/378). Source checkpoint: main `6226ea3c4d70e4d9cf2e393381b810ae9ed10170`, inspected 13 October 2026. This specification adds no schema, runtime adapter, repair, capture, activation or customer estimate. It does not certify writer coverage. The queue/resource owner reviews operational contracts; the AI owner reviews forecast acceptance and evaluation implications.

## Problem and current evidence

The [source assessment](resource-source-assessment.md) returns unknown configuration and plan watermarks and a null forecast snapshot. Its [analysis](../../backend/src/services/resourceSourceAssessmentAnalysis.js) deliberately does not promote content fingerprints or individual pool/requirement revisions to complete provenance.

The [ledger schema](../../database/migrations/20261007_add_resource_ledger_foundation.sql) has a positive scope revision with writer coverage constrained to false. The [plan schema](../../database/migrations/20261006_add_ticket_service_plans.sql) captures issuance content without a monotonic plan revision or immutable-content trigger; ticket/booking deletion can cascade plan deletion. [Plan capture](../../backend/src/services/ticketServicePlanService.js) preserves configured demand at issuance. These are source facts, not a fresh production database census.

Selected configuration writers now advance affected scope revisions, including [tenant queue settings](tenant-queue-settings-resource-writer.md) and [staff access edits](staff-access-resource-writer.md). Those adapters do not prove every entry point participates. The [coverage inventory](resource-writer-coverage-status.md) remains a historical checkpoint with concrete gaps. A new counter alone cannot establish that older plans, omitted writers or deletions have been accounted for.

## Proposed evidence model

Keep three distinct concepts. Their names below are conceptual, not a migration or public wire contract.

| Evidence | Required meaning | Does not prove |
| --- | --- | --- |
| Scope configuration watermark | An exact location-scoped, positive monotonic generation covering committed changes to declared operational configuration dependencies. | Occupancy, complete inventory, historical reconciliation or stable actor authorization. |
| Frozen plan identity/version | An immutable captured work plan with exact tenant/location/work identity and a positive version established by its writer. | Current mapping validity, supported composition, authentic service start or permission to rewrite admitted work. |
| Scope plan-set watermark | A positive monotonic generation covering creation, approved supersession and removal of captured plans in that scope. | That all work has a plan or that removed work can be omitted from occupancy. |

The existing ledger revision remains the operational invalidation signal. A later implementation must specify how its transaction advances alongside these narrower generations. Do not alias configuration or plan-set generations to the ledger revision unless complete dependency coverage and equivalent semantics are demonstrated in review.

All persistent identities and generations must travel as validated exact decimal strings, never JavaScript numbers. Compare within the same trusted source binding, tenant and location; after database restore/replacement, old observations must be invalidated rather than treating a lower/reset generation as current. The source-binding invalidation mechanism is a prerequisite to acceptance, not an identifier supplied by a request or an assumption based on database name.

An unknown watermark remains null with a classified reason. The existence of a newly initialized counter does not prove historical provenance. Proposed diagnostic fields must stay separate from the existing accepted snapshot envelope until its versioned consumer contract is reviewed.

## Configuration dependency inventory

Before implementation, inventory the actual fields and all their writers, with links to source and PostgreSQL acceptance evidence. Use this minimum boundary:

| Dependency family | Include when changed | Exclude narrowly |
| --- | --- | --- |
| Capacity and service demand | Pool creation, capacity/active-state changes, requirement creation/edit/removal, service duration/active state and branch assignment changes. | Display-only labels/photos that no forecast or dispatch rule reads. |
| Schedule and eligibility | Availability, operating hours/timezone, branch/tenant activity and queue policy fields consumed by dispatch/admission or the declared predictor. | Alert-only thresholds and contact fields that no operational rule reads. |
| Operational access and lanes | Counter configuration/assignments and staff grant/status/location changes that affect operational eligibility. Include global user suspension/deletion paths where applicable. | Authentication refresh or notification delivery without an operational access change. |
| Tracking and lifecycle policy | Any separately approved future tracking/lifecycle policy mutation. | A read-only readiness report; this specification does not enable tracking. |

Queue Day transitions, segment lineage, reservations, allocations and ticket outcomes retain their own operational revisions. They are not silently absorbed into a configuration generation. If a proposed dependency is actually work state, document its authoritative version and include that version in acceptance instead.

Tenant/global changes must identify every affected branch before mutation, using reviewed discovery/revalidation and lock ordering. A removed staff grant still invalidates the branch it previously affected. Unchanged normalized saves do not advance a generation. Changing a dependency and restoring its prior value in a later transaction advances twice; a matching content hash cannot erase that history.

## Writer and deletion contract

1. Validate scope and current actor/system authority through the existing branch-first transaction conventions. Preserve held grants, lock ordering and current actor revalidation. A watermark is never an authorization grant.
2. Write configuration or plan facts and their affected generations with the same database client and commit. Keep operational ledger invalidation in that transaction. Never publish a new watermark before the mutation or after a separate commit.
3. A transaction touching several dependency rows advances each affected scope generation once. Independently committed mutations each advance it. No-ops and idempotent retries that replay a committed command do not advance it again; failed transactions advance nothing.
4. Prevent lost updates with atomic database increments under the compatible scope locks. Detect generation overflow and fail the mutation; never wrap, reset or coerce to a floating-point value.
5. Deletion needs observable generation advancement even when the deleted row disappears. Retain scoped deletion/supersession evidence sufficient to invalidate prior accepted work references; row-local revisions alone cannot observe removal. The implementation must specify durable evidence, access, retention and deletion semantics before choosing storage.
6. Recreating a pool, requirement or plan never reuses the deleted identity/version to appear unchanged. Deactivating a pool or deleting a mapping does not release held allocations, cancel protected reservations or rewrite frozen ticket plans.
7. Trace direct SQL, migrations, workers, callbacks, lazy reads and account-deletion cascades explicitly. Either adapt them to the same contract or retain an unresolved coverage blocker. Database enforcement can guard invariants but does not invent missing legacy provenance or replace actor authorization.

## Frozen plans and lifecycle

Issuance records the accepted source, booking/item lineage when present, execution mode, configured duration and resource demand. A plan version identifies that captured content; later catalog changes cannot mutate it. Current v1 unsupported bundles, multi-pool work, stale mappings or unknown demand still receive honest unavailable reasons.

Normal ticket cancellation changes work state and the operational ledger. It must not rewrite the frozen plan or claim a new plan version merely to represent cancellation. If an independently approved operation truly removes/supersedes a plan, it advances plan-set provenance with durable evidence and preserves required links to work, reservations and sessions. This contract introduces no plan-edit operation.

Printed/unclaimed tickets and claimed tickets retain the same work identity. Opening a customer screen or scanning a QR code creates neither a second plan nor a provenance generation. A ticket with no selected service remains unplanned; no default plan is synthesized to satisfy readiness.

## Reads, acceptance and legacy state

Read watermark evidence, configuration, plans, work, reservations and allocations in the same bounded coherent authorized observation. Preserve missing/unknown facts and row/byte/time limits; a partial scan cannot attest a complete horizon. Retain the existing fresh authorization checkpoint separately from revision comparison.

A future accepted forecast must bind every dependency it consumed to its exact source/scope and observation. Before use or delivery, reject a result when any required generation, work/Queue Day version, source binding, authorization or freshness condition has changed. An unchanged configuration generation does not make a changed queue result current. Configuration invalidation also does not prove actual occupancy; explicit unreleased allocations remain authoritative even after expected end.

Existing records are unknown until separately reviewed reconciliation establishes their provenance or defines an explicit supported exclusion with complete work accounting. Do not bulk assign version 1, substitute current catalog mappings, infer revisions from timestamps, or erase unknown work. Initializing generations for new writes must leave historical completeness unproven. Repair/exclusion policy and source-reset handling require their own review and acceptance evidence.

Keep tracking and coverage database constraints, `not_ready`, null snapshot and current public estimates unchanged throughout these prerequisite slices. Platform controls cannot override unknown provenance or make an incomplete writer set complete.

## Required automated acceptance evidence

The implementation plan inherits the PRD's tests for all five AI areas. For this prerequisite, use disposable PostgreSQL and bounded consumer tests:

- Concurrent writers serialize exact generation changes; adjacent BIGINT identities stay distinct; rollback, commit failure, overflow, retry and no-op cases preserve atomicity.
- Multi-row and tenant/global updates invalidate each affected scope once, including removed grants, branch discovery races and independently repeated changes back to prior content.
- Delete/recreate and account-deletion cascades cannot bypass invalidation, erase held allocation evidence or reuse old provenance. Retention/deletion decisions remain explicit.
- Frozen plan content survives catalog edits; capture failure rolls issuance back; cancellation, claiming and screen views cannot rewrite/duplicate it. Missing and unsupported plans remain visible.
- Readers observe coherent old or new facts/generations, never mixed versions; revocation, incomplete horizon, unknown history, restore/source reset and stale asynchronous results fail closed.
- Existing queue/session operations and protected booking conversion remain compatible. No test or synthetic score enables tracking, capture or customer rollout.

This documentation slice performs source/link/diff review only. It adds no executable tests and claims no mutation, migration or live diagnostic acceptance.

## Delivery and ownership

Implement in reviewed slices: complete field/entry-point inventory; choose storage and database invariants; integrate selected configuration writers; integrate plan capture/deletion evidence; then extend the private assessment and versioned consumer validation. Every slice must list remaining gaps. No ready producer or activation follows from an intermediate migration.

Coordinate handler/repository/schema reservations with queue/API owners before implementation. Vendor, Platform and mobile owners consume reviewed contracts; they need no new form fields or public payload for this private specification. B3 complete snapshot assembly, B4 byte adapter, privacy-approved capture and representative actual-start evaluation remain subsequent independent gates.
