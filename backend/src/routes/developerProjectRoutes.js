const express = require("express");
const db = require("../config/db");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticateDeveloper } = require("../middleware/developerAuth");
const authService = require("../services/authService");
const developerProjects = require("../repositories/developerProjects");
const developerWebhooks = require("../repositories/developerWebhooks");
const developerWebhookDeliveries = require("../repositories/developerWebhookDeliveries");
const developerApiKeyService = require("../services/developerApiKeyService");
const developerWebhookService = require("../services/developerWebhookService");
const developerWebhookDispatcher = require("../services/developerWebhookDispatcher");
const securityEventService = require("../services/securityEventService");

const router = express.Router();
const VALID_SCOPES = new Set(["queues:read", "queues:write", "webhooks:read", "webhooks:write"]);

router.use(authenticateDeveloper);

function cleanName(value, label) {
  const name = String(value || "").trim();
  if (name.length < 1 || name.length > 80) {
    const error = new Error(`${label} must be between 1 and 80 characters.`);
    error.statusCode = 400;
    error.code = "INVALID_NAME";
    throw error;
  }
  return name;
}

function normalizeScopes(value) {
  const scopes = value === undefined ? ["queues:read"] : value;
  if (!Array.isArray(scopes) || !scopes.length || scopes.some((scope) => !VALID_SCOPES.has(scope))) {
    const error = new Error("scopes must contain only supported API scopes.");
    error.statusCode = 400;
    error.code = "INVALID_API_SCOPES";
    throw error;
  }
  return [...new Set(scopes)];
}

function projectResponse(project) {
  return {
    id: project.id,
    name: project.name,
    status: project.status,
    accessRole: project.accessRole || undefined,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt
  };
}

function keyResponse(key) {
  return {
    id: key.id,
    projectId: key.projectId,
    name: key.name,
    environment: key.environment,
    keyPrefix: key.keyPrefix,
    scopes: key.scopes,
    status: key.status,
    lastUsedAt: key.lastUsedAt,
    revokedAt: key.revokedAt,
    createdAt: key.createdAt,
    updatedAt: key.updatedAt
  };
}

function webhookResponse(registration) {
  return {
    id: registration.id,
    projectId: registration.projectId,
    environment: registration.environment,
    name: registration.name,
    url: registration.url,
    payloadVersion: registration.payloadVersion,
    events: registration.events,
    status: registration.status,
    disabledAt: registration.disabledAt,
    createdAt: registration.createdAt,
    updatedAt: registration.updatedAt
  };
}

function deliveryResponse(delivery) {
  return {
    id: delivery.id,
    webhookId: delivery.registrationId,
    projectId: delivery.projectId,
    environment: delivery.environment,
    eventId: delivery.eventId,
    eventType: delivery.eventType,
    payloadVersion: delivery.payloadVersion,
    payloadPurgedAt: delivery.payloadPurgedAt,
    status: delivery.status,
    attemptCount: delivery.attemptCount,
    expiresAt: delivery.expiresAt,
    retryUntil: delivery.retryUntil,
    lastError: delivery.lastError,
    responseStatus: delivery.responseStatus,
    sentAt: delivery.sentAt,
    manualAttemptCount: delivery.manualAttemptCount,
    lastManualAttemptAt: delivery.lastManualAttemptAt,
    manualLastError: delivery.manualLastError,
    manualResponseStatus: delivery.manualResponseStatus,
    createdAt: delivery.createdAt,
    updatedAt: delivery.updatedAt
  };
}

function notFound(message = "Project not found or you do not have access to it.") {
  const error = new Error(message);
  error.statusCode = 404;
  error.code = "DEVELOPER_RESOURCE_NOT_FOUND";
  return error;
}

async function rotateWebhookSecret(req, res, options = {}) {
  const project = await developerProjects.findProjectForUser(req.params.projectId, req.user._id);
  if (!project) throw notFound();
  const secret = developerWebhookService.createSigningSecret();
  const rotated = await developerWebhooks.rotateRegistration(
    project.id,
    req.params.webhookId,
    developerWebhookService.encryptSecret(secret),
    options
  );
  if (!rotated) throw notFound("Webhook registration not found or is disabled.");
  await securityEventService.logSecurityEvent({
    userId: req.user._id,
    sessionId: req.auth.sessionId,
    eventType: "developer_webhook_secret_rotated",
    actorRole: req.developerMembership.role,
    ipAddress: authService.getRequestIp(req),
    userAgent: authService.getUserAgent(req),
    metadata: { projectId: project.id, registrationId: rotated.id, emergency: Boolean(options.immediate) }
  });
  res.json({
    webhook: webhookResponse(rotated),
    secret,
    warning: options.immediate
      ? "Copy this signing secret now. It will not be shown again. The previous secret was revoked immediately."
      : "Copy this signing secret now. It will not be shown again. The previous secret remains valid for 24 hours."
  });
}

router.get("/projects", asyncHandler(async (req, res) => {
  const projects = await developerProjects.listProjectsForUser(req.user._id);
  res.setHeader("Cache-Control", "no-store");
  res.json({ projects: projects.map(projectResponse) });
}));

router.post("/projects", asyncHandler(async (req, res) => {
  if (req.developerMembership.role !== "owner") {
    const error = new Error("Only the Developer Portal owner can create projects.");
    error.statusCode = 403;
    error.code = "DEVELOPER_OWNER_REQUIRED";
    throw error;
  }

  const name = cleanName(req.body?.name, "Project name");
  const count = await developerProjects.countActiveProjects(req.developerMembership.developerAccountId);
  if (count >= 1) {
    const error = new Error("Your Developer Portal plan includes one project. Upgrade before creating another.");
    error.statusCode = 402;
    error.code = "PROJECT_LIMIT_REACHED";
    throw error;
  }

  try {
    const project = await db.withTransaction((client) => developerProjects.createProject({
      developerAccountId: req.developerMembership.developerAccountId,
      userId: req.user._id,
      name
    }, { client }));
    await securityEventService.logSecurityEvent({
      userId: req.user._id,
      sessionId: req.auth.sessionId,
      eventType: "developer_project_created",
      actorRole: req.developerMembership.role,
      ipAddress: authService.getRequestIp(req),
      userAgent: authService.getUserAgent(req),
      metadata: { projectId: project.id }
    });
    res.status(201).json({ project: projectResponse(project) });
  } catch (error) {
    if (error.code === "23505" && error.constraint === "developer_projects_one_active_per_account_idx") {
      error.statusCode = 402;
      error.code = "PROJECT_LIMIT_REACHED";
    } else if (error.code === "23505") {
      error.statusCode = 409;
      error.code = "PROJECT_NAME_EXISTS";
    }
    throw error;
  }
}));

router.delete("/projects/:projectId", asyncHandler(async (req, res) => {
  const project = await developerProjects.archiveProject(req.params.projectId, req.user._id);
  if (!project) throw notFound();
  await securityEventService.logSecurityEvent({
    userId: req.user._id,
    sessionId: req.auth.sessionId,
    eventType: "developer_project_archived",
    actorRole: req.developerMembership.role,
    ipAddress: authService.getRequestIp(req),
    userAgent: authService.getUserAgent(req),
    metadata: { projectId: project.id }
  });
  res.json({ project: projectResponse(project) });
}));

router.get("/projects/:projectId/keys", asyncHandler(async (req, res) => {
  const project = await developerProjects.findProjectForUser(req.params.projectId, req.user._id);
  if (!project) throw notFound();
  const keys = await developerProjects.listApiKeys(project.id);
  res.setHeader("Cache-Control", "no-store");
  res.json({ project: projectResponse(project), keys: keys.map(keyResponse) });
}));

router.post("/projects/:projectId/keys", asyncHandler(async (req, res) => {
  const project = await developerProjects.findProjectForUser(req.params.projectId, req.user._id);
  if (!project) throw notFound();

  const environment = developerApiKeyService.normalizeEnvironment(req.body?.environment || "sandbox");
  if (environment === "production") {
    const error = new Error("Production API keys require Developer Portal approval and MFA.");
    error.statusCode = 403;
    error.code = "PRODUCTION_APPROVAL_REQUIRED";
    throw error;
  }

  const name = cleanName(req.body?.name, "API key name");
  const scopes = normalizeScopes(req.body?.scopes);
  const generated = developerApiKeyService.createApiKey(environment);
  const key = await developerProjects.createApiKey({
    projectId: project.id,
    userId: req.user._id,
    name,
    environment,
    keyPrefix: generated.keyPrefix,
    secretHash: generated.secretHash,
    scopes
  });

  await securityEventService.logSecurityEvent({
    userId: req.user._id,
    sessionId: req.auth.sessionId,
    eventType: "developer_api_key_created",
    actorRole: req.developerMembership.role,
    ipAddress: authService.getRequestIp(req),
    userAgent: authService.getUserAgent(req),
    metadata: { projectId: project.id, keyId: key.id, environment, scopes }
  });
  res.status(201).json({
    key: keyResponse(key),
    secret: generated.value,
    warning: "Copy this secret now. It will not be shown again."
  });
}));

router.delete("/projects/:projectId/keys/:keyId", asyncHandler(async (req, res) => {
  const project = await developerProjects.findProjectForUser(req.params.projectId, req.user._id);
  if (!project) throw notFound();
  const key = await developerProjects.findApiKeyById(project.id, req.params.keyId);
  if (!key) throw notFound("API key not found.");
  if (key.status === "revoked") {
    res.json({ key: keyResponse(key) });
    return;
  }
  const revoked = await developerProjects.revokeApiKey(key.id, req.user._id, "revoked_by_developer");
  if (!revoked) throw notFound("API key not found.");
  await securityEventService.logSecurityEvent({
    userId: req.user._id,
    sessionId: req.auth.sessionId,
    eventType: "developer_api_key_revoked",
    actorRole: req.developerMembership.role,
    ipAddress: authService.getRequestIp(req),
    userAgent: authService.getUserAgent(req),
    metadata: { projectId: project.id, keyId: key.id }
  });
  res.json({ key: keyResponse(revoked) });
}));

router.get("/projects/:projectId/webhooks", asyncHandler(async (req, res) => {
  const project = await developerProjects.findProjectForUser(req.params.projectId, req.user._id);
  if (!project) throw notFound();
  const registrations = await developerWebhooks.listRegistrations(project.id);
  res.setHeader("Cache-Control", "no-store");
  res.json({ project: projectResponse(project), webhooks: registrations.map(webhookResponse) });
}));

router.post("/projects/:projectId/webhooks", asyncHandler(async (req, res) => {
  const project = await developerProjects.findProjectForUser(req.params.projectId, req.user._id);
  if (!project) throw notFound();

  const environment = developerApiKeyService.normalizeEnvironment(req.body?.environment || "sandbox");
  if (environment === "production") {
    const error = new Error("Production webhook registrations require Developer Portal approval.");
    error.statusCode = 403;
    error.code = "PRODUCTION_APPROVAL_REQUIRED";
    throw error;
  }

  const name = developerWebhookService.normalizeName(req.body?.name);
  const payloadVersion = developerWebhookService.normalizePayloadVersion(req.body?.payloadVersion);
  const events = developerWebhookService.normalizeEvents(req.body?.events);
  const url = await developerWebhookService.validateDestination(req.body?.url);
  const secret = developerWebhookService.createSigningSecret();

  try {
    const registration = await developerWebhooks.createRegistration({
      projectId: project.id,
      environment,
      name,
      url,
      payloadVersion,
      events,
      signingSecretCiphertext: developerWebhookService.encryptSecret(secret),
      userId: req.user._id
    });
    await securityEventService.logSecurityEvent({
      userId: req.user._id,
      sessionId: req.auth.sessionId,
      eventType: "developer_webhook_created",
      actorRole: req.developerMembership.role,
      ipAddress: authService.getRequestIp(req),
      userAgent: authService.getUserAgent(req),
      metadata: { projectId: project.id, registrationId: registration.id, environment, payloadVersion, events }
    });
    res.status(201).json({
      webhook: webhookResponse(registration),
      secret,
      warning: "Copy this signing secret now. It will not be shown again."
    });
  } catch (error) {
    if (error.code === "23505") {
      error.statusCode = 409;
      error.code = "WEBHOOK_VERSION_EXISTS";
    }
    throw error;
  }
}));

router.delete("/projects/:projectId/webhooks/:webhookId", asyncHandler(async (req, res) => {
  const project = await developerProjects.findProjectForUser(req.params.projectId, req.user._id);
  if (!project) throw notFound();
  const disabled = await developerWebhooks.disableRegistration(project.id, req.params.webhookId);
  if (!disabled) {
    const registrations = await developerWebhooks.listRegistrations(project.id);
    const existing = registrations.find((registration) => registration.id === req.params.webhookId);
    if (!existing) throw notFound("Webhook registration not found.");
    res.json({ webhook: webhookResponse(existing) });
    return;
  }
  await securityEventService.logSecurityEvent({
    userId: req.user._id,
    sessionId: req.auth.sessionId,
    eventType: "developer_webhook_disabled",
    actorRole: req.developerMembership.role,
    ipAddress: authService.getRequestIp(req),
    userAgent: authService.getUserAgent(req),
    metadata: { projectId: project.id, registrationId: disabled.id }
  });
  res.json({ webhook: webhookResponse(disabled) });
}));

router.post("/projects/:projectId/webhooks/:webhookId/rotate-secret", asyncHandler((req, res) => rotateWebhookSecret(req, res)));
router.post("/projects/:projectId/webhooks/:webhookId/rotate-secret/compromised", asyncHandler((req, res) => rotateWebhookSecret(req, res, { immediate: true })));

router.get("/projects/:projectId/webhooks/:webhookId/deliveries", asyncHandler(async (req, res) => {
  const project = await developerProjects.findProjectForUser(req.params.projectId, req.user._id);
  if (!project) throw notFound();
  const registrations = await developerWebhooks.listRegistrations(project.id);
  const registration = registrations.find((item) => item.id === req.params.webhookId);
  if (!registration) throw notFound("Webhook registration not found.");
  const deliveries = await developerWebhookDeliveries.listDeliveries(project.id, registration.id, req.query?.limit);
  res.setHeader("Cache-Control", "no-store");
  res.json({ webhook: webhookResponse(registration), deliveries: deliveries.map(deliveryResponse) });
}));

router.post("/projects/:projectId/webhooks/:webhookId/deliveries/:deliveryId/replay", asyncHandler(async (req, res) => {
  const project = await developerProjects.findProjectForUser(req.params.projectId, req.user._id);
  if (!project) throw notFound();
  const delivery = await developerWebhookDeliveries.findDelivery(project.id, req.params.webhookId, req.params.deliveryId);
  if (!delivery) throw notFound("Webhook delivery not found.");
  if (delivery.registrationStatus !== "active") {
    const error = new Error("Webhook registration must be enabled before replaying a delivery.");
    error.statusCode = 409;
    error.code = "WEBHOOK_REGISTRATION_DISABLED";
    throw error;
  }
  if (delivery.expiresAt && new Date(delivery.expiresAt).getTime() <= Date.now()) {
    const error = new Error("Webhook delivery replay retention has expired.");
    error.statusCode = 410;
    error.code = "WEBHOOK_REPLAY_EXPIRED";
    throw error;
  }
  if (delivery.status === "processing") {
    const error = new Error("Webhook delivery is currently being sent automatically.");
    error.statusCode = 409;
    error.code = "WEBHOOK_DELIVERY_BUSY";
    throw error;
  }

  const dispatcher = developerWebhookDispatcher.createDeveloperWebhookDispatcher();
  let replay;
  try {
    try {
      const result = await dispatcher.deliver(delivery);
      replay = { status: "sent", responseStatus: result.status };
    } catch (error) {
      replay = {
        status: "failed",
        responseStatus: error.responseStatus == null ? null : Number(error.responseStatus),
        error: String(error.message || "Webhook delivery failed").slice(0, 500)
      };
    }
  } finally {
    await dispatcher.stop();
  }
  await developerWebhookDeliveries.recordManualAttempt(delivery.id, {
    error: replay.error,
    responseStatus: replay.responseStatus
  });
  await securityEventService.logSecurityEvent({
    userId: req.user._id,
    sessionId: req.auth.sessionId,
    eventType: "developer_webhook_replayed",
    actorRole: req.developerMembership.role,
    ipAddress: authService.getRequestIp(req),
    userAgent: authService.getUserAgent(req),
    metadata: { projectId: project.id, registrationId: delivery.registrationId, deliveryId: delivery.id, result: replay.status }
  });
  res.json({ replay, delivery: deliveryResponse({ ...delivery, manualAttemptCount: delivery.manualAttemptCount + 1, lastManualAttemptAt: new Date().toISOString(), manualLastError: replay.error || null, manualResponseStatus: replay.responseStatus }) });
}));

module.exports = router;
