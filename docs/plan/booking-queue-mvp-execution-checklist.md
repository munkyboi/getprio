# Booking and Queue MVP Execution Checklist

This checklist converts `docs/plan/booking-queue-mvp-prd.md` into an implementation sequence for the current GetPrio codebase.

The goal is to replace free-form booking datetime entry with computed slots, add booking OTP/SMS alert handling, and connect confirmed bookings to the live queue only when a vendor-side user checks the customer in.

---

## 1. Current Codebase Baseline

### Backend anchors

- [backend/src/services/bookingService.js](/Users/carloabella/Projects/getprio/dev/backend/src/services/bookingService.js)
- [backend/src/repositories/bookings.js](/Users/carloabella/Projects/getprio/dev/backend/src/repositories/bookings.js)
- [backend/src/repositories/vendorAvailability.js](/Users/carloabella/Projects/getprio/dev/backend/src/repositories/vendorAvailability.js)
- [backend/src/services/queueService.js](/Users/carloabella/Projects/getprio/dev/backend/src/services/queueService.js)
- [backend/src/repositories/tickets.js](/Users/carloabella/Projects/getprio/dev/backend/src/repositories/tickets.js)
- [backend/src/services/queueJoinOtpService.js](/Users/carloabella/Projects/getprio/dev/backend/src/services/queueJoinOtpService.js)
- [backend/src/services/queueJoinPaymentService.js](/Users/carloabella/Projects/getprio/dev/backend/src/services/queueJoinPaymentService.js)
- [backend/src/services/queueFeeService.js](/Users/carloabella/Projects/getprio/dev/backend/src/services/queueFeeService.js)
- [backend/src/services/notificationService.js](/Users/carloabella/Projects/getprio/dev/backend/src/services/notificationService.js)
- [backend/src/routes/accountRoutes.js](/Users/carloabella/Projects/getprio/dev/backend/src/routes/accountRoutes.js)
- [backend/src/routes/vendorRoutes.js](/Users/carloabella/Projects/getprio/dev/backend/src/routes/vendorRoutes.js)
- [backend/src/routes/publicRoutes.js](/Users/carloabella/Projects/getprio/dev/backend/src/routes/publicRoutes.js)

### Frontend anchors

- [frontend/src/pages/BookingRequestPage.tsx](/Users/carloabella/Projects/getprio/dev/frontend/src/pages/BookingRequestPage.tsx)
- [frontend/src/pages/CustomerAccountPage.tsx](/Users/carloabella/Projects/getprio/dev/frontend/src/pages/CustomerAccountPage.tsx)
- [frontend/src/pages/JoinedQueuePage.tsx](/Users/carloabella/Projects/getprio/dev/frontend/src/pages/JoinedQueuePage.tsx)
- [frontend/src/pages/VendorDashboardPage.tsx](/Users/carloabella/Projects/getprio/dev/frontend/src/pages/VendorDashboardPage.tsx)
- [frontend/src/App.tsx](/Users/carloabella/Projects/getprio/dev/frontend/src/App.tsx)
- [frontend/src/queuePaths.ts](/Users/carloabella/Projects/getprio/dev/frontend/src/queuePaths.ts)
- [shared/types.ts](/Users/carloabella/Projects/getprio/dev/shared/types.ts)

### Current strengths

- customer booking creation and history already exist
- vendor booking management exists for owner/admin
- availability blocks and exceptions already exist
- booking validation already falls back to store hours
- queue lifecycle, carry-over, recovery, and queue events already exist
- queue join OTP and SMS-fee behavior already exist

### Current risks

- booking UI still accepts a free datetime input
- availability validation does not yet expose customer-selectable slots
- active booking capacity is not yet counted when generating/accepting slots
- booking OTP/payment state is not yet modeled separately from queue join OTP/payment
- bookings are not yet linked to queue tickets at check-in
- `checked_in_booking` priority does not yet exist in queue ordering

---

## 2. Delivery Strategy

Do this in seven slices.

### Slice 1

Data contracts, migrations, and queue priority foundations.

### Slice 2

Computed booking slots and capacity enforcement.

### Slice 3

Booking OTP, SMS alert fee/payment, and booking creation.

### Slice 4

Customer booking detail, cancellation, and booking request UI.

### Slice 5

Vendor check-in, no-show handling, and booking-to-ticket linkage.

### Slice 6

Vendor dashboard and live queue UI polish.

### Slice 7

End-to-end tests, regression tests, and runtime verification.

Current status:

- Slice 1: pending
- Slice 2: pending
- Slice 3: pending
- Slice 4: pending
- Slice 5: pending
- Slice 6: pending
- Slice 7: pending

Recommended first implementation milestone: **Slice 1 + Slice 2 backend tests passing before touching the customer slot UI.**

---

## 3. Slice 1: Data Contracts And Queue Priority

### 3.1 Add booking fields

- [ ] Add migration for booking notification/check-in linkage fields.
- [ ] Mirror schema changes in `database/init.sql`.
- [ ] Add booking notification preferences:
  - `notify_by_email`
  - `notify_by_sms`
  - `sms_alert_fee_payment_id` or equivalent payment reference
  - `contact_verified_at`
  - `contact_verification_channel`
- [ ] Add queue linkage fields:
  - `queue_ticket_id`
  - `checked_in_at`
  - `checked_in_by_user_id`
  - `no_show_at`
  - `no_show_by_user_id`
- [ ] Add indexes for customer booking detail and vendor day/check-in views.

### 3.2 Add booking-to-ticket contracts

- [ ] Extend `shared/types.ts` with booking detail response shape.
- [ ] Add linked ticket summary fields to customer/vendor booking summaries.
- [ ] Add booking slot request/response contracts.
- [ ] Add booking OTP request/verify contracts.
- [ ] Add vendor check-in request/response contracts.
- [ ] Add customer cancellation response contract.

### 3.3 Add checked-in booking priority

- [ ] Add `checked_in_booking` to the queue priority band type or accepted values.
- [ ] Update ticket creation paths to accept service priority band explicitly.
- [ ] Update waiting-ticket ordering:
  - `carry_over`
  - `recovery`
  - `checked_in_booking`
  - `normal`
- [ ] Add backend tests for queue ordering with checked-in booking tickets.

---

## 4. Slice 2: Computed Booking Slots

### 4.1 Add slot computation service

- [ ] Add booking slot generator in or near `bookingService.js`.
- [ ] Generate 30-minute slot starts in Asia/Manila local time.
- [ ] Use explicit booking availability blocks when present.
- [ ] Fall back to store hours when no booking availability blocks exist.
- [ ] Apply unavailable exceptions before available exceptions.
- [ ] Support service-specific availability blocks and general blocks.
- [ ] Ensure the selected service duration fully fits the available window.
- [ ] Reject past slots.

### 4.2 Count active booking capacity

- [ ] Add repository method to list or count overlapping active bookings for a tenant/location/service/date range.
- [ ] Treat `pending`, `confirmed`, and `rescheduled` bookings as capacity-consuming.
- [ ] Exclude canceled, completed, reviewed, and disputed bookings from capacity.
- [ ] Include checked-in bookings as capacity-consuming until terminal booking state is reached.
- [ ] Prevent overbooking in booking creation and vendor reschedule, not only in the slot endpoint.

### 4.3 Add slot API

- [ ] Add public/customer-safe slot endpoint for vendor, branch, service, and date.
- [ ] Validate tenant, public profile status, branch, and service.
- [ ] Return only customer-safe slot data:
  - start time
  - end time
  - remaining capacity or availability flag
  - disabled reason if useful for UI
- [ ] Add backend tests for:
  - store-hours fallback
  - explicit availability
  - date exception blocking
  - active booking capacity
  - service duration crossing close time
  - past slot rejection

---

## 5. Slice 3: Booking OTP, SMS Alert Fee, And Creation

### 5.1 Add booking OTP flow

- [ ] Reuse queue OTP patterns without coupling booking verification to queue joins.
- [ ] Add booking OTP repository/table or generalize the existing OTP table safely.
- [ ] OTP must expire after the same practical window as queue OTP unless a different product rule is chosen.
- [ ] Add request, verify, resend behavior.
- [ ] Store verified booking payload or verification token server-side.
- [ ] Ensure booking creation requires verified contact evidence.

### 5.2 Add booking SMS alert fee handling

- [ ] Decide whether to generalize `queue_fee_settings` into notification fee settings or add booking SMS fee settings.
- [ ] Expose platform-managed fee summary to the booking flow.
- [ ] If SMS is enabled and fee applies, require payment before booking creation.
- [ ] If payment is canceled or fails, do not create SMS-enabled booking.
- [ ] Preserve payment reference on the booking.
- [ ] Add platform dashboard follow-up item if fee management UI needs a new section.

### 5.3 Update booking creation

- [ ] Accept verified booking payload or verification token.
- [ ] Persist notification preferences and verification details.
- [ ] Enforce slot availability and capacity inside booking creation.
- [ ] Send booking submitted notification.
- [ ] Keep booking status `pending` after creation.
- [ ] Add regression tests for booking creation without OTP, with OTP, and with SMS fee required.

---

## 6. Slice 4: Customer Booking UI And Customer Actions

### 6.1 Booking request UI

- [ ] Replace datetime input in `BookingRequestPage.tsx` with date + slot selection.
- [ ] Fetch slots when vendor, branch, service, or date changes.
- [ ] Show empty/closed-day states clearly.
- [ ] Add automatic email alert disclosure.
- [ ] Add `Enable SMS alert` control.
- [ ] Show inline SMS fee messaging before OTP/payment.
- [ ] Add OTP step similar to queue join flow.
- [ ] Add SMS payment redirect/sync behavior where needed.
- [ ] Submit booking only after OTP and payment requirements are satisfied.

### 6.2 Customer booking details

- [ ] Add route for customer booking detail.
- [ ] Add customer-scoped booking detail endpoint.
- [ ] Link customer account booking rows to the detail page.
- [ ] Show booking reference, vendor, branch, service, schedule, status, alerts, and payment status.
- [ ] Show check-in instructions for confirmed/rescheduled bookings.
- [ ] Show linked queue ticket number and live queue action only after check-in.
- [ ] Do not imply queue position before check-in.

### 6.3 Customer cancellation

- [ ] Add customer cancel endpoint for own bookings.
- [ ] Allow cancellation only before check-in and only for `pending`, `confirmed`, or `rescheduled`.
- [ ] Add cancellation action to booking details.
- [ ] Notify vendor/customer as appropriate.
- [ ] Add tests for ownership and terminal-state rejection.

---

## 7. Slice 5: Vendor Check-In And Booking-To-Ticket Linkage

### 7.1 Vendor check-in backend

- [ ] Add vendor check-in endpoint.
- [ ] Allow owner, admin, and staff.
- [ ] Enforce tenant ownership and location scope.
- [ ] Allow confirmed/rescheduled bookings.
- [ ] Prevent double check-in.
- [ ] Enforce 15-minute early/late window by default.
- [ ] Support explicit late override.
- [ ] Create a queue ticket with normal ticket number generation.
- [ ] Set `service_priority_band = checked_in_booking`.
- [ ] Carry `notify_by_email` and `notify_by_sms` to the ticket.
- [ ] Skip queue OTP for checked-in booking tickets.
- [ ] Link the booking to the queue ticket.
- [ ] Return updated booking plus ticket summary.

### 7.2 No-show handling

- [ ] Add vendor no-show/cancel action for late bookings.
- [ ] Preserve actor and timestamp.
- [ ] Release slot capacity after no-show/cancel.
- [ ] Notify customer when canceled as no-show.

### 7.3 Queue integration tests

- [ ] Check-in creates one ticket only.
- [ ] Checked-in booking ticket sorts after carry-over/recovery and before normal.
- [ ] Check-in carries notification preferences.
- [ ] Checked-in booking ticket can be called/served through existing lifecycle.
- [ ] Serving linked ticket completes or updates the booking appropriately.

---

## 8. Slice 6: Vendor Dashboard And Live Queue UI

### 8.1 Booking management UI

- [ ] Show check-in action for eligible bookings.
- [ ] Show late check-in override language.
- [ ] Show no-show/cancel action for late bookings.
- [ ] Surface linked queue ticket after check-in.
- [ ] Keep owner/admin-only availability management unchanged.
- [ ] Let staff check in bookings without exposing availability management.

### 8.2 Live queue UI

- [ ] Add `Booking` badge for checked-in booking tickets.
- [ ] Show linked booking reference in row/detail surfaces.
- [ ] Keep one live queue view, not a separate booking lane.
- [ ] Keep public board customer-safe.

### 8.3 Queue ticket customer UI

- [ ] Show inherited email/SMS alert settings as enabled and read-only.
- [ ] Add inline SMS alert copy:

```txt
SMS alerts are active for this visit. You already covered this during booking, so no additional SMS fee is needed.
```

- [ ] Do not show booking SMS payment prompts after check-in.

---

## 9. Slice 7: Verification

### 9.1 Backend validation

- [ ] Run backend booking tests.
- [ ] Run queue lifecycle tests.
- [ ] Run RBAC tests.
- [ ] Run full backend test suite.

Suggested commands:

```bash
npm --workspace backend run test -- --test-name-pattern=booking
npm --workspace backend run test -- --test-name-pattern=queue
npm --workspace backend run test -- --test-name-pattern=permissions
npm run test:backend
```

### 9.2 Typecheck and lint

- [ ] Run frontend typecheck.
- [ ] Run backend typecheck.
- [ ] Run lint.
- [ ] Run build.

Suggested commands:

```bash
npm run typecheck:frontend
npm run typecheck:backend
npm run lint
npm run build
```

### 9.3 Manual smoke tests

- [ ] Customer books from a computed slot with email only.
- [ ] Customer books from a computed slot with SMS enabled and payment completed.
- [ ] Customer cancels before check-in.
- [ ] Vendor confirms and reschedules booking.
- [ ] Vendor checks in booking within the check-in window.
- [ ] Vendor checks in late with override.
- [ ] Checked-in booking appears in live queue with `Booking` badge.
- [ ] Queue ticket page shows inherited notification controls as read-only.
- [ ] Serving the queue ticket updates the linked booking.
- [ ] Public queue board does not expose customer contact details.

---

## 10. Post-MVP Parking Lot

- [ ] Vendor-configurable pending booking expiration.
- [ ] Customer-initiated reschedule requests.
- [ ] Configurable slot intervals.
- [ ] Deposits, refunds, and cancellation penalties.
- [ ] Calendar sync.
- [ ] Service workflow builder.
- [ ] Multi-counter routing with the same ticket number.
- [ ] Branching or parallel service workflows.
- [ ] Branch-specific workflow overrides.
- [ ] AI ETA scheduled-demand forecasting from confirmed future bookings.

---

## 11. Stop Conditions

Stop and reassess if any of these happen:

- Slot generation requires durable slot rows to avoid race conditions.
- Booking SMS fees cannot reuse or cleanly generalize the current platform fee model.
- Staff check-in permissions conflict with existing tenant role boundaries.
- Queue priority changes break carry-over or recovery semantics.
- Booking-to-ticket linkage requires a broader queue lifecycle rewrite.
