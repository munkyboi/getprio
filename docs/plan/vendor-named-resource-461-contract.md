# Vendor named-resource and nested-extras refinement

Source: approved refinement at the top of GitHub #461, 17 October 2026. This supersedes conflicting flat same-pool, fixed catalog-duration and whole-group-only completion assumptions in earlier local evidence. The local Linear Vendor v3 flow is now implemented and Opera-verified; broader cross-platform and Multi-station acceptance remain incomplete. Current evidence: vendor-named-resource-461-opera-acceptance.md. No PR until aggregate preview approval; schedules paused; no production activation.

## Authoritative ownership

API defines and reviews DTO, policy, authorization, pricing/quote and customer projection. Queue owns writable backend schema/allocator/routes, migrations, backups and guarded local runtime. Vendor owns hierarchical request editing, server-projected operations and Opera acceptance. Mobile owns customer selection/reconciliation/device evidence; Platform keeps ticket usage separate from child/resource metrics; grouped AI remains unsupported pending review.

Vendor local types/components are presentation/editor state only. They must be adapted to reviewed shared types before any binding; they do not define wire keys or runtime policy. Existing flat Linear UI remains a historical preview and is not acceptance of this refinement.

## Required hierarchy and operations

One selected Pickleball court rental catalog service contains named Court 1, Court 2 and Court 3 selections with stable service-selection and court-selection identities. Each court has its own duration. Court 1 contains Basic equipment and Trainer extras; Court 3 contains Basic equipment. Each extra has its own stable identity, duration and explicit parent selection. Changing one extra cannot change another extra of the same service under another court. Reordering never changes identity or parentage. Named member selection never creates duplicate catalog services.

Editing availability is provisional. Draft is inert. Publish produces exactly one ticket/allowance entry. Call atomically protects every named court and required extra pool demand for their individual intervals in the current stage. Start revalidates and starts selected courts together; future stages remain unreserved. Do not double-count a court because it has extras.

Required-extra unavailability yields authoritative Waiting explanation. Explicit pre-start removal requires customer agreement, reason and audited revision change, plus notification to a linked customer. Failed amendments preserve prior plan/protection. Use actual reservation/allocation IDs; independently complete/release each selection/extra. Expected elapsed time never frees occupancy. Parent remains unresolved while any required child is unresolved. Selective retry must preserve completed children.

## Approved extra scheduling

Carlo confirmed: every extra starts with its parent court and its duration cannot exceed that court rental. Shorter extras are allowed. All courts share the same actual Start. There is no delayed extra start or extension beyond the parent court in this version. Completion/release remains explicit per child; reaching its expected duration does not free occupancy.

## Remaining policy freeze questions — unresolved, not defaults

- Court/extra duration choices, bounds, steps and revision acceptance.
- Extra quantities/demand and pool/member identity; do not infer one unit or anonymous/named behavior.
- Price/quote snapshot and re-acceptance, including any manual/non-priced mode; no automatic repricing or payment mutation.
- Child outcome/retry semantics, command preconditions, receipt reconciliation, permissible bulk convenience actions and audit/notification projection.

## Revised Opera acceptance

- One rental service; Court1 180min, Court2 180min, Court3 60min; Court1 equipment+Trainer and Court3 equipment with explicit independently chosen durations from the approved policy.
- Named availability shown as provisional; unavailable required extra stays Waiting; agreed removal audited/notified.
- Named-court plus multi-pool extra Call rollback has no partial protection.
- All courts start together; per-child recorded allocations retain parent/stage/attempt identities.
- Explicit Court3 completion frees only Court3; remaining courts/extras stay held; elapsed time without completion does not free them.
- Independent extra completion, partial interruption/selective retry and final parent completion preserve completed children.
- Draft reload, publish/replay exactly once, stale command rejection, unknown-result reconciliation, protected identity/booking/payment, permission and location boundaries.
- Light/dark,375/768/1440, short viewport, nested focus/labels, keyboard, dialogs and toasts. Mobile/Zero32, provider notification delivery and production acceptance remain separate evidence.

Dependencies: #463 command execution, #464 draft/publication, #465 stages, #466 audit/notification/metrics, #467 Mobile and #468 cross-platform acceptance. Vendor added the revised acceptance note to #468 without replacing its existing body/dependencies.

## Local preparation evidence

Unbound `namedQueueSelectionDraft` keeps service → court → extra identity and parent-specific immutable edits. Removal/reparent detection is explicit and reorder is inert. Approved schedule validation rejects an extra outlasting its own parent without shortening its stored duration. `NamedQueueSelectionSummary` nests extra durations/status text beneath the correct named court and infers no availability, occupancy or price. Four focused tests pass. These local components are not mounted or transport DTOs; revised Opera execution awaits the reviewed backend handoff.

## Nested editor and v3 input adapter checkpoint

Prepared controlled NamedQueueSelectionFields supports root rental service selection, named court rows and per-court extra rows with distinct quantities/durations. It uses only supplied duration options and extra quantity bounds; no booking Hours conversion, catalog-service-per-court substitution or inferred availability/price. An extra exceeding its parent retains its entered value with a review error rather than being clamped. Unknown catalog/member/extra selections remain visible for review.

Copied Queue's proposed queueSelectionPlanV3 input types into the consumer checkout; namedSelectionInput maps local stable court-selection IDs to resourceSelectionId, preserves nested extra identity, uses named quantity1, and sends no authoritative pool/demand/price fields. This is a proposed input adapter, not an endpoint binding. Six focused hierarchy/form/serialization tests, typecheck, focused lint and diff checks pass.

Queue's latest handoff explicitly permits no v3 execution binding: metadata/capture is implemented/tested, but nested Draft/Publish, named+pooled allocator, child outcome/retry projections and fixture migration/setup are not yet runtime-ready. Queue owns backup and actual Court1–4 registry/policy setup while preserving user catalog. The corrected full Opera demonstration remains blocked on that tested runtime handoff; no historical flat evidence substitutes for it.

## Runtime handoff and current implementation

Queue provided the tested shared v3 DTO/options/Draft/Published/child-command handoff. Vendor binds only the loopback local-demo path through queueSelectionsV3, NamedQueuePanel, NamedQueuePlanDialog and NamedQueueOperations. Actual court/extra operations, unknown committed-response replay, stale rejection and cleanup are recorded in vendor-named-resource-461-opera-acceptance.md. Earlier unbound/preparation notes above are historical checkpoints, not the current runtime state.
