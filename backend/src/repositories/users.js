const db = require("../config/db");

const USER_COLUMNS = `
  id,
  name,
  username,
  email,
  phone,
  password_hash,
  password_hash_algorithm,
  email_verified,
  last_login_provider,
  roles,
  account_locked_until,
  failed_login_count,
  last_failed_login_at,
  last_password_changed_at,
  mfa_enabled,
  mfa_required,
  notification_settings,
  created_at,
  updated_at
`;

function mapOauthAccount(row) {
  return {
    provider: row.provider,
    providerUserId: row.provider_user_id,
    email: row.email,
    emailVerified: row.email_verified,
    linkedAt: row.linked_at
  };
}

function mapTenantMembership(row) {
  return {
    tenantId: String(row.tenant_id),
    role: row.role,
    isActive: row.is_active !== false
  };
}

function mapUser(row, relationships = {}) {
  if (!row) {
    return null;
  }

  return {
    _id: String(row.id),
    name: row.name,
    username: row.username,
    email: row.email,
    phone: row.phone,
    passwordHash: row.password_hash,
    passwordHashAlgorithm: row.password_hash_algorithm,
    emailVerified: row.email_verified,
    lastLoginProvider: row.last_login_provider,
    roles: row.roles || [],
    accountLockedUntil: row.account_locked_until,
    failedLoginCount: row.failed_login_count || 0,
    lastFailedLoginAt: row.last_failed_login_at,
    lastPasswordChangedAt: row.last_password_changed_at,
    mfaEnabled: row.mfa_enabled === true,
    mfaRequired: row.mfa_required === true,
    notificationSettings: row.notification_settings || {},
    oauthAccounts: relationships.oauthAccounts || [],
    tenantMemberships: relationships.tenantMemberships || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function buildQueryClient(client) {
  return client || db.pool;
}

function normalizeIds(ids) {
  return [...new Set(ids.filter(Boolean).map((id) => Number(id)))];
}

async function loadOauthAccounts(userIds, client) {
  const normalizedIds = normalizeIds(userIds);
  const accountsByUserId = new Map();

  if (!normalizedIds.length) {
    return accountsByUserId;
  }

  const result = await client.query(
    `
      SELECT user_id, provider, provider_user_id, email, email_verified, linked_at
      FROM oauth_accounts
      WHERE user_id = ANY($1::bigint[])
      ORDER BY linked_at ASC
    `,
    [normalizedIds]
  );

  for (const row of result.rows) {
    const key = String(row.user_id);
    const accounts = accountsByUserId.get(key) || [];
    accounts.push(mapOauthAccount(row));
    accountsByUserId.set(key, accounts);
  }

  return accountsByUserId;
}

async function loadTenantMemberships(userIds, client) {
  const normalizedIds = normalizeIds(userIds);
  const membershipsByUserId = new Map();

  if (!normalizedIds.length) {
    return membershipsByUserId;
  }

  const result = await client.query(
    `
      SELECT user_id, tenant_id, role, is_active
      FROM tenant_memberships
      WHERE user_id = ANY($1::bigint[])
      ORDER BY tenant_id ASC
    `,
    [normalizedIds]
  );

  for (const row of result.rows) {
    const key = String(row.user_id);
    const memberships = membershipsByUserId.get(key) || [];
    memberships.push(mapTenantMembership(row));
    membershipsByUserId.set(key, memberships);
  }

  return membershipsByUserId;
}

async function hydrateUsers(rows, client) {
  if (!rows.length) {
    return [];
  }

  const userIds = rows.map((row) => row.id);
  const [oauthAccountsByUserId, membershipsByUserId] = await Promise.all([
    loadOauthAccounts(userIds, client),
    loadTenantMemberships(userIds, client)
  ]);

  return rows.map((row) =>
    mapUser(row, {
      oauthAccounts: oauthAccountsByUserId.get(String(row.id)) || [],
      tenantMemberships: membershipsByUserId.get(String(row.id)) || []
    })
  );
}

async function findUserById(id, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `SELECT ${USER_COLUMNS} FROM users WHERE id = $1 LIMIT 1`,
    [Number(id)]
  );
  const users = await hydrateUsers(result.rows, queryClient);
  return users[0] || null;
}

async function findUserByEmail(email, options = {}) {
  if (!email) {
    return null;
  }

  const queryClient = buildQueryClient(options.client);
  const values = [email];
  let query = `SELECT ${USER_COLUMNS} FROM users WHERE email = $1`;

  if (options.excludeId) {
    values.push(Number(options.excludeId));
    query += ` AND id <> $${values.length}`;
  }

  query += " LIMIT 1";

  const result = await queryClient.query(query, values);
  const users = await hydrateUsers(result.rows, queryClient);
  return users[0] || null;
}

async function findUserByUsername(username, options = {}) {
  const normalizedUsername = String(username || "").trim().toLowerCase();
  if (!normalizedUsername) {
    return null;
  }

  const queryClient = buildQueryClient(options.client);
  const values = [normalizedUsername];
  let query = `SELECT ${USER_COLUMNS} FROM users WHERE LOWER(username) = $1`;

  if (options.excludeId) {
    values.push(Number(options.excludeId));
    query += ` AND id <> $${values.length}`;
  }

  query += " LIMIT 1";

  const result = await queryClient.query(query, values);
  const users = await hydrateUsers(result.rows, queryClient);
  return users[0] || null;
}

async function findUserByOauthAccount(provider, providerUserId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      SELECT ${USER_COLUMNS}
      FROM users
      INNER JOIN oauth_accounts ON oauth_accounts.user_id = users.id
      WHERE oauth_accounts.provider = $1 AND oauth_accounts.provider_user_id = $2
      LIMIT 1
    `,
    [provider, providerUserId]
  );

  const users = await hydrateUsers(result.rows, queryClient);
  return users[0] || null;
}

async function createUser(data, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      INSERT INTO users (
        name,
        username,
        email,
        phone,
        password_hash,
        password_hash_algorithm,
        email_verified,
        last_login_provider,
        roles,
        last_password_changed_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING ${USER_COLUMNS}
    `,
    [
      data.name,
      data.username || null,
      data.email || null,
      data.phone || null,
      data.passwordHash || null,
      data.passwordHash ? data.passwordHashAlgorithm || "bcrypt" : null,
      Boolean(data.emailVerified),
      data.lastLoginProvider || "password",
      data.roles && data.roles.length ? data.roles : ["customer"],
      data.passwordHash ? new Date() : null
    ]
  );

  const userId = result.rows[0].id;

  for (const account of data.oauthAccounts || []) {
    await queryClient.query(
      `
        INSERT INTO oauth_accounts (
          user_id,
          provider,
          provider_user_id,
          email,
          email_verified,
          linked_at
        )
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        userId,
        account.provider,
        account.providerUserId,
        account.email || null,
        Boolean(account.emailVerified),
        account.linkedAt || new Date()
      ]
    );
  }

  for (const membership of data.tenantMemberships || []) {
    await queryClient.query(
      `
        INSERT INTO tenant_memberships (user_id, tenant_id, role, is_active)
        VALUES ($1, $2, $3, $4)
      `,
      [userId, Number(membership.tenantId), membership.role || "staff", membership.isActive !== false]
    );
  }

  return findUserById(userId, { client: queryClient });
}

async function updateUser(userId, changes, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const values = [Number(userId)];
  const updates = [];

  const setters = {
    name: "name",
    username: "username",
    email: "email",
    phone: "phone",
    passwordHash: "password_hash",
    passwordHashAlgorithm: "password_hash_algorithm",
    emailVerified: "email_verified",
    lastLoginProvider: "last_login_provider",
    roles: "roles",
    accountLockedUntil: "account_locked_until",
    failedLoginCount: "failed_login_count",
    lastFailedLoginAt: "last_failed_login_at",
    lastPasswordChangedAt: "last_password_changed_at",
    mfaEnabled: "mfa_enabled",
    mfaRequired: "mfa_required",
    notificationSettings: "notification_settings"
  };

  for (const [key, column] of Object.entries(setters)) {
    if (!Object.prototype.hasOwnProperty.call(changes, key)) {
      continue;
    }

    values.push(changes[key]);
    updates.push(`${column} = $${values.length}`);
  }

  if (!updates.length) {
    return findUserById(userId, { client: queryClient });
  }

  await queryClient.query(
    `UPDATE users SET ${updates.join(", ")} WHERE id = $1`,
    values
  );

  return findUserById(userId, { client: queryClient });
}

async function addOauthAccount(userId, account, options = {}) {
  const queryClient = buildQueryClient(options.client);

  await queryClient.query(
    `
      INSERT INTO oauth_accounts (
        user_id,
        provider,
        provider_user_id,
        email,
        email_verified,
        linked_at
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (provider, provider_user_id) DO NOTHING
    `,
    [
      Number(userId),
      account.provider,
      account.providerUserId,
      account.email || null,
      Boolean(account.emailVerified),
      account.linkedAt || new Date()
    ]
  );

  return findUserById(userId, { client: queryClient });
}

async function addTenantMembership(userId, tenantId, role = "staff", options = {}) {
  const queryClient = buildQueryClient(options.client);

  await queryClient.query(
    `
      INSERT INTO tenant_memberships (user_id, tenant_id, role, is_active)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id, tenant_id) DO UPDATE SET
        role = EXCLUDED.role,
        is_active = EXCLUDED.is_active
    `,
    [Number(userId), Number(tenantId), role, true]
  );

  return findUserById(userId, { client: queryClient });
}

async function listUsersByTenantId(tenantId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      SELECT
        users.id,
        users.name,
        users.email,
        users.phone,
        users.password_hash,
        users.email_verified,
        users.last_login_provider,
        users.roles,
        users.created_at,
        users.updated_at
      FROM users
      INNER JOIN tenant_memberships ON tenant_memberships.user_id = users.id
      WHERE tenant_memberships.tenant_id = $1
      ORDER BY users.name ASC, users.email ASC
    `,
    [Number(tenantId)]
  );

  return hydrateUsers(result.rows, queryClient);
}

async function updateTenantMembershipRole(userId, tenantId, role, options = {}) {
  const queryClient = buildQueryClient(options.client);
  await queryClient.query(
    `
      UPDATE tenant_memberships
      SET role = $3
      WHERE user_id = $1 AND tenant_id = $2
    `,
    [Number(userId), Number(tenantId), role]
  );

  return findUserById(userId, { client: queryClient });
}

async function updateTenantMembershipStatus(userId, tenantId, isActive, options = {}) {
  const queryClient = buildQueryClient(options.client);
  await queryClient.query(
    `
      UPDATE tenant_memberships
      SET is_active = $3
      WHERE user_id = $1 AND tenant_id = $2
    `,
    [Number(userId), Number(tenantId), Boolean(isActive)]
  );

  return findUserById(userId, { client: queryClient });
}

async function removeTenantMembership(userId, tenantId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  await queryClient.query(
    `DELETE FROM tenant_memberships WHERE user_id = $1 AND tenant_id = $2`,
    [Number(userId), Number(tenantId)]
  );
}

module.exports = {
  mapUser,
  findUserById,
  findUserByEmail,
  findUserByUsername,
  findUserByOauthAccount,
  createUser,
  updateUser,
  addOauthAccount,
  addTenantMembership,
  listUsersByTenantId,
  updateTenantMembershipRole,
  updateTenantMembershipStatus,
  removeTenantMembership
};
