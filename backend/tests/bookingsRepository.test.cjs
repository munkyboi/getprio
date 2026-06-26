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
      // Try next candidate.
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

test("vendor booking list orders incoming requests by newest created date", async () => {
  const calls = [];
  const bookingsRepository = requireWithMocks("../src/repositories/bookings.js", {
    "../config/db": {
      pool: {
        query: async (query, params) => {
          calls.push({ query, params });
          if (/SELECT COUNT\(\*\)/.test(query)) {
            return { rows: [{ count: 0 }] };
          }
          return { rows: [] };
        }
      }
    }
  });

  const result = await bookingsRepository.listBookingsForTenant(1, {
    locationId: 2,
    limit: 100
  });

  assert.equal(calls.length, 2);
  assert.match(calls[0].query, /SELECT COUNT\(\*\)/);
  assert.deepEqual(calls[0].params, [1, 2]);

  assert.match(
    calls[1].query,
    /ORDER BY\s+bookings\.created_at DESC,\s+bookings\.id DESC\s+LIMIT \$3 OFFSET \$4/s
  );
  assert.deepEqual(calls[1].params, [1, 2, 100, 0]);
  assert.deepEqual(result.bookings, []);
  assert.equal(result.totalItems, 0);
});

test("vendor booking list applies search filters and timezone-aware scheduled date filters", async () => {
  const calls = [];
  const bookingsRepository = requireWithMocks("../src/repositories/bookings.js", {
    "../config/db": {
      pool: {
        query: async (query, params) => {
          calls.push({ query, params });
          if (/SELECT COUNT\(\*\)/.test(query)) {
            return { rows: [{ count: 42 }] };
          }
          return { rows: [] };
        }
      }
    }
  });

  const result = await bookingsRepository.listBookingsForTenant(1, {
    locationId: 2,
    page: 2,
    pageSize: 15,
    status: "confirmed",
    scheduledDate: "2026-06-25",
    search: "Alice"
  });

  assert.equal(calls.length, 2);

  assert.match(calls[0].query, /SELECT COUNT\(\*\)/);
  assert.match(
    calls[0].query,
    /\(bookings\.scheduled_start_at AT TIME ZONE store_locations\.timezone\)::date = \$4::date/
  );
  assert.match(calls[0].query, /bookings\.customer_name ILIKE \$5/);
  assert.deepEqual(calls[0].params, [1, 2, "confirmed", "2026-06-25", "%Alice%"]);

  assert.match(
    calls[1].query,
    /LIMIT \$6 OFFSET \$7/
  );
  assert.deepEqual(calls[1].params, [1, 2, "confirmed", "2026-06-25", "%Alice%", 15, 15]);
  assert.equal(result.totalItems, 42);
});

test("pending booking expiration excludes bookings with submitted payment proof", async () => {
  const calls = [];
  const bookingsRepository = requireWithMocks("../src/repositories/bookings.js", {
    "../config/db": {
      pool: {
        query: async (query, params) => {
          calls.push({ query, params });
          return { rows: [{ id: 123 }] };
        }
      }
    }
  });

  const expiredIds = await bookingsRepository.expirePendingBookings({
    tenantId: 1,
    now: "2026-06-23T07:00:00.000Z",
    reason: "Expired after pending booking window."
  });

  assert.deepEqual(expiredIds, ["123"]);
  assert.equal(calls.length, 1);
  assert.match(calls[0].query, /status = 'pending'/);
  assert.match(calls[0].query, /payment_proof_object_key IS NULL/);
  assert.match(calls[0].query, /tenant_id = \$3/);
  assert.deepEqual(calls[0].params, [
    "2026-06-23T07:00:00.000Z",
    "Expired after pending booking window.",
    1
  ]);
});
