# Service request vertical stepper — local acceptance

2026-10-17, Asia/Manila. Local implementation only; no PR, commit, publication, merge or deployment. Aggregate preview approval remains required.

## Reference and implementation

Carlo's reference: [Shadcn Studio Stepper 9](https://shadcnstudio.com/docs/components/stepper?base=base). Inspected the explicit `https://shadcnstudio.com/r/components/base-nova/stepper-09.json` registry source with the shadcn CLI. Project inspection confirmed Vite, Base UI/base-nova, Tabler and prefixed Tailwind v4. Adapted the vertical lateral-icon/description composition using existing shared Base UI Button controls and the editor's existing React state. No primitive overwrite, dependency install, preset switch, Radix migration or form-state migration.

Select service → Customer details → Review. Stable nested selection identities and mounted controls retain edits across navigation. There are no conditional empty extra steps. Mobile uses a compact vertical rail above the content; desktop uses a lateral rail and wider task dialog. Semantic navigation, native keyboard buttons, aria-current, visited/error indications and focused step headings communicate progress. Visiting a step is not a saved/completed request. Success remains the existing server-confirmed parent notice/close; Next never produces Done.

Back/Next only navigate. Draft Save remains available at every step and permits existing incomplete-draft behavior. Publish remains separately available only under the existing parent permission projection and only on Review. Final submission checks all selections and routes invalid data to its step. Existing V4 revisions/policy acceptance, exact-command retry, busy/unknown locks, dirty Cancel/Keep/Discard and amendment agreement controls remain. V5 remains revoked. Review lists service/resource/extra names and valid count × base totals; fractional, off-step, out-of-bound or stale-policy values require review. Reloaded drafts use current base minutes only when their policy revision matches.

## Actual Opera checks

Owned tab 1555995608, local VD Sports Club / Demo Courts, http://127.0.0.1:5187/dashboard/queue?workspace=operations&business=vd-sports-club.

- Single named court plus Basic Equipment nested extra, then a second automatic pooled Trainer root: controls remained together in Services; Back/Next retained customer/name, service, resource UUID, quantities and durations. Review showed 2 services, 2 resources, 1 extra and separate configured totals.
- Keyboard Enter on Next moved focus to the next step heading; previous steps remain directly editable. Invalid 1.5 duration retained its input and suppressed the computed total. Publish attempt on the dedicated saved QA draft returned focus to Services with needs-attention state and inline whole-count/policy feedback; no successful publication.
- Keep editing retained the unsaved 1.5 value; Discard removed only that unsaved edit. Reopening the QA draft showed the persisted valid count 1 and 60-minute total.
- Actual dark desktop and light/dark 375px; short 375×500 viewport had width/scrollWidth 375, a bounded 375px dialog and persistent 44px actions ending within the viewport. Main content scrolls independently. Temporary viewport override cleared and original dark theme restored.

## Dedicated local draft / independent Queue verification

Queue captured a fresh verified backup and baseline before writes. Only NEW OWN `QA Stepper 20261017`, UUID `9c4a147b-74f5-43bb-b01d-8865770f3385`, was saved. Revision 1 had zero selections and persisted after full reload/reopen. Revision 2 has one named resource, quantity/count 1, duration policy revision 4; it remains Draft with publishedTicketId null. Create key `6a160888-9928-45cc-8064-517dd1e1624b`; update key `3d9276f8-9ad0-4c71-a971-be422fc6e209`. Exactly two draft receipts. Invalid unsaved input was discarded.

Queue independently verified all 17 baseline old drafts, 23 published plans and 166 old command receipts unchanged by row hashes. Final: 23 tickets, zero active allocations/protected reservations, 18 drafts (+1), 168 plan command receipts (+2), resource/pool receipts unchanged. Private evidence remains in Queue's `.local-preview/replacement-20261016/stepper-draft-verification.json`. No user draft or history modified; no rollback/restoration.

## Validation and evidence

All 303 frontend tests passed (including the focused regression for reloaded/stale/invalid review durations). Typecheck, selected ESLint and git diff --check passed. Frontend production build passed in 13.09 seconds with the existing large-chunk advisory.

Screenshots under `/Users/carloabella/.codex/visualizations/2026/10/17/vendor-multiservice/`:

- `request-stepper-review-desktop.png` — final dark desktop, lateral rail and correct reloaded duration.
- `request-stepper-mobile-light.png` — full compact vertical rail, customer step, persistent actions.
- `request-stepper-review-375-short.png` — focused Review heading and reachable separate Save/Publish at 375×500.
- `request-stepper-validation-desktop.png` — invalid publish focus/state evidence (before final wording polish).

Physical keyboard/assistive technology and physical mobile keyboard acceptance remain separate. A successful publish, amendment write, and forced ambiguous transport retry were not performed for this presentation slice; existing server confirmation/retry owners remain unchanged. No new runtime enforcement or deployment acceptance is inferred.

## Services header/action refinement — 2026-10-17

Carlo's screenshot follow-up is implemented in the V4 Services editor. With one or more rows, Add service appears at the right of the Services header. With zero rows, the same action is full-width in the empty state. Both use the current Tabler Plus icon. Each row has a right-aligned Trash + Remove action beside Service N; its accessible name includes row number and selected service name. The select's visible label is Choose service, with a screen-reader row suffix for unique identification. Fieldsets retain Service N names. Removing a row returns focus to Add service, including when the last row changes the action's placement. Existing selection identity, limits, duplicate checks, nested controls and classifications are unchanged.

Actual Opera verified zero/one/multiple rows, keyboard Enter add/remove, focused Add after row/last-row removal, unique select names, full-width empty action, and header controls at desktop/375px. At 375px, both header controls were 44px high, right edge 351px within the viewport; page and scroll widths were both 375px. All edits were unsaved on OWN QA draft and explicitly discarded; reopening retained its original saved named resource/count. No successful write or user form modification. Temporary viewport override cleared; actual desktop Services preview remains open.

Artifacts in the same screenshot directory: `request-services-actions-desktop.png`, `request-services-actions-375.png`, `request-services-empty-375.png`. All 303 frontend tests, typecheck, selected ESLint and diff check passed; frontend build passed in 12.34 seconds with the existing advisory. The semantic-legend regression was updated for the new header composition.

## Inline service classification info — 2026-10-17

The Services classification/helper line now uses the existing shared shadcn `Alert` + `AlertDescription`, neutral default appearance and decorative Tabler InfoCircle. The existing dynamic Single service / Multiple services wording and root-count logic are unchanged, including the legacy fallback in `NamedQueuePlanDialog.tsx`; the V4 line is in `QueueSelectionFieldsV4.tsx`. `role="status"` overrides the primitive's assertive default for polite normal informational updates. No redundant title, warning/destructive styling, shared-primitive change or behavior change.

Actual Opera verified the saved OWN QA draft's Single wording, then an unsaved second Trainer root changed it to Multiple. At 375×500 the alert wrapped to two lines, width327/right351, with no horizontal overflow; info icon is aria-hidden. Unsaved QA changes were explicitly discarded, original saved single-resource draft reopened unchanged, viewport override cleared. No successful data writes. Existing action headers, outlined resource groups and persistent actions remain.

Focused duration/nested-selection regression: all11 tests passed; typecheck, selected ESLint, diff check and frontend build12.96s passed (existing advisory). Full303 suite passed immediately before this presentation-only alert slice; it was not rerun unnecessarily. Physical screen-reader announcement acceptance remains separate from verified DOM status semantics.

Evidence in the same screenshot directory: `request-service-info-single-desktop.png`, `request-service-info-multiple-desktop.png`, `request-service-info-multiple-375-short.png`. Actual owned tab1555995608 remains desktop Services preview. No PR/commit/publication/deployment.

## POS-style request intake refinement — 2026-10-18

The approved intake direction is now represented by a near-fullscreen task dialog with a three-step flow: Select service, Customer details, and Review. The Services step presents a two-column layout on desktop: a resource-card catalog beside the configured selection editor. Cards show the supplied catalog identity and availability label only; they do not reserve capacity or infer availability. The shared request duration control updates every selected resource and extra together, while each server-supplied policy revision and validation rule remains authoritative. Mobile collapses the catalog above the editor and retains bounded scrolling and reachable actions.

The published request table continues to expose one derived overall planned-time bar per request row. It is an envelope over the current allocation members for display only; member-level timing, release, overdue, retry, and completion semantics remain server-derived and unchanged. Complete and Interrupt remain explicit actions when the server projects them. No automatic release or completion occurs when a bar reaches 100%. Focused request-duration, refresh, operations, typecheck, lint, and production-build checks passed after this refinement. No PR/commit/publication/deployment.

## Response toast refinement — 2026-10-20

Generic request-editor failures now use the shared vendor error toast above the task dialog. The invalid step and field-level validation remain visible and focusable, while the duplicate generic inline response banner is removed. Validation toasts use stable IDs so repeated renders do not duplicate them; the command owner continues to emit success toasts only after a user-triggered save or confirmed action. Focused request regressions and TypeScript validation passed. The local lint invocation was unavailable because the worktree lacks the configured `@eslint/js` dependency; no dependency installation was performed. Browser verification of toast layering and repeated-action behavior remains pending.

The vendor toast viewport now preserves the Base UI stacked geometry: multiple notifications collapse into a stack by default and the primitive expands them during pointer/keyboard interaction. Dismiss controls remain available, focusable, and touch-sized; the vendor portal z-index keeps the stack above task dialogs. The shared queue still owns timing and deduplication, so background refreshes do not create success notifications. Static toast geometry and intent tests pass; live hover, focus, touch, and open-dialog browser checks remain pending.

The stack is positioned bottom-right across vendor workflows, including success/error/info/loading and promise notifications. Mobile uses safe-area-aware insets and a bounded viewport width/height so the stack remains visible without horizontal overflow. Live screenshot confirmation with an open service-request dialog remains pending.
## Amendment recovery for legacy empty extras (2026-10-20)

Resource-only amendments now omit malformed legacy extra rows from the V3/V4
transport adapter when an old saved request contains an empty extras shell.
Stable resource IDs, quantities, duration counts, and valid nested extras remain
unchanged. This prevents an obsolete empty extra from being serialized as
zero/NaN demand and rejected by the server. The adapter does not silently
remove a valid extra; it preserves identified positive quantity/duration rows.
