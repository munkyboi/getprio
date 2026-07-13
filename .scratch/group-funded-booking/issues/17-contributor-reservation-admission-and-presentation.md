Type: grilling
Status: resolved
Claimed by: Codex (/root)
Blocked by: 16

## Question

Once all contributor positions are occupied by verified contributions and submitted-proof reservations, should GetPrio reject any additional proof submission atomically, and what aggregate counts and meter states should it expose without leaking contributor identities?

## Resolution

Yes. When the sum of verified contributions and submitted-proof contributor reservations reaches `requiredContributors`, the contribution-proof submission transaction must reject any additional contributor. There is no waitlist. Vendor rejection releases exactly one position.

The safe aggregate presentation is:

1. `verifiedContributorCount` — verified contributions; green, locked, and the only count that advances funding.
2. `pendingVerificationContributorCount` — submitted proofs; blue, temporarily reserved, and waiting for vendor verification.
3. `vacantContributorCount` — required contributors minus verified and pending-verification counts; gray and joinable.

The campaign headline uses verified plus pending-verification positions as `filled`, for example `2 of 4 contributors filled`, followed by `2 contributors pending vendor verification`. The contributor meter renders one separated segment per required contributor: green verified segments, blue pending segments, and gray vacant segments. Public and guest payloads expose only these aggregates, never contributor identities or payment-proof details.
