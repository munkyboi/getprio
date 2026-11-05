# Expandable service request table — local acceptance, 2026-10-18

## Scope and reference

Carlo authorized a transaction-table exception to the Administration entity-grid rule. The published named V3/V4 service request list now uses the installed Base UI Table with expandable rows, search, status filtering, sorting, ten-row pagination and horizontal separators. Existing server pagination remains Load more active service requests; client controls explicitly cover loaded records only. Draft Publish/Delete, counter controls and request mutations remain with their existing controllers. The separate earlier V2 multi-service panel is preserved.

Reference: https://shadcnstudio.com/blocks/datatable/datatable-example#datatable-example-3 . Direct browser and page inspection currently expose Example5/7/8, not Example3. Central approved proceeding with the requested layout/behavior; exact Example3 fidelity is not claimed. Installed base-nova/Table/Tabler components and theme were preserved; Base Progress was added through the project CLI. No preset or dependency changes were required.

## Timing authority

Queue and API reviewed `docs/contracts/queue-request-progress-v1.md` in the backend-owned account-deletion-resource-plan checkout. No backend/shared fields changed. Each child joins its exact allocation group, child attempt and member IDs. Named extra containers do not fabricate an aggregate execution; their frozen named members retain separate clocks.

Planned elapsed fraction is `(releasedAt or anchoredNow - startedAt) / (expectedEndAt - startedAt)`, bounded0–100. Invalid/missing intervals show Timing unavailable; unstarted children show Not started. Terminal history freezes at actual release, including early completion/interruption. Only current in-service children with unreleased valid allocations become OVERDUE strictly after expectedEndAt. Nothing automatically completes or releases at100%. Pause retains wall-clock elapsed under the existing server contract. Request/service summaries count distinct current outcomes and overdue leaves, never average parallel elapsed percentages.

One shared1s visible-document timer serves the tables, stops while hidden and cleans up after the last subscriber. It issues no requests. Server observedAt plus per-response monotonic receipt anchors drive elapsed values; each loaded page keeps its own receipt. Receipt metadata is enumerable so React Query structural sharing cannot silently drop it. Query errors and state age are visible. Existing failed-read/refresh action gates, revision guards, unknown-command recovery and unsaved-form protection remain authoritative.

## Actual Opera verification

Owned tab1555995671 only; no user-owned tabs/forms or ticket commands were operated. Normal authenticated local VD Sports Club reads verified:

- Own ticket30/VD002 completed14s of a planned hour:0.411%, unchanged after disclosure and later reads, not forced100%.
- Own ticket28/VD001 preserves attempt2 and three independently released intervals: CourtB39s, TrainerA18s, TrainerC30s, each against its recorded hour. Three stopped bars retain distinct values1.09944%,0.50661%,0.85122%.
- Enter expands and Space collapses the request row; aria-expanded/aria-controls are linked. Existing nested service disclosure and exact resource/extra timestamps remain available.
- Search produced an empty state and clearing restored the row. Status and customer sort worked. Single-page pagination correctly disabled Previous/Next. Multi-page browser traversal remains unverified.
- Read-only observation of current VD020 showed live progress advance36.683947→37.007482 without issuing any service action.
-375px light/dark and768px tablet had document width equal scroll width; mobile displays labeled cells vertically with critical actions retained. Desktop/dark viewport was restored.

An initial CDP response-interception attempt stalled before fulfillment. Navigating the owned preview aborted it; Fetch patterns were cleared and normal authoritative reads verified. A separate temporary, command-disabled local HTML replay then used only own ticket28 historical projection. Paused status, independent named-extra OVERDUE badges,2→3 overdue leaves, live elapsed beyond expected end and all bars capped100% were observed while all3 resources remained held. This is replay evidence, not a real paused/overdue backend transition. The replay tab closed and temporary HTML was removed; no replay state remains in the actual dashboard.

Screenshots under `/Users/carloabella/.codex/visualizations/2026/10/17/vendor-multiservice/`: `request-table-desktop-dark.png`, `request-table-375-dark.png`, `request-table-375-light.png`, `request-table-named-extras-desktop-dark.png`, `request-table-readonly-overdue-replay.png`. The replay screenshot is behavioral evidence only; the standalone harness did not include the complete dashboard theme shell.

## Checks and remaining gates

All346 frontend tests passed, including six focused timing cases and the updated cancellation/receipt regression. Typecheck, focused lint, production build and diff whitespace check passed. The incumbent large-bundle build warning remains. Source timer cleanup/visibility behavior is implemented; independent browser hidden-tab timing acceptance, multi-page browser traversal and physical assistive-technology checks remain open. Exact missing Example3 comparison and aggregate Carlo acceptance remain separate. No PR, commit, push, merge, deployment or production write; schedules stay paused.

## Cross-session refresh refinement — 2026-10-20

The active infinite query now refreshes while the vendor queue page is visible every 15 seconds, and immediately on focus, online recovery, visibility return, or the existing `queue-plans-updated` event. A single in-flight guard prevents overlapping refreshes. React Query refetches all loaded pages, preserving search/filter/sort state, pagination, expanded rows, and any open request editor because those states are owned outside the query data. Staff and admin use the same panel and receive the same behavior. Manual Refresh requests remains available as recovery. Automatic refresh emits no success toast; query failures remain in the existing stale/error path. Two-session authenticated browser propagation and observed latency remain pending external acceptance.
### Call-next recovery after resource configuration changes (2026-10-20)

The server remains authoritative for queue calls and rejects a call when a
resource configuration revision changed underneath the operator. The vendor
dashboard now treats `RESOURCE_CONFIGURATION_CHANGED` and `STALE_REVISION` as
recoverable stale-state responses: it invalidates the named-resource/service
catalogs and active queue queries, emits the existing queue refresh event, and
shows a review-required recovery message directing the operator to open Amend
request, review current resources, save the amendment, and then call again. It
never retries the command, amends the ticket, skips it, or calls another ticket
implicitly. This covers changes made by another session while the queue board
remained open.

### Reference composition correction — 2026-10-20

The request section uses exactly two visual surfaces: the outer Service requests
card (title, description, Refresh requests) and one darker inset datatable surface
(search/status/sort, New service request, rows, pagination). Filter/table wrappers
provide layout only; they have no separate card border, background, or radius.
Toolbar and footer use 16px inset padding and internal separators. The >50–75%
progress band uses explicit orange `#f97316`, rather than the yellow warning token.

Independent Opera GX screenshot review at desktop size passes the two-surface
composition and visible 54% orange/0% blue bands. Exact computed backgrounds and
bounding-box measurements were unavailable; do not present screenshot evidence as
computed-style verification. Keyboard focus traversal and narrow rendered evidence
remain pending. No merge, deployment, or final visual acceptance is implied.

Carlo's subsequent DevTools screenshot is the composition target. Source dark-theme
styles now use an outer `#18181b` card, continuous `#09090b` inset toolbar/rows/footer,
and `#18181b` table-header stripe. Toolbar/footer padding and header-to-inset spacing
are 16px. These explicit colors are scoped to the dark vendor theme; the light theme
keeps its existing palette. Fresh screenshot comparison must verify source styling
without relying on retained DevTools overrides.

The toolbar search is constrained to 300px on desktop, with an inset search icon
and matching dark input surface. Status/sort controls are grouped at the right;
visible external labels are replaced by filter/sort icons, explicit accessible
names, and title hints. Display options use All Statuses, Oldest First,
Newest First, and title-cased statuses; internal values and filtering/sorting
remain unchanged. Narrow CSS wraps search and controls to available width.
Fresh browser icon/geometry/focus/narrow validation remains required.

The dark-theme search input itself has explicit `#18181b` background, distinct
from the `#09090b` inset datatable surface. Its 300px desktop width, inset icon,
border, radius, placeholder styling, and existing focus ring remain intact.

### Shared Select migration — 2026-10-20

Status and Sort now compose the existing Base UI-backed `components/ui/select`
Root/Trigger/Value/Content/Group/Item implementation. Native select/option markup
is removed. Status includes All Statuses, Waiting, In Service and any additional
loaded states; sort retains `fifo`, `newest`, `customer`, `ticket` values with
plain-language labels. Each change resets pagination as before. Trigger icons,
accessible names, title hints, and the toolbar grouping remain. Popup menus align
below the trigger through the existing themed vendor portal. Open-menu appearance,
keyboard selection, Escape focus return, and narrow evidence require fresh browser
validation; static rendering/type checks alone do not establish those outcomes.

Independent authenticated Opera GX validation passes both closed/open Base UI
filters: dark layered popup, selected checkmark, and correct item labels. Arrow
Down + Return selected Waiting/Newest First; Arrow Up + Return restored All
Statuses/Oldest First. Escape returned focus to the originating combo trigger.
Final filter state was restored; no request/queue command was issued. TypeScript
and all seven existing named-queue-operation regressions pass. This verifies the
two filter keyboard flows; full-section Tab traversal and mobile-width rendering
remain separate open acceptance gates.

Desktop toolbar correction: the shared live-queue `select-trigger { width:100% }`
rule expanded both new Select triggers, causing the wrapping in Carlo's screenshot.
The scoped toolbar now overrides that rule with 152px status/164px sort triggers,
non-wrapping toolbar/control groups, and a shrinkable search capped at 300px.
At the deliberate 48em narrow breakpoint the toolbar and controls stack explicitly
at full width. Browser geometry/overflow acceptance must verify the affected width.

Independent fresh Opera GX desktop screenshot passes the single-row correction:
Search, Status, Sort, New remain inline; compact triggers do not expand, overlap,
or create visible horizontal overflow. Sort popup remains aligned/themed with its
selected checkmark; defaults restored. Exact numeric viewport/bounding-box evidence
was not returned, so this does not establish an exact-width measurement. Prior
filter keyboard/Escape checks pass; narrow native viewport evidence remains open.

### Compact row actions — 2026-10-20

Row actions use 44px icon-only shared Buttons with shared hover/focus Tooltips and
ticket-specific accessible names: pencil Amend request (neutral), megaphone Call request
(info), check Complete (success), pause Interrupt (destructive). Existing Start and
Cancel protection actions remain available as play/shield-off icons when allowed.
All server action gates, disabled conditions, and command handlers are preserved.
Actions cells use intrinsic sizing instead of the prior 220px minimum. Keyboard
browser validation may open Amend/Interrupt review dialogs without saving or
confirming; Call/Complete commands must not be triggered merely to test appearance.

Call uses the megaphone/bullhorn (`IconSpeakerphone`), with unchanged info intent,
Call request tooltip, ticket-specific name, and command gates. A regression checks
the rendered megaphone and accessible name. Normal table-body rows alone receive a
subtle hover fill (4% foreground mixed into the inset surface); header, detail rows,
toolbar, and footer are excluded. This changes background only, preserving layout,
borders, and button focus styling.

TypeScript and nine focused regressions pass, including rendered megaphone,
ticket-specific action names, and disabled busy gates. Independent Opera GX
post-change megaphone pixels and row-hover appearance remain unverified: browser
sidebar retained focus and the validator lacked a safe hover operation. Earlier
Call tooltip evidence predates the icon correction. Do not count source or SSR
evidence as fresh hover/megaphone visual acceptance.

### Complete/Interrupt confirmation audit — 2026-10-20

Complete currently sends its command immediately after verifying one current-stage
unreleased allocation (`completeAll:true`); child Complete likewise sends directly.
There is no Complete confirmation, checkbox, consequence copy, or cancel step.
Complete has source/static-test evidence only and was not activated in runtime QA.

Interrupt opens a resource dialog describing allocation release and dependent
unfinished extras. It requires a nonblank reason and initially unchecked agreement;
submit stays disabled until both are supplied. The existing shared TaskDialog Close,
Escape, and backdrop dismissal clear dialog state without a command when idle;
busy/uncertain/locked state prevents closure. There is no explicit Cancel button,
and the confirmation uses the default button variant. Independent runtime evidence
covers opening the guarded dialog and closing without confirming, not a successful
Interrupt mutation. Do not claim both flows already have confirmation protection.

### Complete confirmation implementation after the audit

Both row-level Complete and child Complete now open an explicit review dialog.
Only the confirmation controller can dispatch completion. The dialog explains
recording completion/closing the allocation, has explicit Cancel/Complete buttons,
uses restrained success intent, and initially focuses Cancel. Cancel/Close/Escape/
backdrop share idle dismissal without a command. Busy/uncertain/command-lock states
protect dismissal; uncertain retries retain the existing pending idempotency key.
Recorded allocation, ticket/plan/stage/child revisions and capability/action guards
are preserved. Seven new controller regressions cover no write on open/dismiss,
exact confirmed identity/key, concurrent confirmation, busy protection, and stale
or ambiguous allocations. Together with existing operation/focus tests, 19 pass.

Implementer Opera GX check: row Complete opened the review for VD002, initial focus
was Cancel, Escape dismissed and returned focus to the row action; VD002 remained
in service. Initial AX clicks only showed tooltip; screenshot-derived coordinate
click reached the dialog. Independent confirmation and child-path runtime evidence
remain separate gates. Final Complete was not executed.

### Authoritative interruption scope

Interrupt now reads the current request before opening review. Its primary and
unfinished dependent extras are mapped to current-stage/current-revision child
attempts and unreleased recorded allocation-member IDs; quantity/duration come
from the actual allocations. Frozen resource/member names identify the selections.
The dialog distinguishes Will be released from Other active resources stay running
instead of implying every sibling in a shared group will be interrupted. Missing,
orphaned, duplicated, stale or mismatched members block review. Immediately before
confirmation a new read must match the reviewed identities/list/revisions; otherwise
no command is sent. The payload retains the existing group/child IDs and explicit
dependent-extra revisions, with the nonblank reason and agreement gate unchanged.
Five focused interruption regressions pass, including multiple primary allocations,
multiple named extras, completed-extra exclusion, sibling preservation and mismatch
prevention. No live interrupt confirmation was performed.

### Structural border refinement

Only outer card, inset frame, table/header/row and footer separator selectors use
the scoped `--request-structural-border` at 55% of the existing border color.
Shared `--border`, field/Select/button/badge/dialog/progress/focus styles are not
changed. Border widths, radii and layout are preserved; fresh rendered comparison
of protected controls is still required.

### Request state intent mapping

Shared request-status badges retain visible state labels, compact outlines and
semantic text, with 60% current-color borders and 4% tints. Waiting/paused/
interrupted/skipped/unserved/partial/mixed use warning; active/called/protected/
handoff/open/converted use info; completed/served/released success;
cancelled/terminated destructive; draft/pending/superseded/expired/unknown neutral.
Applied to table, child/stage/allocation/reservation details, draft/skipped cards,
and resource review status labels. State/action semantics and all field/button
borders are unchanged. Mapping and rendered-label regressions pass. The expanded
focused suite passes 37 tests; dark-theme representative badge inspection is pending.

Independent latest Opera GX check: plan-row Complete review passes (consequence
copy, explicit buttons, Cancel initial focus, Escape dismissal with VD002 still
in service). Expanded VD002 shows four held resources, open allocation group,
zero released. Waiting and in-service badges render compact outlined amber/blue;
structural lines are visibly softer without layout shift. Child Complete review
and interruption-list comparison remain pending safe open/cancel checks. Final
completion or interruption was not submitted.

Final independent safe checks pass: child Complete opens “Complete Court4 - Inday?”
with resource-specific consequence copy and Cancel initially focused; Cancel closes
without a command. Interrupt Will be released lists Court4 - Inday (1 unit,
180 minutes); Other active resources stay running lists Court1 - Borak, Nardo
Butalo and Basic Equipment with recorded quantities/durations. Empty reason,
unchecked agreement and disabled submit are observed. Safe dismissal leaves VD002
in service with four held members and zero released. This runtime sample has no
dependent extras; multi-extra scope remains covered by the focused fixtures rather
than claimed live observation. No final Complete or Interrupt command was submitted.
