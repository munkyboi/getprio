# Vendor current-period usage correction

Reports and Account Subscription previously divided snapshot.stats.servedToday by the monthly ticket quota and labeled it Current period. API-owner read-only tenant5 reconciliation confirmed1 served ticket for queue date_key20261014 versus18 ticket creations in the effective billing window (18/5000 canonical projected base usage). This is a presentation source mismatch, not lost history or permission to backfill ledger records.

Both monthly metrics now read GET /billing/tenant/:tenantSlug/usage, the API-owned minimal read-only current-period DTO. Display its canonical queueTickets.used/limit directly across all business locations, never daily served counts, observedUsed arithmetic, history totals or current catalog defaults. Retain the daily served statistic separately in Reports.

The server response must identify the selected business and provide an available period containing both observedAt and the current client time. Loading is explicit; failed requests offer Retry usage. Missing, unavailable, null, invalid or expired usage displays Usage unavailable. Cache keys include actor, token, tenant and role. Tenant mismatch is rejected before caching.

The API owns membership/RBAC, canonical window/accounting semantics and the new endpoint. Its independent usage-read contract does not enable the vendorCapacityExperience gate, purchase/provider/resource workflows or commercial data exposure. This main-based frontend PR contains no unpublished dashboard rework. Coordinate backend endpoint delivery before or atomically with this consumer; older servers return unavailable rather than fabricated counts.

Validation:197 frontend tests, TypeScript and affected ESLint pass, including18monthly-versus1daily, canonical projection, genuinezero, failure/unavailable, invalidperiod and cachedrollover cases. Independent specification/standards rechecks are clear. Production build, paired actual API/DB evidence, hosted review/checks, merge/deployment and authenticated live acceptance remain separate checkpoints. No financial or ticket mutations were performed.
