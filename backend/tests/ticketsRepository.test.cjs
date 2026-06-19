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
      const cacheKeys = new Set([
        resolvedDependency,
        resolvedDependency.replace(/\.ts$/, ""),
        resolvedDependency.replace(/\.js$/, ""),
        `${resolvedDependency}.js`,
        `${resolvedDependency}.ts`
      ]);

      for (const cacheKey of cacheKeys) {
        originals.set(cacheKey, require.cache[cacheKey]);
        require.cache[cacheKey] = {
          id: cacheKey,
          filename: cacheKey,
          loaded: true,
          exports: mockExports
        };
      }
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

function createQueryClient(rows = []) {
  const calls = [];

  return {
    calls,
    client: {
      query: async (query, params) => {
        calls.push({ query, params });
        return { rows };
      }
    }
  };
}

test("tickets repository orders waiting tickets by carry-over, recovery, then normal", async () => {
  const { calls, client } = createQueryClient();
  const ticketsRepository = requireWithMocks("../src/repositories/tickets.js", {
    "../config/db": { pool: client }
  });

  await ticketsRepository.listWaitingTickets(1, {
    client,
    locationId: 2,
    dateKey: "20260606",
    limit: 5
  });

  assert.equal(calls.length, 1);
  assert.match(
    calls[0].query,
    /ORDER BY CASE service_priority_band WHEN 'carry_over' THEN 0 WHEN 'recovery' THEN 1 ELSE 2 END ASC, carry_over_count DESC, created_at ASC/
  );
  assert.deepEqual(calls[0].params, [1, 2, "20260606", 5]);
});

test("tickets repository applies carried-over filters for overflow and history views", async () => {
  const { calls, client } = createQueryClient();
  const ticketsRepository = requireWithMocks("../src/repositories/tickets.js", {
    "../config/db": { pool: client }
  });

  await ticketsRepository.listWaitingTickets(1, {
    client,
    locationId: 2,
    dateKey: "20260607",
    onlyCarriedOver: true
  });

  await ticketsRepository.listWaitingTickets(1, {
    client,
    locationId: 2,
    dateKey: "20260607",
    excludeCarriedOver: true
  });

  assert.match(calls[0].query, /AND \(carried_over_at IS NOT NULL OR COALESCE\(carry_over_count, 0\) > 0\)/);
  assert.match(calls[1].query, /AND carried_over_at IS NULL AND COALESCE\(carry_over_count, 0\) = 0/);
});

test("tickets repository restores skipped tickets into the requested priority band", async () => {
  const { calls, client } = createQueryClient([
    {
      id: 7,
      tenant_id: 1,
      location_id: 2,
      user_id: null,
      service_counter_id: null,
      ticket_number: "P007",
      sequence: 7,
      date_key: "20260606",
      queue_date_key: "20260606",
      lookup_code: "ABC123",
      customer_name: "Pat",
      customer_email: "pat@example.com",
      customer_phone: "09170000000",
      notify_by_email: true,
      notify_by_sms: false,
      join_channel: "online",
      status: "waiting",
      notes: null,
      notified_almost_there_at: null,
      notified_called_at: null,
      called_at: null,
      served_at: null,
      skipped_at: null,
      cancelled_at: null,
      unserved_at: null,
      carried_over_at: null,
      carry_over_count: 0,
      service_priority_band: "recovery",
      rejoin_deadline_at: null,
      created_at: new Date("2026-06-06T02:00:00.000Z"),
      updated_at: new Date("2026-06-06T02:00:00.000Z")
    }
  ]);
  const ticketsRepository = requireWithMocks("../src/repositories/tickets.js", {
    "../config/db": { pool: client }
  });

  await ticketsRepository.restoreSkippedTicket(1, 7, {
    client,
    locationId: 2
  });
  await ticketsRepository.restoreSkippedTicket(1, 7, {
    client,
    locationId: 2,
    servicePriorityBand: "normal"
  });

  assert.equal(calls.length, 2);
  assert.match(calls[0].query, /service_priority_band = \$4/);
  assert.deepEqual(calls[0].params, [1, 2, 7, "recovery"]);
  assert.deepEqual(calls[1].params, [1, 2, 7, "normal"]);
});
