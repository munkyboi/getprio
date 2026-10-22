# GetPrio Future Goals

This list tracks agreed future features. Entries are not scheduled implementation work unless explicitly promoted into an execution plan.

## Help Center ownership and content review

- [ ] Add article/FAQ ownership, verified review dates, and an internal report for unreviewed or overdue help content.

Added: 2026-09-10. Status: deferred; no target date.

Start with the existing code-maintained Help Center. Preserve stable article links, record actual verification, and review affected guides when features or policies change. Keep owner/source metadata internal; show public review dates only after verification.

The [Help Center maintenance plan](help-center-maintenance.md) defines scope, workflow, completion criteria, and a later conditional Platform Admin editor with drafts, preview, publishing and revision history. The editor is not a prerequisite for this first improvement.

## Plan Matrix management in the new Platform dashboard

- [x] Add a dedicated Plans route to the Shadcn Platform dashboard.

Added: 2026-09-29. Implemented locally on 2026-09-29; build and tests pass, lint completes with existing warnings, and the authenticated local Plans route was inspected without publishing changes. Live publish and deployment checks remain outstanding.

Bring global plan management into the new dashboard: feature entitlements, monthly allowances, queue fees, policy revision and subscriber context. Keep tenant-specific overrides in Tenants and credit purchases, refunds, disputes, and catalog operations in Billing & credits. Preserve the existing server-side permission and rollout gates, preview/confirmation requirements, recent-authentication/MFA checks, audit reason, and audit record for live mutations. Reuse the current Platform plan APIs and contracts where possible; only add or change APIs when the existing contract cannot safely support the new UI.
