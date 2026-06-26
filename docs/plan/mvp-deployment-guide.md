# GetPrio MVP Deployment Guide

This guide describes a practical way to deploy the current GetPrio codebase as an MVP without overbuilding the production setup.

The repository currently contains:

- `frontend/` for the customer-facing app
- `platform-dashboard/` for platform admin operations
- `backend/` for the Express API
- `docker-compose.yml` for local orchestration
- `docs/digitalocean-deployment.md` for a single-VPS deployment pattern

Use this guide as the main launch checklist when moving from local development to a live MVP.

## 1. Define the MVP Scope

Before deploying, freeze the first release scope. For this repo, a realistic MVP is:

- Public vendor discovery and vendor profile pages
- Customer registration and login
- Booking flow and booking history
- Vendor dashboard for operational management
- Platform dashboard for admin oversight
- Email/SMS notifications where configured
- File uploads for board assets or payment proofs where applicable

Leave out or defer anything that does not support the first launch:

- Advanced analytics
- Full monetization automation
- Multi-region infrastructure
- Native mobile apps
- Broad third-party OAuth unless already wired and tested

## 2. Choose the Hosting Model

For the MVP, use one of these two deployment shapes:

### Option A: Single VPS

Best when you want the lowest operational cost and fastest path to launch.

- Nginx serves the built frontend and dashboard bundles
- The backend runs as a process manager service
- PostgreSQL runs on the same server
- TLS is terminated at Nginx

This is the approach described in `docs/digitalocean-deployment.md`.

### Option B: Dockerized Single Host

Best if you want the local compose model to stay close to production.

- Use Docker Compose for app containers
- Keep PostgreSQL persistent with a named volume
- Put Nginx or a cloud load balancer in front of the app

For a small MVP, Option A is usually easier to maintain after launch.

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
- `nginx`
- `postgresql`
- Node.js 20
- `pm2`

## 4. Set Up the Database

The backend expects PostgreSQL. For a new deployment:

1. Create a production database and user.
2. Load `database/init.sql`.
3. Apply any files under `database/migrations/` in filename order.
4. Verify the backend can connect using `DATABASE_URL`.

Minimum database checklist:

- Database user has only the permissions it needs
- Password is strong and unique
- Backups are enabled before launch
- You can restore a dump into a staging copy

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
- `JWT_SECRET`
- `SERVER_URL`
- `CLIENT_URL`
- `APP_BASE_URL`
- `PLATFORM_DASHBOARD_URL`
- `VITE_API_URL`

If you use booking, payment, upload, or notification features, also configure:

- `TURNSTILE_SECRET_KEY`
- `RESEND_API_KEY` or `SENDGRID_API_KEY`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`
- `PAYMONGO_SECRET_KEY`
- `PAYMONGO_WEBHOOK_SECRET`
- `B2_*` upload settings

Production rules:

- Do not store secrets in the client bundles
- Do not use localStorage for auth tokens
- Keep cookies `HttpOnly`, `Secure`, and `SameSite`
- Use a unique JWT secret per environment

## 6. Build and Deploy the App

The root `package.json` shows the current workspace scripts:

- `npm run build` builds the frontend and platform dashboard
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
```

If the backend has a production build step in your workflow, run it before starting the process manager.

## 7. Serve the Frontends

The deployment guide in `docs/digitalocean-deployment.md` uses Nginx to serve static bundles.

Recommended routing:

- `app.yourdomain.com` -> `frontend/dist`
- `platform.yourdomain.com` -> `platform-dashboard/dist`
- `api.yourdomain.com` -> backend reverse proxy

Keep the API on a separate subdomain. That makes auth, CORS, and future scaling cleaner.

For the API reverse proxy:

- Forward `Host`
- Forward `X-Real-IP`
- Forward `X-Forwarded-For`
- Forward `X-Forwarded-Proto`
- Disable buffering for SSE endpoints

## 8. Start the Backend

The backend uses `tsx` in development and can be started the same way in production for an MVP, although a compiled Node build is preferable later.

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

## 9. Validate Security Before Launch

Because this project is also a security capstone, the MVP should not go live without a short security pass.

Check these items:

- Login and registration return generic errors
- Lockout behavior works after repeated failed attempts
- Privileged roles require the correct authorization
- Platform admin screens are not reachable by normal users
- Customer data is not leaked across tenants or users
- File uploads are restricted and stored safely
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
- Booking history loads only the current user’s records
- Vendor dashboard loads for vendor roles
- Platform dashboard loads only for `platform_admin`
- SSE/public live queue updates work if enabled
- Uploads work if configured

If any of those fail, do not announce launch yet.

## 11. Backup and Recovery Plan

An MVP needs a minimal recovery plan from day one.

Keep:

- Daily PostgreSQL backups
- A copy of the `.env` values in a secret manager or secure vault
- Release tags or deployment snapshots
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

- Single VPS
- PostgreSQL on the same host
- Nginx for TLS and static hosting
- PM2 for backend uptime
- External email/SMS/upload providers only if configured and tested

That gives you a deployment path that is cheap, understandable, and easy to demo for a capstone.
