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

PAYMONGO_SECRET_KEY=
PAYMONGO_API_URL=https://api.paymongo.com/v1
PAYMONGO_WEBHOOK_SECRET=
PAYMONGO_PAYMENT_METHOD_TYPES=card

B2_S3_ENDPOINT=
B2_REGION=us-east-005
B2_BUCKET_PUBLIC_BOARD=
B2_BUCKET_PAYMENT_PROOF=
B2_KEY_ID=
B2_APPLICATION_KEY=
B2_PUBLIC_BASE_URL=
```

Generate a strong JWT secret:

```bash
openssl rand -base64 48
```

Notes:

- `VITE_API_URL` should include `/api`.
- `SERVER_URL` should not include `/api`.
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
