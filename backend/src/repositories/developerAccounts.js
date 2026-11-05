const db = require("../config/db");

function buildQueryClient(client) {
  return client || db.pool;
}

function mapMembership(row) {
  if (!row) return null;
  return {
    id: String(row.membership_id),
    developerAccountId: String(row.developer_account_id),
    userId: String(row.user_id),
    role: row.role,
    status: row.membership_status,
    accountStatus: row.account_status,
    createdAt: row.membership_created_at,
    updatedAt: row.membership_updated_at
  };
}

async function findMembershipByUserId(userId, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      SELECT
        m.id AS membership_id,
        m.developer_account_id,
        m.user_id,
        m.role,
        m.status AS membership_status,
        m.created_at AS membership_created_at,
        m.updated_at AS membership_updated_at,
        a.status AS account_status
      FROM developer_account_memberships m
      INNER JOIN developer_accounts a ON a.id = m.developer_account_id
      WHERE m.user_id = $1 AND m.status = 'active'
      LIMIT 1
    `,
    [Number(userId)]
  );
  return mapMembership(result.rows[0]);
}

async function findAccountByOwnerUserId(userId, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `SELECT id, owner_user_id, status, created_at, updated_at
     FROM developer_accounts
     WHERE owner_user_id = $1
     LIMIT 1`,
    [Number(userId)]
  );
  const row = result.rows[0];
  return row ? {
    id: String(row.id),
    ownerUserId: String(row.owner_user_id),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  } : null;
}

async function createAccountForOwner(userId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const accountResult = await queryClient.query(
    `
      INSERT INTO developer_accounts (owner_user_id)
      VALUES ($1)
      ON CONFLICT (owner_user_id) DO NOTHING
      RETURNING id, owner_user_id, status, created_at, updated_at
    `,
    [Number(userId)]
  );

  let account = accountResult.rows[0];
  if (!account) {
    const existing = await queryClient.query(
      `SELECT id, owner_user_id, status, created_at, updated_at FROM developer_accounts WHERE owner_user_id = $1 LIMIT 1`,
      [Number(userId)]
    );
    account = existing.rows[0];
  }

  await queryClient.query(
    `
      INSERT INTO developer_account_memberships (developer_account_id, user_id, role)
      VALUES ($1, $2, 'owner')
      ON CONFLICT (developer_account_id, user_id)
      DO UPDATE SET status = 'active', role = 'owner', updated_at = NOW()
    `,
    [account.id, Number(userId)]
  );

  return findMembershipByUserId(userId, { client: queryClient });
}

module.exports = {
  createAccountForOwner,
  findAccountByOwnerUserId,
  findMembershipByUserId,
  mapMembership
};
