# Group-funded composed-visit lifecycle

Type: grilling
Status: resolved
Claimed by: Codex (/root)
Blocked by: 01, 02

## Question

How should the established group-funded lifecycle consume the composed-visit contract while preserving immutable contributor terms, per-item review holds, vendor replacement-slot behavior, and safe customer/public representations?

## Known direction

The organizer locks selected services, per-item units, arrangement, calculated intervals, and total when creating the campaign. A replacement slot changes time only; it does not silently change the funded composition.

## Resolution must decide

1. Whether current parallel-only campaign records can be migrated compatibly to the shared contract.
2. How vendor review presents sequential item intervals and validates per-item holds.
3. The exact replacement-slot eligibility and contributor-visible communication rules.

## Resolution

1. Existing campaigns and campaign items are backward-compatible parallel compositions. The migration defaults their parent arrangement and item execution mode to `parallel`; their stored start/end timestamps remain unchanged.
2. A group-funded campaign locks its ordered composition, item units, arrangement, calculated intervals, total, and payment requirement at creation. Vendor review presents the customer-facing Together/Back-to-back arrangement plus every item interval. It revalidates and holds each item independently using the shared composed-visit capacity contract.
3. A replacement proposal may be made only for a fully funded eligible campaign. The vendor supplies one new visit start; the server recomputes every item interval from the locked composition, order, and arrangement. The proposal cannot modify services, units, item order, price, payment requirement, or contributor terms.
4. Creating a replacement proposal releases any existing review holds and reserves nothing while the organizer decides. The organizer alone accepts or declines. Acceptance revalidates every item and creates fresh per-item review holds; decline terminates the campaign through the existing vendor-rejected/manual-refund path.
5. Contributors have no action controls. While a proposal is pending, they can see the proposed date/time and a neutral `Organizer is reviewing a new time` status. Accepted, declined, refund, and confirmed outcomes remain visible through the existing campaign status/update path without exposing private organizer or vendor notes.

## Resolution comment

This preserves the existing campaign authority, refund, audit-event, and hold lifecycle while making all scheduling transitions composition-aware. The final rollout ticket must translate these rules into schema/API compatibility and regression slices.
