const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");

const developerAuth = require("../src/middleware/developerAuth");
const db = require("../src/config/db");
const env = require("../src/config/env");
const originalAuthenticateDeveloper = developerAuth.authenticateDeveloper;
developerAuth.authenticateDeveloper = (req, _res, next) => {
  req.user = { _id: "41" };
  req.auth = { sessionId: "developer-session-1" };
  req.developerMembership = { developerAccountId: "account-1", role: "owner" };
  next();
};
delete require.cache[require.resolve("../src/routes/developerProjectRoutes")];
const router = require("../src/routes/developerProjectRoutes");
developerAuth.authenticateDeveloper = originalAuthenticateDeveloper;

const developerProjects = require("../src/repositories/developerProjects");
const developerTestAccounts = require("../src/repositories/developerTestAccounts");
const developerQueues = require("../src/repositories/developerQueues");
const securityEventService = require("../src/services/securityEventService");
const developerWebhookService = require("../src/services/developerWebhookService");

function startServer() {
  const app = express();
  app.use(express.json());
  app.use("/api/developer", router);
  app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ code: error.code, message: error.message }));
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve({ server, baseUrl: `http://127.0.0.1:${server.address().port}/api/developer` }));
  });
}

function request(method, url, body) {
  return new Promise((resolve, reject) => {
    const encoded = body === undefined ? "" : JSON.stringify(body);
    const req = http.request(url, { method, headers: body === undefined ? {} : { "content-type": "application/json", "content-length": Buffer.byteLength(encoded) } }, (res) => {
      let value = ""; res.setEncoding("utf8"); res.on("data", (chunk) => { value += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, body: value ? JSON.parse(value) : {} }));
    });
    req.on("error", reject); if (encoded) req.write(encoded); req.end();
  });
}

function replace(object, name, value, originals) { originals.push([object, name, object[name]]); object[name] = value; }
function restore(originals) { for (const [object, name, value] of originals.reverse()) object[name] = value; }
const project = { id: "project-1", name: "Harbor", status: "active", accessRole: "owner", createdAt: "2026-09-16T00:00:00.000Z", updatedAt: "2026-09-16T00:00:00.000Z" };
const profile = { id: "profile-1", projectId: "project-1", environment: "sandbox", slug: "harbor", displayName: "Harbor", directoryStatus: "private", directoryContent: {}, createdAt: "2026-09-16T00:00:00.000Z", updatedAt: "2026-09-16T00:00:00.000Z" };

test("developer workspace resource routes scope profiles and queues to the signed-in project", async () => {
  const originals = []; const calls = []; const createdQueues = [];
  replace(developerProjects, "findProjectForUser", async (...args) => { calls.push(["project", ...args]); return args[0] === "project-1" ? project : null; }, originals);
  replace(developerQueues, "listProfiles", async (...args) => { calls.push(["profiles", ...args]); return [profile]; }, originals);
  replace(developerQueues, "findProfile", async (...args) => { calls.push(["findProfile", ...args]); return args[2] === "harbor" ? profile : null; }, originals);
  replace(developerQueues, "listQueues", async (...args) => { calls.push(["queues", ...args]); return []; }, originals);
  replace(developerQueues, "createProfile", async (input) => ({ ...profile, slug: input.slug, displayName: input.displayName }), originals);
  replace(developerQueues, "createQueue", async (input) => { createdQueues.push(input); return { id: "queue-1", profileId: input.profileId, slug: input.slug, displayName: input.displayName, sessionState: input.sessionState, intakeEnabled: input.intakeEnabled, joiningEnabled: false, priorityRatio: 3, queuePrefix: input.queuePrefix, averageServiceMinutes: input.averageServiceMinutes, notificationThreshold: input.notificationThreshold, resourceVersion: 1, createdAt: "2026-09-16T00:00:00.000Z", updatedAt: "2026-09-16T00:00:00.000Z" }; }, originals);
  replace(securityEventService, "logSecurityEvent", async () => {}, originals);
  const { server, baseUrl } = await startServer();
  try {
    const listed = await request("GET", `${baseUrl}/projects/project-1/profiles?environment=sandbox`);
    assert.equal(listed.status, 200); assert.deepEqual(calls[1], ["profiles", "project-1", "sandbox"]);
    const created = await request("POST", `${baseUrl}/projects/project-1/profiles`, { environment: "sandbox", slug: "north-desk", displayName: "North desk" });
    assert.equal(created.status, 201); assert.equal(created.body.profile.slug, "north-desk");
    const queue = await request("POST", `${baseUrl}/projects/project-1/profiles/harbor/queues`, { environment: "sandbox", slug: "main", displayName: "Main queue", sessionState: "open", intakeEnabled: true, queuePrefix: "DESK", averageServiceMinutes: 20, notificationThreshold: 4 });
    assert.equal(queue.status, 201); assert.equal(queue.body.queue.profileId, "profile-1"); assert.equal(queue.body.queue.intakeEnabled, true);
    assert.equal(queue.body.queue.queuePrefix, "DESK"); assert.equal(queue.body.queue.averageServiceMinutes, 20); assert.equal(queue.body.queue.notificationThreshold, 4);
    await request("POST", `${baseUrl}/projects/project-1/profiles/harbor/queues`, { environment: "sandbox", slug: "front", displayName: "Front queue" });
    assert.deepEqual(createdQueues[1], { profileId: "profile-1", slug: "front", displayName: "Front queue", sessionState: "closed", intakeEnabled: false, queuePrefix: "FRON", averageServiceMinutes: 15, notificationThreshold: 2 });
    const denied = await request("GET", `${baseUrl}/projects/another-project/profiles?environment=sandbox`);
    assert.equal(denied.status, 404); assert.equal(denied.body.code, "DEVELOPER_RESOURCE_NOT_FOUND");
  } finally { restore(originals); await new Promise((resolve) => server.close(resolve)); }
});

test("developer workspace blocks production profile resources before database access", async () => {
  const originals = [];
  replace(developerProjects, "findProjectForUser", async () => project, originals);
  replace(developerQueues, "listProfiles", async () => { throw new Error("must not query production resources"); }, originals);
  const { server, baseUrl } = await startServer();
  try {
    const response = await request("GET", `${baseUrl}/projects/project-1/profiles?environment=production`);
    assert.equal(response.status, 403); assert.equal(response.body.code, "PRODUCTION_APPROVAL_REQUIRED");
  } finally { restore(originals); await new Promise((resolve) => server.close(resolve)); }
});

test("developer workspace updates queue configuration without allowing slug changes", async () => {
  const originals = []; const queue = { id: "queue-1", profileId: "profile-1", slug: "main", displayName: "Main queue", sessionState: "closed", intakeEnabled: false, joiningEnabled: false, priorityRatio: 3, queuePrefix: "MAIN", averageServiceMinutes: 15, notificationThreshold: 2, resourceVersion: 1, createdAt: "2026-09-16T00:00:00.000Z", updatedAt: "2026-09-16T00:00:00.000Z" };
  const webhookEvents = [];
  replace(developerProjects, "findProjectForUser", async () => project, originals);
  replace(developerQueues, "findProfile", async () => profile, originals);
  replace(developerQueues, "findQueue", async (_profileId, slug) => slug === "main" ? queue : null, originals);
  replace(db, "withTransaction", async (callback) => callback({ query: async () => ({ rows: [] }) }), originals);
  replace(developerQueues, "updateQueue", async (_queueId, changes, options) => {
    assert.ok(options?.client);
    return { ...queue, ...changes, resourceVersion: queue.resourceVersion + 1, updatedAt: "2026-09-16T00:01:00.000Z" };
  }, originals);
  replace(developerWebhookService, "enqueueDeveloperQueueEvent", async ({ event, queue: eventQueue }, options) => {
    assert.ok(options?.client);
    assert.equal(typeof options.renderPayload, "function");
    webhookEvents.push({ event, queue: eventQueue, options });
  }, originals);
  replace(securityEventService, "logSecurityEvent", async () => {}, originals);
  const { server, baseUrl } = await startServer();
  try {
    const updated = await request("PATCH", `${baseUrl}/projects/project-1/profiles/harbor/queues/main`, { environment: "sandbox", displayName: "Front desk", sessionState: "open", intakeEnabled: true, queuePrefix: "FRNT", averageServiceMinutes: 25, notificationThreshold: 5, resourceVersion: 1 });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.queue.displayName, "Front desk");
    assert.equal(updated.body.queue.sessionState, "open");
    assert.equal(updated.body.queue.intakeEnabled, true);
    assert.equal(updated.body.queue.queuePrefix, "FRNT");
    assert.equal(updated.body.queue.averageServiceMinutes, 25);
    assert.equal(updated.body.queue.notificationThreshold, 5);
    assert.equal(updated.body.queue.slug, "main");
    assert.deepEqual(webhookEvents.map(({ event }) => ({ type: event.type, fromStatus: event.fromStatus, toStatus: event.toStatus })), [
      { type: "queue.session.opened", fromStatus: "closed", toStatus: "open" },
      { type: "queue.intake.resumed", fromStatus: "false", toStatus: "true" }
    ]);
    assert.equal(webhookEvents[0].event.source, "developer_portal");
    assert.equal(webhookEvents[0].queue.projectId, "project-1");
    assert.equal(webhookEvents[0].queue.environment, "sandbox");
    const rendered = webhookEvents[0].options.renderPayload(2);
    assert.equal(rendered.payload.payload_version, 2);
    assert.equal(rendered.payload.type, "queue.session.opened");
    const rejected = await request("PATCH", `${baseUrl}/projects/project-1/profiles/harbor/queues/main`, { slug: "renamed" });
    assert.equal(rejected.status, 400);
    assert.equal(rejected.body.code, "INVALID_REQUEST");
  } finally { restore(originals); await new Promise((resolve) => server.close(resolve)); }
});

test("developer workspace derives queue events from the locked current row and does not label pauses as extensions", async () => {
  const originals = [];
  const staleQueue = { id: "queue-1", profileId: "profile-1", slug: "main", displayName: "Main queue", sessionState: "closed", intakeEnabled: false, joiningEnabled: false, priorityRatio: 3, resourceVersion: 1, createdAt: "2026-09-16T00:00:00.000Z", updatedAt: "2026-09-16T00:00:00.000Z" };
  const currentQueue = { ...staleQueue, sessionState: "open", resourceVersion: 2 };
  const webhookEvents = [];
  let findQueueCalls = 0;
  replace(developerProjects, "findProjectForUser", async () => project, originals);
  replace(developerQueues, "findProfile", async () => profile, originals);
  replace(developerQueues, "findQueue", async (_profileId, slug, options) => {
    assert.equal(slug, "main");
    findQueueCalls += 1;
    if (findQueueCalls === 1) return staleQueue;
    assert.equal(options?.forUpdate, true);
    assert.ok(options?.client);
    return currentQueue;
  }, originals);
  replace(db, "withTransaction", async (callback) => callback({ query: async () => ({ rows: [] }) }), originals);
  replace(developerQueues, "updateQueue", async (queueId, changes, options) => {
    assert.equal(queueId, "queue-1");
    assert.ok(options?.client);
    return { ...currentQueue, ...changes, resourceVersion: currentQueue.resourceVersion + 1, updatedAt: "2026-09-16T00:02:00.000Z" };
  }, originals);
  replace(developerWebhookService, "enqueueDeveloperQueueEvent", async ({ event }, options) => {
    assert.ok(options?.client);
    webhookEvents.push(event);
  }, originals);
  replace(securityEventService, "logSecurityEvent", async () => {}, originals);
  const { server, baseUrl } = await startServer();
  try {
    const updated = await request("PATCH", `${baseUrl}/projects/project-1/profiles/harbor/queues/main`, { environment: "sandbox", sessionState: "paused", resourceVersion: 1 });
    assert.equal(updated.status, 200);
    assert.equal(findQueueCalls, 2);
    assert.deepEqual(webhookEvents, []);
  } finally { restore(originals); await new Promise((resolve) => server.close(resolve)); }
});

test("developer workspace edits profile metadata and keeps directory changes in draft", async () => {
  const originals = [];
  replace(developerProjects, "findProjectForUser", async () => project, originals);
  replace(developerQueues, "findProfile", async () => profile, originals);
  replace(developerQueues, "updateProfile", async (_id, changes) => ({ ...profile, ...changes, directoryStatus: changes.directoryStatus || profile.directoryStatus }), originals);
  replace(securityEventService, "logSecurityEvent", async () => {}, originals);
  const { server, baseUrl } = await startServer();
  try {
    const updated = await request("PATCH", `${baseUrl}/projects/project-1/profiles/harbor`, {
      environment: "sandbox",
      displayName: "Harbor Service Centre",
      directoryContent: { description: "A public description", websiteUrl: "https://harbor.example" }
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.profile.displayName, "Harbor Service Centre");
    assert.equal(updated.body.profile.slug, "harbor");
    assert.equal(updated.body.profile.directoryStatus, "draft");
    assert.deepEqual(updated.body.profile.directoryContent, { description: "A public description", websiteUrl: "https://harbor.example" });
    const rejected = await request("PATCH", `${baseUrl}/projects/project-1/profiles/harbor`, { slug: "new-slug" });
    assert.equal(rejected.status, 400);
    assert.equal(rejected.body.code, "INVALID_REQUEST");
  } finally { restore(originals); await new Promise((resolve) => server.close(resolve)); }
});

test("developer workspace deletes empty profiles and queues within the signed-in project", async () => {
  const originals = [];
  const queue = { id: "queue-1", profileId: "profile-1", slug: "main", displayName: "Main queue", sessionState: "closed", intakeEnabled: false, joiningEnabled: false, priorityRatio: 3, resourceVersion: 1, createdAt: "2026-09-16T00:00:00.000Z", updatedAt: "2026-09-16T00:00:00.000Z" };
  const events = [];
  replace(developerProjects, "findProjectForUser", async (id) => id === project.id ? project : null, originals);
  replace(developerProjects, "revokeKeysForDeletedProfile", async (projectId, environment, slug, options) => { assert.equal(projectId, project.id); assert.equal(environment, "sandbox"); assert.equal(slug, profile.slug); assert.ok(options?.client); return []; }, originals);
  replace(developerQueues, "findProfile", async () => profile, originals);
  replace(developerQueues, "findQueue", async () => queue, originals);
  replace(developerQueues, "deleteProfile", async (id) => { assert.equal(id, profile.id); return profile; }, originals);
  replace(developerQueues, "deleteQueue", async (id) => { assert.equal(id, queue.id); return queue; }, originals);
  replace(db, "withTransaction", async (callback) => callback({}), originals);
  replace(securityEventService, "logSecurityEvent", async (event) => events.push(event), originals);
  const { server, baseUrl } = await startServer();
  try {
    const deletedQueue = await request("DELETE", `${baseUrl}/projects/project-1/profiles/harbor/queues/main?environment=sandbox`);
    assert.equal(deletedQueue.status, 200);
    assert.equal(deletedQueue.body.queue.id, queue.id);
    const deletedProfile = await request("DELETE", `${baseUrl}/projects/project-1/profiles/harbor?environment=sandbox`);
    assert.equal(deletedProfile.status, 200);
    assert.equal(deletedProfile.body.profile.id, profile.id);
    assert.deepEqual(events.map((event) => event.eventType), ["developer_queue_deleted", "developer_profile_deleted"]);
    const denied = await request("DELETE", `${baseUrl}/projects/another-project/profiles/harbor?environment=sandbox`);
    assert.equal(denied.status, 404);
  } finally { restore(originals); await new Promise((resolve) => server.close(resolve)); }
});

test("developer workspace preserves profiles and queues with ticket history", async () => {
  const originals = [];
  const foreignKeyError = () => Object.assign(new Error("violates foreign key constraint"), { code: "23503" });
  replace(developerProjects, "findProjectForUser", async () => project, originals);
  replace(developerProjects, "revokeKeysForDeletedProfile", async () => [], originals);
  replace(db, "withTransaction", async (callback) => callback({}), originals);
  replace(developerQueues, "findProfile", async () => profile, originals);
  replace(developerQueues, "findQueue", async () => ({ id: "queue-1", profileId: "profile-1", slug: "main", displayName: "Main queue", sessionState: "closed", intakeEnabled: false, joiningEnabled: false, priorityRatio: 3, resourceVersion: 1, createdAt: "2026-09-16T00:00:00.000Z", updatedAt: "2026-09-16T00:00:00.000Z" }), originals);
  replace(developerQueues, "deleteProfile", async () => { throw foreignKeyError(); }, originals);
  replace(developerQueues, "deleteQueue", async () => { throw foreignKeyError(); }, originals);
  const { server, baseUrl } = await startServer();
  try {
    const profileResponse = await request("DELETE", `${baseUrl}/projects/project-1/profiles/harbor?environment=sandbox`);
    assert.equal(profileResponse.status, 409);
    assert.equal(profileResponse.body.code, "RESOURCE_HAS_TICKET_HISTORY");
    assert.match(profileResponse.body.message, /profile has ticket history/i);
    const queueResponse = await request("DELETE", `${baseUrl}/projects/project-1/profiles/harbor/queues/main?environment=sandbox`);
    assert.equal(queueResponse.status, 409);
    assert.equal(queueResponse.body.code, "RESOURCE_HAS_TICKET_HISTORY");
    assert.match(queueResponse.body.message, /queue has ticket history/i);
  } finally { restore(originals); await new Promise((resolve) => server.close(resolve)); }
});

test("sandbox allowance reads only a project accessible to the signed-in developer", async () => {
  const originals = [];
  const calls = [];
  replace(developerProjects, "findProjectForUser", async (id, userId) => {
    calls.push(["project", id, userId]);
    return id === "project-1" ? project : null;
  }, originals);
  replace(developerProjects, "getSandboxAllowance", async (id) => {
    calls.push(["allowance", id]);
    return { limit: 100, issuedTickets: 7, remaining: 93 };
  }, originals);
  const { server, baseUrl } = await startServer();
  try {
    const allowed = await request("GET", `${baseUrl}/projects/project-1/sandbox/allowance`);
    assert.equal(allowed.status, 200);
    assert.deepEqual(allowed.body.allowance.limit, 100);
    assert.equal(allowed.body.allowance.remaining, 93);
    assert.match(allowed.body.allowance.resetAt, /^\d{4}-\d\d-\d\dT00:00:00.000Z$/);
    const denied = await request("GET", `${baseUrl}/projects/another-project/sandbox/allowance`);
    assert.equal(denied.status, 404);
    assert.deepEqual(calls, [["project", "project-1", "41"], ["allowance", "project-1"], ["project", "another-project", "41"]]);
  } finally { restore(originals); await new Promise((resolve) => server.close(resolve)); }
});

test("sandbox TestFlight invitation is available only to an accessible project", async () => {
  const originals = [];
  replace(developerProjects, "findProjectForUser", async (id, userId) => {
    assert.equal(userId, "41");
    return id === "project-1" ? project : null;
  }, originals);
  replace(env, "sandboxTestFlightPublicUrl", "https://testflight.apple.com/join/portal-developers", originals);
  const { server, baseUrl } = await startServer();
  try {
    const allowed = await request("GET", `${baseUrl}/projects/project-1/sandbox/testflight`);
    assert.equal(allowed.status, 200);
    assert.equal(allowed.body.available, true);
    assert.equal(allowed.body.testFlightUrl, "https://testflight.apple.com/join/portal-developers");
    const denied = await request("GET", `${baseUrl}/projects/another-project/sandbox/testflight`);
    assert.equal(denied.status, 404);
    assert.equal(denied.body.code, "DEVELOPER_RESOURCE_NOT_FOUND");
  } finally { restore(originals); await new Promise((resolve) => server.close(resolve)); }
});

test("sandbox Android Google Play tester link is available only to an accessible project", async () => {
  const originals = [];
  replace(developerProjects, "findProjectForUser", async (id, userId) => {
    assert.equal(userId, "41");
    return id === "project-1" ? project : null;
  }, originals);
  replace(env, "sandboxAndroidGooglePlayPublicUrl", "https://play.google.com/apps/testing/com.getprio.getprioMobile.android.sandbox", originals);
  replace(env, "sandboxAndroidPackageName", "com.getprio.getprioMobile.android.sandbox", originals);
  const { server, baseUrl } = await startServer();
  try {
    const allowed = await request("GET", `${baseUrl}/projects/project-1/sandbox/android`);
    assert.equal(allowed.status, 200);
    assert.equal(allowed.body.available, true);
    assert.equal(allowed.body.androidUrl, "https://play.google.com/apps/testing/com.getprio.getprioMobile.android.sandbox");
    assert.equal(allowed.body.packageName, "com.getprio.getprioMobile.android.sandbox");
    const denied = await request("GET", `${baseUrl}/projects/another-project/sandbox/android`);
    assert.equal(denied.status, 404);
    assert.equal(denied.body.code, "DEVELOPER_RESOURCE_NOT_FOUND");
  } finally { restore(originals); await new Promise((resolve) => server.close(resolve)); }
});

test("developer workspace usage returns project-scoped Sandbox activity", async () => {
  const originals = [];
  replace(developerProjects, "findProjectForUser", async () => project, originals);
  replace(developerProjects, "getSandboxAllowance", async () => ({ limit: 100, issuedTickets: 2, remaining: 98 }), originals);
  replace(developerQueues, "getUsage", async (projectId, environment) => ({
    summary: { issuedTickets: 2, activeTickets: 1, completedTickets: 1 },
    daily: [{ date: "2026-09-17", issuedTickets: 2 }],
    recentTickets: [{ id: "ticket-1", projectId, environment, ticketNumber: "MAIN-0001", createdAt: "2026-09-17T01:00:00.000Z" }]
  }), originals);
  const { server, baseUrl } = await startServer();
  try {
    const response = await request("GET", `${baseUrl}/projects/project-1/usage`);
    assert.equal(response.status, 200);
    assert.equal(response.body.environment, "sandbox");
    assert.deepEqual(response.body.summary, { issuedTickets: 2, activeTickets: 1, completedTickets: 1 });
    assert.deepEqual(response.body.daily, [{ date: "2026-09-17", issuedTickets: 2 }]);
    assert.equal(response.body.recentTickets[0].id, "ticket-1");
    assert.equal(response.body.allowance.remaining, 98);
    const denied = await request("GET", `${baseUrl}/projects/project-1/usage?environment=production`);
    assert.equal(denied.status, 403);
    assert.equal(denied.body.code, "PRODUCTION_APPROVAL_REQUIRED");
  } finally { restore(originals); await new Promise((resolve) => server.close(resolve)); }
});

test("production approval drafts are project-scoped and submissions create immutable versions", async () => {
  const originals = [];
  let approval = null;
  replace(developerProjects, "findProjectForUser", async () => project, originals);
  replace(developerProjects, "getProductionApproval", async () => approval, originals);
  replace(developerProjects, "mergeProductionApprovalDraft", async ({ projectId, changes }) => {
    const draft = { ...(approval?.draft || {}), ...changes };
    approval = { id: "application-1", projectId, status: approval?.status || "not_submitted", draft, approvedSubmissionId: null, submissions: approval?.submissions || [] };
    return approval;
  }, originals);
  replace(developerProjects, "submitProductionApproval", async ({ projectId, userId }, options) => {
    assert.ok(options?.client);
    const submission = { id: "submission-1", version: 1, snapshot: approval.draft, status: "pending_review", submittedByUserId: String(userId), submittedAt: "2026-09-18T00:00:00.000Z" };
    approval = { ...approval, status: "pending_review", submissions: [submission] };
    return { ...approval, submission };
  }, originals);
  replace(db, "withTransaction", async (callback) => callback({ query: async () => ({ rows: [] }) }), originals);
  replace(securityEventService, "logSecurityEvent", async () => {}, originals);
  const { server, baseUrl } = await startServer();
  try {
    let response = await request("GET", `${baseUrl}/projects/project-1/production-approval`);
    assert.equal(response.status, 200);
    assert.equal(response.body.approval, null);
    response = await request("PUT", `${baseUrl}/projects/project-1/production-approval`, {
      applicationName: "Harbor Queue",
      purpose: "Connect customers to a service queue.",
      intendedIndustries: ["Retail"],
      expectedTicketVolume: "Up to 500 tickets per month",
      customerDataFields: ["display name", "email"],
      mobileLinking: true
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.approval.draft.applicationName, "Harbor Queue");
    response = await request("POST", `${baseUrl}/projects/project-1/production-approval`);
    assert.equal(response.status, 201);
    assert.equal(response.body.approval.status, "pending_review");
    assert.equal(response.body.approval.submissions[0].version, 1);
    assert.equal(response.body.approval.submissions[0].snapshot.applicationName, "Harbor Queue");
    response = await request("PUT", `${baseUrl}/projects/project-1/production-approval`, { purpose: "Updated purpose." });
    assert.equal(response.status, 200);
    assert.equal(response.body.approval.draft.purpose, "Updated purpose.");
    assert.equal(response.body.approval.status, "pending_review");
  } finally { restore(originals); await new Promise((resolve) => server.close(resolve)); }
});

test("production approval submission rejects incomplete drafts", async () => {
  const originals = [];
  replace(developerProjects, "findProjectForUser", async () => project, originals);
  replace(developerProjects, "getProductionApproval", async () => ({ id: "application-1", projectId: project.id, status: "not_submitted", draft: { applicationName: "Only a name" }, submissions: [] }), originals);
  replace(securityEventService, "logSecurityEvent", async () => {}, originals);
  const { server, baseUrl } = await startServer();
  try {
    const response = await request("POST", `${baseUrl}/projects/project-1/production-approval`);
    assert.equal(response.status, 400);
    assert.equal(response.body.code, "INVALID_PRODUCTION_APPLICATION");
  } finally { restore(originals); await new Promise((resolve) => server.close(resolve)); }
});

test("production approval submission requires ownership of the requested project's account", async () => {
  const originals = [];
  replace(developerProjects, "findProjectForUser", async () => ({ ...project, accessRole: "member" }), originals);
  replace(developerProjects, "getProductionApproval", async () => ({ id: "application-1", projectId: project.id, status: "not_submitted", draft: {}, submissions: [] }), originals);
  const { server, baseUrl } = await startServer();
  try {
    const response = await request("POST", `${baseUrl}/projects/project-1/production-approval`);
    assert.equal(response.status, 403);
    assert.equal(response.body.code, "DEVELOPER_OWNER_REQUIRED");
  } finally { restore(originals); await new Promise((resolve) => server.close(resolve)); }
});

test("Sandbox test-account routes create, list, and reset project-scoped credentials", async () => {
  const originals = [];
  const account = {
    id: "test-account-1", projectId: project.id, slot: 1, username: "sb_ab12CD34",
    purpose: "developer",
    email: "sb-ab12CD34@test.getprio.invalid", status: "active",
    expiresAt: "2026-10-01T00:00:00.000Z", deviceCount: 1,
    createdAt: "2026-09-24T00:00:00.000Z", updatedAt: "2026-09-24T00:00:00.000Z"
  };
  const calls = [];
  replace(developerProjects, "findProjectForUser", async (projectId) => projectId === project.id ? project : null, originals);
  replace(developerTestAccounts, "list", async (projectId) => { calls.push(["list", projectId]); return [account]; }, originals);
  replace(developerTestAccounts, "findById", async (projectId, accountId) => { calls.push(["findById", projectId, accountId]); return accountId === account.id ? account : null; }, originals);
  replace(developerTestAccounts, "create", async (input, options) => { calls.push(["create", input.projectId, input.name, Boolean(input.passwordHash), options.client]); return { ...account, username: input.username, email: input.email }; }, originals);
  replace(developerTestAccounts, "reset", async (projectId, accountId, input, options) => { calls.push(["reset", projectId, accountId, Boolean(input.passwordHash), options.client]); return { ...account, deviceCount: 0 }; }, originals);
  replace(db, "withTransaction", async (callback) => callback({ transaction: true }), originals);
  replace(securityEventService, "logSecurityEvent", async () => {}, originals);
  const { server, baseUrl } = await startServer();
  try {
    let response = await request("GET", `${baseUrl}/projects/${project.id}/sandbox/test-accounts`);
    assert.equal(response.status, 200);
    assert.equal(response.body.testAccounts[0].username, account.username);
    response = await request("POST", `${baseUrl}/projects/${project.id}/sandbox/test-accounts`);
    assert.equal(response.status, 201);
    assert.match(response.body.credentials.username, /^sb_[A-Za-z0-9]{8}$/);
    assert.equal(response.body.testAccount.username, response.body.credentials.username);
    assert.equal(response.body.credentials.password.length, 8);
    assert.match(response.body.credentials.password, /[A-Z]/);
    assert.match(response.body.credentials.password, /[a-z]/);
    assert.match(response.body.credentials.password, /[0-9]/);
    assert.match(response.body.credentials.password, /[^A-Za-z0-9]/);
    assert.equal(response.body.warning.includes("not be shown again"), true);
    response = await request("POST", `${baseUrl}/projects/${project.id}/sandbox/test-accounts/${account.id}/reset`);
    assert.equal(response.status, 200);
    assert.equal(response.body.testAccount.deviceCount, 0);
    assert.deepEqual(calls[0], ["list", project.id]);
    assert.equal(calls[1][0], "create");
    assert.equal(calls[1][1], project.id);
    assert.match(calls[1][2], /^Sandbox tester /);
    assert.equal(calls[1][3], true);
    assert.equal(calls[2][0], "findById");
    assert.equal(calls[2][1], project.id);
    assert.equal(calls[2][2], account.id);
    assert.equal(calls[3][0], "reset");
    assert.equal(calls[3][1], project.id);
    assert.equal(calls[3][2], account.id);
    assert.equal(calls[3][3], true);
    assert.ok(calls.slice(1).filter((call) => call[0] === "create" || call[0] === "reset").every((call) => call.at(-1)?.transaction));
  } finally { restore(originals); await new Promise((resolve) => server.close(resolve)); }
});

test("Developer Portal cannot reset a platform-managed Apple review Sandbox account", async () => {
  const originals = [];
  const account = { id: "review-account-1", projectId: project.id, slot: 1, purpose: "apple_review", username: "sb_review1", email: "sb-review1@test.getprio.invalid", status: "active", expiresAt: "2026-09-26T00:00:00.000Z", deviceCount: 1, createdAt: "2026-09-20T00:00:00.000Z", updatedAt: "2026-09-20T00:00:00.000Z" };
  replace(developerProjects, "findProjectForUser", async () => project, originals);
  replace(developerTestAccounts, "findById", async () => account, originals);
  replace(developerTestAccounts, "reset", async () => { throw new Error("must not reset a platform-managed account"); }, originals);
  const { server, baseUrl } = await startServer();
  try {
    const response = await request("POST", `${baseUrl}/projects/${project.id}/sandbox/test-accounts/${account.id}/reset`);
    assert.equal(response.status, 403);
    assert.equal(response.body.code, "SANDBOX_APPLE_REVIEW_PLATFORM_ONLY");
  } finally { restore(originals); await new Promise((resolve) => server.close(resolve)); }
});

test("Sandbox test-account creation preserves the two-account limit error", async () => {
  const originals = [];
  replace(developerProjects, "findProjectForUser", async () => project, originals);
  replace(developerTestAccounts, "create", async () => {
    const error = new Error("This project already has two Sandbox test accounts.");
    error.statusCode = 409;
    error.code = "SANDBOX_TEST_ACCOUNT_LIMIT_REACHED";
    throw error;
  }, originals);
  replace(db, "withTransaction", async (callback) => callback({ transaction: true }), originals);
  const { server, baseUrl } = await startServer();
  try {
    const response = await request("POST", `${baseUrl}/projects/${project.id}/sandbox/test-accounts`);
    assert.equal(response.status, 409);
    assert.equal(response.body.code, "SANDBOX_TEST_ACCOUNT_LIMIT_REACHED");
  } finally { restore(originals); await new Promise((resolve) => server.close(resolve)); }
});
