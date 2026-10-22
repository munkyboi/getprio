# Named courts and nested extras — Opera acceptance

Date: 17 October 2026 (Asia/Manila). Status: the local Linear Vendor court-and-extras flow is implemented and browser-verified. This is not full #461/#468 completion, publication approval, deployment or production acceptance. No PR/merge/deploy or schedule activation occurred.

## Reopen the actual server-backed result

http://127.0.0.1:5187/dashboard/queue?workspace=operations&business=vd-sports-club&request=d897f0c6-4d28-408b-ad9b-2632111bf810

Opera remains on VD Sports Club / Demo Courts. This request review reloads the authenticated v3 projection for VD008, not a fabricated local success state. Existing user tabs and catalog records were preserved. New named intake is separate from retained historical flat drafts; v2/v3 lists discriminate contractVersion and legacy scalar operations exclude active v3 ticket IDs.

## Direct browser evidence

| Check | Result |
| --- | --- |
| Exact selection hierarchy | VD008 / ticket16: one Pickleball Court Rental; Court1/2 each180min, Court3 60min. Court1 Basic Equipment qty1/120min + Trainor qty1/60min; Court3 Basic Equipment qty1/60min. Existing catalog spelling retained. |
| Draft save/reload | Actual form Save followed by full reload and Edit retained all six child selections/durations. Draft showed no ticket/position/hold. |
| Publish / atomic Call | VD008 created once; Call protected six recorded members across named courts, equipment and trainer pools. |
| Common Start | All six initial members started11:06:01. Each expected end used its own duration. Named count stayed one per court; no Hours-to-capacity conversion. |
| Independent release | Court3 equipment completed11:06:11; Court3 stayed held until explicit Complete11:06:15. Court1 equipment completed11:06:16; other courts/trainer stayed held. |
| Dependency gate | Court Complete action was absent until required extras completed. Parent remained in_service until the final required court completed. |
| Interruption / selective retry | Explicit Court1+unfinished Trainor interruption released only those members. Retry started those two at11:06:27; completed Court1 equipment stayed completed on attempt1 and was referenced as a satisfied dependency. Court2/3 did not restart. |
| Required-extra shortage | VD009 / ticket17 Court4 + Trainor quantity4 stayed Waiting while VD008 held one trainer. Server identified affected Court4/Trainor; no partial court reservation was shown. |
| Agreed extra removal | Removing Trainor before Start required reason and agreement. UI rejected submission without agreement. Accepted amendment then allowed Court4 protection. |
| Failed called replacement | Adding unavailable Trainor quantity4 back to called VD009 was rejected. Unsaved values/error remained; discarding only that edit allowed Start using the original Court4 protection. |
| Lost completion response / replay | Browser intercepted VD009 Complete POST response after server200, failed delivery, then cleared interception. UI retained the exact pending command and disabled further changes. Retry same command reconciled served state. |
| Stale command | Two Opera views loaded VD008. First completed Court2; second attempted the stale completion and received revision rejection. Other children remained intact. |
| Final parent | VD008 stayed unresolved after Trainor completion until Court1 explicit Complete11:09:07. Parent then served; group history remained mixed/completed without disguising prior interruption. |
| Lost publication response / replay | VD010 / ticket18 publication POST200 response was deliberately lost. Editor locked and Retry same command returned the one issued ticket. Normal Call/Start/Complete cleaned up this test. |
| Final residual capacity | Browser pool reads: Courts0/4, Equipment0/8, Trainor0/4 in use; all reservations0. Queue's final read-only collector independently confirmed0 active allocations and0 protected reservations. |

Replay operation keys are recorded in `v3-browser-replay-operations.json`: completion83b14351-a53c-44e3-8afc-7850ed165f5b, publication88763ab7-8ebb-4ed4-9f67-b805ddcd6ffc. Queue verified exactly one receipt for each and one parent Start/Complete event for each test ticket16–18. Existing fixture allowance controls remain off/bypassed; browser evidence does not prove a live allowance debit. Real allowance-service/ledger exact-once accounting is separate isolated backend test evidence.

## Responsive and accessible review

Actual v3 page widths375,768,1440 had no horizontal document overflow. Captured375 light review/editor and768/1440 dark review. The375×500 editor kept actions reachable with scrolling; dialog width360 had no horizontal overflow. Narrow testing found excessive default list/fieldset indentation; corrected it and shortened visible labels while preserving full accessible parent context. Changing court duration from180 to60 retained the extra's120-minute value with a review warning rather than silently clamping it. Keyboard Tab reached Save within the dialog; Escape opened the unsaved-change confirmation, and explicit discard removed only the disposable visual-check draft. Temporary viewport and response-interception overrides were cleared; original dark theme restored.

## Evidence locations

Screenshots: `/Users/carloabella/.codex/visualizations/2026/10/17/vendor-multiservice/`:

- v3-draft-reloaded.png; v3-six-children-started.png
- v3-independent-release.png; v3-selective-retry.png
- v3-required-extra-wait.png; v3-called-replacement-rejected.png
- v3-committed-response-lost.png; v3-publication-response-lost.png
- v3-stale-child-command.png; v3-final-parent-complete.png
- v3-review-dark-1440.png; v3-review-dark-768.png; v3-review-light-375.png
- v3-editor-light-375.png; v3-editor-light-short-375.png

Backend collector: Queue-owned `account-deletion-resource-plan/.local-preview/replacement-20261016/named-aggregate-evidence.json`. Queue owns metadata migration/backups and fixture configuration; Vendor made disposable requests through ordinary UI only.

## Remaining gates

- Multi-station configuration/editor binding and direct stage Handoff/Pause/Resume/Reassign browser acceptance remain separate from this Linear scenario.
- Linked-customer change notification/outbox/provider delivery and customer-safe Mobile v3/Zero32 acceptance are not established by these accountless Vendor requests.
- Existing local fixture allowance bypass remains unchanged; no actual paid service quote or charge was inferred. Explicit quote-unavailable policy was shown.
- Full role/branch/booking-backed regression acceptance, named overdue-duration browser observation and comprehensive assistive-technology audit remain broader acceptance items; focused backend tests cover additional guards separately.
- Grouped AI remains unsupported. Production activation, PR publication and aggregate preview approval remain independent gates.

Validation:280 frontend tests passed; final TypeScript, focused ESLint, production build and diff checks passed. Build retains the existing large-chunk advisory. Physical web on-screen-keyboard and full assistive-technology acceptance were not simulated by the short desktop viewport; they remain distinct checks under AGENTS.md. The modal uses the shared bounded task-sheet shell and task eyebrow/title structure.
