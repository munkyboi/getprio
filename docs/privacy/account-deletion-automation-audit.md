# Account deletion automation: code and policy audit

**Research date:** 2026-09-28
**Scope:** current local Platform/backend implementation and official Philippine, Apple, Google Play, and provider documentation. This is a design/research artifact, not a legal opinion, deployment verification, or proof that any production deletion has completed. The checkout already contains unrelated in-progress changes; this audit did not modify application code, run a deletion, or inspect secrets.

## Implementation status update (2026-09-28)

The local code now implements the admin-initiated workflow skeleton: audited read-only scan queue; report-version-bound, categorized cleanup approval with required reasons for exclusions; an asynchronous allowlisted relational cleanup transaction; and separate asynchronous user-report delivery. The legacy six-task checklist no longer triggers deletion in the worker. The request is marked completed only after report delivery is accepted. These are local code/test observations, not a deployed or production deletion.

The automation is intentionally incomplete: the scan only covers numeric relational user-ID references, and the worker currently handles the user identity plus known ticket/booking PII. Copied identifiers/JSON, object storage/CDN, supplier systems, legal/financial disposition, and backups remain explicitly unscanned or requiring review. The dashboard records them as excluded when the admin unchecks them; it does not automate or certify their deletion. Provider adapters, richer per-action verification receipts, durable production alerting, legal/retention approval, restore replay, deployed migration, live email delivery, and a disposable end-to-end environment remain release gates. The detailed target recommendations below remain future work where not described in this update.

## Executive recommendation

Make the normal path automatic and put only exceptions in the Platform dashboard. On verified request acceptance, create a durable per-request workflow; automatically revoke access and execute deterministic first-party/provider cleanup; verify each action; then produce a restricted, privacy-minimized evidence manifest. Admins should only decide cases the system cannot safely decide: an approved retention exception, unresolved ownership/financial matter, legal hold, provider outage/unsupported integration, or a failed verification.

Do not label the account “deleted” merely because jobs were submitted. Distinguish **removed and verified**, **provider accepted / expiry pending**, **retained under an approved exception**, and **failed / needs review**. Legal basis, classification of records, and an exception decision must be approved by the DPO/counsel/CPA; software can enforce that catalog, not invent it.

### A simpler, operations-first catalog

The catalog does not need to mirror every table or become a large compliance project. Use four dispositions, and attach them only to the few data groups where deletion could affect GetPrio operations:

| Disposition | Default treatment | Safe automation boundary |
|---|---|---|
| **Delete** | Erase data used only for the account, such as credentials/sessions, profile-only preferences, and the account's own media/content where removal does not alter another user's business record. | Revoke access immediately. Delete eligible data after a scoped inventory and successful verification. Never cascade into shared tenant or operational data. |
| **Retain minimized** | Preserve only the operational facts needed for a booking, queue record, payment/accounting source, dispute, or security/audit trail. Remove unnecessary profile copies and restrict access where approved. | Apply only a pre-approved, field-level transformation. Retain the reason, owner, and expiry/review date; do not preserve the full profile as a shortcut. |
| **Defer until safe** | Keep an active booking/queue or in-flight financial operation usable until it reaches a safe terminal point. | Stop account access and nonessential notifications now, but defer record unlinking/scrubbing that could prevent check-in, service completion, refund/dispute handling, or reconciliation. Re-evaluate automatically at the next safe state. |
| **Manual review** | Resolve legal holds, unclear retention basis, shared ownership, and provider failures or unverified integrations. | Fail closed for destructive changes. Give an admin a specific reason and a narrow choice; do not make the requestor or admin attest to routine cleanup. |

**Conservative default for GetPrio:** the request immediately disables the account and sessions. It does not automatically delete a vendor, tenant, project, API keys/webhooks needed by another operator, active booking/queue evidence, payment history, security audit history, or provider/backup copies. Vendor ownership and shared resources go to review or a separately approved transfer/closure flow. Once operational dependencies are terminal, the system resumes applicable cleanup and records the result. This keeps account access removal separate from destructive removal of business records.

For a first rollout, automate only the clearly account-scoped actions already understood by the product. Leave uncertain/shared data unchanged but access-restricted as appropriate until the smallest necessary field-level rule is approved. This is safer than trying to automatically discover and delete every possible reference in one pass.

## Current implementation audit (local source review)

The following describes the current checkout, not a claim about what is deployed.

| Area | Current behavior | Automation gap / risk |
|---|---|---|
| Request acceptance | `accountDeletionService.js` reauthenticates, creates/updates one request per user, revokes sessions, removes web push, deactivates mobile push, suppresses some notifications, cancels waiting tickets, obsoletes queued notifications, removes reviews, and inserts six task rows. | Useful immediate containment, but task creation is a fixed checklist rather than actions selected from a data map. The cleanup is split between request acceptance, worker, CLI, and manual attestations. |
| Work gating | `accountDeletionWorker.js` requires all six task rows to be completed with free-text evidence and a retention notice before final deletion. | It requires `personal_data_inventory`, `supplier_data`, `financial_and_legal_retention`, and `backup_disposal` even when a category is not present or action is not applicable. This creates manual “evidence” work and encourages unsupported blanket attestations. |
| Email dependency | Before any request work, the worker defers the request if transactional email is not configured. | Inventory and privacy cleanup can be independent of notification delivery. Email failure should leave notification pending, not block unrelated cleanup or evidence capture. |
| Relational inventory | `accountDeletionInventoryService.js` counts numeric `users.id` and numeric columns named like `*_user_id`/FKs. It records source names and counts and explicitly limits its scope. | It will not find UUID/string references, copied email/phone/name, JSON/text payloads, provider records, caches, or backup copies. It is a useful diagnostic, not a PII inventory or proof of erasure. |
| First-party erasure | Worker scrubs selected ticket/booking identity fields, removes login attempts and security events, then deletes the user in a transaction. FK restrictions fail closed. | Many copied identifiers and JSON payloads exist outside those fields. `ON DELETE SET NULL` can sever identity links without scrubbing copied PII; `RESTRICT` can block deletion. Each retained business record needs a defined disposition. |
| Object storage | `avatarDeletionService.js` has safe version-aware B2 enumeration/deletion and verifies that one user-avatar origin prefix is empty. `scripts/account-deletion.mjs avatars … --apply` invokes it. | It is a separate operator action and does not attest the broad storage/cache task. Other media buckets, older cache copies, locks, CDN routing, and backups are not covered. The CLI `attest`/`notice` commands update records directly without the Platform audit-service path. |
| External services | No unified provider cleanup is wired into the deletion worker. Mobile registration rows are disabled locally. Apple OAuth response handling does not persist a revocation token. PayMongo customer references must be confirmed. | Local deactivation is not supplier-side deletion. Firebase cleanup is possible only if the stored identifier is truly a Firebase Installation ID (FID); current schema calls it `installation_id`, which is not proof of that. Apple token revocation cannot be done later if the needed credential was discarded. |
| Role / ownership | The generic request path is available to customer/vendor surfaces, but worker cleanup centers on customer queue/booking records. FK restrictions preserve some business ownership references. | Vendor-owned tenant/project/media lifecycle and shared records need distinct owner-transfer/closure rules. Blindly deleting the user or shared tenant data can harm other users or destroy business records. |
| Evidence and completion | Automated inventory report is stored on its task; task evidence and completion notification are stored with the request. | No single versioned manifest ties together all jobs, attempts, verifications, provider request IDs, policy versions, retention exceptions, or backup expiry. Free-text evidence and direct CLI writes weaken consistency and auditability. |

### Data classes requiring explicit disposition

The current relational scan should be supplemented by a version-controlled data map covering at least:

- Direct profile/auth data, MFA factors/recovery codes, OAuth links, sessions, push tokens, and notification settings.
- Queue/booking identity copies and event metadata; OTP `delivery_target` and JSON payloads; notification recipient/subject/error/metadata; support/developer tickets with copied email/name/reference; reviews and uploads.
- Payment/customer-vault identifiers and payment, refund, dispute, accounting, or tax source records. A payment record must not automatically preserve the entire account profile.
- Vendor tenant ownership, projects, API keys/webhooks, campaigns and user-generated public content. Decide whether to transfer owner, close tenant, remove personal fields, or retain a minimized record.
- B2 object versions, any CDN/cache copies, supplier-side data, application/database/log backups, and restored-backup replay.

The SQL schema includes copied identifiers in ordinary columns and JSON payloads, as well as `CASCADE`, `SET NULL`, and `RESTRICT` foreign keys. Therefore, neither a generic FK inventory nor successful user-row deletion proves data minimization across those records.

## What the evidence should prove

Generate one append-only, access-controlled **deletion execution manifest** per request, with a schema version and policy/disposition-catalog version. Each action receipt should include:

- opaque request/action IDs; data category and system; action and policy version;
- status, started/completed timestamps, attempt number, and safe error class;
- scope/query or provider operation identifier; counts or version counts where useful;
- verification method and result (for example, post-delete count is zero, B2 prefix version listing is empty, provider returned accepted, or retention expiry scheduled);
- actor type (system/operator) and audited exception/approval reference.

Do **not** store raw table row values, emails, phone numbers, OTPs, message bodies, object URLs/keys, access tokens, payment credentials, or unrestricted provider payloads in the dashboard or general security log. Keep any provider receipt needed for support in restricted storage, reference it by opaque ID, and set a retention period for the evidence itself. A count-only inventory can still reveal sensitive structure; authorize and retain it narrowly.

Status vocabulary should distinguish:

1. `completed_verified` — action ran and a defined verification passed.
2. `provider_accepted_pending_expiry` — provider accepted a deletion request but has a documented processing/backup window.
3. `retained_restricted` — specific fields remain under an approved legal/business exception, access blocked, owner and expiry/review date recorded.
4. `not_applicable` — the data/system was not used for this request, based on an auditable inventory/configuration check.
5. `retrying` / `failed_review` — transient or permanent failure with retry policy and escalation.

“Evidence generated” means reproducible execution and verification records. It is not a certificate that no copy exists anywhere or a substitute for provider assurances.

## Recommended target workflow

1. **Policy and inventory foundation.** DPO/counsel/CPA approve the small four-outcome catalog above and identify only the data groups that need a special rule. Version the rules. Add field/table detail only for the data being automated; include role-specific handling for customer vs vendor/admin and shared data.
2. **Accept and contain.** Preserve the current reauthentication/rate-limit behavior. Commit request + immutable workflow actions first; revoke sessions and suppress dispatch. Ensure idempotency keys prevent duplicate actions. Do not require email delivery to start cleanup.
3. **Run action jobs.** Each action is independent, durable, idempotent, retriable with backoff, bounded, and observable. Use a worker/outbox or durable jobs table; lease jobs and use deduplication keys. Avoid a single all-or-nothing task set. Determine applicable actions from the inventory and policy; produce `not_applicable` receipts where warranted.
4. **Automate first-party data.** Add a reviewed inventory of tables/columns/JSON fields and opaque external IDs. For every data class, test scrub/delete/retain results, including joins and shared records. Unknown new PII-bearing fields should fail a schema/inventory test rather than silently be omitted. Keep FK restrictions fail-closed, but route blockers to an exception panel with a safe reason code.
5. **Integrate providers.** Implement scoped adapters for B2 versions, configured CDN, Firebase (only verified FIDs), Apple token revocation, email provider, and any PayMongo customer/vault resource. Keep per-provider state and exact acknowledgment semantics. If no API exists, open a provider follow-up exception; never mark it deleted based on local row cleanup.
6. **Preserve only approved exceptions.** Apply approved transformations automatically where possible: remove identity/profile and keep a minimized transaction/source record; restrict access; store basis, approver, and review/expiry date. Do not make users/admins manually compose arbitrary retention notice text. Generate accurate user-facing notice from completed action/exception results.
7. **Verify and notify.** Complete active-system erasure only when required action receipts pass or approved exceptions are installed. Send completion email as an independent notification job; failed email is retryable and should not cause an already-erased account to be reprocessed destructively. Provide an authenticated/web status or alternate contact path when email is unavailable.
8. **Backups and restore safety.** Treat backup expiry as a scheduled/pending state, not immediate erasure. Record retention window and scheduled expiry from provider configuration; prevent restored data from becoming live before replaying deletion tombstones. Periodically test restore-and-replay with a synthetic deleted account.
9. **Platform dashboard.** Replace routine manual checklist controls with a concise timeline: “automated and verified,” “scheduled provider/backup expiry,” “retained under exception,” and “needs review.” Show only safe reason codes and provider/action references. Admin buttons should be limited to approvals, retries, ownership resolution, legal hold/retention exception, and audited override.

## Provider and policy findings

### Philippine privacy and accounting

NPC guidance recognizes a right to request erasure/blocking from live and backup systems, but also permits whole or partial denial when data is still necessary for specified purposes, legal obligations/claims, legitimate business purposes, or other law. This supports a category-level decision and restricted exception—not “delete everything regardless” and not blanket retention of the account. The applicable basis and fields must be decided for each record class. [NPC: Right to erasure or blocking](https://privacy.gov.ph/right-to-erasure-or-blocking/)

The existing repository retention schedule calls 30-day active erasure, 90-day ordinary logs, 35-day backup expiry, and 12-month minimal audit **owner-approved implementation targets**, not periods prescribed by NPC/Apple. Verify that deployed stores can meet these targets before publishing them. The BIR's RR 7-2024 retention period applies to qualifying books/accounting records under its conditions; have the accountant map actual GetPrio fields/documents to that rule and any pending tax matter. It is not a basis to retain a whole user profile for five years. [BIR RR 7-2024](https://bir-cdn.bir.gov.ph/BIR/pdf/RR%20No.%207-%202024.pdf)

### App-store obligations

Apple requires in-app account deletion initiation, deletion of account and associated personal data except what must legally remain, clear timing/completion communication, and revocation of Sign in with Apple tokens. Apple permits a process that takes time if timing and completion are communicated; if a later scheduled deletion is offered, Apple says an immediate deletion option must also exist. Confirm current UI/platform policy with counsel and app-review owner. [Apple account deletion requirements](https://developer.apple.com/support/offering-account-deletion-in-your-app)

Google Play allows an in-app deletion flow or an in-app link to a web resource, but also requires a functional, discoverable web deletion resource usable without reinstalling the app. Associated data and relevant third-party data are in scope; provider deletion should be requested. Audit the actual Play Console declaration and currently published web resource/build; source inspection alone does not establish compliance. [Google Play account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en)

### External systems

- **Backblaze B2:** current version-aware avatar deletion is directionally correct. S3-compatible deletion without a version ID can create a delete marker rather than remove old versions, so evidence must enumerate/delete versions and verify the prefix. Confirm bucket, versioning, Object Lock/retention, app-key delete permissions, and actual CDN path. Lifecycle expiry is not per-request completion evidence. [B2 ListObjectVersions](https://www.backblaze.com/apidocs/s3-list-object-versions), [B2 DeleteObject](https://www.backblaze.com/apidocs/s3-delete-object), [Object Lock](https://www.backblaze.com/docs/cloud-storage-object-lock)
- **Firebase:** Firebase documents client/server deletion of an FID, with server-side deletion processing that can take 1–2 days to stop accepting data and up to 180 days for associated service data to be removed from live and backup systems. Current GetPrio `installation_id` values must first be confirmed as actual Firebase FIDs. Locally deactivating an FCM row only prevents GetPrio from using it. [Firebase installations](https://firebase.google.com/docs/projects/manage-installations)
- **Apple Sign in:** app-store guidance requires token revocation. Current OAuth code discards Apple token response material; if revocation is required at account deletion, preserve a properly protected, scoped revocation credential or redesign the flow to retain the authorization code safely until revocation. Do not store an access/refresh token in the evidence manifest. [Apple account deletion guidance](https://developer.apple.com/support/offering-account-deletion-in-your-app)
- **PayMongo:** official API exposes `DELETE /v1/customers/{id}` and card-vaulting docs mention deleting a customer or saved payment method. This is not evidence that charges, disputes, receipts, or accounting records are erased. Verify whether GetPrio actually creates/links Customer resources and map each resource before calling this endpoint; do not search/delete customers by email as an ambiguous substitute for a stored provider ID. [PayMongo Delete Customer](https://docs.paymongo.com/reference/delete-a-customer), [Card vaulting](https://docs.paymongo.com/docs/payment-acceptance-card-vaulting)
- **Email provider:** the runtime can be configured for multiple providers. Determine the real provider/plan and DPA from deployment without exposing keys. Resend's DPA describes email recipients, addresses, message content/metadata and a customer instruction relationship; verify the executed agreement and plan-level message/log deletion controls. No per-recipient deletion endpoint was established in this audit, so treat provider-side message cleanup as a contract/support/retention action until the vendor confirms an API. [Resend DPA](https://resend.com/legal/dpa), [Resend retention/security](https://resend.com/security/gdpr)

## Human decisions and operational facts still required

These are narrow approval/verification items, not tasks to push onto every deletion requester:

1. DPO/counsel approves the disposition catalog and exception grounds; CPA confirms which exact transaction/source records qualify for accounting retention and computes the correct expiry basis.
2. Ops supplies a non-secret inventory of production systems/providers, buckets, CDN, email vendor/plan, backup schedule/restore path, provider contracts, and enabled integration features.
3. Product/security decides role-specific treatment for vendor ownership/projects/API keys/webhooks and unresolved bookings, disputes, chargebacks, abuse/security investigations, or legal holds.
4. Engineering verifies the published mobile and web entry points, including an external web resource for users who uninstalled the app; verifies Apple token-revocation credential lifecycle and Firebase identifier type.
5. DPO approves what minimal evidence may be kept, who can see it, and its expiry. The current 12-month implementation target should be validated against audit/security obligations.

## Phased implementation order

**P0 — stop false evidence:** decouple email delivery from cleanup; remove direct unaudited CLI evidence writes; replace blanket required task gating with action applicability and truthful status; add monitoring for overdue/failing requests.

**P1 — deterministic first-party cleanup:** approve and encode field/table dispositions; broaden inventory to copied identifiers and JSON with tests; automate B2 avatar cleanup and verification; add schema guard tests for newly introduced user-linked PII; make completion notification asynchronous.

**P2 — provider jobs:** verify inventory and implement supported B2/CDN, Firebase FID, Apple revocation, PayMongo Customer/payment-method, and email-provider actions. Capture provider acknowledgments separately from final deletion and reflect contractual expiry windows.

**P3 — backups and lifecycle:** implement deletion tombstones/restore replay, verify lifecycle settings against target, test restored backups, expire minimal evidence, and audit actual production behavior with a dedicated disposable account.

**Release gate:** tests, local DB, and code review establish implementation behavior only. Before claiming production automation, require a deployed synthetic end-to-end request, provider receipts, backup restore/replay proof, dashboard observation, notification outcome, and DPO/CPA approval of retained categories. Never use a real user's account as the end-to-end test.

## Official sources checked

All sources below were reviewed on 2026-09-28. Provider API availability and contracts can change; verify before implementation.

- [NPC: Right to erasure or blocking](https://privacy.gov.ph/right-to-erasure-or-blocking/)
- [BIR Revenue Regulations No. 7-2024](https://bir-cdn.bir.gov.ph/BIR/pdf/RR%20No.%207-%202024.pdf)
- [Apple: Offering account deletion in your app](https://developer.apple.com/support/offering-account-deletion-in-your-app)
- [Google Play: App account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en)
- [Backblaze: List object versions](https://www.backblaze.com/apidocs/s3-list-object-versions), [delete object](https://www.backblaze.com/apidocs/s3-delete-object), [Object Lock](https://www.backblaze.com/docs/cloud-storage-object-lock)
- [Firebase: Manage installations and IDs](https://firebase.google.com/docs/projects/manage-installations)
- [PayMongo: Delete a Customer](https://docs.paymongo.com/reference/delete-a-customer), [card vaulting](https://docs.paymongo.com/docs/payment-acceptance-card-vaulting)
- [Resend: Data Processing Addendum](https://resend.com/legal/dpa), [retention and security](https://resend.com/security/gdpr)

## Local source map

- `backend/src/services/accountDeletionService.js` — request-time behavior and fixed task requirements.
- `backend/src/services/accountDeletionWorker.js` — email gate, inventory, final scrub/delete, and completion notice.
- `backend/src/services/accountDeletionInventoryService.js` — restricted numeric relationship scan and declared exclusions.
- `backend/src/services/avatarDeletionService.js` — B2 version enumeration/removal and origin-only verification.
- `backend/src/services/accountDeletionAdminService.js` and `platform-dashboard-shadcn/src/App.tsx` — Platform task/evidence workflow.
- `scripts/account-deletion.mjs` — operator commands, including direct task attestation/notice writes.
- `docs/privacy/account-deletion-runbook.md` and `docs/privacy/account-deletion-retention.md` — current implementation assumptions, owner-approved targets, and release checks.
