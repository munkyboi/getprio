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

## 7. Lists, details, metrics and billing

- Reuse list toolbars, filters, row actions, badges and pagination across staff, bookings, services, resources and other entities. Expose bulk actions only where the API and permissions support them.
- Preserve server-side filtering/pagination and realtime reconciliation. Mobile tables use prioritized columns, deliberate overflow for secondary data, or cards that preserve critical state/actions.
- Detail views show the entity identity and status first, then relevant tabbed sections. Stack summary/content on mobile and avoid hiding required tasks in overcrowded tab rows.
- Metrics display source period and meaningful labels. Queue count, predicted stage wait, resource occupancy and journey completion are separate measures. No invented trends or template values in live screens.
- Upgrade views show actual plan/usage, limits and configured prices. Use billing-period toggles only when supported. Do not change subscription tiers or feature eligibility through presentation work.

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

Use the agreed interactive prototype's neutral surfaces and shell hierarchy: full-height narrow sidebar, business/location context above workspace navigation, account context below it, compact top toolbar with the Operations/Administration switch and theme/account controls, and a separate content heading. Retain GetPrio branding and real supported links. Avoid reinstating the public-site toolbar above the vendor shell, oversized header forms, a tinted dashboard frame, or serif page headings. On mobile use the navigation sheet and stack the workspace switch while keeping controls reachable. The reference's simulated roles/plans, sample workflows and resource pilot actions do not authorize operational controls. Carlo's local review must precede migration of the next feature screens.

## Operations list and booking detail rules

Bookings uses server pagination/search/filtering; label summary counts as current-page counts. Clients/History search only their loaded records and show server retention labels, without claiming an all-record search. Keep History's loaded list limit separate from export-period entitlements. At narrow container widths preserve column labels and wrap complete status/action text; rows remain keyboard-operable and nested controls own their actions. Use the shared task-dialog anatomy for booking details, payment review and rescheduling. Preserve frozen booking data, private proof access, payment/arrival gates, exact targets and staff/admin differences. Exports and mutations block overlapping actions; failure is distinct from empty data. Never equate booking-list navigation or check-in with opening a Queue Day, explicit service start or resource allocation.
