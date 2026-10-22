# Shared semantic inline alerts — local acceptance

2026-10-17, Asia/Manila. Carlo explicitly authorized mild color surfaces for inline alerts. This does not change the non-critical badge text/border-only rule.

## Durable rule and source

Authority: `docs/design/vendor-ui-rules.md`, **Inline alert semantic colors**. Shared source: `frontend/src/vendor/components/ui/alert.tsx`; semantic theme tokens: `frontend/src/vendor/styles.css`.

Shared variants: info, success, warning, error. Destructive remains the compatible error alias and keeps its existing destructive semantic foreground class; default remains neutral. Text/icon/description share semantic foregrounds; surfaces mix 7% semantic color into the theme background, and boundaries mix 35% into the theme border. Light/dark foreground values live centrally in theme tokens. Call sites use semantic utilities with no raw one-off colors or manual dark overrides.

Icons plus clear text communicate meaning. Current service classification composes Tabler InfoCircle and AlertDescription without a redundant title; both V4 and legacy fallback now select variant info. Existing single/multiple root counting and nested scoping remain unchanged. No persistent fake demo alerts were added.

New info/success/warning variants default to polite status, error/destructive to alert. Existing neutral/destructive behavior remains compatible and explicit caller role overrides continue to win (including the auto-close region). Alert meaning does not automatically invent success, urgency, focus movement or actions. Shared semantic variants are reusable, while call sites supply the appropriate icon/message.

## Actual Opera evidence

Owned QA tab1555995608, local VD Sports Club / Demo Courts. Saved OWN QA Stepper 20261017 opened read-only: Single service info verified in dark and light desktop with runtime computed semantic foreground/surface/border. An unsaved second Trainer root changed the same line to Multiple services. At375×500 in both themes, text wrapped within a327px alert/right351px, page/scroll375px, no overflow. Icon aria-hidden and role=status were directly verified; alert adds no keyboard stop. Existing surrounding Add/Remove buttons and their focus styling remain unchanged.

Unsaved second-root changes were explicitly discarded after each theme check. Saved own single-resource draft reopened unchanged, temporary viewport override cleared and original dark theme restored. No successful business data writes, user form changes, PR, commit, publication or deployment.

## Component and contrast checks

`frontend/tests/vendor-alert-variants.test.cjs` safely renders all four variants with matching icons/messages outside product data, verifies status/alert/default/destructive and explicit role compatibility, and checks all four light/dark semantic text/icon foregrounds against their 7% surfaces at WCAG normal-text contrast >=4.5:1. No temporary product route or demonstration data was needed. Physical screen-reader announcement acceptance remains separate from DOM semantics and static render checks.

Focused13 variant/duration/nested-selection checks passed. All305 frontend tests passed, including existing auto-close compatibility. Frontend build passed in12.46 seconds with the existing large-chunk advisory. Typecheck, selected ESLint and diff check passed.

Screenshots under `/Users/carloabella/.codex/visualizations/2026/10/17/vendor-multiservice/`:

- `semantic-info-single-dark-desktop.png`
- `semantic-info-single-light-desktop.png`
- `semantic-info-multiple-dark-375.png`
- `semantic-info-multiple-light-375.png`

Actual owned desktop Services preview remains available. Aggregate approval and paused-schedule boundaries remain unchanged.
