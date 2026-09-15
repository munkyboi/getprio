const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const http = require("node:http");
const jwt = require("jsonwebtoken");
const env = require("../src/config/env");
const authSessions = require("../src/repositories/authSessions");
const users = require("../src/repositories/users");
const developerAccounts = require("../src/repositories/developerAccounts");
const developerProjects = require("../src/repositories/developerProjects");
const developerWebhooks = require("../src/repositories/developerWebhooks");
const deliveries = require("../src/repositories/developerWebhookDeliveries");
const dispatcherModule = require("../src/services/developerWebhookDispatcher");
const securityEvents = require("../src/services/securityEventService");
const router = require("../src/routes/developerProjectRoutes");

const originals = {
  findSessionById: authSessions.findSessionById,
  touchSession: authSessions.touchSession,
  findUserById: users.findUserById,
  findMembershipByUserId: developerAccounts.findMembershipByUserId,
  findProjectForUser: developerProjects.findProjectForUser,
  listRegistrations: developerWebhooks.listRegistrations,
  findDelivery: deliveries.findDelivery,
  listDeliveries: deliveries.listDeliveries,
  recordManualAttempt: deliveries.recordManualAttempt,
  createDeveloperWebhookDispatcher: dispatcherModule.createDeveloperWebhookDispatcher,
  logSecurityEvent: securityEvents.logSecurityEvent
};

const project = { id: "project-1", name: "Demo", status: "active", accessRole: "owner", createdAt: "2026-09-15T00:00:00.000Z", updatedAt: "2026-09-15T00:00:00.000Z" };
const registration = { id: "webhook-1", projectId: project.id, environment: "sandbox", name: "Queue", url: "https://hooks.example.test/events", payloadVersion: 1, events: ["ticket.called"], status: "active", disabledAt: null, createdAt: project.createdAt, updatedAt: project.updatedAt };

function request(server, token, method, path) {
  return new Promise((resolve, reject) => {
    const req = http.request(`http://127.0.0.1:${server.address().port}${path}`, { method, headers: { authorization: `Bearer ${token}` } }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
    });
    req.on("error", reject);
    req.end();
  });
}

let server;
let token;
let currentDelivery;
let recorded;

test.before(async () => {
  authSessions.findSessionById = async () => ({ _id: "session-1", surface: "developer", status: "active", expiresAt: new Date(Date.now() + 60_000).toISOString(), inactivityExpiresAt: new Date(Date.now() + 60_000).toISOString() });
  authSessions.touchSession = async () => {};
  users.findUserById = async () => ({ _id: 7, name: "Developer", email: "developer@example.test" });
  developerAccounts.findMembershipByUserId = async () => ({ developerAccountId: "account-1", role: "owner", accountStatus: "active" });
  developerProjects.findProjectForUser = async () => project;
  developerWebhooks.listRegistrations = async () => [registration];
  deliveries.findDelivery = async () => currentDelivery;
  deliveries.listDeliveries = async () => [];
  deliveries.recordManualAttempt = async (_id, result) => { recorded = result; };
  dispatcherModule.createDeveloperWebhookDispatcher = () => ({
    deliver: async () => ({ status: 204 }),
    stop: async () => {}
  });
  securityEvents.logSecurityEvent = async () => {};
  const app = express();
  app.use(express.json());
  app.use("/api/developer", router);
  app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ code: error.code, message: error.message }));
  server = await new Promise((resolve) => { const nextServer = app.listen(0, "127.0.0.1", () => resolve(nextServer)); });
  token = jwt.sign({ sub: "7", surface: "developer", session_id: "session-1" }, env.jwtSecret);
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  Object.assign(authSessions, { findSessionById: originals.findSessionById, touchSession: originals.touchSession });
  users.findUserById = originals.findUserById;
  developerAccounts.findMembershipByUserId = originals.findMembershipByUserId;
  developerProjects.findProjectForUser = originals.findProjectForUser;
  developerWebhooks.listRegistrations = originals.listRegistrations;
  Object.assign(deliveries, { findDelivery: originals.findDelivery, listDeliveries: originals.listDeliveries, recordManualAttempt: originals.recordManualAttempt });
  dispatcherModule.createDeveloperWebhookDispatcher = originals.createDeveloperWebhookDispatcher;
  securityEvents.logSecurityEvent = originals.logSecurityEvent;
});

test("manual replay sends once and leaves automatic delivery state unchanged", async () => {
  currentDelivery = { id: "delivery-1", registrationId: registration.id, projectId: project.id, environment: "sandbox", eventId: "queue_event:7", eventType: "ticket.called", payloadVersion: 1, payloadBody: '{"type":"ticket.called"}', status: "failed", attemptCount: 2, expiresAt: new Date(Date.now() + 86_400_000).toISOString(), retryUntil: new Date(Date.now() + 3_600_000).toISOString(), registrationStatus: "active", manualAttemptCount: 0, lastManualAttemptAt: null, manualLastError: null, manualResponseStatus: null };
  recorded = null;
  const response = await request(server, token, "POST", `/api/developer/projects/${project.id}/webhooks/${registration.id}/deliveries/${currentDelivery.id}/replay`);
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.replay, { status: "sent", responseStatus: 204 });
  assert.equal(response.body.delivery.status, "failed");
  assert.equal(response.body.delivery.attemptCount, 2);
  assert.deepEqual(recorded, { error: undefined, responseStatus: 204 });
});

test("manual replay rejects disabled and expired deliveries", async () => {
  currentDelivery = { id: "delivery-2", registrationId: registration.id, projectId: project.id, environment: "sandbox", status: "sent", registrationStatus: "disabled", expiresAt: new Date(Date.now() + 60_000).toISOString(), manualAttemptCount: 0 };
  let response = await request(server, token, "POST", `/api/developer/projects/${project.id}/webhooks/${registration.id}/deliveries/${currentDelivery.id}/replay`);
  assert.equal(response.status, 409);
  assert.equal(response.body.code, "WEBHOOK_REGISTRATION_DISABLED");
  currentDelivery = { ...currentDelivery, registrationStatus: "active", expiresAt: new Date(Date.now() - 1).toISOString() };
  response = await request(server, token, "POST", `/api/developer/projects/${project.id}/webhooks/${registration.id}/deliveries/${currentDelivery.id}/replay`);
  assert.equal(response.status, 410);
  assert.equal(response.body.code, "WEBHOOK_REPLAY_EXPIRED");
});
