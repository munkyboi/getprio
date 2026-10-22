# Existing vendor membership protection during invitation

Security prerequisite for the pending invitation resource writer in [AI Wait-Time Prediction #378](https://github.com/munkyboi/getprio/issues/378). The create-staff POST now rejects a target who already has any membership in the selected vendor with HTTP 409, directing the operator to the staff list. Existing owners, administrators, staff and inactive memberships are all protected. Invitation cannot change an existing role or reactivate access; those actions belong to the separately authorized staff-edit PATCH.

An existing global GetPrio account without a membership in this vendor remains eligible for invitation. A membership in another vendor does not block it. The handler preserves current seat counting, role restrictions, email normalization and the successful 201 response. The create/edit consumers were inspected as separate paths; no intentional role-changing re-invite or resend dependency was found. Retrying a successful invitation now produces a conflict rather than another 201. Existing queued email retry/delivery remains an independent outbox worker responsibility.

## Serialized decision

The presence check uses `listUsersByTenantId` with the transaction client supplied by the existing `staffAccessEmailService.change`, after that service obtains the tenant serialization lock. It does not trust preflight user membership hydration. Duplicate detection precedes the seat-limit decision and every membership mutation or notice insertion. Exceptions roll back through the existing transaction boundary. Exact string identity comparison prevents adjacent large account IDs from being mistaken for the same member.

This narrowly fixes the existing-member upsert bypass. The repository's general upsert remains unchanged for other callers. It does not establish current locked actor authorization, branch-first ordering, same-client entitlement policy stability, affected resource revisions or complete invitation writer coverage. Those remain required work before snapshot readiness. No inference, tracking, capture or resource activation is introduced.

## Acceptance evidence

Mocked handler regressions cover active/inactive owner, administrator and staff memberships; owner self-downgrade; full-seat duplicate conflict; distinct BIGINT identities; and unchanged new-member seat/admin restrictions. A disposable PostgreSQL case uses the actual user repository and email transaction service: rejected administrator invitations preserve an existing owner's role/activity and write no notice; three concurrent new-member attempts create one membership and one notice, with later attempts returning 409. Scope revisions remain unchanged, documenting the still-missing resource writer rather than claiming integration.

The PostgreSQL case mocks the outer HTTP authorization seam; it is not live RBAC acceptance. Real staff-edit authorization, delivery, full writer integration, deployment and a separately authorized live mutation remain distinct gates. This slice makes no production mutation or quota-policy change.
