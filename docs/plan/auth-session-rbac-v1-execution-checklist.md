# Auth / Session / RBAC V1 Execution Checklist

This document turns the PRD into an implementation checklist for the current GetPrio codebase on branch:

```txt
prd-1-auth-session-rbac-v1-stability
```

It is written to be executable in sequence with minimal rework.

---

## 1. Current Codebase Baseline

### Existing backend files

- [authRoutes.js](/Users/carloabella/Projects/getprio/dev/backend/src/routes/authRoutes.js)
- [auth.js](/Users/carloabella/Projects/getprio/dev/backend/src/middleware/auth.js)
- [users.js](/Users/carloabella/Projects/getprio/dev/backend/src/repositories/users.js)
- [oauthService.js](/Users/carloabella/Projects/getprio/dev/backend/src/services/oauthService.js)
- [accountRoutes.js](/Users/carloabella/Projects/getprio/dev/backend/src/routes/accountRoutes.js)
- [env.ts](/Users/carloabella/Projects/getprio/dev/backend/src/config/env.ts)
- [app.ts](/Users/carloabella/Projects/getprio/dev/backend/src/app.ts)

### Current behavior

- password login returns a long-lived JWT in JSON response
- auth middleware reads `Authorization: Bearer <token>`
- no refresh session model
- no logout endpoint
- no password reset flow
- no login-attempt lockout
- tenant/platform RBAC is helper-based, not permission-map-based

### Migration style already used

- raw SQL files under [database/migrations](/Users/carloabella/Projects/getprio/dev/database/migrations)
- bootstrap schema also exists in [init.sql](/Users/carloabella/Projects/getprio/dev/database/init.sql)

---

## 2. Delivery Strategy

Do this in eight slices.

### Slice 1

Schema foundation

### Slice 2

Session infrastructure and token issuance

### Slice 3

Login hardening and lockout

### Slice 4

Logout and refresh flow

### Slice 5

Password reset and password change

### Slice 6

RBAC permission-map refactor

### Slice 7

Frontend auth lifecycle adjustments

### Slice 8

Cookie transport and CSRF

Slices 1 to 4 should be the first implementation milestone. That gives a stable auth backbone without over-expanding scope.

---

## 3. Slice 1: Schema Foundation

## 3.1 Add migration

Create a new SQL migration file:

```txt
database/migrations/20260605_add_auth_session_security_tables.sql
```

### New tables

#### `auth_sessions`

Fields:

```txt
id BIGSERIAL PRIMARY KEY
user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE
refresh_token_hash TEXT NOT NULL
status TEXT NOT NULL CHECK (status IN ('active', 'revoked', 'expired'))
auth_method TEXT NOT NULL CHECK (auth_method IN ('password', 'google', 'facebook'))
mfa_verified_at TIMESTAMPTZ
ip_address TEXT
user_agent TEXT
device_label TEXT
last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
expires_at TIMESTAMPTZ NOT NULL
revoked_at TIMESTAMPTZ
revoke_reason TEXT
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

Indexes:

- unique or indexed lookup on `refresh_token_hash`
- index on `user_id, status`
- index on `expires_at`

#### `auth_login_attempts`

Fields:

```txt
id BIGSERIAL PRIMARY KEY
identifier_type TEXT NOT NULL CHECK (identifier_type IN ('email'))
identifier_value TEXT NOT NULL
ip_address TEXT
user_agent TEXT
success BOOLEAN NOT NULL
failure_reason TEXT
attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

Indexes:

- index on `identifier_value, attempted_at DESC`
- index on `attempted_at`

#### `auth_security_events`

Fields:

```txt
id BIGSERIAL PRIMARY KEY
user_id BIGINT REFERENCES users(id) ON DELETE SET NULL
session_id BIGINT REFERENCES auth_sessions(id) ON DELETE SET NULL
event_type TEXT NOT NULL
actor_role TEXT
ip_address TEXT
user_agent TEXT
metadata JSONB NOT NULL DEFAULT '{}'::JSONB
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

Indexes:

- index on `user_id, created_at DESC`
- index on `session_id`
- index on `event_type, created_at DESC`

#### `password_reset_tokens`

Fields:

```txt
id BIGSERIAL PRIMARY KEY
user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE
token_hash TEXT NOT NULL
expires_at TIMESTAMPTZ NOT NULL
used_at TIMESTAMPTZ
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

Indexes:

- unique or indexed lookup on `token_hash`
- index on `user_id, created_at DESC`
- index on `expires_at`

### Extend `users`

Add columns:

```txt
password_hash_algorithm TEXT
account_locked_until TIMESTAMPTZ
failed_login_count INTEGER NOT NULL DEFAULT 0
last_failed_login_at TIMESTAMPTZ
last_password_changed_at TIMESTAMPTZ
mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE
mfa_required BOOLEAN NOT NULL DEFAULT FALSE
```

### Bootstrap schema update

Mirror these additions into:

- [init.sql](/Users/carloabella/Projects/getprio/dev/database/init.sql)

This keeps local clean bootstraps aligned with migrations.

---

## 4. Slice 2: Session Infrastructure

## 4.1 Add repository files

Create:

- `backend/src/repositories/authSessions.js`
- `backend/src/repositories/authLoginAttempts.js`
- `backend/src/repositories/authSecurityEvents.js`
- `backend/src/repositories/passwordResetTokens.js`

### `authSessions` repository responsibilities

- create session
- find by refresh token hash
- find by id
- list active sessions for user
- rotate refresh token hash
- revoke one session
- revoke all user sessions
- mark expired sessions
- update `last_seen_at`

### `authLoginAttempts` repository responsibilities

- record attempt
- count recent failed attempts by identifier
- optional query by IP later

### `authSecurityEvents` repository responsibilities

- append event records

### `passwordResetTokens` repository responsibilities

- create token
- find token by hash
- invalidate unused tokens for user
- mark token used

---

## 4.2 Add service files

Create:

- `backend/src/services/authService.js`
- `backend/src/services/sessionService.js`
- `backend/src/services/securityEventService.js`
- `backend/src/services/passwordResetService.js`

### `sessionService` responsibilities

- generate access token
- generate opaque refresh token
- hash refresh token for storage
- create auth session
- rotate refresh session
- revoke auth session
- revoke all sessions for user
- decide expiry window by role/risk

### `authService` responsibilities

- normalize login identifier
- validate password login
- evaluate lockout state
- reset failed-login counters on success
- increment failed-login counters on failure
- build auth response payload

### `securityEventService` responsibilities

- small wrapper around event creation
- standardize event names and metadata shape

### `passwordResetService` responsibilities

- generate reset token
- hash and persist token
- validate reset token
- complete password reset
- revoke sessions after reset

---

## 4.3 Extend env config

Add new env values in:

- [env.ts](/Users/carloabella/Projects/getprio/dev/backend/src/config/env.ts)

Suggested additions:

```txt
ACCESS_TOKEN_TTL_MINUTES=15
REFRESH_TOKEN_TTL_DAYS_CUSTOMER=30
REFRESH_TOKEN_TTL_DAYS_VENDOR_STAFF=14
REFRESH_TOKEN_TTL_DAYS_VENDOR_ADMIN=7
REFRESH_TOKEN_TTL_DAYS_PLATFORM_ADMIN=7
LOGIN_LOCKOUT_THRESHOLD=5
LOGIN_LOCKOUT_WINDOW_MINUTES=15
LOGIN_LOCKOUT_DURATION_MINUTES=15
PASSWORD_RESET_TTL_MINUTES=30
```

Do not overcomplicate this yet with plan-based auth policies.

---

## 5. Slice 3: Login Hardening

## 5.1 Refactor `authRoutes.js`

Do not rewrite all auth routes at once. First extract reusable helpers.

Target route changes:

- `POST /api/auth/login`
- `POST /api/auth/register/customer`
- `POST /api/auth/register/vendor`
- `POST /api/auth/register/vendor/complete`
- OAuth callback completion path

### New login behavior

On password login:

1. normalize email
2. check lockout state
3. load user
4. compare password
5. record failed attempt on failure
6. update failure counters on failure
7. create tracked auth session on success
8. issue short-lived access token
9. issue refresh token
10. log security event

### Compatibility output

For the first phase, keep returning:

```json
{
  "token": "<access-token>",
  "refreshToken": "<refresh-token>",
  "user": { ... }
}
```

This avoids immediate frontend breakage.

### Lockout behavior

Rules:

- generic invalid credential response remains
- if locked, return controlled auth error
- successful login resets `failed_login_count`

---

## 5.2 Update user repository

Extend [users.js](/Users/carloabella/Projects/getprio/dev/backend/src/repositories/users.js):

- map new auth fields
- support updating:
  - `passwordHashAlgorithm`
  - `accountLockedUntil`
  - `failedLoginCount`
  - `lastFailedLoginAt`
  - `lastPasswordChangedAt`
  - `mfaEnabled`
  - `mfaRequired`

Add small helper methods if cleaner:

- `incrementFailedLogin`
- `resetFailedLoginState`
- `lockUserUntil`

If helpers are added, keep them repo-local and composable.

---

## 6. Slice 4: Refresh and Logout

## 6.1 Add endpoints

Add to [authRoutes.js](/Users/carloabella/Projects/getprio/dev/backend/src/routes/authRoutes.js):

- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/sessions`
- `DELETE /api/auth/sessions/:sessionId`

### `/refresh`

Behavior:

- accept refresh token
- hash token
- find active session
- reject revoked/expired session
- rotate refresh token
- issue new access token
- return new refresh token
- write `refresh_rotated` event

### `/logout`

Behavior:

- require refresh token or current session context
- revoke current session
- return success without leaking extra details
- write `logout` event

### `/sessions`

Behavior:

- authenticated user can view own active sessions
- useful later for account security UI

### `DELETE /sessions/:sessionId`

Behavior:

- authenticated user can revoke own listed session

---

## 6.2 Middleware update

Refactor [auth.js](/Users/carloabella/Projects/getprio/dev/backend/src/middleware/auth.js):

- keep bearer-token support for now
- validate short-lived access token
- include `session_id` in token payload
- load user as before
- optionally expose session id on `req.auth`

Suggested token claims:

```txt
sub
session_id
roles
```

Do not put tenant membership arrays into the token.

---

## 7. Slice 5: Password Reset and Password Change

## 7.1 Add endpoints

Add:

- `POST /api/auth/password-reset/request`
- `POST /api/auth/password-reset/confirm`

And review [accountRoutes.js](/Users/carloabella/Projects/getprio/dev/backend/src/routes/accountRoutes.js) for:

- `POST /api/account/password`

If password change already exists there, align it with the new service instead of duplicating logic.

### Reset request behavior

- accept email
- return generic success response
- create reset token if account exists
- send email through existing notification/email infrastructure
- log security event

### Reset confirm behavior

- validate token
- hash new password
- update user password
- set `last_password_changed_at`
- revoke all active sessions
- invalidate reset tokens
- log security event

---

## 8. Slice 6: RBAC Permission Map

## 8.1 Add permission module

Create:

- `backend/src/services/permissions.js`

Responsibilities:

- define permission names
- map platform role and tenant role to effective permissions
- expose guard helpers

Suggested API:

```txt
getGlobalPermissions(user)
getTenantPermissions(user, tenantId)
userHasPermission(user, permission, context?)
assertPermission(user, permission, context?)
```

### Initial permission families

Use the PRD list directly:

- `account.read_self`
- `account.update_self`
- `account.change_password`
- `queue.join`
- `queue.read_own_ticket`
- `queue.cancel_own_ticket`
- `tenant.queue.read`
- `tenant.queue.operate`
- `tenant.settings.manage`
- `tenant.staff.manage`
- `tenant.billing.read`
- `platform.settings.manage`
- `platform.users.read`

Keep first implementation small and expand as routes are migrated.

---

## 8.2 Refactor route guards

Apply first to:

- [platformRoutes.js](/Users/carloabella/Projects/getprio/dev/backend/src/routes/platformRoutes.js)
- [vendorRoutes.js](/Users/carloabella/Projects/getprio/dev/backend/src/routes/vendorRoutes.js)
- [accountRoutes.js](/Users/carloabella/Projects/getprio/dev/backend/src/routes/accountRoutes.js)

Do not attempt to replace every helper in one pass. Start with:

- platform admin only routes
- tenant manager routes
- tenant owner-only routes

Then migrate route-local role checks gradually.

---

## 9. Slice 7: Frontend Auth Lifecycle

## 9.1 Frontend files likely impacted

- `frontend/src/context/AuthContext.tsx`
- `frontend/src/context/AuthContext.types.ts`
- `frontend/src/api/client.ts`
- route guard logic in frontend pages/app shell

### Required frontend changes

- store access token + refresh token in current compatibility phase
- detect expired access token
- call `/api/auth/refresh`
- retry failed request once on auth expiry where appropriate
- handle locked account and forced logout states

### UI states required

- session expired
- unauthorized
- access denied
- password reset request
- password reset confirmation

Do not move to cookie transport in this slice.

---

## 10. Slice 8: Cookie Transport and CSRF

This is intentionally deferred.

### Backend work

- issue access and refresh tokens in `HttpOnly` cookies
- add CSRF token issuance and validation
- update CORS and credential handling where needed

### Frontend work

- stop relying on JS-held tokens
- send credentialed fetch requests
- attach anti-CSRF token for state-changing requests

### Rule

Do not partially migrate to cookies without CSRF protection in the same slice.

---

## 11. Testing Checklist

Add targeted tests as each slice lands.

### Backend integration tests

- customer registration success/conflict
- vendor registration success/conflict
- login success
- invalid login
- lockout after repeated failures
- refresh success
- refresh replay failure after rotation
- logout revokes session
- `/me` with valid access token
- platform route forbidden to non-platform users
- tenant manager route forbidden to insufficient role
- password reset request generic response
- password reset confirm success

### Service-level tests

- session expiry policy by role
- lockout evaluation logic
- refresh token rotation logic
- permission map behavior

---

## 12. Concrete File Plan

### New migrations

- `database/migrations/20260605_add_auth_session_security_tables.sql`

### Existing SQL/bootstrap updates

- [init.sql](/Users/carloabella/Projects/getprio/dev/database/init.sql)

### New repositories

- `backend/src/repositories/authSessions.js`
- `backend/src/repositories/authLoginAttempts.js`
- `backend/src/repositories/authSecurityEvents.js`
- `backend/src/repositories/passwordResetTokens.js`

### New services

- `backend/src/services/authService.js`
- `backend/src/services/sessionService.js`
- `backend/src/services/securityEventService.js`
- `backend/src/services/passwordResetService.js`
- `backend/src/services/permissions.js`

### Existing backend files to refactor

- [authRoutes.js](/Users/carloabella/Projects/getprio/dev/backend/src/routes/authRoutes.js)
- [auth.js](/Users/carloabella/Projects/getprio/dev/backend/src/middleware/auth.js)
- [users.js](/Users/carloabella/Projects/getprio/dev/backend/src/repositories/users.js)
- [env.ts](/Users/carloabella/Projects/getprio/dev/backend/src/config/env.ts)
- [accountRoutes.js](/Users/carloabella/Projects/getprio/dev/backend/src/routes/accountRoutes.js)
- [platformRoutes.js](/Users/carloabella/Projects/getprio/dev/backend/src/routes/platformRoutes.js)
- [vendorRoutes.js](/Users/carloabella/Projects/getprio/dev/backend/src/routes/vendorRoutes.js)

### Existing frontend files likely to refactor

- `frontend/src/context/AuthContext.tsx`
- `frontend/src/context/AuthContext.types.ts`
- `frontend/src/api/client.ts`
- relevant route guards in `frontend/src/App.tsx` and page entry points

---

## 13. Recommended First Milestone

First milestone should include only:

1. schema migration
2. session repositories/services
3. login issuing access + refresh tokens
4. refresh endpoint
5. logout endpoint
6. basic auth event logging

Do not include in milestone one:

- password reset
- frontend cookie migration
- CSRF
- MFA
- full permission-map refactor

That keeps the first milestone large but still controlled.

---

## 14. Definition of “Ready to Implement”

This auth/session plan is ready to implement when:

- migration naming is accepted
- milestone one scope is accepted
- we proceed slice by slice instead of attempting full PRD completion in one branch

Current recommendation:

```txt
Start with Slice 1 + Slice 2 + Slice 4 core pieces
```

That means:

```txt
schema
tracked sessions
refresh
logout
short-lived access token
```

before touching password reset and full RBAC refactor.
