# Booking arrival creates the queue ticket

Bookings reserve future service time. Queue tickets track arrival and live queue progress. Submitting or confirming a booking does not create a queue ticket.

Staff can check a customer in. A branch admin may also enable customer arrival in Locations → Edit location → Booking arrival. This is off by default for existing and new branches. The customer booking page then offers **I’ve arrived** from 15 minutes before until 15 minutes after the booked start. This is a customer declaration, not verification of physical presence. Staff retains late check-in override and customers without the app can still use staff check-in.

Both paths use the same booking row lock and create/link one ticket atomically. Customer access requires authenticated booking ownership, branch opt-in, an active branch/vendor, an eligible booking, the arrival window, and open queue intake. Customer retries return the existing linked ticket. Customers cannot request a late override or choose the ticket’s priority or channel.

A checked-in booking cannot be called before its scheduled start. Ready waiting tickets appear before bookings whose scheduled start is still in the future; existing priority rules apply among ready tickets. Early arrivals retain their linked ticket and schedule guidance. Near-turn notifications skip bookings that cannot yet be called.

Arrival, being called, and actual service execution are separate concepts. This slice gates calling by schedule; it does not introduce actual service sessions, resource allocation, or occupancy-based readiness. Those require the generic resource workflow described in `docs/plan/queue-resource-occupancy.md`. Vendors without resource tracking retain the existing call/serve workflow.
