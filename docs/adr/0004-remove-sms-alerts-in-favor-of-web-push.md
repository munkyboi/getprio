# Remove SMS alerts in favor of web push

GetPrio will remove SMS from the customer alert model entirely. Booking alerts and queue-day alerts will use email and browser web push instead, with web push enabled only after explicit user permission and email remaining available as the baseline fallback.

We chose this because SMS adds a separate phone-number-based channel, plan entitlement rules, and per-send fee handling that complicate the notification model without improving the core capstone flow. Web push better matches the logged-in web app experience, supports both customer and vendor operational alerts, and keeps notification settings centered on account-controlled preferences rather than phone billing.

## Implementation status

As of the Web Push implementation follow-up, GetPrio has browser notification permission/preferences UI, live in-app operational alerts, service worker handling, Push API subscription storage, VAPID configuration, backend push sends, stale subscription cleanup, customer booking/queue alerts, and vendor operational alerts.

The execution checklist for verification, deployment setup, and remaining manual browser confirmation is `docs/plan/web-push-notifications-execution-checklist.md`.
