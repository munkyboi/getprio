# Optional service timing

## Scope

Generic branch opt-in: Locations → Edit location → Service timing → Track service start and completion. Default off; existing vendors retain Call next → Serve customer. Location management permissions control opt-in, and queue location access plus `tenant.ticket.update_state` control observations.

Enabled branches use Call next → confirm the ticket where required → Start service → Complete service. Calling remains a summons, not proof of service start. These are staff-recorded observations; there is no resource reservation/allocation, no automatic end at the booked duration, no wait estimate change, and no inference from historical called/served timestamps. Developer API independent queues and native mobile UI are outside this slice.

## Server contract

- `POST /api/vendor/tenant/:tenantSlug/queue/tickets/:ticketId/service/start`, `/complete`, `/interrupt`, with the existing `?location=...` selector. No client-supplied timestamps, actors, duration, or tenant IDs.
- Start requires an opted-in branch, a scoped called ticket, and customer confirmation for non-vendor joins. The start is recorded once under a ticket lock, with the setting read under a branch lock. The booked-start calling gate remains in force.
- Complete/interruption requires a recorded start. Same-outcome retries return the existing result; a conflicting retry returns 409. A stale tab always targets its original ticket ID.
- While service is active, legacy Serve/Skip cannot discard the observation. Complete marks a still-called ticket served and resolves its linked booking through the existing completion fields. Interrupt marks a still-called ticket unserved, retains existing booking semantics, and excludes the observation from completed duration samples.
- Queue closure and changing the setting do not imply service ended. If queue closure already made the ticket terminal, staff resolve the remaining timing record from Unfinished service records, even on a closed queue or disabled branch. The existing queue/booking outcome is preserved. Completion after queue resolution is reported separately by the audit; it must be reviewed before training.
- Unfinished records show the oldest 100, across business dates at the selected branch, without customer identities. Resolving them exposes later records. Staff timing recovery records are stripped from public and customer queue responses/streams.
- `service_started`, `service_completed`, `service_interrupted` events record authenticated actors. End clocks are recorded when staff act, so delayed entry can bias observations. One timing record per ticket; another service requires a new ticket.

## Read-only audit

After migration/deployment, use the intended host/database and exact vendor/location slugs:

```sh
cd /var/www/getprio
DATABASE_HOST=localhost DATABASE_NAME=getprio \
node scripts/service-timing-audit.mjs \
  --vendor-slug pickle-bois-burgadols \
  --location-slug main \
  --from 2026-10-03T00:00:00Z \
  --to 2026-10-04T00:00:00Z
```

The configured connection must match both expected values. The audit uses a read-only repeatable-read transaction, bounded UTC windows, query timeouts, and no customer names/contact details. It reports started/completed/interrupted/unfinished records and completed mean/median durations by service start window. It does not measure resource occupancy or validate any model.

## Verification gates

Focused type checks, lint, whitespace review, and hosted CI are separate from runtime acceptance. No local test suite or migration is run for this implementation request. Local services require the ignored GetPrio environment from Bitwarden; CLI authentication remains unavailable.

Before enabling on a live branch, verify in an isolated environment: opt-in/off, role/branch denial, ticket confirmation, duplicate start/finish, conflicting outcomes, stale-ticket requests, concurrent start versus Serve/Skip/close, branch setting changes, explicit interruption, completion after closure, booking fulfillment, and walk-ins. Inspect actions, notices, settings and confirmation modal on mobile/tablet/desktop and keyboard/short-height layouts. Verify SSE updates and read-only audit results. An explicit delayed completion is not proof of accurate service time.

## Next

Configure resource pools/requirements and implement transactional allocations before enabling resource tracking. Preserve generic names and simple vendor workflows. Resource tracking remains disabled by its existing database constraint. Customer wait predictions require separate coverage and temporal holdout validation.
