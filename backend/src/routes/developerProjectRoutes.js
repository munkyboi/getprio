const express = require("express");
const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const db = require("../config/db");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticateDeveloper } = require("../middleware/developerAuth");
const authService = require("../services/authService");
const developerProjects = require("../repositories/developerProjects");
const developerTestAccounts = require("../repositories/developerTestAccounts");
const developerQueues = require("../repositories/developerQueues");
const developerWebhooks = require("../repositories/developerWebhooks");
const developerWebhookDeliveries = require("../repositories/developerWebhookDeliveries");
const developerWebhookSuspensions = require("../repositories/developerWebhookSuspensions");
const developerApiKeyService = require("../services/developerApiKeyService");
const developerWebhookService = require("../services/developerWebhookService");
const developerWebhookDispatcher = require("../services/developerWebhookDispatcher");
const securityEventService = require("../services/securityEventService");
const { productionApprovalResponse } = require("../utils/developerProductionApproval");
const { normalizeDeveloperQueueSettings } = require("../utils/developerQueueSettings");

const router = express.Router();
const VALID_SCOPES = new Set([
  "profiles:read",
  "profiles:write",
  "queues:read",
  "queues:write",
  "webhooks:read",
  "webhooks:write"
]);

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

function workspaceEnvironment(value) {
  const environment = developerApiKeyService.normalizeEnvironment(value || "sandbox");
  if (environment === "production") {
    const error = new Error("Production resources require Developer Portal approval and MFA.");
    error.statusCode = 403;
    error.code = "PRODUCTION_APPROVAL_REQUIRED";
    throw error;
  }
  return environment;
}

function cleanSlug(value, label) {
  const slug = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(slug)) {
    const error = new Error(`${label} must be a lowercase URL-safe slug.`);
    error.statusCode = 400;
    error.code = "INVALID_SLUG";
    throw error;
  }
  return slug;
}

function cleanDisplayName(value, label) {
  const name = String(value || "").trim();
  if (!name || name.length > 120) {
    const error = new Error(`${label} must be between 1 and 120 characters.`);
    error.statusCode = 400;
    error.code = "INVALID_NAME";
    throw error;
  }
  return name;
}

function cleanDirectoryContent(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    const error = new Error("directoryContent must be an object.");
    error.statusCode = 400;
    error.code = "INVALID_DIRECTORY_CONTENT";
    throw error;
  }
  onlyFields(value, new Set(["description", "websiteUrl"]));
  const description = value.description === undefined ? "" : String(value.description).trim();
  if (description.length > 1000) {
    const error = new Error("Directory description must be at most 1000 characters.");
    error.statusCode = 400;
    error.code = "INVALID_DIRECTORY_CONTENT";
    throw error;
  }
  const websiteUrl = value.websiteUrl === undefined || value.websiteUrl === null ? "" : String(value.websiteUrl).trim();
  if (websiteUrl && !/^https?:\/\/[^\s]+$/i.test(websiteUrl)) {
    const error = new Error("Website URL must use http or https.");
    error.statusCode = 400;
    error.code = "INVALID_DIRECTORY_CONTENT";
    throw error;
  }
  return { description, websiteUrl };
}

const PRODUCTION_APPROVAL_FIELDS = new Set([
  "applicationName", "purpose", "intendedIndustries", "expectedTicketVolume",
  "customerDataFields", "mobileLinking", "websiteUrl"
]);

function cleanText(value, label, maxLength) {
  const text = String(value ?? "").trim();
  if (!text || text.length > maxLength) {
    const error = new Error(`${label} must be between 1 and ${maxLength} characters.`);
    error.statusCode = 400;
    error.code = "INVALID_PRODUCTION_APPLICATION";
    throw error;
  }
  return text;
}

function cleanList(value, label, maxItems, itemMaxLength) {
  if (!Array.isArray(value) || value.length < 1 || value.length > maxItems) {
    const error = new Error(`${label} must contain between 1 and ${maxItems} items.`);
    error.statusCode = 400;
    error.code = "INVALID_PRODUCTION_APPLICATION";
    throw error;
  }
  const values = value.map((item) => cleanText(item, label, itemMaxLength));
  return [...new Set(values)];
}

function cleanBoolean(value, label) {
  if (typeof value !== "boolean") {
    const error = new Error(`${label} must be a boolean.`);
    error.statusCode = 400;
    error.code = "INVALID_PRODUCTION_APPLICATION";
    throw error;
  }
  return value;
}

function cleanWebsiteUrl(value) {
  const websiteUrl = value === null || value === undefined ? "" : String(value).trim();
  if (websiteUrl && !/^https?:\/\/[^\s]+$/i.test(websiteUrl)) {
    const error = new Error("Website URL must use http or https.");
    error.statusCode = 400;
    error.code = "INVALID_PRODUCTION_APPLICATION";
    throw error;
  }
  if (websiteUrl.length > 500) {
    const error = new Error("Website URL must be at most 500 characters.");
    error.statusCode = 400;
    error.code = "INVALID_PRODUCTION_APPLICATION";
    throw error;
  }
  return websiteUrl;
}

const PRODUCTION_APPLICATION_FIELD_CLEANERS = [
  { key: "applicationName", clean: (value) => cleanText(value, "Application name", 120) },
  { key: "purpose", clean: (value) => cleanText(value, "Purpose", 2000) },
  { key: "intendedIndustries", clean: (value) => cleanList(value, "Intended industries", 20, 80) },
  { key: "expectedTicketVolume", clean: (value) => cleanText(value, "Expected ticket volume", 120) },
  { key: "customerDataFields", clean: (value) => cleanList(value, "Customer data fields", 30, 100) },
  { key: "mobileLinking", clean: (value) => cleanBoolean(value, "mobileLinking") },
  { key: "websiteUrl", clean: cleanWebsiteUrl }
];

function cleanProductionApplicationFields(body, { partial = false } = {}) {
  onlyFields(body, PRODUCTION_APPROVAL_FIELDS);
  const result = {};
  for (const field of PRODUCTION_APPLICATION_FIELD_CLEANERS) {
    if (body[field.key] !== undefined || !partial) result[field.key] = field.clean(body[field.key]);
  }
  return result;
}

function onlyFields(body, fields) {
  const unexpected = Object.keys(body || {}).filter((key) => !fields.has(key));
  if (unexpected.length) {
    const error = new Error(`Unsupported fields: ${unexpected.join(", ")}.`);
    error.statusCode = 400;
    error.code = "INVALID_REQUEST";
    throw error;
  }
}

function cleanResourceVersion(value) {
  const version = Number(value);
  if (!Number.isSafeInteger(version) || version < 1) {
    const error = new Error("resourceVersion must be a positive integer.");
    error.statusCode = 400;
    error.code = "INVALID_RESOURCE_VERSION";
    throw error;
  }
  return version;
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
    profileAccess: key.profileAccess,
    profileSlugs: key.profileSlugs,
    status: key.status,
    lastUsedAt: key.lastUsedAt,
    revokedAt: key.revokedAt,
    createdAt: key.createdAt,
    updatedAt: key.updatedAt
  };
}

async function normalizeProfileAccess(projectId, environment, value, profileSlugs) {
  const access = String(value || "all").trim().toLowerCase();
  if (access === "all") return null;
  if (access !== "selected") {
    const error = new Error("profileAccess must be all or selected.");
    error.statusCode = 400;
    error.code = "INVALID_PROFILE_ACCESS";
    throw error;
  }
  if (!Array.isArray(profileSlugs) || !profileSlugs.length) {
    const error = new Error("Select at least one profile.");
    error.statusCode = 400;
    error.code = "INVALID_PROFILE_ACCESS";
    throw error;
  }
  const normalized = [...new Set(profileSlugs.map((value) => cleanSlug(value, "profile slug")))];
  const profiles = await developerQueues.listProfiles(projectId, environment);
  const available = new Set(profiles.map((profile) => profile.slug));
  if (normalized.some((profileSlug) => !available.has(profileSlug))) {
    const error = new Error("One or more selected profiles do not exist in this project.");
    error.statusCode = 400;
    error.code = "INVALID_PROFILE_ACCESS";
    throw error;
  }
  return normalized;
}

function profileResponse(profile) {
  return {
    id: profile.id,
    projectId: profile.projectId,
    environment: profile.environment,
    slug: profile.slug,
    displayName: profile.displayName,
    directoryStatus: profile.directoryStatus,
    directoryContent: profile.directoryContent || {},
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt
  };
}

function queueResponse(queue) {
  return {
    id: queue.id,
    profileId: queue.profileId,
    slug: queue.slug,
    displayName: queue.displayName,
    sessionState: queue.sessionState,
    intakeEnabled: queue.intakeEnabled,
    queuePrefix: queue.queuePrefix,
    averageServiceMinutes: queue.averageServiceMinutes,
    notificationThreshold: queue.notificationThreshold,
    joiningEnabled: queue.joiningEnabled,
    priorityRatio: queue.priorityRatio,
    resourceVersion: queue.resourceVersion,
    createdAt: queue.createdAt,
    updatedAt: queue.updatedAt
  };
}

function ticketResponse(ticket) {
  if (!ticket) return null;
  return {
    id: ticket.id,
    projectId: ticket.projectId,
    environment: ticket.environment,
    profileId: ticket.profileId,
    queueId: ticket.queueId,
    ticketNumber: ticket.ticketNumber,
    sequence: ticket.sequence,
    displayLabel: ticket.displayLabel,
    externalReference: ticket.externalReference,
    status: ticket.status,
    statusReason: ticket.statusReason,
    calledAt: ticket.calledAt,
    servedAt: ticket.servedAt,
    skippedAt: ticket.skippedAt,
    cancelledAt: ticket.cancelledAt,
    unservedAt: ticket.unservedAt,
    terminalAt: ticket.terminalAt,
    resourceVersion: ticket.resourceVersion,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt
  };
}

function queueSnapshotResponse(snapshot) {
  return {
    queue: queueResponse(snapshot.queue),
    stats: snapshot.stats,
    current: ticketResponse(snapshot.current),
    nextUp: snapshot.nextUp.map(ticketResponse),
    overflow: snapshot.overflow.map(ticketResponse),
    skipped: (snapshot.skipped || []).map(ticketResponse)
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

function suspensionResponse(suspension) {
  if (!suspension) return null;
  return {
    id: suspension.id,
    projectId: suspension.projectId,
    environment: suspension.environment,
    status: suspension.status,
    reason: suspension.reason,
    suspendedAt: suspension.suspendedAt,
    reinstatedAt: suspension.reinstatedAt
  };
}

function notFound(message = "Project not found or you do not have access to it.") {
  const error = new Error(message);
  error.statusCode = 404;
  error.code = "DEVELOPER_RESOURCE_NOT_FOUND";
  return error;
}

function resourceDeletionError(error, resourceName) {
  if (error.code === "23503") {
    error.statusCode = 409;
    error.code = "RESOURCE_HAS_TICKET_HISTORY";
    error.message = `This ${resourceName} has ticket history and cannot be deleted.`;
  }
  return error;
}

const SANDBOX_TEST_ACCOUNT_TTL_DAYS = 7;
const SANDBOX_TEST_USERNAME_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const SANDBOX_TEST_PASSWORD_CHARSETS = [
  "ABCDEFGHJKLMNPQRSTUVWXYZ",
  "abcdefghijkmnopqrstuvwxyz",
  "23456789",
  "!@#$%^&*"
];

function randomSandboxCharacters(alphabet, length) {
  return Array.from({ length }, () => alphabet[crypto.randomInt(0, alphabet.length)]);
}

function createSandboxTestPassword() {
  const characters = SANDBOX_TEST_PASSWORD_CHARSETS.flatMap((charset) => randomSandboxCharacters(charset, 1));
  const alphabet = SANDBOX_TEST_PASSWORD_CHARSETS.join("");
  characters.push(...randomSandboxCharacters(alphabet, 8 - characters.length));
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.randomInt(0, index + 1);
    [characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]];
  }
  return characters.join("");
}

function createSandboxTestIdentity() {
  const suffix = randomSandboxCharacters(SANDBOX_TEST_USERNAME_ALPHABET, 8).join("");
  return { username: `sb_${suffix}`, email: `sb-${suffix}@test.getprio.invalid` };
}

function sandboxTestAccountResponse(account) {
  return {
    id: account.id,
    projectId: account.projectId,
    slot: account.slot,
    username: account.username,
    email: account.email,
    status: account.status,
    expiresAt: account.expiresAt,
    deviceCount: account.deviceCount,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt
  };
}

function sandboxCredentials(account, password) {
  return {
    username: account.username,
    email: account.email,
    password,
    expiresAt: account.expiresAt
  };
}

function sandboxExpiry() {
  return new Date(Date.now() + SANDBOX_TEST_ACCOUNT_TTL_DAYS * 24 * 60 * 60 * 1000);
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

router.get("/projects/:projectId/sandbox/allowance", asyncHandler(async (req, res) => {
  const project = await developerProjects.findProjectForUser(req.params.projectId, req.user._id);
  if (!project) throw notFound();
  const allowance = await developerProjects.getSandboxAllowance(project.id);
  const now = new Date();
  const resetAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  res.setHeader("Cache-Control", "no-store");
  res.json({ project: projectResponse(project), allowance: { ...allowance, resetAt: resetAt.toISOString() } });
}));

router.get("/projects/:projectId/sandbox/test-accounts", asyncHandler(async (req, res) => {
  const project = await developerProjects.findProjectForUser(req.params.projectId, req.user._id);
  if (!project) throw notFound();
  const testAccounts = await developerTestAccounts.list(project.id);
  res.setHeader("Cache-Control", "no-store");
  res.json({ project: projectResponse(project), testAccounts, limit: developerTestAccounts.MAX_ACCOUNTS });
}));

router.post("/projects/:projectId/sandbox/test-accounts", asyncHandler(async (req, res) => {
  const project = await developerProjects.findProjectForUser(req.params.projectId, req.user._id);
  if (!project) throw notFound();
  const password = createSandboxTestPassword();
  const identity = createSandboxTestIdentity();
  const expiresAt = sandboxExpiry();
  const passwordHash = await bcrypt.hash(password, 10);
  const account = await db.withTransaction((client) => developerTestAccounts.create({
    projectId: project.id,
    name: `Sandbox tester ${identity.username.slice(-6)}`,
    username: identity.username,
    email: identity.email,
    passwordHash,
    expiresAt
  }, { client }));
  if (!account) throw notFound();
  await securityEventService.logSecurityEvent({
    userId: req.user._id,
    sessionId: req.auth.sessionId,
    eventType: "developer_sandbox_test_account_created",
    actorRole: req.developerMembership.role,
    ipAddress: authService.getRequestIp(req),
    userAgent: authService.getUserAgent(req),
    metadata: { projectId: project.id, testAccountId: account.id, slot: account.slot }
  });
  res.status(201).json({
    project: projectResponse(project),
    testAccount: sandboxTestAccountResponse(account),
    credentials: sandboxCredentials(account, password),
    warning: "Copy these credentials now. The password will not be shown again."
  });
}));

router.post("/projects/:projectId/sandbox/test-accounts/:accountId/reset", asyncHandler(async (req, res) => {
  const project = await developerProjects.findProjectForUser(req.params.projectId, req.user._id);
  if (!project) throw notFound();
  const password = createSandboxTestPassword();
  const expiresAt = sandboxExpiry();
  const passwordHash = await bcrypt.hash(password, 10);
  const account = await db.withTransaction((client) => developerTestAccounts.reset(project.id, req.params.accountId, {
    passwordHash,
    expiresAt
  }, { client }));
  if (!account) throw notFound("Sandbox test account not found.");
  await securityEventService.logSecurityEvent({
    userId: req.user._id,
    sessionId: req.auth.sessionId,
    eventType: "developer_sandbox_test_account_reset",
    actorRole: req.developerMembership.role,
    ipAddress: authService.getRequestIp(req),
    userAgent: authService.getUserAgent(req),
    metadata: { projectId: project.id, testAccountId: account.id, slot: account.slot }
  });
  res.json({
    project: projectResponse(project),
    testAccount: sandboxTestAccountResponse(account),
    credentials: sandboxCredentials(account, password),
    warning: "Copy these credentials now. The previous password, sessions, and registered devices were removed."
  });
}));

router.get("/projects/:projectId/usage", asyncHandler(async (req, res) => {
  const project = await developerProjects.findProjectForUser(req.params.projectId, req.user._id);
  if (!project) throw notFound();
  const environment = workspaceEnvironment(req.query?.environment || "sandbox");
  const [usage, allowance] = await Promise.all([
    developerQueues.getUsage(project.id, environment),
    developerProjects.getSandboxAllowance(project.id)
  ]);
  const now = new Date();
  const resetAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  res.setHeader("Cache-Control", "no-store");
  res.json({
    project: projectResponse(project),
    environment,
    allowance: { ...allowance, resetAt: resetAt.toISOString() },
    ...usage
  });
}));

router.get("/projects/:projectId/production-approval", asyncHandler(async (req, res) => {
  const project = await developerProjects.findProjectForUser(req.params.projectId, req.user._id);
  if (!project) throw notFound();
  const approval = await developerProjects.getProductionApproval(project.id);
  res.setHeader("Cache-Control", "no-store");
  res.json({ project: projectResponse(project), approval: productionApprovalResponse(approval) });
}));

router.put("/projects/:projectId/production-approval", asyncHandler(async (req, res) => {
  const project = await developerProjects.findProjectForUser(req.params.projectId, req.user._id);
  if (!project) throw notFound();
  const changes = cleanProductionApplicationFields(req.body || {}, { partial: true });
  if (!Object.keys(changes).length) {
    const error = new Error("Provide at least one production application field to save.");
    error.statusCode = 400;
    error.code = "INVALID_PRODUCTION_APPLICATION";
    throw error;
  }
  const approval = await developerProjects.mergeProductionApprovalDraft({ projectId: project.id, changes });
  await securityEventService.logSecurityEvent({
    userId: req.user._id,
    sessionId: req.auth.sessionId,
    eventType: "developer_production_application_draft_saved",
    actorRole: req.developerMembership.role,
    ipAddress: authService.getRequestIp(req),
    userAgent: authService.getUserAgent(req),
    metadata: { projectId: project.id, fields: Object.keys(changes) }
  });
  res.json({ project: projectResponse(project), approval: productionApprovalResponse(approval) });
}));

router.post("/projects/:projectId/production-approval", asyncHandler(async (req, res) => {
  const project = await developerProjects.findProjectForUser(req.params.projectId, req.user._id);
  if (!project) throw notFound();
  if (project.accessRole !== "owner") {
    const error = new Error("Only the Developer Portal owner can submit a production application.");
    error.statusCode = 403;
    error.code = "DEVELOPER_OWNER_REQUIRED";
    throw error;
  }
  const current = await developerProjects.getProductionApproval(project.id);
  if (!current) {
    const error = new Error("Save the production application before submitting it for review.");
    error.statusCode = 400;
    error.code = "PRODUCTION_APPLICATION_INCOMPLETE";
    throw error;
  }
  const snapshot = cleanProductionApplicationFields(current.draft || {});
  const approval = await db.withTransaction((client) => developerProjects.submitProductionApproval({ projectId: project.id, userId: req.user._id, snapshot }, { client }));
  if (!approval) throw notFound("Production application not found.");
  await securityEventService.logSecurityEvent({
    userId: req.user._id,
    sessionId: req.auth.sessionId,
    eventType: "developer_production_application_submitted",
    actorRole: req.developerMembership.role,
    ipAddress: authService.getRequestIp(req),
    userAgent: authService.getUserAgent(req),
    metadata: { projectId: project.id, version: approval?.submission?.version, fields: Object.keys(snapshot) }
  });
  res.status(201).json({ project: projectResponse(project), approval: productionApprovalResponse(approval) });
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

router.get("/projects/:projectId/profiles", asyncHandler(async (req, res) => {
  const project = await developerProjects.findProjectForUser(req.params.projectId, req.user._id);
  if (!project) throw notFound();
  const environment = workspaceEnvironment(req.query?.environment || "sandbox");
  const profiles = await developerQueues.listProfiles(project.id, environment);
  res.setHeader("Cache-Control", "no-store");
  res.json({ project: projectResponse(project), environment, profiles: profiles.map(profileResponse) });
}));

router.post("/projects/:projectId/profiles", asyncHandler(async (req, res) => {
  const project = await developerProjects.findProjectForUser(req.params.projectId, req.user._id);
  if (!project) throw notFound();
  const environment = workspaceEnvironment(req.body?.environment || "sandbox");
  const slug = cleanSlug(req.body?.slug, "Profile slug");
  const displayName = cleanDisplayName(req.body?.displayName ?? req.body?.display_name, "Profile name");
  try {
    const profile = await developerQueues.createProfile({
      projectId: project.id,
      environment,
      slug,
      displayName,
      userId: req.user._id
    });
    await securityEventService.logSecurityEvent({
      userId: req.user._id,
      sessionId: req.auth.sessionId,
      eventType: "developer_profile_created",
      actorRole: req.developerMembership.role,
      ipAddress: authService.getRequestIp(req),
      userAgent: authService.getUserAgent(req),
      metadata: { projectId: project.id, profileId: profile.id, environment }
    });
    res.status(201).json({ profile: profileResponse(profile) });
  } catch (error) {
    if (error.code === "23505") {
      error.statusCode = 409;
      error.code = "PROFILE_SLUG_EXISTS";
    }
    throw error;
  }
}));

router.patch("/projects/:projectId/profiles/:profileSlug", asyncHandler(async (req, res) => {
  const project = await developerProjects.findProjectForUser(req.params.projectId, req.user._id);
  if (!project) throw notFound();
  const environment = workspaceEnvironment(req.body?.environment || "sandbox");
  onlyFields(req.body, new Set(["environment", "displayName", "display_name", "directoryContent", "directory_content"]));
  const profile = await developerQueues.findProfile(project.id, environment, cleanSlug(req.params.profileSlug, "Profile slug"));
  if (!profile) throw notFound("Profile not found.");
  const changes = {};
  if (req.body?.displayName !== undefined || req.body?.display_name !== undefined) {
    changes.displayName = cleanDisplayName(req.body?.displayName ?? req.body?.display_name, "Profile name");
  }
  const directoryValue = req.body?.directoryContent ?? req.body?.directory_content;
  if (directoryValue !== undefined) {
    changes.directoryContent = cleanDirectoryContent(directoryValue);
    changes.directoryStatus = "draft";
  }
  if (!Object.keys(changes).length) {
    const error = new Error("Provide a profile name or directory content to update.");
    error.statusCode = 400;
    error.code = "NO_PROFILE_CHANGES";
    throw error;
  }
  const updated = await developerQueues.updateProfile(profile.id, changes);
  if (!updated) throw notFound("Profile not found.");
  await securityEventService.logSecurityEvent({
    userId: req.user._id,
    sessionId: req.auth.sessionId,
    eventType: "developer_profile_updated",
    actorRole: req.developerMembership.role,
    ipAddress: authService.getRequestIp(req),
    userAgent: authService.getUserAgent(req),
    metadata: { projectId: project.id, profileId: profile.id, environment, directoryDraft: Boolean(changes.directoryContent != undefined) }
  });
  res.json({ profile: profileResponse(updated) });
}));

router.delete("/projects/:projectId/profiles/:profileSlug", asyncHandler(async (req, res) => {
  const project = await developerProjects.findProjectForUser(req.params.projectId, req.user._id);
  if (!project) throw notFound();
  const environment = workspaceEnvironment(req.query?.environment || req.body?.environment || "sandbox");
  const profile = await developerQueues.findProfile(project.id, environment, cleanSlug(req.params.profileSlug, "Profile slug"));
  if (!profile) throw notFound("Profile not found.");
  try {
    const deleted = await db.withTransaction(async (client) => {
      const keyChanges = await developerProjects.revokeKeysForDeletedProfile(project.id, environment, profile.slug, { client });
      const removed = await developerQueues.deleteProfile(profile.id, { client });
      if (!removed) throw notFound("Profile not found.");
      await securityEventService.logSecurityEvent({
        userId: req.user._id,
        sessionId: req.auth.sessionId,
        eventType: "developer_profile_deleted",
        actorRole: req.developerMembership.role,
        ipAddress: authService.getRequestIp(req),
        userAgent: authService.getUserAgent(req),
        metadata: { projectId: project.id, profileId: profile.id, environment, affectedApiKeys: keyChanges.length }
      }, { client });
      return removed;
    });
    res.json({ profile: profileResponse(deleted) });
  } catch (error) {
    throw resourceDeletionError(error, "profile");
  }
}));

router.get("/projects/:projectId/profiles/:profileSlug/queues", asyncHandler(async (req, res) => {
  const project = await developerProjects.findProjectForUser(req.params.projectId, req.user._id);
  if (!project) throw notFound();
  const environment = workspaceEnvironment(req.query?.environment || "sandbox");
  const profile = await developerQueues.findProfile(project.id, environment, cleanSlug(req.params.profileSlug, "Profile slug"));
  if (!profile) throw notFound("Profile not found.");
  const queues = await developerQueues.listQueues(profile.id);
  const snapshots = await Promise.all(queues.map((queue) => developerQueues.queueSnapshot(queue.id)));
  res.setHeader("Cache-Control", "no-store");
  res.json({ profile: profileResponse(profile), queues: queues.map(queueResponse), snapshots: snapshots.filter(Boolean).map(queueSnapshotResponse) });
}));

router.post("/projects/:projectId/profiles/:profileSlug/queues", asyncHandler(async (req, res) => {
  const project = await developerProjects.findProjectForUser(req.params.projectId, req.user._id);
  if (!project) throw notFound();
  const environment = workspaceEnvironment(req.body?.environment || "sandbox");
  const profile = await developerQueues.findProfile(project.id, environment, cleanSlug(req.params.profileSlug, "Profile slug"));
  if (!profile) throw notFound("Profile not found.");
  const slug = cleanSlug(req.body?.slug, "Queue slug");
  const displayName = cleanDisplayName(req.body?.displayName ?? req.body?.display_name, "Queue name");
  const sessionState = req.body?.sessionState ?? req.body?.session_state ?? "closed";
  if (!["open", "paused", "closing", "closed"].includes(sessionState)) {
    const error = new Error("sessionState is invalid.");
    error.statusCode = 400;
    error.code = "INVALID_QUEUE_STATE";
    throw error;
  }
  const settings = normalizeDeveloperQueueSettings(req.body, slug);
  try {
    const queue = await developerQueues.createQueue({
      profileId: profile.id,
      slug,
      displayName,
      sessionState,
      intakeEnabled: Boolean(req.body?.intakeEnabled ?? req.body?.intake_enabled ?? false),
      ...settings
    });
    await securityEventService.logSecurityEvent({
      userId: req.user._id,
      sessionId: req.auth.sessionId,
      eventType: "developer_queue_created",
      actorRole: req.developerMembership.role,
      ipAddress: authService.getRequestIp(req),
      userAgent: authService.getUserAgent(req),
      metadata: { projectId: project.id, profileId: profile.id, queueId: queue.id, environment }
    });
    res.status(201).json({ queue: queueResponse(queue) });
  } catch (error) {
    if (error.code === "23505") {
      error.statusCode = 409;
      error.code = "QUEUE_SLUG_EXISTS";
    }
    throw error;
  }
}));

router.patch("/projects/:projectId/profiles/:profileSlug/queues/:queueSlug", asyncHandler(async (req, res) => {
  const project = await developerProjects.findProjectForUser(req.params.projectId, req.user._id);
  if (!project) throw notFound();
  const environment = workspaceEnvironment(req.body?.environment || "sandbox");
  onlyFields(req.body, new Set(["environment", "displayName", "display_name", "sessionState", "session_state", "intakeEnabled", "intake_enabled", "queuePrefix", "queue_prefix", "averageServiceMinutes", "average_service_minutes", "notificationThreshold", "notification_threshold", "resourceVersion", "resource_version"]));
  const profile = await developerQueues.findProfile(project.id, environment, cleanSlug(req.params.profileSlug, "Profile slug"));
  if (!profile) throw notFound("Profile not found.");
  const queue = await developerQueues.findQueue(profile.id, cleanSlug(req.params.queueSlug, "Queue slug"));
  if (!queue) throw notFound("Queue not found.");
  const update = {};
  if (req.body?.displayName !== undefined || req.body?.display_name !== undefined) update.displayName = cleanDisplayName(req.body.displayName ?? req.body.display_name, "Queue name");
  if (req.body?.sessionState !== undefined || req.body?.session_state !== undefined) {
    update.sessionState = req.body.sessionState ?? req.body.session_state;
    if (!["open", "paused", "closing", "closed"].includes(update.sessionState)) {
      const error = new Error("sessionState is invalid.");
      error.statusCode = 400;
      error.code = "INVALID_QUEUE_STATE";
      throw error;
    }
  }
  if (req.body?.intakeEnabled !== undefined || req.body?.intake_enabled !== undefined) update.intakeEnabled = Boolean(req.body.intakeEnabled ?? req.body.intake_enabled);
  if (req.body?.queuePrefix !== undefined || req.body?.queue_prefix !== undefined || req.body?.averageServiceMinutes !== undefined || req.body?.average_service_minutes !== undefined || req.body?.notificationThreshold !== undefined || req.body?.notification_threshold !== undefined) {
    Object.assign(update, normalizeDeveloperQueueSettings(req.body, queue.slug, { partial: true }));
  }
  if (!Object.keys(update).length) {
    const error = new Error("Provide a queue name, state, ticket intake setting, or queue configuration to update.");
    error.statusCode = 400;
    error.code = "NO_QUEUE_CHANGES";
    throw error;
  }
  if (req.body?.resourceVersion !== undefined || req.body?.resource_version !== undefined) update.resourceVersion = cleanResourceVersion(req.body.resourceVersion ?? req.body.resource_version);
  const updated = await db.withTransaction(async (client) => {
    const currentQueue = await developerQueues.findQueue(profile.id, queue.slug, { client, forUpdate: true });
    if (!currentQueue) throw notFound("Queue not found.");
    const nextQueue = await developerQueues.updateQueue(currentQueue.id, update, { client });
    if (!nextQueue) {
      const error = new Error("Queue changed before this update was applied. Refresh and try again.");
      error.statusCode = 409;
      error.code = "QUEUE_UPDATE_CONFLICT";
      throw error;
    }

    const queueEvents = [];
    if (update.sessionState !== undefined && update.sessionState !== currentQueue.sessionState) {
      const type = developerWebhookService.queueSessionEventType(update.sessionState);
      if (type) queueEvents.push({ type, fromStatus: currentQueue.sessionState, toStatus: update.sessionState });
    }
    if (Object.prototype.hasOwnProperty.call(update, "intakeEnabled") && update.intakeEnabled !== currentQueue.intakeEnabled) {
      queueEvents.push({
        type: update.intakeEnabled ? "queue.intake.resumed" : "queue.intake.paused",
        fromStatus: String(currentQueue.intakeEnabled),
        toStatus: String(update.intakeEnabled)
      });
    }
    const webhookQueue = { ...nextQueue, projectId: project.id, environment };
    for (const event of queueEvents) {
      const webhookEvent = {
        ...event,
        id: `${nextQueue.id}:${nextQueue.resourceVersion}:${event.type}`,
        resourceVersion: nextQueue.resourceVersion,
        occurredAt: nextQueue.updatedAt,
        source: "developer_portal"
      };
      await developerWebhookService.enqueueDeveloperQueueEvent({
        event: webhookEvent,
        queue: webhookQueue
      }, {
        client,
        renderPayload: (version) => developerWebhookService.renderDeveloperQueueEventPayload({ event: webhookEvent, queue: webhookQueue }, version)
      });
    }
    return nextQueue;
  });
  await securityEventService.logSecurityEvent({
    userId: req.user._id,
    sessionId: req.auth.sessionId,
    eventType: "developer_queue_updated",
    actorRole: req.developerMembership.role,
    ipAddress: authService.getRequestIp(req),
    userAgent: authService.getUserAgent(req),
    metadata: { projectId: project.id, profileId: profile.id, queueId: queue.id, environment, changes: Object.keys(update).filter((key) => key !== "resourceVersion") }
  });
  res.json({ queue: queueResponse(updated) });
}));

router.delete("/projects/:projectId/profiles/:profileSlug/queues/:queueSlug", asyncHandler(async (req, res) => {
  const project = await developerProjects.findProjectForUser(req.params.projectId, req.user._id);
  if (!project) throw notFound();
  const environment = workspaceEnvironment(req.query?.environment || req.body?.environment || "sandbox");
  const profile = await developerQueues.findProfile(project.id, environment, cleanSlug(req.params.profileSlug, "Profile slug"));
  if (!profile) throw notFound("Profile not found.");
  const queue = await developerQueues.findQueue(profile.id, cleanSlug(req.params.queueSlug, "Queue slug"));
  if (!queue) throw notFound("Queue not found.");
  try {
    const deleted = await db.withTransaction(async (client) => {
      const removed = await developerQueues.deleteQueue(queue.id, { client });
      if (!removed) throw notFound("Queue not found.");
      await securityEventService.logSecurityEvent({
        userId: req.user._id,
        sessionId: req.auth.sessionId,
        eventType: "developer_queue_deleted",
        actorRole: req.developerMembership.role,
        ipAddress: authService.getRequestIp(req),
        userAgent: authService.getUserAgent(req),
        metadata: { projectId: project.id, profileId: profile.id, queueId: queue.id, environment }
      }, { client });
      return removed;
    });
    res.json({ queue: queueResponse(deleted) });
  } catch (error) {
    throw resourceDeletionError(error, "queue");
  }
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
  const profileSlugs = await normalizeProfileAccess(project.id, environment, req.body?.profileAccess, req.body?.profileSlugs);
  const generated = developerApiKeyService.createApiKey(environment);
  const key = await developerProjects.createApiKey({
    projectId: project.id,
    userId: req.user._id,
    name,
    environment,
    keyPrefix: generated.keyPrefix,
    secretHash: generated.secretHash,
    scopes,
    profileSlugs
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

router.get("/projects/:projectId/webhook-suspension", asyncHandler(async (req, res) => {
  const project = await developerProjects.findProjectForUser(req.params.projectId, req.user._id);
  if (!project) throw notFound();
  const suspension = await developerWebhookSuspensions.findActive(project.id, "production");
  res.setHeader("Cache-Control", "no-store");
  res.json({ project: projectResponse(project), suspension: suspensionResponse(suspension) });
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
  const suspension = delivery.environment === "production"
    ? await developerWebhookSuspensions.findActive(project.id, delivery.environment)
    : null;
  if (suspension) {
    const error = new Error("Production webhook delivery is temporarily suspended.");
    error.statusCode = 423;
    error.code = "WEBHOOK_DELIVERY_SUSPENDED";
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
