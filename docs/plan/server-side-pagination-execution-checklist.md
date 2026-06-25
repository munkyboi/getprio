# Server-Side Pagination Execution Checklist

This checklist implements ADR 0003 for high-cardinality operational lists without changing small setup/configuration tables.

## 1. Scope

### In scope

- [ ] Vendor bookings
- [ ] Vendor history
- [ ] Vendor clients
- [ ] Customer bookings
- [ ] Customer queue tickets

### Out of scope for this pass

- [ ] Services table
- [ ] Staff table
- [ ] Locations table
- [ ] Counters table
- [ ] Availability blocks and date exceptions tables
- [ ] Page-size selector UI
- [ ] Cursor pagination

## 2. Shared Contract

- [ ] Add shared pagination metadata type:
  - `page`
  - `pageSize`
  - `totalItems`
  - `totalPages`
- [ ] Keep list-specific collection names:
  - `bookings`
  - `tickets`
  - `clients`
- [ ] Add backend pagination utility for parsing and clamping:
  - default `page = 1`
  - default `pageSize = 10`
  - maximum `pageSize = 100`
  - `offset = (page - 1) * pageSize`
- [ ] Treat legacy `limit` as a temporary `pageSize` alias with `page = 1`.
- [ ] Apply authorization and entitlement limits before counting totals.
- [ ] Apply search, filters, and sort before pagination.
- [ ] Reset frontend page to `1` when filters or sort change.
- [ ] Keep current page on live updates and refetch the current query.

## 3. Slice 1: Vendor Bookings

- [ ] Extend vendor bookings route to accept:
  - `page`
  - `pageSize`
  - `search`
  - `status`
  - `scheduledDate`
  - `location`
- [ ] Move booking search/status/scheduled-date filtering into the backend query.
- [ ] Preserve ordering:
  - `created_at DESC`
  - `id DESC`
- [ ] Return:
  - `bookings`
  - `pagination`
- [ ] Update `VendorBookingsResponse`.
- [ ] Update vendor dashboard booking table to render server-returned rows only.
- [ ] Add Mantine pagination to the booking table.
- [ ] Refetch current booking page after SSE booking updates without resetting page.
- [ ] Reset booking page to `1` when search/status/scheduled date changes.
- [ ] Add backend tests for search, status, scheduled date, location, totals, and page boundaries.

## 4. Slice 2: Vendor History

- [ ] Extend vendor history route to accept:
  - `page`
  - `pageSize`
  - `search`
  - `sort`
  - `location`
- [ ] Apply tenant, location, role, and plan history-window constraints before totals.
- [ ] Move search and sort into backend query.
- [ ] Return:
  - `tickets`
  - `pagination`
- [ ] Update frontend history table to use server pagination.
- [ ] Reset page to `1` when search or sort changes.
- [ ] Add backend tests for entitlement-bounded totals and page boundaries.

## 5. Slice 3: Vendor Clients

- [ ] Extend vendor clients route to accept:
  - `page`
  - `pageSize`
  - `search`
  - `sort`
  - `location`
- [ ] Decide whether client summaries are grouped in SQL or by a repository projection before pagination.
- [ ] Apply tenant, location, role, and plan history-window constraints before totals.
- [ ] Return:
  - `clients`
  - `pagination`
- [ ] Update frontend clients table to use server pagination.
- [ ] Reset page to `1` when search or sort changes.
- [ ] Add backend tests for grouped-client totals and page boundaries.

## 6. Slice 4: Customer Bookings

- [ ] Extend customer bookings route to accept:
  - `page`
  - `pageSize`
- [ ] Keep visible UI simple: no search or filters in this pass.
- [ ] Return:
  - `bookings`
  - `pagination`
- [ ] Add pagination to the customer booking history table.
- [ ] Add backend tests for ownership, totals, and page boundaries.

## 7. Slice 5: Customer Queue Tickets

- [ ] Extend customer history route to accept:
  - `page`
  - `pageSize`
- [ ] Keep visible UI simple: no search or filters in this pass.
- [ ] Return:
  - `tickets`
  - `pagination`
- [ ] Add pagination to the customer queue ticket table.
- [ ] Add backend tests for ownership, totals, and page boundaries.

## 8. Verification

- [ ] Run backend tests for touched repositories and routes.
- [ ] Run full backend test suite.
- [ ] Run frontend typecheck.
- [ ] Run backend typecheck.
- [ ] Manually verify vendor bookings:
  - search
  - status filter
  - booking date filter
  - page navigation
  - live update refetch without page reset
- [ ] Manually verify customer account tables:
  - page navigation
  - vendor links still work
  - booking/ticket action buttons still work
