# GetPrio

GetPrio is a multi-tenant queue platform for vendors that want QR-based ticketing, remote queue joins, live queue monitoring, and booking/queue notifications through email, in-app alerts, and planned browser Web Push.

## Project layout

- `frontend/`: React + Vite client application.
- `platform-dashboard/`: separate React + Vite platform operations dashboard.
- `backend/`: Express API backed by PostgreSQL.
- `database/init.sql`: database bootstrap schema for Dockerized PostgreSQL.
- `scripts/db-apply.sh`: repo-supported SQL bootstrap and migration runner.
- `scripts/db-verify-schema.sh`: deploy-time schema sanity check for critical tables/columns.
- `.env`: shared environment variables for local and Docker-based runs.
- `docker-compose.yml`: local stack orchestration for the frontend, backend, and database.

## Core platform features

- Tenant-aware vendor onboarding and dashboard controls.
- Customer registration and authenticated queue joins.
- Public queue monitoring over Server-Sent Events.
- Daily per-tenant ticket numbering with atomic Postgres counters.
- Email notification hooks, live in-app operational alerts, and planned browser Web Push support with console fallbacks for local development.

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

Local smoke tests use the default customer/vendor account below when `SMOKE_EMAIL`
and `SMOKE_PASSWORD` are not provided:

```env
SMOKE_EMAIL=carlo.abella+store4@gmail.com
SMOKE_PASSWORD=asdfasdf
```

The smoke harness uses that account for customer, booking, and vendor checks.

Email delivery uses Resend in the current MVP setup:

```env
RESEND_API_KEY=
RESEND_FROM_EMAIL=
RESEND_FROM_NAME=GetPrio
RESEND_API_URL=https://api.resend.com/emails
```

`RESEND_FROM_EMAIL` must use a verified Resend domain or sender.

OAuth login is supported for Google and Facebook when provider credentials are present:

```env
OAUTH_CALLBACK_PATH=/oauth/callback
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=
```

The backend exposes these redirect URIs:

- `https://<your-server>/api/auth/oauth/google/callback`
- `https://<your-server>/api/auth/oauth/facebook/callback`

Set the provider console redirect URI to the backend callback above, then point `APP_BASE_URL`
and `SERVER_URL` at the frontend and API origins that will be used in production. The OAuth
callback returns to the app at `APP_BASE_URL + OAUTH_CALLBACK_PATH`.

Current OAuth behavior:

- `GET /api/auth/oauth/providers` returns which providers are enabled by env vars.
- `GET /api/auth/oauth/:provider/start` starts the authorization redirect.
- `ALL /api/auth/oauth/:provider/callback` completes sign-in and redirects to the app callback.
- OAuth-created users are assigned a username if they do not already have one.

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
B2_BUCKET_PAYMENT_PROOF=
B2_KEY_ID=
B2_APPLICATION_KEY=
B2_PUBLIC_BASE_URL=
```

The B2 bucket must allow browser `PUT` requests from the frontend origin and public `GET` reads
for uploaded board assets.

Manual booking payment proof uploads use `B2_BUCKET_PAYMENT_PROOF`. Keep that bucket private;
the backend issues short-lived signed upload/view URLs from authenticated booking endpoints.

Browser Web Push delivery uses VAPID keys. Generate a local key pair with:

```bash
npm exec web-push -- generate-vapid-keys
```

Then set:

```env
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:admin@example.com
```

The frontend must run on `localhost` or `https://` for service worker registration and Push API
subscription. The implementation checklist remains in `docs/plan/web-push-notifications-execution-checklist.md`.

To roll back Web Push sends without disabling in-app alerts or email fallback, remove or blank the
VAPID environment variables and redeploy the backend. The push service treats missing VAPID keys as
a no-op, while SSE/in-app dashboard alerts and email notifications continue through their existing
paths.

## Docker Compose

1. Confirm the values in the root `.env` file.
2. Start the full stack with `docker compose up --build`.
3. Open the frontend at the URL configured by `APP_BASE_URL`.

## Database updates

The safe repo-supported path is:

```bash
export DATABASE_URL=postgresql://...
npm run db:status
npm run db:migrate
npm run db:verify
```

Use `npm run db:bootstrap` only for a brand new or disposable database. It runs `database/init.sql`, which drops existing tables, and then applies all migrations.

For existing databases, do not run `database/init.sql` by hand. Use `npm run db:migrate` so upgrades stay additive and repeatable.

`npm run db:status` is the deploy gate. It reports whether the database is clean, pending migrations exist, or a previously applied migration is missing from the repo.

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
- Before restarting a deployed service, run `npm run db:status`, `npm run db:migrate`, and `npm run db:verify` in that order.
