const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

function resolveMockPath(requestPath, baseDir) {
  if (!requestPath.startsWith(".")) {
    return require.resolve(requestPath, { paths: [baseDir] });
  }

  const absoluteBase = path.resolve(baseDir, requestPath);
  const candidates = [
    absoluteBase,
    `${absoluteBase}.js`,
    `${absoluteBase}.ts`,
    path.join(absoluteBase, "index.js"),
    path.join(absoluteBase, "index.ts")
  ];

  for (const candidate of candidates) {
    try {
      return require.resolve(candidate);
    } catch {
      // Try the next candidate.
    }
  }

  throw new Error(`Unable to resolve mock path: ${requestPath}`);
}

function requireWithMocks(targetPath, mocks) {
  const resolvedTarget = require.resolve(targetPath);
  const originals = new Map();

  try {
    for (const [requestPath, mockExports] of Object.entries(mocks)) {
      const resolvedDependency = resolveMockPath(requestPath, path.dirname(resolvedTarget));
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
      if (originalEntry) {
        require.cache[resolvedDependency] = originalEntry;
      } else {
        delete require.cache[resolvedDependency];
      }
    }
  }
}

test("repository mapping helpers and update paths preserve defaults and normalize inputs", async () => {
  const queries = [];
  const tenantCreateQueries = [];
  const client = {
    query: async (sql, values) => {
      queries.push({ sql: String(sql), values });

      if (String(sql).includes("FROM users WHERE id = $1")) {
        return {
          rows: [{
            id: 1,
            name: "Customer One",
            username: "customer_one",
            email: "customer@example.com",
            phone: "09170000000",
            password_hash: "hash",
            password_hash_algorithm: "bcrypt",
            email_verified: true,
            last_login_provider: "password",
            roles: ["customer"],
            account_locked_until: null,
            failed_login_count: 2,
            last_failed_login_at: new Date("2026-07-01T00:00:00.000Z"),
            last_password_changed_at: new Date("2026-07-01T00:00:00.000Z"),
            mfa_enabled: false,
            mfa_required: false,
            notification_settings: { email: true },
            created_at: new Date("2026-07-01T00:00:00.000Z"),
            updated_at: new Date("2026-07-01T00:00:00.000Z")
          }]
        };
      }

      if (String(sql).includes("FROM oauth_accounts")) {
        return { rows: [] };
      }

      if (String(sql).includes("FROM tenant_memberships")) {
        return { rows: [] };
      }

      if (String(sql).includes("FROM tenants WHERE slug = $1")) {
        return { rows: [{ id: 1, name: "Demo", slug: "demo", vendor_approval_status: "approved" }] };
      }

      if (String(sql).includes("SELECT") && String(sql).includes("FROM store_locations WHERE tenant_id = $1")) {
        return { rows: [{ id: 1, tenant_id: 1, name: "Main", slug: "main", is_primary: true, timezone: "Asia/Manila", is_active: true }] };
      }

      if (String(sql).includes("FROM store_locations WHERE id = $1 LIMIT 1")) {
        return { rows: [{ id: 1, tenant_id: 1, name: "Main", slug: "main", is_primary: true, timezone: "Asia/Manila", is_active: true }] };
      }

      if (String(sql).includes("FROM vendor_services WHERE tenant_id = $1")) {
        return { rows: [{ id: 1, tenant_id: 1, name: "Consultation", slug: "consultation", duration_minutes: 60, allow_booking_quantity: false, is_active: true, sort_order: 1 }] };
      }

      if (String(sql).includes("INSERT INTO tenants")) {
        tenantCreateQueries.push({ sql: String(sql), values });
        return { rows: [{ id: 2, name: "New Tenant", slug: "new-tenant", vendor_approval_status: "approved", is_active: true }] };
      }

      if (String(sql).includes("INSERT INTO store_locations")) {
        return { rows: [{ id: 2, tenant_id: 2, name: "Branch", slug: "branch", is_primary: true, timezone: "Asia/Manila", is_active: true }] };
      }

      if (String(sql).includes("INSERT INTO vendor_services")) {
        return { rows: [{ id: 2, tenant_id: 2, name: "Service", slug: "service", duration_minutes: 30, allow_booking_quantity: true, is_active: true, sort_order: 0 }] };
      }

      if (String(sql).includes("UPDATE store_locations SET is_primary = FALSE")) {
        return { rows: [] };
      }

      if (String(sql).includes("UPDATE vendor_services")) {
        return { rows: [{ id: 2, tenant_id: 2, name: "Service", slug: "updated-name", duration_minutes: 45, allow_booking_quantity: true, is_active: false, sort_order: 2 }] };
      }

      if (String(sql).includes("SELECT id, tenant_id, name, slug, address_line1")) {
        return { rows: [{ id: 1, tenant_id: 1, name: "Main", slug: "main", is_primary: true, timezone: "Asia/Manila", is_active: true }] };
      }

      return { rows: [] };
    }
  };

  const users = requireWithMocks("../src/repositories/users.js", { "../config/db": { pool: client } });
  const tenants = requireWithMocks("../src/repositories/tenants.js", { "../config/db": { pool: client }, "./storeLocations": requireWithMocks("../src/repositories/storeLocations.js", { "../config/db": { pool: client } }) });
  const storeLocations = requireWithMocks("../src/repositories/storeLocations.js", { "../config/db": { pool: client } });
  const vendorServices = requireWithMocks("../src/repositories/vendorServices.js", { "../config/db": { pool: client } });

  const user = await users.findUserById(1, { client });
  assert.equal(user._id, "1");
  assert.equal(user.failedLoginCount, 2);
  assert.deepEqual(user.notificationSettings, { email: true });
  assert.equal(user.mfaEnabled, false);

  const tenant = await tenants.findTenantBySlug("demo", { client });
  assert.equal(tenant._id, "1");
  assert.equal(tenant.vendorApprovalStatus, "approved");

  const createdTenant = await tenants.createTenant({ name: "New Tenant", slug: "new tenant", contactEmail: "admin@example.com" }, { client });
  assert.equal(createdTenant.slug, "new-tenant");
  assert.equal(tenantCreateQueries.length, 1);

  const location = await storeLocations.createLocation({ tenantId: 2, name: "Branch", slug: "Branch", isPrimary: true, isActive: true }, { client });
  assert.equal(location.slug, "branch");
  assert.equal(location.isPrimary, true);

  const service = await vendorServices.createService({ tenantId: 2, name: "Service", slug: "Service", durationMinutes: 30, allowBookingQuantity: true, priceAmountCents: 1000 }, { client });
  assert.equal(service.slug, "service");
  assert.equal(service.allowBookingQuantity, true);

  const createServiceQuery = queries.find(({ sql }) => sql.includes("INSERT INTO vendor_services"));
  assert.match(createServiceQuery.sql, /\$15\)/);
  assert.equal(createServiceQuery.values.length, 15);
  assert.equal(createServiceQuery.values.at(-1), 0);

  const updatedService = await vendorServices.updateService(2, { slug: "Updated Name", description: "", isActive: false }, { client });
  assert.equal(updatedService.slug, "updated-name");
  assert.equal(updatedService.isActive, false);

  assert.equal(queries.length > 0, true);
});
