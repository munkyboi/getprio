Type: grilling
Status: resolved
Blocked by: 02, 03, 04, 05

## Question

What exact service or location-service settings should vendors configure for group-funded booking eligibility, funding limits, deadlines, contribution rules, and public/private campaign behavior?

## Working notes

- Rule agreed: location-service is the authoritative settings level for group-funded booking eligibility and limits.
- Rule agreed: service-level group-funded defaults may exist for convenience, but branch-specific `location_services` settings decide whether a selected branch/service can start group-funded campaigns.
- Rule agreed: campaign creation is allowed only when the selected location-service is group-funded enabled and the selected branch has active payment instructions.
- Rule agreed: v1 location-service settings should include `group_funded_enabled`, `min_required_contributors`, `max_required_contributors`, `default_required_contributors`, `min_contribution_amount`, `max_contribution_amount`, `min_funding_deadline_hours`, `max_funding_deadline_days`, and `allow_public_campaigns`.
- Rule agreed: v1 should not include `min_contributors` because fixed exact contribution funding makes a separate minimum contributor threshold redundant.
- Rule agreed: v1 should not expose uneven shares, overfunding, deadline extensions, participant swaps, vendor pre-screening, or automatic refunds as vendor settings.
- Rule revised: organizers do not choose an arbitrary contribution amount in v1.
- Rule agreed: the required contribution amount is computed from the selected booking fee divided by the organizer-selected `required_contributors`.
- Rule agreed: vendor `min_contribution_amount` and `max_contribution_amount` validate the computed contribution amount rather than changing the campaign target.
- Rule agreed: the campaign target amount must equal the selected service/location-service payable amount in v1.
- Rule revised: the booking fee does not need to divide evenly by contributor count.
- Rule agreed: computed contribution amount is rounded up to the nearest hundredth of the currency unit, e.g. `511.14312` becomes `511.15`.
- Rule agreed: any small overage caused only by rounding up to two decimal places should be recorded as a rounding adjustment, not treated as optional overfunding.
- Rule agreed: vendors configure minimum, maximum, and default required contributor count bounds.
- Rule agreed: organizers choose the exact `required_contributors` count within the vendor-configured bounds.
- Rule agreed: the canonical campaign target amount remains the selected service/location-service payable amount in v1, while any small rounded-up excess is tracked separately as a rounding adjustment.
- Rule agreed: organizer authority and paid participation stay separate. The organizer does not pay during campaign creation.
- Rule agreed: after campaign creation, the organizer may optionally pay their own contribution through the same contribution flow as other contributors; the organizer counts as a contributor only after their own contribution is verified.
- Rule agreed: organizers may choose the exact funding deadline within vendor-configured minimum and maximum bounds.
- Rule agreed: the organizer form should prefill a practical default such as 48 hours from creation, capped by vendor maximum and schedule constraints.
- Rule agreed: the funding deadline must be before the selected service time with enough buffer for the 24-hour vendor review hold.
- Rule agreed: `allow_public_campaigns` controls only whether organizers can publish campaigns on the vendor profile.
- Rule agreed: private-link campaigns remain allowed when `group_funded_enabled` is true, even if `allow_public_campaigns` is false.
- Rule agreed: vendors disable all group-funded campaign creation for a branch/service by turning off `group_funded_enabled`.

## Answer

Vendor group-funded eligibility and settings should stay narrow, branch-aware, and consistent with the existing booking price model.

1. `location_services` is the authoritative configuration layer for v1. A service may define reusable defaults, but the selected branch/service combination decides whether group-funded booking is actually allowed.
2. Campaign creation is permitted only when the selected `location_service` has `group_funded_enabled = true` and the branch has active payment instructions, because contributors must be able to submit payment proof immediately after joining.
3. The v1 vendor settings set should be:
   - `group_funded_enabled`
   - `min_required_contributors`
   - `max_required_contributors`
   - `default_required_contributors`
   - `min_contribution_amount`
   - `max_contribution_amount`
   - `min_funding_deadline_hours`
   - `max_funding_deadline_days`
   - `allow_public_campaigns`
4. The organizer chooses the exact required contributor count within the vendor-configured bounds. The organizer does not choose an arbitrary campaign target or arbitrary share amount.
5. The campaign target amount equals the selected payable booking amount for that service/location-service snapshot in v1. Required contribution is derived from that amount and the organizer-selected contributor count.
6. If the fee does not divide evenly, GetPrio rounds the per-contributor amount up to the nearest hundredth of the currency unit and records any resulting small excess as a rounding adjustment, not as optional overfunding.
7. `min_contribution_amount` and `max_contribution_amount` validate the computed required share. They do not rewrite the booking price or let vendors define a separate crowdfunding target.
8. The organizer chooses the funding deadline within the vendor-configured minimum and maximum bounds. The form should prefill a practical default such as 48 hours from creation, while also enforcing that the deadline leaves enough time before the booked service slot for the 24-hour post-funding vendor review hold.
9. `allow_public_campaigns` controls only profile-discoverable public campaigns. Private-link campaigns remain allowed whenever `group_funded_enabled` is true.
10. Vendors can disable the capability entirely for a branch/service by setting `group_funded_enabled = false`.
11. V1 deliberately excludes vendor-configurable uneven shares, overfunding, deadline extensions, participant swaps, vendor pre-screening, automatic refunds, or single-payer fallback conversion. If a campaign misses its target by the deadline, it ends in the existing funding-failure path and contributors become refund-eligible.
