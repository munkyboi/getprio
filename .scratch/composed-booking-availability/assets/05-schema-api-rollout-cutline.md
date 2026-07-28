# Composed-visit schema, API, and rollout cutline

## Compatibility facts

- `booking_bundle_items` already backfills one item per normal booking and stores per-item quantity, price, start/end, and order.
- `group_funded_booking_items` already stores per-item intervals and defaults existing campaigns to `parallel`, but `group_funded_bookings` has no parent arrangement field.
- Neither normal `bookings` nor `booking_bundle_items` currently stores the parent arrangement.
- Existing single-service slot endpoints and booking payloads are live compatibility contracts and must remain supported.

## Migration contract

Add one additive migration before enabling the new customer flow:

1. Add `execution_mode TEXT NOT NULL DEFAULT 'parallel' CHECK (execution_mode IN ('parallel', 'sequential'))` to `bookings` and `group_funded_bookings`.
2. Backfill/default all existing parent rows to `parallel`; retain all existing item intervals unchanged.
3. Keep `service_id`/`booking_quantity` parent columns as legacy display/compatibility fields derived from the first item; item rows remain authoritative for composed visits.
4. Do not add an execution-mode column to `booking_bundle_items`: the parent holds the arrangement and the item rows hold the resolved interval snapshots. Retain the existing group-funded item column for backward compatibility but ensure it mirrors the parent arrangement on new writes.
5. Add/replace booking-overlap repository queries so item rows are the sole source of normal booking occupancy after the existing one-item backfill. Do not union parent booking rows and item rows, which would double-count legacy bookings.

## API contract

Keep `GET /public/vendors/:tenantSlug/locations/:locationSlug/services/:serviceSlug/slots` unchanged for the one-service fast path and reschedules.

Add a read-only composed-slot evaluator alongside it:

`POST /public/vendors/:tenantSlug/locations/:locationSlug/composed-slots`

Request:

```json
{
  "date": "2026-07-20",
  "executionMode": "parallel",
  "items": [
    { "serviceSlug": "haircut", "bookingQuantity": 1, "sortOrder": 0 },
    { "serviceSlug": "hot-towel-shave", "bookingQuantity": 1, "sortOrder": 1 }
  ],
  "includeGroupFundedHolds": false
}
```

The response returns candidate visit start/end plus resolved item intervals and customer-safe unavailable reasons. It returns candidates only when every item passes availability, payment compatibility, and its capacity scope. Group-funded callers set `includeGroupFundedHolds: true`; no client unions individual-service slot lists.

Standard booking and campaign-create payloads gain optional `executionMode` and ordered `bundleItems`. Omitted fields preserve the existing one-item, parallel-compatible behavior. Server validation recalculates intervals and rejects client-supplied timing snapshots.

## Implementation slices

### Slice A — schema and repository occupancy foundation

- Add the parent arrangement migration and update `database/init.sql`.
- Extend booking/campaign mappers and shared DTO/request types.
- Replace normal booking overlap reads with item-row occupancy, respecting service/location capacity scope and exclusion IDs.
- Add repository regressions for a secondary booking item, shared location capacity, self-exclusion, and legacy one-item backfill.

### Slice B — server-side composed plan and slot evaluator

- Extract one composition planner that normalizes unique ordered items, validates units/payment compatibility, and calculates Together/Back-to-back intervals.
- Add the composed-slot endpoint and make all slot/creation/review validation use the same planner plus occupancy contract.
- Retain old single-service routes/payloads as adapters into a one-item plan.
- Add service tests for parallel courts, sequential salon services, disabled mixed-payment combinations, and no `any-service-is-available` candidates.

### Slice C — standard booking write path and read models

- Persist parent arrangement and planned item snapshots transactionally in `createCustomerBooking`.
- Preserve primary `service_id` only as the first-item compatibility reference.
- Update customer/vendor booking detail serializers to show arrangement and resolved item timeline.
- Add standard booking/reschedule regressions, including secondary-item occupancy after confirmation.

### Slice D — group-funded lifecycle integration

- Persist parent arrangement on campaign creation and mirror it to new item rows.
- Replace parallel-only campaign/replacement planning with the shared planner.
- Recreate per-item holds on accepted replacement intervals; expose organizer-safe and contributor-safe replacement summaries.
- Add campaign, approval, replacement, hold, and refund regressions for sequential and parallel compositions.

### Slice E — Visit planner UI and rollout verification

- Implement the selected Visit planner in `BookingRequestPage.tsx`, retaining the one-service fast path.
- Use Mantine's handle-based drag-and-drop pattern for Back-to-back order; show item-level unit controls only where allowed.
- Call only the composed-slot endpoint for multi-service visits; render customer-safe disabled/recovery states.
- Run migration against local Docker, audit existing rows are one-item `parallel`, and manually verify a Court 1 + VIP Court Together case plus a Haircut + Shave Back-to-back case.

## Vendor configuration cutline

No new bundle catalog or staff/resource UI is needed for v1. Existing service scope and availability configuration remains authoritative. The vendor dashboard should only clarify that an All-services/location-scoped availability block sets one shared branch capacity; per-service capacity applies when the service has service scope.

## Rollout and rollback

1. Deploy the additive migration and code that can read missing/new arrangement fields as `parallel` before enabling the UI.
2. Verify row backfills, overlap queries, candidate responses, and vendor review holds in the local Docker DB.
3. Enable the Visit planner after server regressions pass; keep the one-service path available throughout.
4. Roll back UI/endpoint use first if needed. Do not remove the additive columns or item records; legacy readers remain compatible through derived primary fields.
