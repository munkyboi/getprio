# Composed visit domain and scheduling contract

Type: grilling
Status: resolved
Claimed by: Codex (/root)
Blocked by: none

## Question

What exact domain contract should define a customer-composed visit, its per-item units and intervals, the user-facing Together/Back-to-back arrangements, and the immutable snapshots required by standard and group-funded bookings?

## Known direction

- A composition is derived from existing branch services and stored on the booking/campaign; it is not a catalog package.
- Together uses one common start and ends at the latest item end.
- Back-to-back places items in a deterministic selected order and ends after the sum of their intervals.
- A single service is a one-item composition and keeps the short booking path.

## Decisions made while resolving

- For a Back-to-back visit, customers set the service order using a Mantine UI drag-and-drop list with a visible drag handle. The persisted item order is the scheduled order and is immutable once a booking or group-funded campaign is created.
- The parent booking or campaign stores the selected `parallel` or `sequential` arrangement once. Each item stores its server-calculated start/end interval snapshot for capacity checks, audit, and display.
- A service appears at most once in a composition. Repeated duration is represented by that item's units, not duplicate service rows.

## Resolution must decide

1. The canonical persisted fields and service-item ordering rules.
2. Whether the chosen arrangement is stored at the parent, items, or both.
3. The server-generated response shape for calculated per-item intervals and customer explanations.
4. How standard bookings and group-funded campaigns share the contract while preserving their distinct lifecycles.

## Resolution

A composed visit is a customer-selected set of unique active branch services, stored as ordered item snapshots on one standard booking or one group-funded campaign. It is not a vendor-maintained package catalog.

1. The parent stores `executionMode` as `parallel` or `sequential`. The customer sees these as **Together** and **Back-to-back**. The server is authoritative: it offers or accepts an arrangement only when every item can be scheduled and has capacity.
2. Each item stores the selected service/location-service identity, service display/price snapshot, item units, calculated start/end timestamps, and `sortOrder`. A service may appear only once; units represent repeated duration.
3. Parallel items share one start. Their individual end is their service duration times units; the visit ends at the latest item end. Sequential items start after the preceding item's calculated end, in `sortOrder`; the visit ends at the final item end.
4. Customers set sequential order with Mantine UI's handle-based drag-and-drop list. The submitted/persisted order becomes immutable when a booking or campaign is created.
5. The current non-null parent `service_id` remains a server-derived compatibility/display reference to the first persisted item. It must not determine composed-visit availability, duration, price, or capacity.
6. Standard bookings and group-funded campaigns share this composition and scheduling contract. Group-funded campaigns additionally lock their composition, arrangement, item intervals, and total when created; later replacement-slot handling may change time only, not the funded composition.

## Resolution comment

Resolved with the customer-flow decisions above. This establishes the common domain contract; it intentionally does not decide overlap SQL, unit consumption, or API rollout. Those remain in **Capacity and availability accounting for composed visits**.
