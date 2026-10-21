# Flat named extra members, version 1

This additive V4 capability permits a flat extra group to select named members of its own configured pool. It does not permit nested `extra.resources`, recursive extras, client-supplied pool IDs, resource units, or duration totals.

## Selection and execution

- Catalog capability: `namedExtraMembers.version = 1`. Named extras require one configured unit per member. Automatic extras retain quantity-only selection.
- A named extra carries `resourceMemberIds`. Publication and amendment require exactly `quantity` distinct, scoped, active, nonarchived IDs. Drafts retain incomplete and excess selections so reducing quantity never silently removes a name.
- The server freezes one execution leaf per selected member. Leaves share the group's duration count, base, total duration and common parent start. Their deterministic IDs preserve identity when selection order changes.
- The published group exposes frozen `resourceMembers` and `memberExecutions`. Its group `execution` is null; each member has its own recorded execution. Existing automatic-extra execution remains unchanged.
- Call protects every current-stage leaf atomically. Start revalidates all recorded promises and starts them together. Member completion releases only its recorded allocation. The parent cannot complete before selected extras resolve.
- Removing or replacing a promised member requires explicit customer agreement. A failed amendment preserves the old plan and its protection atomically. Historical snapshots are immutable.

## Provisional availability

`POST /tenant/:tenantSlug/queue/named-resource-availability` uses the normal authenticated vendor queue scope and `tenant.queue.operate` permission. It is a read-only preview, not a reservation.

Request and response types are `QueueNamedAvailabilityRequestV1` and `QueueNamedAvailabilityResponseV1` in `shared/queueSelectionPlanV4.ts`.

Send the accepted catalog revision, a unique request key, the full current `serviceSelections` editor tree, and a flattened request for every selected parent resource and extra. The server compares the tree and batch; omitted or mismatched demand returns `unknown / INCOMPLETE_AVAILABILITY_CONTEXT`. It derives each interval from the current accepted duration policy and a server common-start assumption. Multi-station intervals explicitly carry `provisional_stage_start`; eventual stage Call and Start remain authoritative.

Availability includes actual unreleased allocations even when their expected end has passed, overlapping protection, simultaneous aggregate pool demand, member identity, maintenance, archive state and configuration revisions. Anonymous usage cannot establish that a specific named member is free. Expired stored protection returns `unknown / RESERVATION_EXPIRY_PENDING` until the existing authorized reconciliation path resolves it. Preview never performs that reconciliation.

An optional scoped published `draftId` excludes only that request's validated current, unexpired, unstarted whole reservation group. Arbitrary exclusions are unsupported.

Clients must prevent new unavailable or unknown choices while retaining selected names and explanations. Temporary busy capacity is separate from configuration validity: valid selections may publish Waiting. Debounce edits, abort obsolete reads, reject stale request keys/catalog revisions, batch demands, refresh on relevant queue changes and use the server's 15-second refresh interval. Do not poll per member or bypass rate limits.

Normal errors include 400 for malformed or excessive requests, 403 for permission failure, 404 for an unscoped draft or location, 409 for inactive scope, and 503 when the bounded ledger read cannot establish availability. A failed preview never means free.

## Verification boundary

The isolated PostgreSQL publication suite covers flat fanout, exact quantity and draft retention, stable IDs, read-only preview, actual occupancy past its expected end, full interval anonymous protection, incomplete/stale context, concurrent whole-request claims, expiry reconciliation, customer-agreed member removal, atomic Start and member-specific release. Runtime migration, dashboard integration and authenticated browser acceptance are separate gates.

## Local Opera lifecycle evidence (2026-10-17)

The Vendor owner exercised the bound interface in Opera using only separate QA services 11/12 and pools 9/10. Independent read-only database captures verify its resulting records:

- Draft `7fc32db5-b553-4536-9754-f188ed2132be` revision 1 retained two named trainer IDs at quantity 1; revision 2 explicitly restored quantity 2. Browser selection blocked a third name at 2/2 and showed the exact-count error after reduction.
- A separate owned claim, VD017, protected Court A and Trainer A. The browser retained these selected names with current protected reasons. VD018 / ticket 26 published Waiting with three children, no holds and no allocations.
- The browser's first Call stopped at the occupied counter; after cancellation, queue priority required finishing the earlier QA ticket normally. These checks do not establish a browser resource-capacity rejection. No counter configuration or priority bypass was introduced.
- VD017 finished through normal commands. VD018 then Called with three protected rows. Its read-only amendment preview returned `excludedOwnProtection: true`; the editor closed without an amendment.
- VD018 Start created three distinct named allocations with one identical start timestamp and expected end. Completing Trainer A released only A; Trainer B and the court remained allocated. The parent stayed unfinished until B completed.
- Final VD018 state is Served, with three recorded releases, one parent Start event, one parent Complete event, and zero remaining global holds/allocations. The temporary VD017 ticket is also Served.
- A fresh pre-browser backup and row manifests preserve all 19 prior drafts, 24 prior plans and 182 prior command receipts unchanged. Only the two new owned QA tickets were added. Original user forms and unrelated resource state were not restored or overwritten.

The local fixture contains no allowance-operation entries for these tickets; one-unit publication accounting is established separately by the isolated PostgreSQL tests. At Carlo's explicit aggregate-preview review hold, the owned QA services/pools stay active with zero occupancy; they must not be archived before that review. A fresh verified backup precedes any additional inert validation draft, with no further ticket issuance for presentation testing. No PR, push, deployment, production-setting change or schedule activation is implied by these local results.

## Opera failure and stale-response checks

The Vendor owner directly verified that a failed preview preserves the selected trainer, marks availability unknown and disables new trainer choices. A held older duration-1 request was aborted after changing the parent to duration 2. Releasing that older response did not enable choices while the newer request remained pending; the newer valid response restored choices. Temporary interception was cleared and normal network operation restored afterward.

Resource accordion keyboard collapse/reopen preserves stable IDs, quantities and selected chips; adding a resource opens it, and removal returns focus to its parent. In the separately backed-up inert draft `15c59d7e-7afd-4e26-9d70-8683f372402c`, invalid Publish reopened both Service and Resource accordions and focused the fractional extra-duration field. The same check with quantity 1 retaining two names focused the name chooser and its exact-count error. Both attempts issued zero publication requests. Explicit discard restored the valid saved revision 1; independent captures confirm no ticket and no prior-row changes. These UI observations are distinct from independent database lifecycle evidence above.

## Final local review readiness

The Vendor owner reports 321 frontend tests, type checking, lint with zero errors and three unchanged warnings, and the production build passing. Backend evidence remains 70 publication, 14 draft/duration and 290 broader queue/resource/session tests passing, plus backend type checking and selected lint.

The corrected focus behavior passed at 375×500, after shrinking an already-focused viewport to 375×400, and at 1024×500. The focused 44-pixel field remained fully inside the dialog scroll region above the footer; the desktop rail stayed stationary. This fixes a short-window issue discovered during acceptance rather than counting the earlier focus-only result as visibility proof.

At 375 pixels, light/dark outcome-button geometry used a clearly read-only replay of the real recorded VD016 Start DTO with inert callbacks: maximum action width 169.25 pixels, minimum height 44 pixels and scroll width 375 pixels. That is presentation evidence, separate from VD018's bound live lifecycle. The temporary replay server and files were removed; no ticket or command was created for it.

Final independent read-only checks at 2026-10-17 09:51 UTC confirm: preview draft revision 1 is still valid and unpublished (quantity 2, two member IDs, duration count 1); VD018 retains three explicitly completed releases; QA services 11/12 and pools 9/10 remain active with zero own holds/allocations for Carlo's review. This does not assert that unrelated user work is idle. Old-request cleanup remains a separate read-only inventory pending the confirmed scope; protected current user work and unknown-provenance records must not be deleted or hidden.

## Later authorized unpublished-draft cleanup

Carlo subsequently clarified that **none** of the four saved unpublished drafts should be kept. That instruction superseded the earlier draft-preservation hold, including the inert validation preview draft. The Vendor owner freshly confirmed no open request form was bound to any approved ID; no user tab was navigated, edited, closed or refreshed for that confirmation.

At 2026-10-17 18:48:49 Manila, the local cleanup removed exactly these still-unpublished drafts:

- `4fdaeb2c-95dd-4661-bf25-ec80633ed53e`
- `31413b5c-39c6-4035-97ae-d8621d3bcf84`
- `9c4a147b-74f5-43bb-b01d-8865770f3385`
- `15c59d7e-7afd-4e26-9d70-8683f372402c`

A fresh verified database backup preceded the transaction. Location and draft locks, full-row hash/revision comparison, `state='draft'`, a null published-ticket predicate and zero published versions prevented deleting a concurrently changed or published request. Full rows, eight required draft-only FK audit rows and all eight associated receipts were archived and synced before deletion. Only the four drafts and eight archived draft-only audit rows were removed; no receipt was deleted.

Before/after hashes preserved all 27 tickets, 19 published request records, published history, resource/configuration state and all 202 command receipts unchanged. Published user request ticket 27 remained protected. A separate ordinary password/TOTP-authenticated API check returned an empty draft list with no next cursor. QA services 11/12 and pools 9/10 remain active for review; no service/pool archive, PR, deployment or schedule activation occurred. The earlier screenshots and saved-draft assertions remain historical verification evidence, not a claim that the deleted preview draft is still available.
