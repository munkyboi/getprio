const { COLLECTIONS, CONTEXT, COUNTS } = require('./resourceInventoryReportQueries');
const { buildResourceInventoryReport } = require('./resourceInventoryReportAnalysis');
const REPORT_VERSION = 'resource-inventory-reconciliation-report-v1';
const MAX_BYTES = 2 * 1024 * 1024;
function fail(code, statusCode = 400) { throw Object.assign(new Error(code), { code, statusCode }); }
function identifier(value) {
  if (typeof value !== 'string' || !/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > 9223372036854775807n) fail('invalid_resource_report_scope');
  return value;
}
function instant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)) fail('invalid_resource_report_window');
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().replace('.000Z','Z') !== value.replace('.000Z','Z')) fail('invalid_resource_report_window');
  return parsed;
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function unavailable(scope, window, observedAt, reason) {
  return { reportVersion: REPORT_VERSION, scope, window, observedAt, completedAt: new Date().toISOString(),
    readiness: 'not_ready', snapshot: null, authoritativeInventoryComplete: false,
    scanStatus: 'unavailable', countsStatus: 'unavailable', counts: null, inventory: null,
    findings: { status: 'not_evaluated', counts: null, examples: [] }, blockers: [reason],
    forecastSupport: 'not_assessed', historicalRepairPerformed: false, customerEstimateChanged: false };
}
function createResourceInventoryReconciliationReport({ pool, sourceBinding, authorize,
  statementTimeoutMs = 1000, lockTimeoutMs = 100, maximumBytes = MAX_BYTES, limits = {} }) {
  if (!pool || typeof pool.connect !== 'function' || typeof authorize !== 'function'
    || typeof sourceBinding !== 'string' || !sourceBinding.trim() || sourceBinding.length > 160
    || !Number.isSafeInteger(statementTimeoutMs) || statementTimeoutMs < 1 || statementTimeoutMs > 1000
    || !Number.isSafeInteger(lockTimeoutMs) || lockTimeoutMs < 1 || lockTimeoutMs > 1000
    || !Number.isSafeInteger(maximumBytes) || maximumBytes < 4096 || maximumBytes > MAX_BYTES
    || Object.keys(limits).some(key => !Object.hasOwn(COLLECTIONS, key))) fail('invalid_resource_report_configuration');
  const bounds = Object.fromEntries(Object.entries(COLLECTIONS).map(([name, collection]) => {
    const limit = limits[name] ?? collection.maximum;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > collection.maximum) fail('invalid_resource_report_configuration');
    return [name, limit];
  }));
  return async function readReport(input) {
    if (!input || Object.keys(input).some(key => !['tenantId','locationId','windowFrom','windowTo'].includes(key))) fail('invalid_resource_report_scope');
    const scope = Object.freeze({ tenantId: identifier(input.tenantId), locationId: identifier(input.locationId), queueKind: 'location', sourceBinding });
    const from = instant(input.windowFrom), to = instant(input.windowTo);
    if (to <= from || to-from > 480*60000) fail('invalid_resource_report_window');
    const window = { from: new Date(from).toISOString(), to: new Date(to).toISOString(), horizonCompletenessAttested: false };
    const params = [scope.tenantId, scope.locationId, window.from, window.to];
    let client;
    let observedAt = null, authorized = false;
    try {
      client = await pool.connect();
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await client.query("SELECT set_config('statement_timeout',$1,TRUE),set_config('lock_timeout',$2,TRUE)", [`${statementTimeoutMs}ms`,`${lockTimeoutMs}ms`]);
      const observation = (await client.query("SELECT transaction_timestamp() AS observed_at,(EXTRACT(EPOCH FROM transaction_timestamp())*1000000)::bigint::text AS observed_at_us,current_setting('transaction_read_only') AS read_only,current_setting('transaction_isolation') AS isolation")).rows[0];
      if (observation.read_only !== 'on' || observation.isolation !== 'repeatable read') fail('resource_report_transaction_invalid',503);
      if (await authorize(client, scope) !== true) fail('resource_report_scope_access_denied', 403);
      authorized = true;
      observedAt = observation.observed_at.toISOString();
      if (BigInt(from)*1000n > BigInt(observation.observed_at_us) || BigInt(to)*1000n <= BigInt(observation.observed_at_us)) fail('invalid_resource_report_window');
      if (!(await client.query('SELECT id FROM store_locations WHERE tenant_id=$1 AND id=$2', params.slice(0,2))).rows.length) fail('resource_report_location_not_found',404);
      const ledger = (await client.query('SELECT revision::text,writer_coverage_complete FROM resource_ledger_scopes WHERE tenant_id=$1 AND location_id=$2',params.slice(0,2))).rows[0] || null;
      const counts = (await client.query(COUNTS, params)).rows[0];
      if (!counts || Object.values(counts).some(value => typeof value !== 'string' || !/^\d+$/.test(value))) fail('resource_report_counts_unavailable',503);
      const exceeded = Object.entries(bounds).filter(([name, limit]) => BigInt(counts[name]) > BigInt(limit)).map(([name]) => name);
      const data = {};
      if (!exceeded.length) {
        for (const [name, collection] of Object.entries(COLLECTIONS)) {
          const rows = (await client.query(`${CONTEXT} ${collection.rows} LIMIT $5`, [...params,bounds[name]+1])).rows;
          if (BigInt(rows.length) !== BigInt(counts[name])) fail('resource_report_counts_inconsistent',503);
          data[name] = rows;
        }
      }
      const result = buildResourceInventoryReport({ reportVersion: REPORT_VERSION, scope, window, observedAt, observedAtUs: observation.observed_at_us, ledger, counts, data, exceeded, bounds });
      result.completedAt = new Date().toISOString();
      if (Buffer.byteLength(JSON.stringify(result),'utf8') > maximumBytes) {
        result.scanStatus = 'byte_limit_exceeded'; result.inventory = null;
        result.findings = { status: 'not_returned_due_byte_limit', counts: null, examples: [] };
        result.blockers = [...new Set([...result.blockers,'report_byte_limit_exceeded'])];
      }
      if (Buffer.byteLength(JSON.stringify(result),'utf8') > maximumBytes) fail('resource_report_byte_limit_exceeded',503);
      const completion = await client.query('COMMIT');
      if (completion.command !== 'COMMIT') fail('resource_report_not_committed',503);
      // A repeatable-read snapshot cannot see a later grant revocation. Check
      // current access again in a separate bounded, read-only auth transaction.
      // This never refreshes the inventory observation or its revision facts.
      await client.query('BEGIN READ ONLY');
      await client.query("SELECT set_config('statement_timeout',$1,TRUE),set_config('lock_timeout',$2,TRUE)", [`${statementTimeoutMs}ms`,`${lockTimeoutMs}ms`]);
      if (await authorize(client, scope) !== true) fail('resource_report_scope_access_denied',403);
      if ((await client.query('COMMIT')).command !== 'COMMIT') fail('resource_report_not_committed',503);
      result.completedAt = new Date().toISOString();
      return freeze(result);
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      if (['invalid_resource_report_window','resource_report_scope_access_denied','resource_report_location_not_found'].includes(error.code)) throw error;
      if (authorized && ['42P01','42703','57014','55P03'].includes(error.code)) {
        return freeze(unavailable(scope,window,observedAt,['57014','55P03'].includes(error.code) ? 'resource_report_read_timeout' : 'resource_report_storage_unavailable'));
      }
      fail(authorized ? 'resource_report_read_failed' : 'resource_report_authorization_unavailable',503);
    } finally { client?.release(); }
  };
}
module.exports = { createResourceInventoryReconciliationReport, REPORT_VERSION, MAX_BYTES };
