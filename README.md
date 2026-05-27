# GetPrio

GetPrio is a multi-tenant queue platform for vendors that want QR-based ticketing, remote queue joins, live queue monitoring, and near-turn notifications by email or SMS.

## Project layout

- `frontend/`: React + Vite client application.
- `platform-dashboard/`: separate React + Vite platform operations dashboard.
- `backend/`: Express API backed by PostgreSQL.
- `database/init.sql`: database bootstrap schema for Dockerized PostgreSQL.
- `.env`: shared environment variables for local and Docker-based runs.
- `docker-compose.yml`: local stack orchestration for the frontend, backend, and database.

## Core platform features

- Tenant-aware vendor onboarding and dashboard controls.
- Customer registration and authenticated queue joins.
- Public queue monitoring over Server-Sent Events.
- Daily per-tenant ticket numbering with atomic Postgres counters.
- JWT/session-based authentication with role-aware access control for customer, vendor, and platform workflows.
- Email and SMS notification hooks with console fallbacks for local development.

OAuth2 sign-in is planned after the MVP for vendor and platform administrator accounts. The MVP prioritizes password login, JWT/session handling, RBAC, OTP queue joins, and abuse protection.

## Local development

1. Review the root `.env` file and adjust values as needed.
2. Install dependencies from the repo root with `npm install`.
3. Start the frontend, platform dashboard, and backend together with `npm run dev`.
4. Start PostgreSQL separately or use Docker Compose.

For QR join spam protection, local development can use Cloudflare Turnstile test keys:

```env
VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
```

Replace those with real Turnstile keys outside local development.

Email delivery can use Resend before falling back to SendGrid, SMTP, or console logging:

```env
RESEND_API_KEY=
RESEND_FROM_EMAIL=
RESEND_FROM_NAME=GetPrio
RESEND_API_URL=https://api.resend.com/emails

SENDGRID_API_KEY=
SENDGRID_FROM_EMAIL=
SENDGRID_FROM_NAME=GetPrio
SENDGRID_API_URL=https://api.sendgrid.com/v3/mail/send
```

`RESEND_FROM_EMAIL` must use a verified Resend domain or sender. If Resend is not configured, SendGrid is used when configured.

Platform dashboard access uses the normal auth API, but the signed-in user must include the
`platform_admin` role. For local development, grant it manually in Postgres until a dedicated
admin-user management flow exists:

```sql
UPDATE users
SET roles = ARRAY(SELECT DISTINCT unnest(roles || ARRAY['platform_admin']::TEXT[]))
WHERE email = 'admin@example.com';
```

The platform dashboard runs at `http://localhost:7100` by default. If deployed elsewhere, set:

```env
PLATFORM_DASHBOARD_URL=
```

Public board theme image and logo uploads use Backblaze B2 S3-compatible signed upload URLs:

```env
B2_S3_ENDPOINT=
B2_REGION=us-east-005
B2_BUCKET_PUBLIC_BOARD=
B2_KEY_ID=
B2_APPLICATION_KEY=
B2_PUBLIC_BASE_URL=
```

The B2 bucket must allow browser `PUT` requests from the frontend origin and public `GET` reads
for uploaded board assets.

## Docker Compose

1. Confirm the values in the root `.env` file.
2. Start the full stack with `docker compose up --build`.
3. Open the frontend at the URL configured by `APP_BASE_URL`.

## Main API routes

### Auth

- `POST /api/auth/register/vendor`
- `POST /api/auth/register/vendor/complete`
- `POST /api/auth/register/customer`
- `POST /api/auth/login`
- `GET /api/auth/me`

### Public queue

- `GET /api/public/tenant/:tenantSlug/queue`
- `GET /api/public/tenant/:tenantSlug/stream`
- `POST /api/public/tenant/:tenantSlug/join-otp`
- `POST /api/public/tenant/:tenantSlug/join-otp/:otpId/resend`
- `POST /api/public/tenant/:tenantSlug/join-otp/verify`
- `POST /api/public/tenant/:tenantSlug/join-payments/:paymentId/sync`
- `POST /api/public/tenant/:tenantSlug/tickets`
- `DELETE /api/public/tenant/:tenantSlug/tickets/:lookupCode`
- `GET /api/public/ticket/:lookupCode`

### Vendor queue controls

- `GET /api/vendor/tenant/:tenantSlug/dashboard`
- `GET /api/vendor/tenant/:tenantSlug/locations`
- `GET /api/vendor/tenant/:tenantSlug/public-board-theme`
- `PATCH /api/vendor/tenant/:tenantSlug/public-board-theme`
- `POST /api/vendor/tenant/:tenantSlug/public-board-theme/uploads`
- `POST /api/vendor/tenant/:tenantSlug/tickets`
- `POST /api/vendor/tenant/:tenantSlug/queue/call-next`
- `POST /api/vendor/tenant/:tenantSlug/queue/current/serve`
- `POST /api/vendor/tenant/:tenantSlug/queue/current/skip`
- `PATCH /api/vendor/tenant/:tenantSlug/settings`
- `GET /api/vendor/tenant/:tenantSlug/history`

### Platform operations

- `GET /api/platform/overview`
- `GET /api/platform/queue-fees`
- `PATCH /api/platform/queue-fees`
- `GET /api/platform/queue-join-payments`
- `GET /api/platform/tenants`
- `GET /api/platform/subscriptions`
- `GET /api/platform/users`
- `GET /api/platform/billing-events`

## Notes

- Queue ordering remains first-in, first-out per tenant.
- Ticket numbers are generated per tenant per day from the tenant queue prefix plus an incrementing sequence.
- The public queue board still uses Server-Sent Events, so browsers do not need WebSockets.
- Existing databases need the SQL files in `database/migrations/` applied in filename order.
