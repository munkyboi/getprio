# Vendor named-extra and interval-preview acceptance — local only

Updated2026-10-17. This is local implementation and verification evidence, not PR approval, merge, deployment, billing acceptance, or production readiness. The aggregate preview remains under review and schedules remain paused.

## Boundaries and contracts

Vendor checkout: `web-app/worktrees/vendor-secure-queue-board`. Runtime: frontend5187/API5007/localPostgres55494. Queue owns the runtime/backend. Its exact tested `shared/queueSelectionPlanV4.ts` was copied with explicit ownership handoff and verified byte-for-byte unchanged. Queue's consumer contract review identified the selected maintenance/archive parent-name fallback; the UI now retains known names plus reasons and has a focused regression. Backend source/PG results remain separately owned evidence.

The integration uses additive flat V4 `namedExtraMembers` and `namedResourceAvailability` capabilities. No V5 resource hierarchy, runtime activation or inference changes. Member IDs survive local edits, transport, saved draft reload and promised-member reduction detection. Published named extras consume frozen individual `memberExecutions`; automatic extras keep one execution. The whole-tree preview includes pooled demand, debounces edits, aborts superseded work, checks request/catalog/editor context, refreshes every15seconds and relevant events, and honors Retry-After. Preview never reserves resources.

## Direct Opera checks

Only dedicated QA services11/12, pools9/10 and their5members were used. Queue prepared and verified fresh backups and ownership inventories before writes. The user's other tabs and unsaved forms were preserved.

| Check | Evidence and limit |
| --- | --- |
| Search and keyboard selection | Trainer A filtered by name and selected with ArrowDown/Enter; Trainer B selected separately. |
| Quantity cap | At2/2, Trainer C was disabled. |
| Quantity reduction |2/1 retained A and B chips with an exact-count error; no automatic removal. |
| Draft persistence | Own draft `7fc32db5-b553-4536-9754-f188ed2132be` rev1 saved quantity1 with both IDs retained; reload verified2/1. Rev2 restored quantity2 and accepted current policies. |
| Mobile chooser |375px dialog and scroll width375; chip-removal targets44x44; names wrap and keyboard search remains usable. |
| Dynamic protection | Queue's temporary own claim protected Court A/Trainer A. Selected names stayed visible; Trainer A showed the authoritative protected-interval reason. |
| Busy publication | Own draft published VD018/ticket26 Waiting with3children. Queue independently confirmed zero own holds/allocations. |
| Counter and priority enforcement | Browser Call first rejected occupied counter, then earlier-ticket priority. These results do not establish resourceWait rejection. Queue normally served its own earlier ticket; no bypass. |
| Own protection preview | After VD018 Called, normal preview200 reported `excludedOwnProtection:true`; both selected intervals60minutes and named members available. Amendment editor closed without submitting changes. |
| Call | Three protected members, zero active allocations independently captured. |
| Start | Court A and Trainers A/B started together at 17:26:11 Manila; all expected ends at 18:26:11 Manila. One parent Start event independently verified. |
| Separate release | A completed at 17:26:50 Manila; B and court remained held. B completed at 17:28:04 Manila; only court remained held and its Complete action became available. |
| Parent completion | Court completed at 17:28:08 Manila; VD018 Served, all3 released, zero holds/active allocations, exactly one parent Complete independently verified. |

Queue independently compared all19prior drafts,24priorplans and182priorreceipts against its pre-browser baseline: unchanged row-for-row. Only the two dedicated QA lifecycle tickets25/26 were added. Local fixture operations did not establish billing allowance ledger behavior; the owner's isolated PG regression is distinct evidence.

## Screenshots

Artifacts are under `/Users/carloabella/.codex/visualizations/2026/10/17/vendor-multiservice`:

- `named-extra-quantity-two-cap-light.png` — selected A/B and disabled third choice.
- `named-extra-375-light.png` — narrow chips and keyboard search; captured during interval refresh.
- `named-extra-selected-protected-375-light.png` — selected protected name retained.
- `named-extra-three-in-service-light.png` — separate member outcomes and matching start times; the long action labels in this capture were subsequently shortened with hidden context and wrapping, pending responsive recheck.

## Final local presentation and focus checks

Services and resources now use nested Base UI Accordion cards. Opera verified independent keyboard collapse/reopen, stable resource/extra IDs, duration/quantity values and selected chips; a new resource opens automatically, and removing it preserves the other resource and returns focus to the parent Add resource. Removal remains a sibling of the Trigger. Extras retain outlined fieldsets.

One additional inert draft `15c59d7e-7afd-4e26-9d70-8683f372402c` (QA Nested Validation20261017), revision1, was saved after a fresh verified backup including the user's new ticket27. It uses only QA11/12. Invalid extra duration1.5 and exact-count2/1 each reopened both collapsed ancestors and focused the corresponding input/combobox. No publish request was sent. All invalid unsaved edits were explicitly discarded; the valid saved draft had no ticket/publication and was retained for verification, then removed by Carlo's later keep-NONE cleanup authorization documented below.

The short-window check found a real focus clipping issue. TaskDialog now corrects focus inside its own scroll body and observes body/content/viewport size changes; it never scrolls the page behind the dialog. Validation uses the same scoped correction. Final direct bounds:

| Viewport | Focused44px input | Scroll body | Result |
| --- | --- | --- | --- |
|375x500 | top314.66,bottom358.66 | top188,bottom367 | Entire input above footer |
|375x400, shrunk while already focused | top214.66,bottom258.66 | top180,bottom267 | Focus retained and entire input visible |
|1024x500 | top171.97,bottom215.97 | top138,bottom393 | Entire input visible; rail static |

375px light/dark captures confirmed wrapping,44px removals, bounded popup and dialog scroll width375. The desktop composition and short-height fixed header/footer were directly checked. Outcome controls were rechecked separately in a clearly labeled inert layout replay using Queue's actual recorded VD016 Start DTO (`steps.start.plan`), without changing that DTO or issuing commands. At375px in both themes the widest action was169.25px, minimum height44px and page scroll width375. This is component geometry evidence, separate from the bound VD018 lifecycle.

Direct failed-preview testing also passed: an interrupted read-only preview produced unknown reasons, retained selected Trainer A, and disabled unselected B/C despite spare selection capacity. For the delayed-request test, the old duration1 request was paused, then duration2 generated a newer paused request. The old request was already aborted; attempting to release it did not enable B/C while the latest request remained pending. Continuing the latest normal request enabled the valid choices. Request-key/catalog response mismatch rejection is separately covered by pure tests; no claim of a real rate-limit event is made. All temporary raw interception and device overrides were cleared, and normal preview was restored. The earlier response-pause layout observation was not reproduced under ordinary interaction and is not treated as a confirmed source defect.

## Final gates, artifacts and remaining limits

321frontend tests pass; frontend typecheck passes; all-frontend lint has0errors and3warnings in unchanged StyledQRCode, CustomerAccountPage and RegisterCustomerPage files; production build passed12.38s. Shared V4 remains byte-for-byte identical to the Queue-owned source, and diff whitespace checks pass.

Additional artifacts under the same visualization directory:

- `vendor-final-nested-accordion-preview.png` — actual saved valid draft preview.
- `nested-service-resource-accordion-desktop-dark.png`, `nested-resource-accordion-375-light.png`, `nested-service-resource-accordion-375-dark.png` — nested composition.
- `named-extra-375-dark.png` — bounded named-extra popup.
- `named-extra-preview-failure-unknown.png` — failure retains selections and blocks new picks.
- `nested-validation-member-focus-375-light.png` — exact-count focus.
- `nested-accordion-short-focus-fixed-dark.png`, `nested-validation-short-mobile-focus-fixed-dark.png`, `nested-validation-focused-viewport-shrink-dark.png` — final focus geometry.
- `outcome-layout-replay-375-light-full.png`, `outcome-layout-replay-375-dark-full.png` — explicitly read-only recorded DTO layout replay. The temporary5190 server was stopped and generated build-directory harness files removed.

After the later authorized cleanup, the dedicated QA tab is on the real5187 dashboard with an empty saved-draft list, New service request enabled, and the published VD018 review preserved. The inert validation draft is no longer available; its verification evidence remains historical. User forms/tabs remain preserved. QA11/12 fixtures remain active under the coordinated cleanup hold and have no owned holdings. No PR, commit, push, deployment, schedule resume, extension/security change or production mutation occurred.

Remaining distinctions: the live browser did not exercise a resourceWait rejection because counter/queue-priority checks ran first; the owner's PG regression is separate evidence. Physical-device keyboard and assistive-technology acceptance, billing ledger behavior in a non-fixture environment, authenticated production acceptance and Carlo's aggregate visual approval are not established by these local checks. Old-request cleanup scope is pending Central clarification; no unknown user draft or published history was deleted or hidden. The full rework is not marked complete from this milestone.


2026-10-17 cleanup coordination: Carlo authorized removing old unpublished drafts except his current request. Queue owns backup/archive/transactional cleanup; Vendor performed read-only Opera identity checks only. Former Stepper form tab is closed; both remaining local queue tabs currently have no request dialog, and their URL request IDs are published review records rather than current draft sources. The saved Mark card is now revision3 (earlier baseline2), so recent user edits are explicitly protected pending exact keep-selection confirmation in Central. Stepper9c4a147b, published Alejandro27, fresh QA preview15c59d7e and all published history remain protected. No deletion/hiding or independent cleanup occurred. After authorized Queue cleanup, refresh only the owned list/preview; do not navigate away from or overwrite user edits.


2026-10-17 cleanup clarification: Carlo chose to retain NONE of the saved unpublished drafts, superseding the earlier draft-only protection hold. Queue is authorized for exactly4fdaeb2c-95dd-4661-bf25-ec80633ed53e,31413b5c-39c6-4035-97ae-d8621d3bcf84,9c4a147b-74f5-43bb-b01d-8865770f3385 and15c59d7e-7afd-4e26-9d70-8683f372402c after fresh backup/archive and locked state/revision checks. Vendor freshly confirmed both local queue tabs have no open request dialogs/forms, with no new request tab, without editing/navigating/refreshing user forms. Published Alejandro/all history and command receipts remain protected; new/unknown drafts are excluded. Transaction completion is not yet claimed; only the owned preview list will be refreshed afterward.


2026-10-17 cleanup COMPLETE at18:48:49 Manila: Queue committed deletion of exactly the4approved unpublished drafts after fresh backup, full-row/fsynced archive and locked state/revision checks. Zero unpublished drafts remain.8required draft-only FK audit rows were archived before removal; all202command receipts, including8target receipts, remain byte-for-byte preserved. All27tickets/19published request records and history/resources/configuration hashes remained unchanged; published Alejandro27 preserved. The earlier keep-preview hold is superseded for the unpublished QA validation draft15c59d7e only; its evidence remains historical and it is no longer an available saved preview. QA11/12 services/pools remain active under review hold. Vendor refreshed ONLY owned queue tab5624 after confirming no open dialog; saved draft list text is empty, New service request enabled, and publishedVD018review visible. User queue5573/Services5598 were not refreshed or navigated. Screenshot: vendor-after-unpublished-cleanup.png in the existing visualization directory. No independent deletion, PR, commit, push or deployment.


2026-10-17 historical READ-ONLY diagnosis — global-control gap (subsequently addressed below): Serving from remains an enabled counter selector. Top Call next/Start service/Skip current use legacy ticket mutation routes and are blanket-disabled by any active V2/V3/V4 plan ID in the location, not only the selected counter. The per-request plan actions remain authoritative; during inspection AlejandroVD019 was Called with an allowed per-request Start action, while global Start was disabled. Add walk-in already delegates to the new request intake in the local plan mode. Backend rejects legacy mutations for plan-backed tickets with USE_QUEUE_PLAN_COMMAND. No ticket action was issued during diagnosis. Recommendation sent to Central, pending scope decision: select current/next plan by counter and reuse revision/group-safe plan commands; do not remove the guard or silently reinterpret Cancel protection as Skip. There is no V4 Skip contract. Earlier Called/expiry details are time-specific observations, not frozen eligibility. No broad rewrite started; this remains an open acceptance item for unified queue controls.

Later2026-10-17 authorized follow-up supersedes the preceding open-gap status: Queue reviewed and implemented counter-controls/Skip/Recall; the beta toolbar now consumes those descriptors, with shared pending-command protection and explicit skipped-request Recall. Direct isolated Opera lifecycle/release and375px acceptance plus remaining fault/race gates are in [counter-controls acceptance](vendor-counter-controls-acceptance.md). No user ticket action, PR or deployment follows from this local acceptance.
