# Shared outlined form groups — local acceptance

2026-10-17, Asia/Manila. Carlo approved the general screenshot pattern: a meaningful legend interrupting a subtle rounded top border, padded related fields, vertical spacing and help text.

## Durable authority and shared implementation

The authoritative rule is **Shared form grouping: outlined fieldsets** under section 6 of `docs/design/vendor-ui-rules.md`, already the rework design brief's referenced UI authority. This applies going forward to newly created or deliberately migrated vendor forms. It does not force single-field forms, repeated nested borders or unrelated form rewrites. Tabs/stepper stages remain context. Field labels, descriptions/errors, responsive layout, neutral theme tokens and keyboard semantics remain mandatory. No memory folder changes.

Reusable source: `frontend/src/vendor/components/ui/field.tsx`. `FieldSet` now accepts `variant="plain" | "outlined"` (default plain for compatibility). The outlined variant centrally owns semantic border/radius, 16px inset, shrinkability, and 8px legend-side padding. Existing `FieldLegend` keeps native legend semantics and inherits the variant's fit/wrapping behavior. This is one shared variant, not duplicated page CSS. Earlier request/policy plain-reset rules now explicitly exclude outlined groups.

Deliberate current adoption:

- `NamedQueuePlanDialog.tsx`: Customer and Review groups.
- `QueueSelectionFieldsV4.tsx`: resource-detail groups; service/header groups stay plain; subsequent Carlo-approved refinement gives each meaningful extra its own outlined group (see resource/extra acceptance). Plus/Add and Trash/Remove header placement and unique labels remain unchanged.
- `QueueServicePolicyEditor.tsx`: Accessible labels, Duration, Resource assignment and Extra services; nested extra policy rows remain plain.

No field, helper, validation, command, state, contract, catalog or permission behavior changed.

## Direct Opera verification

Owned QA tab 1555995608 only; existing user form tabs untouched. VD Sports Club / Demo Courts, saved OWN `QA Stepper 20261017` opened read-only. No input edits or successful data writes.

Desktop Customer group had 1px semantic neutral border, 16px inset and 8px legend padding, native accessible group name Customer. Tab from Customer name moved to the next associated contact input inside that group. At 375px, resource group width was 327px and page/scroll widths both 375px; legend, fields and help remained within the border. Services header actions remained correctly positioned.

Opened Pickleball Court Rental queue policy revision 4 without edits. General exposes accessible group Accessible labels. Keyboard ArrowRight selected Duration; its visible group retained native legend and controls. At 375px, group width327/page375/scroll375 with 16px inset and neutral border. Checked dark and light themes. Cancel closed the unchanged forms; no save was performed. Temporary viewport override cleared and original dark theme restored.

## Checks and artifacts

All 303 frontend tests, typecheck, selected ESLint and git diff --check passed. Frontend build passed in 12.37 seconds with the existing large-chunk advisory.

Screenshot directory: `/Users/carloabella/.codex/visualizations/2026/10/17/vendor-multiservice/`:

- `fieldset-customer-desktop.png`
- `fieldset-resource-375.png`
- `fieldset-policy-desktop.png`
- `fieldset-policy-375.png`
- `fieldset-policy-375-light.png`

Physical assistive-technology/keyboard acceptance remains separate. Local presentation evidence is not deployment or full-rework acceptance. No commit, PR publication, merge or deployment; schedules remain paused and aggregate preview approval remains required.
