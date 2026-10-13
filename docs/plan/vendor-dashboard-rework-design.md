# Vendor dashboard rework: shadcn/ui design brief

Implementation status: see [rework progress](vendor-dashboard-rework-progress.md). Slice 1 retains existing `/dashboard/*` routes with explicit workspace state; canonical workspace-root proposals remain staged.

13 October audit supplement: the [full dashboard audit](vendor-dashboard-full-audit.md) and [preservation checklist](vendor-dashboard-rework-preservation-checklist.md) are mandatory migration inputs. They correct stale monitor/billing assumptions and enumerate current section/action/failure-state coverage. Existing product decisions remain in effect; their future runtime behavior remains separately gated.

Status: implementation in progress; shared shell merged in PR 398 and Live Queue is the next slice. Original design decisions reconciled 5 October 2026. See the [completed interview decisions](vendor-dashboard-workflow-decisions.md). User-selected design direction and references; see progress notes for migrated surfaces and remaining acceptance.

Implementation must follow [Vendor UI design rules](../design/vendor-ui-rules.md), also linked from the repository's AGENTS.md.

## Direction

Rework the vendor dashboard with shadcn/ui. Use the supplied AdminCN pages as layout and UI/UX references, adapted to GetPrio branding and operational needs. Integrate the React Flow Workflow Editor approach into this design system. This brief complements [Queue Workflows and scheduling](queue-workflows-and-scheduling.md).

One vendor application and login serve Operations and Administration. Vendor Admins switch workspaces in the dashboard shell; authorized staff use their assigned operational views. The free-tier owner can operate and administer using one seat. Permission enforcement, subscription rules, and existing auth contracts remain server-owned.

## Reference inventory

All eleven AdminCN pages were inspected in the browser at desktop size on 3 October 2026. These observations cover visible layouts, not template source licensing, mobile validation, or full interaction behavior.

| GetPrio surface | Supplied reference | Layout to adapt |
| --- | --- | --- |
| Vendor login | [Login v3](https://shadcn-nextjs-admincn-admin-template.vercel.app/pages/auth/login-v3) | Focused login form paired with a large branded visual panel |
| Vendor registration | [Register v3](https://shadcn-nextjs-admincn-admin-template.vercel.app/pages/auth/register-v3) | Matching split layout, clear field hierarchy, primary action, login link |
| Vendor MFA challenge | [Two steps v3](https://shadcn-nextjs-admincn-admin-template.vercel.app/pages/auth/two-steps-v3) | Matching split auth layout, code entry, verification action and supported recovery path |
| Vendor onboarding | [Onboarding v1](https://shadcn-nextjs-admincn-admin-template.vercel.app/pages/onboarding-v1) | Step-based setup with purpose/progress alongside the current form |
| Lists | [User list](https://shadcn-nextjs-admincn-admin-template.vercel.app/apps/users/list) | Summary cards, filter row, search/action toolbar, status badges, pagination |
| Detail pages | [User view](https://shadcn-nextjs-admincn-admin-template.vercel.app/apps/users/view/user-001) | Entity summary with tabbed details and activity timeline |
| Dashboard metrics | [Orders dashboard](https://shadcn-nextjs-admincn-admin-template.vercel.app/dashboard/orders) | Metric cards and grouped chart/detail panels |
| Data tables | [Datatable](https://shadcn-nextjs-admincn-admin-template.vercel.app/datatable) | Consistent rows, actions, pagination and column-visibility patterns |
| Long forms | [Sticky actions](https://shadcn-nextjs-admincn-admin-template.vercel.app/forms/form-layouts/sticky-actions) | Sectioned forms with persistent primary actions |
| General forms | [Vertical layout](https://shadcn-nextjs-admincn-admin-template.vercel.app/forms/form-layouts/vertical) | Labels above fields, card/section grouping, related columns on wider screens and clear submission actions |
| Free-tier upgrade | [Pricing](https://shadcn-nextjs-admincn-admin-template.vercel.app/pages/pricing) | Plan comparison cards, billing-period control where supported, upgrade actions |

Use GetPrio text, logos, imagery, entities, prices, and supported features. Example OAuth buttons, trial offers, discounts, template metrics, profile fields, and subscription labels are not product requirements. Do not copy the demo's Buy Now overlay or full navigation inventory. Use actual configured pricing/entitlements and expose only supported sign-in providers. Registration and onboarding preserve verification, validation, and legal notice requirements.

The MFA reference mixes a Password reset heading with two-factor messaging and SMS/resend copy. Adapt its layout using coherent GetPrio MFA labels and the actual supported factor/recovery method; do not infer SMS delivery or resend functionality from the demo. General forms use the vertical reference as the default composition; long forms retain the sticky-actions reference.

## Workspace structure

Operations prioritizes immediate tasks: location/station context, waiting and called tickets, active sessions, journey progress, operational bookings, and relevant alerts. Avoid placing analytics or configuration ahead of Call, Start, and Complete actions. Staff see only permitted stations and data.

Administration uses one Queue setup sidebar item with Workflows, Stations, and Resources page tabs; no nested sidebar submenu is required. Service forms provide contextual entity links.

Administration prioritizes business setup: workflow builder, stations/resources, services, locations, staff, business profile, reporting, settings, and billing. Use the list/detail references for reusable entity patterns. A user-list reference does not authorize platform-wide user management in the vendor portal.

Keep the workspace switch visible to Vendor Admins, with explicit labels and workspace-specific navigation. Share account/theme/location controls where meaningful. Default and remembered workspace behavior follows the combined plan. Switching retains the session, protects unsaved work, and does not change role or seat count.

## Design system and interaction rules

- Use shadcn/ui component source, Tailwind, shared semantic tokens, and reusable page compositions. Select primitive base and project configuration during foundation work; do not assume the demo's base dictates GetPrio's choice.
- Define typography, spacing, surface/border treatments, status semantics, charts, forms, and navigation once. GetPrio branding governs color and imagery. **Both light and dark mode are required**, using shared semantic tokens across Operations, Administration, login, registration, onboarding, billing/upgrade, and the React Flow editor. Provide an accessible theme control, persist the user's explicit choice, and use system preference when no choice is saved. Avoid a theme flash during initial loading.
- Verify both themes for text/status contrast, chart legends and series, table states, form validation, overlays, focus indicators, and React Flow nodes/edges/canvas. Theme switching must preserve unsaved forms, editor state, and operational context.
- Mobile-first: stack auth panels, prioritize the form, and reduce decorative visuals. Stack onboarding guidance and fields; hide no required setup behind desktop-only interactions. Make next/back and progress clear, with resumable server-backed setup where the existing flow supports it.
- Tables use prioritized columns or mobile cards, searchable filters, explicit empty/loading/error states, and existing server pagination. Do not replace server queries with a demo's client-side data model. Keep important actions touch-accessible and avoid clipping critical state.
- Detail pages stack the entity summary and tabbed content on narrow screens. Long forms retain reachable actions and field errors. Preserve the existing task-modal requirements for fixed header/footer and independently scrolling content using shadcn Dialog/Sheet/Drawer compositions.
- Reuse accessible labels, focus management, keyboard support, approximately 44-pixel touch targets, and unsaved-change protection. Do not rely on hover for operational controls.
- Metrics use clearly defined sources and periods. Only show trends/comparisons supported by actual data; waiting count, stage wait, occupancy, and visit completion remain distinct measures.
- Upgrade pages show current plan, usage/limits, comparison, and the supported upgrade path. Queue Workflows is Pro-only under the user’s explicit decision. Standalone resource tracking begins with an explicitly enabled pilot; permanent resource-tier limits remain deferred. Entitlements are enforced on the server and are distinct from seats/workspace access. After Pro ends, retain authorized resolution of existing journeys while blocking new admissions and configuration writes.

## Migration approach

The inspected frontend currently uses Vite, React, and Mantine. shadcn/ui is the target for the reworked vendor surfaces. The reference template's Next.js name does not require a framework migration.

1. Inventory vendor routes, auth/onboarding entry points, API contracts, permissions, and shared components. Identify any shared customer pages before replacing their primitives. Review existing shadcn work elsewhere in the repository for reusable conventions.
2. Establish vendor shadcn/Tailwind configuration, semantic tokens, shell, workspace switch, responsive navigation, and reusable forms/tables. Scope styles so transitional Mantine/customer pages are not broken by resets or token changes.
3. Build reference-aligned auth/onboarding and representative list/detail/form screens with synthetic data for design review. Verify actual operational tasks and states, not only static resemblance.
4. Migrate vendor screens in reviewable slices: shell and Operations, Administration list/detail/forms, workflow/resource setup, metrics, then billing/upgrade. Preserve endpoint contracts and feature availability until runtime dependencies are ready.
5. Integrate React Flow custom nodes and settings panels with the same shadcn tokens/forms. Adapt its authorized template source when available; follow the combined plan's sequential runtime limits and equivalent mobile editing.
6. Verify roles, one-seat owner switching, responsive/accessibility states, authentication, pagination, realtime updates, and queue/session lifecycle. Retire old vendor components after migrated routes are validated; keep compatibility for unaffected surfaces.

Auth route migration needs explicit scope mapping if the existing sign-in is shared between roles. A layout replacement must not fork account identity or authentication policies.

The supplied demo is a design reference. Source reuse requires checking actual access/license terms; implementing original reference-aligned layouts with shadcn does not assume possession of commercial template source.

## Grill-with-UI review agenda

Use this brief and the combined queue plan as inputs. Walk through the laboratory and four-court examples. Settle Operations navigation and task density, Administration information architecture, workspace-switch placement, workflow canvas/mobile editing, onboarding stages, and list/detail/form consistency. Capture decisions separately from unverified template interactions and implementation assumptions.

## Definition of ready

Agree on the shell and workspace navigation, approve representative auth/onboarding/list/detail/Operations screens, document supported mobile behavior, settle shadcn configuration, and confirm the route/API migration map. Then implement slices alongside the queue foundation; visuals alone do not activate workflow or resource capabilities.

## Foundation implementation documents

The [queue workflow and resource foundation specification](queue-workflow-foundation-spec.md) defines the proposed server transitions, data invariants, booking/channel compatibility and acceptance gates. The [vendor dashboard migration inventory](vendor-dashboard-migration-inventory.md) maps current routes/components to the proposed workspaces and identifies adjacent resource-configuration work for reuse. These are source-backed planning artifacts, not runtime implementation evidence.

The [vendor dashboard and AI coordination record](vendor-dashboard-ai-coordination.md) refreshes implementation dependencies against main on 6 October 2026 and sets shared-file boundaries and the first shell slice.
