const { CONTRACT_VERSION } = require("./resourceOperationalSnapshot");

function fail(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
}
function identifier(value) {
  if (typeof value !== "string" || !/^[1-9]\d{0,18}$/u.test(value)
    || BigInt(value) > 9223372036854775807n) fail("Invalid resource snapshot scope.");
  return value;
}
function envelope(scope, reasons) {
  return Object.freeze({ contractVersion: CONTRACT_VERSION, scope,
    readiness: "not_ready", reasons: Object.freeze(reasons), snapshot: null });
}

// Server-owned source binding and authorization are configured once. This
// internal reader has no route, application pool import or prediction hook.
function createResourceOperationalSnapshotProducer({ pool, sourceBinding, authorize }) {
  if (!pool || typeof pool.connect !== "function" || typeof authorize !== "function"
    || typeof sourceBinding !== "string" || !sourceBinding.trim() || sourceBinding.length > 160) {
    fail("Invalid resource snapshot producer configuration.");
  }
  return async function readSnapshot({ tenantId, locationId }) {
    const scope = Object.freeze({ tenantId: identifier(tenantId), locationId: identifier(locationId),
      queueKind: "location", sourceBinding });
    const values = [scope.tenantId, scope.locationId];
    const client = await pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const branch = await client.query("SELECT id FROM store_locations WHERE tenant_id=$1 AND id=$2", values);
      if (!branch.rows.length) fail("Location not found.", 404);
      if (await authorize(client, scope) !== true) fail("Resource snapshot access denied.", 403);
      let state;
      try {
        state = await client.query(`SELECT
          (SELECT writer_coverage_complete FROM resource_ledger_scopes WHERE tenant_id=$1 AND location_id=$2) AS covered,
          EXISTS (SELECT 1 FROM location_resource_pools WHERE tenant_id=$1 AND location_id=$2) AS has_pools,
          EXISTS (SELECT 1 FROM location_resource_pools WHERE tenant_id=$1 AND location_id=$2 AND tracking_enabled=FALSE) AS disabled`, values);
      } catch (error) {
        // Older deployments may not have the ledger migration. Never turn
        // missing storage into an apparently empty/ready inventory.
        if (error.code !== "42P01" && error.code !== "42703") throw error;
        await client.query("ROLLBACK");
        return envelope(scope, ["ledger_unavailable"]);
      }
      const row = state.rows[0];
      const reasons = [];
      if (row.covered === null) reasons.push("ledger_unavailable");
      if (!row.has_pools || row.disabled) reasons.push("tracking_disabled");
      if (row.covered !== true) reasons.push("writer_coverage_incomplete");
      // Even hypothetical flag changes cannot enable ready: complete operational
      // inventory, reconciliation and writer gates are not implemented here.
      if (!reasons.length) reasons.push("inventory_incomplete");
      const completion = await client.query("COMMIT");
      if (completion.command !== "COMMIT") fail("Resource snapshot read did not commit.", 409);
      return envelope(scope, reasons);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  };
}
module.exports = { createResourceOperationalSnapshotProducer };
