const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");
const router = require("../src/routes/developerApiRoutes");
const db = require("../src/config/db");
const developerProjects = require("../src/repositories/developerProjects");
const developerQueues = require("../src/repositories/developerQueues");
const developerApiOperations = require("../src/repositories/developerApiOperations");
const developerWebhookService = require("../src/services/developerWebhookService");
const pushNotificationService = require("../src/services/pushNotificationService");
const developerApiRateLimits = require("../src/repositories/developerApiRateLimits");

async function startServer() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.context = { correlationId: "test-correlation-123" }; next(); });
  app.use("/v1", router);
  app.use((err, _req, res, _next) => res.status(err.statusCode || 500).json({ error: err.code || "INTERNAL_ERROR", message: err.message }));
  const server = await new Promise((resolve) => { const next = app.listen(0, "127.0.0.1", () => resolve(next)); });
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}/v1` };
}

function request(method, url, host, headers = {}, body) {
  return new Promise((resolve, reject) => {
    const encoded = body === undefined ? "" : JSON.stringify(body);
    const req = http.request(url, { method, headers: { host, ...headers, ...(body === undefined ? {} : { "content-type": "application/json", "content-length": Buffer.byteLength(encoded) }) } }, (res) => {
      let response = ""; res.setEncoding("utf8"); res.on("data", (chunk) => { response += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(response) }));
    });
    req.on("error", reject); if (encoded) req.write(encoded); req.end();
  });
}

function key(scopes) {
  return { id: "key-1", projectId: "project-1", environment: "sandbox", scopes, createdByUserId: "1", status: "active", projectStatus: "active", accountStatus: "active" };
}
function profile() { return { id: "profile-1", projectId: "project-1", environment: "sandbox", slug: "harbor", displayName: "Harbor Services", directoryStatus: "private", directoryContent: {}, createdAt: "2026-09-15T00:00:00.000Z", updatedAt: "2026-09-15T00:00:00.000Z" }; }
function queue() { return { id: "queue-1", profileId: "profile-1", slug: "main", displayName: "Main queue", sessionState: "open", intakeEnabled: true, joiningEnabled: false, priorityRatio: 3, resourceVersion: 1, createdAt: "2026-09-15T00:00:00.000Z", updatedAt: "2026-09-15T00:00:00.000Z" }; }
function ticket() { return { id: "ticket-1", projectId: "project-1", environment: "sandbox", profileId: "profile-1", queueId: "queue-1", queueSlug: "main", ticketNumber: "MAIN-0001", status: "waiting", externalReference: "customer-123", verificationCode: "AB12CD34", statusReason: null, resourceVersion: 1, createdAt: "2026-09-15T00:00:00.000Z", updatedAt: "2026-09-15T00:00:00.000Z", event: { id: "1", type: "ticket.issued", resourceVersion: 1, occurredAt: "2026-09-15T00:00:00.000Z" } }; }

function replace(object, name, value, originals) { originals.push([object, name, object[name]]); object[name] = value; }
function restore(originals) { for (const [object, name, value] of originals.reverse()) object[name] = value; }
function stubKey(originals, scopes) {
  replace(developerProjects, "findApiKeyByHash", async () => key(scopes), originals);
  replace(developerProjects, "touchApiKey", async () => {}, originals);
  replace(developerApiRateLimits, "consume", async () => ({ limit: 1000, remaining: 999, windowSeconds: 60 }), originals);
}

test("developer API metadata identifies sandbox and production hosts", async () => {
  const { server, baseUrl } = await startServer();
  try {
    const sandbox = await request("GET", `${baseUrl}/`, "sandbox-api.getprio.online");
    const production = await request("GET", `${baseUrl}/health`, "api.getprio.online");
    assert.equal(sandbox.status, 200); assert.equal(sandbox.body.data.environment, "sandbox");
    assert.equal(production.status, 200); assert.equal(production.body.data.environment, "production");
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test("developer API scopes queue reads to the calling key project and environment", async () => {
  const originals = []; const calls = [];
  stubKey(originals, ["queues:read"]);
  replace(developerQueues, "findProfile", async (...args) => { calls.push(args); return profile(); }, originals);
  replace(developerQueues, "findFirstQueue", async () => queue(), originals);
  replace(developerQueues, "queueSnapshot", async () => ({ queue: queue(), stats: { waitingCount: 1, calledCount: 0 }, current: null, nextUp: [ticket()], overflow: [] }), originals);
  const { server, baseUrl } = await startServer();
  try {
    const response = await request("GET", `${baseUrl}/queues/harbor`, "sandbox-api.getprio.online", { "x-api-key": "gpk_sbx_test" });
    assert.equal(response.status, 200); assert.deepEqual(calls[0], ["project-1", "sandbox", "harbor"]);
    assert.equal(response.body.data.profile.id, "profile-1"); assert.equal(response.body.data.next_up[0].external_reference, "customer-123");
  } finally { restore(originals); await new Promise((resolve) => server.close(resolve)); }
});

test("developer API returns not found when a profile belongs to another project", async () => {
  const originals = [];
  stubKey(originals, ["queues:read"]);
  replace(developerQueues, "findProfile", async (projectId, environment, profileSlug) => { assert.equal(projectId, "project-1"); assert.equal(environment, "sandbox"); assert.equal(profileSlug, "another-project"); return null; }, originals);
  const { server, baseUrl } = await startServer();
  try {
    const response = await request("GET", `${baseUrl}/queues/another-project`, "sandbox-api.getprio.online", { "x-api-key": "gpk_sbx_test" });
    assert.equal(response.status, 404); assert.equal(response.body.error, "API_RESOURCE_NOT_FOUND");
  } finally { restore(originals); await new Promise((resolve) => server.close(resolve)); }
});

test("developer API rejects customer contact fields at the machine boundary", async () => {
  const originals = []; stubKey(originals, ["queues:write"]);
  const { server, baseUrl } = await startServer();
  try {
    const response = await request("POST", `${baseUrl}/queues/harbor/tickets`, "sandbox-api.getprio.online", { "x-api-key": "gpk_sbx_test", "idempotency-key": "ticket-issue-1" }, { customer_name: "Not accepted" });
    assert.equal(response.status, 400); assert.equal(response.body.error, "INVALID_REQUEST");
  } finally { restore(originals); await new Promise((resolve) => server.close(resolve)); }
});

test("ticket issuance writes its idempotency response and webhook outbox in one transaction", async () => {
  const originals = []; const completed = []; const webhooks = [];
  stubKey(originals, ["queues:write"]);
  replace(developerQueues, "findProfile", async () => profile(), originals);
  replace(developerQueues, "findFirstQueue", async () => queue(), originals);
  replace(developerQueues, "issueTicket", async () => ticket(), originals);
  replace(db, "withTransaction", async (run) => run({ query: async () => ({ rows: [] }) }), originals);
  replace(developerApiOperations, "claim", async () => ({ state: "claimed", recordId: "operation-1" }), originals);
  replace(developerApiOperations, "complete", async (...args) => { completed.push(args); }, originals);
  replace(developerWebhookService, "enqueueDeveloperTicketEvent", async (...args) => { webhooks.push(args); }, originals);
  const { server, baseUrl } = await startServer();
  try {
    const response = await request("POST", `${baseUrl}/queues/harbor/tickets`, "sandbox-api.getprio.online", { "x-api-key": "gpk_sbx_test", "idempotency-key": "ticket-issue-1" }, { display_label: "Anonymous visitor", external_reference: "customer-123" });
    assert.equal(response.status, 201); assert.equal(response.body.data.ticket.id, "ticket-1");
    assert.equal(response.body.data.ticket.verification_code, "AB12CD34");
    assert.equal(completed.length, 1); assert.equal(webhooks.length, 1); assert.equal(response.body.data.ticket.event, undefined);
  } finally { restore(originals); await new Promise((resolve) => server.close(resolve)); }
});

test("sandbox Developer API lifecycle sends FCM using internal linked-user metadata", async () => {
  const originals = [];
  const pushes = [];
  stubKey(originals, ["queues:write"]);
  replace(developerQueues, "findProfile", async () => profile(), originals);
  replace(developerQueues, "findFirstQueue", async () => queue(), originals);
  replace(developerQueues, "callNextTicket", async () => ({
    ...ticket(),
    status: "called",
    linkedUserId: "42",
    ticketNumber: "QUEUE1-0009"
  }), originals);
  replace(db, "withTransaction", async (run) => run({ query: async () => ({ rows: [] }) }), originals);
  replace(developerApiOperations, "claim", async () => ({ state: "claimed", recordId: "operation-1" }), originals);
  replace(developerApiOperations, "complete", async () => {}, originals);
  replace(developerWebhookService, "enqueueDeveloperTicketEvent", async () => {}, originals);
  replace(pushNotificationService, "sendUserNotification", async (payload) => { pushes.push(payload); }, originals);
  const { server, baseUrl } = await startServer();
  try {
    const response = await request("POST", `${baseUrl}/queues/harbor/call-next`, "sandbox-api.getprio.online", { "x-api-key": "gpk_sbx_test", "idempotency-key": "call-next-1" });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(response.status, 200);
    assert.equal(response.body.data.ticket.linkedUserId, undefined);
    assert.equal(pushes.length, 1);
    assert.equal(pushes[0].userId, "42");
    assert.equal(pushes[0].title, "Harbor Services");
    assert.equal(pushes[0].body, "It's your turn. Please proceed to the counter.");
    assert.equal(pushes[0].environment, "sandbox");
    assert.equal(pushes[0].ticketRef, "QUEUE1-0009");
  } finally { restore(originals); await new Promise((resolve) => server.close(resolve)); }
});

test("sandbox Developer API waiting push uses the profile name and customer-friendly copy", async () => {
  const originals = [];
  const pushes = [];
  stubKey(originals, ["queues:write"]);
  replace(developerQueues, "findProfile", async () => profile(), originals);
  replace(developerQueues, "findFirstQueue", async () => queue(), originals);
  replace(developerQueues, "issueTicket", async () => ({
    ...ticket(),
    linkedUserId: "42",
    ticketNumber: "QUEUE1-0017"
  }), originals);
  replace(db, "withTransaction", async (run) => run({ query: async () => ({ rows: [] }) }), originals);
  replace(developerApiOperations, "claim", async () => ({ state: "claimed", recordId: "operation-3" }), originals);
  replace(developerApiOperations, "complete", async () => {}, originals);
  replace(developerWebhookService, "enqueueDeveloperTicketEvent", async () => {}, originals);
  replace(pushNotificationService, "sendUserNotification", async (payload) => { pushes.push(payload); }, originals);
  const { server, baseUrl } = await startServer();
  try {
    const response = await request("POST", `${baseUrl}/queues/harbor/tickets`, "sandbox-api.getprio.online", { "x-api-key": "gpk_sbx_test", "idempotency-key": "ticket-issue-2" }, { recipient_email: "customer@example.com" });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(response.status, 201);
    assert.equal(pushes.length, 1);
    assert.equal(pushes[0].title, "Harbor Services");
    assert.equal(pushes[0].body, "Your ticket QUEUE1-0017 is now in the queue.");
  } finally { restore(originals); await new Promise((resolve) => server.close(resolve)); }
});

test("sandbox Developer API ticket issuance sends an invitation push for an unlinked recipient", async () => {
  const originals = [];
  const pushes = [];
  stubKey(originals, ["queues:write"]);
  replace(developerQueues, "findProfile", async () => profile(), originals);
  replace(developerQueues, "findFirstQueue", async () => queue(), originals);
  replace(developerQueues, "issueTicket", async () => ({
    ...ticket(),
    linkedUserId: null,
    invitationUserId: "42",
    ticketNumber: "QUEUE1-0019"
  }), originals);
  replace(db, "withTransaction", async (run) => run({ query: async () => ({ rows: [] }) }), originals);
  replace(developerApiOperations, "claim", async () => ({ state: "claimed", recordId: "operation-4" }), originals);
  replace(developerApiOperations, "complete", async () => {}, originals);
  replace(developerWebhookService, "enqueueDeveloperTicketEvent", async () => {}, originals);
  replace(pushNotificationService, "sendUserNotification", async (payload) => { pushes.push(payload); }, originals);
  const { server, baseUrl } = await startServer();
  try {
    const response = await request("POST", `${baseUrl}/queues/harbor/tickets`, "sandbox-api.getprio.online", { "x-api-key": "gpk_sbx_test", "idempotency-key": "ticket-issue-4" }, { recipient_email: "customer@example.com" });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(response.status, 201);
    assert.equal(pushes.length, 1);
    assert.equal(pushes[0].userId, "42");
    assert.equal(pushes[0].title, "Harbor Services");
    assert.equal(pushes[0].body, "You have a new ticket from Harbor Services. Open GetPrio to review it.");
    assert.equal(pushes[0].eventType, "developer_ticket_invitation");
    assert.equal(pushes[0].route, "tickets");
  } finally { restore(originals); await new Promise((resolve) => server.close(resolve)); }
});

test("developer API confirms the current called ticket with its verification code", async () => {
  const originals = []; const webhooks = [];
  stubKey(originals, ["queues:write"]);
  replace(developerQueues, "findProfile", async () => profile(), originals);
  replace(developerQueues, "findFirstQueue", async () => queue(), originals);
  replace(developerQueues, "confirmCurrentTicket", async (input) => {
    assert.equal(input.projectId, "project-1");
    assert.equal(input.environment, "sandbox");
    assert.equal(input.verificationCode, "AB12CD34");
    return { ...ticket(), status: "called", customerConfirmedAt: "2026-09-15T00:05:00.000Z", event: { id: "2", type: "ticket.confirmed", resourceVersion: 2, occurredAt: "2026-09-15T00:05:00.000Z" } };
  }, originals);
  replace(db, "withTransaction", async (run) => run({ query: async () => ({ rows: [] }) }), originals);
  replace(developerApiOperations, "claim", async () => ({ state: "claimed", recordId: "operation-2" }), originals);
  replace(developerApiOperations, "complete", async () => {}, originals);
  replace(developerWebhookService, "enqueueDeveloperTicketEvent", async (...args) => { webhooks.push(args); }, originals);
  const { server, baseUrl } = await startServer();
  try {
    const response = await request("POST", `${baseUrl}/queues/harbor/current/confirm`, "sandbox-api.getprio.online", { "x-api-key": "gpk_sbx_test", "idempotency-key": "confirm-1" }, { verification_code: "ab12cd34" });
    assert.equal(response.status, 200);
    assert.equal(response.body.data.ticket.verification_code, "AB12CD34");
    assert.equal(response.body.data.ticket.customer_confirmed_at, "2026-09-15T00:05:00.000Z");
    assert.equal(webhooks.length, 1);
  } finally { restore(originals); await new Promise((resolve) => server.close(resolve)); }
});

test("developer API rejects malformed verification codes before confirming", async () => {
  const originals = []; let confirmed = false;
  stubKey(originals, ["queues:write"]);
  replace(developerQueues, "findProfile", async () => profile(), originals);
  replace(developerQueues, "findFirstQueue", async () => queue(), originals);
  replace(developerQueues, "confirmCurrentTicket", async () => { confirmed = true; return ticket(); }, originals);
  const { server, baseUrl } = await startServer();
  try {
    const response = await request("POST", `${baseUrl}/queues/harbor/current/confirm`, "sandbox-api.getprio.online", { "x-api-key": "gpk_sbx_test", "idempotency-key": "confirm-2" }, { verification_code: "not-a-code" });
    assert.equal(response.status, 400);
    assert.equal(response.body.error, "INVALID_REQUEST");
    assert.equal(confirmed, false);
  } finally { restore(originals); await new Promise((resolve) => server.close(resolve)); }
});

test("developer API replays a completed operation without issuing another ticket", async () => {
  const originals = []; stubKey(originals, ["queues:write"]);
  replace(developerQueues, "findProfile", async () => profile(), originals);
  replace(developerQueues, "findFirstQueue", async () => queue(), originals);
  replace(db, "withTransaction", async (run) => run({}), originals);
  replace(developerApiOperations, "claim", async () => ({ state: "replay", statusCode: 201, body: { data: { ticket: { id: "original-ticket" } }, request_id: "first-request" } }), originals);
  const { server, baseUrl } = await startServer();
  try {
    const response = await request("POST", `${baseUrl}/queues/harbor/tickets`, "sandbox-api.getprio.online", { "x-api-key": "gpk_sbx_test", "idempotency-key": "ticket-issue-1" }, { display_label: "Anonymous visitor" });
    assert.equal(response.status, 201); assert.equal(response.body.data.ticket.id, "original-ticket");
  } finally { restore(originals); await new Promise((resolve) => server.close(resolve)); }
});

test("developer API requires the new profile scope for profile resources", async () => {
  const originals = []; stubKey(originals, ["queues:read"]);
  const { server, baseUrl } = await startServer();
  try {
    const response = await request("GET", `${baseUrl}/profiles`, "sandbox-api.getprio.online", { "x-api-key": "gpk_sbx_test" });
    assert.equal(response.status, 403); assert.equal(response.body.error, "API_SCOPE_REQUIRED");
  } finally { restore(originals); await new Promise((resolve) => server.close(resolve)); }
});

test("developer API profile updates preserve the slug and create a directory draft", async () => {
  const originals = []; stubKey(originals, ["profiles:write"]);
  replace(developerQueues, "findProfile", async () => profile(), originals);
  replace(developerQueues, "updateProfile", async (_id, changes) => ({ ...profile(), ...changes }), originals);
  replace(db, "withTransaction", async (run) => run({ query: async () => ({ rows: [] }) }), originals);
  replace(developerApiOperations, "claim", async () => ({ state: "claimed", recordId: "operation-1" }), originals);
  replace(developerApiOperations, "complete", async () => {}, originals);
  const { server, baseUrl } = await startServer();
  try {
    const response = await request("PATCH", `${baseUrl}/profiles/harbor`, "sandbox-api.getprio.online", { "x-api-key": "gpk_sbx_test", "idempotency-key": "profile-update-1" }, { display_name: "Harbor Service Centre", directory_content: { description: "Public profile", website_url: "https://harbor.example" } });
    assert.equal(response.status, 200);
    assert.equal(response.body.data.profile.slug, "harbor");
    assert.equal(response.body.data.profile.directory_status, "draft");
    assert.equal(response.body.data.profile.directory_content.website_url, "https://harbor.example");
  } finally { restore(originals); await new Promise((resolve) => server.close(resolve)); }
});
