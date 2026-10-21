# Resource pool information and group layout acceptance

2026-10-17, local Opera preview. Presentation only; no data writes, API/business changes, PR, push, deployment or schedule activation.

The long authoritative referenced-deletion explanation is removed from the pool card body. Referenced pools instead show a 44 × 44 information trigger immediately beside and aligned with Configured (or the existing Archived badge). Its unique accessible label explains which pool cannot be deleted. The existing shadcn Tooltip is controlled for click/tap access as well as hover/focus, with an explicit tooltip ID/role and aria-describedby association. Full server text remains unabridged. Popup width/height are bounded to the viewport and long text wraps. Unused/delete-allowed pools do not gain an irrelevant blocked-deletion icon.

Existing archiveBlock reasons and reference details remain on cards. Delete/archive confirmations and errors retain authoritative explanations, dependencies and guards. A single shared semantic Separator and explicit vertical space separate Resource pools from Service requirements; no per-card separators or behavior changes were added. The requested horizontal divider has explicit one-pixel layout dimensions because the existing shared orientation utility did not give it a visible height; unrelated separators were not changed.

## Opera checks

- Desktop pointer hover opened the full reason. Keyboard Tab focused the uniquely named 44px button, opened the same text and exposed its aria-describedby target/tooltip role; Escape dismissed it.
- Click access passed. At 375 × 700, a touch-emulated tap also opened the complete reason; tooltip bounds were left 27 / right 370 / width 343 within viewport 375, and page scroll width remained 375.
- Configured badge and icon share a vertically centered row. Closed tooltip leaves the long paragraph absent from the card body.
- Divider is one pixel high, full available width and has 16px margins in addition to the parent group gaps. At 375px its width is 343px, with no horizontal overflow.
- Opened Archive Courts confirmation for read-only inspection, verified the original full server reason/dependency list, then Cancelled. No archive command was submitted.
- Touch and viewport overrides were cleared. One owned Opera tab remains on Locations → Resources, actual pool grid, with user tabs/forms preserved.

All 302 frontend tests passed, including 14 focused pool/card regression checks. Typecheck, selected lint, and git diff --check passed. The frontend production build passed in 16.20 seconds with the existing large-chunk advisory. Physical touch device and screen-reader announcement acceptance remain separate from emulated touch/DOM association checks.

Artifacts under `/Users/carloabella/.codex/visualizations/2026/10/17/vendor-multiservice/`: `pool-info-tooltip-desktop.png`, `pool-grid-separator-desktop.png`, `pool-info-tooltip-375.png`, `pool-group-separator-375.png`.

Preview: `http://127.0.0.1:5187/dashboard/locations?workspace=administration&business=vd-sports-club`.
