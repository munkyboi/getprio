# Queue policy grid — local acceptance

2026-10-17. Local preview only, no PR publication or production action.

Queue policy administration now uses the approved EntityGrid/EntityCard pattern and shared ManagedCollection search, reset, status tabs and pagination. Active is the default. There is no redundant Status dropdown or service chooser. The card edit action opens the existing policy editor with a fresh scoped GET; configured policy summaries show resource assignment, duration, bounds and extra requirements. Unconfigured state is displayed separately.

## Authoritative status

The policy configuration contract has no independent active flag. Active/Inactive membership uses the associated service's existing catalog `isActive` value, exactly like Service catalog. Configuration presence never determines active status, and no policy activation flag or mutation was introduced. The current fixture read showed3active/5inactive services; current names and policy values were consumed without rewriting them. BasicEquipment at verification had revision7/base60/count range1–8/default2. This later live configuration is preserved; older acceptance baseline values remain historical checkpoints.

## Actual Opera verification

URL: `http://127.0.0.1:5187/dashboard/services?workspace=administration&business=vd-sports-club`, Services → Queue policy tab. Own grid-preview tab left open on Active with search cleared; original queue review tab retained.

- Active default:3cards (Pickleball Court Rental, BasicEquipment, Trainer), matching current service catalog status.
- Search Basic:1active match; Clear filters restores3 and keeps Active.
- Inactive:5cards; search Basic returns0; Clear filters restores5 and retains Inactive.
- Inactive Court2 card remains distinct from Not configured. Its edit action opened revision0/unconfigured editor with blank numeric policy fields.
- Configured BasicEquipment card opened its current revision7 policy and120-minute default. Only an own unsaved label was changed to exercise Cancel → Keep editing → Cancel → Discard; no policy save occurred.
- Keyboard Tab from empty search reached the first edit icon and exposed its tooltip. All3desktop edit targets measured44×44px.
- Desktop1440px: three-column shared grid, document width1425. Narrow375px: one-column grid, document width360, edit target44×44, filters/tabs/edit workflow usable and no horizontal document overflow. No Status dropdown.
- Theme left unchanged; temporary viewport override cleared. No ticket, draft, policy or status writes were performed for this grid verification.

Evidence directory: `/Users/carloabella/.codex/visualizations/2026/10/17/vendor-multiservice/`:

- queue-policy-grid-dark-1440.png
- queue-policy-grid-filtered-375.png
- queue-policy-grid-active-375.png
- queue-policy-grid-edit-375.png

## Validation

290 full frontend tests pass, including the regression that an active unconfigured policy remains on Active and inactive services do not leak into the default view. Typecheck, focused lint, build and diff checks pass. Build retains the existing large-chunk advisory. No new backend contract or configuration semantics were needed. Existing permission/revision/idempotency/unknown-result and frozen-history boundaries are preserved. Broader rework acceptance remains separate.
