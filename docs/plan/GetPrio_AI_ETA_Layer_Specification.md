# GetPrio AI ETA Layer Specification

## 1. Feature Overview

GetPrio will include an AI-assisted ETA layer that estimates customer waiting time using historical queue behavior, current queue state, service type, assigned staff, branch rules, and confidence checks.

The first version focuses on:

```txt
Private customer ticket ETA
- Estimated call time
- Estimated service start time

Staff dashboard ETA
- Same underlying prediction
- More operational explanation

Public queue display
- Generic queue pace only
```

The goal is not to show exact times. The goal is to provide useful, confidence-aware estimates while avoiding misleading customers when the model is uncertain.

---

## 2. Core Product Decisions

### 2.1 Primary ETA Target

The first version estimates:

```txt
Estimated waiting time for a customer’s ticket
```

Customer-facing ETA is split into two parts:

| Estimate | Meaning |
|---|---|
| Estimated call time | When the customer will likely be notified/called |
| Estimated service start | When actual service will likely begin |

Example customer display:

```txt
Your turn is approaching.

Estimated service start:
15–25 minutes

This may change as the queue moves.
```

If confidence is low:

```txt
We’re still calculating your estimated wait time.
```

---

## 3. Queue Status Behavior

ETA calculation will count only service-impacting statuses.

| Status | ETA effect |
|---|---|
| `queued` | Blocks ETA |
| `in-progress` | Blocks ETA |
| `notified` | Blocks ETA only during notification grace period |
| `billed` | Ignored |
| `paid` | Ignored |
| `completed` | Ignored |
| `cancelled` | Ignored |
| `re-scheduled` | Ignored |
| `skipped/no-show` | Depends on skip grace period |

### 3.1 Notification Grace Period

`notified` tickets block ETA only for a vendor-configurable grace period.

```txt
notification_grace_period_seconds
```

This is controlled by vendor settings but governed by platform plan ranges.

### 3.2 Skip Grace Period

Skipped/no-show tickets use a separate vendor-configurable grace period.

```txt
skip_grace_period_seconds
```

Decision:

| Event | ETA behavior |
|---|---|
| Cancelled | Immediately stops blocking |
| Re-scheduled | Immediately stops blocking today’s queue |
| Skipped/no-show | Stops blocking after skip grace period or staff finalization |
| Notified but absent | Blocks during notification grace period |

---

## 4. Queue Grouping Model

Queues are grouped by:

```txt
vendor + branch + day
```

Recommended table:

```txt
queue_batches
- id
- vendor_id
- branch_id
- service_date
- batch_code
- status
- last_eta_affecting_event_at
- eta_recalculation_interval_seconds
- created_at
- updated_at
```

### 4.1 Hybrid Queue Flow

The intended queue flow is hybrid:

| Stage | Behavior | ETA implication |
|---|---|---|
| Shared branch queue | Customer enters one branch/day queue | Used for call-time estimate |
| Service lane | Ticket may later be routed to service type/staff | Used for service-start estimate |

### 4.2 Service Type and Staff Assignment

Assignment model:

| Field | Timing |
|---|---|
| `service_type_id` | Usually known at ticket creation, but may change |
| `staff_id` | Often assigned later during notification/intake/triage |

Prediction basis before staff assignment:

```txt
vendor + branch + service_type
```

Prediction basis after staff assignment:

```txt
vendor + branch + service_type + staff
```

---

## 5. Data Storage Model

Use a hybrid storage model:

| Storage | Purpose |
|---|---|
| Queue lifecycle columns | Fast operational reads |
| Queue status history | Audit trail, analytics, AI training |
| ETA snapshots | Latest prediction for UI |
| ETA prediction logs | Full audit/evaluation history |
| Daily metrics | Long-term reporting after pruning raw logs |

---

## 6. Queue Table Lifecycle Fields

Recommended queue fields:

```txt
queue
- id
- queue_batch_id
- vendor_id
- branch_id
- patient_id / customer_id
- ticket_number
- queue_index
- status

- service_type_id nullable
- staff_id nullable

- created_at
- notified_at nullable
- started_at nullable
- completed_at nullable
- cancelled_at nullable
- skipped_at nullable
- rescheduled_at nullable
- billed_at nullable
- paid_at nullable

- last_updated
- deleted_at nullable
```

These timestamps allow the model to learn:

| Timestamp | Used for |
|---|---|
| `created_at` | Ticket entry time |
| `notified_at` | Actual call time |
| `started_at` | Actual wait/service-start target |
| `completed_at` | Service duration |
| `cancelled_at`, `skipped_at`, `rescheduled_at` | Queue movement and exclusion logic |
| `billed_at`, `paid_at` | Billing-flow separation |

---

## 7. Queue Status History

Recommended table:

```txt
queue_status_history
- id
- queue_id
- queue_batch_id
- vendor_id
- branch_id

- from_status
- to_status
- changed_at
- changed_by_user_id nullable
- changed_by_role nullable

- service_type_id nullable
- staff_id nullable
- reason nullable
- metadata jsonb
```

Purpose:

```txt
- Full audit trail
- ETA model training
- Queue event reconstruction
- Analytics and debugging
```

---

## 8. ETA Prediction Model

### 8.1 Model Type

Use a structured historical prediction model, not an LLM, for core ETA.

This is a forecasting problem, not a language generation problem.

The model should output:

```txt
estimated_call_min_minutes
estimated_call_max_minutes
estimated_service_start_min_minutes
estimated_service_start_max_minutes
confidence_score
model_basis
sample_size
model_version
```

### 8.2 Model Granularity

Primary granularity:

```txt
vendor + branch + service_type + staff
```

Fallback hierarchy:

| Priority | Basis |
|---:|---|
| 1 | `vendor + branch + service_type + staff` |
| 2 | `vendor + branch + service_type` |
| 3 | `vendor + branch + staff` |
| 4 | `vendor + branch` |
| 5 | Global/platform average, internal only |
| 6 | Hide ETA if confidence is still weak |

Global averages may initialize internal calculations but should not produce visible customer ETA by themselves.

---

## 9. ETA Range Behavior

The model directly sets the ETA range.

Not this:

```txt
midpoint ± tolerance
```

Instead:

```txt
estimated_service_start_min_minutes = 18
estimated_service_start_max_minutes = 34
```

This allows asymmetric uncertainty.

| Scenario | ETA |
|---|---|
| Stable queue | 18–24 min |
| Delay-prone queue | 18–40 min |
| Low-variance service | 12–16 min |
| Near cutoff | 25–60 min or hidden |

### 9.1 Dynamic Maximum Range Width

The platform globally configures max range width based on predicted midpoint.

Default rules:

| ETA midpoint | Max visible range width |
|---:|---:|
| 0–15 min | 10 min |
| 16–30 min | 15 min |
| 31–60 min | 25 min |
| 61–120 min | 40 min |
| 120+ min | 60 min |

If the model range is too wide, store:

```txt
hidden_reason = LOW_CONFIDENCE
```

with internal detail:

```json
{
  "failure_codes": ["range_too_wide"],
  "range_width_minutes": 75,
  "allowed_range_width_minutes": 25
}
```

Customer message:

```txt
We’re still calculating your estimated wait time.
```

---

## 10. Confidence Model

Use hybrid confidence:

```txt
Model confidence score + platform rule gates
```

The model outputs:

```txt
confidence_score: 0.00 to 1.00
```

Platform global setting:

```txt
eta_minimum_model_confidence_score = 0.70
```

Validation:

```txt
0.00 <= eta_minimum_model_confidence_score <= 1.00
```

ETA is visible only if:

```txt
model_confidence_score >= platform minimum
AND sample size passes
AND data freshness passes
AND range width passes
AND business hours rules pass
AND queue/service-lane state is valid
```

Raw model confidence is internal only.

---

## 11. ETA Hidden Reasons

Customer-safe hidden reasons:

```txt
LOW_CONFIDENCE
OUTSIDE_BUSINESS_HOURS
QUEUE_CLOSED
NO_ACTIVE_SERVICE_LANE
SNAPSHOT_STALE
MODEL_UNAVAILABLE
NOT_APPLICABLE_STATUS
ETA_DISABLED_BY_BRANCH
```

Customer messages stay generic where appropriate.

| Hidden reason | Customer message |
|---|---|
| `LOW_CONFIDENCE` | “We’re still calculating your estimated wait time.” |
| `QUEUE_CLOSED` | “This queue is currently closed.” |
| `OUTSIDE_BUSINESS_HOURS` | “This ticket may be served on the next operating day.” |
| `ETA_DISABLED_BY_BRANCH` | “Estimated wait time is currently unavailable.” |

Internal diagnostics are stored separately in:

```txt
hidden_details jsonb
```

---

## 12. ETA Snapshots

Use one latest snapshot row per target.

Recommended table:

```txt
eta_snapshots
- id
- snapshot_type
  - ticket_eta
  - queue_pace

- vendor_id
- branch_id
- queue_batch_id
- ticket_id nullable

- is_visible
- is_stale
- hidden_reason nullable
- hidden_details jsonb nullable

- confidence_score nullable
- model_version nullable
- model_basis nullable

- calculated_at
- stale_after
- visible_until
- snapshot_version

- payload jsonb
- created_at
- updated_at
```

### 12.1 Ticket ETA Payload

```json
{
  "estimated_call_min_minutes": 10,
  "estimated_call_max_minutes": 15,
  "estimated_service_start_min_minutes": 18,
  "estimated_service_start_max_minutes": 25,
  "sample_size": 120,
  "model_basis": "vendor_branch_service_staff"
}
```

### 12.2 Queue Pace Payload

```json
{
  "pace_min_minutes_per_ticket": 6,
  "pace_max_minutes_per_ticket": 9,
  "source": "rolling_average",
  "sample_size": 10
}
```

### 12.3 Uniqueness

Use latest-only constraints:

```txt
one latest ticket_eta per ticket_id
one latest queue_pace per queue_batch_id
```

PostgreSQL partial unique index examples:

```sql
CREATE UNIQUE INDEX unique_ticket_eta_snapshot
ON eta_snapshots (ticket_id)
WHERE snapshot_type = 'ticket_eta' AND ticket_id IS NOT NULL;

CREATE UNIQUE INDEX unique_queue_pace_snapshot
ON eta_snapshots (queue_batch_id)
WHERE snapshot_type = 'queue_pace';
```

---

## 13. Snapshot Staleness

A snapshot is stale if:

```txt
now - eta_snapshot.calculated_at > vendor.eta_recalculation_interval_seconds

OR

queue_batch.last_eta_affecting_event_at > eta_snapshot.calculated_at
```

Stale ETA may still be shown for:

```txt
2 × vendor.eta_recalculation_interval_seconds
```

| Recalculation interval | Stale visible until |
|---:|---:|
| 30s | 60s |
| 60s | 120s |
| 120s | 240s |

Customer stale behavior:

```txt
Estimated service start: 15–25 minutes
Updating…
```

A spinner, pulse, or small loader can be shown.

After stale visibility expires, hide ETA and show fallback.

---

## 14. ETA Prediction Logs

Store full append-only logs for every prediction.

Recommended table:

```txt
eta_prediction_logs
- id

- snapshot_type
- ticket_id nullable
- queue_batch_id
- vendor_id
- branch_id
- service_type_id nullable
- staff_id nullable

- predicted_at

- predicted_call_min_minutes nullable
- predicted_call_max_minutes nullable
- predicted_service_start_min_minutes nullable
- predicted_service_start_max_minutes nullable

- confidence_score nullable
- was_visible_to_customer
- hidden_reason nullable
- hidden_details jsonb nullable

- model_version
- model_basis
- sample_size

- features jsonb

- actual_notified_at nullable
- actual_started_at nullable
- actual_completed_at nullable

- strict_range_hit nullable
- soft_range_hit nullable
- midpoint_error_minutes nullable
- bias_direction nullable

- created_at
```

### 14.1 Feature Snapshot

Store full model input features as JSONB.

Example:

```json
{
  "queue_position": 12,
  "active_blocking_tickets_ahead": 8,
  "notified_blocking_tickets_ahead": 1,
  "queued_tickets_ahead": 6,
  "in_progress_tickets_ahead": 1,
  "day_of_week": "monday",
  "hour_of_day": 14,
  "recent_queue_pace_minutes": 7.5,
  "recent_service_duration_avg_minutes": 12.2,
  "vendor_sample_size": 840,
  "service_type_sample_size": 210,
  "staff_sample_size": 75,
  "notification_grace_period_seconds": 300,
  "skip_grace_period_seconds": 600,
  "eta_recalculation_interval_seconds": 60
}
```

Do not add a heavy GIN index on `features` in v1 unless needed.

Index normal columns first:

```txt
vendor_id
branch_id
queue_batch_id
ticket_id
predicted_at
model_version
was_visible_to_customer
hidden_reason
```

---

## 15. Prediction Accuracy Metrics

Track both strict and soft accuracy.

| Metric | Meaning |
|---|---|
| Strict range hit | Actual time fell inside predicted range |
| Soft range hit | Actual time fell close enough to range |
| Error distance | Difference from predicted midpoint |
| Bias direction | Underestimated, overestimated, or accurate |

Soft-success tolerance:

```txt
vendor-configurable within platform limits
```

Example defaults:

| Setting | Value |
|---|---:|
| Platform minimum tolerance | ±3 min |
| Platform maximum tolerance | ±15 min |
| Default tolerance | ±5 min |

Example:

```txt
Predicted service start: 15–25 minutes
Actual service start: 27 minutes
```

Result:

```txt
strict_range_hit = false
soft_range_hit = true
midpoint_error_minutes = +7
bias = underestimated_wait
```

---

## 16. Daily Metrics

Raw logs are pruned eventually, so daily aggregates are kept long-term.

Recommended table:

```txt
eta_prediction_daily_metrics
- id
- metric_date

- vendor_id
- branch_id
- service_type_id nullable
- staff_id nullable
- model_version

- total_predictions
- visible_predictions
- hidden_predictions

- strict_hit_count
- soft_hit_count
- strict_hit_rate
- soft_hit_rate

- avg_error_minutes
- median_error_minutes
- p90_error_minutes

- underestimation_count
- overestimation_count
- accurate_count

- low_confidence_count
- insufficient_history_count
- outside_business_hours_count
- queue_closed_count
- no_active_service_lane_count
- snapshot_stale_count
- model_unavailable_count
- not_applicable_status_count

- created_at
- updated_at
```

Metric date is based on platform timezone calendar day.

Default:

```txt
Asia/Manila
```

---

## 17. Retention and Pruning

### 17.1 Raw Log Retention

Retention is plan-based and adjustable from the platform dashboard.

Defaults:

| Plan | Raw log retention |
|---|---:|
| Free | 30 days |
| Pro | 90 days |
| Enterprise | 180 days |

Recommended fields:

```txt
vendor_plan.eta_raw_log_retention_days_default
vendor_plan.eta_raw_log_retention_days_min
vendor_plan.eta_raw_log_retention_days_max

vendor.eta_raw_log_retention_days_override nullable
```

Effective retention:

```txt
vendor override OR vendor plan default
```

Validated against plan min/max.

### 17.2 Pruning Behavior

Decision:

```txt
Automatic pruning with audit log
```

Pruning is irreversible.

Flow:

```txt
Daily ETA maintenance job
  1. Aggregate raw logs into daily metrics
  2. Verify aggregation succeeded
  3. Apply retention cutoff
  4. Apply safety buffer
  5. Hard-delete eligible raw logs
  6. Write pruning audit record
  7. Send warning if thresholds are exceeded
```

Never prune raw logs until aggregation succeeds.

### 17.3 Safety Buffer

Platform-wide configurable safety buffer.

Default:

```txt
1 day
```

Eligibility:

```txt
predicted_at < now - effective_retention_days
AND metric_date has successful aggregation
AND aggregation_completed_at < now - platform_safety_buffer_days
```

### 17.4 Pruning Audit

Recommended table:

```txt
eta_log_pruning_audit
- id
- started_at
- completed_at
- status

- vendor_id nullable
- branch_id nullable

- retention_days_used
- cutoff_at
- safety_buffer_days

- rows_pruned
- estimated_storage_deleted_mb
- partitions_dropped

- triggered_by
- warning_triggered
- warning_reason nullable

- error_message nullable
```

Trigger values:

```txt
scheduled_job
platform_admin
system_retry
```

### 17.5 Large Prune Warnings

Warnings are triggered by both row count and storage size.

Default thresholds:

```txt
row threshold = 100,000 rows
storage threshold = 1,024 MB
```

Behavior:

```txt
Continue pruning automatically
Send dashboard + email warning
Webhook optional later
```

---

## 18. Real-Time Update Architecture

Use:

```txt
SSE + polling fallback
```

SSE is ideal because updates are mostly server-to-client.

### 18.1 Event Flow

```txt
Queue mutation
  → update queue lifecycle columns
  → append queue_status_history
  → update queue_batch.last_eta_affecting_event_at
  → enqueue ETA recalculation job
  → worker recalculates ETA
  → update eta_snapshots
  → append eta_prediction_logs
  → publish SSE event
  → client updates UI
```

### 18.2 SSE Events

Recommended event types:

```txt
eta.snapshot.updated
eta.snapshot.hidden
eta.snapshot.stale
queue.pace.updated
heartbeat
```

### 18.3 Reconnect Behavior

Rules:

```txt
- SSE client reconnects automatically
- Server sends heartbeat every 20–30 seconds
- On reconnect, client fetches latest ETA snapshot via REST
- SSE payload includes snapshot_version and calculated_at
- Client ignores stale events
```

Client update rule:

```txt
apply incoming event only if:
incoming.snapshot_version > current.snapshot_version
```

---

## 19. Background Worker Architecture

Use:

```txt
Main API + background worker
```

| Component | Responsibility |
|---|---|
| Main API | Queue CRUD, lifecycle updates, status history, SSE endpoint, ETA read endpoints |
| Worker | ETA recalculation, confidence gates, snapshot writes, prediction logs |
| PostgreSQL | Queue state, history, jobs, snapshots, logs, metrics |
| SSE layer | Push updates to subscribed clients |

### 19.1 Job Queue

Use PostgreSQL-backed jobs for v1.

Options:

```txt
pg-boss
graphile-worker
custom eta_jobs table
```

Recommendation:

```txt
pg-boss or graphile-worker
```

Use hybrid triggers:

| Mechanism | Role |
|---|---|
| Durable job queue | Primary recalculation trigger |
| Periodic worker sweep | Backup/self-healing |
| Client polling | UI fallback |

---

## 20. ETA Recalculation Rules

### 20.1 Recalculation Triggers

Use:

```txt
major events + fixed interval
```

Major events:

```txt
ticket_created
ticket_notified
service_started
service_completed
ticket_cancelled
ticket_skipped
ticket_re_scheduled
staff_assignment_changed
service_type_changed
vendor_grace_period_changed
branch_business_hours_changed
```

Billing/paid transitions only trigger ETA recalculation if they affect the service flow.

### 20.2 Fixed Interval

Vendor-configurable, with platform plan limits.

Minimum:

```txt
30 seconds
```

Example plan ranges:

| Plan | Minimum interval |
|---|---:|
| Free | 120s |
| Standard | 60s |
| Pro / Enterprise | 30s |

### 20.3 Recalculation Scope

Hybrid:

| Trigger | Scope |
|---|---|
| Major event | Affected tickets behind changed ticket |
| Fixed interval | Full active queue for vendor branch/day |
| SSE subscription | Push only relevant updates |

---

## 21. Business Hours and Cutoffs

Branch/vendor configurable.

Branch settings:

```txt
business_hours
ticket_cutoff_time
allow_service_beyond_closing
next_day_rollover_policy
holiday_special_schedule
```

Customer behavior:

| Scenario | ETA behavior |
|---|---|
| ETA within hours | Show normal ETA if confidence passes |
| ETA exceeds closing but service can continue | Show ETA with caution |
| ETA exceeds cutoff and service cannot continue | Hide ETA, show next-day message |
| Branch closed | Show closed/next-session behavior |

### 21.1 Close-of-Day Policy

Branch-configurable options:

```txt
auto_cancel
auto_reschedule
manual_close
continue_serving_until_cleared
```

If auto-rescheduled, priority order next day:

| Priority | Source |
|---:|---|
| 1 | Pre-booked appointments/reservations |
| 2 | Auto-rescheduled tickets from previous operating day |
| 3 | New walk-in/same-day tickets |

Appointments are schema-ready only in v1.

Future appointment types:

| Type | ETA effect |
|---|---|
| Capacity-blocking | Reserves staff/service capacity |
| Priority-only | Affects order, not capacity |
| Informational | Minimal ETA impact |

---

## 22. Public Queue Pace

Public display does not show per-ticket ETA.

It shows generic queue pace.

Example:

```txt
Average queue pace:
1 ticket every 6–9 minutes

Current serving:
A024

Now waiting:
18 tickets
```

### 22.1 Public Pace Calculation

Hybrid:

| Data quality | Source |
|---|---|
| Enough recent completed tickets today | Rolling average |
| Recent data weak but AI confidence acceptable | AI-assisted generic pace |
| Both weak | “Queue pace is still being calculated.” |

Rolling window:

```txt
Last 10 completed/moved tickets,
only within the last 2 hours
```

Queue movement pace includes:

```txt
completed + cancelled + skipped + re-scheduled
```

Service duration uses:

```txt
completed only
```

---

## 23. Feature Toggles

Branch-level toggles:

```txt
customer_eta_enabled
staff_eta_enabled
public_queue_pace_enabled
```

Defaults:

```txt
customer_eta_enabled = true
staff_eta_enabled = true
public_queue_pace_enabled = true
```

Behavior:

| Toggle | If disabled |
|---|---|
| Customer ETA | Do not calculate/show customer private ETA |
| Staff ETA | Do not calculate/show staff ETA |
| Public queue pace | Do not calculate/show public pace |

If customer ETA is disabled but staff ETA is enabled:

```txt
Customer page: no ETA
Staff dashboard: ETA remains active
```

---

## 24. UI Behavior

### 24.1 Customer Ticket Page

Customer sees:

| State | UI |
|---|---|
| Fresh ETA | Show estimated call/service-start range |
| Stale but usable | Show ETA + updating spinner |
| Low confidence | Generic fallback |
| Queue closed | Queue closed message |
| Outside hours | Next operating day message |
| ETA disabled | ETA unavailable message |

Customer never sees:

```txt
confidence_score
model_basis
internal hidden details
staff diagnostics
```

### 24.2 Staff Dashboard

Staff uses the same underlying ETA prediction.

If confidence passes:

```txt
ETA: 15–25 minutes
```

If customer confidence gate hides ETA:

```txt
Estimate preview: 25–55 minutes
Confidence: Low
Reason: ETA is unstable.
Action: Check service lane assignment or unresolved skipped tickets.
```

Staff sees simplified operational reasons and suggested actions.

Staff cannot manually override ETA.

### 24.3 Vendor Admin Dashboard

Vendor admins can see:

```txt
Own vendor/branch ETA accuracy
Service-type metrics
Staff-level aggregate metrics
Hidden reason breakdown
CSV/PDF exports
Staff leaderboard
```

They cannot see model version comparison.

### 24.4 Platform Admin Dashboard

Platform admins can see:

```txt
All vendor metrics
Model version comparison
Platform-wide performance
Pruning/audit status
Retention settings
Warning thresholds
Range-width rules
Confidence threshold
```

---

## 25. Reporting and Exports

### 25.1 Access

| Role | Access |
|---|---|
| Platform admin | All vendors and model reports |
| Vendor admin | Own vendor/branch reports |
| Staff | No accuracy reports |
| Customer | No reports |

### 25.2 Export Formats

Vendor admins can export:

```txt
CSV
PDF
```

Exports include aggregate metrics only by default.

Fields:

```txt
vendor_id
branch_id
service_type
staff identity based on config
metric_date_range
total_predictions
visible_predictions
strict_hit_rate
soft_hit_rate
avg_error_minutes
median_error_minutes
underestimation_rate
overestimation_rate
hidden ETA reason counts
low confidence label
```

### 25.3 Staff Identity in Exports

Platform defines allowed modes by vendor plan. Vendor admin chooses from allowed modes.

Modes:

```txt
staff_name
staff_id
anonymized
name_and_id
```

### 25.4 Staff Leaderboard

Vendor admins can see staff ranking.

Ranking basis:

```txt
soft_hit_rate DESC
```

Tie-breakers:

```txt
1. Higher soft_hit_rate
2. Higher total_predictions
3. Lower avg_error_minutes
4. Lower underestimation_rate
```

Minimum rankable predictions:

```txt
30
```

Sample-size display:

| Prediction count | Behavior |
|---:|---|
| 0–9 | Insufficient data, not ranked |
| 10–29 | Low confidence, not ranked |
| 30+ | Eligible for ranking |

---

## 26. API Contract Draft

### 26.1 Get Customer Ticket ETA

```http
GET /api/tickets/:ticketId/eta
```

Customer response:

```json
{
  "ticket_id": "uuid",
  "snapshot_type": "ticket_eta",
  "is_visible": true,
  "is_stale": false,
  "updating": false,
  "display_status": "visible",
  "customer_message": null,
  "estimated_call_range_minutes": {
    "min": 10,
    "max": 15
  },
  "estimated_service_start_range_minutes": {
    "min": 18,
    "max": 25
  },
  "calculated_at": "2026-05-31T10:00:00+08:00",
  "snapshot_version": 42
}
```

Hidden response:

```json
{
  "ticket_id": "uuid",
  "snapshot_type": "ticket_eta",
  "is_visible": false,
  "is_stale": false,
  "updating": false,
  "display_status": "hidden",
  "hidden_reason": "LOW_CONFIDENCE",
  "customer_message": "We’re still calculating your estimated wait time.",
  "estimated_call_range_minutes": null,
  "estimated_service_start_range_minutes": null,
  "calculated_at": "2026-05-31T10:00:00+08:00",
  "snapshot_version": 43
}
```

### 26.2 Get Staff Ticket ETA

```http
GET /api/staff/tickets/:ticketId/eta
```

Adds staff fields:

```json
{
  "ticket_id": "uuid",
  "is_visible": false,
  "customer_message": "We’re still calculating your estimated wait time.",
  "staff_visibility": {
    "can_view_low_confidence_eta": true,
    "preview_range_minutes": {
      "service_start_min": 25,
      "service_start_max": 55
    },
    "operational_reason": "ETA is unstable.",
    "suggested_action": "Check service lane assignment or unresolved skipped tickets."
  }
}
```

### 26.3 SSE Endpoint

```http
GET /api/eta/stream?ticket_id=:ticketId
```

Example SSE event:

```txt
event: eta.snapshot.updated
data: {
  "ticket_id": "uuid",
  "snapshot_version": 44,
  "calculated_at": "2026-05-31T10:01:00+08:00"
}
```

Client then fetches the latest snapshot through REST, or the event may include the full snapshot if payload size is acceptable.

---

## 27. MVP Boundaries

### Included in v1

```txt
- Ticket ETA: call time + service start time
- Staff ETA using same prediction result
- Public generic queue pace
- SSE + polling fallback
- Background worker
- PostgreSQL-backed jobs
- ETA snapshots latest-only
- Full ETA prediction logs with JSONB features
- Daily metrics
- Retention/pruning with audit
- Vendor/admin reports
- CSV/PDF exports
- Staff leaderboard
- Branch-level ETA toggles
- Business hours/cutoff awareness
```

### Not included in v1

```txt
- Appointment capacity blocking logic
- LLM-generated ETA prediction
- Staff manual ETA override
- WebSocket transport
- Object-storage archive before pruning
- Per-vendor pruning schedules
- Public per-ticket ETA
- Customer-visible confidence labels
```

Schema should be designed so appointment capacity blocking can be added later.

---

## 28. Recommended Implementation Phases

### Phase 1 — Data Foundation

```txt
- Add lifecycle timestamp columns to queue
- Add queue_batches
- Add queue_status_history
- Add branch ETA settings
- Add platform ETA settings
```

### Phase 2 — Snapshot and Worker

```txt
- Add eta_snapshots
- Add PostgreSQL-backed job queue
- Build ETA worker
- Implement basic historical estimator
- Write latest snapshot
```

### Phase 3 — Logs and Metrics

```txt
- Add eta_prediction_logs
- Store full feature JSONB
- Add daily metrics table
- Add aggregation/pruning job
- Add pruning audit table
```

### Phase 4 — Real-Time UX

```txt
- Add SSE endpoint
- Add polling fallback
- Add stale/updating UI
- Add staff preview UI
- Add public queue pace display
```

### Phase 5 — Reporting

```txt
- Vendor admin reports
- Platform admin reports
- Staff leaderboard
- Hidden reason breakdown
- CSV/PDF export
```

### Phase 6 — Hardening

```txt
- Model timeout handling
- Worker failure handling
- Retry/idempotency
- Snapshot versioning
- Platform-configurable thresholds
- Dashboard notification/email alerts
```

---

## 29. Final Architecture Summary

```txt
Queue mutation
  → main API updates queue lifecycle fields
  → main API appends queue_status_history
  → main API updates queue_batch.last_eta_affecting_event_at
  → main API enqueues ETA recalculation job

ETA worker
  → consumes job
  → loads current queue state
  → loads historical data
  → builds feature snapshot
  → predicts ETA min/max range
  → applies confidence and business gates
  → updates eta_snapshots
  → appends eta_prediction_logs
  → emits SSE event

Client
  → reads latest ETA snapshot
  → listens through SSE
  → falls back to polling
  → displays customer-safe/staff/admin-specific UI

Daily maintenance
  → aggregates prediction logs into daily metrics
  → verifies aggregation
  → applies retention and safety buffer
  → hard-deletes old raw logs
  → writes pruning audit
  → sends warnings when thresholds are exceeded
```

This specification gives GetPrio a credible AI layer: structured, measurable, auditable, and practical for MVP implementation.
