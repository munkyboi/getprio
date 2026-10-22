# Resource capacity foundation audit

The foundation stores **draft** location resource pools and one pool requirement per service/location. The database rejects enabling tracking in this release. No configuration is seeded or inferred from service names, booking quantity, or counters. Internal draft repository writers require an explicit transaction client; no new HTTP configuration endpoints or dashboard controls are exposed.

## Run the read-only report

After the additive migration has been deployed, run from the checkout containing the deployed scripts:

```bash
cd /var/www/getprio
DATABASE_HOST=localhost DATABASE_NAME=getprio \
node scripts/resource-capacity-audit.mjs \
  --vendor-slug pickle-bois-burgadols \
  --location-slug main \
  --from 2026-10-03T00:00:00Z \
  --to 2026-10-04T00:00:00Z
```

Choose the timestamps for the interval you want to inspect. Both endpoints must be UTC timestamps, and the window must be positive and no longer than seven days. This example is 8 AM on 3 October through 8 AM on 4 October in Manila. It is not a reconstruction of historical statuses: the report uses bookings and ticket statuses present when the command runs.

The script uses the existing root environment configuration, validates the configured connection URL against `DATABASE_HOST` and `DATABASE_NAME`, checks the connected database name, and executes queries in a repeatable-read, read-only transaction. Statement and lock timeouts are applied. It prints no connection credentials, customer names, contacts, or booking references. Database access is an operator privilege; this is not a customer API. The CLI environment value does not establish isolation.

An optional hypothetical service can be projected:

```bash
DATABASE_HOST=localhost DATABASE_NAME=getprio \
node scripts/resource-capacity-audit.mjs \
  --vendor-slug pickle-bois-burgadols --location-slug main \
  --from 2026-10-03T00:00:00Z --to 2026-10-04T00:00:00Z \
  --service-id YOUR_SERVICE_ID --duration-minutes 180
```

Replace `YOUR_SERVICE_ID` with an active service ID assigned to that location. Omit the duration override to use the service's base duration. An override changes only the hypothetical report; it never updates a ticket or booking. The hypothetical request is one service, not an existing booking or a composed bundle. Its resource demand comes from the draft requirement, not from its duration or booking quantity.

## Interpret the output

- `tableAvailable: false`: the foundation migration has not been applied.
- `mappingCount: 0` and a no-pools warning: expected immediately after migration. Vendor configuration arrives in the next slice. This release provides internal draft writers for that later workflow.
- `projection.pools`: capacity, peak reserved units, and intervals where reservation demand exceeds the draft pool capacity.
- `unmappedReservationItems`, `invalidReservationItems`, `invalidRequirements`, and `missingBookingItems`: incomplete inputs. The hypothetical start is suppressed when these are present. Missing mappings are handled conservatively across the location because their competing resources are unknown.
- `expiredPendingItems`: pending unpaid holds whose stored expiration has passed were excluded without writing statuses. Pending bookings with payment proof remain included, matching the existing expiration rule. The stored booking availability query may still count expired unpaid rows until the usual expiration workflow runs.
- `candidate.scheduleOnlyStart`: earliest contiguous interval in the selected window that can fit the hypothetical demand around mapped reservations. It ignores waiting-ticket plans, actual occupancy, operating hours, intake state, and future availability exceptions. It is a reservation calculation, not a customer wait estimate or permission to start service.
- `baselineReference`: the existing waiting-count-times-vendor-average formula for the local business date at the window's start. It uses current waiting statuses, not historical observations. It is supplied for context and is not a comparable model-performance score.
- `actualOccupancy: "unknown"`, `trackingAvailable: false`: always true for this foundation. The report cannot prove that a booked resource was started, finished, or released.

Reservations use service-item intervals with `[start, end)` boundaries, so one booking ending exactly when another starts does not overlap. Each item contributes its configured units once. Parallel bundle items therefore overlap in time; sequential items follow their stored individual intervals. Booking quantity is already reflected in those intervals and is not multiplied again. Reports exceeding 20,000 items fail rather than truncate demand.

## Deployment and rollback

Deploy through the normal additive migration path (`db:migrate`); the migration adds two empty tables and scoped foreign keys. Existing customer estimates, booking availability, queue transitions, booking completion, and sample capture remain unchanged. Schema verification now requires the foundation tables. Bootstrap explicitly drops these tables before rebuilding and remains destructive; never bootstrap an existing production database.

An application rollback can leave the draft tables in place: the earlier runtime does not read them. Do not drop populated draft configuration as a rollback shortcut. Activating tracking requires a later operational release with booking/session locks, resource allocation, service completion, customer status, and authorization controls. This slice neither backfills sessions nor rewrites old bookings or tickets.

See [the full implementation plan](queue-resource-occupancy.md) for the next slices. AI model rollout remains on hold.
