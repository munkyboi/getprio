# V4 configurable service intake — local acceptance

2026-10-17, actual Opera against local frontend 5187/API5007, VD Sports Club / Demo Courts. Interim aggregate preview only; no PR publication, merge, deployment or production write.

## Implemented

Add walk-in opens New service request within the existing local-demo capability boundary. Queue-day closed/paused, scanner, busy, unknown-result and server publication gates remain. Customer name receives focus. Root catalog selections determine single/multiple-service presentation; resource and extra rows never count as extra root services. Opening and saving do not publish.

New requests explicitly use contractVersion4; v3 requests keep their minute-based editor/history. Resource quantity is separate from duration count. Duration inputs use configured integer bounds/step/base/default/revision, fixed/visible policy and explicit count × base totals. Invalid values remain typed; policy refresh does not stamp a new revision onto retained counts. Explicit policy review is required after change. Published review uses frozen snapshot counts/base/minutes.

Services → Queue policy provides branch-scoped GET/PUT administration, owner/admin presentation gating plus server service-management grants, expectedRevision, explicit policy fields and idempotent unknown-result retry. Unconfigured policy has no inferred numeric defaults. Existing named registry is required before named assignment is offered. Extra choices remain the approved V4 leaf service selection with configured pooled demand; no nested extra resources or recursive extra-of-extra controls.

## Actual Opera lifecycle evidence

| Case | Observed outcome |
| --- | --- |
| Add walk-in | New service request dialog, Customer name focus, no immediate publication |
| VD013 / ticket21 | One root service, three named resources and three parent-specific extras; root count3×60=180 for Courts1/2, count1×60=60 for Court3; quantity1 each |
| Extra duration | Court1 Equipment count4×30=120 and Trainor count2×30=60; Court3 Equipment count2×30=60 |
| Draft persistence | Save, full page reload and reopen retained all counts, hierarchy and review state |
| VD013 lifecycle | Separate publication, Call protected6 members, Start at11:47:10 common to all6; Equipment/Court3 independent completion, Court1 remained held until Trainor completed; parent served11:47:32 |
| VD014 / ticket22 | Two root catalog services: Court4 quantity1/count1×60 plus automatic pooled BasicEquipment quantity2/count3×30=90; commonStart11:47:56, independent outcomes, served11:48:04 |
| Fractional input | After normal session refresh,1.5 rejected with "Provide a positive integer duration count"; typed1.5 retained, no total or automatic clamp |
| Independent backend collection | Queue confirms exactly1 parentStart/Complete each for tickets21/22, frozen totals/commonStart/extra-parent lineage correct,0active allocations and0protected reservations |

VD013 review: `http://127.0.0.1:5187/dashboard/queue?workspace=operations&business=vd-sports-club&request=1e4913d6-2094-4ca8-b165-fec17bb7439a`.

VD014 review: `http://127.0.0.1:5187/dashboard/queue?workspace=operations&business=vd-sports-club&request=adc81573-af8e-4a67-bb34-93c1fcb93715`.

Evidence directory: `/Users/carloabella/.codex/visualizations/2026/10/17/vendor-multiservice/`: v4-draft-reloaded.png, v4-six-children-started.png, v4-independent-release.png, v4-parent-completed.png, v4-fraction-retained.png, v4-multiple-root-intake.png, v4-admin-policy-saved.png.

## Administration save, stale policy and restoration verified

Service2 BasicEquipment GET revision2 showed automatic pooled, base30/min1/max6/step1/default2/visible, generic labels. Normal administration UI saved temporary revision3 with base45/default3 and duration label Session length. Server returned revision3 and135-minute default total. A separate own draft retained count3 and captured revision2; stale draft saving remained inert. Reopening against current policy retained count3, showed stale-policy guidance and no computed new total, and publication validation rejected the mismatch. Explicit policy review then showed3×45=135; a newly added resource used configured default3/base45/custom label. Unsaved verification edits were discarded. The saved own test draft remains unpublished; Mark's existing draft was not edited.

Exact original service2 configuration was restored via normal administration UI. The restore PUT committed200; its response was deliberately failed after commit. The editor locked all fields and dismissal and offered Retry same policy command. Retrying returned revision4, not a second update. Fresh configuration GET confirmed revision4, base30/min1/max6/step1/default2/visible, Duration label, automatic pooled assignment, empty extras and unchanged execution policy. Restore operation key: `4ba60f14-c543-4316-acef-32059e8fd923`. Queue independently verified all three baseline configurations match their original values, service2 has versions1/2/3/4 only, the restore key has exactly one receipt returning revision4, historical leaves are unchanged and no active holds remain (`service-v4-baseline-restored.json`).

A new actual intake after restoration used Duration, default count2 and2×30=60, quantity1 independently. Keyboard ArrowUp/Down returned to count2. Light375×700 and short375×500 showed no horizontal overflow, persistent Cancel/Save actions, Tab focus within the dialog and Escape unsaved-change confirmation with Keep editing. Dark375 administration likewise had no horizontal overflow and retained invalid fractional input for review. Original dark theme, viewport overrides and Fetch interception were restored/cleared after checks.

Local API request throttling was respected using its explicit306-second Retry-After. The expired local session was restored by normal password/authenticator sign-in. No limiter, security flag or authentication bypass was used. Command cache invalidation was narrowed to current request/queue/pool query families to avoid unrelated refetch amplification. Backend configuration baseline is restored; no temporary policy values remain.

Additional screenshots: v4-stale-policy-retained.png, v4-admin-to-intake-policy.png, v4-admin-unknown-locked.png, v4-admin-restored-375.png, v4-intake-restored-light-375.png, v4-intake-light-short-375.png. Queue independently confirmed six historical published service2 leaves retained base30 and their original allocation end durations while live policy base45 was active (`service-v4-historical-policy-change-evidence.json`).

## Scope correction

Carlo revoked the proposed V5 extra-service wrapper → own resources extension. Vendor made no V5 DTO, binding, schema or data changes. That proposal is cancelled and is not a required acceptance gap. Preserve approved V4 pooled extra leaves and the prior no-recursion boundary.

## Validation and remaining gates

289 full frontend tests pass, including eight focused API/count/policy tests. Final typecheck, build, focused lint and diff checks pass. Full-source lint has zero errors and three existing warnings in unrelated components. Build retains the existing large-chunk advisory. Fixed/hidden modes now have both focused tests and the actual persisted-mode check below; non-owner role acceptance remains an explicit browser gap. Physical web keyboard/assistive technology, broader business/role/branch acceptance, Mobile/provider/runtime billing evidence and full rework completion remain separate. Fixture allowance controls remain off; no browser debit claim.

Final review capture: dark1440×1100 and768×1000 document widths remained within the viewport; files v4-review-dark-1440.png and v4-review-dark-768.png. The main Opera tab is left on the VD013 review URL above with natural viewport and original dark theme. Temporary duplicate verification tab closed; no test form left open. Source/rules/tracker/preservation/migration and owned #465/#468 issue comments synchronized. No new PR or commit/push.

After Queue's copy-only API restart, only the own final-review tab was fully reloaded. VD013 authoritative review still showed the same frozen count/base totals, completed child outcomes and original allocation clocks. Capture: v4-review-after-api-restart.png. No user tabs/forms, policies or data were modified during this read-only follow-up.

Administration capture correction: replaced the incorrectly scaled `v4-admin-restored-375.png` with a clean, visually inspected 375×700 capture after a fresh read of restored revision4. CSS viewport, document and dialog widths all measured375px; no toast/error overlay, base30 and supported mode visible with persistent actions. Added `v4-admin-restored-default-375.png` for the unchanged default count/total area. This clean capture supersedes the earlier scaled image and the older dark capture with a throttle overlay. Only a new own QA tab was used; no fields were edited or saved, viewport override cleared and QA tab closed. Original main review remains open.

## Bounded persisted fixed/hidden acceptance — complete

Used only separate own QA tabs; Carlo's original review tab and forms were not navigated or edited. Archived fresh service2 configuration GET revision4 to `v4-fixed-hidden-baseline.json` before the test. Normal Admin UI saved fixed/hidden base30, minimum=maximum=default2, step1 as metadata revision5, operation key `7e3b0fdc-f7fe-4b5d-9b6b-a8de6c7a463d`. Fresh GET confirmed persisted revision5. Clean visually inspected375×700 admin capture: `v4-admin-fixed-hidden-375.png`.

New own unsaved intake rendered zero duration count controls and explicit2×30=60 minutes. Resource quantity changed1→2 while duration remained60; no draft save, publication, allocation or hold. Captured `v4-intake-fixed-hidden-375.png`, then discarded only the own unsaved form.

Normal Admin UI restored the exact archived adjustable/visible base30/min1/max6/step1/default2/Duration configuration as metadata revision6, key `acf08925-a4c5-4623-bc4a-a52ac885136a`. Fresh GET configuration JSON equalled the archived baseline exactly. `v4-fixed-hidden-restoration.json` records both configurations, equality and command keys. Clean375px restored administration screenshots were refreshed to revision6. A further new own unsaved intake confirmed the visible adjustable Duration control at default2 and2×30=60; captured `v4-intake-adjustable-restored-after-fixed.png`, then discarded/closed the QA tab. All temporary viewport overrides cleared; theme and original main review remained untouched.

Metadata revisions5/6 are legitimate configuration history under contractVersion4; they are unrelated to the cancelled contract-V5 proposal. The earlier revision4 lost-response/single-receipt proof remains its original checkpoint. Queue is independently checking final all-policy baseline, receipts, historical snapshots and zero holds. No source or runtime changes were introduced by this bounded test.

Queue independent final verification passed (`service-v4-fixed-hidden-final-verification.json`): all three configurations exactly match their baseline; service2 head revision6; each fixed/hidden and restore key has exactly one contractVersion4 receipt at metadata5 and6 respectively. Ticket count remains22 with zero new tickets/drafts from this bounded case and zero allocations/protected holds. Persisted fixed/hidden browser acceptance gap is closed. Non-owner browser and broader rework acceptance gaps remain as recorded; no PR publication.
