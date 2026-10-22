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
const webhookService = require("../src/services/developerWebhookService");
const securityEvents = require("../src/services/securityEventService");
const router = require("../src/routes/developerProjectRoutes");

  const original = {
  findSessionById: authSessions.findSessionById,
  touchSession: authSessions.touchSession,
  findUserById: users.findUserById,
  findMembershipByUserId: developerAccounts.findMembershipByUserId,
  findProjectForUser: developerProjects.findProjectForUser,
  listRegistrations: developerWebhooks.listRegistrations,
  createRegistration: developerWebhooks.createRegistration,
  disableRegistration: developerWebhooks.disableRegistration,
  rotateRegistration: developerWebhooks.rotateRegistration,
  validateDestination: webhookService.validateDestination,
  createSigningSecret: webhookService.createSigningSecret,
  encryptSecret: webhookService.encryptSecret,
  logSecurityEvent: securityEvents.logSecurityEvent
};

const project = {
  id: "project-1",
  name: "Demo project",
  status: "active",
  accessRole: "owner",
  createdAt: "2026-09-15T00:00:00.000Z",
  updatedAt: "2026-09-15T00:00:00.000Z"
};

function request(method, path, token, payload) {
  return new Promise((resolve, reject) => {
    const body = payload === undefined ? "" : JSON.stringify(payload);
    const server = request.server;
    const req = http.request(`http://127.0.0.1:${server.address().port}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(payload === undefined ? {} : {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body)
        })
      }
    }, (res) => {
      let responseBody = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { responseBody += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(responseBody) }));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

let server;
let token;
let rotationOptions;

test.before(async () => {
  authSessions.findSessionById = async () => ({
    _id: "session-1",
    surface: "developer",
    status: "active",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    inactivityExpiresAt: new Date(Date.now() + 60_000).toISOString()
  });
  authSessions.touchSession = async () => {};
  users.findUserById = async () => ({ _id: 7, name: "Developer", email: "developer@example.test" });
  developerAccounts.findMembershipByUserId = async () => ({
    developerAccountId: "account-1",
    role: "owner",
    accountStatus: "active"
  });
  developerProjects.findProjectForUser = async () => project;
  developerWebhooks.listRegistrations = async () => [{
    id: "webhook-1",
    projectId: project.id,
    environment: "sandbox",
    name: "Queue updates",
    url: "https://hooks.example.test/events",
    payloadVersion: 1,
    events: ["ticket.called"],
    status: "active",
    disabledAt: null,
    createdByUserId: "7",
    createdAt: project.createdAt,
    updatedAt: project.updatedAt
  }];
  developerWebhooks.createRegistration = async (data) => ({
    ...(await developerWebhooks.listRegistrations())[0],
    id: "webhook-2",
    name: data.name,
    url: data.url,
    payloadVersion: data.payloadVersion,
    events: data.events
  });
  developerWebhooks.disableRegistration = async () => ({
    ...(await developerWebhooks.listRegistrations())[0],
    status: "disabled",
    disabledAt: "2026-09-15T01:00:00.000Z"
  });
  developerWebhooks.rotateRegistration = async (_projectId, _webhookId, _ciphertext, options) => {
    rotationOptions = options;
    return {
      ...(await developerWebhooks.listRegistrations())[0],
      previousSigningSecretExpiresAt: "2026-09-16T01:00:00.000Z"
    };
  };
  webhookService.validateDestination = async (url) => String(url);
  webhookService.createSigningSecret = () => "whsec_test_secret";
  webhookService.encryptSecret = (secret) => `ciphertext:${secret}`;
  securityEvents.logSecurityEvent = async () => {};

  const app = express();
  app.use(express.json());
  app.use("/api/developer", router);
  app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ code: error.code, message: error.message }));
  server = await new Promise((resolve) => {
    const nextServer = app.listen(0, "127.0.0.1", () => resolve(nextServer));
  });
  request.server = server;
  token = jwt.sign({ sub: "7", surface: "developer", session_id: "session-1" }, env.jwtSecret);
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  Object.assign(authSessions, { findSessionById: original.findSessionById, touchSession: original.touchSession });
  users.findUserById = original.findUserById;
  developerAccounts.findMembershipByUserId = original.findMembershipByUserId;
  developerProjects.findProjectForUser = original.findProjectForUser;
  Object.assign(developerWebhooks, {
    listRegistrations: original.listRegistrations,
    createRegistration: original.createRegistration,
    disableRegistration: original.disableRegistration,
    rotateRegistration: original.rotateRegistration
  });
  Object.assign(webhookService, {
    validateDestination: original.validateDestination,
    createSigningSecret: original.createSigningSecret,
    encryptSecret: original.encryptSecret
  });
  securityEvents.logSecurityEvent = original.logSecurityEvent;
});

test("developer webhook routes scope project access and expose a secret only on creation", async () => {
  const listed = await request("GET", "/api/developer/projects/project-1/webhooks", token);
  assert.equal(listed.status, 200);
  assert.equal(listed.body.webhooks[0].id, "webhook-1");
  assert.equal(Object.hasOwn(listed.body.webhooks[0], "secret"), false);

  const created = await request("POST", "/api/developer/projects/project-1/webhooks", token, {
    name: "Queue updates v2",
    url: "https://hooks.example.test/events",
    events: ["ticket.called"],
    payloadVersion: 2
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.secret, "whsec_test_secret");
  assert.equal(Object.hasOwn(created.body.webhook, "secret"), false);
  assert.match(created.body.warning, /not be shown again/);

  const disabled = await request("DELETE", "/api/developer/projects/project-1/webhooks/webhook-1", token);
  assert.equal(disabled.status, 200);
  assert.equal(disabled.body.webhook.status, "disabled");
});

test("developer webhook routes reject production registration pending approval", async () => {
  const response = await request("POST", "/api/developer/projects/project-1/webhooks", token, {
    environment: "production",
    name: "Production",
    url: "https://hooks.example.test/events"
  });
  assert.equal(response.status, 403);
  assert.equal(response.body.code, "PRODUCTION_APPROVAL_REQUIRED");
});

test("developer webhook secret rotation returns the replacement secret once", async () => {
  rotationOptions = undefined;
  const response = await request("POST", "/api/developer/projects/project-1/webhooks/webhook-1/rotate-secret", token);
  assert.equal(response.status, 200);
  assert.equal(response.body.secret, "whsec_test_secret");
  assert.equal(response.body.webhook.id, "webhook-1");
  assert.match(response.body.warning, /previous secret remains valid for 24 hours/);
  assert.deepEqual(rotationOptions, {});
});

test("compromise rotation revokes the previous secret immediately", async () => {
  rotationOptions = undefined;
  const response = await request("POST", "/api/developer/projects/project-1/webhooks/webhook-1/rotate-secret/compromised", token);
  assert.equal(response.status, 200);
  assert.match(response.body.warning, /revoked immediately/);
  assert.deepEqual(rotationOptions, { immediate: true });
});
