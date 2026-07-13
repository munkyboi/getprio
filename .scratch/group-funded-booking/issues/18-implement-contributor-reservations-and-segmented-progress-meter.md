Type: implementation-slice
Status: implemented
Blocked by: 17

## Question

What minimal schema-free backend, API, test, and customer UI changes implement submitted-proof contributor reservations, atomic admission limits, and the privacy-safe segmented contributor meter without changing verified-funding semantics?

## Scope boundary

1. Reuse existing `submitted` contribution status as the temporary reservation; do not add a separate payment or booking-capacity state.
2. Enforce the admission cap inside the existing campaign-row transaction before participant/contribution creation.
3. Return verified, pending-verification, vacant, and filled aggregate counts from customer-safe campaign endpoints.
4. Present a separated circular meter using green verified, blue pending, and gray vacant segments, alongside the approved headline/note copy.
5. Preserve vendor proof-review visibility and strict public privacy boundaries.
6. Add focused backend concurrency/limit and frontend rendering tests, then run the existing group-funded verification suite.

## Resolution

Implemented submitted-proof contributor reservations without a schema change. The contribution submission transaction locks the campaign row, counts verified and submitted contributions, and rejects additional proof submissions when all required positions are occupied. Vendor rejection naturally releases a submitted reservation because only `submitted` and `verified` records contribute to the live aggregate.

Customer-safe campaign payloads now return only verified, pending-verification, vacant, and filled counts. Public campaign listings obtain those counts in their existing query rather than issuing a query per card. The campaign page renders the requested separated circular meter: green verified segments, blue pending-verification segments, and gray vacancies; it disables contribution submission while no vacancy exists.

The authenticated customer campaign response now provides a boolean `isOrganizer` instead of exposing an organizer user identifier to contributors.

Verified with `npm --workspace backend run test`, `npm --workspace frontend run typecheck`, and `npm --workspace frontend run build`.
