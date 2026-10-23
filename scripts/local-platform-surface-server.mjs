// App-only launcher: no schedulers, outbox workers, provider jobs or seed writes.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { readPrivateArtifact, validateLocalSurfaceArtifact, verifyLocalSurfaceSource, verifyLocalSurfaceDatabase } from './helpers/localPlatformSurfaceGuard.mjs';
import { installLocalDemoNetworkGuard } from './helpers/localDemoNetworkGuard.mjs';
import { assertLocalDemoProvidersEmpty } from './helpers/localDemoProviderConfiguration.mjs';
const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
if (!process.argv[2]) throw new Error('Private local surface artifact path required.');
const artifact = readPrivateArtifact(process.argv[2], sourceRoot);
const identity = validateLocalSurfaceArtifact(artifact);
const source = verifyLocalSurfaceSource(sourceRoot, artifact.sourceManifest, artifact.manifestSha256);
Object.assign(process.env, artifact.env);
// No network-capable application import precedes this guard.
installLocalDemoNetworkGuard();
const env = require('../backend/src/config/env.js');
for (const [key, value] of [['databaseUrl', artifact.env.DATABASE_URL], ['port', identity.port], ['localApiProfile', identity.profile], ['jwtSecret', artifact.env.JWT_SECRET], ['csrfSecret', artifact.env.CSRF_SECRET], ['developerApiKeyPepper', artifact.env.DEVELOPER_API_KEY_PEPPER]]) {
  if (env[key] !== value) throw new Error('Effective configuration differs from the guarded artifact.');
}
assertLocalDemoProvidersEmpty(env);
const { pool } = require('../backend/src/config/db.js');
const client = await pool.connect();
try { await verifyLocalSurfaceDatabase(client, identity); } finally { client.release(); }
const application = await import('../backend/src/app.ts');
const app = application.default?.default || application.default;
const server = app.listen(identity.port, '127.0.0.1', () => console.log(`Local ${identity.profile} API on loopback port ${identity.port}; source ${source.sourceCommit}; external network disabled.`));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await new Promise(resolve => server.close(resolve)); await pool.end(); });
