# AI Wait-Time Prediction PRD

Status: implementation baseline and remaining delivery plan; not rollout approval.  
Tracking issue: [#378](https://github.com/munkyboi/getprio/issues/378).  
Reviewed baseline: main `eec930c6d7a6c14aa63bdd85ac1658f9dc10be64`, 12 October 2026 (Asia/Manila).  
Product direction: queue operations, ordinary bookings and AI integration. Model rollout remains on hold; existing sample capture may continue.

## Problem Statement

Customers need to know when they are likely to be called and when their service can actually start. A queue position multiplied by an average duration cannot represent parallel resources, protected bookings, mixed service durations or interrupted operations. Vendor staff need estimates that reflect the same authoritative state they use to operate the queue.

A printed ticket, a vendor-issued walk-in ticket and a ticket opened in GetPrio must all count as queue work. Scanning or claiming a ticket changes access to its status; it must not determine whether the underlying work exists in capacity accounting or evaluation. GetPrio currently has no representative live-vendor dataset for validating learned predictions. Manual tests and synthetic histories must remain identifiable and separate from production-performance evidence.

## Solution

Deliver a server-authoritative prediction layer in stages. Preserve ordinary queues, establish trustworthy resource state, forecast privately, record predictions together with explicit outcomes, and evaluate before any customer-facing pilot. Compare transparent deterministic and learned candidates; choose based on evidence rather than the AI label.

The product distinguishes **estimated time to call** from **estimated time to actual service start**. A booked start is an earliest-call constraint and a reservation interval, not proof that service started or that a resource is occupied. Customer delivery must use clear labels and an approved fallback for the same target.

### Goals

- Account for all issued tickets independently of app use or QR claiming.
- Support generic resources such as staff, rooms, equipment and courts without changing ordinary vendors' required workflow.
- Produce private, bounded, scope-authorized forecasts with explicit unavailability reasons.
- Measure accuracy and forecast availability against authentic outcomes without label leakage or cherry-picking.
- Enable a controlled customer pilot only after runtime integrity, evaluation, privacy and operational gates are met.
- Keep serving separable from the API so a dedicated service or Droplet can be adopted when measured load justifies it.

## User Stories

1. As a Customer, I want a clearly labelled wait estimate, so that I know whether it refers to being called or starting service.
2. As a Customer, I want estimates to update from current queue state, so that I can plan my arrival.
3. As a Customer with a booking, I want the booked start respected, so that arrival does not make my ticket callable too early.
4. As a Customer using GetPrio mobile or web, I want the same authoritative status, so that changing devices does not change my place.
5. As a customer holding only a printed ticket, I want my ticket included in resource demand, so that estimates for everyone remain truthful.
6. As a customer claiming a printed ticket, I want the existing work preserved, so that scanning does not create duplicate demand or samples.
7. As a Customer, I want unavailable estimates explained plainly, so that missing data does not look like a zero-minute wait.
8. As a Customer, I want interruptions reflected conservatively, so that a disrupted service does not create false certainty.
9. As a Vendor Staff member, I want calling and starting service to remain separate, so that an invitation does not occupy resources.
10. As a Vendor Staff member, I want explicit service start to allocate the required capacity, so that parallel work is possible when resources allow it.
11. As a Vendor Staff member, I want completion or termination to release capacity explicitly, so that expected finish time cannot free an occupied resource.
12. As a Vendor Staff member, I want walk-in service needs captured when known, so that resource forecasts can use the correct plan.
13. As a Vendor Staff member, I want missing or unsupported plans flagged, so that ordinary tickets are not silently assigned invented resources.
14. As a Vendor Admin, I want opt-in resource tracking, so that simple queues do not require resource setup.
15. As a Vendor Admin, I want reservations protected alongside waiting work, so that a walk-in forecast does not assume booked capacity is free.
16. As a Vendor Admin, I want correct branch-specific estimates, so that one location's data cannot affect another's queue.
17. As a Vendor Admin, I want service and resource changes to preserve admitted work, so that editing configuration does not rewrite history or occupancy.
18. As a Developer API integrator, I want every issued ticket counted even when unclaimed, so that printed-ticket workflows remain supported.
19. As a Developer API integrator, I want sandbox and future production evidence kept separate, so that tests do not justify a live rollout.
20. As a Platform Admin, I want forecast availability and fallback reasons measured, so that low coverage is visible alongside accuracy.
21. As a Platform Admin, I want manual and synthetic test histories identified, so that evaluation does not claim production performance.
22. As a Platform Admin, I want a reversible scope-level pilot, so that a failing candidate can be withdrawn promptly.
23. As an evaluator, I want the earliest eligible prediction attempt retained, so that later successful retries cannot inflate performance.
24. As an evaluator, I want pending and censored outcomes preserved, so that incomplete work is not treated as zero wait.
25. As an operator, I want bounded inference and scoped diagnostics, so that prediction cannot compromise queue availability or expose customer data.
26. As an operator, I want versioned artifacts and data lineage, so that results can be reproduced and rolled back.

## Implementation Decisions

### Persona and authorization mapping

The product roles remain Guest, Customer, Vendor Staff, Vendor Admin and Platform Admin. Technical personas in the stories are not additional roles or permission grants.

| Story persona / activity | Role or system boundary |
| --- | --- |
| Developer API integrator: issue/read tickets through a credential | An external client of the existing Developer API authorization model, not a sixth interactive GetPrio role. Preserve existing project/key permissions and ownership; no private AI artifacts, cross-vendor diagnostics or rollout controls are granted. Future production integration must define its credential-to-scope mapping before activation. |
| Vendor-managed integration setup and vendor diagnostics | Vendor Admin only within explicitly authorized tenant/location scope; Vendor Staff retain existing operational permissions and receive no dataset/export access by implication. |
| Evaluator: private exports, artifacts and evaluation evidence | Authorized Platform Admin capability, with explicit evidence-access permission and audited scope. Command-line access does not substitute for product authorization. |
| Operator: private diagnostics, serving artifacts and pilot/rollback controls | Authorized Platform Admin capabilities with separate diagnostic, artifact and rollout permissions; not implied for Vendor Admin or Vendor Staff. |
| Capture/prediction workers | Non-user system processes with narrowly scoped service authority and audit identity; no interactive role and no authority to mutate queue/resource outcomes. |

These are required authorization boundaries for future implementation, not claims that new permissions or production Developer API provisioning exist. Public forecast visibility follows existing Guest/Customer ticket-access rules; knowing a work reference alone must not grant access.

### Prediction targets and terminology

| Concept | Meaning and rule |
| --- | --- |
| Time to call | Observation-to-call duration. Existing baseline and queue-pace experiment target this. |
| Time to actual service start | Observation-to-explicit authoritative service-start duration. Resource shadow targets this. |
| Calling / arrival | Queue or presence transitions; neither allocates resources. |
| Service session | Explicit actual service interval. Start creates occupancy; completion or termination releases it. |
| Protected reservation | Reserved future capacity; conversion must not double-count reservation and allocation. |
| Expected end | Forecast input only. Passing this time never releases actual occupancy. |
| Shadow | Private prediction that does not replace customer estimates or mutate operations. |
| Unavailable | No accepted prediction for the requested target; never fabricated as zero wait. |

### Current implementation inventory

“Implemented” below means code exists in the reviewed main baseline. It does not prove activation, representative operations or accuracy. Historical slice documents remain authoritative for their specific interfaces; their old remaining-work lists may predate later merges.

| Capability | Implemented state | Remaining work |
| --- | --- | --- |
| Public baseline | `baseline-v1` remains the live predictor; vendor and Developer API sandbox capture/audits exist. | Continue data-quality review and verify deployed capture configuration independently of CLI settings. |
| Offline learned candidate | `queue-pace-median-v1`, scope-specific training, temporal holdout, baseline fallback, artifact validation and coverage reports. | Representative real operations, meaningful holdout support and an independently reviewed runtime delivery integration. |
| Dataset handling | Private export, manual-window curation, lineage hashes and non-overwriting outputs. | Operational provenance policy and handling of future test traffic; curation declarations alone do not verify retained traffic. |
| Synthetic development | Seeded sequential, parallel, competing and disrupted scenarios plus candidate comparisons. | Broader failure scenarios as needed; synthetic scores never establish vendor performance. |
| Resource forecast | Deterministic `resource-service-start-shadow-v1` with reservation-aware parallel-capacity projection and bounded validation. | Complete authoritative ready inventory and controlled shadow integration. This is not a trained AI model. |
| Inference boundary | Disabled-by-default scoped async wrapper with deadlines, byte limits, freshness checks and sanitized fallbacks. | Authorized live adapter, operational budgets and deployment ownership. No DigitalOcean endpoint or AI Agent is connected. |
| Readiness audit | Read-only private producer preflight; zero prediction samples written. | Ready producer, reconciliation and full writer coverage. |
| Resource evaluation | Strict offline paired service-start evaluation with fallback/support reporting. | Compatible operational capture/export, authentic service-start labels and representative observations. |
| Booking lifecycle | Location-first creation/protection, vendor changes, payment proof, expiry/no-show, cancellation and check-in writers merged. | Audit all remaining admission/protection paths before declaring coverage complete. |
| Service lifecycle | Explicit start and allocation/conversion commit together; completion/interruption and release commit together (#338). | Reconciliation and activation proof; merged integration alone does not prove live tracked execution. |
| Queue/configuration consistency | Subsequent calling, outcomes, walk-in/public issuance, intake, carry-over, reconciliation, resource/availability/catalog/branch writers merged. | End-to-end writer coverage inventory, historical repair policy, activation and complete snapshot inventory. |
| Operational snapshot | Scoped authorized read-only producer always returns `not_ready`. Separate internal [inventory/reconciliation report](resource-inventory-reconciliation-report.md) reads coherent cross-date source facts with bounded counts and classified evidence gaps. | Authoritative order, horizon completeness, configuration/plan provenance, activation reconciliation and ready producer remain pending. |
| Customer delivery | Customer service-progress UI exists; AI customer estimate replacement is absent. | Separate approved contract/UI, target labels, refresh policy, same-target fallback and reversible pilot. |

### Modules and ownership

| Module | Responsibility | Owner |
| --- | --- | --- |
| Operational state and snapshot | Lifecycle writers, lock/revision coherence, reconciliation, exact resource inventory and authorization. | “Assess multidimensional queue for” chat |
| Prediction engine | Baseline/candidate comparison and bounded deterministic resource projection. No operational mutation. | AI chat |
| Inference adapter | Trusted scope, provider deadlines, freshness, version compatibility and accepted-result boundary. | AI chat, coordinated with runtime owner |
| Observation capture/export | Record accepted forecasts and unavailable attempts, resolve explicit outcomes, create private pseudonymous datasets. | AI chat; runtime owner supplies authoritative work/session linkage |
| Evaluation and rollout reporting | Target-specific accuracy, support/fallbacks, data provenance, holdout and promotion evidence. | AI chat |
| Customer estimate delivery | Server contract, target-specific fallback, public refresh and consistent web/mobile semantics. | AI chat coordinates server contract; dashboard/mobile owners implement their surfaces |
| Vendor dashboard rework | shadcn direction, operational queue/resource controls and generic service UI. | “Assess multidimensional queue for” chat |

Ownership does not imply that the broader dashboard redesign has shipped. Dependency changes must be communicated through the existing coordination log and reviewed contracts; neither chat should duplicate the other's lifecycle implementation.

### Scope and compatibility

- The product goal includes vendor walk-ins, booking-generated tickets, public/mobile/QR tickets, printed/unclaimed Developer API tickets and claimed versions of those same tickets.
- Current resource snapshot/projection v1 is narrower: vendor location queues, one service item and one pool per work unit, supported integer durations of 5–480 minutes. Bundles, multiple simultaneously required pools and multi-stage journeys need a new reviewed contract; do not silently flatten them.
- Tickets with no selected service remain legitimate queue work. Missing executable plans in tracked scopes must yield a truthful diagnostic or approved ordinary behavior, never guessed units/durations.
- Current service-start evaluation covers vendor channels `vendor`, `qr` and `online`. Developer API sandbox time-to-call capture is a separate source. Developer production inference is future work, not an available live feature.
- Preserve existing queue priority and ordering. Do not introduce shortest-job bypass, dynamic priority or infer fairness from ticket number.
- Initial proposed producer identities are stable ticket work references and allocation session references. They are documented by the session writer but are not yet emitted by a ready producer; finalize before capture integration. Ordinary explicit timing must not invent allocation IDs.

### Capture, evaluation and privacy

- Retain admitted initial and refresh attempts, including unavailable/fallback outcomes, independently of whether a customer opens a ticket screen. Apply predeclared per-work/time budgets and retention limits; record suppressed/dropped attempts and reasons so sampling cannot silently hide failures.
- Select the earliest admitted attempt per work/version only for the anti-cherry-picking initial-attempt metric. The existing offline evaluator supplies that metric; it does not evaluate refresh performance. A separate bounded refresh/export/evaluation extension must measure later accepted forecasts and failures, preserve their observation/acceptance times and queue revision, and distinguish private forecasts from estimates actually delivered. Do not choose refresh samples by observed accuracy.
- Store observation, forecast and acceptance timestamps distinctly. Late/unaccepted forecasts must not be presented as accepted results or scored as timely predictions.
- Resolve service-start labels only from explicit authoritative starts. No calls, confirmations, schedules, expected ends or inferred occupancy may supply them.
- Freeze export observation bounds and outcome-as-of cutoff. Preserve pending and censored cases; after service started, later interruption does not erase the observed start.
- Keep synthetic, manually declared tests, vendor operations and developer sandbox provenance separate. Never automatically promote unverified traffic to verified production data.
- Use keyed pseudonyms and stable private joining namespaces. Exclude customer names, contact details, booking references and raw ticket identifiers from evaluation exports.
- Stable pseudonymous work keys joined to queue/service timestamps remain linkable transactional data, not automatically anonymous data. Before operational capture activation, complete and obtain recorded privacy-owner/Platform Admin approval of the project-required NPC/Philippine Data Privacy Act assessment: processing activity and purpose; affected data subjects; inventory with field/type, PI/SPI classification, purpose and retention; documented RA 10173 legal basis; at least three privacy risks and mitigations; and the required 100–150 word privacy notice draft plus delivery plan. Do not invent consent or a legal basis in code or treat pseudonymization as an exemption.
- The approved assessment must cover retention, access control, export audit, deletion and key rotation. Policy and notice implementation evidence are required alongside assessment approval before Stage C capture activation; these are pending decisions, not defaults approved by this PRD.
- Keep capture outside the critical transaction when possible, with bounded load and explicit dropped-attempt accounting. The eventual delivery design must preserve atomic operational outcomes and avoid selectively losing fallback samples.

### Hosting, performance and cost

The existing forecast is local deterministic computation; the learned candidate is an offline statistical experiment. Neither requires an LLM, an AI Agent or a new Droplet by default. Keep a stable internal interface so remote serving can be introduced later without giving a provider operational authority.

A separate service/Droplet or DigitalOcean Inference integration requires measured CPU, memory, request frequency, end-to-end latency and cost evaluation. Monthly tickets alone do not determine inference volume: observation frequency, refreshes, batching, caching and retries matter. No provider pricing, new infrastructure purchase or production monthly cost is approved here.

Existing wrapper defaults provide engineering constraints: 100 ms deadline, 1,000 ms maximum configured timeout, 1,000 ms default freshness, bounded inventory and at most 2 MiB snapshot bytes. Synchronous projection cannot be preempted; late results are discarded, so this is not a hard event-loop latency guarantee. Cache keys must include trusted scope, relevant revisions and target; stale forecasts may not cross scope or survive invalidation as fresh results.

## Delivery Plan and Acceptance Gates

| Stage | Required acceptance evidence | Current position |
| --- | --- | --- |
| A — Foundations | Separate targets, capture/audits, offline experiments, synthetic provenance and isolated resource projection. | Implemented; no production accuracy claim. |
| B — Authoritative runtime | All relevant writers participate in location-first transactions; historical reconciliation, coverage inventory and coherent complete snapshots are reviewed. Calling/expected end do not allocate/release. | Many writers implemented; bounded read-only inventory/reconciliation evidence available. Authoritative completeness, ready producer and activation proof pending. |
| C — Private capture | Authorized opt-in shadow, authentic work/session links, independent channel coverage, bounded initial/refresh capture, compatible private export, explicit actual-start outcomes, and approved privacy assessment/implemented notice and controls. | Wrapper/evaluator implemented; operational integration pending. |
| D — Evaluation | Predeclared evaluation windows, target-specific comparator, representative scope/channel/service coverage, initial and refresh errors/availability, interruption/overdue behavior, uncertainty policy and measured latency/cost. | Synthetic/time-to-call diagnostics only; no representative live-vendor evidence. |
| E — Controlled pilot | Named eligible scopes, approved public target/labels/fallback, measurable budgets, monitoring, rollback and human release approval. | Not approved. |
| F — Expansion | Confirm performance per new business context; review bundle/multi-pool/stage/developer-production contracts before enabling them. | Future work. |

### Success measures and decisions still required

Report MAE, signed error, within-five-minute percentage, forecast support, fallback reasons and scored-start counts per scope/pool/channel. Report initial-attempt and refresh metrics separately, with bounded sampling/drop coverage, stale-result rejection, delivery age and whether forecasts were actually shown. Stage E requires refresh-path evidence under queue changes, timeouts and recovery; initial-attempt accuracy alone cannot approve it. Include pending/censored counts and exclusions. Compare equivalent targets only; baseline time-to-call cannot establish resource service-start improvement.

Before Stage D, product/runtime/AI owners must predeclare numerical acceptance limits for error, availability, representative observation counts/days, latency, resource overhead and cost per 50,000 monthly tickets at a specified observation policy. Confidence ranges require calibration evidence. The existing 30-ticket training threshold is an experimental fallback threshold, not production approval. There are no agreed production thresholds yet; this PRD does not invent them or lower them to fit available manual data.

### Required acceptance scenarios

1. Printed/unclaimed and claimed tickets count once; opening a screen is not required for capture.
2. Ordinary no-service queues retain existing operations with honest fallback.
3. Two independent resources can serve simultaneously; competing units cannot exceed actual capacity.
4. A protected booking constrains a hypothetical walk-in for its full interval without double counting on conversion.
5. Early arrival cannot bypass earliest-call rules or become actual occupancy.
6. Expected end passes while service remains active: occupancy stays held and unsupported overrun forecasts are unavailable.
7. Explicit completion/interruption releases once; retries and races cannot duplicate sessions or terminal outcomes.
8. Cancellation/no-show before start is censored; service interruption after start preserves the actual-start label.
9. Missing/stale plans, unsupported bundles, incomplete inventory or cross-scope requests never fabricate a forecast.
10. Provider timeout, corrupt/incompatible bytes or stale state produce sanitized unavailability without affecting queue operations.
11. Export retains early fallback, uses frozen outcomes and rejects time-to-call data for service-start scoring.
12. Refresh evaluation retains bounded later attempts and failures after queue changes, timeout/recovery and invalidation, without replacing initial attempts or choosing samples by outcome quality.
13. Capture activation rejects missing/unapproved privacy assessment or unimplemented notice/controls; private evidence and rollout access enforce the persona-to-role mapping.
14. Customer pilot rollback restores the approved public behavior without modifying reservations, occupancy or queue order.

## Testing Decisions

Existing prior art includes pure snapshot/projection and inference-contract checks, strict offline dataset/evaluation validation, seeded simulations, and real PostgreSQL ledger/lifecycle regressions. Good tests exercise observable contracts, authorization, accepted results and atomic outcomes rather than internal helper structure.

The user confirmed automated tests for **all five areas** in the implementation plan:

| Area | Required automated behavior coverage |
| --- | --- |
| Resource-state snapshots | Authorization, exact scope, coherent inventory/revisions, freshness, cross-date work and reconciliation/readiness gates. |
| Prediction | Ordering, reservations, parallel/competing capacity, missing or unsupported plans, overrun/interruption fallbacks, inference deadlines and accepted-result freshness. |
| Private observation capture/export | All issued-ticket channels independent of screen views/claims, exactly-once work identity, bounded initial/refresh retention and drop accounting, earliest-attempt selection including fallbacks, frozen outcomes, keyed pseudonyms, privacy activation gates, role-scoped evidence access and bounded output. |
| Evaluation | Authentic target-specific labels, pending/censored outcomes, starts before acceptance, provenance separation, temporal leakage checks where applicable, separate initial/refresh support and accuracy metrics. |
| Customer estimate delivery | Target labels, same-target fallback/unavailability, scope isolation, refresh/invalidation and delivered-estimate evidence, role-scoped pilot controls, web/mobile contract compatibility, bounded failure behavior and pilot rollback. |

Each implementation slice must include relevant automated regressions and verification evidence before it is treated as complete. This decision approves test coverage in the implementation plan; this documentation update itself adds no runtime implementation or executable tests.

Static documentation review must check internal links, current status claims, target vocabulary and coordination ownership. Live database capture, tracked resource execution, mobile delivery and customer estimate behavior require separate authorized verification. Existing CI/release evidence cannot substitute for representative prediction accuracy.

## Out of Scope

- Activating tracking, marking writer coverage complete, backfilling or repairing live data through this PRD.
- Shipping customer estimates, declaring production performance or approving a model rollout.
- Connecting an LLM/AI Agent, selecting a hosting provider, purchasing a Droplet or promising provider costs.
- Replacing lifecycle/resource authority with an external model, generated text or synthetic history.
- Broad vendor dashboard implementation, campaigns, customer ratings or unrelated authentication changes.
- Multi-pool bundles, multi-stage orchestration and Developer API production inference in the initial resource v1 contract.

## Further Notes

The source baseline is an evidence checkpoint, not a claim that every path is activated or tested in live operations. The reviewed live API reported the same revision on 12 October; resource readiness still returns not_ready. Future implementation PRs must update this PRD's stage/status inventory when gates are fulfilled.

### Implementation references

- [Offline wait-time model](offline-wait-time-model.md)
- [Time-to-call evaluation](wait-time-evaluation.md)
- [Dataset curation](wait-time-dataset-curation.md)
- [Synthetic queue simulator](synthetic-queue-simulator.md)
- [Synthetic resource comparison](synthetic-resource-comparison.md)
- [Resource shadow projection](resource-shadow-projection.md)
- [Private inference boundary](resource-shadow-inference.md)
- [Readiness audit](resource-shadow-audit.md)
- [Service-start evaluation](resource-shadow-evaluation.md)
- [Snapshot consumer](resource-snapshot-consumer.md)
- [Snapshot producer](resource-operational-snapshot-producer.md)
- [Explicit service-session writer](service-session-resource-writer.md)

The cross-chat working log is maintained by the coordinated owners; its local worktree entries are progress evidence, not a replacement for committed product requirements.
