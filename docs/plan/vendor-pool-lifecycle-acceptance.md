# Vendor pool and named-resource acceptance

Local preview evidence, 2026-10-17. Unpublished aggregate work; not deployment or production acceptance.

## Observed in Opera

- Disposable unused pool `4` was deleted. A committed response was deliberately lost; the locked confirmation retried the same operation key `4ad09285-ddba-4710-ac73-8c210e803519` successfully without a second deletion.
- Disposable referenced pool `5` received one named resource. Authoritative dependency metadata disabled Delete and explained recorded commands and named-resource history. Archive succeeded.
- Archived pool `5` remains in the Archived collection. Its registry remains readable; Add, Edit and member Archive are disabled. No user pool was archived or deleted.
- Existing Courts were edited individually to `Court1 - Borak`, `Court2 - Endurance`, `Court3 - Blitz`, `Court4 - Inday`. The manager still shows four active members of capacity four; Add is disabled. Queue independently verified the same four baseline UUIDs at revision 2, prior names retained at revision 1, unchanged original 22 plan hashes and preexisting command receipts, zero allocations/holds, and original pools 1–3 unarchived.
- Archive controls now remain visible and disabled when the server projects `archiveAllowed: false`, with the nested `deletion.archiveBlock.message` displayed. The queue owner restarted the local API with this conservative guard. A blocked future-stage archive scenario remains a separate acceptance gap.

## Remaining evidence

- Opera own VD015 / ticket 23 / pool 6: Archive succeeded while Called. Start returned the archived-pool reason and retained protection. Explicit reasoned Cancel protection returned Waiting, cancelled reservation and zero reserved/in-use units. Queue owns independent receipt/replay verification and normal completion through replacement pool D.
- Independent alias/history verification passed. Pool A has one delete tombstone; Pool B one archive receipt with registry intact.
- Final responsive capture and aggregate approval. Latest full 294 tests, typecheck, selected lint, build and diff checks pass. No PR, merge, deployment or runtime activation authorized by this milestone.

## Review artifacts

Saved under `/Users/carloabella/.codex/visualizations/2026/10/17/vendor-multiservice/`:

- `pool-delete-response-lost.png`
- `pool-archived-member-readonly.png`
- `court-aliases-resource-manager.png`
- `pool-archived-start-blocked.png`
- `pool-protection-cancelled-waiting.png`

## Final recovery handoff

Queue-owned normal HTTP recovery completed VD015/ticket 23 through replacement pool 7, then archived owned pools 6/7 and deactivated owned service 9. Independent verification reports 23 tickets, zero allocations/holds, unchanged original 22 plans and old receipts, preserved four Court UUIDs/history and original pool capacities/flags. Exact cancellation replay with key `b6265da7-525d-4ef8-a233-2bb997b70e99` returned the original Waiting response while a fresh authoritative read remained Served; one cancellation receipt/event remained.

Opera full reload independently displayed Served, stage completed, allocation completed, zero members held and one explicitly released. Screenshot: `pool-recovery-served.png`. The Refresh requests button refreshed the active list but left the separately selected historical detail cached until full reload; This refresh-consistency defect was subsequently fixed: manual refresh reuses scoped list/detail invalidation and selected detail reads consume query cancellation. Actual Opera Refresh requests issued a fresh selected-request GET 200 and showed Served/completed/zero held without reload. Two focused regression checks and typecheck passed. Screenshot: `pool-recovery-refresh-served.png`.

Preview left at Locations → Resources → Manage Courts, four aliases and capacity four visible. Responsive/light-theme acceptance for this new member slice and blocked-future-stage archive browser acceptance remain open; no further scope expansion or publication was performed.
