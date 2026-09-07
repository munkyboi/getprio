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
- queue join OTP and notification preferences behavior
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
- requested booking quantity
- slot capacity
- existing active bookings

Customer-facing slot starts use the full requested duration as the interval. Booking units are opt-in per service from the vendor service catalog. When enabled, the requested quantity multiplies the reserved duration, so a 60-minute court service booked with quantity `3` reserves a three-hour window and advances slot starts in three-hour increments. Services without units enabled always book one base-duration unit. The backend must still validate that the full multiplied duration fits the slot and capacity.

### Capacity

Capacity belongs to the booking availability block. `pending`, `confirmed`, and `rescheduled` bookings consume capacity. Canceled, completed, reviewed, and disputed bookings do not make new customer slots unavailable.

Services can choose how booking capacity is consumed. The default `service` scope keeps capacity isolated to bookings for the same service, except when the matching availability block or exception applies to all services. All-service availability blocks and exceptions share branch capacity across services by definition. The `location` scope also treats active bookings for any service at the selected branch as consuming the same slot capacity, which prevents mixed-duration services from overlapping when they compete for the same staff, counter, room, or equipment pool. Slot starts are still generated from the selected service's duration; conflict checks compare the candidate start/end interval against active booking start/end intervals in the selected capacity scope.

Pending bookings hold capacity from booking creation until a vendor-side user confirms, reschedules, cancels them, or the pending booking expires. The default pending booking expiration is 15 minutes from booking creation and applies to all pending bookings, not only payment-required bookings.

Expired pending bookings use the existing `canceled` booking status with an expiration reason instead of adding a separate `expired` booking status. Expiration releases the held slot capacity and should be presented to customers as an expired booking.

### Booking Verification

Every booking request requires OTP verification before creation. This verifies that the customer has at least one reachable contact channel before reserving capacity.

Booking verification carries forward to the linked queue ticket. Once a booking becomes a ticket, the customer should not repeat OTP verification.

### Manual Booking Payment

Payment requirement belongs to the vendor service, not the whole vendor. A payment-required service uses manual booking payment: the customer pays through the selected location's accepted InstaPay QR wallet or bank payment channel, and GetPrio records payment state and evidence without processing or settling the money.

Payment destination belongs to the selected location. A multi-branch vendor can require payment per service while each branch shows its own location payment QR.

Each location payment QR must include a payment method label, account display name, QR image, and active state. Account identifier display, such as a masked mobile number or account suffix, is optional. GetPrio should label the destination as an accepted InstaPay QR wallet or bank payment channel, but automated QR standard validation is outside the MVP.

Location payment QR images are customer-visible payment destinations, but they should not appear in public vendor search/profile payloads. Expose the active location payment QR only through booking/payment-specific routes after a customer is creating or managing a booking for a payment-required service.

If a selected service requires manual payment and the selected location has no active payment QR, GetPrio must block booking creation for that service/location and show a clear payment-configuration unavailable message. Do not create a pending booking when the customer has no valid payment destination.

Payment-required services should remain visible even when the selected branch lacks an active payment QR. The booking action is disabled for that service/location until payment instructions are configured, and vendor-side setup surfaces should warn the vendor about the missing branch payment QR.

For the MVP, the customer payable amount is the selected service's unit price multiplied by the requested booking units. The booking flow must show the unit price, unit amount, and total payable before the customer submits payment evidence. Payment evidence requires both a customer-entered payment reference number and an uploaded proof image. Convenience fees, platform settlement, refunds, and automated gateway collection stay outside this manual QR payment slice.

For payment-required services, a vendor-side user must verify payment before confirming the booking.

Payment proof images are private booking evidence. They must be visible only to the customer who owns the booking, authorized vendor-side users for that booking, and platform administrators for governance, dispute, or compliance review. Public vendor/profile payloads must not expose payment proof object keys or URLs.

The manual payment flow creates the booking before payment evidence upload. After OTP verification, GetPrio creates a `pending` booking with `payment_status = unpaid` and a 15-minute pending expiration. The customer then sees the vendor payment QR and total payable, submits the required reference number and proof image, and the booking moves to `payment_status = pending`. Submitted payment evidence stops pending expiration permanently for that booking; the booking remains pending vendor review until a vendor-side user verifies or rejects payment. Vendor-side payment verification is required before the booking can be confirmed.

Payment verification and booking confirmation are separate state transitions. Vendor staff, vendor admin, and vendor owner roles can verify or reject manual booking payment evidence for vendor-owned bookings in the MVP. Vendor UI can provide a combined `Verify payment and confirm` action for speed, but the system should still preserve the distinction between verified payment and accepted schedule.

Manual payment verification and rejection must be auditable. GetPrio should record the actor and timestamp for payment verification, and the actor, timestamp, and customer-visible rejection reason for payment rejection.

After payment evidence is submitted, the customer booking detail page must stop showing the payment QR to reduce duplicate payments. The customer should instead see payment evidence status: awaiting vendor verification, payment verified, or rejected/canceled with reason.

For the MVP, rejected payment evidence cancels the booking with a customer-visible reason. GetPrio does not support repeated payment-proof resubmission loops in the first manual QR payment slice; the customer can create a new booking if needed.

### Booking Alerts

Email booking alerts are automatic when an email address is available.

Browser notifications are customer-enabled after login and cover booking status changes plus queue-day updates. Permission should be requested after login, with email remaining the fallback if browser notifications are denied or unavailable.

Browser notifications should also be available to vendor staff and vendor admins for booking intake, payment-proof review, and booking status changes relevant to their role.

Implementation note: the current product has browser-permission and preference UI plus live in-app operational alerts. True OS/browser Web Push delivery still requires the service worker, Push API subscription storage, VAPID configuration, and backend send pipeline tracked in `docs/plan/web-push-notifications-execution-checklist.md`.

When a booking becomes a queue ticket:

- email alerts remain enabled automatically
- browser notification preferences carry forward
- notification controls on the queue ticket page become read-only

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
- browser notification disclosure
- notification settings access after login
- OTP verification before booking creation

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
- generate slot starts using the full requested duration as the interval
- ensure the full requested duration fits the available window
- subtract active booking capacity
- reject past slots

### Booking Creation

Booking creation must require prior OTP verification.

The booking record should preserve:

- selected notification preferences
- browser notification preference where applicable
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

Email is automatic when email exists. Browser notifications follow the customer's notification settings and browser permission state.

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
- Browser notification permission and disabled-state messaging must be explicit before booking submission.

## Acceptance Criteria

- Customers choose from available slots instead of typing datetime manually.
- Slots disappear or become unavailable when capacity is consumed by active bookings.
- A booking cannot be created without OTP verification.
- Booking cannot proceed when required browser-notification permission is denied if the user has chosen browser alerts.
- Customer booking list links to booking details.
- Booking details links to live queue status only after check-in.
- Customer can cancel a booking before check-in.
- Vendor-side users can check in confirmed bookings.
- Check-in creates a normal queue ticket number and preserves the booking reference separately.
- Checked-in bookings appear in the live queue with a `Booking` badge.
- Checked-in bookings sort above normal walk-ins and below carry-over/recovery tickets.
- Queue ticket notification controls are read-only when inherited from a booking.
- Queue OTP is not repeated for checked-in bookings.

## Recommended Implementation Split

### Slice A: Notification migration

- Deprecate customer-paid SMS payment prompts and requirements across booking and queue join flows.
- Replace SMS booking alerts with browser notifications and email fallback.
- Request browser notification permission after login and preserve booking and queue submission when permission is denied.
- Carry browser notification preferences through booking and queue flows.
- Implement true OS/browser Web Push delivery using `docs/plan/web-push-notifications-execution-checklist.md`; do not count permission UI alone as complete push delivery.

### Slice B: Manual QR booking payment

- Add service-level payment-required configuration.
- Add location payment QR configuration and customer-visible booking/payment route exposure.
- Add protected customer payment proof upload and role-scoped proof access.
- Add payment evidence submission, vendor verification/rejection, and audit fields.
- Add 15-minute pending booking expiration, stopped permanently by submitted payment evidence.

## Post-MVP

- vendor-configurable pending booking expiration, defaulting to 15 minutes from booking creation
- customer-initiated reschedule requests
- configurable slot interval
- deposits, refunds, and cancellation penalties
- notification configuration
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
