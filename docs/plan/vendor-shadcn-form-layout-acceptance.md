# Vendor shadcn form layout acceptance

2026-10-17, local Opera preview only. No publication, PR, deployment or policy/fixture write.

## Implementation

Adopts the official [complex forms and array fields composition](https://ui.shadcn.com/docs/forms/react-hook-form#complex-forms) with existing project shadcn FieldSet, FieldLegend, FieldGroup, FieldLabel, FieldDescription and FieldError components. Existing controlled state remains in place; no React Hook Form migration or new dependency. Stable service/resource/extra keys and V4 leaf DTOs remain unchanged; V5 remains revoked.

New service request groups Customer, Services, nested Resources/Extras and Review request. Review counts root services separately from resource/extra rows. Duration uses InputGroupInput with native count constraints, a configured base-minute addon and explicit count × base total. Fractional/off-step values remain entered; blur reveals an associated inline error, typing clears it, and stale policy still requires explicit review. Fixed/hidden behavior and captured revisions remain intact.

Queue policy retains General, Duration, Resources and Extras tabs with keepMounted panels. Fields use semantic groups and inline positive-whole-number/label errors after attempted validation. Hidden invalid sections still select and focus their tab. Invalid fractional base/default values do not display a computed policy total. Explicit CSS hides mounted inactive panels even if another display utility is present.

## Actual Opera checks

- Named single root and automatic pooled root; multiple roots correctly show Multiple services, with resources and extras nested under their service.
- Current Court aliases available; resource quantity distinct from duration count; 2 × 60 = 120 and 3 × 30 = 90 totals observed. No clamping/repricing or save/publication.
- Fractional 1.5 retained, inline whole-count error, aria-invalid and associated help/error; corrected value restores total.
- Request and policy Keep editing preserve edits; explicit Discard removes only owned unsaved edits. No user forms were closed.
- Configured Basic Equipment revision 7 and unconfigured Court 2 revision 0 opened; invalid hidden Duration submitted from Extras selects/focuses Duration with inline errors. No successful policy write.
- Keyboard ArrowRight selects Duration from General. DOM confirms all inactive mounted panels display none.
- Desktop dark/light, 375 × 700 light policy, 375 × 500 dark policy and dark/light request: no page horizontal overflow at width 375; focused inputs remain above reachable footer controls. Temporary viewport overrides cleared; original dark theme restored.
- Automated full suite 298 tests passed, including native InputGroup constraints/help and semantic nested fieldsets/unchanged IDs. Typecheck, selected lint, build and diff checks pass; frontend build retains the existing large-chunk advisory. A broader root build also passed frontend, developer portal and main Platform builds, then failed in the separate platform-dashboard-shadcn workspace because @tanstack/react-table, recharts and lucide-react are missing, with downstream TypeScript errors. That workspace was not changed for this slice.

## Preview and artifacts

Opera request preview: `http://127.0.0.1:5187/dashboard/queue?workspace=operations&business=vd-sports-club` (owned unsaved sample, no ticket).
Policy preview: `http://127.0.0.1:5187/dashboard/services?workspace=administration&business=vd-sports-club`, Queue policy editor.

Artifacts under `/Users/carloabella/.codex/visualizations/2026/10/17/vendor-multiservice/`: `shadcn-request-invalid-dark.png`, `shadcn-request-short-dark.png`, `shadcn-request-customer-light.png`, `shadcn-request-short-light.png`, `shadcn-request-configured-dark.png`, `shadcn-policy-general-dark.png`, `shadcn-policy-duration-light.png`, `shadcn-policy-375-light.png`, `shadcn-policy-invalid-short-dark.png`, `shadcn-policy-unconfigured-375-light.png`.

## Limits

Visual review approval remains required. Physical mobile keyboard and assistive-technology acceptance are not claimed. This layout-only check does not replace earlier command/replay/lifecycle evidence or authorize runtime/AI activation, merge, PR publication or deployment.
