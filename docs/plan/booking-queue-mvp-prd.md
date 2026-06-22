# GetPrio Booking and Queue MVP PRD

## Purpose

This PRD defines the MVP slice that makes GetPrio bookings work coherently with the existing day-to-day queue. It builds on the current marketplace booking foundation while preserving the queue lifecycle as the source of truth for live service execution.

Related context:

- `CONTEXT.md`
- `docs/adr/0001-booking-check-in-creates-queue-ticket.md`
- `docs/plan/capstone-marketplace-booking-prd.md`
- `docs/plan/queue-lifecycle-v1-stability-prd.md`
- `docs/plan/GetPrio_AI_ETA_Layer_Specification.md`

## Current State

GetPrio already has:

- customer booking creation and booking history
- vendor booking management for pending, confirmed, rescheduled, and canceled bookings
- vendor availability blocks and exceptions
- store-hours fallback when no booking availability is configured
- queue ticket lifecycle, queue day close/reopen, carry-over, recovery, and queue events
- queue join OTP and SMS-fee payment behavior
- service counters for basic vendor operations

The customer booking UI still uses a free datetime input. The next booking slice should replace that with computed booking slots and connect confirmed bookings to the live queue through vendor-side check-in.

## Product Decisions

### Booking and Queue Boundary

Bookings reserve future service intent and schedule. Queue tickets represent live service-day execution.

A booking must not automatically create a queue ticket when submitted or confirmed. A queue ticket is created or linked only when a vendor-side user checks in the customer.

### Booking Slots

Booking slots are computed, not stored as standalone records.

Slots are generated from:

- branch store hours when no booking availability is configured
- vendor-managed booking availability blocks when configured
- date-specific availability exceptions
- selected service duration
- slot capacity
- existing active bookings

Customer-facing slots use 30-minute intervals by default. The backend must still validate that the full service duration fits the slot and capacity.

### Capacity

Capacity belongs to the booking availability block. `pending`, `confirmed`, and `rescheduled` bookings consume capacity. Canceled, completed, reviewed, and disputed bookings do not make new customer slots unavailable.

Pending bookings hold capacity until a vendor-side user confirms, reschedules, or cancels them. Auto-expiring pending bookings is post-MVP.

### Booking Verification

Every booking request requires OTP verification before creation. This verifies that the customer has at least one reachable contact channel before reserving capacity.

Booking verification carries forward to the linked queue ticket. Once a booking becomes a ticket, the customer should not repeat OTP verification.

### Booking Alerts

Email booking alerts are automatic when an email address is available.

SMS booking alerts are customer-enabled during booking. If platform pricing requires payment for SMS alerts, payment must complete before the booking is created with SMS enabled.

When a booking becomes a queue ticket:

- email alerts remain enabled automatically
- SMS alerts remain enabled automatically if selected and paid during booking
- notification controls on the queue ticket page become read-only
- no additional SMS fee is required

Customer-facing inline alert for the checked-in queue ticket:

```txt
SMS alerts are active for this visit. You already covered this during booking, so no additional SMS fee is needed.
```

This is UI copy, not an SMS message body.

### Customer Booking Lifecycle

The customer-facing path is:

```txt
Pending vendor confirmation -> Confirmed -> Check in at vendor -> In queue -> Served
```

The customer can cancel a booking before check-in while the booking is `pending`, `confirmed`, or `rescheduled`. Once the booking has a linked queue ticket, cancellation follows queue-ticket rules.

### Vendor Booking Lifecycle

Vendor owner, vendor admin, and vendor staff can check in a confirmed booking.

Vendor-side users can confirm, reschedule, or cancel bookings. For MVP, customer-initiated rescheduling is out of scope; customers can cancel and create a new booking request.

Vendor-side rescheduling must notify the customer.

### Check-In Window

The default check-in window is 15 minutes before through 15 minutes after the scheduled start time.

Vendor-side users can override the window for late arrivals by checking in late or canceling as no-show.

### Queue Placement

Checked-in bookings receive normal queue ticket numbers and keep their booking reference separately.

Queue priority order should be:

```txt
carry_over > recovery > checked_in_booking > normal
```

The live queue stays one queue for MVP. Checked-in bookings should appear with a small `Booking` badge and linked booking reference, not a separate booking lane.

### AI ETA Boundary

Booking slots do not directly determine live ETA.

Only checked-in queue tickets affect live ETA. Confirmed future bookings can later become scheduled-demand forecasting inputs for the AI ETA layer, but they should not block live queue ETA before check-in.

## MVP Customer UI Requirements

### Booking Request Page

Replace the free datetime input with available booking slot selection.

The page must support:

- service selection
- branch selection
- date selection
- computed slot selection
- customer contact fields
- email alert disclosure
- `Enable SMS alert` option
- inline SMS fee/payment messaging similar to the queue join flow
- OTP verification before booking creation
- SMS payment before booking creation when SMS alerts are enabled and fee applies

### Customer Booking List

The customer account booking table/list must link to a booking details page.

### Customer Booking Details Page

The details page must show:

- booking reference
- vendor
- branch
- service
- scheduled start/end
- current booking status
- payment/alert status where relevant
- vendor notes or reschedule/cancel reason when available
- check-in instruction once confirmed
- linked queue ticket number after check-in
- `Open live queue status` action after check-in

Before check-in, the page must not imply the customer already has a live queue position.

## MVP Vendor UI Requirements

### Vendor Booking Management

The vendor dashboard booking section must support:

- pending/confirmed/rescheduled/canceled filters
- booking search
- confirm booking
- reschedule booking into an available slot
- cancel booking
- check in confirmed booking
- check in late with clear override language
- cancel as no-show

Owner, admin, and staff can check in bookings. Owner/admin continue to manage booking availability. Staff should not manage availability.

### Live Queue

The live queue must show checked-in bookings as normal tickets with:

- queue ticket number
- `Booking` badge
- linked booking reference in row/detail view
- queue priority behavior handled server-side

## Backend Requirements

### Slot Availability

Add an endpoint that returns computed slots for a vendor, branch, service, and date.

The endpoint must:

- use booking availability blocks when configured
- fall back to store hours when no booking availability exists
- apply date exceptions
- generate 30-minute slot starts
- ensure the full service duration fits the available window
- subtract active booking capacity
- reject past slots

### Booking Creation

Booking creation must require prior OTP verification. When SMS alerts are enabled and a fee applies, payment must complete before creating the booking.

The booking record should preserve:

- selected notification preferences
- SMS payment/fee reference when applicable
- verification evidence needed to skip queue OTP at check-in

### Booking Details

Add customer-scoped booking detail access.

The customer can only read their own booking. Vendor-side users can read vendor-owned bookings according to tenant permissions. Platform admin access remains governance-scoped and should not be needed for the MVP flow.

### Customer Cancellation

Add customer cancellation before check-in for `pending`, `confirmed`, and `rescheduled` bookings.

### Vendor Check-In

Add vendor-side check-in for confirmed/rescheduled bookings.

Check-in must:

- verify tenant ownership
- allow vendor owner, admin, and staff
- enforce the check-in window unless override is used
- create a queue ticket with normal ticket number generation
- link booking and queue ticket
- carry notification preferences into the queue ticket
- skip queue OTP for the checked-in booking
- place the ticket in `checked_in_booking` priority band
- return updated booking and ticket summary

### Queue Priority

Add `checked_in_booking` as a queue priority band below `carry_over` and `recovery`, and above `normal`.

Queue selection order must be enforced server-side.

### Notifications

Send customer notifications for:

- booking submitted
- booking confirmed
- booking rescheduled
- booking canceled
- booking checked in

Email is automatic when email exists. SMS follows the customer's booking alert opt-in and payment state.

## Data Model Notes

Likely changes:

- add booking notification preference fields
- add booking OTP/payment linkage
- add booking-to-ticket linkage
- add `checked_in_booking` queue priority value
- add booking status or timestamp fields for checked-in/no-show if the existing status model is insufficient

Avoid storing generated booking slots as durable rows in MVP.

## Security and Privacy Requirements

- Enforce all booking ownership server-side.
- Do not rely on hidden UI for booking or queue privileges.
- Keep OTP attempts, payment state, and booking state transitions auditable.
- Avoid exposing customer phone/email on public queue displays.
- Use generic verification and payment errors where possible.
- SMS opt-in and fee disclosure must be explicit before payment.

## Acceptance Criteria

- Customers choose from available slots instead of typing datetime manually.
- Slots disappear or become unavailable when capacity is consumed by active bookings.
- A booking cannot be created without OTP verification.
- SMS-enabled booking cannot be created until the SMS fee is paid when a fee applies.
- Customer booking list links to booking details.
- Booking details links to live queue status only after check-in.
- Customer can cancel a booking before check-in.
- Vendor-side users can check in confirmed bookings.
- Check-in creates a normal queue ticket number and preserves the booking reference separately.
- Checked-in bookings appear in the live queue with a `Booking` badge.
- Checked-in bookings sort above normal walk-ins and below carry-over/recovery tickets.
- Queue ticket notification controls are read-only when inherited from a booking.
- Queue OTP is not repeated for checked-in bookings.

## Post-MVP

- vendor-configurable pending booking expiration
- customer-initiated reschedule requests
- configurable slot interval
- deposits, refunds, and cancellation penalties
- calendar sync
- service workflow builder
- multi-counter routing with the same ticket number
- branching or parallel service workflows
- branch-specific workflow overrides
- AI ETA scheduled-demand forecasting from confirmed future bookings

## Explicit Non-Goals

- Do not build the service workflow builder in this MVP.
- Do not create separate live queues for bookings and walk-ins.
- Do not auto-create queue tickets when bookings are submitted or confirmed.
- Do not make booking slots durable schedule records.
- Do not require customers to verify OTP again when a checked-in booking becomes a queue ticket.
