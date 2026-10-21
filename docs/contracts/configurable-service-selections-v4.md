# Configurable service selections v4

Approved 2026-10-17 refinement of #461. Business-neutral names are Service, Resources, Duration and Extras, or explicit accessible configured display labels. Existing physical member and catalog names are preserved. This contract does not establish complete barber, clinic, coffee or other business workflows.

Implementation is local and uncommitted. Backed-up runtime migration and authenticated Vendor HTTP verification are complete; corrected Opera stepper and editable Administration setup acceptance are in progress. No PR, production flag, provider or schedule activation is authorized.

## Version boundary

`shared/queueSelectionPlanV4.ts` defines the exact Vendor DTO. Existing v2/v3 drafts, published snapshots and command receipts remain historical and unchanged. They are not silently converted from minutes to count. New explicit count-based intake uses `contractVersion:4`. Mixed draft/active lists remain discriminated by `contractVersion`.

Vendor paths retain the existing tenant/branch authorization and location transaction:

- `GET /selection-options?contractVersion=4` returns only explicitly configured v4 services, duration policies, named members, eligibility and provisional availability. The default options route remains the historical v3 reader.
- `GET|PUT /service-policies/:serviceId/configuration` reads/writes the explicit configuration. PUT requires `Idempotency-Key` and `{expectedRevision,configuration}`. GET returns `{contractVersion:4,configurationRevision,policy:null}` when unconfigured, never an inferred business default; the current revision remains available for an explicit first configuration. A configured policy contains `{contractVersion:4,serviceId,revision,configuration}`. Successful PUT returns `{contractVersion:4,configurationRevision:newRevision,policy}`. Identical command replay returns the stored result; changed payload with the same key conflicts, and a new key with a stale revision returns `STALE_REVISION` (409).
- Existing Draft/Publish/Call/Start/child outcome/Retry/Amend paths support v4. Draft creation and count-based amendments include `contractVersion:4`. Changing a historical draft or published plan's input contract is rejected; create a new request instead.
- Customer intake endpoints and safe customer projection remain separate and are not replaced by Vendor routes.

## Explicit configuration

```json
{
  "labels": {"service":"Service","resources":"Resources","duration":"Duration","extras":"Extras"},
  "assignment": {"mode":"named","allocationIdentity":"named_member"},
  "duration": {"mode":"adjustable","visible":true,"baseMinutes":60,"minCount":1,"maxCount":3,"stepCount":1,"defaultCount":1},
  "extras": [{"serviceId":"2","selection":"optional"}],
  "execution": {"resourceStart":"together","extraStart":"with_parent","extraContainment":"within_parent","selectedExtraResolution":"explicit_required"}
}
```

The configuration revision covers duration, assignment, eligibility, execution and labels. Options expose `policyRevision`, `durationPolicy.revision`, `assignmentPolicy.revision` and `executionPolicy.revision`; each is the same captured version of this atomic configuration. Historical snapshots retain their own captured policy rather than reading current settings.

Supported assignment is named member selection or `{"mode":"automatic","allocationIdentity":"pooled_capacity"}`. Automatic means anonymous pooled capacity, not automatic selection of a physical named member. The latter capability is explicitly false. Quantities remain concurrent resource demand, independent of duration count.

Duration count and base are safe positive integers. Bounds use `minCount <= count <= maxCount` and `(count-minCount)%stepCount === 0`; the configured maximum and default must also lie on the step. Supported total duration remains 5–480 minutes. Fixed mode requires min=max=default and step 1. Hidden duration must be fixed; hiding affects presentation only, and the accepted count/policy are still submitted and snapshotted. The UI uses a number stepper, displays the explicit configured base and computed total, and never derives these values from old option lists, resource quantity, booking Hours or price.

Required eligibility means the extra must be selected for each parent resource; optional eligibility permits omission. Every selected extra remains a required execution dependency with explicit resolution. Selection optionality never authorizes an implicit drop, late start, automatic completion or release.

The currently supported execution choices are only `together`, `with_parent`, `within_parent` and `explicit_required`. Unsupported values are rejected and unavailable in setup UI. These are explicit captured policies, not assumptions inferred from a business type. Existing court behavior remains configured this way. Broader timing or allocation modes require their own implementation and acceptance.

Extras have one supported level. A service selected as an extra cannot itself introduce nested extras; configuration checks both outgoing eligibility and reverse references, and capture rejects malformed stored nesting. An unconfigured optional extra is shown unavailable without blocking a valid parent that omits it; an unavailable required configuration blocks parent readiness. Legacy minute-based requests cannot bypass a v4-configured root or extra.

The proposed V5 extra-service wrapper with explicit own `resources[]` was cancelled by Carlo on 2026-10-17 before implementation. No V5 wrapper code, schema, migration, binding or runtime data existed. A later explicit request separately authorizes flat named extra member selection under the additive [named-extra-members-v1 contract](named-extra-members-v1.md): one extra group selects exactly its quantity of members from its own configured pool, without introducing a resource hierarchy. Automatic extras retain pooled quantity-only selection. `extra.resources[]` and recursive extras remain unsupported; the cancelled V5 wrapper is not reinstated.

## Count input and frozen output

Each resource/extra input submits `durationCount` and `durationPolicyRevision`; it does not submit authoritative minutes or pricing:

```json
{"resourceSelectionId":"resource-a","resourceMemberId":"scoped-member-uuid","quantity":1,"durationCount":3,"durationPolicyRevision":"2","extras":[]}
```

The server computes and freezes `durationCount:3`, `baseMinutes:60`, `durationMinutes:180`, `durationPolicyRevision:"2"` and the full accepted `durationPolicy`. Resource quantity remains 1. Current policy edits cannot rewrite historical totals or trigger repricing. Stale revisions, fractional/out-of-bounds/off-step counts, altered fixed counts, tampered total fields and parent containment violations are rejected without clamping, substitution or repricing.

## Preserved execution boundaries

Stable service/resource/extra IDs, named member scope, immutable child attempts, revision guards, atomic named + pooled protection, explicit Start/release, partial group outcomes, selective resource-tree retry and one-ticket publication accounting remain the same tested lifecycle. New raw-minute requests cannot bypass a service's v4 policy; old published requests continue with their captured policy and recorded allocations.

One catalog service has one root selection with multiple resources/extras. Duplicate root catalog IDs are rejected rather than silently merged. Multiple distinct root services are supported; count only `serviceSelections`, not resource or extra children, when classifying the request. A selected extra's catalog service can independently be another explicit root with its own resource demand and duration, subject to atomic aggregate capacity.

No policy metadata creates a hold or activates tracking. Runtime fixture changes require a verified database backup first; production gates remain unchanged. Customer delivery, Mobile/Zero32, complete business workflows and broader multi-station browser acceptance remain separate evidence gates.

## Current local evidence

- Verified custom backup before v4 metadata migration: all 18 existing ticket rows, historical plan and command-receipt hashes unchanged; zero active allocations or protected reservations. No configuration defaults were inferred by migration.
- Explicit queue policies were saved/reloaded/replayed through ordinary password/TOTP-authenticated administration endpoints. Service 1 uses named members with base 60, count 1–3, step 1, default 1; services 2 and 6 use automatic anonymous pooled capacity with base 30, count 1–6, step 1, default 2. All are currently adjustable/visible; eligible extras 2/6 are optional selection, and selected extras retain explicit resolution. Existing catalog names, prices, booking durations, capacities, named members and production flags were preserved.
- Real HTTP VD011 / ticket 19 verifies one root service with six execution children, `3 × 60 = 180` minutes and resource quantity 1, stale policy/fractional count/tampered total rejection, publication replay, common Start and independent explicit completion. One parent Start/Complete event and zero residual allocations/holds were recorded.
- Real HTTP VD012 / ticket 20 verifies two distinct roots: named resource quantity 1 for 60 minutes, and automatic pooled quantity 2 with `3 × 30 = 90` minutes. One ticket/publication replay, common Start, separate explicit outcomes, duplicate-root rejection, and zero residual allocations/holds were recorded.
- Focused policy/draft/publication suite: 66 passing tests, including fixed/hidden policy, step bounds, agreement for count reduction, required/optional/unconfigured extras, nesting/bypass rejection, frozen historical queue-policy base changes, automatic allocation and multiple root services with one allowance unit. Shared type compilation and named policy-source lint pass. API read-only review closed all three raised contract blockers.

### Opera intake and Administration acceptance

The bound V4 UI ran through the unified Add walk-in → New service request flow. VD013 / ticket 21 saved and reloaded one root service with three named resources and three pooled extras, displayed count/base arithmetic independently from quantity, published/called/started six children together, and explicitly completed all children. VD014 / ticket 22 used two root services with named and pooled resources; resource quantity 2 and duration `3 × 30 = 90` remained separate. Independent database collection confirms one publication and one parent Start/Complete per ticket, exact group membership and zero residual allocations/holds. Fractional input was retained and rejected, rather than clamped.

Administration → Services → Queue policy was exercised through normal UI GET/PUT. Service 2 changed explicitly from base 30/default 2/Duration to base 45/default 3/Session length (revision 3). New intake consumed the saved label/default/base. A separate stale draft retained count 3 and revision 2 and did not show a recomputed total until explicit policy review; acceptance then displayed `3 × 45 = 135`. Six previously published V4 service-2 leaves and their allocation clocks retained the original frozen base 30 and totals.

The exact baseline configuration was restored through UI to revision 4. Its committed HTTP 200 response was deliberately lost; the locked unknown-result state retried the same key `4ba60f14-c543-4316-acef-32059e8fd923`, returning revision 4 without creating a duplicate next revision. Independent SQL at that checkpoint verified exactly one actor-linked receipt, policy versions 1–4 only, baseline configuration equality for all three services, unchanged historical snapshots and zero active allocations/protected reservations. The local rate-limit cooldown was respected; no limiter/security setting was changed. Query invalidation was narrowed to relevant request/resource/queue families to avoid unrelated refetch amplification.

A second bounded normal-UI check closed persisted fixed/hidden acceptance. Service 2 was explicitly saved as fixed/hidden, base 30, min=max=default 2 and step 1 at metadata revision 5. New owned unsaved intake exposed no duration count control, displayed `2 × 30 = 60`, and allowed resource quantity to change independently. Only that owned form was discarded; no draft or ticket was saved. Normal UI restored the exact adjustable/visible baseline at metadata revision 6. Independent SQL confirms one receipt for each operation, contract version 4 for both (metadata revision 5 is not the cancelled V5 contract), unchanged 22-ticket inventory, zero new tickets/drafts during the check and zero holds. Current policy revisions are service 1:2, service 2:6 and service 6:2; all baseline values match.

The user's Mark draft and catalog form were not modified. The owned unpublished policy-revision QA draft is intentionally retained; it is inert, and no additional cleanup was authorized. Final visual/build evidence is owned by the Vendor acceptance document. The editable setup workflow is now actual UI evidence, not merely fixture metadata.

## Authorized obsolete local demo cleanup

After a fresh verified database dump and full private archive, exactly four confirmed unused unpublished flat v2 test drafts were removed: `bb03b8f6-98ed-441f-a3a1-5b5aa3462a48`, `89116e6a-4c33-4ab0-912f-8dd74af7876a`, `2ffdcdaf-e880-479f-bc6a-af3546fa5c32`, and `ab2ad982-3e9b-421d-af30-0bb3bd4c2b7b`. Seven inert draft audit rows were removed only because their foreign key required it. All seven command receipts were retained. Published ticket/plan/history, nested selections, policies, catalog, resource and receipt hashes were unchanged. Private backup/archive and verification artifacts remain under `.local-preview/replacement-20261016/`; no unknown or user-owned draft was selected.

## Local review readiness

The approved V4 slice is ready for local review. Final verification records 66 focused policy/draft/publication tests plus 275 ledger/session/details/inventory regressions, and 289 frontend tests; backend/shared/frontend type checks, build, focused lint and diff checks pass. The clean 375px Administration and fixed/hidden intake captures were visually inspected. No PR, commit or push was created.

Review VD013 at `http://127.0.0.1:5187/dashboard/queue?workspace=operations&business=vd-sports-club&request=1e4913d6-2094-4ca8-b165-fec17bb7439a`. Vendor acceptance detail is in the companion `vendor-secure-queue-board/docs/plan/vendor-v4-configurable-intake-acceptance.md`. Non-owner browser, customer/Mobile and broader multi-stage/business-flow acceptance remain separate.


## Flat named extra verification (2026-10-17)

The additive v1 source passed 70 isolated PostgreSQL publication tests and 14 draft/duration tests, plus selected lint and backend typecheck. API read-only review closed the execution-fanout and mixed anonymous/named same-pool findings. Authenticated local HTTP ticket VD016 / 24 used separate QA services 11/12: one named court and an extra group with two named trainers. All three started together; completing one trainer released only that member. Ordinary and validated-own-protection previews differed correctly. Completion left zero allocations/holds and emitted one parent Start/Complete. Baseline checks preserved all 18 prior drafts, 23 prior plans and 168 prior command receipts. These are local backend results; dynamic Vendor browser acceptance, PR, merge and deployment are separate gates.
