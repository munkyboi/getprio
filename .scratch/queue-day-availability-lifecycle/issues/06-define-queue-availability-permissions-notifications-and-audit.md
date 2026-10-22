# Define queue availability permissions, notifications, and audit

Type: grilling
Status: resolved
Claimed by:
Blocked by: 02, 03, 05

## Question

Which roles may open, pause, extend, close, reopen, or repair a Queue Day, and what must customers, vendor staff, and platform operators see or receive for every availability transition?

## Resolution must decide

1. Permission mapping for Vendor Staff, Vendor Admin, and Platform Admin, enforced server-side.
2. Staff notification channels and deduplication for the 15-minute warning, extension, final warning, close, and reconciliation failure.
3. Customer/public messages for store closed, Queue Day unopened, paused, near limit, warning, closing, extended, closed, carry-over, expiration, and unserved outcomes.
4. Required audit actor, source, reason, timestamps, previous/next state, affected-ticket counts, and override metadata.
5. Platform-admin recovery visibility without granting routine operational control unnecessarily.

## Decisions in progress

### Queue Day operational permissions

- Vendor Staff may open, pause, resume, extend, and manually close Queue Days
  for locations to which they are assigned.
- Vendor Admin and Vendor Owner may perform every Vendor Staff operation and
  may reopen an eligible manually closed Queue Day.
- Platform Admin has no routine queue-operation authority. Platform Admin may
  use a separate reason-required, fully audited Queue Day Repair action only
  when ordinary reconciliation cannot restore a trustworthy state.
- Every permission is enforced server-side. Hidden or disabled UI is only a
  presentation of the backend decision.

### Staff notification policy

- At 15 minutes before the current authoritative deadline, show the persistent
  global action tray and send one Web Push to each assigned queue operator.
- At 5 minutes, escalate the tray's danger treatment and send one final Web
  Push for that deadline.
- When an operator extends the Queue Day, the actor receives immediate inline
  confirmation, every live dashboard receives the new deadline, and other
  assigned operators receive an extension update.
- When the Queue Day closes, replace the countdown with the close time and
  ticket-outcome totals and send one closure update.
- A reconciliation failure produces a persistent locked error, Web Push to
  assigned operators, and email escalation to Vendor Admin and Vendor Owner.
- Deduplicate each notification by recipient, Queue Day, event type, and
  deadline version. Each audited extension creates a new deadline version, so
  its 15-minute and 5-minute warnings are new events without reviving warnings
  from the superseded deadline.

### Customer and public messaging

- Outside Effective Store Hours, show `Store is closed` and the next effective
  hours.
- During Effective Store Hours while the Queue Day is unopened, explain that
  the queue is not open yet and that staff must open it before customers can
  join. Never imply that entering store hours opens it automatically.
- While intake is paused, explain that new joins are temporarily paused while
  existing tickets continue to be served.
- Near the configured intake limit, keep joining available but warn that the
  queue is filling and intake may pause soon.
- During the 15-minute warning, keep joining available while showing the exact
  closing time and explaining that service before closing is not guaranteed.
- During short-lived closing/reconciliation, block joining and show
  `Queue is closing. Check again shortly.`
- After extension, show the new closing time and confirm that joining remains
  available.
- After closure, show the close time without promising that staff will reopen
  the Queue Day.
- Carry-over, expiration, and unserved outcomes are private ticket messages,
  not public queue status. Preserve each in ticket history and deliver it
  through Web Push plus email when an address is available.
- A carry-over message explains that the ticket is retained but has no live
  position until the next eligible Queue Day opens.
- Expiration and unserved messages state that the outcome is terminal, explain
  why it happened, and provide the appropriate next step rather than presenting
  either outcome as cancellation.

### Queue Day audit contract

- Create one immutable Queue Day Lifecycle Event for every open, pause, resume,
  warning, extension, close, reopen, reconciliation, ticket-outcome batch, and
  repair.
- Record tenant, location, Queue Day, local business date, event type, server
  timestamp, and location timezone.
- Record actor user ID and role when present plus the source: vendor UI,
  periodic scan, startup scan, request-time reconciliation, or Platform Admin
  repair.
- Record correlation and idempotency keys; the previous and resulting lifecycle,
  intake mode, deadline, and deadline version; and affected-ticket counts
  grouped by outcome.
- Use structured reason codes with an optional staff note. Require an entered
  reason for early manual close, reopen, and Queue Day Repair. Routine open,
  resume, and confirmed extension may use structured system reason codes.
- Extension events record old/new deadlines and duration. Repair events also
  record an incident reference and complete before/after state.
- Queue Day Lifecycle Events explain and audit state but do not replace the
  mutable Queue Day aggregate as the current-state authority.

### Platform Admin recovery boundary

- Provide Platform Admins a read-only operations view containing tenant,
  location, Queue Day lifecycle and intake state, current deadline/version,
  last successful reconciliation, retry count, sanitized last error,
  ticket-outcome counts, lifecycle events, and failed notification intents.
- Minimize customer data in this view. Operational diagnosis does not grant
  routine access to unnecessary customer PII.
- Allow `Retry reconciliation` and `Requeue notification delivery` as narrow
  recovery actions. Neither action changes the intended Queue Day policy.
- Permit Queue Day Repair only after automated recovery cannot restore a
  trustworthy state.
- Queue Day Repair requires Platform Admin MFA, an incident reference, entered
  reason, previewed before/after changes, and explicit confirmation. It exposes
  allowlisted repair operations rather than arbitrary database-field editing
  and always creates a Queue Day Lifecycle Event.
- Platform Admin still cannot use recovery tooling to perform routine open,
  pause, resume, extend, manual close, or reopen operations for a vendor.

## Resolution

The permission, notification, messaging, audit, and Platform Admin recovery
decisions above are the confirmed shared understanding.

Vendor Staff operate Queue Days only for assigned locations. Vendor Admin and
Vendor Owner may perform the same routine actions and may reopen an eligible
manually closed Queue Day. Platform Admin receives privacy-minimized diagnostic
visibility and narrowly allowlisted reconciliation, notification-delivery, and
Queue Day Repair capabilities without routine vendor queue control.

Staff alerts use the selected global action tray, deadline-versioned Web Push,
and targeted email escalation for reconciliation failure. Public availability
copy remains truthful about whether joining is possible, while private ticket
history and notifications explain carry-over, expiration, and unserved
outcomes. Immutable Queue Day Lifecycle Events preserve every material actor,
source, transition, deadline, outcome count, reason, and repair.

This decision does not redesign the vendor storefront, discovery/profile
layout, service presentation, or booking UI. Existing storefront-adjacent queue
status and join affordances may change only as needed to display the
authoritative Queue Day availability and approved customer/public messages.
