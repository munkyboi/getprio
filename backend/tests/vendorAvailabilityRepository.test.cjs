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

test("vendor availability repository normalizes list, create, update, and delete paths", async () => {
  const calls = [];
  const client = {
    query: async (query, params) => {
      calls.push({ query: String(query), params });

      if (String(query).includes("FROM vendor_availability_blocks") && String(query).includes("ORDER BY weekday ASC, starts_at ASC, ends_at ASC")) {
        return {
          rows: [
            {
              id: 1,
              tenant_id: 2,
              location_id: 3,
              service_id: null,
              weekday: 1,
              starts_at: "09:00:00",
              ends_at: "17:30:00",
              capacity: 4,
              is_active: true,
              notes: null,
              created_at: new Date("2026-07-01T00:00:00.000Z"),
              updated_at: new Date("2026-07-01T00:00:00.000Z")
            }
          ]
        };
      }

      if (String(query).includes("FROM vendor_availability_exceptions") && String(query).includes("ORDER BY exception_date ASC, starts_at ASC NULLS FIRST")) {
        return {
          rows: [
            {
              id: 2,
              tenant_id: 2,
              location_id: 3,
              service_id: 5,
              exception_date: "2026-07-10",
              starts_at: null,
              ends_at: null,
              is_available: false,
              capacity: null,
              reason: "Holiday",
              created_at: new Date("2026-07-01T00:00:00.000Z"),
              updated_at: new Date("2026-07-01T00:00:00.000Z")
            }
          ]
        };
      }

      if (String(query).includes("INSERT INTO vendor_availability_blocks")) {
        return {
          rows: [
            {
              id: 3,
              tenant_id: 2,
              location_id: 3,
              service_id: 5,
              weekday: 2,
              starts_at: "08:00:00",
              ends_at: "16:00:00",
              capacity: 2,
              is_active: true,
              notes: "  ",
              created_at: new Date("2026-07-01T00:00:00.000Z"),
              updated_at: new Date("2026-07-01T00:00:00.000Z")
            }
          ]
        };
      }

      if (String(query).includes("FROM vendor_availability_blocks") && String(query).includes("WHERE id = $1 LIMIT 1")) {
        return {
          rows: [
            {
              id: 3,
              tenant_id: 2,
              location_id: 3,
              service_id: 5,
              weekday: 2,
              starts_at: "08:00:00",
              ends_at: "16:00:00",
              capacity: 2,
              is_active: true,
              notes: "",
              created_at: new Date("2026-07-01T00:00:00.000Z"),
              updated_at: new Date("2026-07-01T00:00:00.000Z")
            }
          ]
        };
      }

      if (String(query).includes("UPDATE vendor_availability_blocks")) {
        return {
          rows: [
            {
              id: 3,
              tenant_id: 2,
              location_id: 4,
              service_id: null,
              weekday: 3,
              starts_at: "10:00:00",
              ends_at: "18:00:00",
              capacity: 6,
              is_active: false,
              notes: "",
              created_at: new Date("2026-07-01T00:00:00.000Z"),
              updated_at: new Date("2026-07-01T00:00:00.000Z")
            }
          ]
        };
      }

      if (String(query).includes("INSERT INTO vendor_availability_exceptions")) {
        return {
          rows: [
            {
              id: 4,
              tenant_id: 2,
              location_id: 3,
              service_id: null,
              exception_date: "2026-07-15",
              starts_at: null,
              ends_at: null,
              is_available: true,
              capacity: null,
              reason: null,
              created_at: new Date("2026-07-01T00:00:00.000Z"),
              updated_at: new Date("2026-07-01T00:00:00.000Z")
            }
          ]
        };
      }

      if (String(query).includes("UPDATE vendor_availability_exceptions")) {
        return {
          rows: [
            {
              id: 4,
              tenant_id: 2,
              location_id: 4,
              service_id: 6,
              exception_date: "2026-07-16",
              starts_at: "12:00:00",
              ends_at: "13:30:00",
              is_available: false,
              capacity: 0,
              reason: "Lunch",
              created_at: new Date("2026-07-01T00:00:00.000Z"),
              updated_at: new Date("2026-07-01T00:00:00.000Z")
            }
          ]
        };
      }

      if (String(query).includes("DELETE FROM vendor_availability_exceptions")) {
        return { rows: [] };
      }

      if (String(query).includes("DELETE FROM vendor_availability_blocks")) {
        return { rows: [] };
      }

      return { rows: [] };
    }
  };

  const repository = requireWithMocks("../src/repositories/vendorAvailability.js", {
    "../config/db": { pool: client }
  });

  const list = await repository.listAvailabilityByLocation(2, 3, { client });
  assert.equal(list.blocks[0].startsAt, "09:00");
  assert.equal(list.exceptions[0].reason, "Holiday");

  const createdBlock = await repository.createBlock({
    tenantId: 2,
    locationId: 3,
    serviceId: 5,
    weekday: 2,
    startsAt: "08:00:00",
    endsAt: "16:00:00",
    capacity: 2,
    notes: "  "
  }, { client });
  assert.equal(createdBlock._id, "3");

  const noChangeBlock = await repository.updateBlock(3, {}, { client });
  assert.equal(noChangeBlock._id, "3");

  const updatedBlock = await repository.updateBlock(3, {
    locationId: 4,
    serviceId: null,
    weekday: 3,
    startsAt: "10:00:00",
    endsAt: "18:00:00",
    capacity: 6,
    isActive: false,
    notes: ""
  }, { client });
  assert.equal(updatedBlock.locationId, "4");
  assert.equal(updatedBlock.isActive, false);

  await repository.deleteBlock(3, { client });

  const createdException = await repository.createException({
    tenantId: 2,
    locationId: 3,
    serviceId: null,
    exceptionDate: "2026-07-15",
    isAvailable: true,
    capacity: null,
    reason: ""
  }, { client });
  assert.equal(createdException._id, "4");

  const updatedException = await repository.updateException(4, {
    locationId: 4,
    serviceId: 6,
    exceptionDate: "2026-07-16",
    startsAt: "12:00:00",
    endsAt: "13:30:00",
    isAvailable: false,
    capacity: 0,
    reason: ""
  }, { client });
  assert.equal(updatedException.locationId, "4");
  assert.equal(updatedException.reason, "Lunch");

  await repository.deleteException(4, { client });

  assert.equal(calls.length > 0, true);
  assert.ok(calls.some((call) => call.query.includes("DELETE FROM vendor_availability_blocks")));
});
