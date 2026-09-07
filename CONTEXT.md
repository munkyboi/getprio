# GetPrio Context

GetPrio is a service marketplace where scheduled service requests and same-day queue operations work together without becoming the same concept.

## Language

**Free Plan**:
The zero-price Vendor Subscription Plan automatically activated for every newly approved vendor to provide queue-only access. It is an explicit active subscription with Platform Admin-controlled entitlements, never the absence of a subscription.
_Avoid_: Trial plan, no subscription, implicit fallback access

**Free Plan Backfill**:
The rollout assignment that creates an active Free subscription for every approved vendor with no existing subscription history. Existing active paid subscriptions remain unchanged, while suspended, cancelled, delinquent, or otherwise restricted subscriptions require their explicit lifecycle outcome rather than silent conversion.
_Avoid_: Paid-plan replacement, restriction bypass, no-subscription fallback

**Legacy Entitlement Conversion**:
The one-time classification of an existing subscription's full entitlement snapshot against the plan defaults that existed when conversion began. Values equal to that baseline become inherited live defaults, deliberate or ambiguous differences become reviewable legacy Tenant Entitlement Overrides, and newly introduced entitlements are never inferred from unrelated legacy fields.
_Avoid_: Full-snapshot override, silent difference loss, comparison against post-rollout defaults

**Migration Usage Baseline**:
An immutable opening Allowance Ledger entry that attributes usage already completed in the current Subscription Allowance Period before live allowance accounting begins. Exact Queue Ticket and Booking facts are retained; Queue Email Journey usage uses only evidence that can be correlated to a ticket and never invents consumption from an unlinked delivery.
_Avoid_: Mutable starting counter, historical guess, Free Plan backfill usage

**Subscription Transition**:
A recorded future or immediate change from one Vendor Subscription Plan to another with a reason, effective time, and lifecycle state. Paid upgrades take effect after confirmed payment, while a paid downgrade or voluntary Paid Plan Exit remains scheduled until the current paid service term ends; restricted payment states are not transitions to Free.
_Avoid_: Direct plan-field edit, delinquency downgrade, unrecorded cancellation

**Recent Authentication**:
A server-verified authentication event on the current session that is fresh enough to authorize a sensitive action. It records the factor and time actually verified by GetPrio; a client assertion, request header, remembered confirmation screen, or Queue Join OTP is never evidence of Recent Authentication.
_Avoid_: Client-confirmed MFA, access-token age, queue verification, checkbox confirmation

**Privileged Transaction Confirmation**:
A short-lived, one-use authorization that binds a privileged actor's Recent Authentication to the exact action, target, reason, and server-calculated impact they reviewed. Any change to those facts invalidates the confirmation and requires a new review.
_Avoid_: Generic MFA flag, reusable approval, confirmation of client-supplied impact

**Operational Capacity View**:
The Vendor Staff-safe view of whether new Queue Tickets and Queue Email Journeys are available, the remaining operational amount or exhaustion state, reset timing, fallback guidance, and confirmation that admitted work continues. It excludes plan prices, purchases, receipts, credit-lot provenance, override reasons, refunds, disputes, and commercial history.
_Avoid_: Billing read access, credit ledger, plan administration, hidden purchase button

**Security Audit Event**:
An immutable accountability fact stating who attempted or completed a security-relevant action, under which role and session assurance, against which tenant and resource, with what reason, outcome, and sanitized before-and-after effect. Audit history may be corrected only by linked compensating events and its own access is audited.
_Avoid_: Editable activity note, raw request dump, application console log, secret-bearing payload

**Paid Plan Exit**:
A vendor-requested paid subscription cancellation retains paid entitlements through the current period and then transitions to an active Free subscription. `unpaid`, `past_due`, and `suspended` subscriptions remain restricted until payment recovery or explicit Platform Admin resolution and do not automatically receive Free access.
_Avoid_: Immediate voluntary downgrade, delinquency-to-Free conversion, silent restriction bypass

**Paid Plan Upgrade**:
A successful upgrade payment activates the higher paid plan immediately and begins a new Subscription Allowance Period with fresh base Queue Ticket, Queue Email Journey, and Booking limits. Purchased and granted credits carry forward unchanged, while scheduled downgrades remain effective only at the current paid period's end.
_Avoid_: Delayed upgrade, inherited lower-plan usage period, credit reset

**Free Queue Allowance**:
The Free Plan's included operating capacity: one location, one counter, one vendor seat, 500 Queue Tickets and 500 Queue Email Journeys per month, seven-day queue history, QR joining, a GetPrio-branded public queue page, and the basic queue dashboard and required settings. It excludes custom branding, Marketplace Discovery, Service Booking Access, and Group-Funded Campaign Access.
_Avoid_: Unlimited free usage, Economical Plan, trial allowance

**Plan Queue Allowance**:
The monthly Queue Ticket and Queue Email Journey limits assigned by Vendor Subscription Plan: Free includes 500 of each, Economical 1,000 of each, Pro 5,000 of each, and Enterprise 50,000 of each. Ticket and journey usage remain separate counters even when their plan limits are equal.
_Avoid_: Shared usage pool, unlimited Enterprise usage, annual allowance

**Subscription Allowance Period**:
The subscription-specific monthly period in which base Queue Ticket, Queue Email Journey, and Booking allowances are measured and reset together. Free renews monthly from activation; paid plans use monthly windows anchored to their PayMongo-confirmed activation even when billed annually. Purchased and non-expiring granted credits persist, while expiring promotions follow their own timestamps.
_Avoid_: Calendar-month quota, annual usage period, credit reset, separate feature periods

**Allowance Ledger**:
The immutable history of Queue Ticket, Queue Email Journey, and Service Booking capacity reservations, consumption, releases, reversals, and adjustments, including the subscription period or Usage Credit lot that supplied each unit. Current balances are derived from this history and may be repaired without deleting or rewriting it.
_Avoid_: Mutable counter, notification-delivery count, deletable usage history

**Allowance Reservation**:
A short-lived hold on Queue Ticket or Service Booking capacity created before a customer enters a payment checkout whose successful fulfillment will create the metered work. It guarantees bounded fulfillment, releases when the checkout safely fails, cancels, or expires, and does not count as committed usage until the business record is created.
_Avoid_: OTP reservation, permanent hold, committed consumption

**Queue Email Journey**:
A single metered customer-notification flow attached to one successfully created Queue Ticket, covering up to ten logical emails: as many as four Queue Join OTP messages and six ticket-lifecycle messages through a terminal outcome. Carry-over retains the journey, a Replacement Queue Ticket starts another, and abandoned OTP attempts, failed deliveries, retries, and duplicate events do not consume another journey unit.
_Avoid_: Transactional email, individual email delivery, unlimited ticket messaging

**Logical Queue Email**:
One durably queued OTP or lifecycle message occupying one protected Queue Email Journey slot. Provider retries preserve its identity and do not add messages; permanent failure keeps the slot failed, and neither failure nor under-delivery refunds the Journey.
_Avoid_: Provider attempt, retry email, replaceable failed slot

**Queue Email Journey Lifecycle Slots**:
The six once-only email moments protected within one Queue Email Journey: Ticket Joined; First Near Turn; First Called; Exception for skipped or pending carry-over; Continuation for carry-over activation or a later call; and Final Outcome for served, cancelled, unserved, expired, or a skipped ticket finalized at Queue Day close. Duplicate events never fill another slot, unused slots remain unused, and Final Outcome stays reserved while status-page and Web Push updates may represent every transition.
_Avoid_: First-six event stream, duplicate lifecycle email, unreserved terminal notice

**Queue Email Journey Eligibility**:
A successfully created Queue Ticket qualifies for one Queue Email Journey only when it has a valid customer email and email updates enabled. Earlier Queue Join OTP emails attach to that journey, while SMS-only, email-opted-out, abandoned, and journey-exhausted attempts consume no journey.
_Avoid_: OTP-time consumption, email-address-only eligibility, abandoned-attempt usage

**Queue Email Journey Mode**:
The immutable email-admission result recorded when a Queue Ticket is created: metered Journey or journey-exhausted. Later allowance recovery never starts email for an exhausted ticket, carry-over retains the mode, and only a Replacement Queue Ticket makes a fresh decision.
_Avoid_: Mid-journey admission, retroactive journey charge, carry-over recheck

**Queue Email Journey Opt-Out**:
The customer's suppression of unqueued lifecycle email for an already metered Journey without refunding its unit. Re-enabling email during the active ticket permits only future unused slots; suppressed events are never backfilled, while already queued messages and non-email history retain their normal outcomes.
_Avoid_: Journey refund, event backfill, queued-message recall

**Plan Queue-Join Fee**:
The Platform Admin-controlled customer fee policy attached independently to each Vendor Subscription Plan, including Free. Platform Admin may enable or disable the fee and adjust its amount without changing the plan's Queue System Access or monthly allowances.
_Avoid_: Vendor subscription price, fixed Free fee, tenant-authored join fee

**Queue Allowance Exhaustion**:
The state reached when a vendor has consumed its effective monthly Queue Ticket allowance. GetPrio blocks new Queue Tickets before any queue-join payment begins while allowing existing tickets and carry-over to finish; creation resumes after the billing-period reset, a plan upgrade, or application of Usage Credits.
_Avoid_: Existing-ticket cancellation, post-payment rejection, silent overage

**Usage Credit Pack**:
A vendor add-on that contains positive quantities of both Queue Ticket and Queue Email Journey credits. The quantities may differ, while the initial packs are `P100` for 100 of each, `P500` for 500 of each, and `P1000` for 1,000 of each.
_Avoid_: Cash balance, customer queue fee, zero-resource retail pack, separate ticket and email packs

**Usage Credit Pack Catalog**:
The Platform Admin-controlled set of Usage Credit Packs available to vendors. Platform Admin may add, remove, edit, disable, or enable packs without changing base plan allowances.
_Avoid_: Hard-coded pack list, vendor-authored pack, plan entitlement

**Usage Credit Pack Revision**:
An immutable version of one stable catalog-pack identity containing its name, Ticket quantity, Journey quantity, price, currency, and purchase settings. Each Platform Admin edit publishes a new current revision for future checkouts; earlier revisions remain for audit and purchase history, and rollback publishes another revision rather than deleting history.
_Avoid_: Mutable catalog history, duplicate visible pack, historical revision deletion

**Usage Credit Pack Pricing**:
The initial purchase prices are `P100` at PHP 99, `P500` at PHP 399, and `P1000` at PHP 699. Platform Admin may edit a pack's name, Queue Ticket quantity, Queue Email Journey quantity, price, currency, purchase availability, and enabled state.
_Avoid_: Fixed code price, subscription price, customer queue-join fee

**Usage Credit Pack Archival**:
A pack with no checkout, purchase, lot, grant, refund, or other commerce and credit reference may be deleted while its lifecycle audit retains a tombstone snapshot; once referenced, removal archives it instead. Disabled packs are temporarily unavailable and may be re-enabled, while archival is a terminal retirement that cannot be edited or restored. Both states leave vendor purchase options, while historical records retain their captured pack name, quantities, price, and currency and previously acquired credits remain valid.
_Avoid_: Destructive referenced-pack deletion, archived-pack restoration, retroactive pack edit, balance invalidation

**Usage Credit Acquisition**:
A vendor on any subscription plan, including Free, may purchase an enabled Usage Credit Pack through self-service billing. Platform Admin may also grant or revoke credits for support, correction, promotion, refund, or dispute handling only with a required reason and audit record.
_Avoid_: Free-only credits, unaudited balance edit, customer-purchased queue credit

**Usage Credit Grant**:
A reasoned Platform Admin acquisition that may add Queue Ticket and Queue Email Journey quantities independently, including zero for either resource, without requiring a retail Usage Credit Pack. Each non-zero quantity becomes its own promotional lot and may carry the grant's optional expiration.
_Avoid_: Forced paired grant, vendor-authored grant, base-plan mutation

**Usage Credit Revocation**:
A reasoned Platform Admin removal of a selected Queue Ticket or Queue Email Journey quantity from a promotional or purchased lot's unconsumed, unreserved balance. Consumed history and credits protecting an active Allowance Reservation remain untouched, and a request above the revocable balance is rejected instead of creating a negative balance.
_Avoid_: Consumed-credit deletion, reservation clawback, negative balance

**Usage Credit Payment Dispute**:
The recovery state entered when a PayMongo dispute or chargeback affects a fulfilled Usage Credit purchase. Unused, unreserved credits from that purchase freeze while active reservations remain protected; consumed units become a Platform Admin recovery case rather than a negative balance. Resolution either restores the frozen credits or revokes the remaining unused units.
_Avoid_: Immediate reserved-credit clawback, consumed-history deletion, negative credit debt

**Usage Credit Lot**:
An immutable, resource-specific allotment of Queue Ticket or Queue Email Journey credits created by one fulfilled purchase or Platform Admin grant. It retains its captured quantity, source, acquisition time, and optional promotional expiration; later corrections are separate grant, revocation, refund, dispute, or adjustment records rather than edits to the lot.
_Avoid_: Editable issued balance, shared Ticket/Journey lot, retroactive catalog update

**Usage Credit Purchase Fulfillment**:
A self-service credit purchase grants one captured Queue Ticket lot and one Queue Email Journey lot only after PayMongo confirms payment, with one immutable purchase record and idempotent fulfillment across webhook and manual synchronization. Failed, cancelled, expired, or repeated payment events grant nothing extra, while the vendor receives a receipt and balance-history entry.
_Avoid_: Checkout-created balance, duplicate webhook grant, mutable purchase snapshot

**Usage Credit Checkout Snapshot**:
The immutable pack name, Queue Ticket quantity, Queue Email Journey quantity, price, and currency captured when a PayMongo credit checkout is created. That checkout may fulfill its snapshot until its existing expiry even if Platform Admin later edits, disables, or archives the catalog pack; catalog changes affect only new checkouts.
_Avoid_: Fulfillment-time catalog lookup, retroactive price change, disabled-checkout cancellation

**Usage Credit Purchase**:
One quantity-one Usage Credit Pack acquired through one PayMongo checkout, producing one immutable purchase record, one receipt, and one captured Queue Ticket lot and Queue Email Journey lot after confirmed payment. A vendor starts another checkout to acquire another pack.
_Avoid_: Multi-pack cart, mutable checkout quantity, shared refund across purchases

**Usage Credit Purchase Refund**:
An entirely unused and unreserved paid credit purchase may be refunded and, after confirmed refund, both captured credit lots are revoked. Consumption or an active Allowance Reservation against either lot blocks automatic refund until eligible; exceptional partial handling requires a reasoned Platform Admin adjustment, preserves audit history, and never creates a negative balance.
_Avoid_: Reserved-credit refund, automatic partial refund, negative credit balance, archive-triggered refund

**Usage Credit Refund Window**:
The seven-calendar-day period after PayMongo captures payment in which a Vendor Owner or Vendor Admin may request a full refund for an entirely unused Usage Credit Pack. After the window, only a reasoned Platform Admin exception is allowed; Vendor Staff cannot request a refund.
_Avoid_: Indefinite self-service refund, staff refund, partially consumed automatic refund

**Usage Credit Refund Processing**:
The provider-confirmed lifecycle for refunding an eligible Usage Credit Purchase made through a PayMongo payment method that supports refunds. Both unused lots freeze while the request is pending, revoke only after PayMongo confirms the refund, and return to their prior availability if PayMongo rejects or fails it.
_Avoid_: Over-the-counter credit purchase, request-time revocation, unconfirmed refund success

**Usage Credit Monetary Adjustment**:
A reasoned Platform Admin exception for returning a specific currency amount after either lot in a Usage Credit Purchase has been consumed. It is not an automatic per-credit refund: only unused, unreserved credits may be revoked, consumed history remains unchanged, and the monetary amount is recorded independently because pack price is not divided between Ticket and Journey units.
_Avoid_: Calculated partial refund, consumed-credit clawback, hidden cash adjustment

**Usage Credit Expiration**:
Purchased Usage Credits remain available until consumed and do not disappear at a subscription billing reset. Platform Admin-granted promotional credits may carry an explicit expiration date; absence of one makes the grant non-expiring. At expiration, unconsumed and unreserved units become unavailable, while units protecting an active Allowance Reservation remain valid until it commits or safely ends; a later release returns them to expired state rather than reviving them.
_Avoid_: Monthly paid-credit reset, hidden expiration, reservation invalidation, released-credit revival

**Usage Credit Expiration Notice**:
A once-only Vendor Owner/Admin dashboard and unmetered vendor-account email notice sent seven days and again 24 hours before a promotional Usage Credit lot expires. Vendor Staff sees only the resulting operational capacity impact, not grant provenance or monetary details.
_Avoid_: Metered warning email, staff billing disclosure, repeated expiry spam

**Usage Credit Consumption**:
Queue Ticket and Queue Email Journey credits are independent balances even when acquired together. Each counter consumes its current monthly Plan Queue Allowance first, then the nearest-expiring promotional grant, then the oldest non-expiring promotional grant, and finally the oldest purchased credits.
_Avoid_: Shared depletion, paid-credit-first usage, synchronized balances

**Queue Email Journey Allowance Exhaustion**:
The state reached when a vendor has consumed its effective Queue Email Journey allowance. Queue operations continue and in-app or Web Push delivery remains available, while new metered queue-email journeys pause; authentication, password-reset, security, billing-receipt, and legal or compliance emails remain unmetered.
_Avoid_: Queue shutdown, security-email suppression, all-email quota

**Journey-Exhausted Queue Verification**:
An email Queue Join OTP sent without consuming a Queue Email Journey when ticket capacity remains but journey capacity is exhausted. The customer may join, receives no later lifecycle email for that ticket, and instead follows status-page, in-app, and Web Push updates.
_Avoid_: Queue-intake shutdown, negative journey balance, hidden update loss

**Queue OTP Resend Policy**:
A Queue Join OTP permits at most three resends after the initial code, with resend countdowns increasing by 1.5 times from 300 seconds: 300, 450, then 675 seconds. After the third resend, further requests are blocked and the customer receives a clear, customer-friendly instruction to try again later.
_Avoid_: Unlimited resends, flat resend timer, one-time OTP email

**Queue OTP Chain**:
The durable verification attempt that owns one initial Queue Join OTP and up to three resends for the same tenant, recipient, and join intent. Each resend issues the chain's newest valid code and invalidates the earlier code, provider retries reuse the same code, and successful Queue Ticket creation attaches the chain to its Queue Email Journey.
_Avoid_: Independent OTP rows, simultaneously valid resend codes, retry-created code

**Queue OTP Verification Attempt Limit**:
The chain-wide maximum of five incorrect code entries across the initial Queue Join OTP and all resends. Reaching it invalidates the active code and blocks verification, resending, and replacement-chain creation for 30 minutes without revealing whether the recipient belongs to an account.
_Avoid_: Per-code attempt reset, unlimited guesses, identity-revealing error

**Queue OTP New-Chain Limit**:
The layered abuse boundary for initial and replacement Queue OTP Chains: anonymous customers pass Turnstile, while all customers remain limited to two chains per tenant and normalized recipient per hour, five per day, and twenty per tenant and IP per hour. Resends reuse the active chain without another challenge, and rate-limit responses remain identifier-neutral.
_Avoid_: QR-only challenge, resend challenge, recipient enumeration, unlimited fresh chain

**Abandoned Queue OTP Chain**:
A Queue OTP Chain that never results in a Queue Ticket and therefore consumes no Queue Email Journey or Journey capacity. A verified chain awaiting a fulfillable queue-fee checkout is still pending rather than abandoned; only the chain that ultimately creates the ticket attaches to its Journey, while failed, cancelled, safely expired, and earlier restarted chains remain unmetered audit history.
_Avoid_: OTP-time journey charge, payment-pending abandonment, retroactive chain merge

**Queue OTP Restart Lockout**:
The 30-minute recovery period beginning when a customer uses the third Queue Join OTP resend. It blocks resending and replacement-chain creation without blocking verification: the newest code remains usable for its normal 15-minute lifetime, after which the customer waits for the displayed restart countdown before beginning again.
_Avoid_: Permanent lockout, immediate restart, generic rate-limit error

**Queue System Access**:
The plan-controlled ability for a vendor to configure and operate GetPrio's live queue, including the minimum business identity, location, hours, counter, public queue, and queue-notification surfaces needed for operation. It does not by itself grant marketplace, booking, campaign, analytics, export, or branding capabilities.
_Avoid_: Full vendor access, booking access, unrestricted dashboard access

**Queue Entitlement Wind-Down**:
The controlled state entered when Queue System Access is removed during an active Queue Day: new joins, walk-ins, booking check-ins, restorations, and later Queue Days stop, while staff finish existing tickets and the current day reaches normal outcomes. Customer ticket status and notifications remain available, and pending carry-over expires normally unless queue access returns before its deadline.
_Avoid_: Abrupt queue deletion, new-ticket grace period, indefinite carry-over suspension

**Public-Facing Branding**:
The plan-controlled ability for a vendor's brand presentation to appear across every vendor-owned public page, not only the public queue board. The entitlement covers presentation rather than access to the underlying public feature.
_Avoid_: Queue-board branding, marketplace access, public-page access

**Standard Public Presentation**:
The GetPrio-controlled layout, colors, typography, and attribution used when Public-Facing Branding is disabled. Vendor name, logo, service images, and factual business information remain visible so customers can identify the business; enabling branding applies the vendor's configured visual theme consistently across its public profile, service, booking, queue, campaign, and status pages.
_Avoid_: Anonymous vendor page, vendor-custom theme, hidden business identity

**Marketplace Discovery**:
The plan-controlled ability for a vendor and its eligible public offerings to appear in GetPrio marketplace search and discovery surfaces. Direct operational queue pages are not marketplace discovery.
_Avoid_: Public queue access, vendor dashboard access, direct-link visibility

**Direct Public Access**:
The continued availability of an entitlement-backed public page through its direct URL when Marketplace Discovery is disabled. Queue links remain available with Queue System Access, booking links remain available with Service Booking Access, customer record links remain available, and Public-Facing Branding applies independently to the pages that still exist.
_Avoid_: Marketplace listing, search visibility, entitlement bypass

**Service Booking Access**:
The plan-controlled ability for a vendor to offer and manage scheduled service Bookings, subject to a separate monthly booking limit. It is independent from Queue System Access even though a confirmed Booking may later create a Queue Ticket through check-in.
_Avoid_: Queue access, unlimited bookings, service catalog visibility

**Monthly Booking Limit**:
The maximum number of Bookings a vendor subscription may create during its billing period: Free permits 0, Economical 100, Pro 1,000, and Enterprise 10,000 by default. Platform Admin may edit the numeric limit independently from the plan's Service Booking Access switch.
_Avoid_: Monthly ticket limit, service limit, booking-history limit

**Booking Allowance Consumption**:
One monthly booking unit is consumed when GetPrio successfully creates a Booking, regardless of its later status; validation failures do not count, and rescheduling, Service Bundle items, or an attached Group-Funded Booking do not add units. Checking in consumes a separate Queue Ticket unit when the Booking enters the live queue.
_Avoid_: Per-service-unit charge, per-status charge, campaign booking charge

**Group-Funded Campaign Access**:
The plan-controlled ability for eligible customers to create and operate Group-Funded Bookings attached to a vendor's qualifying Bookings or Service Bundles. It depends on Service Booking Access and does not grant independent queue or marketplace access.
_Avoid_: Generic crowdfunding, vendor-managed collections, booking access

**Plan Entitlement**:
A capability or usage limit defined by Platform Admin on a Vendor Subscription Plan and applied immediately as the default for every current subscription on that plan. It remains authoritative unless the subscription carries a deliberate Tenant Entitlement Override.
_Avoid_: Pricing-page copy, signup-time snapshot, client-side feature flag

**Live Plan Allowance Change**:
A Platform Admin edit to a plan limit applies immediately without rewriting consumed usage or producing a negative balance. Lowering a limit may place current subscriptions into exhaustion, raising it restores capacity, the editor previews affected subscriptions, and the before-and-after values are audited.
_Avoid_: Usage reset, deferred plan default, silent subscriber impact

**Allowance Usage Warning**:
A once-per-period vendor notice emitted independently at 80, 90, and 100 percent consumption of Queue Tickets, Queue Email Journeys, or Service Bookings. Notices appear in the vendor dashboard and by unmetered vendor-account email, explain the affected capability, and link to upgrade or Usage Credit Pack actions where applicable.
_Avoid_: Customer warning, metered warning email, repeated threshold spam

**Plan Feature Defaults**:
All four plans initially enable Queue System Access; Free disables Public-Facing Branding, Marketplace Discovery, Service Booking Access, and Group-Funded Campaign Access; Economical enables discovery, booking, and campaigns but not branding; Pro and Enterprise enable all five controls. Platform Admin may change these defaults through Plan Entitlements.
_Avoid_: Hard-coded feature matrix, UI-only visibility, immutable paid-tier access

**Campaign Entitlement Dependency**:
Group-Funded Campaign Access requires Service Booking Access. Disabling booking also disables new campaign creation, while existing campaigns remain available under Entitlement Wind-Down until they reach a terminal state.
_Avoid_: Standalone campaign access, destructive campaign shutdown, client-only dependency

**Tenant Entitlement Override**:
A sparse, explicitly recorded exception that replaces one or more Plan Entitlements for a specific vendor subscription without copying the plan's complete entitlement set. Unspecified capabilities continue to inherit current values from the subscription's plan.
_Avoid_: Full entitlement snapshot, hidden plan fork, stale subscription defaults

**Tenant Entitlement Override Governance**:
Only Platform Admin may create, edit, expire, or reset a Tenant Entitlement Override, with a required reason and immutable audit record; an optional expiration returns the value to its current plan default. Platform subscription views distinguish inherited and overridden values and provide an explicit `Reset to plan default` action.
_Avoid_: Vendor-authored override, silent exception, copied plan snapshot

**Allowance and Credit RBAC**:
Vendor Admin/Owner may view detailed usage, balances, prices, receipts, and purchase or plan actions; Vendor Staff sees only the remaining capacity and exhaustion state needed for operations. Platform Admin alone controls plans, packs, overrides, grants, revocations, refunds, and their audit records.
_Avoid_: Staff billing access, vendor-authored catalog, hidden operational capacity

**Entitlement Wind-Down**:
The non-destructive state entered when a subscription loses Service Booking Access, Group-Funded Campaign Access, or Marketplace Discovery. New restricted activity stops immediately, while existing bookings and campaigns remain accessible through completion, customer records remain available, and vendor data is preserved for a later upgrade.
_Avoid_: Data deletion, immediate workflow abandonment, permanent archival

**Entitlement Admission**:
The server-recorded decision that a new Queue Ticket, Booking, Group-Funded Campaign, or bounded customer payment checkout may begin while its required Plan Entitlement is effective. Work admitted before a live entitlement change may finish under Entitlement Wind-Down, while OTPs, browser drafts, and other uncommitted intent do not create admission.
_Avoid_: Page-load permission, client-side flag, unlimited grace period

**Booking**:
A customer's scheduled request for a vendor service at a selected future time. A booking reserves service intent and schedule, but it is not part of the live same-day queue until check-in.
_Avoid_: Appointment, reservation, queue ticket

**Group-Funded Booking**:
An organizer-led collection campaign attached to one already-paid, vendor-confirmed scheduled Booking or Service Bundle. It is category-agnostic and lets contributors reimburse or share the organizer's cost; it never gates vendor confirmation, capacity, or service execution. Its deadline must precede the booking's scheduled start. A campaign that misses its target or deadline closes without changing the underlying booking, which remains the organizer's responsibility.
_Avoid_: Vendor-funded booking, pooled queue ticket, shared wallet booking

**Service Bundle**:
A fixed resource or service package made from active branch services at one vendor branch, delivered during one shared visit and scheduled as one booking. A Service Bundle can be used by a standard booking or a group-funded booking; only the funding, review, and contribution lifecycle differs. It may combine resources in parallel, such as renting VIP Court and Court 1 at the same time, or services sequentially, such as a haircut followed by a shave. Its immutable bundle total is the sum of its selected branch-service prices.
_Avoid_: Multiple bookings, service cart, independent service requests

**Bundle Execution Mode**:
The customer-selected visit arrangement for a Service Bundle, subject to server-side availability and capacity validation. The customer-facing labels are `Together` for parallel and `Back-to-back` for sequential. A parallel bundle starts selected services at one shared visit start and reserves each service's own capacity interval, so the visit ends after the longest selected service. A sequential bundle reserves the selected services back-to-back and uses their summed duration as the visit length. The scheduler disables an arrangement that the selected services cannot support and explains why.
_Avoid_: Service category rule, global bundle policy, client-authorized overlap

**Booking Organizer**:
The customer who starts and controls a group-funded booking. The organizer owns the booking details, is the main vendor-facing contact, and may cancel the funding-stage booking before the funding target is reached.
_Avoid_: Host account, booking owner group, co-admin participant

**Booking Contributor**:
A participant who joins a group-funded booking by paying the required contribution toward the funding target. A contributor helps fund the booking but does not control the booking lifecycle like the organizer does.
_Avoid_: Co-owner, unpaid joiner, booking admin

**Group-Funded Contribution**:
A payment share represented by a campaign contributor's submitted proof toward an organizer-defined collection goal for a vendor-validated booking. A submitted contribution temporarily reserves one contributor position; only an organizer-accepted contribution counts toward the campaign target. Contribution evidence, organizer decisions, and reimbursement state belong to the contribution rather than to the normal booking payment proof fields.
_Avoid_: Booking payment proof, checkout line item, participant balance

**Organizer-Collected Contribution**:
A payment that a campaign contributor sends directly to the Booking Organizer after the organizer's booking has already been paid and vendor-validated. It is separate from the vendor booking payment and is never vendor settlement. GetPrio may record contribution proofs and organizer decisions, but the organizer manages collection and any reimbursement between participants.
_Avoid_: Vendor payment, booking checkout, platform-held funds

**Role-Scoped Trust Rating**:
A post-interaction five-star rating that records reliability and conduct for a specific relationship. Each eligible rater leaves one rating per qualifying interaction: completed Booking, contribution review, or campaign closure. Customers publish vendor ratings after completed service. Vendors rate Booking Organizers after service completion, Organizers rate contributors after contribution review, and contributors rate Organizers after campaign closure. Individual-user ratings are private to authorized roles; vendor ratings are public. Private user ratings are reusable only as aggregate summaries for a later role-relevant decision, without rater identities or private comments and without automatic blocking in v1. Aggregate ratings use a minimalist gold-star plus numeric-value display; rating input uses five selectable stars.
_Avoid_: Public user reputation score, anonymous account review, pre-service rating

**Vendor Review Revision**:
One customer-controlled update to a public Vendor rating made within seven days of submission. The original and replacement are retained in an audit history, and the Vendor may post one moderated public reply.
_Avoid_: Unlimited review rewriting, untracked deletion, vendor-authored customer review

**Low-Rating Reason**:
A required structured category attached to a one- or two-star rating, such as payment issue, no response, or service mismatch. It supplies moderation context without requiring a long narrative; any comment remains optional.
_Avoid_: Forced public complaint, unstructured low-rating evidence, mandatory long-form review

**Rating Dispute**:
A report or appeal filed within 30 days of a rating. The disputed rating is excluded from aggregate calculations while Platform Admin reviews it. A public vendor comment may be temporarily hidden for abuse, personal-data exposure, or clear falsehood; a private rating remains inaccessible outside the case during review.
_Avoid_: Public retaliation, permanent aggregate impact during appeal, unreviewable rating

**Campaign Visibility**:
The audience an organizer permits to view and join an Organizer-Collected Contribution campaign. Share-link visibility is the default and requires the organizer's direct link. Public visibility requires both the organizer's explicit opt-in and the booked service's vendor-level public-listing permission; it lists a privacy-minimized campaign to signed-in customers and exposes no payment proofs, contact details, or private trust ratings.
_Avoid_: Public payment ledger, anonymous campaign access, vendor dashboard listing

**Campaign Discovery Ranking**:
The default order for signed-in public campaign listings: nearest campaign deadline first, then newest published campaign. Customers may filter by vendor, branch, service, and date; funding amount, contributor count, and ratings do not influence rank in v1.
_Avoid_: Pay-to-rank campaign, popularity ranking, trust-score ranking

**Public Campaign Profile**:
The privacy-minimized campaign information visible in signed-in discovery and a pre-join page: vendor, branch, service or bundle, booking schedule, organizer display name, campaign title/description, join fee, aggregate progress, contributor-slot count, deadline, and report action. It excludes payment instructions, reference numbers, evidence, contact details, private ratings, and reimbursement data.
_Avoid_: Public payment profile, contributor roster, public trust record

**Public Campaign Publication Limit**:
The anti-spam cap that permits an organizer at most two active public campaigns and at most one campaign per Booking. An organizer with a frozen campaign or unresolved Reimbursement Dispute cannot publish another public campaign until the case resolves.
_Avoid_: Unlimited campaign promotion, duplicate booking campaigns, dispute bypass

**Campaign Abuse Controls**:
Server-enforced protections for public campaign creation, publishing, editing, joining, and reporting: authenticated-account scope checks, structured content validation/moderation, account and IP rate limits, hidden honeypot fields, duplicate/rapid-submission detection, audit events, and Platform Admin freeze/review authority. These controls never expose payment evidence or let automated reports permanently remove a campaign.
_Avoid_: Client-only spam checks, automatic mass-report removal, public evidence review

**Campaign Control Center**:
The mobile-first customer-account management surface for an organizer-collected campaign. It is reachable from the linked confirmed Booking and the customer's campaign list, and centralizes campaign setup, publication, contribution review, reimbursement, disputes, and history. Its hero prioritizes funding progress, join fee, booking schedule, contributor count, and one campaign-level share action. It is not a vendor-dashboard feature.
_Avoid_: Vendor campaign console, booking-status editor, public campaign page

**Campaign Draft**:
The private, editable campaign configuration created from a paid, confirmed Booking before publication. It inherits locked booking and service details while the organizer supplies campaign-specific collection details. It accepts no contributors and does not change the normal Booking when discarded.
_Avoid_: Pending booking, unpublished vendor service, contributor reservation

**Contributor Reservation**:
A temporary claim on one required contributor position created when a contributor submits payment proof. It prevents additional contributors from submitting once all positions are claimed, does not count as verified funding, and ends when the vendor rejects the proof or the campaign reaches its funding deadline.
_Avoid_: Booking capacity hold, verified contribution, waitlist entry

**Group-Funded Refund**:
An organizer-side manual reimbursement obligation linked to an accepted Organizer-Collected Contribution after campaign cancellation or another collection-failure outcome. GetPrio tracks the reason, organizer evidence, and contributor confirmation; the organizer performs the actual money return outside the platform. A campaign is completely canceled only when every affected contributor has confirmed receipt.
_Avoid_: Vendor refund, automatic gateway refund, platform payout reversal

**Contributor Refund Confirmation**:
The contributor's explicit acknowledgement that an organizer reimbursement has been received. It is the authoritative completion signal for that reimbursement; organizer-submitted refund evidence alone is insufficient to finish a canceled campaign.
_Avoid_: Organizer assertion, automatic refund completion, vendor verification

**Contribution Proof Rejection**:
The organizer's documented decision that a submitted contribution proof cannot be accepted. The organizer must give a reason; the proof releases its contributor slot and the contributor may submit one corrected proof before the campaign deadline. A rejected proof does not itself establish a reimbursement obligation.
_Avoid_: Silent rejection, vendor rejection, automatic refund

**Contribution Evidence Access**:
The role-scoped ability to view a contribution payment proof or reimbursement proof. During normal operation it belongs only to the relevant contributor and organizer. Vendor users and public viewers never receive it; Platform Admin access requires a report, dispute, or audit case and is logged and time-limited.
_Avoid_: Vendor proof review, public receipt, unrestricted administrator access

**Reimbursement Dispute**:
A contributor's documented refusal to confirm an organizer-recorded reimbursement because the money was not received or was incorrect. The reimbursement remains pending, both parties are notified through their preferred channels, and either party may report it for Platform Admin review. It never automatically completes a reimbursement or changes the underlying Booking.
_Avoid_: Automatic confirmation, booking cancellation, vendor refund dispute

**Booking Slot**:
A customer-selectable time option computed from vendor availability, date exceptions, service duration, requested booking quantity, slot capacity, and existing bookings. Booking slots use the full requested duration as the customer-facing start interval, so a 60-minute service booked for two units advances in two-hour starts. Slots are not stored as standalone schedule records in the MVP.
_Avoid_: Appointment slot, time record, calendar event

**Booking Units**:
A vendor-configured option on a service that lets customers request more than one unit of the base service duration. Vendors can enable units per service and set the customer-facing label, such as Hours or Courts. Services without units enabled always book one base-duration unit.
_Avoid_: Global booking quantity, item count

**Booking Availability**:
The vendor-managed bookable service schedule for a branch, optionally narrowed by service and capacity. If booking availability is not configured, branch store hours define the default bookable window.
_Avoid_: Store hours, calendar

**Booking Capacity Scope**:
The resource boundary whose remaining capacity a booking item consumes. A service-scoped rule isolates capacity to that service. A location-scoped rule represents one shared branch pool and has one authoritative capacity across every service using that rule. Each overlapping booking item consumes one unit of its applicable scope; booking units extend that item's reserved duration rather than consuming extra capacity units.
_Avoid_: Customer-selected capacity, per-service override of a shared pool, booking quantity as seat count

**Booking Alert**:
A customer-facing notification for booking status changes such as confirmation, reschedule, cancellation, and check-in readiness. Email alerts are always available. Browser notification preferences and in-app alerts are separate from true Web Push delivery, which requires a service worker, Push API subscription, and backend Web Push send pipeline.
_Avoid_: Queue alert, reminder, message blast

**In-App Operational Alert**:
A dashboard or account-page alert shown while the web app is open, such as a vendor overlay for a new queue join or new booking. These alerts can be driven by SSE and background queries and must remain available even after OS/browser Web Push is implemented.
_Avoid_: Web Push, SMS, email

**Web Push Notification**:
An OS/browser notification delivered through the browser Push API after a logged-in user grants permission and the backend stores a push subscription. Web Push is best-effort and should route users back into authenticated GetPrio pages for sensitive details.
_Avoid_: In-app alert, toast, SMS

**Customer Contact Preference**:
A customer's selected, permitted delivery channel for non-emergency GetPrio notifications. Campaign and reimbursement notifications use this preference while retaining an in-app notification record. Future native-app silent pushes may refresh campaign state in the background but contain no payment evidence or other sensitive details.
_Avoid_: Mandatory marketing contact, proof-data push payload, unaudited notification

**Booking Verification**:
The OTP step that verifies a customer's booking contact details before a booking request is created. Booking verification carries forward to the linked queue ticket, so the customer does not repeat OTP verification at check-in.
_Avoid_: Queue OTP, login verification

**Manual Booking Payment**:
A customer-to-vendor payment made outside GetPrio for a booking, using the vendor's accepted InstaPay QR wallet or bank payment channel. GetPrio records the payment state and evidence, but does not process or settle the money.
_Avoid_: Checkout, gateway payment, platform payment

**Location Payment QR**:
The branch-specific InstaPay QR payment destination shown to customers for payment-required services at that location. A vendor can require payment per service while reusing the selected location's payment QR as the payment destination.
_Avoid_: Vendor wallet, service QR, checkout QR

**Payment-Required Service**:
A vendor service that requires manual booking payment before the vendor can confirm the booking. Payment requirement is decided per service because different services from the same vendor can have different upfront payment rules.
_Avoid_: Paid vendor, paid booking flow

**Payment Evidence**:
The customer-submitted reference number and proof image showing that a manual booking payment was sent. Payment evidence stops pending booking expiration, but the booking remains unconfirmed until a vendor-side user verifies payment.
_Avoid_: Receipt validation, payment confirmation, proof of checkout

**Booking Cancellation**:
The customer or vendor action that ends a booking before service completion. Customers may cancel before check-in while the booking is still eligible, but cancellations after vendor acceptance or confirmation forfeit customer payment under the current policy. Late check-in and no-show outcomes are non-refundable, and manual refunds are handled by the vendor rather than by GetPrio.
_Avoid_: Refund request, void, queue cancel

**Refund Policy**:
The customer-facing rules that explain when a booking payment is refunded, forfeited, or handled case-by-case. For the current booking flow, vendor-initiated cancellation before service delivery gets a full refund, customer cancellation after vendor acceptance or confirmation forfeits payment, and any manual refund is processed by the vendor.
_Avoid_: Chargeback policy, platform settlement rule

**Pending Booking Expiration**:
The time limit for unresolved pending booking requests. Pending bookings hold capacity until a vendor-side user confirms, reschedules, cancels them, or the pending booking expires.
_Avoid_: Auto-reject, booking timeout

**Checked-In Booking**:
A confirmed booking whose customer has arrived for service-day execution and has been placed into the live queue by a vendor-side user. Its Queue Ticket receives checked-in priority and the same one-time carry-over protection as other waiting tickets.
_Avoid_: Auto-queued booking, appointment ticket

**Unfulfilled Booking**:
A terminal Checked-In Booking for which service was not delivered before its linked Queue Ticket became unserved or expired. It is distinct from completion, cancellation, and no-show, and makes the vendor-handled full-refund obligation explicit.
_Avoid_: Completed booking, customer cancellation, confirmed booking

**Missed Booking**:
A terminal Checked-In Booking whose customer missed the called queue turn and was not restored before the Queue Day closed. It is distinct from no-show because the customer checked in, and it follows the existing non-refundable missed-turn policy.
_Avoid_: No-show, unfulfilled booking, customer cancellation

**Check-In Window**:
The allowed arrival period around a confirmed booking's scheduled start time. For the MVP, the default check-in window is 15 minutes before through 15 minutes after the scheduled start time, with vendor-side override for late arrivals.
_Avoid_: Grace period, attendance window

**Queue Ticket**:
A customer's tracked place in a vendor's service queue, with a stable lookup identity and a Queue Day-specific display number. Carry-over preserves the ticket identity but receives a fresh display number when attached to the later Queue Day.
_Avoid_: Booking, appointment, reservation

**Queue Day**:
A location-scoped period of queue operation for one local business date, with an `unopened`, `open`, or `closed` lifecycle; an overnight Queue Day belongs to the local date on which its store-hours interval begins. Store hours make a Queue Day eligible to open, but an authorized Vendor-Side User must open it explicitly; reaching opening time never opens it automatically.
_Avoid_: Store hours, paused queue, auto-close phase

**Effective Store Hours**:
The location-local interval that makes a business date eligible for a Queue Day. Missing or explicitly closed hours make the date ineligible, different opening and closing times form a same-day or overnight interval, and equal times on an active day mean a 24-hour interval.
_Avoid_: Queue Day status, queue opening, global app time

**Unopened Queue Day**:
A business date whose Queue Day has not been opened and whose Effective Store Hours have not ended. Opening is unavailable before the interval begins, becomes eligible during the interval, and never happens automatically.
_Avoid_: Closed store, paused queue, automatically open queue

**Closed Queue Day**:
A Queue Day whose live operation has ended, or whose Effective Store Hours ended without it ever opening. An early manually closed Queue Day may be reopened only within its snapshotted interval and before its current close deadline; an auto-closed, reconciled, or never-opened day remains closed.
_Avoid_: Paused queue, closed store, permanently unavailable location

**Queue Intake Mode**:
The accepting-or-paused condition of an open Queue Day. Pausing blocks joins, check-ins, walk-ins, paid-ticket issuance, and skipped-ticket restoration while allowing staff to process existing tickets; it does not close the Queue Day or stop its auto-close schedule.
_Avoid_: Queue Day status, store closure, auto-close phase

**Queue Auto-Close Phase**:
The time-relative condition of an open Queue Day as its scheduled close approaches: normal, warning, extended, or overdue. It is separate from the Queue Day lifecycle and Queue Intake Mode.
_Avoid_: Queue Day status, intake pause, draining state

**Queue Day Reconciliation**:
The repeatable process that compares a Queue Day's durable state with its authoritative deadline and applies any missing warning, close, or ticket outcomes. Periodic, startup, and request-time attempts have the same meaning; repeated attempts do not duplicate outcomes.
_Avoid_: Timer-owned close, manual repair, duplicate close

**Queue Day Repair**:
A reason-required, fully audited Platform Admin recovery action used only when normal Queue Day Reconciliation cannot restore a trustworthy state. It is not routine queue operation and does not grant Platform Admins authority to open, pause, extend, close, or reopen queues on a vendor's behalf.
_Avoid_: Queue operation, reconciliation retry, silent state edit

**Queue Day Lifecycle Event**:
An immutable, actor-attributed record of a Queue Day warning, lifecycle or intake transition, deadline change, reconciliation result, ticket-outcome batch, or repair. It preserves the previous and resulting state plus operational context needed to explain what happened without becoming the mutable source of current Queue Day state.
_Avoid_: Application log, editable history note, current Queue Day row

**Queue Ticket Carry-Over**:
The one-time continuation of an unresolved waiting Queue Ticket into the vendor location's next eligible open queue day. A closed day does not consume this opportunity; the ticket remains ahead of new same-day joins when the next queue day is manually opened.
_Avoid_: Indefinite rollover, elapsed-day timeout, skipped-ticket recovery

**Pending Queue Ticket Carry-Over**:
An unresolved Queue Ticket in explicit `pending_carry_over` status while waiting up to seven calendar days between Queue Days for the first later eligible Queue Day that staff actually open. It is not live waiting and receives no position or near-turn notification until attached; merely reaching or skipping a calendar date does not consume its one carry-over opportunity.
_Avoid_: Future-dated active ticket, predicted next-day ticket, repeated rollover

**Queue Ticket Expiration**:
The terminal system outcome for a carried-over Queue Ticket that remains unresolved when its one allowed carry-over Queue Day closes, or for pending carry-over that waits seven calendar days without another Queue Day opening. It is distinct from customer- or vendor-initiated cancellation.
_Avoid_: Cancellation, repeated carry-over, silent deletion

**Unserved Queue Ticket**:
The terminal outcome for a called Queue Ticket that remains incomplete when its Queue Day closes. Staff must explicitly extend the Queue Day to keep the called ticket live; closing records and explains the unserved outcome rather than silently abandoning it.
_Avoid_: Waiting ticket, cancellation, skipped ticket

**Skipped Queue Ticket**:
A Queue Ticket whose customer missed the called turn and may be restored only while the same Queue Day remains open and accepting intake. If that Queue Day closes first, the skipped outcome becomes terminal and never carries over.
_Avoid_: Cancelled ticket, unserved ticket, pending carry-over

**Replacement Queue Ticket**:
A new Queue Ticket created by an authorized Vendor-Side User to accommodate a customer after an earlier ticket reached a terminal outcome. It links to the original ticket for accountability without changing or reviving the original outcome.
_Avoid_: Reopened ticket, edited ticket history, restored terminal ticket

**Queue Auto-Close Extension**:
An authorized vendor-side decision to keep an open queue operating for 30 additional minutes after its current scheduled closing time. Extensions may repeat, but each requires a fresh explicit and auditable decision during the new warning period; an unattended queue still closes at its current deadline.
_Avoid_: Permanent auto-close cancellation, silent after-hours operation, indefinite queue opening

**Queue Operating Window**:
The open Queue Day's snapshotted Effective Store Hours plus any audited Queue Auto-Close Extensions. An accepting queue may continue receiving Queue Tickets throughout this window without changing the location's recurring store hours or booking availability.
_Avoid_: Recurring store hours, booking availability, permanent hours override

**Service Workflow**:
A post-MVP vendor-defined chain of service steps or counters attached primarily to a service. A queue ticket moves through the workflow while keeping the same ticket number; if no service workflow exists, the ticket follows the simple live queue model.
_Avoid_: Separate queues, appointment flow, department ticket

**Vendor-Side User**:
A vendor owner, vendor admin, or vendor staff member who performs day-to-day work for a vendor business.
_Avoid_: Vendor user, merchant account
