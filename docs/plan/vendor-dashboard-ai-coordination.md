# Vendor dashboard rework coordination snapshot

13 October 2026. This bounded snapshot accompanies the versioned rework plan. The earlier chronological coordination record remains in the original `booking-ticket-details` planning checkout; reported historical progress is not deployment evidence.

- Vendor dashboard chat owns the frontend rework, board settings/scanner presentation, dashboard forms/navigation/theme and their docs.
- Queue/runtime chat owns lifecycle, counters, staff-access runtime, authoritative station/resource contracts, writer coverage and reconciliation.
- AI chat owns capture, evaluation, readiness and inference integration. UI policy/configuration does not activate customer estimates.
- Mobile chat owns booking/channel parity, including service quantity limits and selected-service behavior.
- Platform chat owns platform/commercial administration. Vendor billing UI preserves existing permissions, confirmation and capability contracts.

Current audit baseline: fetched main `f7435a22`. Main has secure board access, scanner dialog, quantity bounds and the Account header fix. Existing Resources configuration is a configuration surface, not proof of runtime allocation. Shell work is unconnected WIP and paused for the requested audit.

Shared first-slice boundaries: frontend App route/shell seams, VendorDashboardPage shell seams, new vendor components/theme/navigation/styles and frontend dependency/configuration files. Do not change backend/schema/shared payloads through the shell slice without coordinating ownership.

Read the [full source and plan audit](vendor-dashboard-full-audit.md) and [preservation checklist](vendor-dashboard-rework-preservation-checklist.md) before replacing a feature. Update this snapshot on material ownership/contract changes, record exact merge/runtime evidence separately, and preserve API compatibility until authoritative replacements exist.
