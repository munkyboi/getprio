const db = require("../config/db");
const permissions = require("./permissions");
const {
  createResourceInventoryReconciliationReport,
} = require("./resourceInventoryReconciliationReport");
const PERMISSION = "platform.resource_inventory.read";
const SOURCE_BINDING = "getprio-platform-resource-inventory-v1";
function fail(code, statusCode = 400) {
  throw Object.assign(new Error(code), { code, statusCode });
}
function identity(value) {
  if (
    typeof value !== "string" ||
    !/^[1-9]\d{0,18}$/.test(value) ||
    BigInt(value) > 9223372036854775807n
  )
    fail("resource_report_scope_access_denied", 403);
  return value;
}
function createPlatformResourceInventoryService({
  pool,
  createReport = createResourceInventoryReconciliationReport,
}) {
  function authority(user, session) {
    permissions.assertPermission(user, PERMISSION);
    const actorId = identity(user?._id),
      sessionId = identity(session?._id);
    return async (client, scope) => {
      const actor = (
        await client.query(
          `SELECT u.roles FROM users u JOIN auth_sessions s ON s.user_id=u.id
        WHERE u.id=$1 AND s.id=$2 AND u.deletion_requested_at IS NULL
        AND u.platform_access_suspended_at IS NULL AND u.mfa_enabled=TRUE
        AND s.status='active' AND s.surface='app' AND s.mfa_verified_at IS NOT NULL
        AND s.expires_at>clock_timestamp()
        AND (s.absolute_expires_at IS NULL OR s.absolute_expires_at>clock_timestamp())
        AND (s.inactivity_expires_at IS NULL OR s.inactivity_expires_at>clock_timestamp())`,
          [actorId, sessionId],
        )
      ).rows[0];
      if (!permissions.userHasPermission(actor, PERMISSION)) return false;
      if (!scope) return true;
      return (
        (
          await client.query(
            "SELECT id FROM store_locations WHERE tenant_id=$1 AND id=$2",
            [scope.tenantId, scope.locationId],
          )
        ).rows.length === 1
      );
    };
  }
  async function checkpoint(authorize, operation, scope) {
    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN READ ONLY");
      await client.query(
        "SELECT set_config('statement_timeout','1000ms',TRUE),set_config('lock_timeout','100ms',TRUE)",
      );
      if ((await authorize(client, scope)) !== true)
        fail("resource_report_scope_access_denied", 403);
      const result = await operation(client);
      if ((await authorize(client, scope)) !== true)
        fail("resource_report_scope_access_denied", 403);
      if ((await client.query("COMMIT")).command !== "COMMIT")
        fail("resource_report_authorization_unavailable", 503);
      return result;
    } catch (error) {
      if (client) await client.query("ROLLBACK").catch(() => {});
      if (error.code === "resource_report_scope_access_denied") throw error;
      fail("resource_report_authorization_unavailable", 503);
    } finally {
      client?.release();
    }
  }
  return {
    async read({ user, session, input }) {
      const authorize = authority(user, session);
      const report = await createReport({
        pool,
        sourceBinding: SOURCE_BINDING,
        authorize,
      })(input);
      // Includes unavailable reports, whose failed observation cannot run its
      // own post-commit checkpoint. This checks current access, not a lock held
      // through HTTP delivery, and does not refresh inventory observation time.
      await checkpoint(authorize, async () => null, report.scope);
      return report;
    },
    async searchScopes({ user, session, query }) {
      const authorize = authority(user, session);
      if (typeof query !== "string" || query.length > 100)
        fail("invalid_resource_report_search");
      return checkpoint(authorize, async (client) => {
        const scopes = (
          await client.query(
            `SELECT t.id::text AS "tenantId",l.id::text AS "locationId",
          t.name AS "tenantName",l.name AS "locationName" FROM tenants t
          JOIN store_locations l ON l.tenant_id=t.id WHERE t.name ILIKE $1 OR l.name ILIKE $1
          ORDER BY t.name,l.name,l.id LIMIT 51`,
            [`%${query.trim()}%`],
          )
        ).rows;
        return { scopes: scopes.slice(0, 50), limited: scopes.length > 50 };
      });
    },
  };
}
module.exports = {
  ...createPlatformResourceInventoryService({ pool: db.pool }),
  createPlatformResourceInventoryService,
  PERMISSION,
};
