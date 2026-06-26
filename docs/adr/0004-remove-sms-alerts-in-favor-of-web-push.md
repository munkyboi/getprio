# Remove SMS alerts in favor of web push

GetPrio will remove SMS from the customer alert model entirely. Booking alerts and queue-day alerts will use email and browser web push instead, with web push enabled only after explicit user permission and email remaining available as the baseline fallback.

We chose this because SMS adds a separate phone-number-based channel, plan entitlement rules, and per-send fee handling that complicate the notification model without improving the core capstone flow. Web push better matches the logged-in web app experience, supports both customer and vendor operational alerts, and keeps notification settings centered on account-controlled preferences rather than phone billing.
