# GetPrio Context

GetPrio is a service marketplace where scheduled service requests and same-day queue operations work together without becoming the same concept.

## Language

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
