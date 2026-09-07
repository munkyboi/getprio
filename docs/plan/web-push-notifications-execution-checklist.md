# Web Push Notifications Execution Checklist

This checklist covers the true OS/browser Web Push pipeline for GetPrio. It is separate from the existing in-app operational alert overlay, which is still required for users who have the dashboard or account page open.

## 1. Scope

- [x] Keep live in-app operational alerts for open vendor/customer screens.
- [x] Add true browser push notifications for users who have granted browser permission.
- [x] Keep email as the baseline fallback when push is denied, unsupported, expired, or fails.
- [x] Start with vendor operational alerts for new queue joins and new booking intake.
- [x] Extend to customer booking and queue status alerts after the push pipeline is proven.
- [x] Do not reintroduce SMS payment prompts or per-SMS customer fees.

## 2. Terminology

- **In-app operational alert**: React/Mantine alert shown while the app is open, currently driven by SSE, background queries, and dashboard state.
- **Browser permission**: The browser-level `Notification.permission` state requested from a logged-in user.
- **Push subscription**: The browser-generated endpoint and keys created by `PushManager.subscribe(...)`.
- **Web Push delivery**: Backend-triggered OS/browser notification delivery through the Push API using VAPID keys.

## 3. Backend Foundation

- [x] Add backend dependency for Web Push delivery, such as `web-push`.
- [x] Add environment variables:
  - [x] `VAPID_PUBLIC_KEY`
  - [x] `VAPID_PRIVATE_KEY`
  - [x] `VAPID_SUBJECT`
- [x] Document local key generation and deployment secret setup.
- [x] Add a `push_subscriptions` table with:
  - [x] `id`
  - [x] `user_id`
  - [x] optional `tenant_id`
  - [x] `endpoint`
  - [x] `p256dh`
  - [x] `auth`
  - [x] `user_agent`
  - [x] `last_success_at`
  - [x] `last_failure_at`
  - [x] `failure_count`
  - [x] `is_active`
  - [x] `created_at`
  - [x] `updated_at`
- [x] Add a unique index for active subscription endpoints.
- [x] Ensure subscription rows are tied to authenticated users and tenant access, not anonymous browser state.

## 4. API Routes

- [x] Add `GET /api/push/vapid-public-key`.
- [x] Add authenticated `POST /api/account/push-subscriptions`.
- [x] Add authenticated `DELETE /api/account/push-subscriptions/:id`.
- [x] Add vendor-aware subscription metadata so vendor staff/admin subscriptions can be matched to tenant alerts.
- [x] Validate subscription payload shape server-side.
- [x] Deactivate stale subscriptions when push delivery returns `404` or `410`.
- [x] Add backend tests for create, update, deactivate, tenant scoping, and invalid payload handling.
  - Covered by `backend/tests/customerAccount.test.cjs` route tests for `POST /api/account/push-subscriptions` and `DELETE /api/account/push-subscriptions/:subscriptionId`.

## 5. Frontend Service Worker

- [x] Add `frontend/public/service-worker.js`.
- [x] Handle the `push` event and show a notification with title/body/icon/data.
- [x] Handle `notificationclick` and open/focus the relevant GetPrio URL.
- [x] Keep notification payloads customer-safe and vendor-role-safe.
- [x] Avoid embedding sensitive customer details in push payloads; use references and safe summary text.

## 6. Frontend Subscription Flow

- [x] Add a shared push-notification helper module for:
  - [x] service worker registration
  - [x] browser capability checks
  - [x] permission request
  - [x] VAPID key fetch
  - [x] `PushManager.subscribe(...)`
  - [x] subscription save/delete API calls
- [x] Wire the helper into customer notification settings.
- [x] Wire the helper into vendor notification settings.
- [x] Preserve current behavior when permission is denied: do not block booking or queue submission if email fallback is enabled.
- [x] Show clear unsupported/insecure-context messaging for non-HTTPS origins outside localhost.
- [x] Keep existing in-app alerts active even when Web Push is enabled.

## 7. Alert Event Wiring

- [x] Send vendor push notification for new queue joins.
- [x] Send vendor push notification for new booking intake.
- [x] Send vendor push notification for payment proof review when enabled.
- [x] Send customer push notification for booking confirmed, rescheduled, canceled, no-show, checked in, and completed.
  - Customer booking pushes now cover confirmed, rescheduled, canceled, no-show, checked-in, and payment-rejected booking updates. Completed checked-in bookings are covered through the linked queue ticket served update.
- [x] Send customer push notification for queue status changes where browser alerts are enabled.
  - Customer queue pushes now cover called, served, skipped, cancelled, and requeued ticket updates for authenticated customer-owned tickets.
- [x] Respect customer account notification settings.
- [x] Respect tenant/vendor notification settings.
- [x] Respect role authorization for vendor staff versus vendor admin.
- [x] Rate-limit or de-duplicate sends so one event does not create repeated OS notifications.

### Full event coverage backlog

Queue events:

- [x] New queue join. Recipient: Vendor.
- [x] Queue cancelled. Recipient: Customer.
- [x] Near-turn alert. Recipient: Customer.
- [x] Queue closed. Recipient: Customer + Vendor.
- [x] Queue re-opened. Recipient: Customer + Vendor.
- [x] Queue overflowed or auto-paused. Recipient: Vendor.
- [x] Queue missed or skipped. Recipient: Customer.
- [x] Queue called. Recipient: Customer.
- [x] Queue served or completed. Recipient: Customer.
- [x] Queue skipped or requeued. Recipient: Customer.
- [x] Queue paused or resumed. Recipient: Vendor.
- [x] Queue carried over after close. Recipient: Customer.

Booking events:

- [x] New booking. Recipient: Vendor.
- [x] Booking cancelled. Recipient: Customer.
- [x] Booking re-scheduled. Recipient: Customer.
- [x] Payment proof validated or verified. Recipient: Customer.
- [x] Payment proof rejected cancellation. Recipient: Customer.
- [x] Booking check-in reminder when the check-in window opens. Recipient: Customer.
- [x] Booking check-in window almost closing, 5 minutes before close. Recipient: Customer.
- [x] Booking check-in missed or no-show. Recipient: Customer.
- [x] Booking converted to queue. Recipient: Customer.
- [x] Booking confirmed. Recipient: Customer.
- [x] Booking pending expiration. Recipient: Customer.
- [x] Booking completed after linked queue ticket is served. Recipient: Customer.

Check-in reminder and pending-expiration pushes are emitted from the existing booking scan paths (`expirePendingBookingsForTenant`, `expirePendingBookingsForCustomer`, and account/vendor booking reads), not from a standalone background scheduler.

## 8. Security And Privacy

- [x] Require authentication for subscription creation and deletion.
- [x] Never expose push subscription records to other users or tenants.
- [x] Do not include full phone numbers, emails, payment proof URLs, internal notes, or sensitive dispute text in push payloads.
- [x] Use short notification bodies that route users back into authenticated pages for details.
- [x] Log send attempts without storing sensitive payload content.
- [x] Treat push as best-effort; failed push must not fail booking, queue, or payment state transitions.
- [x] Confirm browser notification permission is explicit and revocable.

## 9. Testing

- [x] Add backend unit tests for subscription repository/service behavior.
- [x] Add backend unit tests for stale subscription deactivation after push failure.
- [x] Add frontend tests for capability detection and permission-state messaging.
- [x] Add smoke coverage for settings pages showing Web Push status.
- [ ] Manually verify on localhost:
  - [x] permission prompt appears only after user action
    - 2026-07-03 headed persistent-Chrome check: customer notification settings loaded with `Notification.permission = default`, the `Allow browser notifications` button visible, and zero `/api/account/push-subscriptions` requests before clicking the button.
  - [x] subscription is stored server-side
    - 2026-07-03 headed persistent-Chrome check: customer settings click stored an active subscription with `tenantId: null` through `POST /api/account/push-subscriptions`; vendor settings `Notifications` tab click stored an active tenant-scoped subscription with `tenantId: 12`.
  - [ ] new queue join produces an in-app alert and OS/browser notification
    - 2026-07-03 smoke: queue join `PB001` / lookup `59AD1ADA` was created and Web Push delivery was accepted by the push provider; visual OS notification and click-through still need human confirmation.
    - 2026-07-03 headed persistent-Chrome follow-up: vendor-created queue ticket `PB002` / lookup `656EBA00` updated tenant subscription `id=21` with `last_success_at=2026-07-03 08:41:55.36791+00` and `failure_count=0`; visual OS notification and click-through still need human confirmation.
  - [ ] new booking produces an in-app alert and OS/browser notification
    - 2026-07-03 smoke: booking `BKG-9246181C` was created and Web Push delivery was accepted by the push provider; visual OS notification and click-through still need human confirmation.
  - [ ] clicking a push notification routes to the correct dashboard/account page
  - [ ] denied permission leaves email fallback and in-app alerts working
  - Automated API/page smoke now covers VAPID metadata, service worker availability, customer notification settings, and vendor notification settings. Visual OS notification display and click-through still require headed browser/desktop confirmation.
  - 2026-07-03 smoke: `npm run smoke` passed against local backend/frontend/platform services; vendor booking reschedule-slot smoke skipped because the local fixture booking was not reschedulable.

## 10. Deployment

- [ ] Generate production VAPID keys outside the repo.
- [ ] Add VAPID secrets to the deployment environment.
- [ ] Confirm production frontend is served over HTTPS.
- [ ] Confirm service worker scope covers the frontend routes.
- [x] Add rollback notes for disabling Web Push sends without disabling in-app alerts.
