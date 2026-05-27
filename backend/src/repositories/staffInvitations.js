const crypto = require("crypto");
const db = require("../config/db");

const INVITATION_COLUMNS = `
  id,
  tenant_id,
  email,
  role,
  token_hash,
  status,
  invited_by_user_id,
  accepted_by_user_id,
  expires_at,
  accepted_at,
  revoked_at,
  created_at,
  updated_at
`;

function buildQueryClient(client) {
  return client || db.pool;
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function createInviteToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function normalizeInviteRole(role) {
  return role === "admin" ? "admin" : "staff";
}

function mapInvitation(row) {
  if (!row) {
    return null;
  }

  return {
    _id: String(row.id),
    tenantId: String(row.tenant_id),
    email: row.email,
    role: row.role,
    tokenHash: row.token_hash,
    status: row.status,
    invitedByUserId: row.invited_by_user_id ? String(row.invited_by_user_id) : null,
    acceptedByUserId: row.accepted_by_user_id ? String(row.accepted_by_user_id) : null,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function createInvitation(data, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      INSERT INTO tenant_staff_invitations (
        tenant_id,
        email,
        role,
        token_hash,
        invited_by_user_id,
        expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING ${INVITATION_COLUMNS}
    `,
    [
      Number(data.tenantId),
      data.email,
      normalizeInviteRole(data.role),
      data.tokenHash,
      data.invitedByUserId ? Number(data.invitedByUserId) : null,
      data.expiresAt
    ]
  );

  return mapInvitation(result.rows[0]);
}

async function listActivePendingByTenantId(tenantId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  await expirePendingInvitations({ tenantId }, { client: queryClient });
  const result = await queryClient.query(
    `
      SELECT ${INVITATION_COLUMNS}
      FROM tenant_staff_invitations
      WHERE tenant_id = $1 AND status = 'pending'
      ORDER BY created_at DESC
    `,
    [Number(tenantId)]
  );

  return result.rows.map(mapInvitation);
}

async function countPendingByTenantId(tenantId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  await expirePendingInvitations({ tenantId }, { client: queryClient });
  const result = await queryClient.query(
    `
      SELECT COUNT(*)::int AS count
      FROM tenant_staff_invitations
      WHERE tenant_id = $1 AND status = 'pending'
    `,
    [Number(tenantId)]
  );

  return Number(result.rows[0]?.count || 0);
}

async function findPendingByTenantAndEmail(tenantId, email, options = {}) {
  const queryClient = buildQueryClient(options.client);
  await expirePendingInvitations({ tenantId }, { client: queryClient });
  const result = await queryClient.query(
    `
      SELECT ${INVITATION_COLUMNS}
      FROM tenant_staff_invitations
      WHERE tenant_id = $1 AND email = $2 AND status = 'pending'
      LIMIT 1
    `,
    [Number(tenantId), email]
  );

  return mapInvitation(result.rows[0]);
}

async function findByIdForTenant(invitationId, tenantId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      SELECT ${INVITATION_COLUMNS}
      FROM tenant_staff_invitations
      WHERE id = $1 AND tenant_id = $2
      LIMIT 1
    `,
    [Number(invitationId), Number(tenantId)]
  );

  return mapInvitation(result.rows[0]);
}

async function findByToken(token, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      SELECT ${INVITATION_COLUMNS}
      FROM tenant_staff_invitations
      WHERE token_hash = $1
      LIMIT 1
    `,
    [hashToken(token)]
  );

  return mapInvitation(result.rows[0]);
}

async function revokeInvitation(invitationId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      UPDATE tenant_staff_invitations
      SET status = 'revoked', revoked_at = NOW()
      WHERE id = $1 AND status = 'pending'
      RETURNING ${INVITATION_COLUMNS}
    `,
    [Number(invitationId)]
  );

  return mapInvitation(result.rows[0]);
}

async function refreshInvitation(invitationId, data, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      UPDATE tenant_staff_invitations
      SET token_hash = $2, expires_at = $3
      WHERE id = $1 AND status = 'pending'
      RETURNING ${INVITATION_COLUMNS}
    `,
    [Number(invitationId), data.tokenHash, data.expiresAt]
  );

  return mapInvitation(result.rows[0]);
}

async function acceptInvitation(invitationId, userId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      UPDATE tenant_staff_invitations
      SET status = 'accepted', accepted_by_user_id = $2, accepted_at = NOW()
      WHERE id = $1 AND status = 'pending' AND expires_at > NOW()
      RETURNING ${INVITATION_COLUMNS}
    `,
    [Number(invitationId), Number(userId)]
  );

  return mapInvitation(result.rows[0]);
}

async function expirePendingInvitations(filters = {}, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const values = [];
  const clauses = ["status = 'pending'", "expires_at <= NOW()"];

  if (filters.tenantId) {
    values.push(Number(filters.tenantId));
    clauses.push(`tenant_id = $${values.length}`);
  }

  await queryClient.query(
    `
      UPDATE tenant_staff_invitations
      SET status = 'expired'
      WHERE ${clauses.join(" AND ")}
    `,
    values
  );
}

module.exports = {
  createInviteToken,
  hashToken,
  normalizeInviteRole,
  mapInvitation,
  createInvitation,
  listActivePendingByTenantId,
  countPendingByTenantId,
  findPendingByTenantAndEmail,
  findByIdForTenant,
  findByToken,
  revokeInvitation,
  refreshInvitation,
  acceptInvitation,
  expirePendingInvitations
};
