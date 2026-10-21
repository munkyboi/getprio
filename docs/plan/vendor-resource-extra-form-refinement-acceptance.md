# Resource and extra request-form refinement — local acceptance

2026-10-17, Asia/Manila. Carlo's resource-fieldset and subsequent extra-fieldset screenshot requests, batched as one local milestone. No PR, commit, publication or deployment.

## Implementation and preserved behavior

`frontend/src/vendor/QueueSelectionFieldsV4.tsx`:

- Resource removal moved from the bottom full-width button to an icon-only Trash action near the native legend/top-right boundary. Reused local SelectionRemove composition also serves each extra. Shared Button/Tooltip, unique accessible name with parent/row context, associated tooltip, 44px target, and keyboard focus scrolling keep the action visible inside a short modal. The bottom resource/extra remove actions are gone.
- Add extra has a Plus icon and concise visible label, retaining unique screen-reader parent context. Existing Services Add/Remove headers remain intact.
- Named-member resource quantity is no longer shown; the existing canonical stored quantity1 and server validation/transport are preserved. Automatic pooled resource quantity remains visible/editable.
- Each V4 leaf extra now uses the shared outlined FieldSet/FieldLegend with its own top-right icon action, padding and concise Choose extra/Quantity/Duration labels plus hidden unique context. Configurable extra quantity remains editable even with default1; a confirmed fixed canonical min=max quantity can be hidden. Invalid/noncanonical fixed quantities remain available for review/correction. Required-extra removal retains its existing disabled gate.
- Extra copy is now plain language: Starts with this resource and uses its own service settings. No V5/extra-owned-resource selection is introduced.
- Resource removal focuses Add resource for the parent service. Extra removal focuses Add extra for the parent resource. UUID hierarchy, selection adapters, dirty guards, policy revisions, durations, nested extra lineage and backend authority remain unchanged.

`frontend/src/vendor/QueueDurationCount.tsx`: valid totals emphasize correctly singular/plural hours/minutes (e.g.3 hours) with concise3×60min supporting text. Invalid, fractional, stale or out-of-bound counts never display a valid current total. Stale history shows captured base information rather than multiplying an edited invalid count. Fixed read-only/hidden policy behavior remains. Labels accept ReactNode for concise visible wording with hidden context. Duration remains time, independently of resource quantity, capacity and price.

`frontend/src/vendor/styles.css`: scoped header-action placement, focus-safe 44px controls and duration emphasis; outlined resource/extra groups use shared padding/border, avoiding old plain nested-group reset overrides.

## Actual Opera verification, no form writes

Only owned tab1555995608 and saved OWN QA Stepper20261017 were used. Named quantity absent; automatic pooled Trainer quantity visible/default1 at375×500. Actual adjustable count3 displayed3hours/3×60min;1.5 showed Total duration requires review and no computed total. Plus Add extra, native legend grouping, resource/extra tooltip associations, keyboard focus, resource removal→parent Add resource, extra removal→parent Add extra all verified.

Created one/two extras only in unsaved QA state. Basic Equipment and Trainer controls retained proper parent scope. After removing first extra, the remaining Trainer control retained the same DOM control ID and value as its row number changed; parent resource control ID remained stable. At375×500, both extra groups measured293px inside327px resource groups; page/scroll widths375px with16px group padding. Resource and extra trash targets were44×44px. Tooltips wrapped within343px/viewport375. Current light/dark desktop and short-mobile screenshots were inspected.

The local session expired during an intermediate unsaved sample. Normal password/TOTP fixture login restored it without bypass or authorization changes. Resumed from the unchanged saved own draft. All later unsaved QA changes were explicitly discarded; original saved single-resource/count1 draft reopened unchanged. Temporary viewport override cleared and original dark theme restored. Other user form tabs were untouched; no successful form/business data writes.

## Validation and limits

All308 frontend tests passed, including named canonical quantity versus visible pooled quantity, configurable extra default1 versus fixed quantity, required-extra remove gate/transport identity, fixed visible read-only/hidden duration behavior, valid hour/minute units, and invalid-total suppression. Frontend build passed in11.62seconds with existing advisory. Final typecheck, selected ESLint and git diff --check passed.

No current local configured service has a fixed duration policy. Fixed-duration behavior was verified by component render tests rather than writing a new policy; authenticated Opera fixed-policy fixture acceptance remains separate. Physical assistive-technology/mobile-keyboard acceptance remains separate.

Screenshots in `/Users/carloabella/.codex/visualizations/2026/10/17/vendor-multiservice/`:

- `resource-header-tooltip-desktop.png`
- `resource-header-tooltip-375-dark.png`
- `resource-pooled-quantity-375-dark.png`
- `resource-duration-emphasis-light-desktop.png`
- `resource-duration-emphasis-375-light.png`
- `extra-fieldset-desktop.png`
- `extra-fieldset-desktop-light.png`
- `extra-fieldset-tooltip-375-dark.png`
- `extra-fieldset-tooltip-375-light.png`
- `extra-fieldset-quantity-375-dark.png`

Owned desktop Services/resource preview remains open. Aggregate approval and paused-schedule boundaries remain.
