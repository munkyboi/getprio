# Edit waiting or called queue details

User-authorized first slice: edit customer name and notes on waiting/called tickets without changing their position, identity, state, contact destinations, notification preferences, captured service plan, payment/protection or allocations. Contacts are notification/OTP destinations and therefore read-only. Service/quantity/resource-plan editing needs a separately accepted recomputation contract.

GET and PATCH `/api/vendor/tenant/:tenantSlug/queue/tickets/:ticketId/details?location=:locationSlug` use normal authentication, `tenant.ticket.update_state` and current staff branch/counter assignment. Types: [shared/queueTicketDetails.ts](../../shared/queueTicketDetails.ts). GET is READ ONLY and rechecks authorization in a fresh snapshot before returning. An active, terminal, historical or closed-Queue-Day ticket returns409 instead of suggesting editability. Exact scope mismatch404; current grant denied403.

PATCH accepts exactly `version`, `expectedStatus`, `customerName`, `notes`. Name is trimmed1–120 characters; notes trimmed up to1000, blank becomesnull; existing public-text moderation applies. Version is a64hex opaque hash of exact PostgreSQL microsecond updated_at in UTC plus tenant/location/ticket identity, never JS millisecond precision. Expected status is required separately because a call can change state without changing the details timestamp.

The existing branch-first vendor queue transaction holds tenant/activity and current actor/membership grants. It locks the scoped ticket, checks waiting/called, rejects any start/end/outcome or unreleased allocation, compares exact version/status, and rechecks current open Queue Day/deadline and closure state. Start/terminal transitions and edits serialize on the same branch/ticket boundary. No partial contact/plan or state fallback is permitted.

Only name, notes and updated_at are written. The audit event `ticket_details_updated` has unchanged from/to status and metadata containing changed field names only, never names, contacts, notes or version values. Audit, details and ledger revision commit together; audit failure rolls everything back. A no-op does not create an event, version or revision. No notification/email/webhook is dispatched by this edit.

Success returns the same details DTO. The UI refreshes queue and local resource-operations reads. Errors409 include `TICKET_DETAILS_CHANGED` or `TICKET_NOT_EDITABLE` and require explicit refresh/review, retaining the draft without automatic overwrite/retry. Validation400 includes `INVALID_TICKET_DETAILS`.

Acceptance covers both editable states, destination/plan field rejection, microsecond changes, waiting-to-called and called-to-started races, competing saves, current authorization after lock waits, scope isolation, invariants and audit rollback. Real local HTTP/Opera verification is separate from PostgreSQL service tests; preserve the existing four-court fixture/history. Queue integrates backend into5007, Vendor owns the editor on5187. No production writes or automatic merge; corrected Vendor preview approval is still required before its PR.

## Local integration acceptance

The canonical local demo integrated the feature and safe audit-ID fix, then restarted with effective provider/storage/OAuth configuration empty and outbound network guards enabled. Normal password/TOTP authentication and the resource read model remained operational.

Vendor browser checks persisted/reopened edits on waiting VD016 and called VD015. Competing editors produced `TICKET_DETAILS_CHANGED` while retaining the stale draft. A new VD017 was created through normal walk-in issuance with a selected court service; after opening its editor, another UI surface started that ticket. Saving the original editor returned `TICKET_NOT_EDITABLE` and retained the draft. Read-only verification after the final restart found no detail-edit event after VD017 service start and confirmed the rejected draft was not stored. VD013/14 allocations remained active; VD017 added one allocation, leaving Courts at three used and one available. VD015/16 skipped history remained recoverable; no fixture reset or deletion occurred.

Screenshots: `/Users/carloabella/.codex/visualizations/2026/10/15/vendor-reference-correction/queue-details-{waiting-persisted,called-persisted,stale-conflict,start-race-conflict}.png`. Local acceptance does not authorize production activation or substitute for dashboard preview approval.
