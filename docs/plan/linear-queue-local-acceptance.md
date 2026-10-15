# Linear queue lifecycle local acceptance — 15 October 2026

Lifecycle runtime tested: `b9fc9b322db796a7e6714b52e716ede15b27288e`; final History verification runtime: `daac7c645886de2a30b8704fcab1493da6f35030`. API `127.0.0.1:5007`, VD Sports Club / Demo Courts. Local image storage remained enabled. No production action or PR was performed.

## Preservation and integration

The ticket-reservation migration was applied only to the marked disposable loopback fixture. A private SQL backup and business-row snapshot were saved before migration. All original 19 ticket records, 15 allocations, 27 command receipts, 16 service plans, booking records, and location fields compared unchanged after integration and acceptance. Original active tickets 13, 14, and 17 retained their allocations. Original called ticket 18 and waiting ticket 19 were untouched.

Two fixture-only acceptance counters were added. New acceptance tickets were prioritized ahead of original waiting ticket 19 solely for the controlled test. These fixture counters do not demonstrate subscription counter entitlement.

## Observed acceptance

Vendor owned normal Opera commands and screenshots. Queue independently read the database and prepared the explicitly coordinated negative fixture.

| Case | Evidence |
| --- | --- |
| Publish → Waiting → Call → Start → Complete | Ticket 20: protected reservation 1 converted into allocation 16, then released once; served/completed timestamps match release. |
| Interrupted service | Ticket 21: reservation 2 converted into allocation 17; interruption released it once with terminated outcome, ticket unserved/interrupted, no served timestamp. |
| Capacity denial | Ticket 22 held the fourth court. Call 23 on counter B returned actual HTTP 409 `RESOURCE_CAPACITY_UNAVAILABLE`, captured by Vendor. Ticket 23 stayed Waiting with null counter/call/start timestamps and no reservation, allocation, or command receipt. |
| Capacity recovery | Completing ticket 22 released allocation 18. Retrying Call 23 then created protected reservation 4. |
| Stale reservation | Only new ticket 23's protected reservation 4 interval was moved into the past. Start returned actual HTTP 409 `TICKET_RESERVATION_STALE`; no allocation or Start receipt was created. |
| Normal recovery | UI Skip → Restore → Recall retained ticket 23's identity, cancelled reservation 4, and created fresh protected reservation 5 with a distinct call key. |
| Recovered completion | Ticket 23 Start converted reservation 5 into allocation 19; Complete released it once, with matching release/end/served timestamps. |
| Completion idempotency | Two further Complete requests for ticket 23 through normal password/TOTP, cookie, and CSRF authentication returned 200. Every ticket, reservation, allocation, command receipt, queue event, scope revision, and allowance-operation row was unchanged. Private evidence: `/tmp/getprio-462-idempotency-evidence.json`. |
| Interrupted terminal History | The shared repository History filter initially excluded unserved and expired tickets. Fix `daac7c64` includes both; its repository suite passed 13/13. Authenticated History returned ticket 21 as unserved. Vendor then reloaded actual Opera History, searched VD021, and confirmed one unserved row at 16:48:38 Manila; screenshot `linear-462-history-interruption-verified.png`. All current business rows compared unchanged across this fix's restart. |

Final occupancy returned to the original three allocations for tickets 13, 14, and 17. Saved local payment QR remained readable (HTTP 200).

Vendor reported actual light/dark checks at widths 375, 768, and 1440, plus confirmation visibility and focus trapping at 375×480. Screenshots and UI interpretation belong to Vendor's acceptance evidence.

## Rate-limit finding and remedy

The initial capacity attempt coincided with global IP rate-limit exhaustion and was not counted as capacity acceptance. HTTP 429 occurred before CORS, producing an opaque browser error. Commit `b9fc9b32` places allowed-origin CORS before the limiter and exposes retry/rate headers, retaining the 1,000 requests per 900 seconds limit. Vendor reduced polling. The controlled retry occurred after the original natural retry boundary and the fix's local integration.

## Verification limits

- Scoped PostgreSQL suite: 209/209 passed; resource-ledger and vendor-route checks: 33/33 passed in an isolated temporary test database.
- This fixture recorded no allowance operation for acceptance tickets. Served facts and resource release are verified; billing allowance consumption is not accepted by this run.
- These results establish local preview behavior only. Preview approval, PR review, deployment, and production verification remain separate gates.
