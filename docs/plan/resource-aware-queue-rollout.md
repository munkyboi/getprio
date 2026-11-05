# Optional resource-aware queue scheduling

Status: proposed plan, 3 October 2026. Documentation only; implementation and deployment are separate work.

## Outcome

Let vendors optionally manage queue priority, service requirements, resource capacity, duration, and reservations together. Product wording is **Resource tracking**; the scheduling concept is resource-aware queue scheduling, an application of multi-dimensional queueing.

This is the product and delivery companion to [the resource-occupancy design](queue-resource-occupancy.md). That document defines the session lifecycle, capacity ledger, transaction rules, and estimate semantics. Implement both consistently.

For the combined multi-stage and multi-dimensional initiative, [Queue Workflows and resource-aware scheduling](queue-workflows-and-scheduling.md) owns the integrated scope, station model, and delivery sequence. This document remains the resource-only detail.

## First-release scope

- Configuration is optional per service and location, off by default.
- Support interchangeable resource pools with integer capacity and one pool requirement per service. Multiple services can share a pool.
- Support reservations, vendor-issued walk-ins, and customer/mobile tickets through the same operational service plan.
- Require a selected service, valid duration, and explicit resource demand for tracked work. Player count and existing booking quantity do not determine court demand.
- Start with single-service sessions. Represent a two-court session through an explicit two-unit requirement, for example a separately configured two-court service. Do not let clients invent demand values.
- Preserve existing queue priority and order within a shared pool; allow independent pools to progress independently. No automatic bypass to fit shorter sessions ahead of earlier tickets in the same pool.
- Staff explicitly start and complete sessions. Estimates do not automatically call customers or release capacity.
- Named-court selection, multi-pool requirements (court plus coach), bundle execution, dynamic priority scoring, and AI estimates are later extensions. Existing bundles must remain untracked or be rejected for activation until supported; never partially track their capacity.

## Four-court example

| Configuration | Value |
| --- | --- |
| Location | Main branch |
| Resource pool | Pickleball courts |
| Capacity | 4 |
| Services | One-hour court rental; two-hour court rental |
| Requirement | 1 court per session for either service |
| Duration | 60 or 120 minutes from the selected service |

One pool means any available court. Staff can direct players to a physical court outside the allocation model; the first release cannot promise or enforce a particular court number. If specific court assignment is essential for the pilot, add named-unit allocation before launching that pilot.

At most four one-court groups can be active concurrently. Starting the first group clears its called ticket from queue progression, allowing the next group to be called and started while the first session continues. A fifth group waits. A free court cannot accept a two-hour walk-in if that would consume capacity protected by an upcoming reservation.

## Optional setup flow

Entry point: Administration → Queue setup → Resources tab, with contextual links from the vendor service editor, scoped to a location. The completed [interview decision record](vendor-dashboard-workflow-decisions.md) establishes an explicitly enabled pilot for standalone resource tracking; permanent resource-tier limits/pricing remain deferred. Queue Workflows separately requires Pro.

1. Ask **Does this service require an available space or resource?** Default: No.
2. On Yes, choose an existing pool or create one with a label and capacity.
3. Set units required and service duration, using the existing duration model where compatible. Link related services to the same pool.
4. Save as Draft. Show a summary, such as **4 courts · 1 court per session · 60 minutes**.
5. Run activation checks: future reservations, queued tickets without plans, unsupported bundles, invalid durations, mapping gaps, and services competing for the same physical capacity.
6. Resolve conflicts and confirm Enable. Revalidate the preview against current data in the activation transaction; a stale preview cannot authorize overbooking.

States: **Off → Draft → Enabled**. Draft changes have no operational effect. Enabled services require complete plans across all issuance channels. Shared physical resources must be mapped explicitly; unknown demand prevents trustworthy availability.

Reducing capacity or changing mappings requires reconciliation of future reservations. Disabling requires no active sessions and reconciliation of waiting plans and future reservations. If the system feature gate is closed, keep tracked starts disabled but retain authorized completion of existing sessions; never fall back to Serve for active tracked work.

## Vendor and customer behavior

- Vendor Admin configures resources and enables tracking. Authorized location staff call, start, complete, end early, or request an extension.
- Queue view shows waiting groups, required resources, and why a start is blocked. Use **Start session** for court rentals and **Start service** where appropriate.
- Active sessions appear separately with actual start, expected end, units occupied, and completion actions. Expired expected end shows Overdue and remains occupied.
- Booking check-in inherits its service plan. Walk-in/mobile issuance collects the required service before a tracked ticket can be issued.
- Customers see Waiting, Called, In service, and Completed from the combined ticket/session state. Customer cancellation must not silently terminate an active session.
- Keep customer confirmation requirements and location-scoped authorization. Public displays disclose no internal resource audit or customer identity details.
- Design configuration and operations mobile-first; validate narrow, tablet, desktop, keyboard, and long-content states.

## Scheduling rules

Use one shared capacity ledger for booking availability, reservations, starts, rescheduling, extensions, and wait projections. Count a checked-in reservation and its corresponding active session once. Use server time and half-open intervals.

Check capacity for the complete requested interval, including future reservations. Allocate atomically under pool locks shared with booking writes. Make start/completion retries idempotent. A called ticket holds no actual occupancy; a service start creates the allocation. Expected end never releases it.

The first release preserves the existing priority policy rather than introducing a new score. Earlier eligible work blocks later work in the same pool even when a later short session would fit. Show the reason; audit any existing authorized staff skip operation. Do not claim that this first release maximizes utilization or adds waiting-time aging.

Reservation timing remains relevant after check-in. Late arrivals retain the booked end unless staff explicitly revise the plan and available capacity permits an extension. Sessions can cross midnight and remain completable after queue closure.

## Delivery plan

| Phase | Deliverable | Exit requirement |
| --- | --- | --- |
| 1. Contracts and foundation | Pool/requirement schema, service-plan contract, scoped repositories, shared reservation ledger, read-only diagnostics | Migrations verified; demand and reservation conflicts are inspectable; customer behavior unchanged |
| 2. Optional configuration | Off/Draft/Enabled setup, shared-pool mapping, reconciliation and activation validation | Cannot enable an incomplete or conflicting configuration; ordinary services retain existing behavior |
| 3. Operational integration | Plans on every ticket channel; transactional start/complete/end-early/extension; booking integration; customer session status | Four concurrent sessions work; fifth is blocked; concurrent bookings and starts cannot overbook |
| 4. Shadow estimates | Project starts using sessions, reservations, service duration and queue order; record predictions versus actual starts | Coverage and error measured by service/pool; unknown or overdue occupancy handled explicitly |
| 5. Pilot and publication | Sandbox four-court walkthrough, then opt-in location pilot; enable resource estimates for validated pools | Staff can complete daily workflows; no allocation violations; agreed estimate-quality targets met |

Phase 2 can save Draft configurations, but activation is gated until Phase 3 booking and session paths are complete. Operational tracking can pilot before resource estimates are published. Keep the baseline estimate source visibly identified where it is still used; return Estimate unavailable when no reliable projection exists. Establish numeric accuracy targets from shadow observations before publication.

Before implementation, compare the owning branch and any existing resource foundation work to avoid duplicating migrations or contracts. Verify current source behavior; this plan is not proof of a deployed feature.

## Validation and release checks

- Ordinary vendor: existing issuance, call, confirmation, serve, skip, and booking completion continue unchanged.
- Four-court pool: four starts succeed; a fifth is blocked; completion makes one unit available; a two-unit request requires two units throughout its interval.
- Shared services: one-hour and two-hour rentals compete for the same four units.
- Reservation: reject a walk-in that overlaps protected capacity; checked-in demand is counted once; cancellation/no-show policy releases reservations correctly.
- Concurrency: simultaneous starts and booking submissions cannot exceed capacity; retries cannot allocate or release twice.
- Order: preserve existing priority; a blocked earlier same-pool ticket is not silently bypassed; unrelated pools can proceed.
- Lifecycle: overdue, early end, extension, midnight crossing, and queue closure do not lose occupancy or block authorized completion.
- Activation/configuration: stale previews, missing plans, unsupported bundles, future conflicts, and active-session disable attempts fail safely.
- Security: enforce tenant/location and role scope on the server, including real-time updates; record actors and reasons.
- Customer: all channels receive coherent session status; historical served tickets are not reinterpreted as active sessions.

Track allocation violations, rejected conflicts, missing service plans, overdue sessions, prediction coverage/error, and staff corrections during the pilot. Review database-enabled integration tests for the ledger and lifecycle, plus mobile-first UI walkthroughs. Stop new tracked intake if operational integrity fails while keeping session completion available. Preserve additive history and audit data during rollback.

## Recommended next implementation

Deliver Phase 1 as a reviewable change: schema and scoped repositories, one shared reservation ledger adapter, and read-only four-court diagnostics. Keep activation off. Review its contracts before building the setup and live-session UI.
