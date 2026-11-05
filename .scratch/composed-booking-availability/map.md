# Composed booking availability across standard and group-funded flows

Label: wayfinder:map

## Destination

Produce a decision-ready specification and implementation cutline for category-neutral composed visits in GetPrio. Customers must be able to combine existing services in either a simultaneous or back-to-back arrangement, with correct availability and capacity in both standard and group-funded bookings.

The map is complete when the booking, data, capacity, UX, lifecycle, and rollout decisions are sharp enough to become implementation tickets without relying on court-specific assumptions.

## Notes

Domain: GetPrio booking flows. Consult `AGENTS.md` and `CONTEXT.md` on every resolving session.

Skills every resolving session should consult:

- `/grilling`
- `/domain-modeling`

Standing rules already agreed during charting:

- `Service Bundle` is an ephemeral booking composition, not a vendor-maintained catalog of package variants.
- Customers use **Together** (parallel) or **Back-to-back** (sequential); server-side capacity/availability validation decides whether an arrangement is selectable.
- Units are per selected service. Together duration is the longest item interval; Back-to-back duration is the sum of item intervals.
- v1 totals are the sum of item price times item units; package discounts are out of scope.
- v1 uses existing branch/service capacity configuration, not named staff calendars or resource pools.
- All bundle items must share one payment requirement in v1.
- Group-funded campaigns snapshot the entire composition and arrangement; replacement slots preserve it.
- Single-service booking keeps a short path; the arrangement choice appears only for combined services.

## Decisions so far

- [Composed visit domain and scheduling contract](./issues/01-composed-visit-domain-and-scheduling-contract.md) — customer-selected Together/Back-to-back composition is parent-level; ordered item snapshots are authoritative, and legacy primary-service fields are derived only for compatibility.
- [Capacity and availability accounting for composed visits](./issues/02-capacity-and-availability-accounting-for-composed-visits.md) — occupancy is item-based; units extend duration, location scope uses one shared capacity threshold, and a server evaluator accepts only slots that pass every item check.
- [Customer booking flow and arrangement explanations](./issues/03-customer-booking-flow-and-explanations.md) — the Visit planner layout is the customer-flow base, with a composition workspace, persistent computed summary, item-level units, and server-derived time selection.
- [Group-funded composed-visit lifecycle](./issues/04-group-funded-composed-visit-lifecycle.md) — existing campaigns migrate as parallel; replacements preserve the funded composition, organizer authority, per-item revalidation, and contributor transparency.
- [Schema, API compatibility, and rollout cutline](./issues/05-schema-api-compatibility-and-rollout-cutline.md) — additive execution-mode migration, item-based occupancy, composed-slot evaluation, and five ordered implementation slices preserve legacy one-service behavior.

## Not yet specified

<!-- The route is clear. Future questions belong to implementation slices. -->

## Out of scope

- Named staff calendars, staff assignment, and generic resource-pool scheduling.
- Vendor-authored package catalogs, fixed package discounts, and bundle-specific pricing.
- Payment flows that split a composed visit between required-payment and no-payment services.
