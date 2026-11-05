# Organizer collection authority and safeguards

Type: grilling
Status: resolved
Claimed by: Codex (/root)
Blocked by: 01

## Question

What controls, evidence rules, time limits, audit trail, reporting/dispute path, and reimbursement-record boundaries make organizer acceptance or rejection of contributor proofs accountable without making GetPrio a payment processor or returning contribution work to vendor users?

## Known direction

- Contributors submit payment proof after joining.
- Only the organizer accepts or rejects proofs.
- Vendor users do not view or manage campaign collections.
- The underlying booking remains active if collection fails.

## Resolution

1. A contributor submits one proof against one campaign slot. The organizer is the only normal-operation reviewer: acceptance or rejection is a server-enforced organizer action; vendor users have no collection, proof, or reimbursement permissions.
2. An organizer rejection requires a reason, notifies the contributor through their preferred permitted channel plus an in-app record, releases the contributor slot, and permits one corrected submission before the campaign deadline. A rejected proof alone does not establish a reimbursement obligation.
3. The organizer has until the earlier of 48 hours after proof submission or the campaign deadline to decide. An unresolved proof becomes `review_overdue`: it is not silently accepted, rejected, released, or treated as reimbursed. Both parties are notified, and the contributor may report the campaign to Platform Admin.
4. Only the relevant contributor and organizer may view contribution or reimbursement evidence in normal operation. Vendor users and public viewers never receive it. Platform Admin evidence access requires a report, dispute, or audit case and is logged and time-limited.
5. Any campaign cancellation, deadline failure, or underlying-booking cancellation creates reimbursement obligations for accepted contributions. The organizer records reimbursement evidence, but only the affected contributor's explicit confirmation completes the obligation. A contributor may refuse confirmation with a reason; that creates a reimbursement dispute, keeps the campaign in `refund_pending`, and permits either party to report it to Platform Admin.
6. Every proof submission, organizer decision, review-overdue transition, reimbursement record, contributor confirmation/refusal, report, and privileged evidence access produces an immutable audit event with actor, timestamp, reason where applicable, and prior/next state.
7. Notifications honor each customer's preferred permitted channel and always preserve an in-app record. Future native-app silent push may refresh campaign state in the background but carries no payment evidence or other sensitive details.
8. Platform Admin may freeze a reported campaign, prevent further collection actions, and review scoped evidence. Platform Admin does not verify a payment or automatically resolve a private reimbursement without an explicit later policy.

## Resolution comment

Resolved as an organizer-managed, evidence-minimized collection process with contributor-confirmed reimbursement. This establishes accountability without payment custody; public discovery, ratings, and rollout remain separate decisions.
