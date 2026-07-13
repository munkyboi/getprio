const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

function requireWithMocks(targetPath, mocks) {
  const resolvedTarget = require.resolve(targetPath);
  const originals = new Map();

  try {
    for (const [requestPath, mockExports] of Object.entries(mocks)) {
      const resolvedDependency = require.resolve(requestPath, { paths: [path.dirname(resolvedTarget)] });
      originals.set(resolvedDependency, require.cache[resolvedDependency]);
      require.cache[resolvedDependency] = {
        id: resolvedDependency,
        filename: resolvedDependency,
        loaded: true,
        exports: mockExports
      };
    }

    delete require.cache[resolvedTarget];
    return require(resolvedTarget);
  } finally {
    delete require.cache[resolvedTarget];
    for (const [resolvedDependency, originalEntry] of originals.entries()) {
      if (originalEntry) require.cache[resolvedDependency] = originalEntry;
      else delete require.cache[resolvedDependency];
    }
  }
}

test("users repository hydrates relationships, creates linked records, and normalizes updates", async () => {
  const calls = [];
  const client = {
    query: async (query, params) => {
      calls.push({ query: String(query), params });

      if (String(query).includes("FROM users WHERE id = $1")) {
        if (params && Number(params[0]) === 8) {
          return {
            rows: [
              {
                id: 8,
                name: "Bob",
                display_name: "Bobby",
                username: "bob",
                email: "bob@example.com",
                phone: null,
                password_hash: "hash2",
                password_hash_algorithm: "argon2id",
                email_verified: false,
                last_login_provider: "password",
                roles: ["customer"],
                account_locked_until: null,
                failed_login_count: 0,
                last_failed_login_at: null,
                last_password_changed_at: new Date("2026-07-01T00:00:00.000Z"),
                mfa_enabled: false,
                mfa_required: false,
                notification_settings: {},
                created_at: new Date("2026-07-01T00:00:00.000Z"),
                updated_at: new Date("2026-07-01T00:00:00.000Z")
              }
            ]
          };
        }

        return {
          rows: [
            {
              id: 7,
              name: "Alice",
              display_name: "A.",
              username: "alice",
              email: "alice@example.com",
              phone: "09170000000",
              password_hash: "hash",
              password_hash_algorithm: "bcrypt",
              email_verified: true,
              last_login_provider: "password",
              roles: ["customer"],
              account_locked_until: null,
              failed_login_count: 1,
              last_failed_login_at: new Date("2026-07-01T00:00:00.000Z"),
              last_password_changed_at: new Date("2026-07-01T00:00:00.000Z"),
              mfa_enabled: true,
              mfa_required: false,
              notification_settings: { email: true },
              created_at: new Date("2026-07-01T00:00:00.000Z"),
              updated_at: new Date("2026-07-01T00:00:00.000Z")
            }
          ]
        };
      }

      if (String(query).includes("FROM oauth_accounts")) {
        return {
          rows: [
            {
              user_id: 7,
              provider: "google",
              provider_user_id: "g-1",
              email: "alice@example.com",
              email_verified: true,
              linked_at: new Date("2026-07-01T00:00:00.000Z")
            }
          ]
        };
      }

      if (String(query).includes("FROM tenant_memberships")) {
        return {
          rows: [
            {
              user_id: 7,
              tenant_id: 3,
              role: "staff",
              is_active: true
            }
          ]
        };
      }

      if (String(query).includes("INSERT INTO users")) {
        return {
          rows: [
            {
              id: 8,
              name: "Bob",
              display_name: "Bobby",
              username: "bob",
              email: "bob@example.com",
              phone: null,
              password_hash: "hash2",
              password_hash_algorithm: "argon2id",
              email_verified: false,
              last_login_provider: "password",
              roles: ["customer"],
              account_locked_until: null,
              failed_login_count: 0,
              last_failed_login_at: null,
              last_password_changed_at: new Date("2026-07-01T00:00:00.000Z"),
              mfa_enabled: false,
              mfa_required: false,
              notification_settings: {},
              created_at: new Date("2026-07-01T00:00:00.000Z"),
              updated_at: new Date("2026-07-01T00:00:00.000Z")
            }
          ]
        };
      }

      if (String(query).includes("INSERT INTO oauth_accounts")) {
        return { rows: [] };
      }

      if (String(query).includes("INSERT INTO tenant_memberships")) {
        return { rows: [] };
      }

      if (String(query).includes("UPDATE users SET")) {
        return { rows: [] };
      }

      if (String(query).includes("FROM users WHERE email = $1")) {
        return { rows: [] };
      }

      if (String(query).includes("FROM users WHERE LOWER(username) = $1")) {
        return { rows: [] };
      }

      if (String(query).includes("FROM users\n      INNER JOIN oauth_accounts")) {
        return { rows: [] };
      }

      if (String(query).includes("FROM users\n      INNER JOIN tenant_memberships")) {
        return {
          rows: [
            {
              id: 7,
              name: "Alice",
              display_name: "A.",
              username: "alice",
              email: "alice@example.com",
              phone: "09170000000",
              password_hash: "hash",
              password_hash_algorithm: "bcrypt",
              email_verified: true,
              last_login_provider: "password",
              roles: ["customer"],
              account_locked_until: null,
              failed_login_count: 1,
              last_failed_login_at: new Date("2026-07-01T00:00:00.000Z"),
              last_password_changed_at: new Date("2026-07-01T00:00:00.000Z"),
              mfa_enabled: true,
              mfa_required: false,
              notification_settings: { email: true },
              created_at: new Date("2026-07-01T00:00:00.000Z"),
              updated_at: new Date("2026-07-01T00:00:00.000Z")
            }
          ]
        };
      }

      return { rows: [] };
    }
  };

  const users = requireWithMocks("../src/repositories/users.js", {
    "../config/db": { pool: client }
  });

  assert.equal(await users.findUserByEmail("", { client }), null);
  assert.equal(await users.findUserByUsername("   ", { client }), null);

  const hydrated = await users.findUserById(7, { client });
  assert.equal(hydrated._id, "7");
  assert.equal(hydrated.displayName, "A.");
  assert.equal(hydrated.oauthAccounts[0].provider, "google");
  assert.equal(hydrated.tenantMemberships[0].tenantId, "3");
  assert.equal(hydrated.mfaEnabled, true);

  const created = await users.createUser({
    name: "Bob",
    displayName: "Bobby",
    username: "bob",
    email: "bob@example.com",
    passwordHash: "hash2",
    passwordHashAlgorithm: "argon2id",
    oauthAccounts: [{ provider: "google", providerUserId: "g-2", email: "bob@example.com", emailVerified: true }],
    tenantMemberships: [{ tenantId: 5, role: "staff" }]
  }, { client });
  assert.equal(created._id, "8");
  assert.equal(created.displayName, "Bobby");

  const updated = await users.updateUser(7, {
    displayName: "Al",
    username: "AliceUpdated",
    email: "",
    roles: ["customer", "vendor"],
    notificationSettings: { sms: true }
  }, { client });
  assert.equal(updated.username, "alice");
  const updateUserCall = calls.find((call) => call.query.includes("UPDATE users SET") && call.params?.[0] === 7);
  assert.match(updateUserCall.query, /display_name = \$2/);
  assert.equal(updateUserCall.params[1], "Al");

  const addedOauth = await users.addOauthAccount(7, {
    provider: "apple",
    providerUserId: "a-1",
    email: "alice@example.com",
    emailVerified: false
  }, { client });
  assert.equal(addedOauth._id, "7");

  const addedMembership = await users.addTenantMembership(7, 4, "owner", { client });
  assert.equal(addedMembership._id, "7");

  const allUsers = await users.listUsersByTenantId(3, { client });
  assert.equal(allUsers[0]._id, "7");

  const updatedRole = await users.updateTenantMembershipRole(7, 3, "admin", { client });
  assert.equal(updatedRole._id, "7");

  const updatedStatus = await users.updateTenantMembershipStatus(7, 3, false, { client });
  assert.equal(updatedStatus._id, "7");

  await users.removeTenantMembership(7, 3, { client });

  assert.equal(calls.length > 0, true);
});
