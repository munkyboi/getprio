# Upcoming booking reminders

The existing queue lifecycle worker scans once a minute (and at startup) for 24-hour and 1-hour reminders before the scheduled start. PostgreSQL supplies the clock. Each stage has a 10-minute delivery window; later missed stages expire, rather than creating a historical burst. A booking confirmed or rescheduled after a stage's due point skips that stage. Existing bookings become reminder-eligible at migration time, so only subsequent due points are scheduled.

Eligible bookings are confirmed/rescheduled, unarrived, without a linked queue ticket, with payment status `unpaid` or `paid`, an active tenant/location, and an active account with bookingAlerts enabled. This uses the server's booking payment enum: rejected proof is `failed` with rejection metadata and is excluded. A reminder does not assert payment verification or grant check-in permission. Booking/payment/check-in/resource contracts and frozen plans remain unchanged.

A notification-owned trigger tracks schedule revision and eligibility time on the booking. Start, customer, tenant/location or eligibility changes produce a new reminder identity. A-to-B-to-A reschedules cannot resurrect the first schedule's intent. These revisions do not establish resource writer coverage or advance resource readiness.

The shared dispatcher reserves the first and every fifth job slot for booking reminders, choosing the earliest reminder expiry first. Other slots prefer ordinary queue notifications; either class fills a slot when the preferred class has no claimable work. If a run processes only its first reminder, the worker prefers queue traffic in the next run's first slot so repeated one-job runs cannot starve queues. This preserves queue throughput while keeping reminder slots reachable under sustained queue traffic or slow deliveries. It claims one job at a time and starts no further jobs after a 15-second batch budget. Reminder FCM receives the remaining budget capped at 10 seconds; database row-lock waits time out after one second. Capacity remains bounded, so reminders can still expire when reminder demand itself exceeds available delivery capacity.

Each stage has one durable queue-outbox intent keyed by `booking:<id>:schedule:<revision>:reminder:<24h|1h>`. Concurrent schedulers use database uniqueness. Dispatch rereads ownership, schedule revision, status, payment, arrival, account preferences and expiry after its user/booking lock waits. It takes no branch/resource lock during delivery. A concurrent reschedule/cancellation waits for the booking read lock; accepted push delivery before that change cannot be retracted afterward. The external FCM batch is capped at 10 seconds and at the remaining due-window duration. Reminders use mobile FCM plus account inbox, not a new email/Web Push path.

The eligibility-checked inbox row commits in its own transaction before FCM delivery, including when no device is registered. A separate delivery transaction revalidates eligibility after capture; cancellation or rescheduling between phases suppresses the push. Already captured history remains a historical alert, not a statement of current booking state. Existing per-installation delivery records keep accepted/stale devices out of subsequent retries. Transient/unconfigured-provider failures retain retryable devices and reuse the same inbox identity. Outbox `sent` means processing finished, not that every device received a notification. FCM acceptance and database commits are not distributed atomic: a crash after provider acceptance but before database progress commits can cause a repeat with the same notification ID. No exactly-once device delivery promise is made.

Provider-deactivated registrations are recorded as stale even when FCM reports a failed outcome. Previously pending deliveries whose registration is inactive are retired before claiming, without leaving an inactive device leased for another retry. Active transient failures remain pending. Invalid legacy location timezones fall back to the scheduled UTC ISO timestamp, preserving the visible reminder instead of retrying a formatting error until expiry.

## Mobile contract

- Visible `eventType`: `customer_booking_reminder_24h` or `customer_booking_reminder_1h`.
- Existing `route`/`url`: `/account/bookings/<booking-id>`, with exact string IDs.
- Existing `notificationId` and `tag`: stable canonical reminder identity.
- Title: `Upcoming booking`. Body includes booking reference/vendor and scheduled local date/time in the location timezone.
- The inbox retains its current id/title/body/createdAt/readAt contract. Explicit push taps may navigate through an authenticated booking fetch; foreground receipts must not force navigation.

## Operations and validation

Run migration `20261013_02_add_booking_reminder_schedule.sql` before backend startup. `BOOKING_REMINDERS_ENABLED=false` disables reminder enqueue and suppresses existing pending reminder dispatch. The default enables scheduling when the reviewed backend is deployed. Account deletion makes booking intents obsolete and deletes inbox content. Existing queue dispatcher retry/lease recovery remains in use; reminder scan failure does not stop unrelated queue notifications.

CI prepares local disposable `getprio_reminders_test` using `BOOKING_REMINDER_TEST_DATABASE_URL`. Real PostgreSQL tests cover concurrent enqueue, short notice/missed windows, schedule revision reuse, mutation lock waits, preferences/payment/check-in/deletion, partial-device retry/inbox dedupe, expired leases, exact BIGINT IDs, and provider failures. No production mutation or live provider acceptance is included in those tests.
