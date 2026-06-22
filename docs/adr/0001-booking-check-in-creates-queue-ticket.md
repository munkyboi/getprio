# Booking check-in creates the queue ticket

Bookings reserve a future service time, while queue tickets represent same-day live execution. GetPrio will not auto-create a queue ticket when a booking is submitted or confirmed; a booking creates or links to a queue ticket only when a vendor-side user checks the customer in. This keeps MVP booking, queue ordering, notification carry-forward, and future multi-counter service workflows clear without making scheduled bookings compete in the live queue before the customer arrives.
