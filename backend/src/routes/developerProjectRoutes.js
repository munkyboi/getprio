const express = require("express");
const db = require("../config/db");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticateDeveloper } = require("../middleware/developerAuth");
const authService = require("../services/authService");
const developerProjects = require("../repositories/developerProjects");
const developerApiKeyService = require("../services/developerApiKeyService");
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

function notFound(message = "Project not found or you do not have access to it.") {
  const error = new Error(message);
  error.statusCode = 404;
  error.code = "DEVELOPER_RESOURCE_NOT_FOUND";
  return error;
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

module.exports = router;
