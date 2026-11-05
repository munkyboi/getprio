# Ticket service-plan capture

## This slice

Additive issuance snapshots for Vendor Portal queues. Booking check-in captures each bundle item's service, stored interval, derived duration, and current resource mapping in the same transaction as its ticket. Customer and staff check-in share this path; no QR scan is required. Scheduled offsets and execution mode are preserved. Duration comes from each stored interval; booking quantity never multiplies resource units.

The walk-in form offers an optional active service at the selected branch. Authorized queue staff can see the minimum operational catalog (ID, name, duration), without gaining administrative catalog access. Issuance captures that service's catalog duration and configured resource demand. Omitting selection preserves the simple-vendor workflow. An invalid or changed service rejects issuance transactionally.

`ticket_service_plans` stores immutable JSON item snapshots with scoped ticket/booking foreign keys. It contains no actual occupancy, allocations, or model output. Missing mappings are explicitly `known: false`; they are not zero resource demand. Edits to catalog durations or resource configuration cannot rewrite existing plans. Future allocation must validate the referenced pool and current reservations before starting service.

No historical backfill. Existing/unselected tickets return `source: unknown` with an empty item list. This means unknown service needs, not a service-free ticket. No queue ordering, service timing, customer estimate, notification preference, or booking completion behavior changes.

## Authorized diagnostic reads

- `GET /api/vendor/tenant/:tenantSlug/queue/service-options?location=:locationSlug`
- `GET /api/vendor/tenant/:tenantSlug/queue/tickets/:ticketId/service-plan?location=:locationSlug`

Both require `tenant.queue.operate` and the existing staff branch-access checks. Plan reads return version, source, execution mode, item snapshots, capture time, and explicit `allocationEnabled: false` / `customerEstimateChanged: false`. They expose no actor identities. Public/customer routes do not expose this internal plan.

## Remaining work

- Plan assignment/revision UI for already-issued mobile/QR and walk-in tickets, with revision conflicts and service-start guards.
- Developer API independent queues need their own service/duration contract and project/environment scope; they do not have the Vendor Portal service catalog. This slice does not change that API or infer services from printed/scanned tickets. Unknown developer service needs remain unknown. Coverage must never depend on scanning a ticket.
- Staff-approved duration overrides, multi-service walk-in bundles, expired booking intervals, and explicit plan revisions before allocation.
- Transactional resource allocation/release and shared reservation locking.
- Shadow estimates and temporal holdout evaluation before customer publication; AI inference remains off.

The prediction audit now includes [distinct-ticket temporal evaluation diagnostics](wait-time-evaluation.md). These measure stored time-to-call predictions; they neither consume service plans as occupancy nor evaluate a trained model.

## Verification and release

Static lint/type checks and hosted CI are separate from runtime proof. Do not apply the migration to a local or live database as part of authoring. Use the normal migration/deployment pipeline. Required runtime checks: booking bundles retain interval durations and independent resource units; retry check-in does not duplicate a plan; invalid/cross-branch service selection creates neither ticket nor plan; staff choices respect branch access; print-only tickets capture selected plans without scanning; unmapped services remain unknown; existing unselected tickets remain usable.

A failed plan insert rolls back ticket creation and booking linkage. Database restoration requires preserving this additive table; the migration does not reinterpret historical tickets. Backend code must roll back before dropping the table. Local authenticated preview/database acceptance is pending restoration of the required ignored GetPrio environment.
