# GetPrio

GetPrio is a multi-tenant queue platform for vendors that want QR-based ticketing, remote queue joins, live queue monitoring, and near-turn notifications by email or SMS.

## Project layout

- `frontend/`: React + Vite client application.
- `backend/`: Express API backed by PostgreSQL.
- `database/init.sql`: database bootstrap schema for Dockerized PostgreSQL.
- `.env`: shared environment variables for local and Docker-based runs.
- `docker-compose.yml`: local stack orchestration for the frontend, backend, and database.

## Core platform features

- Tenant-aware vendor onboarding and dashboard controls.
- Customer registration and authenticated queue joins.
- Public queue monitoring over Server-Sent Events.
- Daily per-tenant ticket numbering with atomic Postgres counters.
- Email and SMS notification hooks with console fallbacks for local development.

## Local development

1. Review the root `.env` file and adjust values as needed.
2. Install dependencies from the repo root with `npm install`.
3. Start the frontend and backend together with `npm run dev`.
4. Start PostgreSQL separately or use Docker Compose.

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
- `POST /api/public/tenant/:tenantSlug/tickets`
- `DELETE /api/public/tenant/:tenantSlug/tickets/:lookupCode`
- `GET /api/public/ticket/:lookupCode`

### Vendor queue controls

- `GET /api/vendor/tenant/:tenantSlug/dashboard`
- `POST /api/vendor/tenant/:tenantSlug/tickets`
- `POST /api/vendor/tenant/:tenantSlug/queue/call-next`
- `POST /api/vendor/tenant/:tenantSlug/queue/current/serve`
- `POST /api/vendor/tenant/:tenantSlug/queue/current/skip`
- `PATCH /api/vendor/tenant/:tenantSlug/settings`
- `GET /api/vendor/tenant/:tenantSlug/history`

## Notes

- Queue ordering remains first-in, first-out per tenant.
- Ticket numbers are generated per tenant per day from the tenant queue prefix plus an incrementing sequence.
- The public queue board still uses Server-Sent Events, so browsers do not need WebSockets.
