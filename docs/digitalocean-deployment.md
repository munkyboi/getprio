# GetPrio DigitalOcean Deployment Guide

This guide targets the current MVP deployment path: a low-budget DigitalOcean Droplet where the frontend, platform dashboard, Express API, and optionally PostgreSQL all run on one VPS.

It matches the current codebase:

- `frontend/dist` served at `getprio.online`
- `platform-dashboard/dist` served at `platform.getprio.online`
- backend proxied at `api.getprio.online`
- Backblaze B2 used for public assets, location QR images, and private payment proofs
- Resend or SMTP used for email
- Twilio used for SMS if SMS is enabled
- PayMongo used only for the existing queue-payment and billing integrations

## Recommended Shape

- `getprio.online` serves `frontend/dist`
- `platform.getprio.online` serves `platform-dashboard/dist`
- `api.getprio.online` proxies to the backend on `127.0.0.1:5000`
- PostgreSQL runs locally on the Droplet, or on managed DigitalOcean Postgres if you prefer not to host the database on the app box
- PM2 keeps the backend process alive
- Nginx serves static assets and handles TLS

For a tiny MVP, start with a 1 GB Droplet and add swap. If the app feels tight, move to 2 GB.

## 1. Create the Droplet

1. Create an Ubuntu LTS Droplet.
2. Pick the closest region to your users, such as Singapore if available.
3. Use SSH keys instead of password login.
4. Point DNS A records to the Droplet IP:
   - `getprio.online`
   - `platform.getprio.online`
   - `api.getprio.online`

## 2. Initial Server Setup

SSH into the server:

```bash
ssh root@YOUR_DROPLET_IP
```

Update packages and install basics:

```bash
apt update && apt upgrade -y
apt install -y git curl nginx postgresql postgresql-contrib ufw
```

Add swap for a 1 GB Droplet:

```bash
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

Enable firewall:

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
```

Install Node.js 20 and PM2:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
npm install -g pm2
```

## 3. Upload the App

Clone your repository:

```bash
mkdir -p /var/www
cd /var/www
git clone YOUR_REPO_URL getprio
cd getprio
npm install
```

## 4. Configure PostgreSQL

Create the database and user:

```bash
sudo -u postgres psql
```

Inside `psql`:

```sql
CREATE USER getprio WITH PASSWORD 'CHANGE_THIS_PASSWORD';
CREATE DATABASE getprio OWNER getprio;
\q
```

For a brand new database, use the repo bootstrap script:

```bash
cd /var/www/getprio
export DATABASE_URL="postgresql://getprio:CHANGE_THIS_PASSWORD@localhost:5432/getprio"
npm run db:status
npm run db:bootstrap
```

For an existing database or a normal deploy update, use:

```bash
cd /var/www/getprio
export DATABASE_URL="postgresql://getprio:CHANGE_THIS_PASSWORD@localhost:5432/getprio"
npm run db:status
npm run db:migrate
npm run db:verify
```

If you use managed DigitalOcean Postgres instead of local Postgres:

- Set `DATABASE_URL` to the managed connection string
- Set `DATABASE_SSL=true`
- Skip installing local PostgreSQL packages and the local `psql` bootstrap above

## 5. Configure Environment

Create `/var/www/getprio/.env`:

```env
NODE_ENV=production
BACKEND_PORT=5000
PORT=5000

POSTGRES_DB=getprio
POSTGRES_USER=getprio
POSTGRES_PASSWORD=CHANGE_THIS_PASSWORD
DATABASE_URL=postgresql://getprio:CHANGE_THIS_PASSWORD@localhost:5432/getprio
DATABASE_SSL=false

JWT_SECRET=CHANGE_THIS_TO_A_LONG_RANDOM_SECRET

SERVER_URL=https://api.getprio.online
CLIENT_URL=https://getprio.online
APP_BASE_URL=https://getprio.online
MOBILE_QR_BASE_URL=https://getprio.online
PLATFORM_DASHBOARD_URL=https://platform.getprio.online
VITE_API_URL=https://api.getprio.online/api

OAUTH_CALLBACK_PATH=/oauth/callback
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=

VITE_TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=

RESEND_API_KEY=
RESEND_FROM_EMAIL=
RESEND_FROM_NAME=GetPrio
RESEND_API_URL=https://api.resend.com/emails

SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=

SENDGRID_API_KEY=
SENDGRID_FROM_EMAIL=
SENDGRID_FROM_NAME=GetPrio
SENDGRID_API_URL=https://api.sendgrid.com/v3/mail/send

TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=

PAYMONGO_MODE=live
PAYMONGO_SANDBOX_SECRET_KEY=sk_test_...
PAYMONGO_SANDBOX_WEBHOOK_SECRET=
PAYMONGO_LIVE_SECRET_KEY=sk_live_...
PAYMONGO_LIVE_WEBHOOK_SECRET=
PAYMONGO_API_URL=https://api.paymongo.com/v1
PAYMONGO_PAYMENT_METHOD_TYPES=card

# Native mobile push through Firebase Cloud Messaging
FCM_PROJECT_ID=getprio
FCM_CLIENT_EMAIL=
FCM_PRIVATE_KEY=

`PAYMONGO_MODE` must be `live` or `sandbox`. The app selects the matching secret key and webhook secret from the two credential sets, validates the key prefix (`sk_live_` or `sk_test_`), and rejects webhook payloads from the opposite environment. The API URL remains `https://api.paymongo.com/v1` for both modes. The old `PAYMONGO_SECRET_KEY` and `PAYMONGO_WEBHOOK_SECRET` variables remain supported as a compatibility fallback.

The production deployment workflow reads the five PayMongo values from the GitHub `production` Environment secrets and securely synchronizes them to this server `.env` over SSH. Configure `PAYMONGO_MODE`, `PAYMONGO_SANDBOX_SECRET_KEY`, `PAYMONGO_SANDBOX_WEBHOOK_SECRET`, `PAYMONGO_LIVE_SECRET_KEY`, and `PAYMONGO_LIVE_WEBHOOK_SECRET` as protected Environment secrets. The workflow does not print their values.

The production deployment workflow also requires `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, and `FCM_PRIVATE_KEY` in the GitHub `production` Environment. Create these from a Firebase service-account key: use the Firebase project ID, the service account's `client_email`, and its `private_key`. Keep the private key out of the repository. The workflow writes the key into the server `.env`, validates all three values, and refuses to restart the API when the configuration is missing or malformed. Store the private key as one value with its `\\n` line breaks preserved.

B2_S3_ENDPOINT=
B2_REGION=us-east-005
B2_BUCKET_PUBLIC_BOARD=
B2_BUCKET_PAYMENT_PROOF=
B2_KEY_ID=
B2_APPLICATION_KEY=
B2_PUBLIC_BASE_URL=
```

OAuth deployment checklist:

1. Create OAuth apps in Google and/or Facebook developer consoles.
2. Register the backend callback redirect URI exactly as:
   - `https://api.getprio.online/api/auth/oauth/google/callback`
   - `https://api.getprio.online/api/auth/oauth/facebook/callback`
3. Set `SERVER_URL` to the API origin and `APP_BASE_URL` to the frontend origin.
4. Populate `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `FACEBOOK_APP_ID`, and `FACEBOOK_APP_SECRET`.
5. Verify `GET /api/auth/oauth/providers` returns the providers you intend to expose.
6. Test `GET /api/auth/oauth/:provider/start` and the callback flow with a real provider account.

OAuth behavior in this repo:

- Provider availability is driven by the env vars above.
- The backend completes the provider exchange and issues the app session tokens.
- The frontend consumes the callback hash at `/oauth/callback`.

Generate a strong JWT secret:

```bash
openssl rand -base64 48
```

Notes:

- `VITE_API_URL` should include `/api`.
- `SERVER_URL` should not include `/api`.
- `MOBILE_QR_BASE_URL` must be an HTTPS origin whose hostname is included in the mobile app's approved-host configuration. It may differ from `APP_BASE_URL` for enterprise or physical-device testing.
- `MOBILE_PAYMENT_RETURN_URL` may override the paid mobile return origin; otherwise the backend uses HTTPS `APP_BASE_URL`, or HTTPS `MOBILE_QR_BASE_URL` for local device testing. The resulting `/payment/return` host must be included in the mobile app's approved-host configuration and verified-link setup.
- `B2_BUCKET_PUBLIC_BOARD` is reused for public board assets and location payment QR images.
- `B2_BUCKET_PAYMENT_PROOF` should stay private.
- Payment proof uploads now go through the backend direct-upload route, not direct browser-to-B2 upload.

## 6. Build the App

```bash
cd /var/www/getprio
npm run typecheck
npm run test:backend
npm run build
npm run build:backend
```

## 7. Start the Backend

For this repo, the backend start script uses `tsx`, so install dependencies normally and run:

```bash
cd /var/www/getprio
pm2 start "npm --workspace backend run start" --name getprio-api
pm2 save
pm2 startup
```

Check logs:

```bash
pm2 logs getprio-api
```

## 8. Configure Nginx

Create `/etc/nginx/sites-available/getprio`:

```nginx
server {
  listen 80;
  server_name getprio.online;

  root /var/www/getprio/frontend/dist;
  index index.html;

  location = /.well-known/apple-app-site-association {
    default_type application/json;
    try_files $uri =404;
  }

  location / {
    try_files $uri $uri/ /index.html;
  }
}

server {
  listen 80;
  server_name platform.getprio.online;

  root /var/www/getprio/platform-dashboard/dist;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }
}

server {
  listen 80;
  server_name api.getprio.online;

  location / {
    proxy_pass http://127.0.0.1:5000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # Helps Server-Sent Events stream smoothly.
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 1h;
  }
}
```

Enable it:

```bash
ln -s /etc/nginx/sites-available/getprio /etc/nginx/sites-enabled/getprio
nginx -t
systemctl reload nginx
```

## 9. Add HTTPS

Install Certbot:

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d getprio.online -d platform.getprio.online -d api.getprio.online
```

## 10. Payment Webhook URLs

Set PayMongo webhooks to:

```text
https://api.getprio.online/api/billing/webhooks/paymongo
```

If you are only launching the booking/manual-QR flow first, this webhook is not part of the critical path. Keep it configured only if the queue-payment or billing flows are active in your release.

## 11. Deploy Updates

```bash
cd /var/www/getprio
git pull
npm install
npm run build
npm run build:backend
pm2 restart getprio-api
```

If migrations were added:

```bash
npm run db:status
npm run db:migrate
npm run db:verify
```

If `db:status` reports pending migrations, apply them before restarting PM2. If it reports missing applied migrations, stop and restore the repo/database history mismatch first.

## 12. Useful Checks

```bash
curl https://api.getprio.online/api/health
pm2 status
pm2 logs getprio-api
systemctl status nginx
df -h
free -m
```

Recommended post-deploy smoke checks:

- landing page and platform dashboard load from the correct domains
- login works for customer and vendor/admin roles
- customer booking detail shows the manual QR and proof form when expected
- payment proof upload succeeds through the backend
- vendor payment review endpoints work
- pending bookings expire when no proof is submitted
- SSE-backed booking or queue refresh still works through Nginx
