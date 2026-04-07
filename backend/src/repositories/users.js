const db = require("../config/db");

const USER_COLUMNS = `
  id,
  name,
  email,
  phone,
  password_hash,
  email_verified,
  last_login_provider,
  roles,
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
    role: row.role
  };
}

function mapUser(row, relationships = {}) {
  if (!row) {
    return null;
  }

  return {
    _id: String(row.id),
    name: row.name,
    email: row.email,
    phone: row.phone,
    passwordHash: row.password_hash,
    emailVerified: row.email_verified,
    lastLoginProvider: row.last_login_provider,
    roles: row.roles || [],
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
      SELECT user_id, tenant_id, role
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
        email,
        phone,
        password_hash,
        email_verified,
        last_login_provider,
        roles
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING ${USER_COLUMNS}
    `,
    [
      data.name,
      data.email || null,
      data.phone || null,
      data.passwordHash || null,
      Boolean(data.emailVerified),
      data.lastLoginProvider || "password",
      data.roles && data.roles.length ? data.roles : ["customer"]
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
        INSERT INTO tenant_memberships (user_id, tenant_id, role)
        VALUES ($1, $2, $3)
      `,
      [userId, Number(membership.tenantId), membership.role || "staff"]
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
    email: "email",
    phone: "phone",
    passwordHash: "password_hash",
    emailVerified: "email_verified",
    lastLoginProvider: "last_login_provider",
    roles: "roles"
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
      INSERT INTO tenant_memberships (user_id, tenant_id, role)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id, tenant_id) DO UPDATE SET role = EXCLUDED.role
    `,
    [Number(userId), Number(tenantId), role]
  );

  return findUserById(userId, { client: queryClient });
}

module.exports = {
  mapUser,
  findUserById,
  findUserByEmail,
  findUserByOauthAccount,
  createUser,
  updateUser,
  addOauthAccount,
  addTenantMembership
};
