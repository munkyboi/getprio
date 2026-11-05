# Vendor Linear lifecycle — issue #462

Status: preparation; API/Queue authoritative DTO and command handoff pending. No new lifecycle UI mutations are enabled. This is the single-service slice of #461, not delivery of draft management, multiple units, multiple stations or notifications.

## Contract handoff required

Confirm service/duration eligibility, publish request and response, opaque plan revision, command idempotency, reservation identity/expiry, structured capacity and reservation errors, and refresh/unknown-outcome reconciliation. Existing walk-in POST is not assumed to implement the new publish contract. Existing local resource read model does not prove Call reservation protection.

## Browser acceptance matrix

| Scenario | Required observable result | Evidence |
| --- | --- | --- |
| Select one service and allowed duration | Review reflects authoritative requirements; no implicit defaults | Pending |
| Publish | Exactly one ticket enters Waiting; usage charged once by server | Pending |
| Publish timeout/retry | Reconcile outcome; no duplicate ticket or usage | Pending |
| Capacity unavailable at Call | Ticket stays Waiting; clear reason; no partial reservation | Pending |
| Call with capacity | Exact ticket Called with protected reservation and expiry | Pending |
| Start | Exact valid reservation revalidated; one active allocation | Pending |
| Reservation stale/expired or capacity conflict | Actionable inline recovery; no fake successful start | Pending |
| Complete / Interrupt | Confirmation identifies exact ticket; authoritative terminal outcome and atomic release | Pending |
| Repeated command | No duplicate session, release or notification | Pending |
| Role/branch mismatch or concurrent command | Fail closed, preserve relevant draft, authoritative refresh | Pending |
| Existing allocations/history | Preserved; no reset or unrelated service changes | Pending |
| Layout/accessibility | Opera light/dark 375/768/1440 and short height; focus, keyboard, errors, modal toasts | Pending |

Use VD Sports Club only in the guarded local runtime. Coordinate acceptance writes with Queue; no reset, frozen-plan mutation or production activity. Keep both main and per-ticket actions consistent. Do not infer capacity admission from observed free units. Carlo must approve the corrected local preview before any PR is raised.

## Contract clarification and current preview

API `0ab5aaf6` keeps the existing ticket admission and service commands. API `b2ec0f39` extends the authorized service-plan GET with lifecycle and optional reservation data, and adds `RESOURCE_CAPACITY_UNAVAILABLE`. Service duration remains catalog-owned; no editable duration, client plan revision, custom publish endpoint or reservation-expiry countdown was invented.

The guarded local preview now shows a selected-service review and Publish ticket action, while preserving optional generic issuance. Local pool cards consume the new service-plan read contract; missing fields on older servers show unavailable status rather than implied protection. Reservation/plan/capacity conflicts have inline recovery with a Refresh queue action. Existing ticket command targeting and complete/interrupt confirmations remain.

Opera VD Sports Club: selecting One court session displays configured60-minute duration, review and Publish ticket. Form was cancelled without publishing. Screenshot: `linear-462-service-review.png` in the 2026-10-15 vendor-reference-correction evidence directory. The current5007 server still returned the older response without lifecycle fields; end-to-end reservation acceptance is pending Queue integration confirmation and command-level regression readiness. Existing Courts3/4 allocations and ticket history were preserved. Full frontend suite236 passes; updated typecheck passes. This is partial implementation/evidence, not completion or preview approval.

### Reservation handoff follow-up

API `0278af59` also exposes `ticket.serviceReservation` in Call results and supports booking-item bindings in the plan read response. Vendor refreshes the service-plan query after commands; it does not infer a protected reservation from Called status alone. Queue's active regression work identified a missing-reservation Start path that must be closed before guarded end-to-end command acceptance. Runtime integration and that verification remain external dependencies; no queue mutation or publication was performed while waiting.

## Guarded Opera acceptance progress (2026-10-15)

Canonical API `e9a8e18a7faccf0c3378c328c8fe1ecaf86e67cc`, dedicated Acceptance462 A/B counters. Queue backed up and verified migration preservation before enabling commands. Only new disposable tickets are priority-adjusted by Queue; original13/14/17 active allocations and18/19 called/waiting history remain untouched.

- **20 VD020**: actual Publish, Waiting+published, Call on A with protected1-unit reservation, Start, exact-ticket Complete confirmation, release back to3active. Queue independently verified served/completed, one allocation16 bound to reservation1 and released at service end, exactly reserve/allocate/release receipts.
- **21 VD021**: actual Publish/Waiting/Call/protected/Start, exact-ticket Record interruption, release back to3active. Queue verified unserved/interrupted, served_at null, allocation17 terminated/released, reservation2 converted, exactly3 receipts.
- **22 VD022**: capacity holder, Call/protected/Start on A, holding fourth unit. Do not end until the capacity denial is captured and verified.
- **23 VD023**: published Waiting, prioritized by Queue for B. First Call was blocked by global HTTP429 before domain handling; no capacity result is claimed. Queue verified Waiting with no reservation/allocation/call timestamp or command receipt.

Evidence: `linear-462-published-waiting.png`, `linear-462-called-protected.png`, `linear-462-in-service.png`, `linear-462-completed-released.png`, `linear-462-interrupt-confirm.png`, `linear-462-interrupted-released.png` in the 2026-10-15 vendor-reference-correction directory.

### Rate-limit defect and recovery

Global1000/900s limiter exhausted during multi-tab polling; it previously preceded CORS, obscuring429 in browser. Vendor paused the active preview at about:blank. Per-ticket polling reduced10s to30s, pool3s to10s; explicit no background/focus polling, scope/unmount abort,429 stops intervals. A shared queue-read cooldown honors Retry-After across ticket and pool reads without extra HTTP requests. Focused tests prove no further reads until the deadline. API owns `b9fc9b32` CORS/header-order fix without changing limits. Resume only after the original16:58:45 Manila deadline AND Queue confirms runtime readiness after loading the fix. No further limiter resets requested.

### Remaining acceptance gaps

Capacity denial/recovery, stale/missing reservation browser recovery, idempotency replay, final terminal history display and responsive/theme matrix remain pending. Ledger/API regression evidence is separate from actual Opera acceptance. Billing allowance consumption is unverified: fixture allowance authority is off and no allowance_operations row exists for20. Do not claim usage charged-once acceptance from one served fact or one resource release. No PR or preview approval yet.

## Final local resource lifecycle results

After the original retry deadline, Queue integrated API `b9fc9b322db796a7e6714b52e716ede15b27288e` and confirmed unchanged records and limiter policy. Opera normal password/MFA sign-in restored the session.

- Actual controlled Call23 B returned HTTP409 `RESOURCE_CAPACITY_UNAVAILABLE` (CDP response body captured); mapped inline guidance and Refresh queue rendered. Queue verified23 remained Waiting with zero reservation/allocation/command receipts.
- Completing22 released the fourth unit. Call23 then produced protected reservation4. Queue expired ONLY that new binding as the agreed negative fixture. Actual Start23 returned409 `TICKET_RESERVATION_STALE`, with actionable inline error and zero allocation verified independently.
- Normal Skip23, Missed recovery Restore SAME23, and Call23 B cancelled binding4 and created protected binding5. Start/Complete23 then produced one allocation19 and atomic release. No direct ticket/plan edits were used for recovery.
- Queue replayed completed23 twice through normal authenticated cookie/CSRF API;200/200 and all ticket/reservation/allocation/receipt/event/revision/allowance rows unchanged. Evidence owned by Queue: `/tmp/getprio-462-idempotency-evidence.json`.
- Original13/14/17 remain the only active allocations; original18/19 and all original business rows preserved.

Responsive evidence `linear-462-{light,dark}-{375,768,1440}.png` verified actual width/theme and no horizontal document overflow. `linear-462-confirm-dark-short.png` verifies375x480, visible confirmation action and keyboard focus inside dialog. Earlier `linear-462-capacity-light-375.png` was captured before confirming the theme changed and is NOT light-theme evidence; use the verified six-layout matrix instead. Viewport and dark theme restored.

Recovery now clears stale command guidance after a successful command; stale-reservation guidance describes the verified walk-in skip/restore/recall path. Tests238 pass, TypeScript passes; broad image/source bounds and full aggregate dashboard acceptance remain tracked separately.

### Remaining gaps and Carlo review

The corrected preview is open at http://127.0.0.1:5187/dashboard/queue?workspace=operations in Opera, VD Sports Club / Demo Courts. Review resource status and responsive layout, open Add walk-in and select One court session to inspect catalog duration/Publish (Cancel without issuing), and inspect served20/22/23 in History. Avoid acting on original tickets13/14/17/18/19.

A terminal-history gap remains: actual search VD021 returns no records although Queue verified21 unserved/interrupted. Reported to API/Queue for correction; do not claim all terminal states accepted. Billing allowance charge-once is unverified (legacy/off authority), and Mobile acceptance is owned separately. No PR publication, merge, deployment or production activation is authorized by this local evidence. Carlo's corrected-preview approval remains required.

### Terminal History gap closed locally

Canonical API `daac7c645886de2a30b8704fcab1493da6f35030` includes the History filter fix. Actual Opera full reload (to replace the earlier cached History response), then search `VD021`, returns exactly one record:21 / VD021 / Linear462Interrupt / **unserved**, updated4:48:38PM. No separate service-outcome detail is exposed in this table; the visible terminal status is unserved. Evidence `linear-462-history-interruption-verified.png` supersedes the earlier missing-row screenshot. Queue independently confirmed restart preservation; no fixture command was used. Search was cleared and the Queue preview restored and left open. Remaining cross-slice gaps are allowance-accounting authority and separately owned Mobile acceptance, plus aggregate dashboard approval; no PR has been raised.

### Live review handoff at23:05 Manila

Carlo requested the preview be shown immediately. Queue restored canonicalAPI `b9204015de7742e768a51748efaddb8da5e7da4d`; restart-only pre/post comparison preserved all27 current business records. Existing Opera5314 was already signed in; native GetPrio window was raised and live resource data verified at the review URL. Evidence `linear-462-review-open-now.png`.

On reconnect/read at15:05:12UTC, normal effective-hours auto-close reconciliation ran. Original called13/14/17/18 and Mobile25/26 became queue-status unserved (`queue_closed_while_called`); waiting19/27 became pending carry-over. Active allocations13/14/17/25 remain unreleased, with started/end facts intact and unfinished lifecycle still in_service. Therefore the earlier unchanged-row proof applies to the restart before the live reconciliation, NOT to current ticket statuses after reads. No manual queue command, reopen, historical-outcome reversal or DB repair was made. Current preview correctly shows closed intake and four held overdue sessions. Review should inspect status/resource/confirmation presentation without executing actions; Add walk-in is disabled while closed. No PR approval is implied.
