import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import verifyPublic from '../frontend/tests/maintenance.browser.mjs';
import verifyAdmin from '../platform-dashboard-shadcn/tests/maintenance.browser.mjs';
import verifyOutage from '../platform-dashboard-shadcn/tests/maintenance-outage.browser.mjs';
const cwd = fileURLToPath(new URL('../output/playwright/', import.meta.url));
mkdirSync(cwd, { recursive: true });
const cli = process.env.PLAYWRIGHT_CLI || 'npx';
const prefix = process.env.PLAYWRIGHT_CLI ? [] : ['--yes', '--package', '@playwright/cli', 'playwright-cli'];
const run = (...args) => {
  const result = spawnSync(cli, [...prefix, process.argv.includes('--outage-only') ? '-s=maintenance-outage' : '-s=maintenance', ...args], { cwd, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Browser command failed: ${args[0]}`);
};
try {
  const adminOnly = process.argv.includes('--admin-only');
  const outageOnly = process.argv.includes('--outage-only');
  run('open', outageOnly ? 'http://127.0.0.1:5196/service-health' : adminOnly ? 'http://127.0.0.1:5194/tests/maintenance-harness.html' : 'http://127.0.0.1:5195/');
  run('snapshot');
  if (outageOnly) run('run-code', `(${verifyOutage.toString()})`);
  else {
    if (!adminOnly) run('run-code', `(${verifyPublic.toString()})`);
    run('run-code', `(${verifyAdmin.toString()})`);
  }
  console.log(outageOnly ? 'Maintenance partial-outage browser regressions passed.' : adminOnly ? 'Admin maintenance browser regressions passed.' : 'Public/customer and admin maintenance browser regressions passed.');
} finally { run('close'); }
