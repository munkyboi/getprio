# Vendor ticket-outcome resource writer

Manual called-ticket resolution and vendor waiting-ticket cancellation now share the location-first vendor transaction used by explicit service timing. Current ticket-state permission, active membership/user and staff branch or active-counter assignment are reread on the transaction client. Called-ticket resolution checks the authoritative open Queue Day after authorization under the lock and derives its business date there. Locked tickets must match the tenant/location scope.

Legacy Serve cannot bypass resource execution when tracking is enabled or a historical resource binding/allocation exists, including after timing/tracking disable. Existing allocations reject every legacy outcome. Use explicit service start and completion/interruption to execute or release occupancy. An unstarted Skip retains protection while the skipped ticket remains recoverable. Supported terminal called-ticket cancellation/unserved outcomes cancel unused protected bindings; they never release allocations. Existing legacy booking-outcome behavior remains for those internal actions; no new endpoint is exposed.

Vendor waiting cancellation rechecks waiting status and scope, then cancels the ticket, unused immutable protected bindings and its active linked booking, ends the queue segment, enqueues the event/webhook and advances revision in one transaction. The linked booking uses the existing ticket-cancelled fulfillment policy and preserves already-terminal booking statuses. Frozen protection cancels after draft edits or tracking disable. Converted bindings/occupancy reject. Concurrent duplicate requests produce one outcome; event failure rolls everything back. Postcommit notifications remain outside the transaction. Unsafe vendor ticket IDs reject rather than round during repository lookup.

Ordinary disabled-resource queues keep direct Serve and customer confirmation rules. Public lookup-code cancellation remains on its existing transaction/authorization path and is not covered by the vendor adapter. Tracking and writer coverage remain disabled. Snapshot/producer/inference/capture contracts and customer estimates are unchanged; no ready inventory or activation/backfill.

## Remaining writer inventory

This inventory is source evidence for further slices, not a coverage-complete certification:

| Path | Remaining work |
| --- | --- |
| `queueService.createTicket`, `queueJoinPaymentService.activatePaidPayment` | Public/customer/developer/paid/vendor issuance and scope revisions; payment-first lock ordering, channel authorization and unknown/ordinary plans must be considered separately. |
| `queueService.callNextTicket`, `confirmCurrentTicket`, `restoreSkippedTicket` | Location-first operational state changes and coherent revisions/earliest-call policy; calling still does not allocate. |
| `queueService.cancelTicket` without `vendorTicketId` | Public lookup-code authorization and linked booking/protection cleanup. |
| `queueService.closeQueueDay`, `queueDayLifecycleService.closeTicketOutcomes` | Manual/system closure and terminal protection cleanup; retain actual occupancy and explicit timing. |
| `queueDayLifecycleService.expirePendingCarryOvers` | Scope-first system expiry and terminal booking/protection updates, without releasing active occupancy. |
| `accountDeletionService.cancelWaitingTickets` | Deletion-authorized cancellation, multiple affected scopes and protection cleanup; preserve deletion transaction/revocation policy. Anonymization alone is distinct from this operational cancellation. |
| `resourceConfigurationService.saveConfiguration` and related catalog/settings writers | Existing branch lock helps draft serialization, but complete revisions, authorization revalidation and activation reconciliation remain unproven. |
| `resourceOperationalSnapshotProducer` | Complete committed inventory, coverage/watermarks, reconciliation and explicit readiness prerequisites. It still emits `not_ready`. |

Booking proof/verification/rejection have already been integrated. The booking SMS checkout service controls a pre-booking alert fee, and paid queue joins issue tickets; these must not be described as an unverified external writer of existing booking resource state. Their channel/payment admission and atomic consumption still require their own audit before declaring full coverage.

Validation uses real PostgreSQL ledger/timing/authorization plus minimal transactional ticket, booking, segment, event/webhook fixtures. Tests cover resource Serve denial after disable, Skip preservation, occupancy rejection, simultaneous vendor cancellation, rollback, current access/assignment, wrong scope/closed Queue Day/unsafe ID and ordinary direct Serve. Existing explicit-session regressions rerun through the shared authorization adapter. This does not claim authenticated live resource execution.
