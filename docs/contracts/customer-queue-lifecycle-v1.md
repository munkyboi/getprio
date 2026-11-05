# Customer queue lifecycle v1

Read-only projection for ordinary GetPrio customer tickets. Existing ownership,
tracking-credential and environment checks continue to apply.

Endpoints and envelopes:

- `GET /api/mobile/tickets`: `tickets[].queue_lifecycle`
- `GET /api/mobile/tickets/:ticketId`: `ticket.queue_lifecycle`
- `GET /api/account/overview` and `/api/account/history`: `tickets[].queueLifecycle`
- Existing public tenant/location queue lookup and live tracking snapshots:
  `focusTicket.queueLifecycle` (lookup credential required).

The value is `{ version: 1, state, resourceWait: null }` or `null` when unsupported.
`version` identifies the projection schema, not a ticket revision or capability
to issue commands. Developer API tickets do not claim this contract.

State mapping, in priority order:

| Evidence | state |
| --- | --- |
| serviceStartedAt present, serviceEndedAt absent | in_service |
| served, cancelled, unserved, expired | terminal |
| skipped | recovery |
| pending_carry_over | pending_carry_over |
| waiting | waiting |
| called | called |
| unknown status | unsupported (`null` projection) |

Preserve raw status, service timing/outcome and existing customer eligibility
fields. Queue closure may make a ticket terminal while actual service continues;
the explicit unfinished service state takes precedence for display, not eligibility.

No durable customer resource-wait reason is currently recorded. `resourceWait:
null` means unavailable, not evidence that capacity is available or that no wait
exists. Consumers must not manufacture a wait code/message or countdown.

Published is a Vendor plan state, not a separate issued customer ticket state.
This projection does not expose plan publication, reservation IDs, internal
resource revisions, command eligibility, or idempotency keys.
