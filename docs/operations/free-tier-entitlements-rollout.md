# Free tier, entitlements, allowances, and Usage Credits rollout

## Owners and stop conditions

Platform policy owner: Platform Admin. Billing/provider reconciliation owner: Finance operations. Security and audit owner: security lead. Privacy/evidence owner: DPO reviewer. Customer messaging owner: support lead. Deployment owner: release engineer.

Stop cohort promotion on paid-price drift, an ambiguous current subscription, restricted-to-Free conversion, ledger imbalance, duplicate fulfillment, provider amount/currency mismatch, audit digest gap, widespread CSRF/session failure, or elevated queue/booking denial errors.

New-policy authority, enforcement, backfill, and optional mutation or commerce paths are default-off through the environment controls documented in `entitlement-rollout-controls.md`. Plan Matrix reads and automatic Free assignment for newly approved vendors are core behavior. After allowance or credit facts exist, rollback means disabling admission/enforcement or commerce and repairing forward; never delete ledger, credit, transition, audit, idempotency, or provider evidence.

## Release sequence

1. Back up the GetPrio database and record the paid-plan price query.
2. Confirm the Queue Day prerequisite release is independently qualified: migrations `20260731_01` through `20260801_enforce_queue_lifecycle_mode`, the Queue Day contract suite, schema verification, and its release sign-off must already be complete. Do not include those migrations in the Free-tier review unit.
3. Apply only the reviewed Free-tier migration unit with `npm run db:migrate:free-tier`. This command is allowlisted to `20260804_01` through `20260804_07` plus the additive `20260809_01` finalization migration and cannot pull earlier Queue Day or unrelated migrations into the release. Run `npm run db:status` and `npm run db:verify` after both independently reviewed units are present.
4. Run `npm run entitlements:census` and `npm run entitlements:dry-run` with an explicit `GETPRIO_DATABASE_URL`. Resolve every blocking ambiguity.
5. Enable resolver shadowing for internal tenants. Compare decisions and latency; do not enable authority on a mismatch.
6. Enable feature enforcement independently, then observe allowance projections for an internal full-period fixture.
7. Enable Ticket, Journey, and Booking accounting separately. Verify final-unit concurrency, journey fallback, and no pre-payment admission after exhaustion.
8. Enable catalog/grants, then credit checkout/refunds. Reconcile PayMongo webhook and manual sync replay before opening vendor navigation.
9. Verify the always-visible Plan Matrix and vendor capacity UI. Enable only the reviewed mutation controls, then verify Owner/Admin versus Staff response boundaries at 320, 390, 768, and 1280 pixels.
10. Set `FREE_PLAN_BACKFILL_ENABLED=true` only for the reviewed apply command. Run `npm run entitlements:apply`, then `npm run entitlements:verify`.
11. Promote internal, low-risk canary, verified paid, eligible Free, then all tenants. Record before/after metrics and sign-off for each cohort.

## Review boundary

The Free-tier database review unit contains exactly these additive migrations:

- `20260804_01_harden_auth_sessions.sql`
- `20260804_02_add_mfa_and_privileged_confirmations.sql`
- `20260804_03_add_free_plan_and_live_policies.sql`
- `20260804_04_add_idempotency_and_security_audit.sql`
- `20260804_05_add_allowance_ledger.sql`
- `20260804_06_add_usage_credit_commerce.sql`
- `20260804_07_add_queue_otp_chains.sql`
- `20260809_01_finalize_free_tier_rollout.sql`
- `20260809_02_repair_free_plan_entitlement_shape.sql`
- `20260809_03_repair_mfa_replacement_indexes.sql`

The Queue Day migrations are a separate prerequisite release unit. A Free-tier reviewer must reject a change set that silently combines either unit or changes this allowlist without a new migration review.

## Incident actions

- Provider outage: disable new subscription/credit/queue-fee checkout. Keep sync/webhook reconciliation running and do not infer payment success.
- Ledger drift: disable the affected allowance denial flag, preserve operations, create an anomaly record, and compensate through an explicit repair operation.
- Duplicate webhook: retain the provider event and idempotent response; verify one purchase and exactly two resource lots.
- Notification outage or Journey exhaustion: keep tickets active and direct customers to ticket status and Web Push. Security, billing, and legal mail remain outside Journey metering.
- OTP abuse: enforce 300/450/675-second resend waits, three resends, five incorrect attempts, and a 30-minute restart pause. Never disclose whether another account exists.
- Audit gap/tamper: stop privileged mutation cohorts, preserve database and application evidence, rotate affected credentials, and investigate the digest chain.
- Partial deploy: turn off the affected server authority flag. New additive columns/tables remain; old compatible reads continue.
- Migration anomaly: exclude the tenant from authority/enforcement, attach evidence to the rollout anomaly, repair, then rerun verification.

## Customer-safe support copy

- Ticket capacity: “This vendor has reached its monthly queue capacity. No payment was started. Please try again after the reset or contact the vendor.”
- Journey fallback: “Your ticket is active. Email updates are paused, so keep the ticket page open or enable browser notifications.”
- Booking capacity: “This vendor has reached its monthly booking capacity. Try another date or contact the vendor.” Credits are never offered.
- OTP resend limit: “You’ve reached the resend limit. Please try joining the queue again later.”
- OTP restart pause: “For your security, verification is paused after several unsuccessful attempts. Please try again later.”
- Refund pending: “Your unused credits are safely frozen while the payment provider confirms the refund.”

## Evidence checklist

Retain schema verification, census/dry-run digest, rollout run IDs, cohort metrics, provider sandbox events, ledger reconciliation, role-boundary screenshots, mobile/accessibility checks, audit exports, authorized ZAP/Burp evidence, backup/restore and event-replay rehearsal, support sign-off, and DPO retention/legal-hold approval.
