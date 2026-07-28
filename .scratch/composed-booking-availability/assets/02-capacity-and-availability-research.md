# Capacity and availability research for composed visits

## Current evidence

- `bookingQuantity` multiplies service duration. The existing booking execution checklist explicitly defines it as a duration multiplier, and `bookingService.js` calculates `service.durationMinutes * bookingQuantity`.
- `booking_bundle_items` already persists a separate interval per selected item, but `countOverlappingActiveBookings()` currently reads only `bookings.service_id`. A secondary selected service therefore does not consume capacity in later slot checks.
- Group-funded campaigns already create one active capacity hold per item, but their overlap counter also only counts rows and must follow the same composition scope semantics.
- Berdugo Salon has location-scoped availability capacity `2` while its branch-service capacities vary from `1` to `5`. Treating the larger per-service value as a shared-pool threshold gives different answers for the same pool.

## Resolved capacity contract

1. A booking unit extends its own item interval; it never represents additional capacity units in v1.
2. Each overlapping item consumes exactly one capacity unit in its applicable scope.
3. For a service-scoped rule, count overlapping active booking items and active group-funded hold items for that service only.
4. For a location-scoped rule, count all overlapping active booking items and active group-funded hold items for that branch, regardless of service. The shared availability rule's capacity is the single authoritative threshold; individual `location_services.capacity` values cannot override it.
5. A Together composition validates every item over its shared start and item-specific end. Concurrent items can therefore consume multiple units of a location-scoped pool at once.
6. A Back-to-back composition validates each item over its sequential interval. Its items do not overlap one another, so each consumes one shared-pool unit only during its own scheduled time.
7. Revalidation excludes the booking or campaign currently being changed to prevent self-counting.

## Required server contract

Provide one server-side composed-slot evaluator that accepts a branch, date, arrangement, and ordered `{ serviceSlug, bookingQuantity }` items. It must materialize all item intervals before returning a candidate. A candidate is selectable only if every item passes branch/service availability, exception, payment-compatibility, and capacity checks.

The response should return the overall visit interval plus per-item intervals and a customer-safe reason when the arrangement or a selected item cannot fit. The client must not create candidate slots by unioning individual-service responses.

## Repository direction

After the migration/backfill makes item rows universal, overlap queries should use item records as the canonical booking occupancy source, not `bookings.service_id` plus an item-table join that could double-count the same booking. Group-funded hold rows are already one per item and should be counted with the same scope filter.

## Regression scenarios

1. A Court 1 + VIP Court Together visit succeeds when both service-scoped resources are free.
2. A Haircut + Shave Together visit is rejected when shared branch capacity is one and accepted when it is at least two.
3. The same Haircut + Shave Back-to-back visit fits with shared branch capacity one when each individual interval fits.
4. A confirmed booking whose secondary item is Hair Color blocks a later Hair Color slot.
5. A location-scoped slot returns the same shared capacity threshold regardless of which selected service is evaluated.
6. A campaign's own active review holds do not block its approval/replacement recheck.
