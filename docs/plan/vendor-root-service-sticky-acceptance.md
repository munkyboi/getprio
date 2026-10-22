# Root-service groups and sticky request progress — local acceptance

2026-10-17, Asia/Manila. Two Carlo screenshot follow-ups implemented independently of the pending named-extra backend extension.

## Presentation changes

`frontend/src/vendor/QueueSelectionFieldsV4.tsx`: every root service now uses the shared outlined FieldSet/FieldLegend with one Service N legend and no duplicate heading. Root removal uses the same icon-only Trash + Tooltip composition as resources/extras, unique context and44px target. Existing service removal focus returns to Add service. Conditional Plus Add service stays in the populated Services header, reverting to full-width when no rows remain. Root selection, explanation, Add resource and resource/extra descendants remain within their service group; transport/state/UUID hierarchy unchanged.

`frontend/src/vendor/styles.css`: at desktop widths >=48.0625em and heights >=40em, the rail uses only position:sticky/top0/align-self:start within the existing dialog main scroll area. Header/footer remain fixed. No scroll listener, stacking override, transform workaround or separate content-scroll refactor remains. Narrow/short viewports keep the rail static and can scroll it away to preserve working space.

## Actual Opera verification

Owned tab1555995608, VD Sports Club / Demo Courts, saved OWN QA Stepper20261017. One/multiple root groups expose Service1/Service2 native group semantics, each with a44×44 icon-only removal button and uniquely associated Tooltip. Keyboard removal of Service2 returned focus to Add service; removing the final root produced the327px full-width empty Add action at375px. All edits were unsaved and explicitly discarded; saved own single-resource/count1 draft reopened unchanged. No successful business writes or user-tab changes.

For the long desktop sample, main scroll moved from24 to544px while rail top remained197.5px and its bottom462.875px stayed above footer788.5px. Direct browser captures show the unchanged rail beside changed resource/extra content. The ordinary tab screenshot path omitted stationary rail paint after scrolling despite correct DOM geometry; direct Page.captureScreenshot confirmed actual browser output. Saved before/after evidence uses that direct browser capture, not a composited/fabricated image.

At375×500, root/resource/extra group widths were327/293/259px respectively, each with16px shared inset. Page/scroll widths both375px. Rail computed position static. Emulated touch swipe changed main scroll358→433px without trapping scroll; touch emulation disabled afterwards. Root trash focus scrolled its full44px target above the footer; tooltip wrapped within the viewport. At1024×500 short desktop, the rail was also static; the focused44px duration control remained between main top138px and footer393px, page/scroll widths1024px. Temporary viewport override cleared and original dark theme retained.

## Pending named-extra work — not runtime-ready

`NamedExtraMembers.tsx` is a prepared, currently UNWIRED Base UI multiple/chips composition. Existing shared ComboboxChip accepts optional accessible remove labels and layout classes; default API remains compatible. Three component tests cover cap/exact count, duplicate/unknown/unavailable new choices, explicit removal after quantity reduction, retaining stale chips, and keeping temporary availability separate from catalog validity. These tests are not authenticated runtime acceptance.

Queue/API own the additive V4 named-extra IDs/capability/schema and authoritative interval availability contract. Shared owner files were not edited here. Proposed bounded flat resourceMemberIds and interval-availability shapes are still under their review/testing; no frontend fake names, runtime binding, capability activation or V5 hierarchy was introduced. Actual quantity2 selection/search/chips/keyboard/third-choice blocking and dynamic availability acceptance remain pending their tested handoff and disposable fixture.

## Validation and artifacts

All311 frontend tests and typecheck passed. Final selected ESLint, typecheck and git diff --check passed; production frontend build passed in12.99 seconds with the existing large-chunk advisory. No PR, commit, push, merge, deployment or schedule activation.

Screenshots: `/Users/carloabella/.codex/visualizations/2026/10/17/vendor-multiservice/root-fieldset-sticky-before.png`, `root-fieldset-sticky-midscroll.png`, `root-service-tooltip-375.png`.


2026-10-17 root service Accordion replaces the earlier root fieldset presentation: Studio03/09 left-chevron rounded cards, independent inline44px removal, multiple open/new auto-open, mounted hidden controls and stable values. Opera verified keyboard collapse, independent removal/focus return and invalid-duration publication validation reopening/focusing the input;375px wrapping/44px targets and1024x500 bounded dialog/static rail checked.313 frontend tests,typecheck,focused lint andbuild12.35s pass. Light-theme final screenshot remains pending after Opera extension popup interruption. Named-extra chooser remains UNWIRED; Queue/API now supplied tested runtime/shared contract and released own services11/12 after HTTP lifecycle checks. Backend evidence is owner-reported, distinct from pending Vendor browser acceptance. No commit/publication/deployment.


2026-10-17 final named-extra lifecycle: dedicated browserVD018/ticket26 Served after normalCall/Start and independent TrainerA/TrainerB/parent completion. Queue independently captured3simultaneousnamedallocations, eachseparaterelease, exactly1parentStart/Complete and0finalglobalholds/allocations; all19 prior drafts/24priorplans/182priorreceipts unchanged against its pre-browser baseline. Ordinary browserpreview confirmed serverexcludedOwnProtection:true whileCalled. [Detailed runtime matrix](vendor-named-extra-runtime-acceptance.md). Resource groups now nested Accordions (extras remain outlined), both ancestors autoexpand for validation;24focusedtests/318fulltests,typecheck andbuild13.85s pass. Resource nested browser/focus/mobile outcome-wrap and unknown/stale fault checks remain pending due an actual Opera extension/control interruption during user activity. No blanket acceptance, no commit/PR/push. QA11/12 fixtures remain active with zero holds for aggregate preview review; cleanup hold coordinated.


2026-10-17 final local acceptance update:321frontend tests/typecheck pass, all-frontend lint0errors(3warnings in unchanged files), build12.38s, sharedV4 exactcmp/diffcheck pass. Opera nestedResource collapse/reopen/stableIDs/chips/newautoopen/removal focus and invalidPublish two-ancestor expansion+fieldfocus passed; no publish network issuance from inertvalidationdraft15c59d7e. Failedpreview retainedselectedA/blockedB,C; superseded durationrequest aborted and could not enable choices, latestnormalrequest restored choices. Fixed discovered short-viewport focus clipping via scoped TaskDialog focus/resize correction;375x500,alreadyfocused375x400shrink,1024x500 fullfield bounds verified abovefooter. Light/dark375 popup/layout passed; outcome geometry separately replayed Queue's recordedVD016Start DTO inertly(no newticket). [Final matrix](vendor-named-extra-runtime-acceptance.md). Allowninvalideditsdiscarded; validinertpreview retained, userforms untouched, QA11/12cleanuphold active. No PR/commit/push/schedules/production. PhysicalAT/device/billing/live acceptance and oldrequestcleanup scope remain separately open; fullrework not markedcomplete.
