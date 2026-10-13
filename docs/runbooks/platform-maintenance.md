# Safe maintenance mode

Platform Admin → Service health → Safe maintenance mode. Settings-management permission and recent sign-in/MFA assurance are required to change the policy.

1. Select **Pause new bookings and queue joins**.
2. Optionally select **Show full maintenance screen on public/customer pages**.
3. Enter a customer-friendly public message and a separate private audit reason.
4. Review the server-issued preview, then confirm. The saved status is authoritative; a failed save is not proof maintenance is active.
5. When ready, clear the pause, review and confirm again. This also clears the forced screen.

Default is disabled. Policy, single-use confirmation, revision, idempotent receipt and security audit are saved transactionally. A second admin's update invalidates an old preview. A network retry keeps its operation key; an explicit authorization/revision error requires a fresh review. An uncertain save cannot be dismissed into another review: retry it or use **Check saved status** to reconcile the current saved policy before closing. Discard changes before refreshing an edited form.

## What pauses

- New ordinary bookings, booking-verification starts and booking-SMS checkout starts.
- New customer online/QR joins, verification starts/resends, walk-ins and replacement tickets.
- New queue-fee checkout admissions and production Developer API ticket issuance. Sandbox simulations remain available.

The backend enforces the pause independently of the UI. Booking/ticket insertion, queue-fee checkout admission and booking-SMS checkout admission recheck the policy under a shared row lock in their transaction. Enabling maintenance waits for admitted writes to finish. No per-process policy cache or client-provided bypass is used. New intake returns HTTP 503 with `PLATFORM_MAINTENANCE`, the public message, `Retry-After: 60` and `Cache-Control: no-store`.

## What continues

Existing tickets can be called, confirmed, started, served, cancelled and tracked. Confirmed/rescheduled existing bookings can check in, be managed and finish under their normal authorization, payment, capacity and local queue rules. Provider callbacks, existing queue-fee payment fulfillment, notifications, scheduled reconciliation and audit processing are not shut down. A previously admitted paid booking-SMS checkout may finish its booking only after server validation of the stored payment's paid state and tenant/verified-OTP binding, rechecked under lock; a query parameter or arbitrary payment ID never grants this exemption. Maintenance does not change queue-day intake settings, booking statuses, reservations or resource allocations.

Staff/vendor operational routes and Platform Admin remain available. Ending maintenance does not open a closed queue, undo a vendor pause or bypass normal subscription/capacity/security restrictions.

## Public and customer UI

Safe-only mode displays a notice, including on the frontpage. The optional full screen replaces public/customer discovery and new-intake pages. Sign-in/security, staff operations, secure queue boards, existing ticket tracking, existing booking lists/details and payment-return pages remain accessible so admitted journeys can finish, including the booking-SMS provider return URL. The forced screen preserves the original URL and polls every 15 seconds while open, refreshes on focus, and has **Check again**. Status requests have an eight-second timeout. The screen clears when the saved policy is disabled. Failed refreshes retain the last known active state; backend intake remains authoritative if the status service is unreachable.

The public API exposes only `enabled`, `forceScreen` and the public message, never private audit reasons or session details. Messages render as escaped plain text. Malformed successful responses count as failed refreshes, not proof that maintenance ended. Reconciliation of an uncertain admin save requires that actor's committed operation receipt; a missing receipt remains unknown, even if an ordinary policy read still shows the previous state.

This slice wires the full screen into the web frontpage/customer app; native mobile intake is blocked by the backend, but a native app-wide screen requires the mobile client to consume the status API. The existing web booking page does not initiate or consume the booking-SMS checkout flow; this change keeps its legacy return URL reachable and provides a validated backend continuation for connected callers, not a new web SMS-payment workflow.

## Verification and rollout

Apply `20261013_add_platform_maintenance.sql` through the normal migration runner before deploying callers. Do not run the clean-slate bootstrap against existing data. Never enable production maintenance as a smoke test without an explicitly agreed operational window.

Local regression commands (dedicated loopback `getprio_test` database only):

```bash
MAINTENANCE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:6543/getprio_test \
  node --test backend/tests/platformMaintenance.integration.test.cjs

# Start frontend on 5195 and Platform Dashboard on 5194 in separate terminals.
npm --workspace frontend run dev -- --host 127.0.0.1 --port 5195 --strictPort
VITE_PLATFORM_DATA_SOURCE=fixture npm --prefix platform-dashboard-shadcn run dev -- --host 127.0.0.1 --port 5194 --strictPort
node scripts/test-maintenance-browser.mjs
```

Browser checks use localhost-only API fixtures, not a production account. Existing booking check-in and service completion are exercised by the scoped PostgreSQL booking/service-session regressions. Authentication and CSRF still come from the existing app middleware; route tests inject an authenticated test identity and do not replace deployment/live acceptance.
