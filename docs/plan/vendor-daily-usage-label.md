# Vendor daily ticket metric correction

Reports and Account Subscription previously labeled snapshot.stats.servedToday as Current period and divided it by the monthly ticket quota. API-owner read-only tenant5 reconciliation on14October confirmed1 served ticket for queue date_key20261014 versus18 ticket creations in the effective monthly billing window. No history loss or ledger backfill is implied.

Both consumers now show Tickets served today / At the selected location without a monthly denominator. Missing, failed or mismatched tenant/location snapshots show an em dash rather than zero or another scope's count. Preserve the existing daily queue-date semantics and API behavior.

Monthly consumption requires an API-owned safe usage-read contract or separately authorized release decision. The capacity endpoint is gated by vendorCapacityExperience:false; this change does not bypass or enable that gate, infer monthly totals from history, or activate credit/provider/resource behavior. This focused main-based fix includes no unpublished dashboard screen rework.

Validation:193 frontend tests and TypeScript pass; production build and affected lint are recorded separately. Independent specification/standards reviews identified the remaining Plan consumption heading, which is now renamed Queue activity / Tickets served today. No live usage correction is claimed until this focused PR is merged, deployed and verified.
