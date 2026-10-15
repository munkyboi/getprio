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

## Customer and Mobile acceptance setup

Customer read contract `75673a98` was integrated with preservation checks. Actual credential-scoped public responses returned waiting, called, in_service, and terminal projections with `resourceWait: null`. This alone did not establish populated customer-owned Mobile reads: all original 23 tickets were unowned.

With explicit authorization, a NEW customer account 3 was registered and logged in through normal customer authentication. Both original accounts and all original 23 tickets compared unchanged. Public customer join correctly rejected the fee-gated queue with HTTP 409; no fee/provider settings were changed. Therefore NEW customer-owned acceptance tickets were issued through the explicitly authorized existing domain fixture path, assigning owner 3 at creation with normal vendor permission/transaction gates. This setup does not accept customer join or payment behavior.

| New disposable ticket | Fixture state |
| --- | --- |
| 24 | terminal/completed |
| 25 | in_service; holds new allocation 21 on the fourth court |
| 26 | called; untracked equipment service |
| 27 | waiting |

Normal customer authentication verified populated Mobile active/history lists and all four owned detail responses, plus account overview/history lifecycle projections. Private read evidence: `/tmp/getprio-462-mobile-read-evidence.json`. Credentials remain only in a mode-0600 local handoff file and are not recorded here.

Explicit local launcher ingress `4e68e794` retains the default loopback listener and adds a wired link-local listener only when both host/peer flags are supplied. Current host is `169.254.97.192:5007`, permitting only Zero32 peer `169.254.233.243`. Normal application authentication, CSRF/CORS, rate limits, provider-empty configuration, and outbound guard remain active. Database port 55494 stays loopback-only; no Wi-Fi listener or public tunnel was added. A Mac request from the wrong USB peer returned 403. Two focused ingress tests passed.

Mobile owns the actual Zero32 authenticated endpoint/rendering check. Queue-side API checks and build/install/launch do not establish physical visual or gesture acceptance. Preserve these new fixtures until Mobile finishes; original allocations 13/14/17 remain unchanged.
