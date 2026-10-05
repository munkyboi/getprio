# Branch resource configuration

## Current slice

Vendor Admins configure the selected branch under Locations → Resources → Service resources. Both `tenant.location.manage` and `tenant.service.manage` are required on the server for reads and writes. Resource pools are named generic shared capacity, such as rooms, chairs, courts, or staff positions; they do not represent verified staffing or availability.

Pool capacity is 1–100 simultaneous units, with at most 50 pools per branch. Each active service offered at that branch can have one pool requirement of 1–100 simultaneous units, limited to the pool capacity. The foundation supports one pool per service and at most 500 requirements through this API. Multiple resource types for one service remain future work.

Booked duration and quantity are separate from simultaneous units. For example, three hourly slots for Court 1 require one court unit for that service item's scheduled interval. Three court service items require three simultaneous units when each maps to the shared court pool. Do not configure three units merely because a booking is three hours long.

Saved requirements remain visible and removable when a service becomes inactive or is no longer offered at the branch. Pool editing cannot lower capacity below an existing requirement. Removing a requirement is reversible by assigning it again; pools are retained and can be renamed or resized. Configuration versions reject stale edits with 409; Refresh loads current data after confirming discard when a form has changes. Add and Edit use separate actions; only one inline form is open at a time. Editor versions are captured when the form opens, and switching forms, canceling, removing a requirement, or refreshing asks before discarding changed fields. Removal uses the existing compact confirmation modal. The Locations page keeps tab panels mounted, preserving a resource draft when switching between Locations, Resources, and Counters. These guards apply inside the resource panel; switching dashboard sections or locations remains a separate navigation acceptance gate. The server locks the scoped branch for coherent reads and serialized writes. All pool/service IDs are server-validated and scoped, with foreign keys preserving branch and tenant ownership.

## API

Authenticated vendor routes (including existing versioned mounting):

- `GET /api/vendor/tenant/:tenantSlug/locations/:locationSlug/resources`
- `PUT` same route with current `version` and one action:
  - `pool`: `name`, `capacity`, optional `poolId` for editing.
  - `requirement`: `serviceId`, `poolId`, `unitsRequired`.
  - `removeRequirement`: `serviceId`.

Unknown fields, including `tracking_enabled`, are rejected. Database tracking remains constrained to false. Responses contain draft pools, requirements, available service names, a configuration version, and `trackingAvailable: false`.

## Operational boundaries

This configuration feeds the existing read-only reservation projection audit. It does not allocate resources, block conflicting bookings, gate Call next or Start service, derive walk-in resource needs, change availability, or alter customer wait estimates. Staff service timing remains an independent observation. Service timing does not prove resource occupancy.

Next: design ticket service plans, transactional allocation and release, and reservation concurrency controls before lifting the tracking constraint. Multi-service bundles, overlapping resource demand, unlinked walk-ins, interruptions, closure recovery, and pooled versus individually identified resources need explicit handling. Customer prediction rollout remains on hold.

## Verification

Static checks and hosted CI are separate from runtime acceptance. No local database migration or test suite is run for this implementation request. Local environment restoration is blocked by Bitwarden CLI authentication. Before operational acceptance, verify authorized/denied roles, branch isolation, stale versions, invalid IDs, duplicate names, capacity reductions, inactive/unassigned services, and concurrent saves against an isolated database. Inspect the stacked inline forms at mobile, tablet, desktop, short-height, and keyboard viewports. Inline editors follow a single-column mobile layout, and the existing compact confirmation modal handles removal and unsaved panel edits. Verify focus on editor open, confirmation dismissal and return, and small/keyboard viewport behavior. Number fields hide undersized spinner controls while preserving 44-pixel inputs.
