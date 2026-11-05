# Queue Workflows and resource-aware scheduling

Status: agreed design direction, reconciled 5 October 2026. Documentation only. The [completed interview decision record](vendor-dashboard-workflow-decisions.md) owns the accepted choices and rationale.

## Product objective and terminology

Allow Vendor Admins to configure a customer's journey through connected service queues and optionally enforce resource and scheduling constraints at each stage.

- **Queue Workflows**: stages, prerequisites, routing, and journey completion. This implements multi-stage queueing.
- **Resource tracking**: capacity, service requirements, duration, reservations, and allocation. Along with priority and stage eligibility, these provide multiple dimensions for scheduling.

These capabilities can be used separately or together. The dashboard uses these concrete names rather than requiring vendors to understand queueing terminology. Programming means a guided configuration of stages and supported rules, not arbitrary executable code.

This document owns the combined scope and delivery sequence. [Resource-aware queue rollout](resource-aware-queue-rollout.md) supplies the single-stage resource setup and four-court example. [Resource occupancy](queue-resource-occupancy.md) supplies the shared ledger and allocation rules. Broader bundle and multi-pool ideas in those documents are later extensions unless explicitly included below.

The vendor dashboard rework uses **shadcn/ui**, following the user-selected [design references and migration brief](vendor-dashboard-rework-design.md). Operations and Administration share this design system.

## Optional modes

| Workflow | Resource tracking | Operational result |
| --- | --- | --- |
| Off | Off | Existing GetPrio queue |
| Enabled | Off | Configured journey through department queues |
| Off | Enabled | One-stage service with capacity control, such as four courts |
| Enabled | Enabled at selected stages | Department journey with capacity checks where needed |

Configuration is location-scoped and mapped explicitly to services/packages. Several services can share a station or resource pool. A workflow never creates a private copy of physical capacity. Unsupported service mappings cannot be activated.

## Vendor dashboard setup

### Operations and Administration workspaces

Use two workspaces within the same vendor application and authenticated session. Vendor Admins have a clearly labeled **Operations / Administration** switch in the dashboard shell. Switching navigates between workspaces without signing out, selecting another account, or consuming another seat. One owner account can configure the business and serve customers; seat accounting remains based on users under the existing subscription rules. Verify the current seat implementation before integration.

Proposed route roots are `/operation` and `/admin` on the vendor host; confirm route migration and legacy links during implementation. Workspace selection is navigation, not a role change or privilege escalation. Server-side permissions and tenant/location scope remain authoritative on every action.

| Workspace | Primary content | Access |
| --- | --- | --- |
| Operations | Station queues, calls, active sessions, journey progress, and operational bookings | Vendor Staff within assigned permissions; Vendor Admin |
| Administration | React Flow workflow builder, stations/resource configuration, services, staff, business settings, and billing | Vendor Admin within existing permissions |

Vendor Staff do not see the Administration switch option and cannot reach administrative actions through direct URLs or API requests. Vendor Admins can switch in either direction. Default the first visit to Operations; remember the most recently used permitted workspace for later visits. Revalidate that choice when membership or permissions change. Keep the current location context when permitted in the destination.

On desktop show the labeled switch in the dashboard header. On mobile provide the same clearly labeled control in the header or navigation sheet without crowding queue actions. Each workspace has its own navigation and an explicit current-workspace label. Warn before leaving unsaved configuration, and prevent navigation that would lose an unresolved operational submission. Switching must not stop server-side sessions or release resources. Verify a free-tier owner can use both workspaces with one account and one login.

Use one **Queue setup** Administration sidebar item opening **Workflows**, **Stations**, and **Resources** tabs, with entity list/detail routes and contextual links from service setup. No nested sidebar submenu is required.

**Queue Workflows requires Pro.** Enforce entitlement server-side for configuration writes, publishing/activation and new workflow admissions. A free-tier owner still uses both workspaces with one seat. Standalone resource tracking starts with an explicitly enabled pilot; permanent resource-tier limits and pricing remain deferred. After Pro ends, block new workflow admissions and configuration editing/publishing while allowing authorized staff to resolve existing version-pinned journeys through readiness, arrival, recovery, completion, cancellation and explicit session termination. Define handling for previously booked but unadmitted workflow visits before implementation.

1. Create or select stations: Reception, Cashier, Laboratory, Imaging, Cardiology, Results release.
2. Create a workflow and map it to a service/package, such as Annual physical examination.
3. Add ordered stages. Set station, stage duration, staff access, completion action, and customer instructions.
4. Optionally attach a resource pool and explicit demand to a stage. A cashier need not track capacity; an imaging stage may require one machine.
5. Set prerequisites and supported completion gates. In the first release these are sequential stage completion and authorized readiness confirmation.
6. Preview a sample customer's path, including blocked stages and missing configuration.
7. Save Draft, validate, and publish a version. Publishing makes it selectable; enabling its service mapping controls new admissions.

Use React Flow for the visual editor from the first release, following the vendor's preferred [Workflow Editor template](https://reactflow.dev/ui/templates/workflow-editor). Initially constrain the graph to a single valid sequential path; the presence of a canvas does not enable branching in the runtime. Templates prefill a draft; they do not silently enable it.

### React Flow editor integration

- Preferred starting point: the official Workflow Editor template, subject to available Pro access. Its published stack is Next.js, Tailwind/shadcn, Zustand, and ELKjs. The inspected GetPrio frontend uses Vite, React, and Mantine; the vendor rework targets shadcn/ui. Adapt the editor to the new shared vendor shadcn design system while retaining the application's framework unless separately changed.
- The template is a Pro offering; React Flow itself is MIT-licensed and open source. Confirm authorized source access and applicable template terms before importing template code. If access is unavailable, build an original editor with the open-source library and public examples; record this as a fallback, not acquisition of the exact template. No purchase or dependency installation is part of this planning change.
- Show Start, Service stage, Readiness gate, and Finish nodes. Stage nodes map to station definitions; gates express supported readiness rules. Edges encode the permitted route. Resource requirements are stage properties linked to the shared pool registry, not newly duplicated pools per node.
- Node selection opens settings for station, duration, permitted staff roles, customer instructions, completion rule, and optional resource requirement. Reuse GetPrio form and modal conventions. Store node coordinates/viewport separately from the authoritative versioned workflow definition: moving a node changes layout, not queue order.
- Provide Add stage, Insert after, Move earlier/later, and connection selection without requiring dragging. On mobile, offer an equivalent ordered stage view and focused settings sheet backed by the same draft. Desktop/tablet canvas and mobile form/list editing must produce identical workflow definitions.
- Validate connections in the editor and revalidate the whole definition on the backend at publish/activation: exactly one start/end, reachable stages, no cycles, no branches in the first release, valid station/gate/resource references, and supported completion rules. Imported or manually altered graph JSON cannot bypass these rules.
- Use the template's runner concept only for synthetic preview/simulation. Live queue progression, readiness, permissions, reservations, and allocations run through GetPrio's server transactions and persisted events; they must continue correctly when the editor browser is closed.
- Include draft persistence, revision conflict handling, unsaved-change protection, keyboard editing, labeled nodes/edges, zoom/fit controls, and automatic layout. Evaluate whether to reuse the template's Zustand/ELKjs choices after reviewing its authorized source.

Official sources: [template features and stack](https://reactflow.dev/ui/templates/workflow-editor), [open-source library and Pro access](https://reactflow.dev/pro), [drag-and-drop interaction approaches](https://reactflow.dev/examples/interaction/drag-and-drop), and [accessibility](https://reactflow.dev/learn/advanced-use/accessibility). Checked 3 October 2026; source-level template compatibility remains unverified.

Configuration states: Draft, Published, Retired. Service mappings are Off or Enabled. Resource setup keeps its own Off/Draft/Enabled lifecycle. Validate that all required capabilities are available before enabling a mapping.

Published versions are immutable. Editing creates a new draft. Existing journeys retain their original version, requirements, and route; new journeys use the newly activated version. Retiring a version prevents new admissions but does not strand active journeys. Moving an active journey to another version is excluded from the first release.

## First release: sequential workflows and optional resources

Support one workflow journey per admission, with a fixed sequence of stages and one active stage queue entry per journey. Each stage maps to one station, may require one interchangeable resource pool, and has an explicit completion rule. Queue-only stages can use call/serve; resource-tracked stages use call/start/complete. A stage may require a readiness confirmation before admission, for example results ready.

Keep the first release bounded: no arbitrary scripts, automatic clinical decisions, branching, loops, simultaneous stage admission, named-unit assignment, multi-pool allocation, or workflow version migration. Service packages can choose separate preconfigured workflows until conditional paths are supported. Existing booking bundles require an explicit validated mapping or remain untracked; do not infer a workflow from item order.

### Laboratory example

Reception → Cashier → Laboratory → Imaging → Cardiology → Results release

This is an example vendor-defined route, not a mandated clinical sequence. Reception confirms the selected package and required path. Each department completes its own stage and releases that stage's resources. The next stage then becomes eligible.

Laboratory completion means the defined patient-facing work is complete, such as required sample collection. It does not assert that analysis or reports are complete. In the first release, an authorized staff member explicitly confirms that all required results are ready before Results release can enter its queue. Capture who confirmed readiness and when; actual report storage, diagnostic interpretation, payment-provider integration, and EMR integration are separate work.

The journey may wait for results across days without remaining in an active service queue or occupying equipment. Only completing Results release completes the journey. A linked booking remains active until the configured journey completion condition is met; serving Reception must not complete it.

### Four-court example

A single Play session stage uses a shared pool with capacity four. One-hour and two-hour rentals each require one unit. Four groups can be in service together; a fifth waits. Demand for two courts is explicit and separate from player count or booking quantity. Future reservations must fit alongside current allocations for the entire requested interval. Physical court numbers are not guaranteed in this pool model.

## Operational lifecycle

One stable customer-facing journey reference links all stage visits. Internal stage queue entries have distinct IDs and station display numbers. Show both the journey reference and current station/number where useful; do not promise the same queue position at every department.

| Stage state | Meaning |
| --- | --- |
| Pending | Prerequisite stage has not completed |
| Awaiting readiness | Predecessor complete, but an explicit readiness gate remains |
| Awaiting arrival | Stage eligible; destination staff have not yet confirmed presence |
| Waiting | Admitted to the station queue after destination staff confirm arrival |
| Called | Staff have invited the customer; no resource allocated yet |
| In service | Actual stage work has started; required resources allocated |
| Completed | Stage finished and its resources released |
| Cancelled | Stage will not proceed under an authorized journey cancellation |

Missed calls and recovery reuse existing queue semantics within the current stage, with staff presence confirmation before recovery. Preserve completed departments; misses do not advance the journey. Optional bypass of required stages is excluded from the first release. Extensions, early endings, and cancellations have explicit policies and audited reasons; ending a session early must not imply successful completion unless staff choose and are authorized for that outcome.

Complete a stage, release allocations, and record next-stage eligibility or readiness wait in one transaction. An eligible destination remains Awaiting arrival until authorized destination staff confirm presence by journey lookup or optional opaque-reference QR. Only then admit one station queue entry and start station waiting time; retries cannot create duplicate downstream tickets. Starting a resource-tracked stage removes its ticket from the called slot but leaves an active session, so the station can call another eligible customer. Stations operate independently; a location-wide single called-ticket slot cannot govern all stations.

Cancellation stops future progression, preserves completed history, closes pending/waiting work and resolves linked booking/reservations under the existing policy. Active allocations remain occupied and visibly unresolved until authorized staff explicitly terminate the active session with a reason; queue closure, cancellation requests, or feature shutdown cannot silently release them. Completion and recovery controls remain available across business dates and after intake is stopped.

Operations owners see a permitted-station overview with Open station actions; one-station businesses open directly. Station pages separate Waiting, Called and In service, with an Awaiting arrival check-in area. Staff see assigned stations and relevant operational journey progress. Onboarding completes basic setup before optional workflow/resource drafts, with a clear Skip preserving ordinary queues.

Customers see current stage, completed stages, next destination, their station queue number, and readiness waits. Public displays show only the minimum queue identifiers. Staff views are station-scoped, with access to the operational details required for that stage. Clinical findings do not belong on queue displays.

## Scheduling policy

Evaluate eligibility first: journey version, prerequisites/readiness, stage state, operating hours, service requirements, and supported reservation rules. Then apply existing priority bands and station admission time with a stable ID tie-breaker. Preserve the original admission metadata for audit, but do not use an old Reception timestamp to jump ahead of people already waiting at Imaging.

Booking priority applies only where explicitly valid under the booking policy; a reservation for the overall visit does not automatically reserve every downstream station. Activation must make clear whether a reservation protects one stage or the whole single-stage service. Until downstream reservation semantics are implemented, reject mappings that require them rather than inventing times.

Check resource demand against the shared reservation/occupancy ledger for the complete expected interval. Earlier eligible work blocks later work competing for the same pool in the first release. Independent stations/pools can progress independently, including across workflows. No new paid priority, shortest-job policy, or automated bypass is introduced.

The resource availability check is authoritative at Start, using the same transaction locks as booking creation/rescheduling. Calling is an invitation, not a capacity guarantee; if availability changes, keep the customer at the stage and explain the conflict. Reservations and their associated active session count once. Expected end is a forecast and never releases capacity.

Stage wait and whole-journey remaining time are different. Begin with stage-level estimates. Do not sum queue positions or label a stage estimate as total visit duration. Readiness delays, service duration, future station congestion, and conditional routes require separate modeling before end-to-end estimates can be published. AI rollout stays on hold.

## Shared architecture and implementation contracts

Additive concepts, with final names chosen during schema design:

- Stations, including tenant/location, access assignments, intake state, and queue-day policy.
- Workflow definitions, immutable versions, ordered stages, service mappings, and supported gate definitions.
- Journeys, admission metadata, pinned version, linked booking, overall state, and customer reference.
- Stage visits/queue entries, station, ordinal, readiness status, timestamps, revisions, and retry keys.
- Service plans, sessions, requirements, resource pools/allocations, and operational events from the resource design.

A journey owns its progress; a stage visit owns its station queue status; a service session owns actual occupancy. Terminal ticket status alone cannot determine journey or booking completion. Pool allocations are shared across all stations/services that use them.

Extend ticket queries, call/serve routes, locks, snapshots, queue-day handling, recovery, notifications, and real-time channels to support station scope. Preserve legacy endpoint contracts for ordinary queues. Do not route workflow stations through a single location-level current-ticket field. Decide the default-station compatibility adapter before changing schema or APIs.

Transactional operations: admit journey, confirm readiness, call/start stage, complete/route stage, terminate session, cancel journey, and activate configuration. Define uniqueness for journey stage admission and active session per stage item. Lock journey/stage and relevant pools in a documented stable order; require revisions/idempotency keys. Version and scope checks run on the server. Revalidate previews before activation.

Vendor Admin publishes configuration. Authorized station staff operate stages. Readiness confirmation requires explicit permission. Customers cannot change prerequisites, demand, readiness, or completion. Apply tenant/location scope to repositories and real-time events, and audit actor/reason for configuration and operational changes.

## Delivery sequence

| Phase | Deliverable | Exit gate |
| --- | --- | --- |
| 1. Contracts and diagnostics | Station compatibility design, workflow/version/journey schema, resource ledger contracts, sample route validation | Owning code and existing foundation work reviewed; migrations and contracts validated; no live behavior change |
| 2. Vendor draft builder | Station setup, React Flow sequential canvas and equivalent mobile stage editor, service mapping, resource setup, synthetic preview | Reject invalid routes, missing permissions/durations, unsupported mappings, and capacity conflicts; activation remains gated |
| 3. Sequential runtime | Station queues, version-pinned journeys, readiness gate, atomic routing, customer progress and booking completion | Six-stage synthetic laboratory journey works without duplicated or skipped stages; legacy queue regression checks pass |
| 4. Resource integration | Stage sessions and shared capacity checks across booking, starts, changes, and estimates | Four-court concurrency and imaging constraints pass; no reservation double counting or overbooking |
| 5. Pilot and estimates | Opt-in locations, operational diagnostics, shadow stage predictions, publication after evaluation | Staff daily workflows verified; allocation/routing violations zero in acceptance scenarios; quality targets agreed from observations |
| 6. Advanced routing | Structured conditional rules, parallel eligible branches, joins, named units, multiple resources | Each extension has an explicit eligibility, cancellation, fairness, reservation, and completion contract before rollout |

Resource-only delivery can proceed through its existing foundation work, but align it with the shared session contracts first. Enable workflow-only mode after Phase 3. Enable combined mode only after Phase 4. Customers and all ticket issuance channels must support the selected mode before activation.

Phase 6 supports, for example, a package that needs Laboratory and Imaging but no Cardiology, or flexible order among independent departments. Parallel means multiple eligible branches; the same patient cannot be physically in two services simultaneously. Joins wait for all required branches and results-readiness conditions. Structured rules are validated for cycles, unreachable stages, missing terminal paths, and ambiguous conditions.

## Acceptance scenarios and rollout

Use synthetic laboratory and court data for acceptance checks:

- Off/Off reproduces the current queue. Resource-only and workflow-only modes both work independently.
- Reception completion records Cashier eligibility or readiness wait. Cashier staff arrival confirmation admits exactly one station entry; concurrent confirmation/retries cannot create two. Station rank and wait start at arrival, not the Reception timestamp.
- Two departments can call different patients concurrently; one journey cannot start two physical stages concurrently.
- All six stages remain visible in progress; the booking completes only at the terminal gate.
- Results release remains unavailable until authorized readiness confirmation, including overnight waits.
- Four one-court sessions succeed; a fifth and conflicting reservations fail; completion frees capacity once.
- Different stages/workflows sharing a pool see the same occupancy; calling alone consumes no units.
- Publishing a new route does not alter existing journeys. Retiring stops new admissions while existing journeys finish.
- Missed calls, cancellation, early termination, overdue sessions, midnight, and queue closure preserve correct journey/occupancy state.
- Unauthorized station/tenant access and readiness changes fail, including through real-time channels.
- Mobile/tablet/desktop staff operations and customer progress remain usable with long routes and labels.
- Queue Workflows rejects non-Pro new admissions/configuration writes. Pro expiry preserves active journey resolution without creating new journeys. Resource pilot eligibility is independently enforced.
- Cancellation stops future stages and leaves active capacity occupied until explicit authorized termination.
- A 120-minute earlier session blocked by a reservation is not bypassed by a later 60-minute session competing for the same pool.

Run database-enabled concurrency and lifecycle tests, API compatibility checks, and end-to-end UI walkthroughs. Pilot in sandbox first, then explicitly enabled locations. Measure duplicate transitions, orphaned journeys, resource violations, readiness delays, missing plans, prediction coverage/error, and staff corrections.

On runtime failure stop new admissions/starts for affected modes, retain authorized completion/recovery, and preserve history. Rollback must not map partially completed journeys to ordinary served tickets or drop active allocations.

## Recommended next work

Implement Phase 1 as a reviewable foundation change after comparing current branches and existing migrations. First settle station queue scope, immutable workflow versions, terminal booking completion, and the shared session/ledger contract. Those decisions prevent the sequential workflow and resource feature from becoming incompatible implementations.

## Foundation implementation documents

The [queue workflow and resource foundation specification](queue-workflow-foundation-spec.md) defines the proposed server transitions, data invariants, booking/channel compatibility and acceptance gates. The [vendor dashboard migration inventory](vendor-dashboard-migration-inventory.md) maps current routes/components to the proposed workspaces and identifies adjacent resource-configuration work for reuse. These are source-backed planning artifacts, not runtime implementation evidence.

The [vendor dashboard and AI coordination record](vendor-dashboard-ai-coordination.md) refreshes implementation dependencies against main on 6 October 2026 and sets shared-file boundaries and the first shell slice.
