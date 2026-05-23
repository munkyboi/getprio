# GetPrio DigitalOcean Deployment Guide

This guide targets a low-budget DigitalOcean Droplet where the frontend, platform dashboard, Express API, and PostgreSQL all run on one VPS.

## Recommended Shape

- `app.yourdomain.com` serves `frontend/dist`
- `platform.yourdomain.com` serves `platform-dashboard/dist`
- `api.yourdomain.com` proxies to the backend on `127.0.0.1:5000`
- PostgreSQL runs locally on the Droplet
- PM2 keeps the backend process alive
- Nginx serves static assets and handles TLS

For a tiny MVP, start with a 1 GB Droplet and add swap. If the app feels tight, move to 2 GB.

## 1. Create the Droplet

1. Create an Ubuntu LTS Droplet.
2. Pick the closest region to your users, such as Singapore if available.
3. Use SSH keys instead of password login.
4. Point DNS A records to the Droplet IP:
   - `app.yourdomain.com`
   - `platform.yourdomain.com`
   - `api.yourdomain.com`

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

Load the schema:

```bash
psql "postgresql://getprio:CHANGE_THIS_PASSWORD@localhost:5432/getprio" -f database/init.sql
```

For an existing database, apply files in `database/migrations/` in filename order.

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

SERVER_URL=https://api.yourdomain.com
CLIENT_URL=https://app.yourdomain.com
APP_BASE_URL=https://app.yourdomain.com
PLATFORM_DASHBOARD_URL=https://platform.yourdomain.com
VITE_API_URL=https://api.yourdomain.com/api

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
B2_KEY_ID=
B2_APPLICATION_KEY=
B2_PUBLIC_BASE_URL=
```

Generate a strong JWT secret:

```bash
openssl rand -base64 48
```

## 6. Build the Frontends

```bash
cd /var/www/getprio
npm --workspace frontend run build
npm --workspace platform-dashboard run build
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
  server_name app.yourdomain.com;

  root /var/www/getprio/frontend/dist;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }
}

server {
  listen 80;
  server_name platform.yourdomain.com;

  root /var/www/getprio/platform-dashboard/dist;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }
}

server {
  listen 80;
  server_name api.yourdomain.com;

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
certbot --nginx -d app.yourdomain.com -d platform.yourdomain.com -d api.yourdomain.com
```

## 10. Payment Webhook URLs

Set PayMongo webhooks to:

```text
https://api.yourdomain.com/api/billing/webhooks/paymongo
```

## 11. Deploy Updates

```bash
cd /var/www/getprio
git pull
npm install
npm --workspace frontend run build
npm --workspace platform-dashboard run build
pm2 restart getprio-api
```

If migrations were added:

```bash
psql "$DATABASE_URL" -f database/migrations/MIGRATION_FILE.sql
```

## 12. Useful Checks

```bash
curl https://api.yourdomain.com/api/health
pm2 status
pm2 logs getprio-api
systemctl status nginx
df -h
free -m
```

