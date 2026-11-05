# Mobile queue email verification and joined notifications

Both authenticated mobile join endpoints now start email verification:

- `POST /api/mobile/queue-join` resolves a QR ID.
- `POST /api/mobile/queue-join/direct` resolves the vendor and selected location slug.

They return `otpRequired: true`, `otpId`, `deliveryTarget`, `expiresAt`,
`resendAvailableAt`, `resendsRemaining`, `tenantSlug`, and `locationSlug`.
They create neither a ticket nor a payment attempt. The destination is the
signed-in customer's account email, not a client-supplied address.

`POST /api/mobile/queue-join/otp/verify` accepts `otpId` and `code`.
`POST /api/mobile/queue-join/otp/resend` accepts `otpId` and returns a replacement
challenge. All POSTs require an `Idempotency-Key`. Verification and resend check
challenge ownership and resolve the original vendor/location from stored data.
Queue availability is rechecked before proceeding. The existing queue OTP service
enforces expiry, incorrect-attempt limits, resend cooldowns, and lockouts.

Successful verification creates a free ticket or returns the existing mobile
checkout response format for a paid queue. Paid tickets are still issued only
once payment is confirmed. Email verification does not enable email/SMS queue
notification preferences.

New free and paid tickets send a customer push after the ticket transaction
commits, subject to the customer's queue-alert preference and push registration:

- Title: `Joined queue`
- Body: `You joined the queue at {vendor}. Your ticket number is {ticket}.`
- Event: `customer_queue_joined`
- Destination: the issued ticket page.

Repeated activation of an already-issued paid ticket does not send the joined
push again. Push delivery errors are logged without rejecting the completed join.

## Release coordination

Deploy with the compatible Flutter build that supports the email challenge
response and OTP verification/resend screens. Older mobile builds expect an
immediate ticket or payment response and cannot complete this updated flow.
No vendor dashboard UI changes or database migrations are part of this change.
Real mailbox delivery, paid checkout, and foreground/background device push
acceptance must be verified against the deployed API and compatible app build.
