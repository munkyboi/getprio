# Group-Funded Booking Customer Experience Prototype

## Purpose

This is a rough experience prototype for the wayfinder ticket `Group-funded booking customer and participant experience`. It is not an implementation spec yet.

The goal is to make the customer-facing path concrete enough for review: how a Customer starts a group-funded booking, how contributors join and pay, how progress is tracked, and what the UI says when the campaign funds, expires, or becomes refund-eligible.

## Current GetPrio Anchors

- The normal booking flow already lives at `/vendors/:tenantSlug/book` and `/vendors/:tenantSlug/book/:serviceSlug`.
- The normal flow uses a Stepper: Select Service, Verify OTP, optional Payment Proof, Vendor Verification.
- Customer booking details already live at `/account/bookings/:bookingId` and refresh from the tenant/location event stream plus polling.
- Manual payment evidence is currently uploaded per booking. Group-funded booking should not reuse the single booking payment proof fields for contributor payments.
- Booking slots are computed before booking creation and include `remainingCapacity`, but the lifecycle decision says group-funded funding-stage records do not consume capacity.

## Recommended Shape

Add a visible booking mode choice inside the existing booking request flow when the selected location-service is group-funding eligible:

- `Book for myself`
- `Start group-funded booking`

This keeps the feature category-agnostic and avoids a separate "crowdfunding" product surface. The selected mode changes the downstream steps but not the discovery path: customers still start from a vendor profile, branch, service, date, and slot.

On the vendor profile, reframe the services area as `Booking options` with two tabs:

- `Standard`: the existing branch-scoped service cards and normal `Book` CTA.
- `Group-funded`: public campaigns that organizers chose to publish for the selected vendor/branch.

The `Group-funded` tab should show public campaign cards with service, schedule, required contribution, verified funding progress, deadline, masked organizer identity, and a `Join funding` CTA. Private campaigns remain accessible by share link only and do not appear in this tab.

Organizer start entry points:

- Each eligible `Standard` service card shows normal `Book` and secondary `Start group-funded` actions.
- The `Group-funded` tab shows `Start a group-funded booking`, including in the empty state.
- `Start group-funded` routes into the existing booking flow with group-funded mode preselected, using a route shape like `/vendors/:tenantSlug/book/:serviceSlug?location=...&mode=group-funded`.

Public campaign cards may also show the organizer's campaign description. The description is written by the organizer, capped at 280 characters, and must pass profanity/moderation checks before it is saved or published.

Example card copy:

```text
Saturday doubles session
Organized by Carlo A.
Looking for 3 more players for Saturday afternoon. Beginners welcome.
PHP 600 each
PHP 1,200 verified of PHP 2,400
Deadline: July 18, 2026, 9:00 PM
[Join funding]
```

## Organizer Flow

### Entry

Surface: existing `BookingRequestPage`.

The organizer arrives from either an eligible service card's `Start group-funded` action or the `Group-funded` tab's `Start a group-funded booking` action. The selected route should reuse the existing booking flow with group-funded mode preselected.

The organizer selects:

- Branch
- Service
- Booking quantity or units, if the service supports it
- Date and slot
- Contact details
- Booking mode: `Start group-funded booking`

Additional group-funded fields:

- Contribution amount per person
- Maximum contributors, derived from target amount and contribution amount where possible
- Funding deadline
- Optional invite note
- Visibility mode: `Private link only` or `Public on vendor profile`
- Public/private campaign description, max 280 characters, subject to profanity/moderation checks

V1 contribution rule:

- Each contributor pays exactly the required contribution amount.
- No tipping, overfunding, partial payment, uneven share, or optional extra contribution in v1.

Recommended helper copy:

> The slot is not reserved until the group is fully funded and the vendor approves it.

### Stepper Prototype

```text
Select service
  Existing branch, service, date, slot, quantity, contact fields
  New mode selector: Book for myself | Start group-funded booking
  New funding fields: per-person amount, deadline, invite note

Verify organizer
  Reuse booking OTP verification

Create funding page
  Creates a group-funded booking campaign, not a normal booking
  Shows share link, QR/share actions, funding deadline, and organizer controls

Track funding
  Shows paid contributors count, verified amount, target amount, deadline warnings
  Shows submitted/unverified contributions separately from verified contributions

Vendor review
  Appears only after full funding
  Explains that vendor approval is required before the normal booking is confirmed

Confirmed booking
  Links to normal booking detail after vendor approval
```

### Organizer Dashboard Card

Surface: likely `/account/bookings` with a separate group-funded section or filter.

Recommended card states:

- `Funding open`: target not reached, deadline active.
- `Funding complete`: full verified funding reached, waiting for vendor review.
- `Vendor approved`: linked normal booking created or activated.
- `Vendor rejected`: refund obligations created for all paid contributions.
- `Expired`: deadline passed before full funding, refund obligations created.
- `Organizer canceled`: organizer canceled before funding completed, refund obligations created.

Primary actions:

- Copy invite link
- View funding page
- Cancel campaign, only before full funding
- View refund status after terminal refund-triggering states

Disabled or absent actions:

- Organizer cannot cancel after full funding.
- Organizer cannot mark contributors paid.
- Organizer cannot approve the booking.
- Organizer cannot edit funding terms after the first verified contribution.

Cancellation UX must use anti-dark patterns: explain consequences plainly, default to keeping the campaign, avoid guilt copy, and make destructive action labels explicit.

## Contributor Flow

### Invite Link Landing

Recommended route shape for planning:

```text
/group-funded-bookings/:campaignPublicToken
```

This route should be safe to open from a share link. It shows only public or participant-safe campaign details.

Visible to guest:

- Vendor name
- Location name
- Service name
- Date and time
- Required contribution
- Funding progress summary
- Deadline
- Organizer display name, limited to first name or configured display name
- `Log in or create account to contribute`

Visible to authenticated contributor:

- Same summary
- Contributor's own contribution status
- Payment instructions after joining
- Upload payment evidence form

Hidden from other contributors:

- Other contributors' full names
- Other contributors' contact details
- Other contributors' payment proof, reference number, refund evidence, or rejection reason

Hidden from guests on public campaign cards:

- Organizer phone, email, and full legal name
- Participant list
- Payment proof or payment references
- Refund details

### Contributor Stepper Prototype

```text
Review booking
  Vendor, service, schedule, contribution amount, deadline, refund trigger summary

Join and verify
  Login or register
  Confirm contact if required by existing booking OTP policy

Submit contribution proof
  Show vendor payment QR or manual payment instructions
  Upload reference and proof image for this contribution only

Wait for verification
  Contributor counts toward funding only after vendor verifies payment proof

Track outcome
  Funding open, funded waiting for vendor, confirmed booking, expired, vendor rejected, refund pending, refund completed
```

Recommended payment copy:

> Your payment counts toward the group only after the vendor verifies your proof.

Recommended refund copy:

> If the group does not reach the target before the deadline, or the vendor rejects the fully funded request, your contribution becomes refund-eligible. The vendor handles manual refunds outside GetPrio and records the refund status here.

## Shared Funding Progress UI

Use a progress panel with two separate numbers:

- `Verified contributions`: counts toward target.
- `Submitted for review`: does not count yet.

Example:

```text
Funding progress
PHP 2,400 verified of PHP 3,000 target
4 verified contributors
2 payments waiting for vendor review
Deadline: July 18, 2026, 9:00 PM
```

Reasoning:

- This prevents contributors from believing submitted but unverified payment proofs already secured the booking.
- It matches the data-model decision that contribution records are the funding source of truth and only vendor-verified contributions advance the target.

## Deadline Warning States

Recommended warnings:

- More than 24 hours left: low-emphasis deadline text.
- Less than 24 hours left: yellow alert.
- Less than 2 hours left: orange alert and stronger share CTA for organizer.
- Deadline passed: terminal expired state with refund message.

Do not offer deadline extension in v1. The resolved settings decision also excludes participant swapping and single-payer fallback conversion, so shortfalls continue into the existing funding-failure refund path.

## Funded State

When full verified funding is reached:

- Stop accepting new contributors by default.
- Move the campaign to `funded_pending_vendor_review`.
- Show that the group has paid enough, but the booking is not confirmed yet.
- Vendor receives a review task.
- Customer-facing pages say the slot is still subject to vendor approval.

Recommended copy:

> Funding is complete. The vendor now needs to review and approve the booking before it becomes confirmed.

## Failed Target and Refund Recovery

When the target is not reached before deadline:

- Campaign becomes `expired_funding_failed`.
- Contributors see `Refund pending`.
- Organizer sees the full campaign summary and refund progress by contribution count, not private proof details.
- Vendor admin/staff with payment permissions handles manual refund action.

Contributor refund states:

- `Refund pending`
- `Refund in progress`
- `Refund completed`
- `Refund issue reported`

Contributor sees only their own refund evidence and notes. Organizer sees aggregate refund progress unless the organizer is also the contributor.

## Privacy and Abuse Defaults

Recommended v1 defaults:

- Organizer-selected visibility: `Private link only` or `Public on vendor profile`.
- Contributor display uses first name plus initial or masked display, unless the contributor chooses otherwise.
- Payment proof and references are visible only to the paying contributor and authorized vendor users.
- Organizer cannot see contributor payment proof.
- Contributors cannot message each other in v1.
- Report abuse is available from campaign pages.
- Rate limit join/payment proof submission attempts.
- Expired and rejected campaigns remain visible to participants for refund tracking.

## Open Decision For Review

Accepted answer: v1 supports both private-link and public-on-vendor-profile campaigns. Public campaigns appear in a separate `Group-funded` tab under the vendor profile `Booking options` section.
