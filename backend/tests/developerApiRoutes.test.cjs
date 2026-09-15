const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");
const router = require("../src/routes/developerApiRoutes");
const developerProjects = require("../src/repositories/developerProjects");
const tenantRepository = require("../src/repositories/tenants");
const storeLocationRepository = require("../src/repositories/storeLocations");
const ticketRepository = require("../src/repositories/tickets");
const queueService = require("../src/services/queueService");
const entitlementAdmissionService = require("../src/services/entitlementAdmissionService");
const storeHoursService = require("../src/services/storeHoursService");
const idempotencyService = require("../src/services/idempotencyService");
const idempotencyRepository = require("../src/repositories/idempotency");

async function startServer() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.context = { correlationId: "test-correlation-123" };
    next();
  });
  app.use("/v1", router);
  app.use((error, _req, res, _next) => {
    res.status(error.statusCode || 500).json({ error: error.code || "INTERNAL_ERROR", message: error.message });
  });
  const server = await new Promise((resolve) => {
    const nextServer = app.listen(0, "127.0.0.1", () => resolve(nextServer));
  });
  return {
    server,
    baseUrl: `http://127.0.0.1:${server.address().port}/v1`
  };
}

function requestJsonMethod(method, url, host, headers = {}, payload) {
  return new Promise((resolve, reject) => {
    const body = payload === undefined ? "" : JSON.stringify(payload);
    const request = http.request(url, {
      method,
      headers: {
        host,
        ...(payload === undefined ? {} : { "content-type": "application/json", "content-length": Buffer.byteLength(body) }),
        ...headers
      }
    }, (response) => {
      let responseBody = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { responseBody += chunk; });
      response.on("end", () => resolve({
        status: response.statusCode,
        headers: { get: (name) => response.headers[String(name).toLowerCase()] },
        body: JSON.parse(responseBody)
      }));
    });
    request.on("error", reject);
    if (body) request.write(body);
    request.end();
  });
}

function requestJson(url, host, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, { headers: { host, ...headers } }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => resolve({
        status: response.statusCode,
        headers: { get: (name) => response.headers[String(name).toLowerCase()] },
        body: JSON.parse(body)
      }));
    });
    request.on("error", reject);
  });
}

function buildDeveloperApiKey({ id, scopes }) {
  return {
    id,
    projectId: "project-1",
    environment: "sandbox",
    scopes,
    createdByUserId: "user-1",
    status: "active",
    projectStatus: "active",
    accountStatus: "active"
  };
}

test("developer API metadata identifies the production environment", async () => {
  const { server, baseUrl } = await startServer();
  try {
    const { status, headers, body } = await requestJson(`${baseUrl}/`, "api.getprio.online");

    assert.equal(status, 200);
    assert.equal(headers.get("x-api-version"), "v1");
    assert.equal(headers.get("cache-control"), "no-store");
    assert.deepEqual(body, {
      data: {
        service: "getprio-queue-api",
        version: "v1",
        environment: "production",
        base_url: "https://api.getprio.online/v1",
        documentation_url: "https://developers.getprio.online"
      },
      request_id: "test-correlation-123"
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("developer API health identifies the sandbox environment", async () => {
  const { server, baseUrl } = await startServer();
  try {
    const { status, body } = await requestJson(`${baseUrl}/health`, "sandbox-api.getprio.online");

    assert.equal(status, 200);
    assert.deepEqual(body, {
      data: {
        status: "ok",
        service: "getprio-queue-api",
        version: "v1",
        environment: "sandbox"
      },
      request_id: "test-correlation-123"
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("developer API metadata does not claim an environment for an unknown host", async () => {
  const { server, baseUrl } = await startServer();
  try {
    const { status, body } = await requestJson(`${baseUrl}/`, "localhost");

    assert.equal(status, 200);
    assert.equal(body.data.environment, "unknown");
    assert.equal(body.data.base_url, null);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("developer API publishes its OpenAPI document", async () => {
  const { server, baseUrl } = await startServer();
  try {
    const { status, headers, body } = await requestJson(`${baseUrl}/openapi.json`, "api.getprio.online");

    assert.equal(status, 200);
    assert.match(headers.get("content-type"), /application\/json/);
    assert.equal(headers.get("cache-control"), "public, max-age=300");
    assert.equal(body.openapi, "3.1.0");
    assert.deepEqual(body.servers.map((server) => server.url), [
      "https://api.getprio.online/v1",
      "https://sandbox-api.getprio.online/v1"
    ]);
    assert.ok(body.paths["/"].get);
    assert.ok(body.paths["/health"].get);
    assert.ok(body.paths["/queues/{tenantSlug}"].get.security);
    assert.ok(body.paths["/queues/{tenantSlug}/locations"].get.security);
    assert.ok(body.paths["/queues/{tenantSlug}/locations/{locationSlug}"].get.security);
    assert.ok(body.paths["/queues/{tenantSlug}/stream"].get.security);
    assert.ok(body.paths["/queues/{tenantSlug}/tickets"].post.security);
    assert.ok(body.paths["/queues/{tenantSlug}/tickets"].post.requestBody);
    assert.ok(body.paths["/queues/{tenantSlug}/tickets/{ticketId}"].get.security);
    assert.ok(body.paths["/queues/{tenantSlug}/call-next"].post.security);
    assert.ok(body.paths["/queues/{tenantSlug}/locations/{locationSlug}/call-next"].post.security);
    assert.ok(body.paths["/queues/{tenantSlug}/current/serve"].post.security);
    assert.ok(body.paths["/queues/{tenantSlug}/locations/{locationSlug}/current/serve"].post.security);
    assert.ok(body.paths["/queues/{tenantSlug}/current/skip"].post.security);
    assert.ok(body.paths["/queues/{tenantSlug}/locations/{locationSlug}/current/skip"].post.security);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("developer API returns a public-safe queue snapshot for a scoped API key", async () => {
  const originals = {
    findApiKeyByHash: developerProjects.findApiKeyByHash,
    touchApiKey: developerProjects.touchApiKey,
    findTenantBySlug: tenantRepository.findTenantBySlug,
    listLocationsByTenantId: storeLocationRepository.listLocationsByTenantId,
    findPrimaryLocationByTenantId: storeLocationRepository.findPrimaryLocationByTenantId,
    getQueueSnapshot: queueService.getQueueSnapshot
  };
  developerProjects.findApiKeyByHash = async () => ({
    id: "key-1",
    projectId: "project-1",
    environment: "sandbox",
    scopes: ["queues:read"],
    status: "active",
    projectStatus: "active",
    accountStatus: "active"
  });
  developerProjects.touchApiKey = async () => {};
  tenantRepository.findTenantBySlug = async () => ({ _id: "tenant-1", slug: "harbor", isActive: true });
  storeLocationRepository.listLocationsByTenantId = async () => ([
    { _id: "location-1", name: "Main", slug: "main", city: "Manila", isPrimary: true, isActive: true },
    { _id: "location-2", name: "Closed", slug: "closed", isPrimary: false, isActive: false }
  ]);
  storeLocationRepository.findPrimaryLocationByTenantId = async () => ({ _id: "location-1", slug: "main", isActive: true });
  queueService.getQueueSnapshot = async () => ({
    tenant: { id: "tenant-1", slug: "harbor", name: "Harbor Services" },
    location: { id: "location-1", slug: "main" },
    queueDay: { isClosed: false },
    queueIntake: { state: "open" },
    stats: { waitingCount: 1 },
    current: { id: "ticket-1", ticketNumber: "A-001", customerName: "Secret Name", lookupCode: "HIDDEN" },
    nextUp: [{ id: "ticket-2", ticketNumber: "A-002", customerDisplayName: "Private Name" }],
    overflow: []
  });

  const { server, baseUrl } = await startServer();
  try {
    const { status, body } = await requestJson(
      `${baseUrl}/queues/harbor`,
      "sandbox-api.getprio.online",
      { "x-api-key": "gpk_sbx_test" }
    );
    assert.equal(status, 200);
    assert.deepEqual(body.data.stats, { waitingCount: 1 });
    assert.equal(body.data.current.customerName, undefined);
    assert.equal(body.data.current.lookupCode, undefined);
    assert.equal(body.data.next_up[0].customerDisplayName, undefined);

    const locations = await requestJson(
      `${baseUrl}/queues/harbor/locations`,
      "sandbox-api.getprio.online",
      { "x-api-key": "gpk_sbx_test" }
    );
    assert.equal(locations.status, 200);
    assert.deepEqual(locations.body.data.locations.map((location) => location.slug), ["main"]);
    assert.equal(locations.body.data.locations[0].contactEmail, undefined);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    Object.assign(developerProjects, { findApiKeyByHash: originals.findApiKeyByHash, touchApiKey: originals.touchApiKey });
    Object.assign(tenantRepository, { findTenantBySlug: originals.findTenantBySlug });
    Object.assign(storeLocationRepository, { findPrimaryLocationByTenantId: originals.findPrimaryLocationByTenantId });
    Object.assign(storeLocationRepository, { listLocationsByTenantId: originals.listLocationsByTenantId });
    Object.assign(queueService, { getQueueSnapshot: originals.getQueueSnapshot });
  }
});

test("developer API rejects queue access without a key", async () => {
  const { server, baseUrl } = await startServer();
  try {
    const { status, body } = await requestJson(
      `${baseUrl}/queues/harbor`,
      "sandbox-api.getprio.online"
    );
    assert.equal(status, 401);
    assert.equal(body.error, "API_KEY_REQUIRED");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("developer API rejects queue streams without a key", async () => {
  const { server, baseUrl } = await startServer();
  try {
    const { status, body } = await requestJson(
      `${baseUrl}/queues/harbor/stream`,
      "sandbox-api.getprio.online"
    );
    assert.equal(status, 401);
    assert.equal(body.error, "API_KEY_REQUIRED");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("developer API issues a ticket with a queues:write key", async () => {
  const originals = {
    findApiKeyByHash: developerProjects.findApiKeyByHash,
    touchApiKey: developerProjects.touchApiKey,
    findTenantBySlug: tenantRepository.findTenantBySlug,
    findPrimaryLocationByTenantId: storeLocationRepository.findPrimaryLocationByTenantId,
    createTicket: queueService.createTicket,
    admit: entitlementAdmissionService.admit,
    assertLocationOpenForCustomerJoin: storeHoursService.assertLocationOpenForCustomerJoin,
    claim: idempotencyService.claim,
    complete: idempotencyRepository.complete,
    fail: idempotencyRepository.fail
  };
  developerProjects.findApiKeyByHash = async () => buildDeveloperApiKey({ id: "key-write", scopes: ["queues:write"] });
  developerProjects.touchApiKey = async () => {};
  tenantRepository.findTenantBySlug = async () => ({ _id: "tenant-1", slug: "harbor", name: "Harbor Services" });
  storeLocationRepository.findPrimaryLocationByTenantId = async () => ({ _id: "location-1", slug: "main", isActive: true });
  entitlementAdmissionService.admit = async () => {};
  storeHoursService.assertLocationOpenForCustomerJoin = async () => {};
  idempotencyService.claim = async () => ({ state: "claimed", record: { id: 1 } });
  idempotencyRepository.complete = async () => {};
  idempotencyRepository.fail = async () => {};
  queueService.createTicket = async (input) => {
    assert.equal(input.joinChannel, "vendor");
    assert.equal(input.actorRole, "developer_api");
    return {
      ticket: { _id: 42, ticketNumber: "A-042", lookupCode: "AB12CD34", status: "waiting", dateKey: "20260915", createdAt: "2026-09-15T06:00:00.000Z" },
      snapshot: { tenant: {}, location: {}, queueDay: {}, queueIntake: {}, stats: {}, current: null, nextUp: [], overflow: [] }
    };
  };

  const { server, baseUrl } = await startServer();
  try {
    const result = await requestJsonMethod("POST", `${baseUrl}/queues/harbor/tickets`, "sandbox-api.getprio.online", { "x-api-key": "gpk_sbx_write", "Idempotency-Key": "ticket-issue-ada-1" }, { customerName: "Ada Lovelace" });
    assert.equal(result.status, 201);
    assert.equal(result.body.request_id, "test-correlation-123");
    assert.deepEqual(result.body.data.ticket, {
      id: "42",
      ticket_number: "A-042",
      lookup_code: "AB12CD34",
      status: "waiting",
      location_id: "location-1",
      queue_date_key: "20260915",
      created_at: "2026-09-15T06:00:00.000Z"
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    Object.assign(developerProjects, { findApiKeyByHash: originals.findApiKeyByHash, touchApiKey: originals.touchApiKey });
    Object.assign(tenantRepository, { findTenantBySlug: originals.findTenantBySlug });
    Object.assign(storeLocationRepository, { findPrimaryLocationByTenantId: originals.findPrimaryLocationByTenantId });
    Object.assign(queueService, { createTicket: originals.createTicket });
    Object.assign(entitlementAdmissionService, { admit: originals.admit });
    Object.assign(storeHoursService, { assertLocationOpenForCustomerJoin: originals.assertLocationOpenForCustomerJoin });
    Object.assign(idempotencyService, { claim: originals.claim });
    Object.assign(idempotencyRepository, { complete: originals.complete, fail: originals.fail });
  }
});

test("developer API returns a scoped ticket status without customer details", async () => {
  const originals = {
    findApiKeyByHash: developerProjects.findApiKeyByHash,
    touchApiKey: developerProjects.touchApiKey,
    findTenantBySlug: tenantRepository.findTenantBySlug,
    findPrimaryLocationByTenantId: storeLocationRepository.findPrimaryLocationByTenantId,
    findTicketById: ticketRepository.findTicketById
  };
  developerProjects.findApiKeyByHash = async () => ({
    id: "key-read",
    projectId: "project-1",
    environment: "sandbox",
    scopes: ["queues:read"],
    status: "active",
    projectStatus: "active",
    accountStatus: "active"
  });
  developerProjects.touchApiKey = async () => {};
  tenantRepository.findTenantBySlug = async () => ({ _id: "tenant-1", slug: "harbor", name: "Harbor Services" });
  storeLocationRepository.findPrimaryLocationByTenantId = async () => ({ _id: "location-1", slug: "main", isActive: true });
  ticketRepository.findTicketById = async () => ({
    _id: "42",
    tenantId: "tenant-1",
    locationId: "location-1",
    ticketNumber: "A-042",
    lookupCode: "PRIVATE",
    customerName: "Secret Name",
    customerEmail: "secret@example.com",
    status: "waiting",
    joinChannel: "vendor",
    servicePriorityBand: "normal",
    statusReason: null,
    calledAt: null,
    servedAt: null,
    skippedAt: null,
    cancelledAt: null,
    unservedAt: null,
    terminalAt: null,
    dateKey: "20260915",
    createdAt: "2026-09-15T06:00:00.000Z",
    updatedAt: "2026-09-15T06:00:00.000Z"
  });

  const { server, baseUrl } = await startServer();
  try {
    const result = await requestJson(`${baseUrl}/queues/harbor/tickets/42`, "sandbox-api.getprio.online", { "x-api-key": "gpk_sbx_read" });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body.data.ticket, {
      id: "42",
      ticket_number: "A-042",
      status: "waiting",
      location_id: "location-1",
      queue_date_key: "20260915",
      join_channel: "vendor",
      service_priority_band: "normal",
      status_reason: null,
      called_at: null,
      served_at: null,
      skipped_at: null,
      cancelled_at: null,
      unserved_at: null,
      terminal_at: null,
      created_at: "2026-09-15T06:00:00.000Z",
      updated_at: "2026-09-15T06:00:00.000Z"
    });
    assert.equal(result.body.data.ticket.lookup_code, undefined);
    assert.equal(result.body.data.ticket.customerEmail, undefined);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    Object.assign(developerProjects, { findApiKeyByHash: originals.findApiKeyByHash, touchApiKey: originals.touchApiKey });
    Object.assign(tenantRepository, { findTenantBySlug: originals.findTenantBySlug });
    Object.assign(storeLocationRepository, { findPrimaryLocationByTenantId: originals.findPrimaryLocationByTenantId });
    Object.assign(ticketRepository, { findTicketById: originals.findTicketById });
  }
});

test("developer API calls the next waiting ticket with idempotency", async () => {
  const originalFindApiKeyByHash = developerProjects.findApiKeyByHash;
  const originalTouchApiKey = developerProjects.touchApiKey;
  const originalFindTenantBySlug = tenantRepository.findTenantBySlug;
  const originalFindPrimaryLocationByTenantId = storeLocationRepository.findPrimaryLocationByTenantId;
  const originalCallNextTicket = queueService.callNextTicket;
  const originalClaim = idempotencyService.claim;
  const originalComplete = idempotencyRepository.complete;
  const originalFail = idempotencyRepository.fail;
  developerProjects.findApiKeyByHash = async () => buildDeveloperApiKey({ id: "key-write", scopes: ["queues:write"] });
  developerProjects.touchApiKey = async () => {};
  tenantRepository.findTenantBySlug = async () => ({ _id: "tenant-1", slug: "harbor", name: "Harbor Services" });
  storeLocationRepository.findPrimaryLocationByTenantId = async () => ({ _id: "location-1", slug: "main", isActive: true });
  idempotencyService.claim = async (input) => {
    assert.equal(input.key, "call-next-ada-1");
    return { state: "claimed", record: { id: 2 } };
  };
  idempotencyRepository.complete = async (recordId, statusCode, body) => {
    assert.equal(recordId, 2);
    assert.equal(statusCode, 200);
    assert.equal(body.data.ticket.id, "42");
  };
  idempotencyRepository.fail = async () => {};
  queueService.callNextTicket = async (tenant, options) => {
    assert.equal(tenant._id, "tenant-1");
    assert.equal(options.location._id, "location-1");
    assert.equal(options.actorRole, "developer_api");
    assert.equal(options.source, "developer_api");
    return {
      ticket: {
        _id: 42,
        tenantId: "tenant-1",
        locationId: "location-1",
        ticketNumber: "A-042",
        lookupCode: "PRIVATE",
        customerName: "Secret Name",
        status: "called",
        joinChannel: "vendor",
        servicePriorityBand: "normal",
        statusReason: null,
        calledAt: "2026-09-15T06:05:00.000Z",
        servedAt: null,
        skippedAt: null,
        cancelledAt: null,
        unservedAt: null,
        terminalAt: null,
        dateKey: "20260915",
        createdAt: "2026-09-15T06:00:00.000Z",
        updatedAt: "2026-09-15T06:05:00.000Z"
      }
    };
  };

  const { server, baseUrl } = await startServer();
  try {
    const result = await requestJsonMethod(
      "POST",
      `${baseUrl}/queues/harbor/call-next`,
      "sandbox-api.getprio.online",
      { "x-api-key": "gpk_sbx_write", "Idempotency-Key": "call-next-ada-1" },
      {}
    );
    assert.equal(result.status, 200);
    assert.deepEqual(result.body.data.ticket, {
      id: "42",
      ticket_number: "A-042",
      status: "called",
      location_id: "location-1",
      queue_date_key: "20260915",
      join_channel: "vendor",
      service_priority_band: "normal",
      status_reason: null,
      called_at: "2026-09-15T06:05:00.000Z",
      served_at: null,
      skipped_at: null,
      cancelled_at: null,
      unserved_at: null,
      terminal_at: null,
      created_at: "2026-09-15T06:00:00.000Z",
      updated_at: "2026-09-15T06:05:00.000Z"
    });
    assert.equal(result.body.data.ticket.lookup_code, undefined);
    assert.equal(result.body.data.ticket.customerName, undefined);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    developerProjects.findApiKeyByHash = originalFindApiKeyByHash;
    developerProjects.touchApiKey = originalTouchApiKey;
    tenantRepository.findTenantBySlug = originalFindTenantBySlug;
    storeLocationRepository.findPrimaryLocationByTenantId = originalFindPrimaryLocationByTenantId;
    queueService.callNextTicket = originalCallNextTicket;
    idempotencyService.claim = originalClaim;
    idempotencyRepository.complete = originalComplete;
    idempotencyRepository.fail = originalFail;
  }
});

test("developer API resolves the current ticket through serve and skip actions", async () => {
  const originalFindApiKeyByHash = developerProjects.findApiKeyByHash;
  const originalTouchApiKey = developerProjects.touchApiKey;
  const originalFindTenantBySlug = tenantRepository.findTenantBySlug;
  const originalFindPrimaryLocationByTenantId = storeLocationRepository.findPrimaryLocationByTenantId;
  const originalUpdateCurrentTicketStatus = queueService.updateCurrentTicketStatus;
  const originalClaim = idempotencyService.claim;
  const originalComplete = idempotencyRepository.complete;
  const originalFail = idempotencyRepository.fail;
  const completedStatuses = [];
  developerProjects.findApiKeyByHash = async () => buildDeveloperApiKey({ id: "key-write", scopes: ["queues:write"] });
  developerProjects.touchApiKey = async () => {};
  tenantRepository.findTenantBySlug = async () => ({ _id: "tenant-1", slug: "harbor", name: "Harbor Services" });
  storeLocationRepository.findPrimaryLocationByTenantId = async () => ({ _id: "location-1", slug: "main", isActive: true });
  idempotencyService.claim = async ({ key }) => ({ state: "claimed", record: { id: key } });
  idempotencyRepository.complete = async (_recordId, statusCode, body) => {
    assert.equal(statusCode, 200);
    completedStatuses.push(body.data.ticket.status);
  };
  idempotencyRepository.fail = async () => {};
  queueService.updateCurrentTicketStatus = async (tenant, status, options) => {
    assert.equal(tenant._id, "tenant-1");
    assert.equal(options.location._id, "location-1");
    assert.equal(options.actorRole, "developer_api");
    return {
      ticket: {
        _id: 42,
        tenantId: "tenant-1",
        locationId: "location-1",
        ticketNumber: "A-042",
        status,
        joinChannel: "vendor",
        servicePriorityBand: "normal",
        statusReason: null,
        calledAt: "2026-09-15T06:05:00.000Z",
        servedAt: status === "served" ? "2026-09-15T06:06:00.000Z" : null,
        skippedAt: status === "skipped" ? "2026-09-15T06:06:00.000Z" : null,
        cancelledAt: null,
        unservedAt: null,
        terminalAt: status === "served" ? "2026-09-15T06:06:00.000Z" : null,
        dateKey: "20260915",
        createdAt: "2026-09-15T06:00:00.000Z",
        updatedAt: "2026-09-15T06:06:00.000Z"
      }
    };
  };

  const { server, baseUrl } = await startServer();
  try {
    for (const status of ["serve", "skip"]) {
      const result = await requestJsonMethod(
        "POST",
        `${baseUrl}/queues/harbor/current/${status}`,
        "sandbox-api.getprio.online",
        { "x-api-key": "gpk_sbx_write", "Idempotency-Key": `resolve-${status}-1` },
        {}
      );
      assert.equal(result.status, 200);
      assert.equal(result.body.data.ticket.status, status === "serve" ? "served" : "skipped");
      assert.equal(result.body.data.ticket.ticket_number, "A-042");
    }
    assert.deepEqual(completedStatuses, ["served", "skipped"]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    developerProjects.findApiKeyByHash = originalFindApiKeyByHash;
    developerProjects.touchApiKey = originalTouchApiKey;
    tenantRepository.findTenantBySlug = originalFindTenantBySlug;
    storeLocationRepository.findPrimaryLocationByTenantId = originalFindPrimaryLocationByTenantId;
    queueService.updateCurrentTicketStatus = originalUpdateCurrentTicketStatus;
    idempotencyService.claim = originalClaim;
    idempotencyRepository.complete = originalComplete;
    idempotencyRepository.fail = originalFail;
  }
});
