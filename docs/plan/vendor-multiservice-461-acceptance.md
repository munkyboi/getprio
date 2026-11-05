Current named-court/extra Opera evidence: see `vendor-named-resource-461-opera-acceptance.md`. Flat v2 and unbound v3 preparation sections below are retained as historical checkpoints.

# Vendor multi-service queue acceptance (#461)

Status: implementation in progress. The approved 2026-10-17 named-resource/nested-extras refinement supersedes the flat same-pool milestone as the current acceptance target; see vendor-named-resource-461-contract.md. Draft, publication and Linear lifecycle commands are available in the loopback local demo using Queue's explicit runtime handoff. Multi-station remains incomplete. All scheduled tasks remain paused; no PR or production activation is authorized.

## Ownership and integration

Queue owns writable backend schema, routes, plan persistence, reservation/allocation groups, runtime integration and disposable demo tickets. API owns read-only contract and authorization/lineage review. Vendor owns consumers in `vendor-secure-queue-board`, preserving the aggregate uncommitted dashboard correction. Queue's contract document is `account-deletion-resource-plan/docs/contracts/multiservice-queue-v2.md`; its earlier `/drafts`/`units` proposal was superseded by `/plans`, `Idempotency-Key`, `contractVersion:2` and canonical `quantity`. Consumers must use the implemented, reviewed DTO rather than the stale proposal or v1 scalar reservation projection.

## Prepared local presentation

- `QueueServiceLines` holds stable local line IDs, service selection, units and duration in minutes independently. Quantity bounds and duration-edit permission must come from queue-specific service policy, never booking quantity/Hours settings.
- `QueuePlanDialog` separates Save draft from Publish, preserves editable walk-in versus protected linked identity/contact fields, requires amendment reason and explicit customer agreement for a reduced/removed request, resets agreement after line changes, and guards unsaved dismissal.
- These components are mounted through the draft-only panel using Queue's implemented contract. They do not create tickets, publish plans, reserve capacity or prove workflow readiness.

## Required authoritative browser evidence

- Draft save/reload: no issued ticket number, position, allowance charge, notification or capacity hold.
- Multiple service lines with stable IDs; three courts for 180 minutes means quantity3, duration180, not three booking-hours converted to resource demand.
- Publication exactly once with timeout/key replay reconciliation and one allowance charge.
- Waiting and Called edits before any allocation/timing; protected booking/payment/account identity fields.
- Atomic Call reservation across all current-stage line demand; capacity failure persists authoritative waiting reason and leaves no partial hold.
- Explicit customer-agreed reduction with reason; called amendment atomically replaces protection and preserves the previous plan/hold on failure.
- Start revalidation, actual server allocation, explicit Complete/Interrupt release by recorded IDs; no elapsed-time release inference.
- Linear/Multi-station admin choice is versioned, audited and pinned. Only current stage reserves; later stages wait. Stage commands and final outcome follow the approved contract.
- Revision races, stale settings, idempotency conflict and unknown timeout recovery preserve local drafts without false success.
- Opera VD Sports Club light/dark at375/768/1440px, short viewport, keyboard/focus, accessible actions and toasts above dialogs.

## Current evidence and gaps

Eight focused service-line, published-projection and command-identity tests pass. They cover units versus duration, missing services, protected plans, reduction detection, canonical draft serialization, authoritative waiting reasons and current-attempt recorded group identity. Draft-only authenticated runtime evidence is recorded below; publish/call/start/reduction/release evidence and the finished Opera demo remain outstanding. Existing v1/single-service fixture evidence does not satisfy this checklist. Do not mark #461/#462–468 complete based on UI, static tests or planning documents.

## Draft runtime milestone (2026-10-17)

Queue authorized exact draft-only bindings from `shared/queuePlanV2.ts`; copied that DTO into the consumer checkout. Local-demo-only QueueDraftsPanel lists cursor-paginated drafts, reloads before Edit, sends POST/PATCH with stable Idempotency-Key and expectedPlanRevision, and preserves/retries the exact command if its result is unknown. Publish is absent while allowedActions is edit-only; Enter in the form saves a draft. Full identity/contact fields are retained. Catalog duration is read-only; queue quantity uses the explicit draft1–100 contract and never booking quantity bounds.

Actual Opera created NEW Vendor multi-service review through the form: Court1 quantity3/duration60 plus Basic Equipment quantity1/duration60. Save returned revision1; full page reload and Edit retained both lines. No waiting ticket appeared, and observed pool panels remained0inuse/0reserved. This is draft persistence evidence only, not three-hour or same-pool allocation evidence. Screenshot directory `/Users/carloabella/.codex/visualizations/2026/10/17/vendor-multiservice/` includes draft-reloaded-dark.png and narrow draft-reloaded-dark-375.png.

NEW Demo court session A/B were created through normal catalog UI, each180min, offered at Demo Courts only. Existing user services were preserved. Normal resource mapping correctly rejected an edit to the already tracking-enabled Courts pool; the attempted draft was discarded, and the guard was not weakened. Queue then backed up the fixture and installed only the two fresh mappings to Courts pool1, one resource unit per quantity, under its guarded demo seam. This is fixture setup, not evidence that the planning editor can modify tracked pools. Final scenario will use fresh A/B draft(s) with combined quantity3 for180min, not Court+Equipment multi-pool demand. Publication/allocation acceptance still pending.

At this milestone265 frontend tests pass, typecheck/focusedlint/build/diff checks pass. Full unknown-timeout/revision-race browser checks, responsive/theme matrix and lifecycle/workflow acceptance remain outstanding.

## Same-pool draft and catalog review preparation

Actual Opera saved and reloaded NEW Three courts for three hours: Demo court session A quantity2 and B quantity1, each180 minutes. This proves the stored request only; Publish remains absent pending backend readiness. Queue mapped only these fresh service IDs7/8 to Courts pool1 after its fixture backup.

The draft consumer now carries catalogRevision without silently replacing it. When the server provides current catalog policy, it shows resource requirements and requires an explicit review checkbox to accept that revision; line edits clear acceptance. A saved duration that differs from current catalog is shown as a mismatch rather than silently normalized. New published-plan presentation is prepared from the shared v2 union but remains unmounted and has no command bindings until Queue explicitly declares runtime ready. Planned demand, protected reservation members and actual allocation/release members are separate; a null resourceWait never fabricates a waiting reason. The full flow is still incomplete.


## Linear Opera lifecycle milestone (2026-10-17)

Consumer binds Queue's shared v2 DTO and exact revision/group IDs. Publication is a separate command from Save: a changed request must be explicitly saved and reopened before publishing. Mutation keys/payloads are retained on unknown results; retry uses the same command. Active plans reload through the authenticated endpoint. Amendment submits only lines, catalog acceptance, revision preconditions, reason and any required agreement; customer identity, contact, notes and payment/booking records are not amended. Legacy scalar cards/table exclude current v2 ticket IDs and legacy ticket controls are disabled while v2 work is active. Queue separately added authoritative USE_QUEUE_PLAN_COMMAND guards to legacy commands.

Actual normal-auth Opera, VD Sports Club / Demo Courts:

| Scenario | Observed result |
| --- | --- |
| Reviewed draft | Three courts for three hours saved revision2 with explicit catalog acceptance, A quantity2 + B quantity1, each180min |
| Publish | One VD004 appeared; draft removed; no hold until Call |
| Call / Start | VD004 protected both lines then allocated3of4 Courts, expected09:51–12:51; no quantity/hour conversion |
| Shortage | VD005 quantity2 remained Waiting while VD004 held3; persisted resourceWait, no partial reservation |
| Complete | VD004 both allocation members explicitly released09:53 |
| Retry after capacity freed | VD005 Call then Start held2 |
| Three requested, two available | New VD006 A2+B1 Call stayed Waiting with persisted capacity reason |
| Waiting reduction | A1+B1 required reason and customer-agreement checkbox; submission without agreement was rejected by UI; accepted amendment retained180min |
| Atomic reduced Call | VD006 protected exactly2 across its two lines |
| Called amendment failure | Increase back to3 rejected for capacity; editor retained values/error and original protection remained usable |
| Called agreed reduction | Remove B with reason+agreement cancelled prior group and protected A1 |
| Start / Interrupt | VD006 started current recorded group; explicit reasoned interruption released1, stateUnserved/stageInterrupted |
| Final release | VD005 explicitly Completed; pool0of4 inuse,0reserved,4available; no active acceptance tickets remain |

Evidence directory: `/Users/carloabella/.codex/visualizations/2026/10/17/vendor-multiservice/`. Files include `three-courts-started.png`, `capacity-wait.png`, `three-request-two-available.png`, `agreed-two-courts-protected.png`, `called-amend-capacity-error.png`, `interrupted-release.png` and `linear-final-release.png`.

Allowance controls in this existing local fixture remain bypassed/off; the browser proves no actual allowance debit. Queue separately reports transactional real allowance-service/ledger tests for one unit per published ticket, replay and rollback. Keep this test evidence separate from runtime billing acceptance.

Remaining acceptance: Multi-station configuration/history, pinned future stages and transitions; Mobile contract/device acceptance; grouped inference/report/reconciliation; direct browser timeout/replay and stale-race exercises; complete keyboard and viewport/theme matrix. This is a usable Linear milestone, not completion of #461 or the full dashboard rework. No publication, merge, deployment or production activation occurred.

### Browser race and refresh follow-up

Two actual Opera editors loaded the same disposable Opera retry verification draft revision1. The second saved authoritative notes as revision2. The first stale save was rejected with "The plan changed. Reload before saving" and retained its unsaved text. Only that stale local edit was discarded; the revision2 server record was preserved. Screenshot: stale-revision-retained.png.

Network interruption exercise reached a confirmed draft save followed by a delayed list refresh, rather than a proven unknown committed mutation. Fixed consumers so post-success refresh does not hold command busy state or reclassify a confirmed mutation as unknown. This exercise does not establish timeout-after-commit replay acceptance; that remains an explicit gap.

Observed page widths375,768 and1440 had no horizontal document overflow;375×700 short view and light375/768 plus dark1440 were captured. Temporary viewport/network overrides were restored. Full keyboard/focus and complete cross-theme matrix remain separate gaps.

Basic keyboard check: draft autofocus reached Customer name, repeated Tab remained within the dialog (Close focused), Escape closed an unchanged draft and restored focus to New draft. Complete keyboard journey across populated service selectors, errors and all command dialogs still requires acceptance.

## Multi-station preparation (unbound)

Queue's proposed next contract separates station UUIDs from counter IDs, ordered stages with unambiguous service membership, and configuration revisions pinned at publication. Prepared controlled QueueWorkflowFields and local queueWorkflowDraft state only: Linear/Multi-station choice, named stations with permitted counters, ordered stages and service assignments. Referenced stations cannot be silently removed; stage reordering retains stable identities and assignments. Local validation flags unavailable references and duplicate service ownership. Two focused model tests pass. These fields are not mounted, saved or connected to runtime. Shared DTO and tested endpoint handoff remain required before integration; stage command/history projection will follow the authoritative union.

## Same service, different duration — newly identified contract gap

Requested case: the single Pickleball court rental catalog service appears twice: stable line A quantity1/duration60 and stable line B quantity2/duration120, with independent explicit completion/release. Current local Linear publication cannot represent this as an executable request: its contract rejects repeated service IDs, exposes fixed catalog duration (`durationEditable:false`), and Complete/Interrupt address the entire allocation group.

Vendor editor rows and draft serialization already use stable lineId identity; they do not merge/deduplicate by serviceId. Preservation regression now covers distinct repeated rows and durations, reordered-line amendment comparisons and unchanged catalog mismatch warnings. This does not authorize publication or editable duration.

Queue and API contract assessment requested: authoritative per-line duration policy/options and pricing implications; repeated-service validation; per-line/member command identity/revisions/allowedActions; full interval reservation and Start semantics; independent explicit completion/release and stage/parent finalization; retry, audit and reconciliation. Do not split this into invented catalog services as a substitute, silently normalize duration/quantity, or release actual occupancy because an expected end time passed. Multi-station service-to-stage uniqueness is configuration mapping only, not uniqueness of ticket service lines.
