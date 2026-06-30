# GetPrio Context

GetPrio is a service marketplace where scheduled service requests and same-day queue operations work together without becoming the same concept.

## Language

**Booking**:
A customer's scheduled request for a vendor service at a selected future time. A booking reserves service intent and schedule, but it is not part of the live same-day queue until check-in.
_Avoid_: Appointment, reservation, queue ticket

**Booking Slot**:
A customer-selectable time option computed from vendor availability, date exceptions, service duration, requested booking quantity, slot capacity, and existing bookings. Booking slots use the full requested duration as the customer-facing start interval, so a 60-minute service booked for two units advances in two-hour starts. Slots are not stored as standalone schedule records in the MVP.
_Avoid_: Appointment slot, time record, calendar event

**Booking Units**:
A vendor-configured option on a service that lets customers request more than one unit of the base service duration. Vendors can enable units per service and set the customer-facing label, such as Hours or Courts. Services without units enabled always book one base-duration unit.
_Avoid_: Global booking quantity, item count

**Booking Availability**:
The vendor-managed bookable service schedule for a branch, optionally narrowed by service and capacity. If booking availability is not configured, branch store hours define the default bookable window.
_Avoid_: Store hours, calendar

**Booking Alert**:
A customer-facing notification for booking status changes such as confirmation, reschedule, cancellation, and check-in readiness. Email alerts are always available, while browser notifications use the browser's notification permission after login and can cover booking and queue updates.
_Avoid_: Queue alert, reminder, message blast

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
A confirmed booking whose customer has arrived for service-day execution and has been placed into the live queue by a vendor-side user. Checked-in bookings receive a queue priority above normal walk-ins, but below carry-over and missed-ticket recovery.
_Avoid_: Auto-queued booking, appointment ticket

**Check-In Window**:
The allowed arrival period around a confirmed booking's scheduled start time. For the MVP, the default check-in window is 15 minutes before through 15 minutes after the scheduled start time, with vendor-side override for late arrivals.
_Avoid_: Grace period, attendance window

**Queue Ticket**:
A customer's active place in a vendor's same-day service queue, identified by its own queue ticket number. A queue ticket represents service-day execution and begins only when the customer joins or checks in to the live queue.
_Avoid_: Booking, appointment, reservation

**Service Workflow**:
A post-MVP vendor-defined chain of service steps or counters attached primarily to a service. A queue ticket moves through the workflow while keeping the same ticket number; if no service workflow exists, the ticket follows the simple live queue model.
_Avoid_: Separate queues, appointment flow, department ticket

**Vendor-Side User**:
A vendor owner, vendor admin, or vendor staff member who performs day-to-day work for a vendor business.
_Avoid_: Vendor user, merchant account
