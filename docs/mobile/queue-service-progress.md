# Customer queue service progress

Customer account overview, ticket history/detail, and public `focusTicket` responses expose nullable `customerConfirmedAt`, `serviceStartedAt`, `serviceEndedAt`, and `serviceOutcome` fields. Authenticated mobile ticket list/detail responses expose the snake_case equivalents. `serviceOutcome` is `completed`, `interrupted`, or null. Actor identifiers are not included.

Clients derive Confirmed, In service, Completed, and Interrupted labels from these canonical fields. Raw queue status remains unchanged; active/history grouping still follows that status. Explicit service outcomes can be recorded after a queue ticket has already become terminal.

After a changed service transition commits, the backend attempts one customer queue push:

| Vendor action | eventType | tag suffix |
| --- | --- | --- |
| Start service | `customer_queue_service_started` | `service_started` |
| Complete service | `customer_queue_service_completed` | `service_completed` |
| Interrupt service | `customer_queue_service_interrupted` | `service_interrupted` |

The payload preserves `route: "ticket"`, `ticketRef` (lookup code, falling back to ticket ID), a ticket URL (falling back to `/account/tickets`), `notificationId`, and `tag: customer-queue-<ticketId>-<action>`. Clients refetch the API when receiving or opening a push; payloads do not supply authoritative status or service outcome.

Idempotent repeats, rejected actions, and rolled-back transitions do not push. Explicit service completion/interruption replaces the generic served/unserved push for these service actions only. Ordinary queue actions and journey email behavior remain intact. Customer queue alert preferences, configured transports, environment scoping, and authenticated-user eligibility still apply.

Delivery is best effort after commit: provider failure does not undo service, and a repeated service action does not retry a failed push. This implementation requires merge and deployment before mobile can verify real APNs/FCM receipt.
