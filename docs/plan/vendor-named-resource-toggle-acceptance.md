# Named resource maintenance and archival acceptance

2026-10-17. Local unpublished work; no PR, push, merge, deployment, production flag or schedule activation.

## Resulting behavior

Active contains all nonarchived members, including temporarily inactive muted/readable cards with usable re-enable controls. Archived contains only explicit archivedAt timestamps. The approved Locations-style Switch has a unique name, authoritative checked state, pending lock, On/Off status and semantic Enabled/Inactive badge. An inactive card remains interactive; it is not globally aria-disabled.

Maintenance PATCH `{name,isActive,expectedRevision}` plus Idempotency-Key is reversible and preserves UUID/name/history. Disabling affects NEW NAMED selection only; configured anonymous pool capacity is unchanged. Reactivation changes revision and does not restore older request captures or create/release occupancy. Old captures require explicit review/amendment.

Independent archival POST `/resource-members/:id/archive` uses `{expectedRevision}` plus Idempotency-Key. It preserves maintenance preference/history and blocks edit/re-enable with RESOURCE_MEMBER_ARCHIVED. No restore control is invented. Busy named/anonymous holds and started future requirements remain server guarded; no implicit release or resizing. Missing archive metadata conservatively blocks changes pending fresh GET; historical receipts are not rewritten.

Confirmed status/revision updates cache while availability stays unknown until fresh GET. A 30-second write deadline leads to unknown-outcome lock and exact pending-key retry. Busy/unknown protect page unload; failed follow-up reads do not duplicate acknowledged writes.

## Actual Opera evidence

Only owned pool 8 / service 10 / member `405dbaf2-8088-4435-9c12-c4e0a736f3da` were mutated. Pool capacity remained 1.

- OFF revision 4 stayed in Active, muted/readable with usable switch and Edit/Archive. Full reload retained it; named intake excluded it. Exact timeout/retry key `1fdaa917-b860-4347-9cd9-567f6ded4700` has one independently verified receipt.
- ON revision 5 restored Enabled/On in Active, survived reload and restored its named-intake option. Same UUID; one receipt, key `1dcb302b-f0d6-4dcd-b198-8ae966c2f3f8`.
- Archive expected revision 5 returned HTTP 200, revision 6, isActive TRUE, archivedAt `2026-10-17T06:33:14.212Z`, holdsCreated false. Key `d9aba8ee-ec20-4f1d-83d1-c62cbcafc08e`.
- Active became empty; only Archived showed the member. Edit/re-enable were disabled with an explicit reason; reload retained the state.
- Queue independently verified exact archive replay, one archive receipt/version and server rejection of re-enable. It confirmed 23 tickets, zero allocations/holds and preserved original plan/receipt hashes. Concurrent user Court off/on revisions were preserved, not restored or attributed to QA.
- Current four Court cards were viewed read-only with four On switches/capacity four. Keyboard Shift+Tab reached the named switch without toggling. At 375 × 500 there was no horizontal overflow, with approximately 46px-high named-switch hit regions. Viewport restored.

## Validation and preview

Frontend 302 full tests, typecheck, selected lint, build and diff checks passed. Tests cover stable command IDs/keys, busy/capacity guards, independent archive/preference preservation, inactive Active membership and archived-but-enabled exclusion from intake. Final copy/touch-area changes received type/lint/final build checks.

Preview: `http://127.0.0.1:5187/dashboard/locations?workspace=administration&business=vd-sports-club` → Resources → Manage Courts. User review tabs preserved.

Artifacts under `/Users/carloabella/.codex/visualizations/2026/10/17/vendor-multiservice/`: `member-inactive-stays-active.png`, `member-inactive-intake-excluded.png`, `member-reactivated-active.png`, `member-reactivated-intake-choice.png`, `member-explicitly-archived.png`, `court-resource-switches-final.png`, `court-resource-switches-short-375.png`.

## Limits

Multiple owned previews kept EventSource connections open; closing only disposable owned forms/previews allowed the exact pending retry to complete. HTTP connection-slot starvation is an inferred local-preview limitation, not proof about production HTTP or a database/CORS failure. Use one owned QA tab; do not close user forms. Superseded Enabled/Disabled-tab screenshots are not final collection acceptance.

Queue completed cleanup of only QA pool 8 (archived) and service 10 (inactive), retaining member revision 6, maintenance preference and archive history. Its final collector reports 23 tickets, zero allocations/holds and stable preexisting plan/receipt hashes. The final backend archive-timestamp precision fix passed 62 focused owner tests/lint and the API was restarted. A single final Opera registry refresh returned HTTP 200: original four UUIDs/names, all enabled/nonarchived, capacity four; Court1 revision 6 and other Court revisions 2 were preserved. No further UI mutations were performed. Physical mobile/assistive-technology acceptance and aggregate visual approval remain separate. No full-rework completion or production runtime claim.
