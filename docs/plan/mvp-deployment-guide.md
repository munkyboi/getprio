# GetPrio MVP Deployment Guide

This guide describes a practical way to deploy the current GetPrio codebase as an MVP without overbuilding the production setup.

The repository currently contains:

- `frontend/` for the customer-facing app
- `platform-dashboard/` for platform admin operations
- `backend/` for the Express API
- `docker-compose.yml` for local orchestration
- `docs/digitalocean-deployment.md` for a single-VPS deployment pattern

Use this guide as the main launch checklist when moving from local development to a live MVP.

Current MVP scope now includes the booking and payment proof flow that has already been implemented locally:

- customer booking creation and booking history
- vendor booking management
- manual QR booking payment with private payment proof upload
- vendor payment-proof review and verification
- pending booking expiration after 15 minutes unless payment evidence is submitted
- live booking status refresh on the customer booking detail page
- vendor dashboard booking pagination and live refresh gating

## 1. Define the MVP Scope

Before deploying, freeze the first release scope. For this repo, a realistic MVP is:

- Public vendor discovery and vendor profile pages
- Customer registration and login
- Booking flow and booking history
- Vendor dashboard for operational management
- Platform dashboard for admin oversight
- Email/SMS notifications where configured
- File uploads for board assets, payment QR images, or private payment proofs where applicable

Leave out or defer anything that does not support the first launch:

- Advanced analytics
- Full monetization automation
- Automated payment settlement or gateway checkout
- Multi-region infrastructure
- Native mobile apps
- Broad third-party OAuth unless already wired and tested

## 2. Choose the Hosting Model

For this project, the recommended MVP path is a single DigitalOcean VPS.

### Recommended: DigitalOcean single host

Best when you want the lowest-friction deployment that still matches the current repo shape.

- One DigitalOcean Droplet runs Nginx, the frontend build, the platform dashboard build, and the backend process
- PostgreSQL runs either on the same Droplet for the smallest MVP or on a managed DigitalOcean PostgreSQL instance if you want safer backups and easier scaling
- TLS is terminated at Nginx on the Droplet
- External services stay split by responsibility:
  - Resend or SMTP for email
  - Twilio for SMS if SMS is enabled
  - Backblaze B2 for public board assets, location QR images, and private payment proofs
  - PayMongo only for the queue-payment and billing integrations that are already wired

This is the deployment shape the rest of this guide assumes.

### Alternative: Dockerized single host

Use this only if you specifically want production to stay close to `docker-compose.yml`.

- Run app containers on one Droplet
- Keep PostgreSQL persistent with a named volume or a separate managed instance
- Put Nginx in front of the containers

The Docker shape is valid, but the plain VPS path is simpler for the current MVP.

## 3. Prepare the Production Environment

Create a production host with:

- Ubuntu LTS
- SSH key access only
- Firewall enabled
- Backups enabled
- Enough memory for PostgreSQL plus two Vite builds and the backend

Recommended starting point:

- 1 GB RAM if the traffic is tiny and you add swap
- 2 GB RAM if you want more headroom

Install the basic runtime tools:

- `git`
- `curl`
- `nginx` if you terminate traffic on the host
- `postgresql` only if you are not using a managed DigitalOcean database
- Node.js 20
- `pm2` or your preferred process manager

## 4. Set Up the Database

The backend expects PostgreSQL. For a new deployment:

1. Create a production database and user.
2. Set `DATABASE_URL` in the shell or deployment environment.
3. For a brand new database, run `npm run db:bootstrap`.
4. For an existing database, run `npm run db:migrate`.
5. Run `npm run db:verify`.
6. Verify the backend can connect using `DATABASE_URL`.

Minimum database checklist:

- Database user has only the permissions it needs
- Password is strong and unique
- Backups are enabled before launch
- You can restore a dump into a staging copy
- The repo migration and verification scripts succeed before restart

## 5. Configure Environment Variables

The repo already has `.env.example` files. Production should use a real secret-managed `.env` or host-level secret injection.

Core variables to set:

- `NODE_ENV=production`
- `BACKEND_PORT=5000`
- `PORT=5000`
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `DATABASE_URL`
- `DATABASE_SSL`
- `JWT_SECRET`
- `SERVER_URL`
- `CLIENT_URL`
- `APP_BASE_URL`
- `PLATFORM_DASHBOARD_URL`
- `VITE_API_URL`

If you use booking, payment, upload, or notification features, also configure:

- `VITE_TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRET_KEY`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `RESEND_FROM_NAME`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` if you use SMTP instead of Resend
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`
- `PAYMONGO_SECRET_KEY`
- `PAYMONGO_WEBHOOK_SECRET`
- `B2_*` upload settings for Backblaze storage
- `B2_BUCKET_PUBLIC_BOARD`
- `B2_BUCKET_PAYMENT_PROOF`

Current MVP provider map:

- Email delivery: Resend or SMTP
- SMS delivery: Twilio
- File uploads and object storage: Backblaze B2
- Compute, VPS networking, and optionally database: DigitalOcean

Operational note:

- Payment proof uploads should use the backend direct-upload route, not a browser-to-B2 upload path.
- Location payment QR images are customer-visible only inside booking/payment flows and should not be exposed in public vendor discovery payloads.
- Pending bookings now expire after 15 minutes by default, but payment evidence stops that expiration from firing.

Production rules:

- Do not store secrets in the client bundles
- Do not use localStorage for auth tokens
- Keep cookies `HttpOnly`, `Secure`, and `SameSite`
- Use a unique JWT secret per environment

## 6. Build and Deploy the App

The root `package.json` shows the current workspace scripts:

- `npm run build` builds the frontend and platform dashboard
- `npm run build:backend` runs the backend TypeScript build
- `npm run start` starts the backend workspace

Typical release flow:

1. Pull the tagged release or deployment branch.
2. Install dependencies.
3. Run type checks and tests.
4. Build the frontends.
5. Build or restart the backend.
6. Reload Nginx if configuration changed.

Suggested pre-deploy checks:

```bash
npm run typecheck
npm run test:backend
npm run build
npm run build:backend
```

The backend currently starts with `tsx src/server.ts`, so a compiled backend build is not required for the MVP runtime. `npm run build:backend` is still useful as a compile check before release.

## 7. Serve the Frontends

The companion guide in `docs/digitalocean-deployment.md` contains the concrete single-host DigitalOcean steps that match this plan.

Recommended routing:

- `app.getprio.online` -> `frontend/dist`
- `platform.getprio.online` -> `platform-dashboard/dist`
- `api.getprio.online` -> backend reverse proxy

Keep the API on a separate subdomain. That makes auth, CORS, and future scaling cleaner.

For the API reverse proxy:

- Forward `Host`
- Forward `X-Real-IP`
- Forward `X-Forwarded-For`
- Forward `X-Forwarded-Proto`
- Disable buffering for SSE endpoints

## 8. Start the Backend

The backend uses `tsx` for both development and the current MVP start path.

Current backend scripts:

- `npm --workspace backend run dev`
- `npm --workspace backend run start`
- `npm --workspace backend run build`

Use a process manager:

- PM2 for a single VPS
- systemd if you want lower tooling overhead

Minimum runtime expectations:

- Backend restarts automatically after crashes
- Logs are retained and reviewable
- Health checks are available
- Nginx forwards SSE requests without buffering

## 9. Validate Security Before Launch

Because this project is also a security capstone, the MVP should not go live without a short security pass.

Check these items:

- Login and registration return generic errors
- Lockout behavior works after repeated failed attempts
- Privileged roles require the correct authorization
- Platform admin screens are not reachable by normal users
- Customer data is not leaked across tenants or users
- File uploads are restricted and stored safely
- Manual QR payment proof uploads stay private and are only readable by the booking owner, authorized vendor staff/admins, and platform admins
- Session cookies are secure in production
- CSRF protection is in place for state-changing requests

If you have time for only one round of testing, prioritize:

- Authentication
- Role-based access control
- Booking ownership
- Vendor/admin scope boundaries
- Upload/download access

## 10. Production Verification Checklist

After deployment, verify these paths manually:

- Landing page loads
- Login works
- Customer registration works
- Public vendor discovery works
- Booking creation works
- Customer booking detail shows the vendor payment QR and proof upload flow when the service requires manual payment
- Pending bookings expire after the configured timeout when no proof was submitted
- Vendor payment-proof review and verification works
- Booking history loads only the current user’s records
- Vendor dashboard loads for vendor roles
- Vendor dashboard booking pagination works and only refreshes bookings while the bookings section is active
- Platform dashboard loads only for `platform_admin`
- SSE/public live queue updates work if enabled
- Uploads work if configured
- PayMongo webhook endpoints respond if queue-payment flows are enabled

If any of those fail, do not announce launch yet.

## 11. Backup and Recovery Plan

An MVP needs a minimal recovery plan from day one.

Keep:

- Daily PostgreSQL backups
- A copy of the `.env` values in a secret manager or secure vault
- Release tags or deployment snapshots
- A record of the manual QR payment proof and private upload flow so future deploys can verify it after migrations
- An emergency rollback path to the previous build

At minimum, be able to restore:

- Database
- Uploaded assets
- Build artifacts if needed

## 12. Rollback Plan

Have a rollback plan before the first public deployment.

Recommended rollback steps:

1. Keep the previous release tag or container image available.
2. Repoint Nginx or the process manager to the last known good version.
3. Restore the database only if the new release made incompatible schema changes.
4. Recheck login, booking, and dashboard access.

## 13. Suggested Launch Order

If you want the least risky rollout, launch in this order:

1. Internal staging or private test deployment
2. Limited demo accounts for grading and review
3. Small pilot with one or two vendors
4. Public MVP launch

That sequence lets you catch auth, booking, and role bugs before broad use.

## 14. Recommended First Week After Launch

During the first week, watch for:

- Failed logins
- Booking failures
- Permission issues
- Upload errors
- Email/SMS delivery failures
- Database slowdowns
- Unexpected 500 responses

If the traffic is light, daily log checks are enough. If not, add alerting for:

- API uptime
- Database health
- Error rate spikes
- Queue or booking failure spikes

## 15. Practical MVP Decision

For this codebase, the simplest production path is:

- Single DigitalOcean VPS
- PostgreSQL on the same host for the smallest launch, or managed DigitalOcean Postgres if you want safer recovery
- Nginx for TLS and static hosting
- PM2 for backend uptime
- External email, SMS, payment, and upload providers only if configured and tested

That gives you a deployment path that is cheap, understandable, and easy to demo for a capstone.
