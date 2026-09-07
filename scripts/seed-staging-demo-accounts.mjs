import bcrypt from "bcryptjs";
import pg from "pg";

const { Pool } = pg;

const databaseUrl = String(process.env.GETPRIO_DATABASE_URL || process.env.DATABASE_URL || "").trim();
const allowSeed = process.env.ALLOW_GETPRIO_STAGING_SEED === "1";
const password = String(process.env.GETPRIO_STAGING_DEMO_PASSWORD || "");
const vendorPlan = String(process.env.GETPRIO_STAGING_VENDOR_PLAN || "free").trim().toLowerCase();

if (!databaseUrl) {
  throw new Error("Set GETPRIO_DATABASE_URL to the explicit staging database URL.");
}

if (!allowSeed) {
  throw new Error("Set ALLOW_GETPRIO_STAGING_SEED=1 to confirm this is an authorized staging seed.");
}

if (!password) {
  throw new Error("Set GETPRIO_STAGING_DEMO_PASSWORD for the demo accounts.");
}

if (!["free", "none"].includes(vendorPlan)) {
  throw new Error("GETPRIO_STAGING_VENDOR_PLAN must be either free or none.");
}

const vendors = [
  {
    username: "vendor1",
    ownerName: "Vendor One",
    email: "vendor1@getprio.test",
    tenantName: "PrioCare Doctor Clinic",
    tenantSlug: "vendor1-doctor",
    category: "Health and Wellness",
    queuePrefix: "DR"
  },
  {
    username: "vendor2",
    ownerName: "Vendor Two",
    email: "vendor2@getprio.test",
    tenantName: "PrioCut Barber Salon",
    tenantSlug: "vendor2-barber-salon",
    category: "Health and Wellness",
    queuePrefix: "BS"
  },
  {
    username: "vendor3",
    ownerName: "Vendor Three",
    email: "vendor3@getprio.test",
    tenantName: "PrioPlay Pickleball Court",
    tenantSlug: "vendor3-pickleball-court",
    category: "Sports and Recreation",
    queuePrefix: "PC"
  }
];

const customerNames = [
  "Adrian Santos",
  "Bianca Reyes",
  "Carlo Mendoza",
  "Daphne Cruz",
  "Enzo Garcia",
  "Faith Navarro",
  "Gabriel Flores",
  "Hazel Aquino",
  "Ivan Castillo",
  "Julia Ramos",
  "Kyle Bautista",
  "Lara Villanueva",
  "Marco Torres",
  "Nina Fernandez",
  "Oscar Lim",
  "Patricia Diaz",
  "Rafael Mercado",
  "Sofia Santiago",
  "Theo Valdez",
  "Ysa Dominguez"
];

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined
});

const client = await pool.connect();

try {
  await client.query("BEGIN");

  const databaseResult = await client.query("SELECT current_database() AS name");
  const databaseName = databaseResult.rows[0]?.name || "unknown";
  if (!/getprio|prio_queue/i.test(databaseName)) {
    throw new Error(`Refusing to seed unexpected database: ${databaseName}`);
  }

  if (vendorPlan === "free") {
    const freePlan = await client.query(
      "SELECT slug FROM subscription_plans WHERE slug = 'free' AND checkout_enabled = FALSE"
    );
    if (!freePlan.rowCount) {
      throw new Error("The staging database does not contain the system-managed Free plan.");
    }
  }

  const requestedUsernames = [
    ...vendors.map((vendor) => vendor.username),
    ...customerNames.map((_, index) => `customer${index + 1}`)
  ];
  const conflicts = await client.query(
    "SELECT username FROM users WHERE username = ANY($1::text[]) ORDER BY username",
    [requestedUsernames]
  );
  if (conflicts.rowCount) {
    throw new Error(`Refusing to overwrite existing users: ${conflicts.rows.map((row) => row.username).join(", ")}`);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const periodStart = new Date();
  const periodEnd = new Date(periodStart);
  periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);

  for (const vendor of vendors) {
    const tenantResult = await client.query(
      `INSERT INTO tenants (
        name, slug, queue_prefix, contact_email, public_profile_enabled,
        public_profile_category, vendor_approval_status, is_active
      )
      VALUES ($1, $2, $3, $4, TRUE, $5, 'approved', TRUE)
      RETURNING id`,
      [vendor.tenantName, vendor.tenantSlug, vendor.queuePrefix, vendor.email, vendor.category]
    );
    const tenantId = tenantResult.rows[0].id;

    const locationResult = await client.query(
      `INSERT INTO store_locations (
        tenant_id, name, slug, contact_email, is_primary, is_active
      )
      VALUES ($1, 'Main location', 'main', $2, TRUE, TRUE)
      RETURNING id`,
      [tenantId, vendor.email]
    );
    const locationId = locationResult.rows[0].id;

    await client.query(
      `INSERT INTO store_hours (location_id, weekday, opens_at, closes_at, is_closed)
       SELECT $1, weekday, '09:00'::time, '17:00'::time, FALSE
       FROM generate_series(0, 6) AS weekday`,
      [locationId]
    );

    const userResult = await client.query(
      `INSERT INTO users (
        name, username, email, password_hash, password_hash_algorithm,
        email_verified, last_login_provider, roles, last_password_changed_at
      )
      VALUES ($1, $2, $3, $4, 'bcrypt', TRUE, 'password', $5, NOW())
      RETURNING id`,
      [vendor.ownerName, vendor.username, vendor.email, passwordHash, ["customer", "vendor"]]
    );
    const userId = userResult.rows[0].id;

    await client.query(
      `INSERT INTO tenant_memberships (user_id, tenant_id, role, is_active)
       VALUES ($1, $2, 'owner', TRUE)`,
      [userId, tenantId]
    );

    if (vendorPlan === "free") {
      const subscriptionResult = await client.query(
        `INSERT INTO tenant_subscriptions (
          tenant_id, plan_slug, status, provider, billing_interval,
          current_period_start, current_period_end, entitlements, entitlement_model_version, metadata
        )
        VALUES ($1, 'free', 'active', 'system', 'monthly', $2, $3, '{}'::jsonb, 2, $4::jsonb)
        RETURNING id`,
        [tenantId, periodStart, periodEnd, JSON.stringify({ seed: "staging-demo" })]
      );
      const subscriptionId = subscriptionResult.rows[0].id;

      await client.query(
        `INSERT INTO usage_accounts (tenant_id, resource_key)
         SELECT $1, resource_key
         FROM unnest(ARRAY['queueTickets', 'queueEmailJourneys', 'serviceBookings']) AS resource_key`,
        [tenantId]
      );
      await client.query(
        `INSERT INTO subscription_allowance_periods (subscription_id, period_start, period_end)
         VALUES ($1, $2, $3)`,
        [subscriptionId, periodStart, periodEnd]
      );
    }
  }

  for (const [index, name] of customerNames.entries()) {
    const number = index + 1;
    await client.query(
      `INSERT INTO users (
        name, username, email, password_hash, password_hash_algorithm,
        email_verified, last_login_provider, roles, last_password_changed_at
      )
      VALUES ($1, $2, $3, $4, 'bcrypt', TRUE, 'password', $5, NOW())`,
      [name, `customer${number}`, `customer${number}@getprio.test`, passwordHash, ["customer"]]
    );
  }

  await client.query("COMMIT");

  const summary = await client.query(
    "SELECT COUNT(*)::integer AS seeded_users FROM users WHERE username = ANY($1::text[])",
    [requestedUsernames]
  );
  const freeSubscriptions = vendorPlan === "free"
    ? Number((await client.query(
      "SELECT COUNT(*)::integer AS count FROM tenant_subscriptions WHERE plan_slug = 'free' AND status = 'active'"
    )).rows[0].count)
    : 0;
  console.log(JSON.stringify({
    database: databaseName,
    seededUsers: summary.rows[0].seeded_users,
    seededVendors: vendors.length,
    vendorPlan,
    activeFreeSubscriptions: freeSubscriptions
  }));
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
