# GetPrio Context

GetPrio is a service marketplace where scheduled service requests and same-day queue operations work together without becoming the same concept.

## Language

**Booking**:
A customer's scheduled request for a vendor service at a selected future time. A booking reserves service intent and schedule, but it is not part of the live same-day queue until check-in.
_Avoid_: Appointment, reservation, queue ticket

**Booking Slot**:
A customer-selectable time option computed from vendor availability, date exceptions, service duration, slot capacity, and existing bookings. Booking slots use 30-minute customer-facing intervals by default and are not stored as standalone schedule records in the MVP.
_Avoid_: Appointment slot, time record, calendar event

**Booking Availability**:
The vendor-managed bookable service schedule for a branch, optionally narrowed by service and capacity. If booking availability is not configured, branch store hours define the default bookable window.
_Avoid_: Store hours, calendar

**Booking Alert**:
A customer-enabled notification for booking status changes such as confirmation, reschedule, cancellation, and check-in readiness. Email alerts can be included by default, while SMS booking alerts require explicit customer opt-in and may carry a platform-managed fee; verified and paid booking alert choices carry forward to the linked queue ticket after check-in.
_Avoid_: Queue alert, reminder, message blast

**Booking Verification**:
The OTP step that verifies a customer's booking contact details before a booking request is created. Booking verification carries forward to the linked queue ticket, so the customer does not repeat OTP verification at check-in.
_Avoid_: Queue OTP, login verification

**Pending Booking Expiration**:
An optional post-MVP vendor setting that automatically cancels pending booking requests after a configured waiting period. In the MVP, pending bookings hold capacity until a vendor-side user confirms, reschedules, or cancels them.
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
