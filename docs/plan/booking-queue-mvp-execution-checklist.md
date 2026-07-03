# Booking and Queue MVP Execution Checklist

This checklist converts `docs/plan/booking-queue-mvp-prd.md` into an implementation sequence for the current GetPrio codebase.

The goal is to replace free-form booking datetime entry with computed slots, add booking OTP and notification preference handling, and connect confirmed bookings to the live queue only when a vendor-side user checks the customer in.

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
- queue join OTP and notification preference behavior already exist

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

Booking OTP, notification preferences, and booking creation.

### Slice 4

Customer booking detail, cancellation, and booking request UI.

### Slice 5

Vendor check-in, no-show handling, and booking-to-ticket linkage.

### Slice 6

Vendor dashboard and live queue UI polish.

### Slice 7

End-to-end tests, regression tests, and runtime verification.

Current status:

- Slice 1: complete
- Slice 2: complete
- Slice 3: complete
- Slice 4: complete
- Slice 5: backend done
- Slice 6: vendor dashboard/live queue done; customer ticket UI pending
- Slice 7: automated verification passed; manual smoke tests pending

Recent booking/payment additions already in scope for the MVP deployment:

- manual QR booking payment with private proof upload through the backend
- vendor payment-proof review and verify/reject actions
- customer booking detail refresh on booking updates
- 15-minute pending booking expiration that stops once proof is submitted
- vendor dashboard booking pagination and section-gated live refresh

Recommended first implementation milestone: **Slice 1 + Slice 2 backend tests passing before touching the customer slot UI.**

---

## 3. Slice 1: Data Contracts And Queue Priority

### 3.1 Add booking fields

- [x] Add migration for booking notification/check-in linkage fields.
- [x] Mirror schema changes in `database/init.sql`.
- [x] Add booking notification preferences:
  - `notify_by_email`
  - `notify_by_browser_notification`
  - `browser_notification_opt_in_at`
  - `contact_verified_at`
  - `contact_verification_channel`
- [x] Add queue linkage fields:
  - `queue_ticket_id`
  - `checked_in_at`
  - `checked_in_by_user_id`
  - `no_show_at`
  - `no_show_by_user_id`
- [x] Add indexes for customer booking detail and vendor day/check-in views.

### 3.2 Add booking-to-ticket contracts

- [x] Extend `shared/types.ts` with booking detail response shape.
- [x] Add linked ticket summary fields to customer/vendor booking summaries.
- [x] Add booking slot request/response contracts.
- [x] Add booking OTP request/verify contracts.
- [x] Add vendor check-in request/response contracts.
- [x] Add customer cancellation response contract.

### 3.3 Add checked-in booking priority

- [x] Add `checked_in_booking` to the queue priority band type or accepted values.
- [x] Update ticket creation paths to accept service priority band explicitly.
- [x] Update waiting-ticket ordering:
  - `carry_over`
  - `recovery`
  - `checked_in_booking`
  - `normal`
- [x] Add backend tests for queue ordering with checked-in booking tickets.

---

## 4. Slice 2: Computed Booking Slots

### 4.1 Add slot computation service

- [x] Add booking slot generator in or near `bookingService.js`.
- [x] Generate slot starts in Asia/Manila local time using the full requested duration as the interval.
- [x] Support booking quantity as a multiplier for the reserved service duration.
- [x] Gate booking quantity behind per-service vendor catalog settings and label.
- [x] Use explicit booking availability blocks when present.
- [x] Fall back to store hours when no booking availability blocks exist.
- [x] Apply unavailable exceptions before available exceptions.
- [x] Support service-specific availability blocks and general blocks.
- [x] Ensure the selected service duration fully fits the available window.
- [x] Reject past slots.

### 4.2 Count active booking capacity

- [x] Add repository method to list or count overlapping active bookings for a tenant/location/service/date range.
- [x] Treat `pending`, `confirmed`, and `rescheduled` bookings as capacity-consuming.
- [x] Exclude canceled, completed, reviewed, and disputed bookings from capacity.
- [x] Include checked-in bookings as capacity-consuming until terminal booking state is reached.
- [x] Prevent overbooking in booking creation and vendor reschedule, not only in the slot endpoint.

### 4.3 Add slot API

- [x] Add public/customer-safe slot endpoint for vendor, branch, service, and date.
- [x] Validate tenant, public profile status, branch, and service.
- [x] Return only customer-safe slot data:
  - start time
  - end time
  - remaining capacity or availability flag
  - disabled reason if useful for UI
- [x] Add backend tests for:
  - store-hours fallback
  - explicit availability
  - date exception blocking
  - active booking capacity
  - service duration crossing close time
  - past slot rejection

---

## 5. Slice 3: Booking OTP, Notification Preferences, And Creation

### 5.1 Add booking OTP flow

- [x] Reuse queue OTP patterns without coupling booking verification to queue joins.
- [x] Add booking OTP repository/table or generalize the existing OTP table safely.
- [x] OTP must expire after the same practical window as queue OTP unless a different product rule is chosen.
- [x] Add request, verify, resend behavior.
- [x] Store verified booking payload or verification token server-side.
- [x] Ensure booking creation requires verified contact evidence.

### 5.2 Add booking browser notification handling

- [x] Expose browser notification permission state to the booking flow.
- [x] If browser notifications are denied, keep booking creation working with email fallback.
- [x] Preserve notification preference state on the booking.
- [x] Add platform dashboard follow-up item if notification management UI needs a new section.

Note: this section covers booking-flow permission and preference handling only. The true OS/browser Web Push delivery pipeline is tracked separately in `docs/plan/web-push-notifications-execution-checklist.md`.

### 5.3 Update booking creation

- [x] Accept verified booking payload or verification token.
- [x] Persist notification preferences and verification details.
- [x] Enforce slot availability and capacity inside booking creation.
- [x] Send booking submitted notification.
- [x] Keep booking status `pending` after creation.
- [x] Add regression tests for booking creation without OTP, with OTP, and with notification preferences applied.

---

## 6. Slice 4: Customer Booking UI And Customer Actions

### 6.1 Booking request UI

- [x] Replace datetime input in `BookingRequestPage.tsx` with date + slot selection.
- [x] Fetch slots when vendor, branch, service, or date changes.
- [x] Show empty/closed-day states clearly.
- [x] Add automatic email alert disclosure.
- [x] Add browser notification controls.
- [x] Show inline browser notification messaging before OTP.
- [x] Add OTP step similar to queue join flow.
- [x] Remove SMS payment redirect/sync behavior from the booking flow.
- [x] Submit booking only after OTP and payment requirements are satisfied.

### 6.2 Customer booking details

- [x] Add route for customer booking detail.
- [x] Add customer-scoped booking detail endpoint.
- [x] Link customer account booking rows to the detail page.
- [x] Show booking reference, vendor, branch, service, schedule, status, alerts, and payment status.
- [x] Show check-in instructions for confirmed/rescheduled bookings.
- [x] Show linked queue ticket number and live queue action only after check-in.
- [x] Do not imply queue position before check-in.

### 6.3 Customer cancellation

- [x] Add customer cancel endpoint for own bookings.
- [x] Allow cancellation only before check-in and only for `pending`, `confirmed`, or `rescheduled`.
- [x] Add cancellation action to booking details.
- [x] Notify vendor/customer as appropriate.
- [x] Add tests for ownership and terminal-state rejection.

---

## 7. Slice 5: Vendor Check-In And Booking-To-Ticket Linkage

### 7.1 Vendor check-in backend

- [x] Add vendor check-in endpoint.
- [x] Allow owner, admin, and staff.
- [x] Enforce tenant ownership and location scope.
- [x] Allow confirmed/rescheduled bookings.
- [x] Prevent double check-in.
- [x] Enforce 15-minute early/late window by default.
- [x] Support explicit late override.
- [x] Create a queue ticket with normal ticket number generation.
- [x] Set `service_priority_band = checked_in_booking`.
- [x] Carry `notify_by_email` and browser notification preference to the ticket.
- [x] Skip queue OTP for checked-in booking tickets.
- [x] Link the booking to the queue ticket.
- [x] Return updated booking plus ticket summary.

### 7.2 No-show handling

- [x] Add vendor no-show/cancel action for late bookings.
- [x] Preserve actor and timestamp.
- [x] Release slot capacity after no-show/cancel.
- [x] Notify customer when canceled as no-show.

### 7.3 Queue integration tests

- [x] Check-in creates one ticket only.
- [x] Checked-in booking ticket sorts after carry-over/recovery and before normal.
- [x] Check-in carries notification preferences.
- [x] Checked-in booking ticket can be called/served through existing lifecycle.
- [x] Serving linked ticket completes or updates the booking appropriately.

---

## 8. Slice 6: Vendor Dashboard And Live Queue UI

### 8.1 Booking management UI

- [x] Show check-in action for eligible bookings.
- [x] Show late check-in override language.
- [x] Show no-show/cancel action for late bookings.
- [x] Surface linked queue ticket after check-in.
- [x] Keep owner/admin-only availability management unchanged.
- [x] Let staff check in bookings without exposing availability management.

### 8.2 Live queue UI

- [x] Add `Booking` badge for checked-in booking tickets.
- [x] Show linked booking reference in row/detail surfaces.
- [x] Keep one live queue view, not a separate booking lane.
- [x] Keep public board customer-safe.

### 8.3 Queue ticket customer UI

- [ ] Show inherited email/browser notification settings as enabled and read-only.
- [ ] Add inline browser notification copy.
- [ ] Do not show booking notification prompts after check-in.

### 8.4 Vendor operational alert overlay

- [x] Keep live in-app alerts for new queue joins while the vendor dashboard is open.
- [x] Keep live in-app alerts for new pending bookings while the vendor dashboard is open.
- [x] Stack queue and booking alerts in the same bottom-center dashboard overlay.
- [x] Persist dismissed queue and booking alert IDs per tenant/location for the browser session.
- [ ] Keep this in-app overlay active after true Web Push delivery is added.

---

## 9. Slice 7: Verification

### 9.1 Backend validation

- [x] Run backend booking tests.
- [x] Run queue lifecycle tests.
- [x] Run RBAC tests.
- [x] Run full backend test suite.

Suggested commands:

```bash
npm --workspace backend run test -- --test-name-pattern=booking
npm --workspace backend run test -- --test-name-pattern=queue
npm --workspace backend run test -- --test-name-pattern=permissions
npm run test:backend
```

### 9.2 Typecheck and lint

- [x] Run frontend typecheck.
- [x] Run backend typecheck.
- [x] Run lint.
- [x] Run build.

Suggested commands:

```bash
npm run typecheck:frontend
npm run typecheck:backend
npm run lint
npm run build
```

### 9.3 Manual smoke tests

- [ ] Customer books from a computed slot with email only.
- [ ] Customer books from a computed slot with browser notifications enabled.
- [ ] Customer submits manual QR payment proof through the backend upload route.
- [ ] Vendor reviews and verifies or rejects payment proof from the dashboard.
- [ ] Customer booking detail refreshes after vendor-side updates without a manual reload.
- [ ] Pending booking expires at 15 minutes when no proof was submitted.
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
- Notification preferences should not depend on a fee model.
- Staff check-in permissions conflict with existing tenant role boundaries.
- Queue priority changes break carry-over or recovery semantics.
- Booking-to-ticket linkage requires a broader queue lifecycle rewrite.
