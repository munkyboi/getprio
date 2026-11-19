import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { assertLocalDemoProvidersEmpty } from './localDemoProviderConfiguration.mjs';

export function validateLocalSurfaceArtifact(artifact) {
  const env = artifact?.env || {};
  const profile = env.LOCAL_API_PROFILE;
  const topology = artifact?.topology;
  if (topology !== undefined && topology !== 'queue_type_qa_20261026') throw new Error('Unknown finite local topology.');
  const queueTypeQa = topology === 'queue_type_qa_20261026';
  if (queueTypeQa && profile !== 'core') throw new Error('Queue type QA requires core profile.');
  const port = queueTypeQa ? 5093 : profile === 'core' ? 5091 : profile === 'sandbox' ? 5092 : 0;
  if (!port || !['development', 'test'].includes(env.NODE_ENV)) throw new Error('Explicit local surface profile required.');
  if (env.API_ENVIRONMENT !== (profile === 'core' ? 'production' : 'sandbox')) throw new Error('Local API environment mismatch.');
  const origin = new URL(env.LOCAL_API_ORIGIN);
  if (origin.href !== `http://127.0.0.1:${port}/` || Number(env.PORT || env.BACKEND_PORT) !== port) throw new Error('Unexpected local API port or origin.');
  let database;
  try { database = new URL(env.DATABASE_URL); } catch { throw new Error("Invalid isolated local database configuration."); }
  const databaseName = decodeURIComponent(database.pathname.slice(1));
  if (!['postgres:', 'postgresql:'].includes(database.protocol) || database.search || database.hash || !['127.0.0.1', 'localhost', '[::1]'].includes(database.hostname)
    || !new RegExp(`^getprio_local_pool_demo_surfaces_${profile}_[a-z0-9_]+$`).test(databaseName)) throw new Error('New isolated local surface database required.');
  if (queueTypeQa && (databaseName !== 'getprio_local_pool_demo_surfaces_core_queue_type_qa_20261026' || database.port !== '55493' || env.LOCAL_BROWSER_COOKIE_PREFIX !== 'qtqa20261026')) throw new Error('Queue type QA target identity mismatch.');
  const secrets = [env.JWT_SECRET, env.CSRF_SECRET, env.DEVELOPER_API_KEY_PEPPER];
  if (secrets.some(value => typeof value !== 'string' || value.length < 32) || new Set(secrets).size !== secrets.length) throw new Error('Distinct generated local signing secrets required.');
  if (profile === 'core' && (!/^[a-z][a-z0-9_]{2,31}$/.test(env.LOCAL_BROWSER_COOKIE_PREFIX || '') || env.AUTH_COOKIE_SECURE !== 'false')) throw new Error('Isolated local core cookie namespace required.');
  if (profile === 'core') {
    const expectedOrigins = queueTypeQa
      ? { CLIENT_URL: 5196, APP_BASE_URL: 5196, CUSTOMER_APP_URL: 5196, VENDOR_APP_URL: 5197, MARKETING_URL: 5190, PLATFORM_DASHBOARD_URL: 5198, DEVELOPER_PORTAL_URL: 5194 }
      : { CLIENT_URL: 5191, APP_BASE_URL: 5191, CUSTOMER_APP_URL: 5191, VENDOR_APP_URL: 5192, MARKETING_URL: 5190, PLATFORM_DASHBOARD_URL: 5193, DEVELOPER_PORTAL_URL: 5194 };
    for (const [key, expectedPort] of Object.entries(expectedOrigins)) {
      let url; try { url = new URL(env[key]); } catch { throw new Error('Explicit local browser application origins required.'); }
      if (url.href !== `http://127.0.0.1:${expectedPort}/`) throw new Error('Local browser application origin mismatch.');
    }
  }
  if (profile === 'sandbox' && env.LOCAL_BROWSER_COOKIE_PREFIX) throw new Error('Sandbox must not use browser sessions.');
  if (!/^[a-f0-9]{64,}$/.test(artifact.databaseNonce || '')) throw new Error('Private database ownership nonce required.');
  if (!/^[a-f0-9]{64}$/.test(artifact.manifestSha256 || '')) throw new Error('Pinned source manifest hash required.');
  assertLocalDemoProvidersEmpty({}, env);
  return { profile, port, databaseName, topology: topology || null, comment: `getprio-local-surfaces:${profile}:${artifact.databaseNonce}` };
}

export function readPrivateArtifact(filename, sourceRoot) {
  const stat = fs.lstatSync(filename);
  const absolute = fs.realpathSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o600 || absolute.startsWith(fs.realpathSync(sourceRoot) + path.sep)) throw new Error('Artifact must be a private mode-0600 regular file outside source.');
  try { return JSON.parse(fs.readFileSync(filename, 'utf8')); } catch { throw new Error('Malformed private local artifact.'); }
}

export function verifyLocalSurfaceSource(sourceRoot, filename, expectedHash) {
  const raw = fs.readFileSync(filename);
  if (crypto.createHash('sha256').update(raw).digest('hex') !== expectedHash) throw new Error('Source manifest hash mismatch.');
  const manifest = JSON.parse(raw);
  if (!/^[a-f0-9]{40}$/.test(manifest.sourceCommit || '') || !Array.isArray(manifest.files) || manifest.files.length < 1700) throw new Error('Full committed source manifest required.');
  const root = fs.realpathSync(sourceRoot), seen = new Set();
  for (const entry of manifest.files) {
    if (!entry.path || path.isAbsolute(entry.path) || entry.path.split(/[\\/]/).includes('..') || seen.has(entry.path)) throw new Error('Unsafe source manifest path.');
    const full = fs.realpathSync(path.join(root, entry.path));
    if (!full.startsWith(root + path.sep) || !fs.statSync(full).isFile()) throw new Error('Source manifest escapes source root.');
    if (crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex') !== entry.sha256) throw new Error(`Source hash mismatch: ${entry.path}`);
    seen.add(entry.path);
  }
  return { sourceCommit: manifest.sourceCommit, files: seen.size };
}

export async function verifyLocalSurfaceDatabase(client, identity) {
  const row = (await client.query(`SELECT current_database() AS database_name, host(inet_server_addr()) AS server_address,
    shobj_description(oid, 'pg_database') AS ownership_comment FROM pg_database WHERE datname=current_database()`)).rows[0];
  if (row?.database_name !== identity.databaseName || !['127.0.0.1','::1'].includes(row.server_address) || row.ownership_comment !== identity.comment) throw new Error('Local database identity or ownership marker mismatch.');
}
