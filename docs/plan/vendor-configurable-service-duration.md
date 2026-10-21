# Business-neutral service resources and duration counts

Source: Carlo's authorized refinement relayed by Central on17October2026. Queue owns the canonical #461 update, backend contract/migration/snapshots, reviewed shared DTO and fixture backup/setup; API owns contract review. Vendor owns generic copy/controls and actual Opera acceptance. No PR before aggregate preview approval; schedules paused and production settings unchanged.

## Current implementation boundary

Shared user-facing copy now uses Service, Resources, Duration and Extras. Configured catalog/member names such as Pickleball Court Rental and Court1 remain intact. Stable v3 IDs, nested parentage, current request contents, quantity/duration values and runtime commands are unchanged. The existing local court setup continues its explicit common-Start and within-parent extra rules. This copy update does not claim configurable behavior or number-stepper delivery yet.

The tested v3 minute-select contract remains the current runtime until Queue hands off the reviewed successor. Do not infer stepper bounds/base/defaults from old durationOptionsMinutes, silently round/clamp existing minutes, rename live in-memory form fields in a way that loses unsaved user edits, rewrite historical snapshots/receipts, or imply automatic physical member assignment from pooled capacity.

## Approved count semantics

Duration count is an integer multiplier of a configured service base duration. Example: count3 × base60minutes =180minutes while one named resource remains quantity1. Concurrent resource/extra quantity is independent. Show the computed total explicitly alongside the count stepper.

The authoritative policy must expose revision, base duration, integer count bounds/step/default, fixed versus adjustable mode and visibility. Reject unsupported, fractional, stale or mismatched values without clamp/reprice. Preserve typed invalid values and prior accepted snapshots for review. Fixed/hidden behavior must follow actual policy rather than a global business assumption.

## Configuration semantics to consume explicitly

- Named assignment versus automatic pooled-capacity assignment. Do not promise an automatically chosen physical named member unless supported separately.
- Required/optional extras and eligibility, including explicit start and containment rules. Current court policy remains same actual Start and extra duration no greater than parent.
- Configured accessible labels where supplied, otherwise generic Service/Resources/Duration/Extras.
- Rate/quote policy is explicit and separate from queue fees. No inferred pricing or repricing.
- Stable service/resource/extra/attempt/member identities, revisions, atomic protection, explicit release, parent aggregation, selective retry and one-ticket allowance remain intact.

## Required next acceptance

Actual Opera VD Sports Club must show number steppers using reviewed policy: count3/base60 =>180 for resources1/2, count1/base60 =>60 for resource3; extra counts use their own base/revision and cannot exceed parent under this configured policy. Verify keyboard increment/decrement, min/max/step, invalid/fractional input, stale policy, explicit totals, draft reload, one publication, atomic Call/Start and independent outcomes. Reuse the existing v3 acceptance as historical evidence, not proof of the new count contract.

Presentation-only fixtures may verify generic labels; barber, clinic, coffee or other full business workflows remain unaccepted without their own configured runtime tests. Named/pool mode, fixed/adjustable/hidden duration and required/optional extra paths require actual capability-specific evidence before claims.

## V4 preparation checkpoint — 2026-10-17

Queue supplied the frozen `shared/queueSelectionPlanV4.ts` after 61 focused backend policy/PG tests. Vendor copied that shared shape and prepared `QueueDurationCount`: native integer number control with policy min/max/step, fixed read-only mode, configured visibility, explicit count × base total and captured-policy revision rejection. Invalid values remain unchanged; this control does not derive defaults or counts from v3 minute options. Two focused control tests and frontend typecheck pass.

This is preparation evidence only: the control is not mounted into intake, no v4 requests are issued, and no v4 browser/runtime acceptance is claimed. Queue still owns API restart, explicit fixture policy configuration, read-only API review and obsolete flat-draft inventory/backup/cleanup. Existing v3 history and current nested data are preserved. Binding and the actual Opera matrix above remain required after the runtime handoff. Schedules remain paused and aggregate preview approval is required before PR publication.

### Obsolete local flat-demo cleanup

Queue reports the fresh verified dump and full private row archive are complete (`flat-demo-archive.json`, `cleanup-verification.json` in its private replacement-preview directory). Removed only the four provenance-confirmed unpublished v2 test drafts: `bb03b8f6-98ed-441f-a3a1-5b5aa3462a48`, `89116e6a-4c33-4ab0-912f-8dd74af7876a`, `2ffdcdaf-e880-479f-bc6a-af3546fa5c32`, and `ab2ad982-3e9b-421d-af30-0bb3bd4c2b7b`, plus seven archived inert draft events required by foreign keys. All seven command receipts were preserved. Queue verified unchanged hashes for 18 tickets, 10 published plans, published snapshots, child history, allocation/reservation groups, receipts, policies, catalog and members. Backup SHA256: `011cb92393dfdab68a12633d62cebca9bfee63f6559d8c6a649c423fc063709e`.

This cleanup is separate from v4 runtime readiness. Queue reports 62 focused backend tests passing, including agreed count reduction; review and restart remain pending. Vendor browser v4 acceptance is still outstanding.

### Editable policy setup remains a separate required slice

The prepared intake count control consumes authoritative policy; it does not provide Vendor Administration policy editing. GET/PUT `/service-policies/:id/configuration` administration UI remains unimplemented and required before claiming configuration through the Vendor UI. Reviewed local fixture metadata can establish only configured-runtime behavior. Queue is fixing raw-minute legacy bypass and unconfigured-extra eligibility, with shared v4 shapes unchanged; intake runtime readiness remains pending. Configuration editing must preserve expectedRevision conflict handling and expose only supported single-level extra, assignment, duration and execution capabilities without inferred business defaults.

Central confirmed editable service-policy administration is required authorized scope, not optional future work. Sequence: first complete the v4 intake and actual Opera runtime milestone; then implement permission-gated GET/PUT configuration editing with expected revision, validation, base/count bounds, fixed/adjustable mode, visibility and supported assignment/extra policies. Record actual configuration save followed by intake policy consumption before claiming the overall feature complete. Intake-only preview remains explicitly interim. Current court configuration and published snapshots must remain preserved.

Prepared typed v4 intake and service-configuration API adapters from Queue's exact shared wrappers. Options explicitly request contractVersion=4; new draft payloads retain contractVersion=4 and count/revision inputs. Configuration GET preserves the server-provided configurationRevision even when policy is null; PUT carries expectedRevision and a caller-retained idempotency key. These adapters are not mounted or issuing mutations yet. Administration must show unconfigured state rather than derive legacy defaults. Unknown-result retry retains the same command; edited payload requires a new command, and stale revisions require explicit reload/review.

## Current bound V4 milestone

The previous preparation-only checkpoint is superseded by actual binding and Opera acceptance in `vendor-v4-configurable-intake-acceptance.md`. New requests use v4, while v3 historical requests retain their original minute-based editor and snapshots. Add walk-in uses the unified root-service-aware editor within the existing capability gate. Editable Services administration policy setup is implemented and its revision3 temporary save verified; exact baseline restoration/intake evidence is still being completed. Carlo revoked the proposed extra-wrapper/own-resources extension: it is cancelled, not a remaining required gap. Vendor introduced no v5 DTO/schema/runtime/data changes.

Final V4 administration acceptance supersedes the temporary-policy note: exact original service2 values restored at revision4, fresh GET and intake default2×30=60 verified, one-key response-loss replay returned revision4. Queue independently confirms all three baseline configurations, exactly one restore receipt, unchanged historical leaves and zero holds. Details and screenshots are in vendor-v4-configurable-intake-acceptance.md. Full suite289pass; typecheck/build/focused lint/diff pass. Fixed/hidden persisted-mode, non-owner browser and broader rework gates remain explicit.

Bounded persisted fixed/hidden browser acceptance is now complete: service2 metadata4→fixed/hidden5→exact baseline6, fresh GET and actual unsaved intake verified both modes, with no new ticket/draft/hold. Queue independent collector confirms all3 baseline configurations, one receipt per test/restore key,22 unchanged tickets and zero holds. Metadata revisions5/6 remain contractVersion4; cancelled contractV5 was not introduced. Non-owner browser and broader rework gates remain separate.
