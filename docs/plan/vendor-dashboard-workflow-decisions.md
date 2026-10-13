# Vendor dashboard and queue workflow decisions

Implementation status: see [rework progress](vendor-dashboard-rework-progress.md). Slice 1 retains existing `/dashboard/*` routes with explicit workspace state; canonical workspace-root proposals remain staged.

13 October audit supplement: the [full dashboard audit](vendor-dashboard-full-audit.md) and [preservation checklist](vendor-dashboard-rework-preservation-checklist.md) are mandatory migration inputs. They correct stale monitor/billing assumptions and enumerate current section/action/failure-state coverage. Existing product decisions remain in effect; their future runtime behavior remains separately gated.

Completed design interview: 5 October 2026. Status: agreed product/design direction; documentation and synthetic prototype only.

GetPrio will provide one vendor application with Operations and Administration workspaces, redesigned with shadcn/ui and shared light/dark themes. Vendors can retain an ordinary queue, opt into resource tracking, configure sequential Queue Workflows, or combine both. The agreed workflow uses staff-confirmed destination arrival, independent station queues, audited results readiness, and explicit resource completion. Queue Workflows requires Pro; standalone resource tracking begins with an explicitly enabled pilot whose permanent tier limits remain deferred. The [interactive design preview](vendor-dashboard-workflow-decisions-visual.html) illustrates the decisions using synthetic data; it is not a working queue engine. This decision record refines the [combined implementation plan](queue-workflows-and-scheduling.md), [dashboard design brief](vendor-dashboard-rework-design.md), [vendor UI rules](../design/vendor-ui-rules.md), and [resource rollout](resource-aware-queue-rollout.md).

## Terms

**Operations** means the workspace where owners and authorized staff serve customers and run station queues. Avoid: “separate login.”

**Administration** means the owner workspace for business configuration, workflows, stations, resources, services, staff, reporting and billing. Avoid: “extra seat.” Switching workspaces neither changes a role nor adds a user.

**Queue Workflow** means a validated, versioned definition of the stages a service/package requires. Avoid: “arbitrary program” or “clinical decision engine.” Vendor programming means guided configuration of supported rules.

**Journey** means one customer's complete visit through a pinned workflow version. Avoid: “single stage ticket.” Finishing an intermediate department does not finish the visit.

**Station** means a department or service destination with its own operational queue and permitted staff. Avoid: “resource pool.” A station and a physical capacity pool are different concepts.

**Awaiting arrival** means a stage is eligible but destination staff have not confirmed the customer is present. Avoid: “waiting in the station queue.” Admission and station waiting time begin only after confirmation.

**Awaiting readiness** means a prerequisite operational confirmation remains outstanding, such as all required results being ready. Avoid: “reports complete because the patient was served.”

**Resource tracking** means accounting for shared physical capacity, explicit service demand, duration, reservations and actual occupancy. Avoid: “player count” or “booking quantity” as substitutes for resource demand.

**Multi-stage queueing** describes the successive station queues in a journey. **Multi-dimensional scheduling** describes deciding service eligibility using several constraints, including priority, stage readiness, demand, capacity, duration and reservations. These may be used independently or together; vendors see concrete product labels rather than mathematical terminology.

## Why

The user wants vendors to “setup a workflow for their queue,” including a diagnostic laboratory's Reception → Cashier → Laboratory → Imaging and Radiology → Cardiology → Results release journey. They also asked whether an owner with four pickleball courts can use multi-dimensional queues and how the setup can remain optional. The dashboard should let an owner serve customers and manage the business through a switch, without two logins or an extra seat. The user chose shadcn/ui reference layouts, specifically requested React Flow's Workflow Editor for configurable workflows, and emphasized light and dark modes. During the interview they clarified: “queue workflow only comes with pro-tier subscription.”

## Locked decisions

### Destination arrival controls downstream admission — Q3

When a stage completes, record the next destination or its readiness block. If ready, the stage is Awaiting arrival until destination staff confirm presence. Create/admit exactly one station queue entry upon confirmation; retries and concurrent actions must not duplicate admission. Show customer instructions and next destination during transfer. Keep original visit timestamps for journey reporting and audit, but start station waiting time at admission.

Automatic downstream admission on predecessor completion was rejected because a patient may still be walking or temporarily absent. Vendor-selectable admission modes per stage were rejected for the first release because they multiply operational and recovery rules before a consistent arrival model is proven. The accepted rule costs one staff action per transfer but avoids calling absent patients.

### Rank within applicable priority bands by station arrival — Q4

Retain applicable existing carry-over, recovery, checked-in booking and normal bands, then use station admission time and a stable tie-breaker. An earlier Reception timestamp does not automatically move a newly arrived patient ahead of someone already waiting at Imaging. A reservation for the overall visit does not automatically reserve all downstream departments; implementation must define where booking priority applies and reject unsupported mappings.

Ranking by original visit time was rejected because it can displace people already waiting downstream. Vendor-specific ordering per station was rejected for the first release because it makes fairness and estimates harder to explain. This choice does not compensate for lengthy upstream delays; aging policies require later evidence and a separate contract.

### Expected end never releases actual occupancy — Q6

Keep a court, room or machine occupied until authorized staff explicitly complete or terminate its active session. Flag overdue sessions. Any extension must check future reservations against the shared ledger before changing the expected end. If actual occupancy makes a reliable forecast unavailable, show that uncertainty rather than a false release time.

Automatic release at expected end was rejected because a forecast cannot prove a resource is physically free. Unchecked extensions were rejected because they can conflict with future bookings. Timely staff completion remains an operational dependency.

### Sequential routes first — Q7

The first workflow release supports a single sequential path with one active physical stage per journey. Reception selects the appropriate service/package and its mapped preconfigured workflow. Different packages can have different routes, so a package without Cardiology need not include that department. React Flow provides the visual editor; backend validation and persisted transactions execute journeys.

Conditional routing in the first release was rejected to keep readiness, admission, cancellation and completion verifiable. Conditions plus flexible/parallel branches were rejected because they additionally require join and concurrency rules. Separate workflow templates create maintenance overhead but provide a bounded initial runtime. Branches, loops, named units, multi-pool allocation and active version migration remain later extensions.

### Results release requires explicit readiness — Q10

An authorized results staff member confirms all required results are ready. Record actor and time. Only then can the patient be checked in at Results release. Completing sample collection or imaging is not a report-readiness assertion. A journey can wait across days without occupying equipment or remaining in an active service queue; the terminal release stage completes the journey and its linked booking under the defined completion contract.

Opening Results release automatically after the prior patient-facing stage was rejected because reports may still be incomplete. Omitting the stage until an external integration exists was rejected because a manual operational gate supports the complete journey now. Manual readiness updates are required initially; report storage, interpretation and EMR/laboratory integration are separate work.

### Preserve order for work competing for the same pool — Q12

Earlier eligible work blocks later work requiring the same pool when it cannot fit the protected resource interval. Explain the block. For example, one court is free for 60 minutes before a reservation, an earlier group needs 120 minutes, and a later group needs 60: the later group does not automatically jump ahead. Independent stations or pools may still progress.

Automatic gap filling was rejected because repeated short sessions can starve longer sessions. An explicit staff bypass was also rejected for the first release; it would require a defined fairness policy and audit contract. Some short gaps remain unused. Existing missed-call behavior must not become an implicit resource-fit bypass.

### Cancel progression separately from ending physical work — Q14

An authorized journey cancellation stops future stages, closes eligible pending/waiting work as applicable, and preserves completed history. Any active session remains visibly unresolved and continues consuming capacity until authorized staff explicitly terminate it with a reason. Completing work successfully and terminating it early are different outcomes. Apply existing booking/cancellation/refund policy through its owning contracts; this decision does not create a new refund rule.

Immediate release of every resource was rejected because cancellation does not prove physical availability. Refusing all cancellation until normal completion was rejected because staff need a truthful termination path. The accepted approach requires an additional explicit action when service is already active; the UI must expose unresolved occupancy and keep resolution controls available.

### Resource-only availability starts with an explicit pilot — Q15

Standalone resource tracking, including the four-court case, begins at explicitly enabled pilot locations/vendors. Server capabilities enforce pilot access separately from seat accounting. Clearly describe temporary access and keep the ordinary queue usable when optional setup is skipped. Permanent resource-tier limits and pricing remain deferred until pilot feedback.

Permanent inclusion in every tier was rejected as premature. Making resource-only tracking Pro-only immediately was also rejected as premature because its commercial value has not yet been established. This decision concerns resource-only operation; it does not relax the separate Pro requirement for Queue Workflows.

### Queue Workflows is Pro-only — explicit Q15 clarification

The user's direct clarification establishes the workflow entitlement. Server checks must enforce Pro on workflow setup writes/publishing/activation and new workflow admissions across all issuance channels. Non-Pro Administration can explain the capability and provide the supported upgrade path. One-seat free owners still access Operations and Administration using their existing account; workspace access and workflow entitlement are distinct.

The original combined pilot/pricing question was narrowed after this clarification. Deferring workflow-tier eligibility and including workflows in every tier are superseded. No alternative pricing, price amount, trial promise or billing-period change was accepted.

### Permit resolution after Pro ends — Q16

Loss of Pro blocks new workflow admissions, configuration editing and publishing. Existing version-pinned journeys remain available to authorized staff for the actions needed to resolve them: readiness, destination arrival, stage-local recovery, completion, explicit cancellation and active-session termination. Existing journeys do not change routes automatically. Tenant/location/station authorization still applies to every action.

Blocking all actions immediately was rejected because patients may be awaiting results across days and active resources still need truthful accounting. Automatically cancelling journeys and releasing resources was rejected because it discards valid progress and invents physical availability. The trade-off is limited continued operational access after entitlement loss. Implementation must define linked bookings that were reserved before expiry but have not yet become admitted journeys; this was not settled by the active-journey decision.

## Routine choices

- **Q1 — Operations landing:** owners with multiple permitted stations start from a congestion/work overview with Open station actions. A one-station business opens its station directly. This is distinct from remembering the last permitted Operations/Administration workspace.
- **Q2 — Staff context:** staff see assigned stations and the current customer's relevant operational journey progress. Show the next destination and readiness blocks without exposing clinical findings or granting access to all departments.
- **Q5 — Arrival confirmation:** destination staff look up the journey reference or optionally scan an opaque-reference QR, then confirm presence through an authorized action. Lookup works without the customer app, a phone or a scanner. QR contents do not contain clinical information, and lookup still requires authorization.
- **Q8 — Station composition:** use separate Waiting, Called and In service sections plus an Awaiting arrival check-in area. Mobile may stack sections or use labeled views with visible active counts. Actions belong to the applicable state; dragging cards cannot silently advance a journey or allocate resources.
- **Q9 — Optional onboarding:** complete basic business setup first, then offer workflow/resource setup with a clear Skip. Skipping leaves the ordinary queue usable. Advanced setup remains a draft until valid and explicitly enabled; eligibility such as Pro still applies.
- **Q11 — Missed calls:** reuse existing missed/recovery behavior within the current stage only. Staff confirm presence before recovery. Preserve completed departments and block progression until recovery or explicit cancellation. Business-day closure preserves the journey rather than erasing progress.
- **Q13 — Queue setup navigation:** one Administration sidebar item opens a Queue setup page with Workflows, Stations and Resources tabs. There is no nested sidebar submenu required. Each tab provides its list and detail/setup routes; service forms link directly to relevant entities. The accepted group and the page-tab clarification are compatible.
- **Shared shell:** use one vendor app, account and session with an Operations/Administration switch for Vendor Admins. Staff see permitted Operations views. Switching preserves permitted location context, protects unsaved work, and does not add seats or release resources. A free-tier owner can use both workspaces with one seat.
- **Theme and components:** use shadcn/ui/Tailwind and semantic tokens across all migrated vendor screens, auth, onboarding, billing and workflow canvas. Persist an explicit theme choice; otherwise use system preference. Theme changes preserve form and operational state.
- **Editor:** follow the preferred React Flow Workflow Editor approach, with Add/Insert/Reorder/Connect controls and equivalent mobile list/form editing. Coordinates affect presentation; validated edges/definitions determine routing. Draft → validate → publish immutable version → explicitly enable service mapping. Active journeys retain their pinned version.
- **Four courts:** a shared interchangeable pool has capacity four. One-hour and two-hour sessions each demand one court; a two-court demand is explicit. Four groups can be active, a fifth waits. Player count and booking quantity are not court demand, and the pool model does not promise court numbers.
- **Estimates:** first release uses stage-level waits; never label these total visit duration or sum queue positions into an end-to-end estimate. Readiness delays and downstream congestion need further modeling. AI wait-time rollout remains on hold.

## Verified facts

The saved source exploration and design brief establish that the inspected frontend uses Vite, React and Mantine. The new vendor UI target is shadcn/ui; the Next.js reference names do not authorize framework migration. Reconfirm dependencies and owning branches before implementation.

All eleven user-supplied AdminCN references were visually inspected at desktop size on 3 October 2026, as recorded in the design brief: login-v3, register-v3, onboarding-v1, user list/detail, orders metrics, datatable, sticky-actions, pricing, vertical forms and two-steps-v3. The [reference inventory](vendor-dashboard-rework-design.md#reference-inventory) and [design rules](../design/vendor-ui-rules.md#2-reference-to-page-mapping) retain the exact links and mappings. This inspection did not verify mobile behavior, full interactions or commercial source rights. General forms use vertical layouts; long forms use persistent actions. The MFA demo's mixed reset/SMS language is adapted to actual GetPrio factors and recovery, not copied as supported behavior.

Official React Flow pages inspected during planning identify the [Workflow Editor](https://reactflow.dev/ui/templates/workflow-editor) as a Pro template and describe its Next.js/Tailwind/shadcn, Zustand and ELKjs stack. [React Flow](https://reactflow.dev/pro) core is open source. Authorized template source access and source compatibility remain unverified. Use authorized source if available or an original editor based on core/public examples; no template purchase or dependency installation occurred here.

The repository AGENTS.md links the vendor UI rule and requires mobile-first layouts, about 44-pixel controls, server authorization and the Contact Vendor task-modal anatomy. Task overlays keep a fixed header/footer and an independently scrolling body; the footer matches the surface in both themes.

The interview recorded sixteen answered questions, all accepting their final recommendation, plus the explicit Pro-only clarification and Q13 navigation discussion. There are no deferred question cards or unresolved discussions. The prototype uses synthetic browser-local interactions; it neither modifies GetPrio data nor proves backend correctness or installed React Flow/shadcn integration.

## Risks

- Arrival and results readiness rely on timely staff actions. Training and visible check-in/readiness work areas are necessary; automatic clinical assumptions cannot fill missing updates.
- Priority applicability, especially bookings at downstream stations, requires implementation contracts. Preserve station fairness and reject unsupported reservation mappings.
- Concurrency must prevent duplicate admissions, two simultaneous physical stages for one journey, double-counted booking/session demand, or competing starts taking the same capacity. Use transactions, stable lock order, revisions, idempotency and uniqueness constraints.
- A single location-level called slot cannot govern independent stations. Legacy compatibility needs a default-station adapter and checks across issuance channels, snapshots, notifications and realtime events.
- Cancellation, overnight waits, intake closure, feature shutdown, Pro expiry and overdue occupancy must preserve history and resolution controls. Stopping intake does not finish work or free capacity.
- Template source rights, mobile/accessibility behavior and compatibility are unverified. The HTML preview is design evidence only; runtime and complete auth/list/detail screens still need implementation and validation.
- Migration resets/shared auth components can affect customer or Mantine pages. Inventory scope first, isolate styles and migrate reviewable slices.
- Permanent resource pricing and any workflow reservation made before entitlement expiry but not yet admitted need follow-up contracts before broad rollout.

## Deferred

**Permanent resource-tier limits/pricing** is intentionally deferred under Q15. Reopen after pilot evidence about adoption, operational value and support cost. Workflow Pro eligibility is already decided.

**Advanced routing**—conditions, flexible order, parallel branches/joins and loops—is excluded from the first release. Reopen after sequential runtime validation, with explicit readiness, fairness, cancellation and completion rules.

**Named-unit assignment and multiple resource pools per stage** follow the interchangeable single-pool foundation. Reopen when a business requires a specific court, machine or simultaneous staff/room/equipment combination and the allocation contract is defined.

**Self check-in, station-specific ordering, aging and resource-fit bypass** need operational evidence and presence/fairness policies. The initial rule remains destination staff confirmation and ordered competition for a shared pool.

**EMR/laboratory integrations and report storage** are separate work. Reopen when the integration/source-of-truth contract is available; manual audited readiness remains the initial gate.

**End-to-end estimates and AI publication** require independent evaluation; stage waits remain distinct. Do not activate the held AI rollout through this rework.

## Open threads

No interview question or discussion remains open. The following are implementation follow-ups, not implicitly approved product changes: finalize route migration (`/operation` and `/admin` are proposals), inspect current seats/entitlements/auth contracts, select shadcn primitive/configuration conventions, confirm template source access, inventory existing foundation branches/migrations, define pre-expiry booked but unadmitted workflow handling, and agree pilot participants/quality targets.

Next work is a reviewable foundation specification and route/component inventory, followed by the shared vendor shell and representative screen validation alongside station/workflow/session contracts. Implement sequential workflow-only operation after its runtime checks; resource-only operation follows the shared ledger foundation; combined activation waits for both. Validate ordinary queue compatibility, the six-stage synthetic lab journey, four-court concurrency, both themes, mobile/tablet/desktop, staff permissions, one-seat switching and subscription transitions. This record authorizes the agreed plan; it is not evidence of deployment or live feature activation.

## Foundation implementation documents

The [queue workflow and resource foundation specification](queue-workflow-foundation-spec.md) defines the proposed server transitions, data invariants, booking/channel compatibility and acceptance gates. The [vendor dashboard migration inventory](vendor-dashboard-migration-inventory.md) maps current routes/components to the proposed workspaces and identifies adjacent resource-configuration work for reuse. These are source-backed planning artifacts, not runtime implementation evidence.

The [vendor dashboard and AI coordination record](vendor-dashboard-ai-coordination.md) refreshes implementation dependencies against main on 6 October 2026 and sets shared-file boundaries and the first shell slice.
