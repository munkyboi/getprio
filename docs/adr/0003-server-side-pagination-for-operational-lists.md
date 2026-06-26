# Server-side pagination for operational lists

GetPrio will use page-number server-side pagination for high-cardinality operational lists: vendor bookings, vendor history, vendor clients, customer bookings, and customer queue tickets. Small setup and configuration tables can remain client-side or unpaginated because they are bounded admin surfaces, while operational lists can grow with customer activity.

Paginated list responses keep their domain-specific collection name, such as `bookings`, `tickets`, or `clients`, and add shared `pagination` metadata with `page`, `pageSize`, `totalItems`, and `totalPages`. Search, filters, and sorting are server-authoritative and applied before pagination; pagination totals describe only the rows the current user is authorized and entitled to see. Live updates refetch the current page without resetting the user to page one, because booking alerts already provide the "new booking" signal.

We chose page-number pagination over cursor pagination because the current tables and Mantine pagination controls benefit from visible totals and direct page navigation. Cursor pagination can be revisited later for feed-like surfaces with much higher write volume.
