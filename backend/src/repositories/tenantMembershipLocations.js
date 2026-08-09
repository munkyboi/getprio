const db = require("../config/db");

async function userHasLocationAssignment(userId, tenantId, locationId, options = {}) {
  const client = options.client || db.pool;
  const result = await client.query(
    `SELECT 1
     FROM tenant_memberships AS membership
     INNER JOIN tenant_membership_locations AS assignment
       ON assignment.tenant_membership_id = membership.id
     WHERE membership.user_id = $1
       AND membership.tenant_id = $2
       AND membership.role = 'staff'
       AND membership.is_active = TRUE
       AND assignment.location_id = $3
     LIMIT 1`,
    [Number(userId), Number(tenantId), Number(locationId)]
  );
  return result.rows.length > 0;
}

async function listAssignedLocationIdsByUserIds(tenantId, userIds, options = {}) {
  const normalizedIds = (userIds || []).map(Number).filter(Number.isFinite);
  const assignments = new Map();
  if (!normalizedIds.length) {
    return assignments;
  }
  const result = await (options.client || db.pool).query(
    `SELECT membership.user_id, assignment.location_id
     FROM tenant_memberships AS membership
     INNER JOIN tenant_membership_locations AS assignment
       ON assignment.tenant_membership_id = membership.id
     WHERE membership.tenant_id = $1
       AND membership.user_id = ANY($2::BIGINT[])
     ORDER BY assignment.location_id`,
    [Number(tenantId), normalizedIds]
  );
  for (const row of result.rows) {
    const key = String(row.user_id);
    const ids = assignments.get(key) || [];
    ids.push(String(row.location_id));
    assignments.set(key, ids);
  }
  return assignments;
}

async function replaceUserLocationAssignments(data, options = {}) {
  const client = options.client || db.pool;
  const locationIds = [...new Set((data.locationIds || []).map(Number).filter(Number.isFinite))];
  const membershipResult = await client.query(
    `SELECT id, role
     FROM tenant_memberships
     WHERE user_id = $1 AND tenant_id = $2 AND is_active = TRUE
     LIMIT 1`,
    [Number(data.userId), Number(data.tenantId)]
  );
  const membership = membershipResult.rows[0];
  if (!membership) {
    return null;
  }
  if (locationIds.length) {
    const validResult = await client.query(
      `SELECT id
       FROM store_locations
       WHERE tenant_id = $1 AND is_active = TRUE AND id = ANY($2::BIGINT[])`,
      [Number(data.tenantId), locationIds]
    );
    if (validResult.rows.length !== locationIds.length) {
      const error = new Error("One or more queue location assignments are invalid.");
      error.statusCode = 400;
      throw error;
    }
  }
  await client.query(
    `DELETE FROM tenant_membership_locations WHERE tenant_membership_id = $1`,
    [membership.id]
  );
  for (const locationId of locationIds) {
    await client.query(
      `INSERT INTO tenant_membership_locations (
         tenant_membership_id, location_id, assignment_source, assigned_by_user_id
       )
       VALUES ($1, $2, 'explicit', $3)
       ON CONFLICT (tenant_membership_id, location_id) DO NOTHING`,
      [
        membership.id,
        locationId,
        data.assignedByUserId ? Number(data.assignedByUserId) : null
      ]
    );
  }
  return { role: membership.role, locationIds: locationIds.map(String) };
}

module.exports = {
  listAssignedLocationIdsByUserIds,
  replaceUserLocationAssignments,
  userHasLocationAssignment
};
