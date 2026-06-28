# GetPrio Capstone Route and Role Inventory

This inventory completes the first Phase 0 task from the capstone implementation transition PRD. It maps the current queue-platform routes and roles to the capstone marketplace/booking role model so future work can evolve the app without losing existing behavior.

## Source Snapshot

Inventory date: `2026-06-20`

Current implementation sources:

- Main frontend routes are defined in `frontend/src/App.tsx`.
- Platform dashboard routes are defined in `platform-dashboard/src/main.tsx`.
- Backend API route groups are mounted in `backend/src/app.ts`.
- Global and tenant role types are defined in `shared/types.ts`.
- Tenant membership roles are constrained in `database/init.sql`.
- Permission sets are centralized in `backend/src/services/permissions.js`.

## Current Role Model

| Current Role / Concept | Current Meaning | Capstone Role Mapping | Transition Notes |
| --- | --- | --- | --- |
| Guest / unauthenticated visitor | Public visitor with no token. | Guest | Already maps cleanly to public landing, queue board, join, login, registration, password reset, and future vendor discovery/profile screens. |
| `customer` global role | Registered customer account. | Customer | Already maps cleanly, but current features are queue/account focused rather than full booking history, reviews, notifications, and profile management. |
| `vendor` global role | User has at least one tenant membership. | Vendor Staff or Vendor Admin | This is currently a broad flag and should not be used alone for capstone authorization. Tenant membership role must decide staff/admin behavior. |
| Tenant `owner` role | Primary tenant owner with full tenant permissions and owner-only staff/contact controls. | Vendor Admin | Owner is the strongest Vendor Admin variant. Keep owner-specific controls for irreversible or sensitive vendor administration. |
| Tenant `admin` role | Tenant administrator with broad operating permissions but fewer owner-only controls. | Vendor Admin | Maps to Vendor Admin for most capstone screens, but cannot assign admin/owner roles or perform owner-only actions. |
| Tenant `staff` role | Tenant staff member with queue operation, limited ticket, staff read, billing read, and reports read permissions. | Vendor Staff | Current staff permissions are broader than the final capstone expectation for limited assigned bookings. Future booking work should narrow staff access to assigned bookings/schedules where possible. |
| `platform_admin` global role | Platform operations user with platform tenant, user, setting, plan, queue fee, and billing permissions. | Platform Admin | Maps cleanly to Platform Admin, but capstone governance screens still need vendor approval, moderation, disputes, audit log, reports, and compliance coverage. |

## Current Permission Summary

| Permission Area | Current Permissions | Capstone Interpretation |
| --- | --- | --- |
| Account self-service | `account.read_self`, `account.change_password` | Customer/vendor/platform users can manage own account basics. |
| Platform operations | `platform.tenants.read`, `platform.users.read`, `platform.settings.manage`, `platform.plans.manage`, `platform.queue_fees.manage`, `platform.billing.read` | Existing Platform Admin foundation. Needs approval, moderation, dispute, audit, report, and compliance permissions later. |
| Tenant queue operations | `tenant.queue.read`, `tenant.queue.operate`, `tenant.ticket.read_limited`, `tenant.ticket.update_state` | Reusable same-day service operations foundation. Future booking operations should add booking-specific permissions. |
| Tenant configuration | `tenant.location.manage`, `tenant.counter.manage`, `tenant.settings.manage`, `tenant.settings.manage_contact`, `tenant.theme.manage` | Reusable vendor administration foundation for profile, locations, public display, and availability work. |
| Tenant staff | `tenant.staff.invite`, `tenant.staff.read`, `tenant.staff.manage` | Reusable staff management foundation. Needs clearer Vendor Admin vs Vendor Staff screen split. |
| Tenant billing/reporting | `tenant.billing.read`, `tenant.billing.manage`, `tenant.reports.read` | Reusable vendor billing and analytics foundation. |

## Frontend Route Inventory

| Route | Current Screen | Current Access | Capstone Role | Current Purpose | Transition Action |
| --- | --- | --- | --- | --- | --- |
| `/` | Landing page | Public | Guest | Product/pricing landing page for the queue platform. | Revise copy over time to marketplace/booking while preserving queue as same-day operation. |
| `/login` | Login page | Public | Guest | Email/password login plus OAuth provider entry. | Extend for MFA-required and locked account states. |
| `/oauth/callback` | OAuth callback page | Public/auth callback | Guest, Customer, Vendor Admin | Completes OAuth login or registration callback. | Current implementation is live in repo; keep as an optional provider-backed entry point in capstone docs. |
| `/register/vendor` | Vendor registration page | Public or authenticated setup | Vendor Admin | Creates vendor tenant/workspace and owner account. | Treat as vendor onboarding; later add approval/compliance state. |
| `/register/customer` | Customer registration page | Public | Customer | Creates customer profile. | Extend toward booking history, reviews, notifications, and profile settings. |
| `/account` | Customer account page | Authenticated user; customer UI intent | Customer | Customer profile, ticket/account reuse, password controls. | Add route guard/unauthorized state and expand to full profile/account settings. |
| `/dashboard` | Redirect to `/dashboard/queue` | Authenticated tenant user intended | Vendor Staff, Vendor Admin | Vendor dashboard default route. | Keep redirect, but route access should be enforced by tenant membership and section permission. |
| `/dashboard/:section` | Vendor dashboard sections | Authenticated tenant user intended | Vendor Staff, Vendor Admin | Queue, operations, staff, customers, reports, settings, billing, and theme workflows. | Split future booking/service/catalog/availability sections by Vendor Staff vs Vendor Admin. |
| `/join/:tenantSlug/:locationSlug?` | Join queue page | Public, optionally authenticated | Guest, Customer | Customer/guest queue join flow with OTP/payment-gated join support. | Reframe as same-day service entry; later connect from vendor profile/service detail. |
| Public monitor route from `MONITOR_ROUTE_PATH` | Public queue board | Public | Guest | Live public queue board. | Keep as same-day service board; ensure customer PI remains masked. |
| Joined queue route from `JOINED_QUEUE_ROUTE_PATH` | Joined queue/ticket page | Public with lookup or authenticated customer | Guest, Customer | Ticket status, lookup, cancellation, and account conversion. | Reuse confirmation/lookup patterns for booking confirmation. |
| Legacy monitor route from `LEGACY_MONITOR_ROUTE_PATH` | Redirect | Public | Guest | Redirects older monitor URLs to current monitor route. | Preserve for backwards compatibility. |
| `*` | Landing page fallback | Public | Guest | Unknown routes fall back to landing. | Replace with explicit not-found/access-denied when capstone auth screens are added. |

## Platform Dashboard Route Inventory

All platform dashboard routes require successful login and `platform_admin` in the user roles before the dashboard shell renders.

| Route | Current Screen | Capstone Role | Current Purpose | Transition Action |
| --- | --- | --- | --- | --- |
| `/` | Redirect to `/overview` | Platform Admin | Default portal landing. | Preserve. |
| `/overview` | Overview metrics | Platform Admin | Tenant, user, subscription, payment metrics. | Extend to marketplace governance metrics. |
| `/queue-fees` | Queue fee policy | Platform Admin | Configure queue join fees. | Keep as billing policy; later generalize to marketplace transaction fees if needed. |
| `/plans` | Plan management | Platform Admin | Manage subscription plans. | Preserve. |
| `/settings` | Platform settings | Platform Admin | Platform-level settings such as enterprise inquiry email. | Preserve and extend for compliance settings. |
| `/join-payments` | Queue join payments | Platform Admin | View queue join payment records. | Extend to booking payment references. |
| `/tenants` | Tenant listing | Platform Admin | View tenants/vendors. | Extend to vendor approval queue and verification state. |
| `/subscriptions` | Subscription records | Platform Admin | View tenant subscriptions. | Preserve. |
| `/users` | User listing | Platform Admin | View users and roles. | Extend to moderation/suspension workflow. |
| `/billing-events` | Billing event records | Platform Admin | View processed billing events. | Preserve and connect to audit/reporting. |

## Backend API Route Groups

| Route Group | Mounted Base | Current Access Pattern | Capstone Role Mapping | Current Purpose |
| --- | --- | --- | --- | --- |
| Health | `/api/health` | Public | Operational | Basic health check. |
| Auth | `/api/auth` | Public, optional auth, or authenticated depending on endpoint | Guest, Customer, Vendor Admin, Platform Admin | Registration, login, OAuth, refresh, password reset, logout, session lookup. |
| Account | `/api/account` | Authenticated | Customer, Vendor Staff, Vendor Admin, Platform Admin | Self profile, customer tickets, password change. |
| Public | `/api/public` | Public with optional auth on selected flows | Guest, Customer | Tenant queue snapshots, join OTP, payment sync, ticket create/cancel/lookup, SSE stream. |
| Vendor | `/api/vendor` | Authenticated tenant permission checks | Vendor Staff, Vendor Admin | Tenant dashboard, locations, counters, queue operations, tickets, staff, settings, history, public board theme. |
| Billing | `/api/billing` | Authenticated tenant/user context depending on endpoint | Vendor Admin, Customer for payment-related flow | Subscription and checkout/payment integration. |
| Billing webhooks | `/api/billing/webhooks` | Provider webhook verification | System | Payment provider event intake. |
| Platform | `/api/platform` | Authenticated platform permission checks | Platform Admin | Platform overview, queue fees, plans, settings, payments, tenants, subscriptions, users, billing events. |

## Auth API Endpoint Inventory

| Endpoint | Current Access | Capstone Role / Flow | Notes |
| --- | --- | --- | --- |
| `GET /api/auth/oauth/providers` | Public | Guest | Lists enabled OAuth providers. |
| `GET /api/auth/oauth/:provider/start` | Public | Guest | Starts optional OAuth login/registration. Current live providers are Google and Facebook when configured. |
| `POST /api/auth/register/vendor` | Public | Vendor Admin onboarding | Creates tenant owner flow. |
| `POST /api/auth/register/vendor/complete` | Authenticated | Vendor Admin onboarding | Completes vendor setup for an authenticated account. |
| `POST /api/auth/register/customer` | Public | Customer registration | Creates customer account. |
| `POST /api/auth/login` | Public | All authenticated roles | Uses generic errors and session creation. |
| `POST /api/auth/refresh` | Public with refresh token body | All authenticated roles | Refreshes session token. |
| `POST /api/auth/password-reset/request` | Public | Guest/account recovery | Generic reset request should avoid enumeration. |
| `POST /api/auth/password-reset/confirm` | Public | Guest/account recovery | Confirms reset token and new password. |
| `POST /api/auth/logout` | Authenticated | All authenticated roles | Invalidates current session. |
| `GET /api/auth/me` | Authenticated | All authenticated roles | Returns current user, roles, and tenant memberships. |

## Account API Endpoint Inventory

| Endpoint | Current Access | Capstone Role / Flow | Notes |
| --- | --- | --- | --- |
| `GET /api/account/me` | Authenticated | Customer/account self-service | Reads own account profile. |
| `GET /api/account/tickets` | Authenticated | Customer | Current customer queue/ticket history foundation. |
| `POST /api/account/password` | Authenticated | All authenticated roles | Changes own password. |

## Public API Endpoint Inventory

| Endpoint Pattern | Current Access | Capstone Role / Flow | Notes |
| --- | --- | --- | --- |
| `GET /api/public/tenant/:tenantSlug/.../queue` | Public, optional lookup | Guest, Customer | Public queue snapshot with customer masking rules. |
| `POST /api/public/tenant/:tenantSlug/join-otp` | Public or customer | Guest, Customer | Starts OTP verification for queue join. |
| `GET /api/public/tenant/:tenantSlug/stream` | Public | Guest | SSE queue board updates. |
| `POST /api/public/tenant/:tenantSlug/join-otp/:otpId/resend` | Public | Guest, Customer | Resends queue join OTP. |
| `POST /api/public/tenant/:tenantSlug/join-otp/verify` | Public | Guest, Customer | Verifies queue join OTP. |
| `POST /api/public/tenant/:tenantSlug/join-payments` | Public | Guest, Customer | Creates queue join payment intent/reference when required. |
| `POST /api/public/tenant/:tenantSlug/join-payments/:paymentId/sync` | Public | Guest, Customer | Syncs queue join payment status. |
| `POST /api/public/tenant/:tenantSlug/tickets` | Public or customer | Guest, Customer | Creates queue ticket. |
| `DELETE /api/public/tenant/:tenantSlug/tickets/:lookupCode` | Public with ownership proof or authenticated owner | Guest, Customer | Cancels customer ticket with ownership checks. |
| `GET /api/public/ticket/:lookupCode` | Public with lookup code | Guest, Customer | Looks up joined ticket state. |

## Vendor API Endpoint Inventory

| Endpoint Area | Endpoint Pattern | Current Permission Area | Capstone Role Mapping | Notes |
| --- | --- | --- | --- | --- |
| Dashboard | `GET /api/vendor/tenant/:tenantSlug/dashboard` | `tenant.queue.read` | Vendor Staff, Vendor Admin | Current operational dashboard data. |
| Locations | `GET/PATCH/DELETE /api/vendor/tenant/:tenantSlug/locations...` | `tenant.location.manage` or queue read for listing | Vendor Admin | Location model can support future vendor profile/availability. |
| Hours | `PATCH /api/vendor/tenant/:tenantSlug/locations/:locationSlug/hours` | `tenant.location.manage` | Vendor Admin | Reusable foundation for availability. |
| Counters | `GET/POST/PATCH/DELETE /api/vendor/tenant/:tenantSlug/counters...` | `tenant.counter.manage` or queue read for listing | Vendor Admin, limited Vendor Staff read | Current queue counter operations. |
| Tickets | `POST /api/vendor/tenant/:tenantSlug/tickets` | `tenant.queue.operate` | Vendor Staff, Vendor Admin | Walk-in/same-day service ticket creation. |
| Queue state | `POST /api/vendor/tenant/:tenantSlug/queue/*` | `tenant.queue.operate`, `tenant.ticket.update_state` | Vendor Staff, Vendor Admin | Pause, resume, close, reopen, call next, serve, skip, restore, recover. |
| Settings | `PATCH /api/vendor/tenant/:tenantSlug/settings` | `tenant.settings.manage` / owner-only contact settings | Vendor Admin | Vendor business/settings foundation. |
| History | `GET /api/vendor/tenant/:tenantSlug/history` and export | `tenant.reports.read` | Vendor Admin; current staff also has reports read | Future analytics should be reviewed because staff currently has reporting access. |
| Staff | `GET/POST/PATCH/DELETE /api/vendor/tenant/:tenantSlug/staff...` | `tenant.staff.read`, `tenant.staff.invite`, `tenant.staff.manage` | Vendor Admin, limited Vendor Staff read currently | Capstone should restrict management to Vendor Admin. |
| Public board theme | `GET/PATCH/POST /api/vendor/tenant/:tenantSlug/public-board-theme...` | `tenant.theme.manage` for changes | Vendor Admin | Reusable public branding/profile asset foundation. |

## Billing and Platform API Endpoint Inventory

| Route Group | Endpoint Area | Current Permission | Capstone Role Mapping | Notes |
| --- | --- | --- | --- | --- |
| Billing | Tenant subscription and checkout endpoints | Authenticated tenant/billing context | Vendor Admin | Subscription foundation for marketplace monetization. |
| Billing webhooks | Provider webhook endpoint | Provider/system verification | System | Keep outside user role model; document in IAS attack surface. |
| Platform | `GET /api/platform/overview` | `platform.billing.read` | Platform Admin | Marketplace metrics foundation. |
| Platform | Queue fees read/update | `platform.billing.read`, `platform.queue_fees.manage` | Platform Admin | Existing queue fee governance. |
| Platform | Plans read/update | `platform.billing.read`, `platform.plans.manage` | Platform Admin | Subscription plan governance. |
| Platform | Settings read/update | `platform.settings.manage` | Platform Admin | Platform settings governance. |
| Platform | Queue join payments | `platform.billing.read` | Platform Admin | Payment/reconciliation foundation. |
| Platform | Tenants | `platform.tenants.read` | Platform Admin | Future vendor approval queue foundation. |
| Platform | Subscriptions | `platform.billing.read` | Platform Admin | Subscription oversight. |
| Platform | Users | `platform.users.read` | Platform Admin | Future moderation foundation. |
| Platform | Billing events | `platform.billing.read` | Platform Admin | Billing audit foundation. |

## Phase 0 Decisions

- Use current global `vendor` only as an indicator that a user has vendor-side membership. Do not treat it as sufficient authorization for Vendor Staff or Vendor Admin behavior.
- Map tenant `owner` and `admin` to Vendor Admin, with owner-only controls preserved for sensitive staff and contact-management actions.
- Map tenant `staff` to Vendor Staff, but narrow future booking access to assigned bookings and schedules rather than all queue/report data.
- Keep queue routes and APIs as same-day service operations inside the broader marketplace and booking capstone.
- Treat platform dashboard as the Platform Admin surface and extend it for approval, moderation, disputes, audit logs, reports, and compliance instead of creating a disconnected admin experience.
- Add explicit access denied and not-found UI later; current catch-all landing fallback is not sufficient for the capstone security screen set.

## Immediate Backlog From This Inventory

1. Add a capstone route map artifact for Figma/IAS with screen, form, endpoint, data fields, and OWASP risk columns.
2. Add a vendor public profile model that reuses tenant identity but separates public profile fields from private tenant settings.
3. Add a public vendor discovery endpoint that returns active/approved public profile cards only.
4. Add frontend vendor discovery and public profile routes.
5. Add a role-aware route guard for `/account` and vendor dashboard sections with a visible access denied state.
6. Split future Vendor Staff and Vendor Admin booking access by tenant membership role and assigned work, not by the global `vendor` role.
