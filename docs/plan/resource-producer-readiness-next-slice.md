# Resource producer readiness: next runtime slices

Status: implementation plan, following the deployed and live-verified private report in #388/#389. This plan does not authorize resource tracking, historical repair, capture, or customer inference activation.

References: [AI Wait-Time Prediction PRD](ai-wait-time-prediction-prd.md), [snapshot producer boundary](resource-operational-snapshot-producer.md), [inventory report](resource-inventory-reconciliation-report.md), [inference boundary](resource-shadow-inference.md).

## Evidence motivating the next slice

On 12 October 2026, #389's merge revision `00e4bbd82f813bc6f1e4ee38bd1d0a4a02450b9d` was verified on the API and Platform after successful deployment and authenticated smoke checks. A scoped Platform Admin report completed through CSRF-protected POST requests with no URL query selectors and no-store responses.

The private read returned a complete scan with exact counts, while retaining `not_ready`, null snapshot, and non-authoritative inventory. It exposed incomplete writer coverage, disabled tracking, unproven configuration watermark, missing plan revisions, unsupported compositions, and historical evidence gaps. These are readiness evidence, not permission to repair or activate. Scope identifiers, transactional examples, and branch-specific counts stay in the private verification record rather than this repository plan.

The current producer always returns `not_ready`. The report preserves priority, queue-day, segment, and plan facts, but expressly does not attest global dispatch order or forecast-horizon completeness. Plan fingerprints do not establish monotonic revisions.

## First slice: authoritative source eligibility, ordering, and provenance

Implement a private, read-only source assessment for the runtime owner. Its purpose is to identify which operational facts are established and which prevent snapshot assembly. It must not produce an accepted ready snapshot, invoke projection, or change queue behavior.

### Dispatch eligibility and order

- Trace the actual dispatch path through `backend/src/services/queueService.js` and `backend/src/repositories/tickets.js`. Reuse its queue-day/location rules and booking earliest-call gate. The displayed waiting list alone is insufficient: it can show scheduled tickets which call-next excludes.
- Preserve the existing priority bands, carry-over priority/count, and creation-order rules. Distinguish pending carry-over from work admitted to the active queue day. Preserve original/current queue-day and segment lineage.
- Assess called, waiting, recoverable skipped, timing-open, and held-allocation work separately. Calling and arrival do not establish occupancy or actual service start.
- Include held work across dates even when it is not dispatchable in the current queue. Do not invent one global order by sorting the report's cross-date rows.
- If a total order cannot be proved, expose the gap. Equal sort values, ambiguous segment lineage, or unaccepted cross-date transitions must not receive a fabricated authoritative order key. Any shared deterministic tie-breaker requires dispatch and producer agreement plus regression proof.

### Source and plan provenance

- Bind reads to trusted tenant/location, source binding, database observation, ledger revision, relevant queue-day/segment revisions, and the requested window. Client input cannot assert provenance or completeness.
- Preserve captured plan source, booking/session linkage, execution mode, frozen items, pool demand, and duration. A current catalog mapping cannot silently replace a missing or stale captured plan.
- Identify the exact writer-owned fields needed for monotonic configuration and plan watermarks. Until those fields and writer guarantees exist, retain unknown provenance; a timestamp, content hash, pool revision, or inferred aggregate is not a substitute.
- Keep the existing v1 restriction explicit: one supported service/pool per work unit, with accepted unit and 5–480 minute duration bounds. Bundles, multi-pool demand, unsupported execution modes, unknown plans, and stale mappings receive explicit unsupported/unavailable evidence.
- Unsupported or unknown work must remain accounted for. Dropping it cannot make the remaining inventory complete.

### Assessment boundary

- Use bounded authorized READ ONLY reads with a coherent observation and a fresh authorization checkpoint. Preserve unknown/null and limit-exceeded states; do not turn failed reads into empty inventory.
- Reuse existing source queries, sanitization, and classified report evidence where appropriate. Avoid a second competing dispatch policy or duplicated reconciliation implementation.
- Keep detailed assessment evidence separate from the strict accepted v1 forecast envelope. Preserve valid existing `not_ready` reasons and null snapshot; additional diagnostics must not silently change that consumer contract.
- Do not add public/vendor forecast endpoints, polling, exports, repair commands, tracking switches, coverage overrides, or capture hooks in this slice. The existing Platform report continues to use protected POST bodies.

### Acceptance evidence

1. Future scheduled bookings cannot become dispatchable early; priority/carry-over cases agree with actual call-next eligibility.
2. Pending carry-over, active-day work, closed/prior-day work, called tickets, and unreleased allocations retain their distinct meanings across dates.
3. Equal ordering values and ambiguous lineage remain unproven unless shared dispatch rules establish a total order.
4. Missing, stale, bundled, multi-pool, and unsupported plans remain visible and cannot establish inventory completeness.
5. Configuration/plan provenance remains unknown when real writer-owned watermarks are absent; fingerprints are never promoted to revisions.
6. Concurrent source changes, authorization revocation, read timeouts, missing storage, and row/byte limits fail closed without writes or refreshed observation timestamps.
7. Disposable PostgreSQL scenarios compare the assessment with actual dispatch behavior. Tests prove the operational boundaries rather than mirroring an invented sort.
8. Existing report, snapshot validator, inference-disabled behavior, and normal queue operations remain compatible. Main deployment and a private live diagnostic read are separate acceptance gates.

Deliverables: source-assessment contract and implementation, dispatch-rule/source provenance inventory, focused PostgreSQL/pure tests, and updated producer documentation. Runtime owner implements; AI owner independently reviews the consumer assumptions. One focused PR, followed by review, CI/CodeQL/Sonar, manual merge, deployment, and private verification.

## Subsequent gates

| Slice | Work | Required evidence before proceeding |
| --- | --- | --- |
| B1 — source assessment | Eligibility, actual dispatch order, and explicit provenance gaps described above. | Reviewed dispatch equivalence and honest unsupported/unknown handling; producer remains not ready. |
| B2 — writer and reconciliation proof | Complete admission/session/configuration/queue-day writer inventory; monotonic revision guarantees; historical reconciliation and activation policy. | No unaccounted writer path, revision/race proof, and reviewed treatment of legacy gaps. Keep disabled database constraints until a separately reviewed activation change. |
| B3 — complete snapshot assembly | Coherent cross-date work, actual held allocations, protected reservations, plans, intake state, and full requested horizon. | Authoritative ordering, watermarks, coverage, reconciliation, and completeness established. Never truncate and claim completeness or double-count conversions. Expected end never releases occupancy. |
| B4 — trusted byte adapter | Serialize the accepted bounded envelope and connect the internal provider to the existing disabled inference boundary. | Authorization, source binding, freshness, revisions, scope isolation, timeout/cancellation, concurrency, and late-result rejection verified. No customer delivery or capture approval follows automatically. |

Private capture, paired actual-start outcomes, evaluation, and customer pilots remain later PRD stages with their own privacy and rollout gates. This plan preserves the live public baseline and does not connect DigitalOcean inference infrastructure.

## Immediate next action

Implement B1's source assessment and focused dispatch/provenance tests. Do not begin complete ready snapshot assembly by translating the inventory report into a forecast envelope.
