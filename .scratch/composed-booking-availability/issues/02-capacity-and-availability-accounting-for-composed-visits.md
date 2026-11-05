# Capacity and availability accounting for composed visits

Type: research
Status: resolved
Claimed by: Codex (/root)
Blocked by: 01

## Question

How must GetPrio calculate candidate slots and overlapping capacity for every item in a composed visit, including secondary `booking_bundle_items`, branch-wide capacity, service-specific capacity, booking units, and active group-funded holds?

## Evidence to investigate

- `backend/src/services/bookingService.js` currently lists slots for one service at a time.
- `frontend/src/pages/BookingRequestPage.tsx` currently treats a candidate as valid when any individual service has an available slot.
- `backend/src/repositories/bookings.js` counts overlap through `bookings.service_id`, which misses a secondary bundle item.

## Resolution must decide

1. The single server-side bundle-slot API/contract that validates all items before a slot is offered.
2. How Together and Back-to-back produce each item interval before checks run.
3. The exact overlap query semantics for service- and location-scoped capacity, including whether each booking item consumes one capacity unit or its requested units.
4. How active group-funded capacity holds participate without double counting the campaign itself.

## Resolution

See [capacity and availability research](../assets/02-capacity-and-availability-research.md).

The authoritative rule is item-based occupancy: each selected item reserves one unit for its calculated interval; booking quantity extends duration only. Service-scoped capacity counts only that service's overlapping booking/hold items. Location-scoped capacity counts every overlapping booking/hold item at the branch and uses the shared availability rule's capacity as the one threshold for all services.

This resolves the current defect where client-side slot selection accepts any available service and repository overlap checks miss secondary booking items. A composed-slot evaluator must calculate all item intervals first and return a slot only if every item is available and within capacity. Self revalidation excludes the booking or campaign being changed.
