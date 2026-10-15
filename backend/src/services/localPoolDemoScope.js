// Opt-in execution/read boundary for a disposable local fixture, never a
// production activation switch or an inference/provenance readiness assertion.
const DATABASE_NAME = /^getprio_local_pool_demo(?:_[a-z0-9_]+)?$/u;
const LOOPBACK = new Set(["127.0.0.1", "::1", "[::1]", "localhost"]);

function localPoolDemoConfiguration(source = process.env) {
  if (source.LOCAL_POOL_DEMO_ENABLED !== "1" || !["development", "test"].includes(source.NODE_ENV)) return null;
  try {
    const url = new URL(source.DATABASE_URL);
    const databaseName = decodeURIComponent(url.pathname.slice(1));
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !LOOPBACK.has(url.hostname)
      || !DATABASE_NAME.test(databaseName)) return null;
    return { databaseName };
  } catch { return null; }
}

async function readLocalPoolDemoScope(client, { tenantId, locationId }) {
  const configuration = localPoolDemoConfiguration();
  if (!configuration) return null;
  const identity = (await client.query(`SELECT current_database() AS database_name,
    host(inet_server_addr()) AS server_address,
    to_regclass('public.local_pool_demo_scopes') IS NOT NULL AS has_marker`)).rows[0];
  if (identity.database_name !== configuration.databaseName
    || !["127.0.0.1", "::1"].includes(identity.server_address) || !identity.has_marker) return null;
  const marker = await client.query(`SELECT 1 FROM public.local_pool_demo_scopes
    WHERE tenant_id=$1 AND location_id=$2 AND fixture_key='four-court-v1'`, [tenantId, locationId]);
  return marker.rows.length === 1 ? { tenantId: String(tenantId), locationId: String(locationId), fixtureKey: "four-court-v1" } : null;
}

module.exports = { localPoolDemoConfiguration, readLocalPoolDemoScope };
