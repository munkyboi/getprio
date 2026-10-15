/* global process, console */
// Run with tsx. This launcher accepts only a private artifact for the disposable
// fixture and binds the real application to loopback; it starts no provider jobs.
import fs from 'node:fs';
import { assertLocalDemoProvidersEmpty } from './helpers/localDemoProviderConfiguration.mjs';
import { createRequire } from 'node:module';
import { installLocalDemoNetworkGuard } from './helpers/localDemoNetworkGuard.mjs';
const require = createRequire(import.meta.url);
const artifactPath = process.argv[2];
if (!artifactPath || (fs.statSync(artifactPath).mode & 0o077) !== 0) {
  throw new Error('A private mode-0600 local fixture artifact is required.');
}
const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
Object.assign(process.env, artifact.env);
const { localPoolDemoConfiguration, readLocalPoolDemoScope } = require('../backend/src/services/localPoolDemoScope.js');
if (!localPoolDemoConfiguration()) throw new Error('Disposable local configuration required.');
installLocalDemoNetworkGuard();
const application = await import('../backend/src/app.ts');
const app = application.default?.default || application.default;
const env = require('../backend/src/config/env.js');
if (env.databaseUrl !== artifact.env.DATABASE_URL || !localPoolDemoConfiguration()
  || env.port !== 5007 || env.clientUrl !== 'http://127.0.0.1:5187') {
  throw new Error('Effective configuration does not match the isolated local demo.');
}
assertLocalDemoProvidersEmpty(env);
const { pool } = require('../backend/src/config/db.js');
const client = await pool.connect();
try {
  if (!await readLocalPoolDemoScope(client, artifact.fixture)) throw new Error('Fixture scope verification failed.');
} finally { client.release(); }
const server = app.listen(5007, '127.0.0.1', () => console.log('Local pooled queue API listening at http://127.0.0.1:5007 (external network disabled; provider credentials empty)'));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close(() => pool.end()));
