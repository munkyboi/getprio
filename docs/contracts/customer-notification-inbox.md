# Customer notification inbox

Account-synchronized history for new visible customer notifications, retained for 90 days. No old push history is backfilled. Customer booking/queue notification preferences continue to apply. Silent movement/refetch signals and vendor tenant alerts are excluded. Content is stored before device delivery, including when no device is registered or push is unconfigured. Notification history records an alert, not proof of device delivery or current ticket/booking state.

Both `/api/account` and `/api/v1/account` mounts expose the endpoints. Existing authenticated session, deletion/suspension checks and cookie CSRF protection apply. The server derives user identity exclusively from authentication.

- `GET /notifications?cursor=<opaque>` returns `{notifications:[{id,title,body,createdAt,readAt}],unreadCount,totalCount,nextCursor,snapshotCutoff}`. Page size 50, newest numeric ID first; timestamps serialize as ISO strings, unread `readAt` is null. Unread and total counts cover all currently visible retained notifications for the authenticated account, including arrivals after the page boundary. `totalCount` includes read notifications and excludes cleared/expired rows; it is not the page length. Reading does not reduce total count. Mutations retain their existing `{unreadCount}` response; refresh the list after read/clear actions for the current summary.
- `POST /notifications/:id/read` marks an owned retained notification read. Repeated reads, absent/cleared IDs and foreign IDs are no-ops with no foreign data disclosed.
- `POST /notifications/read-all` with `{before:snapshotCutoff}` marks notifications at or below the original boundary read.
- `POST /notifications/clear` with `{before:snapshotCutoff}` clears notifications at or below that boundary. Content is erased; dedupe tombstones expire on the original 90-day schedule. Delivery audit rows are unchanged.
- Mutations return `{unreadCount}`. Invalid cursor/cutoff/ID returns 400; unauthenticated requests return 401. List responses use `Cache-Control: no-store`.

Cursor and cutoff are opaque signed account-bound strings, not timestamps. Keep the first page's cutoff during pagination. Refresh after mutation; never rebuild tokens in the client. Inserts and reads lock the account row before allocating IDs/establishing boundaries. Concurrent later notifications survive bulk read/clear, including operations from another device. Clearing does not reset notification IDs or allow retry duplicates to reappear.

Producer IDs are distinct from collapse tags. Caller-supplied notification IDs dedupe durably per user. Ordinary direct sends generate a fresh ID and preserve the existing two-minute tag suppression. Lifecycle Web Push/FCM outbox channels share an event key for inbox dedupe while existing FCM installation delivery IDs/retries remain intact. Pending intents older than migration rollout are excluded from inbox capture. Direct notification paths retain their existing postcommit/best-effort delivery behavior; this change does not introduce a transactional alert outbox for those paths.

Expired rows disappear from reads immediately; an hourly bounded sweep deletes up to 10,000 expired rows including tombstones. Account deletion requests erase owned inbox rows immediately; the user FK also cascades final deletion. New alerts are suppressed for accounts with deletion requested. Run migration before starting the new backend. No client-local fallback or store deployment is included.

## Verification

`NOTIFICATION_INBOX_TEST_DATABASE_URL` must point to local disposable `getprio_inbox_test`. Run `node scripts/prepare-notification-inbox-test.cjs`, then `node --test backend/tests/customerNotificationInbox.integration.test.cjs`. CI prepares and runs this database test. It covers real authenticated routes, ownership, retry tombstones, retention, pagination, a concurrent insertion boundary, and account deletion. Producer tests cover visible persistence without configured push and persistence before failed delivery.
