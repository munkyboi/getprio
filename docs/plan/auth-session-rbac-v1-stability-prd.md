# GetPrio V1 Stability PRD

## Scope

This PRD defines the v1 stabilization work for:

```txt
Authentication
Session management
Role-based access control (RBAC)
```

This document is intentionally implementation-oriented. It is written to minimize future refactoring by aligning security, routing, data model, frontend behavior, and capstone IAS requirements around one coherent auth model.

---

## 1. Product Context

GetPrio is a multi-tenant queue management platform with:

- Public customer queue joins
- Registered customer accounts
- Vendor tenant operations
- Platform-wide administration

The platform already supports password login, customer/vendor registration, tenant memberships, and OAuth sign-in initiation. The current auth system is functional but still MVP-simple:

- Access token only
- Bearer token in `Authorization` header
- No refresh token lifecycle
- No lockout/rate-limit protection for login
- No MFA implementation
- RBAC checks exist, but are route-local and not yet modeled as a unified permission system

This PRD upgrades the auth layer into a stable v1 foundation without forcing a full re-architecture later.

---

## Implementation Status

Status date: `2026-06-05`

### Done

- server-tracked auth sessions
- short-lived access token + rotating refresh token
- session-aware auth middleware
- logout and refresh rotation
- login-attempt tracking and temporary lockout
- password reset request / confirm
- authenticated password change
- frontend forgot/reset/change password UI
- centralized tenant/platform permission map
- backend authorization tests for the current permission model

### Partial

- OAuth remains supported and now issues tracked sessions, but it is not yet hardened with privileged-role MFA requirements
- RBAC is centralized, but only for the current repo role model: `owner`, `staff`, `platform_admin`
- session transport still uses bearer token + refresh token in JS-managed client state for browser clients

### Pending

- MFA / step-up flow for privileged roles
- cookie transport migration
- CSRF protection
- logout-all-sessions account security UI
- broader auth and permission regression coverage
- any tenant `admin` role support described in the PRD but not present in the current runtime model

### Important Repo Constraint

The live repo currently supports tenant membership roles:

```txt
owner
staff
```

The PRD mentions `admin`, but that role is not implemented in the current runtime types or route behavior. Any future `admin` role should be treated as a separate product/data-model change, not assumed to exist in this implementation.

---

## 2. Problem Statement

The current authentication and authorization design is sufficient for basic development, but not stable enough for a production-shaped v1 or for the IAS/security deliverables tied to this capstone.

Current risks:

- Session handling is too simple for role-sensitive operations
- JWT-only bearer auth is hard to revoke safely
- No refresh-token rotation or server-side session invalidation
- No brute-force lockout or login throttling
- No session-expiry warning or re-authentication flow
- No formalized permission matrix beyond helper checks
- Customer, vendor, and platform admin auth requirements are not separated strongly enough
- Current OAuth handling is useful but not framed as post-MVP or limited by role/risk

If these gaps are not addressed now, later work on billing, queue operations, staff permissions, audit trails, and ETA/reporting will accumulate security debt and cause avoidable refactoring.

---

## 3. Objectives

### Primary Objective

Create a stable, secure, extensible v1 authentication/session/RBAC foundation for all GetPrio roles.

### Secondary Objectives

- Align implementation with the capstone IAS requirements
- Reduce future refactoring for MFA, OAuth expansion, audit logging, and permission growth
- Make role-aware routing and backend authorization predictable across modules
- Improve reliability of account flows for customer, vendor, and platform admin use cases

### Non-Objectives

This phase does not include:

- ETA layer implementation
- Full SSO / enterprise identity integration
- Fine-grained policy engine or ABAC
- Device fingerprinting as a hard dependency
- Passkeys / WebAuthn
- Customer MFA as mandatory v1 behavior
- Manual admin impersonation tooling

---

## 4. Success Criteria

This scope is successful when:

- All authenticated flows use a consistent token/session strategy
- Server-side logout invalidates active refresh sessions
- Access tokens are short-lived
- Refresh tokens are rotated and tracked server-side
- Role enforcement is consistent and explicit on backend routes
- Platform admin access is clearly separated from vendor access
- Vendor owner/admin/staff permissions map cleanly to supported actions
- Login attempts are throttled and temporarily locked after repeated failures
- Auth errors avoid user enumeration
- Session expiry is handled gracefully in UI
- Password reset and account recovery are defined and secure
- MFA is supported for vendor admin and platform admin paths without requiring another auth redesign

---

## 5. User Roles In Scope

Use these role boundaries consistently in frontend copy, backend access checks, data access, and documentation.

### Guest

- Can view landing content
- Can register
- Can log in
- Can view public queue board
- Can initiate public queue join and OTP verification
- Cannot access authenticated account pages or tenant dashboards

### Customer

- Can access own account
- Can join queues using authenticated profile data
- Can view own queue history
- Can update own profile
- Can manage own waiting ticket where allowed

### Vendor Staff

- Can access assigned tenant operational screens
- Can read limited queue/ticket/customer details required for service operations
- Can perform queue-state actions allowed by assigned role and location/counter scope
- Cannot manage tenant-wide billing, staff, or platform settings

### Vendor Admin

- Can manage tenant operations, locations, counters, staff invitations, settings, branding, reporting, and billing-visible tenant settings
- Must be treated as a higher-risk authenticated role than customer or vendor staff

### Platform Admin

- Can access platform-wide admin screens and records
- Must be treated as the highest-risk authenticated role

---

## 6. Current-State Assessment

### Existing Strengths

- `users`, `oauth_accounts`, and `tenant_memberships` tables already exist
- Vendor role model already distinguishes `owner`, `admin`, and `staff`
- Platform admin is already represented in user roles
- OAuth provider initiation and callback flows already exist
- Protected route middleware already exists

### Current Gaps

- JWTs are no longer long-lived session tokens; access tokens are now short-lived and backed by tracked refresh sessions
- Refresh-token store now exists
- Server-side revocation model for sessions now exists
- Login-attempt tracking and lockout now exist
- Password reset flow now exists
- No session-expiry warning flow
- No CSRF model because auth is not cookie-based yet
- Formal session table and auth security event logging now exist
- RBAC is now permission-driven in code, but still scoped to the current repo role model
- No MFA enforcement path for privileged roles

---

## 7. Product Requirements

## 7.1 Authentication Methods

### Password Authentication

Password auth is the primary v1 authentication method.

Requirements:

- Email + password for all standard accounts
- Password hashing with `Argon2id` preferred
- `bcrypt` is currently used in implementation and remains an accepted transitional choice
- New password writes should use the chosen v1-standard algorithm
- Password rules must be explicit and enforced consistently
- Authentication errors must remain generic

Recommended baseline password policy:

- Minimum 10 characters
- Require at least 1 letter and 1 number
- No composition rules beyond that unless risk increases
- Prevent obvious weak passwords later through denylist extension, but denylist is not required for initial rollout

### OAuth Authentication

OAuth remains supported as a convenience login path, but must be framed as:

```txt
Post-MVP enhancement / limited v1 support
```

Requirements:

- Keep provider linking model
- Keep email collision handling
- Do not allow OAuth to bypass role requirements
- Platform admin must not rely on OAuth-only access without MFA-equivalent protection
- Vendor admin OAuth logins must still satisfy privileged-session requirements

### MFA

MFA is required for:

- Platform Admin
- Vendor Admin

MFA is recommended for:

- Vendor Staff

MFA is optional for:

- Customer

V1 design requirement:

- MFA may be implemented in a second auth sprint, but the session architecture in this PRD must already support it cleanly
- Re-auth or step-up authentication must be possible for privileged actions

---

## 7.2 Session Model

### Decision

Use:

```txt
Short-lived access token + server-tracked rotating refresh token
```

### Access Token

Requirements:

- JWT
- Expiry target: `15 minutes`
- Contains only required claims
- Used for API authorization

Minimum claims:

- `sub`
- `session_id`
- `roles`
- `tenant_membership_summary_version` or equivalent revocation-sensitive marker if needed later

Do not place large permission payloads into JWT claims.

### Refresh Token

Requirements:

- Opaque random token preferred
- Server-tracked
- Rotated on refresh
- Revoked on logout
- Revoked on session compromise or password reset
- Expiry target: `7 to 30 days`, policy-driven by role/risk

Recommended initial expiry:

- Customer: `30 days`
- Vendor Staff: `14 days`
- Vendor Admin: `7 days`
- Platform Admin: `7 days`

### Token Storage

Primary target model:

- `HttpOnly`
- `Secure`
- `SameSite=Lax` or `SameSite=Strict` depending on flow compatibility

Access token and refresh token should move to cookie-based transport for browser clients.

Current implementation note:

- browser auth still uses bearer access token + refresh token stored in JS-managed client state
- this was kept intentionally to finish the session architecture before cookie migration

Compatibility note:

- Current frontend uses bearer token in JS-managed client state
- Migration should support a phased transition so the frontend can be updated without breaking all current screens at once

### Session Table

Add a server-side session store.

Recommended table:

```txt
auth_sessions
- id
- user_id
- refresh_token_hash
- status
- auth_method
- mfa_verified_at nullable
- ip_address nullable
- user_agent nullable
- device_label nullable
- last_seen_at
- expires_at
- revoked_at nullable
- revoke_reason nullable
- created_at
- updated_at
```

Session status values:

- `active`
- `revoked`
- `expired`

Revocation reasons:

- `logout`
- `refresh_rotation`
- `password_reset`
- `password_change`
- `admin_forced_logout`
- `suspected_compromise`

### Session Fixation Protection

Requirement:

- Create a new server-side session on successful login
- Rotate refresh token on refresh
- Issue a new session or session security marker after MFA step-up if needed

### Logout

Requirements:

- Server-side invalidation of current refresh session
- Optional logout-all-sessions for account security page
- Clearing auth cookies on browser logout

---

## 7.3 RBAC Model

### Decision

Continue using role-based authorization, but formalize permissions in one place.

Do not jump to a generic policy engine in v1.

### Role Layers

There are two authorization layers:

1. Platform role
2. Tenant membership role

Platform role examples:

- `platform_admin`

Application role examples:

- `customer`
- `vendor`

Tenant membership role examples:

- `owner`
- `admin`
- `staff`

Current implementation note:

- the live repo currently implements `owner` and `staff`
- `admin` remains a future role and is not assumed by the new permission map

### Permission Model

Permissions should be assigned to roles in code as a stable map, even if not yet stored in DB.

Recommended permission families:

```txt
account.read_self
account.update_self
account.change_password

queue.join
queue.read_public
queue.read_own_ticket
queue.cancel_own_ticket

tenant.queue.read
tenant.queue.operate
tenant.ticket.read_limited
tenant.ticket.update_state

tenant.location.manage
tenant.counter.manage
tenant.staff.invite
tenant.staff.manage
tenant.settings.manage
tenant.theme.manage
tenant.billing.read
tenant.reports.read

platform.tenants.read
platform.users.read
platform.settings.manage
platform.plans.manage
platform.queue_fees.manage
platform.billing.read
```

### Authorization Rules

Requirements:

- Backend is the source of truth
- UI hiding is not security
- Each protected route declares required permission or role guard
- Tenant-scoped routes must validate both tenant access and allowed tenant role
- Platform admin routes must remain isolated from vendor routes
- Customer-owned resources must validate ownership server-side

### Scope Constraints

Vendor staff access should support future narrowing by:

- tenant
- location
- service counter

V1 requirement:

- schema and auth checks should be designed so location/counter scoping can be expanded without rewriting role semantics

---

## 7.4 Login and Registration Flows

### Customer Registration

Requirements:

- Email uniqueness check
- Generic conflict messaging where appropriate
- Password hashing using standard v1 algorithm
- Email verification status stored, even if verification rollout is phased
- Session created immediately on successful registration unless product explicitly wants verification first

### Vendor Registration

Requirements:

- Tenant slug validation
- User creation
- Tenant creation
- Owner membership creation
- Vendor role assignment
- Session creation

### Login

Requirements:

- Generic error on invalid credentials
- Track failed attempts
- Temporary lockout after 5 failed attempts
- Default lockout duration: 15 minutes
- Successful login resets failed-attempt counter
- Privileged roles must be routed through MFA-ready or step-up-capable flow

### OAuth Login/Registration

Requirements:

- Supported intents stay explicit
- Existing account conflict behavior remains deterministic
- Vendor setup completion remains separate from raw OAuth callback
- Session created through the same server-side session model as password login

---

## 7.5 Password Reset and Recovery

Password reset is required for stable v1.

Recommended tables:

```txt
password_reset_tokens
- id
- user_id
- token_hash
- expires_at
- used_at nullable
- created_at
```

Requirements:

- Request reset by email
- Always return generic response
- Single-use reset token
- Expire token after 15 to 30 minutes
- On successful reset:
  revoke all active sessions
  invalidate all unused reset tokens
  record security event

Future-proofing requirement:

- Reset flow must be usable by both customer and vendor/platform accounts without branching logic per role

---

## 7.6 Security Controls

### Login Attempt Tracking

Add a login-attempt store.

Recommended table:

```txt
auth_login_attempts
- id
- identifier_type
- identifier_value
- ip_address nullable
- user_agent nullable
- success
- failure_reason nullable
- attempted_at
```

Identifier values can include normalized email and, later, phone or provider-linked identifiers.

### Lockout

Requirements:

- Lock after 5 failed attempts within policy window
- Lock for 15 minutes by default
- Use generic messaging to avoid enumeration
- Track at least by normalized email
- Later extension may combine email + IP heuristics

### Rate Limiting

Apply rate limiting to:

- `/api/auth/login`
- `/api/auth/register/customer`
- `/api/auth/register/vendor`
- `/api/auth/password-reset/request`
- `/api/auth/password-reset/confirm`
- OAuth start routes if abuse becomes visible

Rate limiting may start in application memory for local/dev but must be designed for persistent/shared storage in real deployment.

Current implementation note:

- login lockout is implemented
- generalized rate limiting middleware is still pending

### CSRF Protection

This becomes required when cookie-based auth is introduced.

Requirements:

- SameSite cookies
- CSRF token for state-changing browser requests
- Explicit allowlist for safe read-only routes

### Audit Logging

Create security event logging for sensitive auth events.

Recommended table:

```txt
auth_security_events
- id
- user_id nullable
- session_id nullable
- event_type
- actor_role nullable
- ip_address nullable
- user_agent nullable
- metadata jsonb
- created_at
```

Event examples:

- `login_success`
- `login_failed`
- `lockout_triggered`
- `logout`
- `refresh_rotated`
- `password_reset_requested`
- `password_reset_completed`
- `mfa_challenge_passed`
- `session_revoked`

---

## 7.7 Frontend Behavior Requirements

### Auth State

Frontend must support:

- initial auth bootstrap
- expired-session handling
- logout
- password reset
- step-up/MFA-ready redirects

Current implementation note:

- initial bootstrap, refresh handling, logout, password reset, and password change UI are implemented
- MFA/step-up redirects are still pending

### Session Expiry UX

Requirements:

- Warn authenticated users before session expiry where practical
- Attempt silent refresh if refresh session is valid
- If refresh fails, redirect to login and preserve safe return path

### Unauthorized States

Requirements:

- Distinguish:
  unauthenticated
  authenticated but unauthorized
  locked account
  expired session
- Unauthorized page must not leak privileged route structure beyond what is necessary

### Role-Aware Routing

Requirements:

- Customer, vendor, and platform routes use shared auth source of truth
- Route guards mirror backend expectations
- Route guard logic should not duplicate full permission logic; backend remains authoritative

---

## 8. API Requirements

Recommended stable v1 auth API surface:

```txt
POST   /api/auth/login
POST   /api/auth/logout
POST   /api/auth/refresh
GET    /api/auth/me

POST   /api/auth/register/customer
POST   /api/auth/register/vendor
POST   /api/auth/register/vendor/complete

POST   /api/auth/password-reset/request
POST   /api/auth/password-reset/confirm
POST   /api/auth/password/change

GET    /api/auth/oauth/providers
GET    /api/auth/oauth/:provider/start
ALL    /api/auth/oauth/:provider/callback

GET    /api/auth/sessions
DELETE /api/auth/sessions/:sessionId
```

### API Contract Rules

- Return generic auth failure messages where security-sensitive
- Include user summary from a single payload builder
- Avoid leaking role internals not needed by client
- Standardize error codes for:
  invalid_credentials
  account_locked
  session_expired
  unauthorized
  forbidden
  password_reset_invalid
  password_reset_expired

---

## 9. Data Model Requirements

### New Tables Required

- `auth_sessions`
- `auth_login_attempts`
- `auth_security_events`
- `password_reset_tokens`

### Existing Tables to Extend

`users`

Recommended additional fields:

```txt
- password_hash_algorithm nullable
- account_locked_until nullable
- failed_login_count default 0
- last_failed_login_at nullable
- last_password_changed_at nullable
- mfa_enabled default false
- mfa_required default false
```

`tenant_memberships`

Possible future-proofing fields:

```txt
- location_scope jsonb nullable
- counter_scope jsonb nullable
```

These do not need to be activated in v1 UI, but the design should not block them.

---

## 10. Migration Strategy

### Key Constraint

Current app uses bearer JWT returned in JSON responses. The v1 target moves toward cookie-backed session architecture.

### Migration Plan

#### Phase A

- Add session tables and logging
- Continue issuing access token in response body for compatibility
- Begin creating server-side session records on login

#### Phase B

- Introduce refresh endpoint and refresh-token rotation
- Update frontend auth bootstrap and expiry handling

#### Phase C

- Move browser clients to HttpOnly cookie transport
- Add CSRF protection
- Retain controlled compatibility only if needed for non-browser clients

#### Phase D

- Enforce MFA for privileged roles

This staged migration reduces refactoring by moving transport and lifecycle first, then hardening policy.

---

## 11. Acceptance Criteria

### Functional

- Customer registration works
- Vendor registration works
- Login works for password users
- OAuth login continues to work for supported providers
- `/me` returns current authenticated user from active session
- Logout revokes refresh session
- Password reset works end to end
- Session refresh works end to end
- Expired access token can be renewed by valid refresh session
- Revoked session cannot refresh

### Security

- Invalid credentials do not reveal whether account exists
- Lockout triggers after policy threshold
- Privileged roles are MFA-ready by architecture
- Platform admin routes are inaccessible without correct role
- Vendor tenant routes reject unauthorized tenant membership access
- Customer cannot access another customer’s resources
- Refresh token rotation prevents straightforward replay of previous refresh tokens

### Operational

- Security events are logged for login, logout, lockout, password reset, and refresh rotation
- Session inventory endpoint supports future account security UI
- Auth/session failures are diagnosable from logs without exposing secrets

---

## 12. Out of Scope for This PRD

- Queue lifecycle rules
- ETA prediction
- Payment hardening outside auth-coupled controls
- Advanced analytics/reporting
- Enterprise SAML/OIDC SSO
- Device trust scoring
- WebAuthn/passkeys

---

## 13. Risks and Mitigations

### Risk: frontend session migration causes churn

Mitigation:

- Use staged compatibility rollout
- Keep one canonical auth payload shape

### Risk: cookie-based auth introduces CSRF regressions

Mitigation:

- Treat CSRF as mandatory in the cookie phase
- Do not partially migrate cookies without CSRF protection

### Risk: privileged-role MFA is deferred too long

Mitigation:

- Add data model and session architecture now
- Tag privileged-session routes for later enforcement

### Risk: RBAC becomes route-by-route custom logic again

Mitigation:

- Centralize permission definitions
- Require every protected route to declare expected permission or guard

---

## 14. Recommended Implementation Order

### Phase 1

- Add auth/session tables
- Add login-attempt tracking
- Add security event logging
- Extend user schema for lockout/session metadata

### Phase 2

- Refactor login to create tracked server sessions
- Add refresh endpoint
- Add logout endpoint
- Add session revocation logic

### Phase 3

- Add password reset request/confirm flows
- Add account password change flow
- Revoke sessions on password reset/change

### Phase 4

- Formalize permission map
- Refactor route guards to use consistent authorization checks
- Add unauthorized/access-denied UX

### Phase 5

- Move browser auth transport toward HttpOnly cookies
- Add CSRF protection
- Add session-expiry warning UX

### Phase 6

- Add MFA enforcement for platform admin and vendor admin

---

## 15. Final Recommendation

Do not treat auth hardening as a small patch to the existing JWT login flow.

The stable v1 target should be:

```txt
short-lived access token
+ rotating server-tracked refresh session
+ explicit RBAC permission map
+ lockout/rate-limit protection
+ password reset
+ audit-grade auth event logging
+ MFA-ready privileged session model
```

That is the minimum shape that will support later queue operations, billing, platform administration, and security documentation without forcing a second major auth redesign.
