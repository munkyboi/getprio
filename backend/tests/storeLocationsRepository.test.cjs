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

test("store locations normalize slugs, reset primary flags, and replace hours", async () => {
  const calls = [];
  let updatedPrimaryReset = 0;
  const client = {
    query: async (query, params) => {
      calls.push({ query: String(query), params });

      if (String(query).includes("UPDATE store_locations SET is_primary = FALSE WHERE tenant_id = $1")) {
        updatedPrimaryReset += 1;
        return { rows: [] };
      }

      if (String(query).includes("INSERT INTO store_locations")) {
        return {
          rows: [
            {
              id: 8,
              tenant_id: 3,
              name: "Branch 1",
              slug: "branch-1",
              address_line1: null,
              address_line2: null,
              city: null,
              province: null,
              postal_code: null,
              country: "Philippines",
              contact_email: null,
              contact_phone: null,
              timezone: "Asia/Manila",
              payment_method_label: null,
              payment_account_display_name: null,
              payment_account_identifier_display: null,
              payment_qr_image_url: null,
              payment_qr_active: true,
              is_primary: true,
              is_active: true,
              created_at: new Date("2026-07-01T00:00:00.000Z"),
              updated_at: new Date("2026-07-01T00:00:00.000Z")
            }
          ]
        };
      }

      if (String(query).includes("UPDATE store_locations\n      SET")) {
        return {
          rows: [
            {
              id: 8,
              tenant_id: 3,
              name: "Updated Branch",
              slug: "updated-branch",
              address_line1: "Line 1",
              address_line2: "",
              city: "Manila",
              province: "NCR",
              postal_code: "1000",
              country: "Philippines",
              contact_email: "branch@example.com",
              contact_phone: "09170000000",
              timezone: "Asia/Manila",
              payment_method_label: "",
              payment_account_display_name: "",
              payment_account_identifier_display: "",
              payment_qr_image_url: "",
              payment_qr_active: false,
              is_primary: false,
              is_active: true,
              created_at: new Date("2026-07-01T00:00:00.000Z"),
              updated_at: new Date("2026-07-01T00:00:00.000Z")
            }
          ]
        };
      }

      if (String(query).includes("FROM store_locations WHERE id = $1 LIMIT 1")) {
        return {
          rows: [
            {
              id: 8,
              tenant_id: 3,
              name: "Updated Branch",
              slug: "updated-branch",
              address_line1: "Line 1",
              address_line2: "",
              city: "Manila",
              province: "NCR",
              postal_code: "1000",
              country: "Philippines",
              contact_email: "branch@example.com",
              contact_phone: "09170000000",
              timezone: "Asia/Manila",
              payment_method_label: "",
              payment_account_display_name: "",
              payment_account_identifier_display: "",
              payment_qr_image_url: "",
              payment_qr_active: false,
              is_primary: false,
              is_active: true,
              created_at: new Date("2026-07-01T00:00:00.000Z"),
              updated_at: new Date("2026-07-01T00:00:00.000Z")
            }
          ]
        };
      }

      if (String(query).includes("DELETE FROM store_hours")) {
        return { rows: [] };
      }

      if (String(query).includes("INSERT INTO store_hours")) {
        return { rows: [] };
      }

      if (String(query).includes("FROM store_hours")) {
        return {
          rows: [
            {
              id: 1,
              location_id: 8,
              weekday: 0,
              opens_at: "00:00:00",
              closes_at: "00:00:00",
              is_closed: false,
              created_at: new Date("2026-07-01T00:00:00.000Z"),
              updated_at: new Date("2026-07-01T00:00:00.000Z")
            }
          ]
        };
      }

      return { rows: [] };
    }
  };
  const storeLocations = requireWithMocks("../src/repositories/storeLocations.js", {
    "../config/db": {
      pool: client
    }
  });

  const created = await storeLocations.createLocation({
    tenantId: 3,
    name: "Branch 1",
    slug: "Branch 1",
    isPrimary: true,
    paymentQrActive: true
  }, { client });
  assert.equal(created.slug, "branch-1");
  assert.equal(updatedPrimaryReset, 1);

  const updated = await storeLocations.updateLocation(8, {
    slug: "Updated Branch",
    addressLine1: "Line 1",
    addressLine2: "",
    city: "Manila",
    province: "NCR",
    postalCode: "1000",
    country: "Philippines",
    contactEmail: "branch@example.com",
    contactPhone: "09170000000",
    timezone: "Asia/Manila",
    isActive: true
  }, { client });
  assert.equal(updated.slug, "updated-branch");

  const noChange = await storeLocations.updateLocation(8, {}, { client });
  assert.equal(noChange._id, "8");

  const alwaysOpen = await storeLocations.createAlwaysOpenHours(8, { client });
  assert.equal(alwaysOpen.length, 1);
  assert.equal(alwaysOpen[0].weekday, 0);
  assert.equal(alwaysOpen[0].opensAt, "00:00");
  assert.equal(alwaysOpen[0].isClosed, false);

  assert.equal(calls.length >= 6, true);
});
