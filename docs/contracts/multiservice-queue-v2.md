# Multi-service queue v2 local integration

Source: #461 and decisions #455–460. This documents the retained **v2 flat Linear local preview** boundary on 17 October 2026. The approved named-resource and nested-extra refinement is implemented separately as [v3](named-resource-selections-v3.md), including independent durations/outcomes and corrected Opera acceptance. Existing v2 history is preserved. Multi-station administration/history has a tested foundation but no browser acceptance. Customer admission adapters and grouped inference/reconciliation remain incomplete. No new PR, production activation, provider delivery, or schedule change is authorized.

## Vendor HTTP boundary

Base `/api/vendor/tenant/:tenantSlug/queue`, existing `?location=` branch selector. Every request, including a receipt replay, rechecks current vendor permission and branch scope under the location transaction. Mutations require `Idempotency-Key` (1–120 visible ASCII characters). Successful replay returns the original committed result; the same key with changed action/entity/body conflicts. GET reconciles the current authoritative state after an unknown result.

| Method | Path | Input / response |
| --- | --- | --- |
| GET | `/service-options` | `{catalogRevision,services,queuePlanPolicy}` |
| GET | `/plans?state=draft` | `{plans,nextCursor}`; default state |
| GET | `/plans?state=active` | Published waiting/called or unfinished service plans |
| POST | `/plans` | `{customer,lines,notes,catalogRevision?}` → HTTP 201 `{plan}` |
| GET | `/plans/:id` | `{plan}` |
| PATCH | `/plans/:id` | Editable draft fields plus `expectedPlanRevision` → `{plan}` |
| POST | `/plans/:id/publish` | `expectedPlanRevision`, `expectedCatalogRevision` → `{plan}` |
| POST | `/plans/:id/call` | Common guards plus `counterSlug` |
| POST | `/plans/:id/start` | Common guards plus `reservationGroupId` |
| POST | `/plans/:id/complete` | Common guards plus `allocationGroupId` |
| POST | `/plans/:id/interrupt` | Common guards plus `allocationGroupId`, `reason` |
| POST | `/plans/:id/amend` | Common guards plus `lines`, `expectedCatalogRevision`, `reason`, optional `customerAgreement:{confirmed:true}` |

Common command guards are opaque string `expectedTicketRevision`, `expectedPlanRevision`, `currentStageId`, `expectedStageRevision`. Commands return `{plan}`. A capacity conflict returns HTTP 409 `{code,message,plan}` after persisting a scoped, revision-checked resource-wait explanation. No partial reservation or Called claim survives the failed Call. `allowedActions` comes from the server; consumers must not infer support from a state label alone.

List pages contain at most 50 plans. Supply the returned UUID `nextCursor` as `cursor`; a null cursor ends the list. The cursor comparison remains in PostgreSQL to preserve timestamp microseconds. Active list/detail reads transactionally expire due unstarted Call protection. Expiry returns that ticket to Waiting, clears the old counter claim and records the group as expired. It never releases actual allocation.

## Drafts and catalog review

Drafts are stored outside `tickets`: no number, queue position, resource protection, allowance consumption, or customer notification. PATCH preserves omitted fields; a supplied customer object or lines array replaces that field. Draft contacts `{name?,email?,phone?}` are walk-in details only. Registered identity cannot be attached or edited through these endpoints.

A draft line is `{lineId,serviceId:string|null,quantity:integer|null,durationMinutes:integer|null}`. Drafts may be incomplete. Bounds: at most 20 unique line IDs (1–80 letters/digits/underscore/hyphen), quantity 1–100, duration 5–480 minutes, notes 2000 characters, each contact 254 characters. Draft bounds do not establish publication eligibility. `expectedTicketRevision` is rejected on drafts.

Quantity is concurrent demand, independent of duration. Queue quantity never reuses booking quantity/Hours configuration. Service options expose independent `quantityMin/Max`, fixed catalog `durationMinutes`, `durationEditable:false`, service/configuration revisions, and resource readiness. Publication accepts active branch-offered services with ready mappings, rejects duplicate services and demand above pool capacity, and currently requires parallel lines from one pool. Busy resources do not prevent publication; the ticket waits for Call.

The catalog hash includes the active branch service snapshots, price/duration, mappings, revisions, pool capacity and tracking state. A draft saves the hash the customer/staff reviewed. Publication requires the saved hash and requested hash to match the current catalog. Missing/stale review returns `CATALOG_ACCEPTANCE_REQUIRED`; consumers show the current summary and require explicit acceptance before saving its token. They must not silently attach the latest hash to an old selection.

## Publication and operation

Publication validates the draft and current intake/maintenance/entitlement/hours/capacity policy, invokes the existing issuance transaction, and stores the ticket linkage, immutable plan version, first stage attempt, event, notification outbox row and command receipt atomically. One ticket is the usage subject; service lines, quantities, reservations, allocations and minutes are not ticket usage. Provider delivery remains disabled.

Stable line IDs and line revisions preserve service snapshots and frozen units-per-quantity, total units, duration, pool/requirement revisions and stage identity. The local beta supports multiple parallel lines from the same pool. Call protects every current-stage line in one group and interval; the five-minute unstarted TTL is separate from the requested service duration. Start revalidates the whole group and begins the full captured duration. No clock-based allocation release exists.

Quantity reduction requires an audit reason and explicit customer agreement. Called amendment cancels/replaces all protection within one transaction. Replacement failure preserves the old plan, version and group. Existing line prices are preserved; no automatic reduction, shortening, substitution or repricing occurs. Editing stops once allocation or service timing begins.

Reservation and allocation groups record expected member identities, plan revision, stage attempt and reservation attempt. Composite constraints protect tenant/branch/ticket/stage lineage and grouped line identity. Start checks each frozen tuple; release uses the recorded member IDs and one persisted release clock, independent of later catalog edits. A successful retried command does not create another group, allocation or service-start event.

## DTOs, errors and limits

Exact consumer types: `shared/queuePlanV2.ts`. Draft and published DTOs are distinct. Draft actions are `edit` and, once reviewed and sufficiently populated, `publish`. Published DTOs include parent state, all current plan lines, current stage attempt, recorded reservation/allocation groups, authoritative wait explanation, revisions and actions. Observation uses the database clock. Start is advertised only for complete unexpired protection matching the current plan and stage.

Errors use the existing `{message,code}` envelope. Important codes: `INVALID_PLAN`, `PLAN_NOT_PUBLISHED`, `PLAN_LOCKED`, `STALE_REVISION`, `CATALOG_ACCEPTANCE_REQUIRED`, `CUSTOMER_AGREEMENT_REQUIRED`, `RESOURCE_CAPACITY_UNAVAILABLE`, `RESERVATION_EXPIRED`, `INVALID_STATE`, `IDEMPOTENCY_CONFLICT`, `UNSUPPORTED_EXECUTION_MODE`. Counter, queue-day, maintenance, entitlement and allowance errors retain existing codes. Overdue Call reconciliation commits before its rejection is returned.

Workflow configuration and stage history now have persisted revisions and complete attempt history. The initial metadata baseline is Linear revision 1. The local fixture remains at that baseline; the Vendor Multi-station editor is unbound pending the model decision and browser acceptance. No automatic draft purge exists. Grouped inference/report/capture remains unsupported/not_ready; scalar v1 snapshots must not flatten or duplicate group members.

## Multi-station foundation — not browser accepted

`GET /workflow` requires Vendor Admin/Owner location-management access and returns `{workflow,counters,services,appliesTo:'new_publications_only'}`. The workflow is `{configurationRevision,mode,stations,stages}`. Stations are distinct UUID identities with `name` and permitted `serviceCounterIds`; ordered stages have `stageId`, `stationId`, `label`, and unambiguous `serviceIds`. `PUT /workflow` requires the same data plus `expectedConfigurationRevision` and the idempotency header. Every version is retained with its actor; published plans pin their configuration revision. Configuration changes apply only to new publications.

Publication records every nonempty selected stage as required, with future stages Pending and no future holds. Each current stage supports parallel demand from one pool. Its station and permitted counter lanes are frozen. History retains superseded unstarted attempts after amendments, completed attempts and interrupted attempts. Pre-start amendments atomically rebuild the required stage attempts; changing the first required stage returns an old unstarted call to Waiting rather than silently dispatching it elsewhere.

The common command guards also apply to `pause`, `resume`, `handoff`, `retry`, and `reassign`. Pause/Resume require the recorded allocation group and retain it. Complete on an intermediate stage releases that stage only, leaving the parent unresolved; explicit Handoff advances once to the next Waiting stage. Final required-stage Complete resolves the parent. Interrupt releases the current attempt, records its outcome, and leaves the parent unresolved; explicit Retry creates a new Waiting attempt of the same frozen stage, with no automatic allocation or ticket usage. The first parent start is recorded once; subsequent starts belong to stage attempts.

Within-station operator Reassign requires staff-management permission and `assignedUserId`. It retains occupancy and verifies the target's current branch and permitted-lane access. Cross-station rerouting is unsupported. The DTO includes only eligible reassignment names/IDs for an authorized administrator. Parent `in_service` may describe an unfinished workflow whose current child is Paused, Interrupted, or Completed awaiting Handoff; clients show the child state and server actions separately. V1 customer lifecycle adaptation remains outstanding and must not infer current-stage activity from the first parent start timestamp.

The isolated publication/group suite covers administration role denial, config revision/replay, frozen workflow version, current-stage-only protection, pause/resume/reassignment, explicit handoff, interruption/retry history, final completion and one ticket allowance. Real timing/dispatch stage acceptance and the Vendor editor remain outstanding. Schema integration only established the Linear baseline; no fixture was switched to Multi-station.

## Superseded flat-model limitation

The requested one-service example—one court for 60 minutes plus two courts for 120 minutes—must preserve two line IDs and independently release their recorded allocations. The current preview still rejects repeated service IDs and uses fixed catalog durations and whole-group completion. It does **not** satisfy that example yet.

The approved v3 refinement implements explicit selectable-duration policies, immutable child attempts, partial/mixed group resolution and selective court-tree retry preserving completed extras. The v2 restriction above remains intact for historical v2 tickets; new named requests use the distinct nested v3 contract. Expected ends remain advisory, and quote-unavailable is explicit where no rate policy exists. No automatic release or repricing is introduced.

## Evidence

On the new durable replacement fixture, normal password/TOTP HTTP verification issued fresh tickets 9, 10 and 11. It exercised two-line demand, three courts for 180 minutes, capacity failure preserving Waiting, explicit customer-agreed reduction from three to two, Call/Start, Complete and Interrupt. Six allocation members retained 180-minute durations and were explicitly released. Each ticket had one `service_started` event. Publication and Complete receipt replays left ticket/allocation/event/receipt counts unchanged. Existing user drafts and catalog records were preserved.

The runtime's existing allowance release control is disabled, so the runtime produced zero allowance-ledger operations. No activation flag was changed. Separate isolated PostgreSQL publication tests use the real allowance service and repository with test-only policy/control injection: one issued ticket consumes one unit exactly once, domain failure rolls it back, and amendments/Start/release create no extra usage. Real dispatch/timing HTTP evidence and isolated metering evidence are separate claims.

Vendor Opera Linear acceptance subsequently passed for VD004–VD006: three courts for three hours, capacity wait, required agreement for reduction, failed called increase preserving the old hold, atomic called line removal/replacement, Start, Complete and Interrupt. All browser acceptance capacity was explicitly released. Corrected v3 Opera acceptance is documented separately for VD008–VD010. Mobile/Zero32, Multi-station/admin browser acceptance and v2 reconciliation remain outstanding. No merge/deployment/production acceptance is implied.
