# Vendor UI design rules

Effective: 3 October 2026. Applies to the planned vendor dashboard rework and its authentication, onboarding, Operations, Administration, and workflow/resource screens.

## Authority and scope

Apply these rules when creating or migrating vendor UI. The [rework design brief](../plan/vendor-dashboard-rework-design.md) records the design direction; [Queue Workflows and scheduling](../plan/queue-workflows-and-scheduling.md) owns operational behavior. This document defines the reusable presentation and interaction rules. Existing screens are migrated in deliberate slices, not implicitly rewritten by this document.

Use the supplied templates as layout references, with GetPrio branding and supported behavior. User instructions take precedence. Continue to follow the repository's mobile-first, role/access, and task-modal requirements. These rules do not impose a new approval step for routine implementation.

## 1. Component system

- Build reworked vendor surfaces with **shadcn/ui and Tailwind**. Use existing shared primitives and variants before creating another button, card, field, badge, or overlay implementation.
- Resolve the actual shadcn configuration, primitive base, aliases, icon library, and installed components before implementing. Use the shadcn skill and current component documentation; do not mix incompatible primitive APIs.
- Centralize typography, spacing, radii, surfaces, borders, shadows, icons, and status treatments in semantic tokens/shared components. Use layout classes for composition and component variants for appearance. Avoid page-specific hardcoded colors and one-off widget styles.
- Keep the application's existing framework unless a separate task changes it. Reference layouts built in Next.js do not require moving GetPrio from Vite.
- During migration, isolate style resets and token changes from unaffected customer and Mantine screens. Do not introduce Mantine components into newly migrated vendor pages without a documented compatibility need.

## 2. Reference-to-page mapping

| Surface | Required reference | Pattern |
| --- | --- | --- |
| Login | [Login v3](https://shadcn-nextjs-admincn-admin-template.vercel.app/pages/auth/login-v3) | Clear form beside a branded visual panel on wider screens |
| Registration | [Register v3](https://shadcn-nextjs-admincn-admin-template.vercel.app/pages/auth/register-v3) | Matching auth composition, clear fields, primary action and login link |
| MFA challenge | [Two steps v3](https://shadcn-nextjs-admincn-admin-template.vercel.app/pages/auth/two-steps-v3) | Matching auth composition with code entry, verification action and supported recovery |
| Vendor onboarding | [Onboarding v1](https://shadcn-nextjs-admincn-admin-template.vercel.app/pages/onboarding-v1) | Step-based guided setup, visible progress and purpose |
| Entity lists | [User list](https://shadcn-nextjs-admincn-admin-template.vercel.app/apps/users/list) | Optional useful summary cards, filters, search/actions, status and pagination |
| Entity details | [User view](https://shadcn-nextjs-admincn-admin-template.vercel.app/apps/users/view/user-001) | Entity summary, task-relevant tabs and activity where available |
| Metrics | [Orders dashboard](https://shadcn-nextjs-admincn-admin-template.vercel.app/dashboard/orders) | Scannable metric cards and grouped chart/detail panels |
| Tables | [Datatable](https://shadcn-nextjs-admincn-admin-template.vercel.app/datatable) | Consistent columns, rows, status, actions and pagination |
| Long forms | [Sticky actions](https://shadcn-nextjs-admincn-admin-template.vercel.app/forms/form-layouts/sticky-actions) | Sectioned fields and persistent submission actions |
| General forms | [Vertical layout](https://shadcn-nextjs-admincn-admin-template.vercel.app/forms/form-layouts/vertical) | Labels above fields, section/card grouping and clear submission actions |
| Upgrade | [Pricing](https://shadcn-nextjs-admincn-admin-template.vercel.app/pages/pricing) | Current plan, clear comparisons and supported upgrade actions |
| Workflow canvas | [React Flow Workflow Editor](https://reactflow.dev/ui/templates/workflow-editor) | Configurable stage nodes, route connections, settings and preview |

Match the hierarchy, spacing rhythm, grouping, and action placement appropriate to the task. Do not copy template branding, arbitrary employee fields, trial promises, social providers, promotional overlays, fabricated statistics, or example prices. Do not duplicate the demo's broad navigation inventory. Template source access/licensing is separate from use as a visual reference.

## 3. Workspace shell and navigation

- Provide one vendor application, identity, and authenticated session. Vendor Admins have a labeled **Operations / Administration** switch; each workspace has its own navigation and a visible current-workspace label.
- Operations puts location/station context, queue state, active work, and **Call / Start / Complete** controls first. Administration puts configuration, services, staff, resources/workflows, business settings, reporting, and billing first.
- Switching preserves permitted location context and the session. It does not consume a seat, change roles, terminate sessions, or release resources. Protect unsaved edits and unresolved submissions.
- Staff see only permitted Operations views, without the Administration option. Enforce permissions server-side and provide a useful access-denied state for unauthorized direct navigation.
- First visit defaults to Operations; subsequent visits restore the last permitted workspace. Use actual route and entitlement contracts, not hardcoded assumptions about the eventual route roots.
- Queue setup is one Administration sidebar item with Workflows, Stations and Resources page tabs; do not introduce a nested sidebar submenu for this group.
- Provide responsive sidebar/navigation-sheet behavior, page titles, breadcrumbs where helpful, and consistent placement of primary actions. Keep search, theme and account controls predictable.

## 4. Light and dark mode

- **Both themes are mandatory on every reworked vendor surface**, including auth/onboarding, overlays, charts, pricing and React Flow.
- Use one theme system shared across workspaces. Persist an explicit Light/Dark choice; follow system preference when no choice is saved. Provide an accessible theme control and apply the initial theme without a visible flash where feasible.
- Use semantic surface/text/border/status tokens, not manual per-page dark overrides. Ensure form fields, hover/selected/disabled rows, loading states, focus rings, graphs and node connectors remain distinguishable in both themes.
- Theme switching preserves form input, workflow drafts, selected nodes, queue context and active operations. Color alone must not communicate status or chart meaning.

## 5. Responsive and accessible interaction

- Start with the narrow layout. Stack sections before adding columns; make essential actions reachable without horizontal scrolling or hover. Use approximately 44 by 44 CSS-pixel targets for touch controls.
- Test mobile, tablet, desktop and short desktop layouts. Mobile keyboard opening must not hide focused inputs or make submission unreachable.
- Auth forms lead on mobile; decorative panels can simplify or collapse. Onboarding keeps current step, progress, next/back actions, and errors clear; preserve completed inputs across steps.
- Provide labels, visible focus, logical tab order, keyboard-operable menus and editing, accessible titles for overlays, and announced errors/status changes where appropriate. Maintain readable contrast in both themes.
- Use plain operational language, not engine implementation terms. All pages need loading, empty, error, retry, validation and success states appropriate to their task.

## 6. Forms and overlays

- Use the vertical-layout reference as the default for general forms. Labels sit above controls; related short fields may share columns on wider screens and stack on mobile. Use tabs or collapsible groups only when the task benefits; do not hide validation errors in inactive sections.
- MFA uses the two-steps-v3 visual pattern with accurate GetPrio verification labels. Preserve the implemented factor, recovery, challenge expiry and retry rules. Support keyboard entry and whole-code paste with accessible labels, errors and pending states. Show recovery/resend controls only when supported by the actual method; authenticator codes do not require an SMS resend action. Do not copy the demo's mismatched Password reset heading. Verify MFA in both themes and on narrow screens.
- Compose shadcn fields with FieldGroup/Field, associated labels, descriptions and inline errors. Use FieldSet/FieldLegend for related choices. Keep field validation visible and accessible.
- Use one clear primary action per task. Submission controls expose pending/disabled states and prevent duplicate writes without discarding input. Place secondary actions consistently.
- Long forms use persistent action bars that do not cover fields or errors. Stack related fields on mobile; use columns only for short related fields on larger screens.
- Task overlays follow the repository's Contact Vendor anatomy: fixed accessible header, optional introductory guidance, independently scrolling main content, persistent footer matching the surface. Mobile uses bottom-sheet treatment; desktop uses a centered bounded dialog. Keep overflow vertical, media aspect ratios intact, and actions reachable.
- Trap/restore focus, support safe Escape/close behavior, and confirm discard only when edits would be lost. Do not demand confirmation for harmless workspace navigation with no unsaved work.

### Shared form grouping: outlined fieldsets

For new or deliberately migrated vendor forms, group semantically related fields with the shared `FieldSet variant="outlined"` and a meaningful `FieldLegend`. This is the approved screenshot pattern: a subtle neutral rounded boundary, a native legend that interrupts the top border, inset fields, and consistent vertical spacing/help text. Use the existing semantic border/radius tokens; no colored panels or decorative eyebrows.

- Import `FieldSet`, `FieldLegend`, `FieldGroup`, `Field`, `FieldLabel`, `FieldDescription` and `FieldError` from the shared vendor field primitives. The outlined variant centrally owns its border, radius, 16px inset and 8px legend-side spacing. Do not duplicate that appearance in page CSS.
- Use `FieldGroup` for related controls and `Field` with an associated label for each control. Associate descriptions/errors with the control and preserve invalid/disabled states. A legend names the group; it does not replace a field label.
- Bound one meaningful group at a time. Keep subordinate groups `variant="plain"` when another boundary would add redundant nested boxes. A single simple field need not be forced into a fieldset. Tabs and stepper stages remain navigation context, not additional decorative boxes.
- Keep legends concise and allow wrapping. Fieldsets and children must shrink within their parent at 375px; fields stack, and long help/error text wraps. Maintain 44px actions and visible keyboard focus in both themes.
- Preserve the Services action-header pattern: populated Add at group header right, icon-only Trash near each root-service legend at top right, empty full-width Add. Do not use outlined styling to move those controls or duplicate their labels.
- The shared variant defaults to plain for compatibility. Use outlined intentionally when creating/migrating meaningful field groups; this rule does not authorize a mass rewrite of existing forms or any behavior/state changes.

```tsx
<FieldSet variant="outlined">
  <FieldLegend>Name, image, and duration</FieldLegend>
  <FieldDescription>Provide the details customers need.</FieldDescription>
  <FieldGroup>{/* Existing accessible Field/label/control/help/error compositions */}</FieldGroup>
</FieldSet>
```

Current examples and acceptance: [shared fieldset acceptance](../plan/vendor-shared-fieldset-acceptance.md).

## 7. Lists, details, metrics and billing

- Reuse list toolbars, filters, row actions, badges and pagination across staff, bookings, services, resources and other entities. Expose bulk actions only where the API and permissions support them.
- Preserve server-side filtering/pagination and realtime reconciliation. Mobile tables use prioritized columns, deliberate overflow for secondary data, or cards that preserve critical state/actions.
- Detail views show the entity identity and status first, then relevant tabbed sections. Stack summary/content on mobile and avoid hiding required tasks in overcrowded tab rows.
- Metrics display source period and meaningful labels. Queue count, predicted stage wait, resource occupancy and journey completion are separate measures. No invented trends or template values in live screens.
- Upgrade views show actual plan/usage, limits and configured prices. Use billing-period toggles only when supported. Do not change subscription tiers or feature eligibility through presentation work.

### Reusable service-request datatable block

Use this pattern for dense, operational vendor lists such as service requests,
bookings, queue tickets, and other records that need comparison, filtering, and
row-level actions. A new screen may change its columns and actions, but it must
keep the same hierarchy, surface treatment, and interaction rules.

#### Anatomy

1. **Outer section card** — contains the section title, one-line description,
   and an optional header action such as Refresh. It establishes the page-level
   grouping and uses the normal vendor card surface.
2. **One inset datatable surface** — contains the toolbar, table, expanded row
   content, and footer as one continuous surface. Do not add separate cards for
   filters, rows, or pagination.
3. **Toolbar** — a constrained search field on the left; icon-led filter and
   sort controls on the right; the primary create action remains inline with
   those controls. Search uses a visible search icon and an explicit accessible
   label. Filter controls use the shared Base UI/shadcn Select primitive, never
   native selects. When a list needs date filtering, use one shadcn-style range
   picker rather than separate From/To fields; keep the remaining filters to the
   smallest set that changes the operator's decision.
4. **Table** — use stable, task-oriented columns. Keep the primary identity
   readable, show status as a semantic compact badge, show counts as short
   summaries, and keep the last-updated value machine-readable and human-sized.
5. **Actions** — use intrinsic-width icon buttons with tooltips and
   ticket/entity-specific accessible names. Keep destructive or consequential
   actions behind the existing confirmation/review flow.
6. **Footer** — show the loaded-record range and pagination controls inside the
   same inset surface. Keep footer padding and its separator consistent with the
   toolbar.

#### Surface and spacing rules

- Use exactly two visual surfaces: the outer section card and the inset table
  surface. Layout wrappers do not receive their own card background, radius, or
  border.
- Use the vendor semantic tokens for card, inset surface, text, muted text, and
  controls. In dark mode, the outer card is lighter than the continuous inset
  table surface; the table header may use the card surface as a quiet stripe.
- Keep structural borders and row separators subtle. Structural border changes
  must not alter field, Select, badge, button, dialog, progress, or focus-ring
  borders.
- Use a 16px inset for toolbar and footer content. Keep a consistent 12–16px
  row-cell rhythm, with enough height for scanning and touch targets.
- Search is capped at approximately 300px on wide screens. Filters and the
  create action size to their content; the Actions column uses intrinsic width.
- Use the shared radius and shadow tokens. Do not introduce a second nested card
  to make a toolbar or table look grouped.

#### Data and status rules

- Columns must describe the record's real lifecycle. Do not present a planned
  percentage, expected end, or client projection as completion evidence.
- Progress bands use the shared semantic mapping: 0–25% blue, over 25–50%
  green, over 50–75% orange, and over 75% red. A zero value still needs a
  visible, small blue progress arc and a `0%` label.
- Status badges retain their text label and use a restrained semantic tint:
  success, info, warning, destructive, or neutral. Color never carries the
  meaning alone.
- Counts show the requested aggregate only. For service requests, show total
  services; do not expose resource or nested-extra counts in the summary cell.
- Search, filters, sort, pagination, expanded rows, and refresh remain backed by
  server-authoritative data. A loaded-record label must say “loaded” when it is
  not a complete server result.

#### Interaction and accessibility rules

- Every filter has a visible icon, an accessible name, a title hint where useful,
  and a plain-language label (for example, `Oldest First`, never `FIFO`).
- Every icon-only action has a tooltip, a visible focus state, and an accessible
  name that includes the record identifier when ambiguity is possible.
- Body rows may receive a subtle hover fill; headers, expanded detail rows,
  toolbar, and footer do not inherit that hover treatment.
- Expandable rows use `aria-expanded` and `aria-controls`, preserve keyboard
  order, and keep critical state/actions visible in the collapsed view.
- Confirm actions that change completion, occupancy, release, cancellation, or
  interruption state. The review dialog explains the consequence, starts focus
  on Cancel, and must not issue a command on Escape, close, backdrop, or Cancel.
- Show loading, empty, error, retry, stale-data, and disabled-action states in
  the same surface. Never replace a failed read with an empty table.

#### Responsive rule

At the narrow breakpoint, stack the toolbar controls in this order: search,
filters, sort, primary create action. The table converts to labeled record
blocks or a deliberate horizontal overflow model; do not allow controls to
wrap into an accidental second column. Preserve identity, status, progress, and
critical actions without requiring hover. Maintain touch targets of at least
44px and keep the footer readable without clipping.

#### Reuse checklist

Before calling a new section complete, verify both themes at narrow, tablet, and
desktop widths; keyboard traversal and Select open/close behavior; row hover;
tooltip and accessible names; status/progress semantics; loading/empty/error
states; pagination and refresh; and the relevant confirmation dialog. Record
runtime browser evidence separately from source or static-test evidence.

## 8. Workflow and resource UI

- Use React Flow for the canvas, styled with the same shadcn tokens. First-release editing permits only a valid sequential path; unsupported branches and loops cannot be published.
- Node selection opens consistent settings for station, duration, access, completion/readiness rules and optional shared resource requirements. Display units and capacity explicitly; player count/booking quantity is not resource demand.
- Provide Add/Insert/Reorder/Connect actions without requiring dragging. Offer an equivalent mobile stage editor using the same draft model. Node coordinates affect layout; edges and validated definitions determine routing.
- Label nodes/connections and make validation errors actionable. Validate again on the server at publish/activation. Use a synthetic preview, clearly distinguished from live operations.
- Queue Workflows requires Pro; resource-only tracking uses explicit pilot availability until permanent tier limits are decided. Distinguish entitlements from one-seat workspace access. After Pro ends, block new admissions/configuration writes but keep authorized resolution controls for active journeys.
- Use separate Waiting, Called and In service sections with an Awaiting arrival check-in area. Destination staff confirm arrival by reference lookup or optional opaque QR before station admission.
- Keep active sessions separate from waiting queues. Show block reasons, overdue occupancy and readiness waits. Never imply that expected end automatically frees resources or that completing one stage completes the whole visit.
- Layout/theme changes cannot alter runtime state. Staff controls operate through authorized server actions; editor animation is not the live workflow engine.

## 9. Verification for each migrated slice

Review the changed page against its mapped reference and actual GetPrio task. Check both themes at mobile/tablet/desktop widths, long labels/content, keyboard/focus behavior, form/empty/error/loading states, and applicable role restrictions. Verify workspace switching with a one-seat owner and station-scoped staff.

For operational changes, also verify realtime updates, retry behavior and session/journey state. For editor changes, verify mobile/canvas equivalence, draft persistence and publish validation. Record meaningful checks and any unresolved limitations in the change summary. A static resemblance to the template is not evidence that a workflow is functional.


## 10. Current behavior preservation (13 October 2026 audit)

The [full dashboard audit](../plan/vendor-dashboard-full-audit.md) and [preservation checklist](../plan/vendor-dashboard-rework-preservation-checklist.md) form the required regression inventory for every migrated slice.

- Show Queue Day closure, intake pause/resume, capacity/resource occupancy and subscription state as distinct concepts. Preserve the server deadline, closing warning, audited extension, ticket outcomes, locked reconciliation and retry states. “Cancel auto-close” cannot imply permanent disabling when the action adds 30 minutes.
- Distinguish customer join QR, board URL and display-approval QR. Keep Queue Board settings and display management in Administration; keep the operational pairing scanner below QR AND PUBLIC LINKS, with camera, manual code/URL, review and approval inside its dialog. Private access remains browser-bound and server enforced. Do not restore retired monitor board access.
- Preserve Complete service and Skip current confirmations and clear interruption cancellation. Keep individual waiting-ticket cancellation; do not restore its removed bulk-management dialog. Keep the approved action/Serving from and separator layout responsively.
- Keep the service labels Allow quantity input and Quantity unit label, bounds, branch overrides, weekly availability and date exceptions. Explain quantity, duration, price, simultaneous booking capacity and resource demand separately.
- Preserve booking payment and arrival action permissions and error states, staff restrictions, operational alerts, export retention and review moderation. Use data-supported labels/periods; never present a filtered fetched subset as a complete server search.
- Account/security is a shared self-account feature; staff retain access. Billing/commercial actions currently support owner/admin; business contact and public branding remain owner-only. Workspace labels must not change these permissions.
- Shared account challenge/recovery/deletion and commercial confirmation flows retain current APIs and consequences. Do not add unsupported SMS/OAuth/automatic billing or imply that account deletion automatically refunds payments.
- Every slice records source/API ownership, meaningful checks and unresolved authenticated/device acceptance. Update plans/rules with behavior changes in the same PR. A screenshot, configuration screen or passing source regex test alone is not operational acceptance.

## 11. Shell migration conventions

Use prefixed Tailwind `v:` utilities without global preflight; scope vendor tokens to `.vendor-workspace`. Portal-based migrated UI must inherit that scope. The application remains React 18, so components used as Base UI render targets must forward DOM refs. Set generated control variants to at least 44 pixels before using them for touch actions. Preserve legacy feature appearance during shell migration rather than treating the themed frame as proof that feature/dialog dark-mode acceptance is complete.

Slice 1 retains `/dashboard/*?workspace=operations|administration`. Shared Account belongs to both workspaces; staff/MFA restrictions take precedence over stored preferences. Routine route choices and feature extraction must preserve approved return queries and hash state. Record implementation status in [rework progress](../plan/vendor-dashboard-rework-progress.md).

Business pickers and role derivation must exclude inactive memberships. Restore a destination business's own saved workspace before persisting its new route. Tenant/location reads must use scoped query observers or discard obsolete responses; clearing old arrays alone does not prevent a late response from restoring them. Context recovery must retry the bootstrap that establishes the location, as well as queue data.

Unsaved-edit protection covers the outer application navigation and sign-out as well as workspace controls. Track forms independently; successful saves clear only their form, failed saves retain edits, and intentional dialog discard removes its dirty state. Approved navigation closes task dialogs. Do not treat a previously saved or closed form as unsaved.

## 12. Live Queue migration conventions

Present all authorized server-provided counter tickets; selected-counter actions must retain exact ticket/counter IDs. Keep called tickets, started timing records, historical unfinished timing debt and live resource allocations distinct. Resource configuration or timing counts cannot stand in for available units or an authoritative active allocation snapshot. A free counter's eligibility comes from its server lane; another counter's ticket must not impose a global single-ticket lock.

Migrate narrow tables to labeled rows within container queries while preserving table/header semantics. Keep individual cancellation and service confirmations. QR copying uses explicit labeled buttons and downloading keeps the existing branded QR renderer/target. Ticket and board scanners stay distinct, with manual fallback, explicit review/confirmation, and camera cleanup on close/context change.

Declare CSS layer order before prefixed imports. Scope native control inheritance/transparent button defaults to the vendor base layer because global preflight is intentionally omitted; semantic utility variants must take precedence. Vendor Select/Dialog portals use the workspace's DOM ref so themes inherit without relying on a stale ref.current value. Mobile dialogs reset both transform and translate, use matching paper/footer tokens, and keep primary actions reachable with body-only scrolling.

Auto-close extension copy says Extend by 30 minutes. Preserve server-time offset, warning/final phases, all current-day called outcomes, reconciliation locks/retry, actual extension semantics and the ability to resolve historical service timing after closure.

PR 401 preservation details: auto-close and reconciliation warnings remain sticky within the feature content, with clearly distinct final/error severity in both themes. At widths up to 48em, task-dialog footer guidance and actions stack vertically and buttons span the available width. Navigation to external board URLs uses native anchors with shared visual variants, preserving link semantics.

## Shell reference fidelity

Use the agreed interactive prototype's neutral surfaces and shell hierarchy: full-height narrow sidebar, business/location context above workspace navigation, account context below it, compact top toolbar with the Operations/Administration switch and theme/account controls, and a separate content heading. Retain GetPrio branding and real supported links. Avoid reinstating the public-site toolbar above the vendor shell, oversized header forms, a tinted dashboard frame, or serif page headings. On mobile use the navigation sheet and stack the workspace switch while keeping controls reachable. The reference's simulated roles/plans, sample workflows and resource pilot actions do not authorize operational controls. Carlo's 13 October end-to-end authorization permits continuing across feature screens while presenting local review milestones; PR publication, merge, deployment and runtime activation remain separately authorized.

## Operations list and booking detail rules

Bookings uses server pagination/search/filtering; label summary counts as current-page counts. Clients/History search only their loaded records and show server retention labels, without claiming an all-record search. Keep History's loaded list limit separate from export-period entitlements. At narrow container widths preserve column labels and wrap complete status/action text; rows remain keyboard-operable and nested controls own their actions. Use the shared task-dialog anatomy for booking details, payment review and rescheduling. Preserve frozen booking data, private proof access, payment/arrival gates, exact targets and staff/admin differences. Exports and mutations block overlapping actions; failure is distinct from empty data. Never equate booking-list navigation or check-in with opening a Queue Day, explicit service start or resource allocation.

Booking task entry points must clear stale action errors from other pages. Navigation out of an edited payment task must run the workspace discard guard before changing filters or clearing the task. Paired date filters must clear an existing end date when the start advances beyond it. The reschedule task hides its redundant footer Cancel up to 48em, retaining its guarded header close control and desktop Cancel.

Both date-filter change paths must enforce range ordering before storing query state; native `min` alone is insufficient for typed values. Local list searches reset pagination, and displayed slices, ranges and navigation must clamp to the available page count after result changes. No-workspace recovery controls retain the same minimum 44px touch target as the workspace.

Custom select callbacks that do not bubble a native change must explicitly register task-form edits. Leave guards must only clear drafts for navigation in the current tab; modified/non-primary/new-tab/current-URL link clicks retain the current draft.


Locations/Resources/Counters share the approved shell and scoped configuration fields. Use the routable location editor at `/dashboard/locations/:locationSlug/edit` for existing branches and the shared bounded task dialog for adding branches, counter, resource pool and service requirement editing; retain searchable choices, native validation, error/draft recovery and explicit custom-select draft registration. Disable workspace transitions during resource writes and clear only the saved/discarded form. Distinguish configured pool capacity from live availability and unavailable inventory from zero. Keep existing Locations tabs during this review slice; move the one resource editor only when the future Queue setup slice is authorized. Counter lanes are not resource units or future workflow stations. Restricted staff-management access must show a clear explanation and retain stored assignments instead of displaying a permanently pending disabled query. Always honor actual primitive data attributes and scope overlay portals to vendor theme tokens.

## Services and Availability migration

- Keep the Service catalog, Weekly availability and Date exceptions tabs under the existing Services route. Summaries show actual service/branch settings and current branch timezone, with loading/error/empty states distinguished; unavailable records cannot authorize stale edits.
- Quantity settings use **Allow quantity input**, **Quantity unit label**, **Minimum quantity** and **Maximum quantity**. Configured bounds are whole numbers 1–24; the minimum must fit the 24-hour booking ceiling. Keep unit duration/price, branch overrides and mobile bundle semantics unchanged. A blank branch price uses the default; zero is an explicit price.
- Weekly rules retain branch/service scope, overnight intervals and business-hour defaults; disabled-rule fallback must be visible. Date exceptions retain local calendar dates and optional time/capacity values. A whole-day block explicitly blocks all services and disables conflicting partial-day controls.
- Searchable configuration selectors explicitly track drafts. Escape preserves their chosen value and propagates to the guarded task dialog. Use the installed Base UI orientation attributes for tabs and their active indicator. Service/availability task errors stay in the scrollable body; persistent actions remain reachable in both themes.

## Staff management migration

- Staff is a business-wide membership list; counter names use the selected location. Unresolved assigned IDs must remain visibly assigned with unavailable/outside-location guidance, rather than disappearing into a false unassigned state.
- Preserve existing-account onboarding and actual membership seat counting, including disabled memberships. No account creation or owner transfer is introduced. Owners alone change other non-owner roles and remove memberships; self/owner controls remain protected. Owners/admins retain eligible enable/disable controls.
- Confirm role/access/removal changes with the exact member and consequence. Pending writes lock controls and navigation; errors retain the confirmation or add-member draft for retry. Removing business access does not delete the person's GetPrio account.
- Use responsive labeled table rows, distinguish loading/error/empty records, and prevent stale roster actions after query failure. Add staff uses the shared bounded task dialog, guarded drafts, role-specific choices, native email validation and persistent footer.

## Settings and Queue Board migration

- Retain Business profile, Queue settings, Notifications and Queue Board under the existing Settings route. Guard edited tab changes and restore saved values after accepted discard; do not silently carry untracked edits into another form.
- Queue-only saves send all existing queue/intake fields and omit owner-only profile/category fields. Profile and default-media saves remain owner-only. Preserve formatted descriptions, category identity/inactive fallback, logo/background fit, inherited location overrides and upload/save distinction. A failed default-theme read blocks media/profile saving until retry rather than publishing blank defaults.
- Rich-text editability and selector initialization/search events do not create drafts. Actual rich-text changes and custom selections explicitly mark their form. Keep readable toolbar states, keyboard labels and 44px controls within the scoped theme.
- Distinguish notification permission, actual push subscription, event preferences and email fallback. Event toggles save immediately with rollback on failure; pending saves/subscription requests block context transitions. Do not request production browser permissions during synthetic QA.
- Board access is location scoped. Confirm public exposure/private transitions, URL rotation, renewal and revocation with their exact targets and consequences. Preserve expiry/last-seen/revoked state, UUID path, browser-bound grants and existing APIs. Pending writes block navigation; failures retain the confirmation for retry. A failed board read offers retry, without treating loading/error as an empty display list.

## Account, security and billing migration

- Account remains shared across Operations and Administration. Staff retain Profile/Security; owner/admin subscription/billing permissions and mandatory-MFA enrollment gates remain authoritative. Preserve the merged header geometry.
- Shared account handlers use the vendor presentation context only inside the vendor dashboard; customer controls retain their existing presentation. Verification methods have visible selected states and accessible pressed states. Pending account writes block context/navigation changes and competing controls. Successful verification clears vendor credential drafts; failures retain them for retry.
- Treat enrollment and recovery-code displays as preserved security tasks, with specific session/pending-setup warnings when leaving Security. Do not mislabel retained security state as discarded edits or keep unrelated screens perpetually dirty. Ordinary account drafts use intentional discard.
- Use bounded task dialogs with persistent, explicit actions for Email OTP removal, permanent deletion, plan selection and paid-plan exit. Keep exact challenge IDs, OTP deduplication, required-MFA protections, branded authenticator QR, recovery consequences, deletion receipts/retention warnings/logout and preview-token/revision billing confirmation contracts.
- Failed/loading billing reads are never an absent subscription; provide retry and keep Profile/Security reachable. Capacity reads are capability gated and scoped; ignore cancelled responses and offer retry. Credits never bypass Service Booking limits. Label ticket statistics by their actual day/location and show unknown source data as unavailable rather than zero.
- Current vendor phone replacement requires a valid Philippine number. No self-account removal endpoint exists; do not invent nullable-phone writes or count that audit item as delivered.

## Reports and Ratings migration

- Reports uses the matching location snapshot and authoritative capacity resource reads. Distinguish loading/failure/unknown from zero, label the day/location/period, and retry failed reads. Preserve the current staff Reports restriction until permission/navigation reconciliation is explicit.
- Queue history currently supplies update timestamps, not authoritative service durations. Label displayed intervals as recorded ticket activity, sort valid served records, retain simultaneous zero intervals and require two actual timestamps. Never fill a missing point with configured service averages or describe these intervals as service time, pool occupancy or workflow performance.
- Ratings remains vendor-only, paid-plan and server-permission gated. Scope cached reads by actor, business and page; hide stale actions after read failure. Visibility changes target the exact review, remain disabled for moderated records, and do not remove hidden active ratings from the aggregate. Pending changes lock pagination, context and navigation; failures retain the original state for retry. Preserve long comments, accessible star labels, empty/error/retry states and responsive actions.

## Vendor onboarding presentation

- `/register/vendor` uses a scoped vendor auth layout for both new signup and authenticated/provider onboarding. Keep category IDs, generated/manual business links/usernames, availability debounce/cancellation, optional Philippine phone normalization, signup-only password and Account/MFA continuation. A signed-in account adds a workspace through the existing completion contract without submitting a password.
- Native fields must forward their actual input refs through the shared wrapper so form registration, programmatic prefill, normalization and error focus keep working. Use explicit labels and inline help; Business link is the presentation label for the existing tenantSlug contract.
- Vendor auth portals use the actual auth root; category options remain inside the same themed scope. Auth and dashboard share explicit theme preferences and follow system changes when unset. Customer default social buttons and shared auth policies stay intact; vendor social controls use the configured existing providers and intent only.

Vendor authentication context: use dashboard return state as a presentation hint only; retain shared identity, redirect validation and customer defaults. Sign-in, reset request/confirmation and verification each need an accurate task heading and visible validation/error/retry. Preserve the vendor return target through reset success and Back. Keep the form first on mobile and branded visual beside it on desktop.

Shared OAuth callbacks inherit vendor auth composition only for an existing vendor target. Keep failure retry context, customer fallback and successful session handoff. Changing callback identity must prevent an earlier response from overriding or navigating past the newer task; auth-context rerenders must not restart a handoff.

Queue/booking operational alerts use scoped native cards with labeled dismiss and primary open actions. Bound long stacks with vertical scrolling, prevent flex card compression and wrap identifiers. Keep alerts in the actual vendor theme root and verify integrated DOM placement; retain existing delivery/detection/dismissal contracts.

Vendor transient notifications use the project Base UI toast primitives inside the vendor root, a single queue shared by vendor consumers, wrapped text, labeled dismissal and keyboard access. Retain original display duration and FIFO overflow semantics; queued feedback must not expire unseen and duplicate IDs must not restart a timer. Preserve customer defaults. A deletion receipt needs a lifetime beyond the authenticated vendor provider and remains global until an equivalent session-closing receipt is verified.

Queue Email Journey allowances are retired across all plans: omit usage/plan/credit metrics and quota-pause copy. Retain ticket/booking quotas, actual email preference/delivery features and historical purchase evidence. Display unavailable period usage as unknown, never zero; UI removal is not evidence of backend enforcement retirement.

## Workspace access states

Loading, missing-workspace and subscription-required states use the same scoped vendor theme and native primitives as the reworked screens. Preserve existing subscription/RBAC conditions, View plans callback, recovery link destinations and logout handler. Recovery links remain real links with visible contrast, focus indication and at least44px targets; actions stack on narrow screens. Decorative illustrations retain their aspect ratio and empty alt text. These states do not grant access or certify backend readiness.

### Configuration review corrections

Checkbox help text must have its own ID referenced by the input's `aria-describedby`, retaining any existing external descriptions. Counter staff assignment supports name/email search and multiple selections; filtering retains selections and does not itself create unsaved business edits. Missing assigned IDs are retained until deliberately removed through supported actions. Do not change permissions, plan limits or scoped assignment writes to restore search.


## Current-period consumption readouts

- Reports and Account Subscription use the authorized minimal current-period usage endpoint, with actor/business/role cache scope and owner/admin visible-section/tab polling. Validate returned tenant identity; use canonical used/limit directly without reconstructing diagnostics or falling back to served-today/history/catalog defaults. Monthly usage covers all tenant locations; daily queue activity remains separately labeled for the selected location.
- Loading is explicit and request errors offer native44px/mobile-width retry. Unavailable/null/invalid/expired periods stay unavailable rather than zero; preserve authoritative zero. The observed timestamp and current time must lie within the server-owned period.
- A usage read does not enable capacity/credit checkout or resource/workflow/AI gates. Preserve stored subscription entitlement limits and accounting provenance; source merge, visible UI and tests do not certify complete writer reconciliation or provider/device acceptance.


## Account draft and grid preservation

- Vendor account layout adapters must render a real grid and preserve requested responsive two/three/four-column layouts, with single-column mobile defaults. Outside vendor presentation, retain existing customer/Mantine behavior.
- Browser reload/close guards read current account challenge and MFA replacement/removal drafts. Pending enrollment and newly issued recovery codes require unload-only protection, while Security-specific navigation warnings remain separate from ordinary global dirty state.
- Vendor password-reset requests may carry only a validated internal dashboard return hint. The API validates it again before including it in a reset email; absent/unsafe/customer targets retain defaults. Reset completion still requires normal login, MFA and authorization. Never store or transfer credentials in a return URL.

### Account context discard and native grid base

- After all leave confirmations succeed, discard shared Account child drafts by remounting their presentation scope. Canceled navigation and pending tasks retain state; parent authenticator enrollment and recovery-code state stays independent.
- Native responsive grid modifiers require the `ops-grid` base class, including Reports metrics and vendor social sign-in controls.

- Queue Board copy actions must handle unavailable Clipboard API support and denied writes with visible manual-copy instructions; failure must not escape as an uncaught exception.


### Locations and Vendor dialog refinement (2026-10-16)

- Vendor task-dialog headers show the action title and accessible description without a category eyebrow. This Vendor-specific direction supersedes the general Contact Vendor eyebrow convention; preserve the shared scroll/footer/focus anatomy.
- Use `/dashboard/locations` as the canonical list; redirect `/dashboard/tenants` while preserving query and hash. Retain Locations, Resources and Counters tabs. Existing location edit URLs use the immutable location ID and preserve authorized business scope.
- Show locations in a responsive card grid with existing search, status filtering and pagination. Use readable semantic Primary/Open/Closed/payment badges in both themes. Omit join, mobile-QR and Queue Board URL fields from cards. Use accessible icon actions with tooltips and 44px targets.
- The enabled switch retains owner/admin authorization, saving and row-error recovery; server confirmation controls its value. Edit/discard must preserve unsaved inputs when cancelled. Browser Back/Forward must restore the editor URL before an approved departure is replayed. Use the controlled discard dialog with Keep editing and Discard changes, preserving a draft snapshot across browser form restoration.


### Shared inset tab groups (2026-10-16)

- All Vendor tab groups use the shared muted rounded group with 4px outer padding, a rounded inset active tab and comfortable horizontal spacing. Keep the active surface separated from every group edge. Use semantic theme tokens; retain visible focus, native tab semantics, 44px targets and narrow-width wrapping. Services/Availability and Account use this same grouped treatment rather than the line variant.
- The location editor groups existing fields into General (profile, contact, visibility), Queue & hours (arrival, service timing, operating hours) and Payments. Keep all panels mounted inside one form, hide inactive panels explicitly, preserve a single draft and persistent Save/Cancel area. Submission reveals the first invalid field's tab, then focuses it and reports native validity. Tab changes alone do not discard or save edits.

- Global tab sizing: items use their content width without equal-width flex growth, fixed group widths or arbitrary minimum group widths. Keep labels and items on one line whenever their parent has room. Groups wrap whole items only when their actual parent width is insufficient; a single label may wrap only if that item itself cannot fit. Preserve 44px targets and prevent document overflow. Apply this through the shared tabs component, including all Vendor configuration groups.

- Location Edit must navigate before changing any editor/dialog state. Existing locations use `/dashboard/locations/:locationSlug/edit`, resolved only against the selected business authorized location IDs; legacy ID links replace to the canonical slug. Key draft initialization by business plus immutable location ID, so canonical URL replacement never resets a draft. Retain server-returned slug and ID on partial-save retries; keep existing API update contracts.

### General routed page headers and breadcrumbs (2026-10-16)

- Use the shared shadcn Breadcrumb navigation for actual route hierarchy, replacing uppercase context eyebrows. Ancestors are navigable links preserving business/workspace query scope and existing draft guards; only the current breadcrumb carries aria-current="page". Keep business/location selection in the context picker rather than inventing route ancestors.
- Each routed page has exactly one main h1 and its own description. A nested editor promotes its task title/description to the shell header; omit the parent title and duplicate nested heading. Place the shared semantic horizontal Separator below the title/description block.
- Back actions use an arrow-left icon with accessible text and retain unsaved-draft and busy-state protections. Breadcrumbs wrap within narrow parents without document overflow; ancestor links and Back actions retain44px targets. Apply these rules to all Vendor routed pages; Locations edit uses Administration / Locations / Edit [location].

### General entity cards and semantic badges (2026-10-16)

- Carlo explicitly prefers the current Locations grid with icon actions. Use this responsive card grid as the default for comparable entity/item lists: title and status at the top, key summary in the body, enabled control when applicable and accessible tooltip icon actions in a consistent footer. Preserve search, status filters, pagination, loading, empty and error states; permission/busy gates and mutations stay with feature owners.
- Locations and Counters share EntityGrid, EntityCard and EntityIconAction, composed from existing shadcn Card/Tooltip/Button. This extraction is presentational only; do not generalize backend entities or dispatch/resource behavior. Keep44px action targets, meaningful labels, descriptive headings and wrapping without document overflow.
- All non-critical Vendor badges have semantic colored text and border with transparent backgrounds. Success = available/enabled/positive; warning = caution/unavailable; info = descriptive metadata; neutral = ordinary role/category/disabled metadata; destructive outline = adverse but non-urgent outcomes. Critical alone may use a filled background (for example overdue active service). Never use color as the only status signal; retain explicit words. Use theme-aware tokens and verify text contrast against the actual surface in both themes. Public-brand previews retain their separate public-page theme rather than inheriting Vendor-only styles.
- Candidate audit: Service Catalog now uses the same EntityGrid/EntityCard/EntityIconAction footer/icon anatomy, including quantity bounds, price, payment and booking-limit meaning, and enabled branch assignments. Resource pools and service resource requirements now use the shared entity grid, retaining service/pool names, configured capacity, units required, and unavailable-reference warnings. Counters now explicitly uses the approved grid. Staff now uses the shared grid by explicit request. Preserve existing contact fallback (email or phone), role and enabled-access badges, account ID, selected-location counter names and unavailable/cross-location assignment warnings. Keep owner/self protection and existing role select/confirmation semantics; map eligible access enable/disable and removal to named tooltip icons. Do not invent invitation states or Edit/resend actions absent from the membership contract. Actor/busy gates and collection controls remain authoritative. Bookings, History, billing transactions, resource requirement comparisons and operating-hour schedules retain tables where density/comparison matters. Operational queue lanes and resource sessions require workflow-specific review; do not blanket-convert them.
- This visual preference is not publication approval. Keep the aggregate corrected preview local until Carlo approves it.

- Service Catalog uses the shared entity grid without an additional enclosing panel/card. Keep collection controls above the grid, enabled switch and named tooltip Edit/Remove icons in each footer, with assignment-readiness and actor/busy guards. Preserve inactive-service removal restrictions and soft-removal confirmation. Weekly availability now uses the same entity grid by explicit request: show weekday, exact start/end and next-day marker, weekly recurrence, branch timezone, branch/service scope, simultaneous booking capacity and notes. Preserve existing server semantics, branch selector, loading/error/empty guidance and fallback/mixed-limit explanations. Keep enabled switch and named tooltip Edit/Remove icons; protect actor/busy/missing-service editing while retaining permitted removal. Date exceptions now also use the shared grid by explicit request: retain exact date, one-off timing or Whole day, branch timezone, branch/service scope, capacity or Usual limit, reason and Bookings allowed/Blocked states. The existing allow-bookings control must not be relabeled as an enabled/disabled exception toggle: off blocks bookings. Preserve the existing editor/removal confirmation, server precedence and missing-reference/actor/busy gates. Exception time ranges remain same-day under the existing contract; do not invent overnight support. Operating-hour schedules retain their independent layout.

### Service editor routes and resource relationship cards (2026-10-16)

- Existing service Edit navigates directly to `/dashboard/services/:serviceSlug/edit` using the persisted DTO slug, before opening/initializing editor state. Add service remains a dialog. Promote task title/description into the shared shell h1, Breadcrumb, Separator and arrow-left Back to services action. Preserve business/workspace scope; resolve only current-business authorized service IDs. Key draft initialization by business plus immutable service ID, not a mutable slug. Canonical server slug replacement must retain draft state and retry target. Keep the existing grouped fields and native validation rather than introducing unnecessary tabs.
- Service editor reload/Back/Forward and Cancel use the same controlled draft protection as Location Edit. Keep editing restores the captured draft; Discard changes explicitly leaves it. Retain all quantity, branch assignment, booking/payment and permission validation.
- Both resource pool and service resource requirement lists use shared entity cards. Pools show configured units and assignment counts; requirement cards identify the service, pool, required units and pool capacity. Missing references are explicit warnings with retained recovery/removal controls. Revision/version payloads stay in existing editors and mutation contracts. No activation, tracking or live availability is inferred from a configured/assigned badge; readiness gates and planning-only messaging remain authoritative.

### Queue controls grouping

- Place Add walk-in in Queue controls after existing Call/Confirm/Skip actions and a visible vertical separator. Keep only one Add walk-in action; preserve its original intake/busy/permission/scanner gates and dialog handler. Use installed shadcn ButtonGroup with an accessible group label and parent-constrained wrapping; keep Serving from with the same control group. No forced minimum toolbar width or document overflow on narrow screens.

### Multi-service queue plan semantics

- Keep service quantity and duration separate. Queue units are concurrent requested quantity; booking quantity labels such as Hours are a different contract. Use server queue-specific bounds and catalog duration/override policy.
- Draft save and publication are distinct actions. Drafts show no ticket position, hold or allowance consumption. Only expose supported actions from authoritative API capability/state.
- Preserve stable service-line IDs, revisions and idempotency keys. Unknown mutation results must retain the exact command and key for reconciliation before edits/navigation; stale rejections keep the draft.
- Do not silently accept a new catalog revision for a persisted draft. Show current durations/resource requirements and require explicit review; show mismatches without overwriting stored requests.
- Quantity reductions require explicit customer agreement and a reason; line changes clear that agreement. Booking/payment/account-linked identity remains protected.
- Planned resource demand, Call protection and actual allocation are distinct. Render server member records and current-stage progress; never infer actual holds or release from selected quantity or elapsed time.

### Service catalog status tabs

Within Service catalog, show Active and Inactive tabs with Active selected initially. Each status tab filters only its own services; omit the duplicate Status dropdown. Keep search, pagination and grid actions. Clearing search keeps the current status tab. Use the shared padded content-sized responsive tabs, clearly separate from Services and availability navigation.

### Multi-service Linear command boundary

Use the shared v2 active-plan projection and server allowedActions. Preserve exact ticket/plan/stage revisions and recorded current-attempt group IDs. Keep configured demand, protected reservations and actual allocations separate. Exclude v2 work from legacy scalar ticket cards/actions; legacy commands must reject it server-side. Publication follows explicit catalog review and saved-draft acceptance; do not silently save changed work as part of Publish. Resource waiting comes only from the server. Complete/Interrupt must explicitly release recorded allocations; expected end never implies release.

### Repeated service line identity

Ticket service rows are identified by stable lineId, never serviceId. Repeated catalog services must not be silently merged, deduplicated or reassigned to fresh catalog entries. Distinct quantity/duration requests require an authoritative publication/duration contract and independent explicit release semantics before becoming executable. Configuration service-to-stage mapping uniqueness does not imply ticket-line service uniqueness. Elapsed time alone never releases actual occupancy.

### Approved named courts and nested extras

One selected rental catalog service contains named court selections and per-court extras with stable identities at every level. Do not create duplicate catalog services per court or flatten extras into court resource demand. All selected courts share actual Start; each extra starts with its parent court and cannot outlast that court rental. Extra duration may be shorter. No delayed starts or extending extras beyond the court in this version. Present editing availability as provisional. Required-extra shortage remains Waiting unless an explicit agreed pre-start removal is audited/notified. Independently release recorded child allocations through server-permitted actions; time alone never releases occupancy and parent completion waits for required children. Pricing/quotes require explicit server policy; queue fees are separate.

### V3 nested request layout and recovery

Use visible service/court/extra context with short field labels and full accessible parent labels. Reset nested list/fieldset default padding rather than compounding narrow indentation. Preserve an invalid extra duration with a review warning; never clamp it after shortening the court. Only server-allowed, capability-gated child actions are displayed. Unknown committed responses lock edits/dismissal and retain the exact pending body/key for Retry; background refetch cannot reclassify a confirmed mutation as unknown. Request review links reload authenticated persisted projections. Keep quote-unavailable explicit and avoid parent success from partial group release.

### Business-neutral resource policy and duration counts

Shared labels use Service / Resources / Duration / Extras or explicit configured accessible names. Preserve business catalog/member names and current configured behavior. Duration count is a server-policy integer multiplier of base duration, distinct from concurrent resource quantity; display the explicit computed total. Use number steppers after the authoritative base/bounds/step/revision contract is handed off. Never infer counts from arbitrary minute options, clamp/reprice stale or invalid inputs, or globally apply/relax one business's scheduling policy. Automatic pooled capacity is not a promise of automatic named-member selection. Fixed/adjustable/hidden duration and required/optional extras must follow explicit supported capability metadata, with separate acceptance per path.

### Unified intake and editable queue policy (V4)

In the capability-gated preview, Add walk-in opens New service request and never publishes on open. Derive single/multiple service presentation from selected root catalog services only; keep resources/extras beneath their stable parent. Preserve closed/paused/scanner/busy/unknown and server readiness gates.

Queue service policy belongs under Services administration, branch scoped and service-management authorized. Expose explicit supported assignment, labels, integer duration base/count bounds/step/default, fixed/adjustable and visibility, optional/required extra selection and fixed supported execution rules. Preserve invalid input, revisions and same-key unknown-result retries. No inferred legacy numeric defaults, no silent clamp/reprice/revision stamping. Configuration changes affect new selections; historical review uses frozen snapshots. Keep the existing V4 pooled extra leaves and no-recursion boundary. The proposed V5 extra wrapper/resources extension was revoked and is cancelled.

Limit command refresh to the owning query families and current tenant/location; avoid invalidating unrelated administration records after each queue outcome.

### Queue policy collection

Queue policy items reuse EntityGrid/EntityCard and ManagedCollection, with Active default, Active/Inactive tabs, search, reset and paging. Membership follows authoritative catalog service isActive; configured/unconfigured is a separate state. Do not invent an independent policy activation flag or add a redundant Status selector. Use semantic outline status badges and tooltip-labelled44px icon edit actions. Keep current scoped GET/PUT permission, revision and replay safeguards in the editor. Fetch policy summaries for the visible collection page; retain branch/tenant query scoping.

### Queue policy form sections

Use General, Duration, Resources and Extras tabs for actual policy fields, with shared padded/inset tab styling, content-sized labels and44px targets. Keep navigation on one row when the parent allows, and wrap the group only at real width constraints. Preserve draft state across sections; validate hidden fields on submit and select/focus the invalid section with its error announcement. Busy/unknown commands lock sections and retain exact-key retry. Keep Cancel/Keep/Discard and persistent footer behavior. No dialog eyebrows. Reload policy belongs within General.


### Resource lifecycle controls

Use authoritative pool deletion dependencies and archive eligibility. Keep blocked Archive visible and show `deletion.archiveBlock.message`; do not infer safety from a frontend count. Archived pools retain readable registries and history, with writes disabled. Named-member editing retains stable IDs and expected revisions; capacity is never raised automatically. Unknown command outcomes lock dismissal and retry the identical payload/key. Cancel protection is an explicit reasoned action projected by the server, never an automatic effect of archival.


### Complex request and policy forms

Compose FieldGroup, FieldSet/FieldLegend and existing Field/Label/Description/Error primitives. Array rows retain stable IDs and nested service/resource/extra hierarchy. Use InputGroupInput with labelled native count constraints and configured base addon; totals must not silently coerce invalid values. Associate inline errors with aria-invalid/aria-describedby after interaction. Preserve mounted tab state while enforcing hidden inactive panels; invalid hidden fields route focus to their labelled tab. Layout adoption does not require replacing controlled state or command contracts.


### Named resource enabled switches

Reuse the Locations card Switch pattern with unique accessible labels, server-confirmed checked state, pending/unknown lock, semantic status badge and associated blocked/error reason. Disabled is reversible and preserves identity/history. Explain that only named selection changes; anonymous pool capacity is unchanged. Never free holds, resize pools or restore stale request captures from the toggle.


Maintenance and archival are independent: retain Active/Archived resource tabs. Active includes both enabled and temporarily inactive nonarchived members. Muted inactive text remains readable, searchable and interactive for re-enabling; do not disable the whole card. Archived uses explicit archivedAt only and blocks enabling/editing. Keep a distinct versioned Archive action; never infer archival from isActive=false or alter anonymous pool capacity.


### Resource pool explanations and group boundaries

Move long referenced-deletion explanations into an information tooltip aligned beside the status badge; keep the full authoritative message and a unique accessible icon label/description. Support hover, focus and click/tap with bounded wrapping; retain server-blocked reasons in confirmations/errors. Separate Resource pools and Service requirements with shared semantic Separator and clear responsive spacing, rather than adding separators inside each card.


### Service request step navigation

Use the approved Studio Stepper 9 vertical icon/description composition: lateral rail on desktop and compact stacked vertical progress on mobile. Customer details, Services & resources, Review; keep nested extras/duration controls within the service step. Back/Next navigate without saving or blocking incomplete drafts. Preserve mounted data/identities, explicit Save versus Publish, final whole-form validation and focus to the invalid step, busy/unknown locks and dirty cancellation. Show success only after server confirmation, never after Next. Review totals require a matching valid duration policy; do not invent minutes from stale, fractional or invalid counts. See the local [acceptance record](../plan/vendor-request-stepper-acceptance.md).

For the request Services editor, put Plus + Add service at the group header right only when rows exist; otherwise retain a prominent full-width empty action. Give each root service a bordered rounded Accordion item with a left chevron and an independent inline icon-only Trash action at the top right, with a unique accessible name and Tooltip; use unique select names, and return focus to Add service after removal. Keep the visible select label Choose service instead of duplicating Service N. Header actions wrap only when their container requires it and retain 44px targets.

Normal dynamic service-selection guidance uses the shared Alert info variant with an Info icon and polite status semantics; reserve assertive/destructive alerts for errors requiring immediate attention. Retain concise Single/Multiple root-service classification and keep nested extras scoped to their parent. Do not add a redundant alert heading.


### Inline alert semantic colors

Inline alerts may use mild semantic color surfaces. This explicitly differs from non-critical badges, which retain the existing text/border-only rule without fill. Use shared `Alert` variants `info`, `success`, `warning`, `error`; `destructive` remains an error-compatible alias. `default` stays neutral for compatibility. Do not add one-off raw colors or manual dark overrides at call sites.

The shared theme tokens own info/success/warning/error foregrounds, a 7% foreground-to-background mixed surface and a 35% foreground-to-border mixed boundary. Theme-level light/dark token values provide readable text/icon contrast; components consume semantic utilities. Match meaning with a current-library icon plus clear text: InfoCircle/information, CircleCheck/confirmed success, AlertTriangle/caution, AlertCircle/error. Decorative icons are aria-hidden; do not rely on color alone or invent success before server confirmation. Titles are optional when the message is already clear.

New info/success/warning variants default to polite `status`; error/destructive default to `alert`. Preserve explicit caller roles and existing neutral/destructive announcement behavior. Use assertive announcements only when urgency warrants them; static guidance may use an appropriate non-live role. Alerts add no keyboard stop or focus changes unless the task requires an action. Preserve wrapping, existing action focus indicators and readable short-mobile layout.

Do not insert permanent demonstration alerts into product screens. Component render/contrast checks may exercise non-current variants without touching user data. See [semantic alert acceptance](../plan/vendor-semantic-alert-acceptance.md).

### Resource/extra group actions and fixed fields

Resources now use nested shared Accordion cards as described below. V4 extra fieldsets retain the shared outlined group style and meaningful native legends. Their Trash removal action is icon-only near the top-right legend boundary, has a unique accessible name/tooltip with parent context, and retains a44px target and visible keyboard focus. Keep the action visible when focused in a short scroll region. Focus the parent Add resource/Add extra after removal. Keep Plus+Add extra concise with unique hidden context. Preserve required-extra removal gates.

An editable/configurable quantity stays visible even if its default is1. Hide a fixed named-member quantity1 without changing its canonical stored/server value. A confirmed fixed canonical extra quantity may be omitted; invalid/noncanonical values must remain reviewable. Do not infer that pooled quantity is inapplicable. Emphasize only valid duration totals with correct hour/minute units and concise count×base supporting text; invalid/stale counts have no valid total. Duration is not quantity, price or capacity.

Carlo specifically approved outlined groups for each extra nested inside its resource. These represent separate meaningful selections, not redundant decoration. Keep V4 extras as leaf selections, with plain-language guidance and no implementation/version explanations in the product flow. [Acceptance](../plan/vendor-resource-extra-form-refinement-acceptance.md).


### Request progress rail and root grouping

Each root service uses the shared Base UI Accordion, combining Studio03 left-chevron placement and Studio09 bordered rounded cards. Keep its title Service N plus the selected service name, and a separate sibling icon-only44px Trash Button/Tooltip at the inline top right; never nest removal inside the Trigger. Multiple services may remain open, and new services open automatically. Keep collapsed fields mounted with normal hidden semantics, preserve values and stable identities, and expand the relevant service and focus the invalid field after failed publication validation. Each resource uses the same bordered rounded Accordion pattern nested within its service, with Resource N plus its selected name, a left chevron, and an independent inline44px Trash sibling. Multiple resources may stay open, newly added resources open automatically, and collapsed controls/extras/member chips/duration counts/revisions stay mounted. Invalid fields expand both service and resource ancestors before receiving focus. Resource removal returns focus to its parent Add resource. Only extras retain outlined shared fieldsets. After root removal focus Add service. Preserve the conditional populated-header versus full-width empty Add action. This supersedes the earlier service and resource fieldset presentation; extra fieldsets remain approved.

On desktop with enough height, keep the request progress rail sticky inside the existing bounded dialog main scroll area (`position: sticky`, top0, align-self:start). The accessible fixed header/footer remain separate. Do not introduce manual scroll listeners or stacking overrides. On narrow or short viewports leave the compact rail in normal flow, so it can scroll away and never consumes the whole working area. Focused controls must remain visible and ordinary touch scrolling must work. [Evidence](../plan/vendor-root-service-sticky-acceptance.md).

### Flat V4 named extras and interval availability (2026-10-17)

Gate named-extra multiple selection on `namedExtraMembers.version=1`. Use the shared Base UI Combobox multiple/Chips pattern: visible names, searchable text, contextual44px removal, live selected/quantity count, no addition above quantity and exact distinct scoped active names before publication. Quantity reduction retains all selected IDs and names with a review error; draft saving remains available. Keep this one flat extra layer; no nested V5 resources.

Gate interval preview on `namedResourceAvailability.version=1`. Submit one bounded, debounced full editor tree plus every flattened resource/extra demand, including pooled rows; use normal authentication/CSRF and AbortSignal. Reject outdated request keys/catalog revisions/editor contexts, refresh every15seconds and relevant queue events, and honor Retry-After. Unknown or unavailable prevents new picks, while selected names and reasons remain visible and removable. Catalog eligibility/configuration validation stays distinct from temporary shortage: a valid request may publish Waiting. Call/Start remain authoritative; the preview never reserves anything. Only pass a scoped published own draft ID for server-validated own-protection exclusion.

Published named-extra groups have `execution=null`: display each frozen member name and its own `memberExecutions` outcome. Parent interruption/retry confirms the exact dependent member executions. Removing or replacing promised names counts as a customer-agreement reduction. Automatic extras retain their existing single execution.


TaskDialog focus must be corrected inside `.queue-dialog-main`, with a small inset above the persistent footer. Recheck the active control when the scroll body/content or viewport resizes, including after an already-focused invalid field encounters a keyboard-sized viewport. Scope scrolling to the dialog body; never move the underlying page. Use this same correction after nested validation expands ancestors. Keep per-member outcome action text concise (member name) with full service/parent context hidden accessibly; actions wrap and remain at least44px high. [Final local evidence](../plan/vendor-named-extra-runtime-acceptance.md).

### Counter controls and skipped requests

Use server-selected current/next targets and action descriptors for the selected counter. Show unavailable-action reasons and a path to the request’s nested outcomes. Never route a plan ticket through legacy actions or translate cancellation into Skip. Toolbar and request actions share a single pending command owner; an ambiguous response retains the exact target/body/key and blocks competing writes until same-command reconciliation. Skip and Recall require an explicit reason. Recall returns the same stage to Waiting under its preserved priority and age; it never implies a new ticket, automatic Call or resource allocation. See `docs/plan/vendor-counter-controls-acceptance.md` for remaining local acceptance.

Named request outcome extras use the shared nested-outcome container rule: semantic `--border` at4px,16px inline inset and8px vertical padding, with12px between named member groups. The selector must outrank the list reset (`ul:not(.entity-grid)`) so padding is not erased. Preserve natural wrapping; do not clip timings or flatten member outcome hierarchy.

Request review identity is scoped to its business/location. Clear selection and binding only after an accepted context switch; preserve them when the unsaved-edit guard rejects leaving. New review links carry an authorized location binding, resolved before detail fetch. Do not guess another branch after404. Keep real error alerts/Retry visible; cached detail/list actions must fail closed while their own read fails or refreshes.

Published request services use the shared multiple-open Base UI Accordion, left chevron and frozen service identity. Collapsed headers retain resource/extra/status counts and indicate available resource actions; request-level actions and critical waiting explanation remain outside panels. Default-open actionable/affected or current service, otherwise first. Disclosure is local UI state only. Use deliberate request20/service18/resource16/extra14/metadata13px hierarchy with incumbent font, resource duration prominent in human hours/minutes and units separate. Preserve exact calculations/times/history and the approved outcome inset; avoid repeated enclosing extra names on member labels.


Saved draft cards expose explicit Publish request, gated by authoritative allowedActions and publishReadiness; show server reasons when unavailable and preserve incomplete Save. Trash is draft-only, permission-gated,44px and tooltip-labelled, with a named confirmation defaulting to Keep draft. Unknown or malformed responses retain exact body/revision/key and shared write ownership; focus the same-command retry. Clear only a matching selected draft after validated deletion or authoritative gone evidence. Never treat provisional readiness as resource allocation or infer allowance enforcement from successful Publish.


### Service request transaction-table exception (2026-10-18)

Published service requests use an expandable transaction table by Carlo’s explicit authorization; Administration entity lists retain their approved grid. Separate body rows and expanded details horizontally. Keep mobile labeled cells,44px disclosure/actions, keyboard aria-expanded/controls, loaded-record search/filter/sort/pagination and existing server Load more semantics. A collapsed row advertises available resource actions; expansion retains service → resource → extra → named-member hierarchy.

Label duration as planned time elapsed, never work completed. Use server observedAt plus monotonic receipt time and the exact allocation attempt’s startedAt/expectedEndAt/releasedAt. No waiting/protected elapsed bars, current-catalog estimates or aggregate named-extra clock. Freeze released history at actual release, even below100%; cap active progress100%, show OVERDUE only for current unfinished allocated work strictly beyond expected end, and never auto-complete/release. Pause includes elapsed wall time under the current contract. Summaries use distinct current outcome/overdue counts rather than averaging parallel durations. Mark unknown/stale reads, preserve failed-read command gates, and use one visible-page timer with cleanup. See `docs/plan/vendor-request-table-acceptance.md`.

### POS-style request intake (2026-10-18)

The service request editor uses a near-fullscreen three-step task flow: Select service, Customer details, and Review. The Services step may show a two-column resource-card catalog beside the configured selection editor on desktop; cards are descriptive and never reserve capacity. Use one shared request duration control across selected resources and extras, while retaining each server policy revision and validation result. Collapse the catalog above the editor on narrow screens and preserve bounded dialog scrolling and reachable actions. The request table may show one derived overall planned-time envelope per row, but member-level timing and explicit Complete/Interrupt semantics remain authoritative and are never synthesized into completion.

### Service request completion and interruption review (2026-10-20)

Every row or child Complete action opens an explicit consequence review before a
command. Provide Cancel and success-intent Complete, focus Cancel initially, and
allow idle Cancel/Close/Escape/backdrop dismissal without a write. Preserve pending
command/reconciliation locks, exact revisions, allocation IDs and idempotency keys.
Interrupt review must derive its affected list from fresh active allocation-member
lineage, distinguish the primary selection/dependent extras from unaffected active
siblings, and recheck the same scope before sending. A label or stale selection
summary is insufficient evidence of what a command will release.

Request status badges use compact outlines and subtle semantic tints: waiting,
paused, interrupted, skipped/unserved and partial/mixed use warning; called,
protected, in-service and handoff use info; completed/served/released use success;
cancelled/terminated use destructive; draft/pending/superseded/expired and unknown
states use muted neutral. Share `requestStatusIntent` across parent/child request
views. Color supplements visible status text and never determines lifecycle or
available actions. Scope badge styles explicitly; do not recolor input, Select,
button, dialog, progress or focus borders through shared token changes.

### Vendor response toasts (2026-10-20)

User-facing vendor workflow failures and successful user actions use the shared toast queue with matching error or success intent. Validation still keeps the invalid step, field association, and focus guidance in the form, but duplicate generic response banners are removed. Toasts render above task dialogs/backdrops through the vendor portal and are announced by the toast primitive. Action-triggered responses are emitted by the command owner; background polling and unchanged repeated errors must not emit new toasts. Stable notification IDs deduplicate an ongoing failure while allowing a later user action to report again.

### Historical selections during duration edits — 2026-10-20 reconciliation

Changing the request duration must retain existing extra selection IDs, parent scope, selected member IDs, quantities and independent durations. Removal remains explicit; required-extra, duration relation, catalog/policy revision and customer-agreement checks still apply. A shorter parent that conflicts with a retained child must require review rather than silently deleting the child. Resource-only NEW intake requires an explicit server capability/validation contract before consumers rely on it. Preserve historical V2/V3/V4 structures, lifecycle, receipts and allocations without conversion, reparenting or deletion. This agreed scope is not evidence of implemented server admission.

### Public access and recovery presentation — 2026-10-20

Public access and displays uses two sibling cards: Customer self-service entry and Queue Board Access. Stack them by default; introduce two columns only when the available workspace is at least60rem. Keep cards top-aligned with intrinsic heights, preserve QR aspect ratio and full-width usable link fields, and retain mounted disclosure/scanner state and all pairing authorization/busy/dirty-close guards.

Carry-over and missed-request recovery reuse the approved Service requests datatable surfaces, shared semantic Table, cohesive view/search/sort controls, human-readable ticket/customer identity, restrained in-table empty row and loaded-result pagination. Search/sort/pagination operate on actual loaded rows only. Carry-over has no mutation actions. Legacy Restore retains its existing lookup credential, queue-day, intake threshold and busy guards; plan Recall stays separate with its revision/reason/priority semantics. Do not restore the duplicate current-flow Current queue or route plan Recall through legacy Restore.

### R3 recovery acceptance boundary — 2026-10-20

Current QA presentation verdict is PASS: actual main-route public cards/disclosures at390/768/1440, and R3 synthetic presentation of the actual frozen component/styles with the corrected production wrapper context. The R3 dark recaptures are correctly sized and readable at375/768/1440. Keep the accepted evidence scopes separate: synthetic pagination/search/sort/empty rows and local mock Restore Escape/focus return do not prove real Restore/Recall, idempotency or production recovery outcomes.

Preserve history: R1 static-serving security FAIL was superseded by the bounded R2 static-serving fix; the withdrawn R2 dark visual PASS and subsequent dark FAIL were superseded by the R3 wrapper-only production-context fix and fresh QA recaptures. Product component/styles were unchanged by that harness fix. R2 functional/security/light PASS remains valid. This slice does not complete the full vendor rework.

## Dashboard overview implementation — 20 October 2026

The selected Dashboard combines A At a glance, B's pool detail Sheet, and C's conditional attention. Keep the Dashboard item above Live queue in Operations; `/dashboard/overview` is the Operations landing, while remembered Administration still opens Settings. Reuse the workspace's theme, business/location controls, role/MFA and unsaved-navigation guards. The overview root establishes semantic foreground within `vendor-operations`; Sheet content stays in the vendor portal. Chart bars have exact text equivalents and keyboard-accessible pool buttons.

Use the useful, precise KPIs **Waiting now** (server `readyWaitingCount`) and **Requests using resources** (distinct ticket IDs in the active allocation observation). The legacy `readyWaitingCount` SQL counts waiting requests for the current queue date, excluding future bookings. It does not test resources, plan validity, READY stages/counters or next-request eligibility. The resource-use metric is not a complete in-service total. Waiting/called chart counts are explicitly loaded requests. Pools needing attention is unavailable if complete observation quality cannot be established. Keep product copy plain: used, available, availability unknown, last updated, reconnecting. Detailed contract and authority explanations belong in technical documentation, with the protected-demand/overdue explanation once in pool details.

The guarded local `resource-operations` read is the only source; never use the internal not-ready producer/null snapshot or synthesize totals from `QueueSnapshot`. Missing/unknown pool quality, archival, disabled tracking and invalid capacity never imply availability. Keep allocation/protection arithmetic separate, overdue inside used units, and never sum unlike pool units. The agreed additive quality fields are `archivedAt`, `availabilityQuality`, `availabilityReasonCodes`. Only observed point-in-time quality supports availability, never admission/global health. Unknown arithmetic is retained without a usable-availability claim; unscopable reconciliation makes all affected availability unknown. Converted protected rows are excluded from current protection by the authoritative backend, not frontend subtraction.

The module owns a scoped cookie-authenticated stream and 15-second foreground read fallback. Only matching `ready` establishes stream connection; hints invalidate, reconnect/focus refetch, heartbeat gaps restart with bounded backoff, and cleanup prevents old callbacks crossing scope/session. Last-good observations remain visibly stale on transient failure; 401/403 suppress data and close the pool Sheet. No lifecycle controls are introduced on Dashboard. Source/static verification is separate from rendered/mobile, authenticated integration and deployment acceptance.

## Dashboard bounded runtime acceptance and display handoff — 21 October 2026

Head accepted the bounded Dashboard evidence with no behavioral FAIL. The verified report is `/Users/carloabella/.codex/local-test-harnesses/vendor-dashboard-review-20261020T231536/causality-harness-v2/output/playwright/QA-EXECUTION-REPORT.json`, SHA-256 `d76d5b7031b3e7353113511ab4e9e1793d947efaeee375a4137448c56888a225`. Twelve numeric script cases and ten actual Dashboard SSE → own GET → visible-value cases passed (58–137 ms), covering publication, Call, Start, Complete, Interrupt and hold release. Assigned staff GET/SSE passed; unassigned/revoked access returned 403 and old streams closed. Head reviewed the images. All QA-owned browser sessions, test API/frontend and disposable DB services stopped; original/preserved services were untouched.

Coverage is bounded: first-publication UI causality remains untested (two other publication cases passed); configuration event/own-GET revision/capacity and visible UI change passed, but strict DOM latency was not captured. A pure queue.read-without-operate role cannot be represented by current product roles; normal assigned staff performed only GET/SSE, without permission overrides. The tested visual matrix was 1440 light/dark, 390 light, plus 768 light and 390 dark lower-page/Sheet checks; no horizontal overflow and Sheet focus/return passed in those checks. Long overflowing Sheet scroll stress and the full all-theme/all-breakpoint matrix remain untested. This is not unrestricted/full-matrix acceptance.

Final API/Head semantic correction: headline **Waiting now**, caption **Excludes bookings scheduled for later.** The legacy `readyWaitingCount`/frontend `readyToCall` names remain for compatibility. Their value is all waiting requests for the current queue date excluding future bookings, not resource availability, valid plans, READY stages/counters, or next eligibility. Eligibility stays in Live queue. Earlier call-ready interpretation was incorrect; previously measured numeric deltas remain valid. The v3 display-only correction also formats singular/plural units in pool values and Sheet details. No runtime logic or API expansion is introduced.

Source provenance: independent source review passed frozen v2 (22 verified files); v1 functional suite 395/395 and typecheck passed, and v2's sole CSS full-span correction built successfully. The versioned v3 packet records focused existing Dashboard/presentation tests, typecheck/build and exact changed-file hashes/delta; no full functional or command-runtime rerun is claimed for this display/comment/documentation-only follow-up. Hook, backend, accounting logic and frozen functional behavior remain unchanged. Existing focused Dashboard/presentation tests passed 13/13; frontend typecheck passed; v3 production build passed in 19.62 seconds with the existing Chart/Tailwind selector and chunk-size advisories.

Separate blocker: the normal migration runner's lexical dependency ordering bug remains unresolved. The test-only dependency-ordered bootstrap succeeded; that does not establish production migration readiness. Original main preview was subsequently refreshed by primary after independent v3 review: reviewed API source verified, API5007 restarted as PID46339 with the same private fixture and guarded launcher; frontend5187 remained PID70155 and returned HTTP200. Authenticated assigned-staff VD Sports Club / Demo Courts Dashboard showed Waiting now 0, requests using resources 3, pool usage Courts4/4, Basic Equipments14/20, Trainers3/4, and Trainers detail '1 unit' available. All15 business-table counts and complete row digests matched before/after, including the tickets present at that earlier Dashboard-only checkpoint; this is not the duration-delivery baseline. Read-only preview checks performed no lifecycle/configuration commands, migrations or reseed. Evidence: original-preview-before.json, original-preview-after.json, original-preview-verification.json and original-preview-v3-dashboard.png in the durable review packet. No commit, push, merge, deployment or production activation occurred.

## Store-hours-aware request duration — source handoff, 21 October 2026

The new V4 service-request duration control shows the server-selected closing time and a provisional maximum fitting duration. It uses the approved `serviceHoursWindow` on selection-options (`status`, DB-clock `observedAt`, timezone, open/close instants, remaining whole minutes, provisional marker). Dynamic hours metadata does not change `catalogRevision`. A client-only monotonic timestamp captured at request start conservatively includes network latency; the countdown uses server instants plus elapsed time, never browser weekdays, local wall-clock scheduling, adjacent-window merging or queue extensions.

This is an **earliest-start-now limit**, not promised queue start, admission or resource availability. Exact finish at closing fits; elapsed time can make the same count too long. Linear resources run in parallel (maximum duration); ordered stages use the sum of each selected stage's maximum root-resource duration. Quantities do not multiply time; contained extras add no time. Top-level transported direct-resource rows are canonical roots mapped by their own service ID; nested extras inherit their root stage. Missing/duplicate stage mappings are unavailable, not guessed.

All affected selected duration policies are intersected, including min-based steps and fixed defaults. The shared numeric field and buttons preserve invalid typed strings and child selection identities; no silent truncation, extra deletion or first-resource policy clamp. Closed, unknown, policy-incompatible or minimum-no-fit states explain the publication block while draft Save remains available. Focus/visibility/online/scoped queue hints and the existing foreground refresh update open forms without resetting drafts. The amend form shares count-control consistency without client-side new-intake hours gating; server-side amendments of newly tagged requests still revalidate current hours, while historical untagged amendments retain existing behavior. Legacy V3 publication and active/history records are unchanged.

Full source and the latest six documents were snapshotted before edits at `/Users/carloabella/Backups/GetPrio/vendor-duration-hours/2026-10-21T00-49-18+0800` (1601 source entries; source manifest `c3c8e78f0ba98a460aa28b876a5f2f855d667bad97e6fa3badca9d321c7abd12`). Focused duration/preservation/refresh tests passed 34/34; final frontend typecheck/build logs and exact source hashes accompany the versioned packet. Dashboard v3 implementation is preserved. At this source-handoff checkpoint, independent focused source review and a bounded isolated runtime pass were pending; the final bounded QA and local-delivery evidence below now supersedes that pending status. No runtime acceptance was claimed by the source checkpoint. Server publication remains authoritative, and the backend companion is reviewed separately; this is not production enforcement, migration readiness, deployment or activation evidence.

## Store-hours duration — final bounded QA and local delivery, 21 October 2026

**Status: bounded runtime PASS after frontend v2 layout correction; local preview delivery verified.** This supersedes the duration source-handoff's pending runtime status, while retaining that checkpoint and its pre-edit snapshot/test provenance. Backend v2 and frontend v2 source/runtime packets remain immutable. Source review passed; frontend focused tests were 34/34, typecheck passed, and the v2 build passed in 24.93 seconds. This final update changes documentation only.

Authoritative final QA: `/Users/carloabella/.codex/local-test-harnesses/duration-store-hours-qa-20261021-readonly/runtime/QA-FINAL-REPORT.json`, SHA-256 `24190156f26e9e3ba9d6bfdce9a0cc0dc4a65d93fccfa9e44993e3927f80fecd`. A single fresh isolated fixture used normal owner authentication. A 45-minute count 3 draft was preserved against a roughly 34-minute window; direct Publish rejected with `409 SERVICE_DURATION_EXCEEDS_STORE_HOURS` and fresh window metadata, leaving no published version, hold or allocation. Reopening retained 3; entering 2 showed the correct maximum 2, disabled + and 30-minute total. Natural aging over 35 samples / 34.746 seconds reduced maximum 2→1 while retaining entered 2 and showing the warning, without clock changes, hour writes or manual refresh. A valid 15-minute publication passed; all three duration-bearing marker locations were tagged, while the separate organizational service root was correctly untagged. After shortening only synthetic hours to about 9 minutes remaining, tagged Call rejected with the same 409 and fresh metadata; the ticket stayed waiting with no holds/allocations and one published version.

Frontend v1's 16-pixel input/suffix overlap was resolved by the independently reviewed v2 layout-only change. Actual 1280 desktop and 390 mobile checks showed readable count 2, suffix below, 44-pixel buttons, input widths approximately 224.7 / 202 pixels, focus inside and no horizontal overflow. An open form's explicit Refresh hours changed the helper maximum 30→15 minutes and input maximum 2→1, preserving chosen 2 with warning and disabled +. Final frozen backend 642-file and frontend 457-file fingerprints were unchanged. Only QA-owned API5009, UI5189, DB56790 and browser processes were stopped; fixture files/private evidence were retained and original/preserved services were untouched by QA.

**Coverage limits:** exact closing/1-ms overshoot; split/overnight/24-hour/timezone/DST windows; stage maxima/sums and quantity/extra arithmetic are source/deterministic evidence here, not additional live cases. Tagged Start, Retry, amendment, receipt replay-first behavior, malformed/mixed/unsupported provenance and historical V4 compatibility are reviewed source/focused-test coverage only. The runtime fixture had no selected extras, so extra-identity preservation has source/test coverage, not actual extra-UI runtime proof. Full theme/breakpoint matrix, physical mobile keyboard/device acceptance and old/history/active production commands remain untested. No full-rework completion or production readiness is implied.

Primary's delivery evidence: `/Users/carloabella/.codex/local-test-harnesses/duration-store-hours-review-20261021/LOCAL-DELIVERY-VERIFICATION.json`, SHA-256 `8359f6dea25d72699f9f9b12d5dce66e7d1452f276d46af44ea7683dc35cec44`. Reviewed source union was verified; API5007 ran as PID56057 and UI5187 remained PID70155. Authenticated assigned staff in VD Sports Club / Demo Courts saw closing 3:00 AM, maximum 1 hour, chosen count 1 and disabled +. The unsaved local inspection selection was discarded; no original preview Save, Publish or lifecycle command ran. All **19 business-table complete row digests/counts matched before and after, with 13 tickets before and after**. The earlier Dashboard-only ticket baseline changed before duration source edits and is not the duration-delivery baseline.

The normal migration runner's lexical dependency ordering bug remains unresolved. Successful test-only ordered bootstrap (158 migrations, zero pending in this isolated fixture) does not establish production migration readiness. The current preview delivery is local only; no commit, push, PR publication, merge, deployment or production activation is claimed. No additional product/test edits, process changes or database actions were performed for this final documentation update.

## Waiting-request hours eligibility — final bounded local acceptance (2026-10-21)

This followup is implemented, independently source-reviewed and locally delivered with bounded runtime acceptance. It preserves Dashboard v3, duration v2, existing historical requests and all broader rework acceptance gaps. It supersedes this followup's source-only/runtime-pending handoff; earlier checkpoints and immutable backend v2/frontend v1/v2 packets remain evidence of their respective revisions.

The server supplies `serviceHoursEligibility` on published plans, waiting rows and counter targets: `status` is `fits | does_not_fit | unavailable | not_enforced`, with `reason: {code,message} | null`, `requiredDurationMinutes: number | null`, approved `serviceHoursWindow | null` and `nextChangeAt: string | null`. Newly server-tagged requests are checked against the current earliest-start store window; this is no promise of resource availability or queue-start time. Historical untagged requests remain `not_enforced` with neutral “Earlier request · hours limit not applied” when shown; there is no inferred fit, new hours conflict, rewrite or retag. Unknown/malformed tagged requests are unavailable. A blocked/unknown request is excluded from the backend's Next eligible result. The frontend uses that exact server candidate, including an empty result, without a resource-only loaded-list fallback. FIFO stays separate. A manually selected blocked request remains inspectable as **Selected request**, with a distinct store-hours row/card reason and disabled Call, independent of resource-conflict status.

The server emits a scoped invalidation at the exact fit boundary (`close − required duration + 1 ms`); its 25-second heartbeat also checks opening/recovery changes. Stream comparison scans the complete authorized scope in 1,000-row batches under one database clock. An incomplete scan or the 2-second/10,000-row budget closes the stream rather than presenting a partial healthy result. The frontend trusts matching authorized `ready`/heartbeat health, not `open` alone. Boundary hints and authorized heartbeats invoke actual scoped GETs; heartbeats do not manufacture `observedAt` or receipt freshness. A coalesced trailing read preserves an invalidation arriving during an in-flight read. Browser 15-second polling is disconnected/unhealthy recovery only; error/gap handling and token/location cleanup are preserved. A failed GET keeps the actual last successful snapshot/receipt and the honest stale/update warning. No browser schedule calculates eligibility; elapsed timing never releases capacity or changes request outcomes.

Final independent QA report: `/Users/carloabella/.codex/local-test-harnesses/duration-store-hours-qa-20261021-readonly/eligibility-reuse-v1/QA-FINAL-REPORT.json`, SHA-256 `c9df7a9ca54f99ec74d4de524d22c937689a36fcb0de199bdf448b7d8fa1b759`, **BOUNDED_QA_PASS**. With frontend v1/backend v2, a time-only server event caused the browser's own counter GET after 7.506 ms and its response after 834.776 ms; card/row change rendered in about 1.3 seconds, without focus, navigation, manual refresh or a mutation at that boundary. FIFO VD009 became `does_not_fit`; backend Next eligible VD010 remained `fits`. Manual blocked selection retained its warning and disabled Call, with separate resource-conflict-free status. A synthetic hours reversal cleared the warning while retaining selection within 470 ms. Reviewed frontend v2 changed heartbeat freshness only: 83.640 seconds of healthy stream observation kept the stale banner absent through real GET snapshots; a **browser-only synthetic 503 interception** for 94.033 seconds preserved the last successful server timestamp/receipt and showed both stale/update warnings. Removing interception allowed normal heartbeat GET recovery and cleared those warnings without server writes. This is a browser transport-failure test, not a server-failure claim. The primary boundary setup was not repeated for v2.

Backend focused evidence is 62 passing tests. Frontend v1 has 25/25 focused tests, typecheck and a 59.82-second build; frontend v2 has the relevant 6/6 stream/readqueue tests plus typecheck, with no full build/full-suite repetition. Independent source review accepted both revisions. Final literal runtime fingerprints had no mismatches across 645 backend and 461 frontend files. Only QA-owned API5009/UI5189/DB56790/headless processes were stopped; retained fixture/private evidence files were preserved. Runtime disconnect/reconnect, unknown eligibility and amendment reversal remain source/test evidence only. Direct rejected-Call atomicity was not repeated in this feature run; prior duration runtime and current source evidence remain its provenance. Screenshots show the wide card/table; this adds no full responsive/theme matrix or physical-device acceptance claim.

Final original-preview delivery: `/Users/carloabella/.codex/local-test-harnesses/queue-hours-eligibility-review-20261021/LOCAL-DELIVERY-VERIFICATION.json`, SHA-256 `cc51fe13ddcfcf5174b714dbe4dd8b2d661ca7263ead0b3485d087996a2bc242`. The exact reviewed source union was verified; original API5007 was PID86316 and UI5187 stayed PID70155. Assigned-staff authentication in VD Sports Club / Demo Courts worked, but the current queue day was **not opened and had zero current rows**: no original-preview hours warning, historical-neutral row or candidate behavior is asserted from that screen. No business action, Open queue, lifecycle/configuration command, save, publish, retag, migration or reset occurred. All 19 business-table complete row digests/counts matched before/after, with 13 tickets unchanged. Historical requests were not rewritten or retagged.

The normal migration runner's lexical dependency-ordering defect and broader rework/acceptance gaps remain unresolved; the earlier test-only ordered bootstrap does not prove production migration readiness. This is a bounded local milestone, not full-rework completion, merge, deployment or production readiness. This final synchronization changes only the six existing documents; no additional product/test/runtime/database/Git-publication action is part of it.
