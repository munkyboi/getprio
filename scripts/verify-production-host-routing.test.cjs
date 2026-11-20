const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "getprio-nginx-routing-"));
const site = path.join(root, "getprio");
const developer = path.join(root, "developer");
fs.writeFileSync(site, `server_name getprio.online; root /var/www/getprio/frontend/dist;\nserver_name app.getprio.online; root /var/www/getprio/frontend/dist-customer;\nserver_name vendor.getprio.online; root /var/www/getprio/frontend/dist-vendor;\nserver_name platform.getprio.online; root /var/www/getprio/platform-dashboard/dist;\nserver_name api.getprio.online sandbox-api.getprio.online; proxy_pass http://127.0.0.1:5000; proxy_set_header X-GetPrio-Ingress-Host $host;\n`);
fs.writeFileSync(developer, "server_name developers.getprio.online; root /var/www/getprio/developer-portal/dist;\n");
const script = path.resolve(__dirname, "verify-production-host-routing.sh");
const env = { ...process.env, NGINX_SITE_FILE: site, NGINX_DEVELOPER_SITE_FILE: developer, NGINX_APP_ROOT: "/var/www/getprio" };
execFileSync(script, { env, stdio: "pipe" });

const customRoot = path.join(root, "custom-root");
fs.writeFileSync(site, fs.readFileSync(site, "utf8").replaceAll("/var/www/getprio", customRoot));
fs.writeFileSync(developer, fs.readFileSync(developer, "utf8").replaceAll("/var/www/getprio", customRoot));
execFileSync(script, { env: { ...env, NGINX_APP_ROOT: customRoot }, stdio: "pipe" });

fs.writeFileSync(developer, "server_name developers.getprio.online; root /var/www/getprio/developer-portal/dist;\n");
fs.writeFileSync(site, fs.readFileSync(site, "utf8").replace("sandbox-api.getprio.online", "sandbox-api.example.invalid"));
assert.throws(() => execFileSync(script, { env, stdio: "pipe" }));
console.log("production host routing validation passed");
