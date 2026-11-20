const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "getprio-nginx-configure-"));
const site = path.join(root, "getprio.conf");
fs.writeFileSync(site, `server {\n  server_name getprio.online;\n  root /old/frontend/dist;\n  location / { try_files $uri /index.html; }\n}\nserver {\n  server_name app.getprio.online;\n  root /old/frontend/dist;\n}\nserver {\n  server_name vendor.getprio.online;\n  root /old/frontend/dist;\n}\nserver {\n  server_name platform.getprio.online;\n  root /old/frontend/dist;\n}\nserver {\n  server_name api.getprio.online sandbox-api.getprio.online;\n  proxy_pass http://127.0.0.1:5000;\n}\n`);
const script = path.resolve(__dirname, "configure-production-host-routing.sh");
execFileSync(script, { env: { ...process.env, NGINX_SITE_FILE: site, NGINX_APP_ROOT: "/srv/getprio///", NGINX_SKIP_RELOAD: "1" }, stdio: "pipe" });
const output = fs.readFileSync(site, "utf8");
assert.match(output, /server_name app\.getprio\.online;\s+root \/srv\/getprio\/frontend\/dist-customer;/u);
assert.match(output, /server_name vendor\.getprio\.online;\s+root \/srv\/getprio\/frontend\/dist-vendor;/u);
assert.match(output, /server_name platform\.getprio\.online;\s+root \/srv\/getprio\/platform-dashboard\/dist;/u);
assert.match(output, /proxy_pass http:\/\/127\.0\.0\.1:5000;/u);

fs.writeFileSync(site, `server {\n  listen 443 ssl;\n  server_name getprio.online app.getprio.online vendor.getprio.online;\n  root /old/frontend/dist;\n}\n`);
execFileSync(script, { env: { ...process.env, NGINX_SITE_FILE: site, NGINX_APP_ROOT: "/srv/getprio", NGINX_SKIP_RELOAD: "1", NGINX_REQUIRE_ALL: "0" }, stdio: "pipe" });
const splitOutput = fs.readFileSync(site, "utf8");
assert.match(splitOutput, /server_name getprio\.online;\s+root \/srv\/getprio\/frontend\/dist;/u);
assert.match(splitOutput, /server_name app\.getprio\.online;\s+root \/srv\/getprio\/frontend\/dist-customer;/u);
assert.match(splitOutput, /server_name vendor\.getprio\.online;\s+root \/srv\/getprio\/frontend\/dist-vendor;/u);
console.log("production host root configuration passed");
