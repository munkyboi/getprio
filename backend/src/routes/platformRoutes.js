const businessCategories = require("../repositories/businessCategories");
const platformHelpCenter = require("../repositories/platformHelpCenter");
const { isValidImageUploadLimit } = require("../utils/imageUploadLimit");
const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate, requirePlatformPermission } = require("../middleware/auth");
const platformRepository = require("../repositories/platform");
const platformRecords = require("../repositories/platformRecords");
const queueJoinPaymentRepository = require("../repositories/queueJoinPayments");
const tenantRepository = require("../repositories/tenants");
const billingRepository = require("../repositories/billing");
const queueFeeService = require("../services/queueFeeService");
const queueJoinPaymentService = require("../services/queueJoinPaymentService");
const subscriptionPlanRepository = require("../repositories/subscriptionPlans");
const organizerCampaignRepository = require("../repositories/organizerCampaigns");
const ratingRepository = require("../repositories/ratings");
const queueDayRepository = require("../repositories/queueDays");
const queueNotificationOutboxRepository = require("../repositories/queueNotificationOutbox");
const paymentProofStorageService = require("../services/paymentProofStorageService");
const queueDayLifecycleService = require("../services/queueDayLifecycleService");
const privilegedTransactionService = require("../services/privilegedTransactionService");
const privilegedPreviewService = require("../services/privilegedPreviewService");
const { validatePlanMutation } = require("../services/planPolicyService");
const { requireIdempotency } = require("../middleware/idempotency");
const securityAuditService = require("../services/securityAuditService");
const securityAuditRepository = require("../repositories/securityAudit");
const authService = require("../services/authService");
const authSessionsRepository = require("../repositories/authSessions");
const sandboxAppleReviewAccountService = require("../services/sandboxAppleReviewAccountService");
const usageCreditService = require("../services/usageCreditService");
const usageCreditRepository = require("../repositories/usageCredits");
const subscriptionLifecycleService = require("../services/subscriptionLifecycleService");
const subscriptionLifecycleRepository = require("../repositories/subscriptionLifecycle");
const { isValidTimeZone, normalizeTimeZone } = require("../utils/timezones");
const { getGlobalPermissions } = require("../services/permissions");
const entitlementOverrideRepository = require("../repositories/entitlementOverrides");
const allowanceLedgerRepository = require("../repositories/allowanceLedger");
const releaseControls = require("../config/releaseControls");
const { assertReleaseControl, requireReleaseControl } = require("../middleware/releaseControl");
const db = require("../config/db");
const developerProjects = require("../repositories/developerProjects");
const developerApiKeyActivity = require("../repositories/developerApiKeyActivity");
const developerWebhookSuspensions = require("../repositories/developerWebhookSuspensions");
const developerApiRateLimits = require("../repositories/developerApiRateLimits");
const { productionApprovalResponse } = require("../utils/developerProductionApproval");
const platformReadModelService = require("../services/platformReadModelService");
const platformReleaseReadinessEvidence = require("../services/platformReleaseReadinessEvidence");
const accountDeletionAdminService = require("../services/accountDeletionAdminService");
const passwordResetService = require("../services/passwordResetService");
const notificationService = require("../services/notificationService");
const passwordResetTokenRepository = require("../repositories/passwordResetTokens");

const router = express.Router();

router.post("/release-readiness/evidence", asyncHandler(async (req, res) => {
  const secret = process.env.PLATFORM_RELEASE_EVIDENCE_SECRET || "";
  const timestamp = String(req.get("x-platform-evidence-timestamp") || "");
  const signature = String(req.get("x-platform-evidence-signature") || "");
  const rawBody = JSON.stringify(req.body || {});
  if (!platformReleaseReadinessEvidence.verifySignature({ secret, timestamp, signature, rawBody })) {
    return res.status(401).json({ message: "Invalid or expired evidence signature." });
  }
  if (!platformReleaseReadinessEvidence.validateReport(req.body)) {
    return res.status(400).json({ message: "Invalid release evidence report." });
  }
  await platformReleaseReadinessEvidence.recordReport(req.body);
  res.setHeader("Cache-Control", "no-store");
  return res.status(202).json({ accepted: true });
}));

router.use(authenticate);

router.get("/help-center", requirePlatformPermission("platform.help_center.manage"), asyncHandler(async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  return res.json(await platformHelpCenter.getAdmin());
}));

router.post("/help-center/drafts", requirePlatformPermission("platform.help_center.manage"), requireIdempotency("platform.help_center.draft.save"), asyncHandler(async (req, res) => {
  const reason = String(req.body?.reason || "").trim().replace(/\s+/g, " ");
  if (reason.length < 8 || reason.length > 500) {
    const error = new Error("Enter an audit reason between 8 and 500 characters.");
    error.statusCode = 400;
    error.code = "INVALID_REASON";
    throw error;
  }
  const result = await db.withTransaction(async (client) => {
    const draft = await platformHelpCenter.saveDraft(req.body?.content, req.user._id, reason, { client });
    await securityAuditService.record({
      actorId: req.user._id, actorRole: "platform_admin", sessionId: req.auth.sessionId,
      action: "platform.help_center.draft.save", resourceType: "help_center_revision",
      resourceId: String(draft.revision), reason, outcome: "success",
      afterState: { revision: draft.revision, articleCount: req.body.content?.articles?.length || 0, faqCount: req.body.content?.faqs?.length || 0 }
    }, { client });
    return draft;
  });
  return res.status(201).json({ draft: result });
}));

router.post("/help-center/publish", requirePlatformPermission("platform.help_center.manage"), requireIdempotency("platform.help_center.publish"), asyncHandler(async (req, res) => {
  const reason = String(req.body?.reason || "").trim().replace(/\s+/g, " ");
  if (reason.length < 8 || reason.length > 500) {
    const error = new Error("Enter an audit reason between 8 and 500 characters.");
    error.statusCode = 400;
    error.code = "INVALID_REASON";
    throw error;
  }
  const result = await db.withTransaction(async (client) => {
    const published = await platformHelpCenter.publishDraft(req.body?.revision, req.user._id, reason, { client });
    await securityAuditService.record({
      actorId: req.user._id, actorRole: "platform_admin", sessionId: req.auth.sessionId,
      action: "platform.help_center.publish", resourceType: "help_center_revision",
      resourceId: String(published.publishedRevision), reason, outcome: "success",
      beforeState: { publishedRevision: published.previousPublishedRevision },
      afterState: { publishedRevision: published.publishedRevision }
    }, { client });
    return published;
  });
  return res.json({ publish: result });
}));

router.post("/help-center/revisions/:revision/restore", requirePlatformPermission("platform.help_center.manage"), requireIdempotency("platform.help_center.revision.restore"), asyncHandler(async (req, res) => {
  const reason = String(req.body?.reason || "").trim().replace(/\s+/g, " ");
  if (reason.length < 8 || reason.length > 500) {
    const error = new Error("Enter an audit reason between 8 and 500 characters.");
    error.statusCode = 400;
    error.code = "INVALID_REASON";
    throw error;
  }
  const result = await db.withTransaction(async (client) => {
    const draft = await platformHelpCenter.restoreRevision(req.params.revision, req.user._id, reason, { client });
    await securityAuditService.record({
      actorId: req.user._id, actorRole: "platform_admin", sessionId: req.auth.sessionId,
      action: "platform.help_center.revision.restore", resourceType: "help_center_revision",
      resourceId: String(draft.revision), reason, outcome: "success",
      afterState: { revision: draft.revision, restoredFromRevision: draft.restoredFromRevision }
    }, { client });
    return draft;
  });
  return res.status(201).json({ draft: result });
}));

router.get("/viewer-context", requirePlatformPermission("platform.tenants.read"), asyncHandler(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  return res.json(await platformReadModelService.getViewerContext(req));
}));

router.get("/overview", requirePlatformPermission("platform.tenants.read"), asyncHandler(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  return res.json(await platformReadModelService.getOverview(req));
}));

router.get("/service-health", requirePlatformPermission("platform.tenants.read"), asyncHandler(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  return res.json(await platformReadModelService.getServiceHealth(req));
}));

router.get("/queues", requirePlatformPermission("platform.tenants.read"), asyncHandler(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  return res.json(await platformReadModelService.getQueueOperations(req));
}));

router.get("/tenants/read-model", requirePlatformPermission("platform.tenants.read"), asyncHandler(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  return res.json(await platformReadModelService.getTenants(req));
}));

router.get("/users/read-model", requirePlatformPermission("platform.users.read"), asyncHandler(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  return res.json(await platformReadModelService.getUsers(req));
}));

router.get("/users/:userId/details", requirePlatformPermission("platform.users.read"), asyncHandler(async (req, res) => {
  if (!/^\d{1,18}$/.test(req.params.userId)) return res.status(400).json({ message: "Invalid user ID." });
  const details = await platformReadModelService.getUserDetails(req, req.params.userId);
  if (!details) return res.status(404).json({ message: "User not found." });
  res.setHeader("Cache-Control", "no-store");
  return res.json(details);
}));

router.get("/account-deletion-requests", requirePlatformPermission("platform.account_deletion.manage"), asyncHandler(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  return res.json({ requests: await accountDeletionAdminService.listRequests() });
}));

router.post(
  "/account-deletion-requests/:requestId/begin-scan",
  requirePlatformPermission("platform.account_deletion.manage"),
  requireIdempotency("platform.account_deletion.scan.begin"),
  asyncHandler(async (req, res) => {
    const reason = String(req.body?.reason || "").trim().replace(/\s+/g, " ");
    if (reason.length < 8 || reason.length > 500) {
      const error = new Error("Enter an audit reason between 8 and 500 characters.");
      error.statusCode = 400;
      error.code = "INVALID_REASON";
      throw error;
    }

    const scan = await db.withTransaction(async (client) => {
      const result = await accountDeletionAdminService.beginScan(req.params.requestId, { client });
      await securityAuditService.record({
        actorId: req.user._id,
        actorRole: "platform_admin",
        sessionId: req.auth.sessionId,
        action: "platform.account_deletion.scan.begin",
        resourceType: "account_deletion_request",
        resourceId: req.params.requestId,
        reason,
        outcome: result.alreadyQueued ? "noop" : "success",
        beforeState: { scanStatus: result.beforeScanStatus },
        afterState: { scanStatus: result.scanStatus }
      }, { client });
      return result;
    });
    return res.status(scan.alreadyQueued ? 200 : 202).json({ scan });
  })
);

router.post(
  "/account-deletion-requests/:requestId/begin-cleanup",
  requirePlatformPermission("platform.account_deletion.manage"),
  requireIdempotency("platform.account_deletion.cleanup.begin"),
  asyncHandler(async (req, res) => {
    const reason = String(req.body?.reason || "").trim().replace(/\s+/g, " ");
    if (reason.length < 8 || reason.length > 500) {
      const error = new Error("Enter an audit reason between 8 and 500 characters.");
      error.statusCode = 400;
      error.code = "INVALID_REASON";
      throw error;
    }
    const result = await db.withTransaction(async (client) => {
      const action = "platform.account_deletion.cleanup.begin";
      const payload = { reportVersion: req.body?.reportVersion, selection: req.body?.selection || {}, references: req.body?.references || {}, exclusions: req.body?.exclusions || {} };
      const preview = await privilegedPreviewService.resolvePreview({ action, target: req.params.requestId, payload }, { client, lock: true });
      await privilegedTransactionService.consumeConfirmation({
        token: req.get("x-transaction-confirmation"), actorId: req.user._id, session: req.auth.session,
        action, target: req.params.requestId, reason, payload,
        previewRevision: req.body?.previewRevision, currentPreviewRevision: preview.revision
      }, { client });
      const cleanup = await accountDeletionAdminService.queueCleanup(req.params.requestId, {
        selection: req.body?.selection,
        referenceSelection: req.body?.references,
        exclusions: req.body?.exclusions,
        reportVersion: req.body?.reportVersion
      }, { client });
      await securityAuditService.record({
        actorId: req.user._id, actorRole: "platform_admin", sessionId: req.auth.sessionId,
        action: "platform.account_deletion.cleanup.begin", resourceType: "account_deletion_request",
        resourceId: req.params.requestId, reason,
        outcome: cleanup.alreadyQueued ? "noop" : "pending",
        beforeState: { cleanupStatus: cleanup.beforeCleanupStatus, scanStatus: preview.state?.[0]?.scan_status },
        afterState: {
          cleanupStatus: cleanup.cleanupStatus,
          selectedCategories: Object.entries(req.body.selection || {}).filter(([, selected]) => selected === true).map(([id]) => id),
          excludedCategories: Object.entries(req.body.selection || {}).filter(([, selected]) => selected === false).map(([id]) => id),
          reviewedReferenceSources: Object.keys(req.body.references || {}).length
        }
      }, { client });
      return cleanup;
    });
    return res.status(result.alreadyQueued ? 200 : 202).json({ cleanup: result });
  })
);

router.post(
  "/account-deletion-requests/:requestId/send-report",
  requirePlatformPermission("platform.account_deletion.manage"),
  requireIdempotency("platform.account_deletion.report.send"),
  asyncHandler(async (req, res) => {
    const reason = String(req.body?.reason || "").trim().replace(/\s+/g, " ");
    if (reason.length < 8 || reason.length > 500) {
      const error = new Error("Enter an audit reason between 8 and 500 characters.");
      error.statusCode = 400;
      error.code = "INVALID_REASON";
      throw error;
    }
    const result = await db.withTransaction(async (client) => {
      const action = "platform.account_deletion.report.send";
      const payload = { requestId: req.params.requestId };
      const preview = await privilegedPreviewService.resolvePreview({ action, target: req.params.requestId, payload }, { client, lock: true });
      await privilegedTransactionService.consumeConfirmation({
        token: req.get("x-transaction-confirmation"), actorId: req.user._id, session: req.auth.session,
        action, target: req.params.requestId, reason, payload,
        previewRevision: req.body?.previewRevision, currentPreviewRevision: preview.revision
      }, { client });
      const report = await accountDeletionAdminService.queueUserReport(req.params.requestId, { client });
      await securityAuditService.record({
        actorId: req.user._id, actorRole: "platform_admin", sessionId: req.auth.sessionId,
        action: "platform.account_deletion.report.send", resourceType: "account_deletion_request",
        resourceId: req.params.requestId, reason,
        outcome: report.alreadyQueued ? "noop" : "pending",
        beforeState: { reportStatus: report.beforeReportStatus, cleanupStatus: preview.state?.[0]?.cleanup_status },
        afterState: { reportStatus: report.reportStatus }
      }, { client });
      return report;
    });
    return res.status(result.alreadyQueued ? 200 : 202).json({ report: result });
  })
);

router.post(
  "/account-deletion-requests/:requestId/tasks/:taskKind/complete",
  requirePlatformPermission("platform.account_deletion.manage"),
  requireIdempotency("platform.account_deletion.task.complete"),
  asyncHandler(async (req, res) => {
    const reason = String(req.body?.reason || "").trim().replace(/\s+/g, " ");
    if (reason.length < 8 || reason.length > 500) {
      const error = new Error("Enter an audit reason between 8 and 500 characters.");
      error.statusCode = 400;
      error.code = "INVALID_REASON";
      throw error;
    }

    const request = await db.withTransaction(async (client) => {
      const result = await accountDeletionAdminService.completeTask({
        requestId: req.params.requestId,
        taskKind: req.params.taskKind,
        evidence: req.body?.evidence,
        retentionNotice: req.body?.retentionNotice
      }, { client });
      await securityAuditService.record({
        actorId: req.user._id,
        actorRole: "platform_admin",
        sessionId: req.auth.sessionId,
        action: "platform.account_deletion.task.complete",
        resourceType: "account_deletion_request",
        resourceId: req.params.requestId,
        reason,
        outcome: "success",
        beforeState: { taskKind: req.params.taskKind, status: "pending" },
        afterState: { taskKind: req.params.taskKind, status: "completed", readyForErasure: result.readyForErasure }
      }, { client });
      return result;
    });
    return res.json({ request });
  })
);

router.get("/security-audit/read-model", requirePlatformPermission("platform.security_audit.read"), asyncHandler(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  return res.json(await platformReadModelService.getSecurityAudit(req));
}));

router.get("/billing/read-model", requirePlatformPermission("platform.billing.read"), asyncHandler(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  return res.json(await platformReadModelService.getBilling(req));
}));

router.get("/moderation/read-model", requirePlatformPermission("platform.users.read"), asyncHandler(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  return res.json(await platformReadModelService.getModeration(req));
}));

router.get("/settings/read-model", requirePlatformPermission("platform.settings.manage"), asyncHandler(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  return res.json(await platformReadModelService.getSettings(req));
}));

router.get("/release-readiness/read-model", requirePlatformPermission("platform.release_readiness.read"), asyncHandler(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  return res.json(await platformReadModelService.getReleaseReadiness(req));
}));

router.get("/developer-projects/read-model", requirePlatformPermission("platform.developer_api.manage"), asyncHandler(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  return res.json(await platformReadModelService.getDeveloperProjects(req));
}));

router.get("/developer-projects/:projectId/governance", requirePlatformPermission("platform.developer_api.manage"), asyncHandler(async (req, res) => {
  const readModel = await platformReadModelService.getDeveloperProjectGovernance(req, req.params.projectId);
  if (!readModel) return res.status(404).json({ message: "Active developer project not found." });
  res.setHeader("Cache-Control", "no-store");
  return res.json(readModel);
}));

function cleanDeveloperSecurityReason(value, label = "Reason") {
  const reason = String(value || "").trim();
  if (reason.length < 1 || reason.length > 500) {
    const error = new Error(`${label} must be between 1 and 500 characters.`);
    error.statusCode = 400;
    error.code = "INVALID_REASON";
    throw error;
  }
  return reason;
}

function developerSuspensionResponse(suspension) {
  if (!suspension) return null;
  return {
    id: suspension.id,
    projectId: suspension.projectId,
    environment: suspension.environment,
    status: suspension.status,
    reason: suspension.reason,
    suspendedByUserId: suspension.suspendedByUserId,
    suspendedAt: suspension.suspendedAt,
    reinstatedByUserId: suspension.reinstatedByUserId,
    reinstatementReason: suspension.reinstatementReason,
    reinstatedAt: suspension.reinstatedAt
  };
}

function cleanDeveloperProductionReview(body = {}) {
  const status = String(body.status || "").trim();
  if (!["approved", "changes_requested", "rejected"].includes(status)) {
    const error = new Error("status must be approved, changes_requested, or rejected.");
    error.statusCode = 400;
    error.code = "INVALID_PRODUCTION_REVIEW";
    throw error;
  }
  const feedback = String(body.feedback || "").trim();
  if (["changes_requested", "rejected"].includes(status) && (!feedback || feedback.length > 2000)) {
    const error = new Error("feedback is required for changes_requested and rejected reviews and must be at most 2000 characters.");
    error.statusCode = 400;
    error.code = "INVALID_PRODUCTION_REVIEW";
    throw error;
  }
  if (feedback.length > 2000) {
    const error = new Error("feedback must be at most 2000 characters.");
    error.statusCode = 400;
    error.code = "INVALID_PRODUCTION_REVIEW";
    throw error;
  }
  return { status, feedback };
}

router.get("/developer-projects", requirePlatformPermission("platform.developer_api.manage"), asyncHandler(async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  return res.json({ projects: await developerProjects.listProjectsForPlatform() });
}));

router.get("/developer-projects/:projectId/api-keys", requirePlatformPermission("platform.developer_api.manage"), asyncHandler(async (req, res) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.params.projectId)) return res.status(400).json({ message: "Developer project ID is invalid." });
  const project = await developerProjects.findProjectById(req.params.projectId);
  if (!project) return res.status(404).json({ message: "Developer project not found." });
  const [keys, activityRows] = await Promise.all([
    developerProjects.listApiKeys(project.id),
    developerApiKeyActivity.listForProject(project.id)
  ]);
  const activityByKeyId = new Map(activityRows.map((activity) => [activity.keyId, activity]));
  res.setHeader("Cache-Control", "no-store");
  return res.json({
    project: { id: project.id, name: project.name, status: project.status },
    keys: keys.map((key) => {
      const activity = activityByKeyId.get(key.id) || { keyId: key.id, requests: 0, reads: 0, writes: 0, clientErrors: 0, serverErrors: 0, rateLimited: 0, authFailures: 0, lastSeenAt: null };
      const signal = activity.rateLimited > 0 || activity.authFailures > 0 || activity.serverErrors >= 3 ? "review" : "normal";
      return {
        id: key.id,
        name: key.name,
        environment: key.environment,
        keyPrefix: key.keyPrefix,
        scopes: key.scopes,
        status: key.status,
        createdAt: key.createdAt,
        lastUsedAt: key.lastUsedAt,
        revokedAt: key.revokedAt,
        revokeReason: key.revokeReason,
        activity,
        signal
      };
    })
  });
}));

router.post("/developer-projects/:projectId/api-keys/:keyId/revoke", requirePlatformPermission("platform.developer_api.manage"), requireIdempotency("platform.developer_api_key.revoke"), asyncHandler(async (req, res) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.params.projectId) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.params.keyId)) return res.status(400).json({ message: "Developer project or API key ID is invalid." });
  const reason = String(req.body?.reason || "").trim().replace(/\s+/g, " ");
  if (reason.length < 8 || reason.length > 500) {
    const error = new Error("Enter an audit reason between 8 and 500 characters.");
    error.statusCode = 400;
    error.code = "INVALID_REASON";
    throw error;
  }
  const project = await developerProjects.findProjectById(req.params.projectId);
  if (!project) return res.status(404).json({ message: "Developer project not found." });
  const key = await db.withTransaction(async (client) => {
    const before = await developerProjects.findApiKeyById(project.id, req.params.keyId, { client });
    if (!before) {
      const error = new Error("Developer API key not found in this project.");
      error.statusCode = 404;
      error.code = "DEVELOPER_API_KEY_NOT_FOUND";
      throw error;
    }
    if (before.status !== "active") {
      const error = new Error("This API key has already been revoked.");
      error.statusCode = 409;
      error.code = "DEVELOPER_API_KEY_ALREADY_REVOKED";
      throw error;
    }
    const revoked = await developerProjects.revokeApiKeyForPlatform(project.id, before.id, reason, { client });
    if (!revoked) {
      const error = new Error("The API key changed before revocation completed. Refresh and retry.");
      error.statusCode = 409;
      error.code = "DEVELOPER_API_KEY_CHANGED";
      throw error;
    }
    await securityAuditService.record({
      actorId: req.user._id,
      actorRole: "platform_admin",
      sessionId: req.auth.sessionId,
      action: "developer.api_key.revoke",
      resourceType: "developer_api_key",
      resourceId: revoked.id,
      reason,
      outcome: "success",
      beforeState: { projectId: project.id, environment: before.environment, status: before.status, keyPrefix: before.keyPrefix },
      afterState: { projectId: project.id, environment: revoked.environment, status: revoked.status, keyPrefix: revoked.keyPrefix }
    }, { client });
    return revoked;
  });
  res.setHeader("Cache-Control", "no-store");
  return res.json({ key: { id: key.id, projectId: key.projectId, name: key.name, environment: key.environment, keyPrefix: key.keyPrefix, scopes: key.scopes, status: key.status, revokedAt: key.revokedAt, revokeReason: key.revokeReason } });
}));

router.post("/developer-projects/:projectId/sandbox/test-accounts/apple-review", requirePlatformPermission("platform.developer_api.manage"), requireIdempotency("platform.developer_sandbox.apple_review.create"), asyncHandler(async (req, res) => {
  const project = await developerProjects.findProjectById(req.params.projectId);
  if (!project || project.status !== "active") return res.status(404).json({ message: "Active developer project not found." });
  const result = await sandboxAppleReviewAccountService.create({
    projectId: project.id,
    actorId: req.user._id,
    sessionId: req.auth.sessionId,
    ipAddress: authService.getRequestIp(req),
    userAgent: authService.getUserAgent(req)
  });
  return res.status(201).json({ project: { id: project.id, name: project.name, status: project.status }, ...result });
}));

router.post("/developer-projects/:projectId/sandbox/test-accounts/:accountId/reset", requirePlatformPermission("platform.developer_api.manage"), requireIdempotency("platform.developer_sandbox.apple_review.reset"), asyncHandler(async (req, res) => {
  const project = await developerProjects.findProjectById(req.params.projectId);
  if (!project || project.status !== "active") return res.status(404).json({ message: "Active developer project not found." });
  const result = await sandboxAppleReviewAccountService.reset({
    projectId: project.id,
    accountId: req.params.accountId,
    actorId: req.user._id,
    sessionId: req.auth.sessionId,
    ipAddress: authService.getRequestIp(req),
    userAgent: authService.getUserAgent(req)
  });
  return res.json({ project: { id: project.id, name: project.name, status: project.status }, ...result });
}));

router.get("/developer-projects/:projectId/webhook-suspension", requirePlatformPermission("platform.developer_api.manage"), asyncHandler(async (req, res) => {
  const project = await developerProjects.findProjectById(req.params.projectId);
  if (!project) return res.status(404).json({ message: "Developer project not found." });
  const suspension = await developerWebhookSuspensions.findActive(project.id, "production");
  return res.json({ project: { id: project.id, name: project.name, status: project.status }, suspension: developerSuspensionResponse(suspension) });
}));

router.post("/developer-projects/:projectId/webhook-suspension", requirePlatformPermission("platform.developer_api.manage"), requireIdempotency("platform.developer_webhook_suspension.suspend"), asyncHandler(async (req, res) => {
  const project = await developerProjects.findProjectById(req.params.projectId);
  if (!project || project.status !== "active") return res.status(404).json({ message: "Active developer project not found." });
  const reason = cleanDeveloperSecurityReason(req.body?.reason);
  const suspension = await developerWebhookSuspensions.suspend({ projectId: project.id, userId: req.user._id, reason });
  await securityAuditService.record({ actorId: req.user._id, actorRole: "platform_admin", sessionId: req.auth.sessionId, action: "developer.webhooks.suspend", resourceType: "developer_project", resourceId: project.id, reason, outcome: "success", afterState: { suspension: developerSuspensionResponse(suspension) } });
  return res.status(201).json({ project: { id: project.id, name: project.name, status: project.status }, suspension: developerSuspensionResponse(suspension) });
}));

router.post("/developer-projects/:projectId/webhook-suspension/reinstate", requirePlatformPermission("platform.developer_api.manage"), requireIdempotency("platform.developer_webhook_suspension.reinstate"), asyncHandler(async (req, res) => {
  const project = await developerProjects.findProjectById(req.params.projectId);
  if (!project) return res.status(404).json({ message: "Developer project not found." });
  const reason = cleanDeveloperSecurityReason(req.body?.reason, "Reinstatement reason");
  const suspension = await developerWebhookSuspensions.reinstate({ projectId: project.id, userId: req.user._id, reason });
  if (!suspension) return res.status(409).json({ message: "Developer project webhook delivery is not suspended." });
  await securityAuditService.record({ actorId: req.user._id, actorRole: "platform_admin", sessionId: req.auth.sessionId, action: "developer.webhooks.reinstate", resourceType: "developer_project", resourceId: project.id, reason, outcome: "success", afterState: { suspension: developerSuspensionResponse(suspension) } });
  return res.json({ project: { id: project.id, name: project.name, status: project.status }, suspension: developerSuspensionResponse(suspension) });
}));

function readDeveloperRateLimit(value, label) {
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100000) {
    const error = new Error(`${label} must be an integer between 1 and 100000.`);
    error.statusCode = 400;
    error.code = "INVALID_RATE_LIMIT";
    throw error;
  }
  return limit;
}

router.get("/developer-projects/:projectId/rate-limit", requirePlatformPermission("platform.developer_api.manage"), asyncHandler(async (req, res) => {
  const project = await developerProjects.findProjectById(req.params.projectId);
  if (!project) return res.status(404).json({ message: "Developer project not found." });
  const environment = developerApiRateLimits.normalizeEnvironment(req.query.environment);
  const limits = await developerApiRateLimits.get(project.id, environment);
  return res.json({ project: { id: project.id, name: project.name, status: project.status }, limits });
}));

router.put("/developer-projects/:projectId/rate-limit", requirePlatformPermission("platform.developer_api.manage"), requireIdempotency("platform.developer_api.rate_limit.update"), asyncHandler(async (req, res) => {
  const project = await developerProjects.findProjectById(req.params.projectId);
  if (!project) return res.status(404).json({ message: "Developer project not found." });
  const environment = developerApiRateLimits.normalizeEnvironment(req.body?.environment);
  const readLimitPerMinute = readDeveloperRateLimit(req.body?.readLimitPerMinute ?? req.body?.read_limit_per_minute, "readLimitPerMinute");
  const writeLimitPerMinute = readDeveloperRateLimit(req.body?.writeLimitPerMinute ?? req.body?.write_limit_per_minute, "writeLimitPerMinute");
  const limits = await developerApiRateLimits.save({ projectId: project.id, environment, readLimitPerMinute, writeLimitPerMinute, userId: req.user._id });
  await securityAuditService.record({ actorId: req.user._id, actorRole: "platform_admin", sessionId: req.auth.sessionId, action: "developer.api_rate_limit.update", resourceType: "developer_project", resourceId: project.id, reason: req.body?.reason, outcome: "success", afterState: { limits } });
  return res.json({ project: { id: project.id, name: project.name, status: project.status }, limits });
}));

router.get("/developer-projects/:projectId/production-approval", requirePlatformPermission("platform.developer_api.manage"), asyncHandler(async (req, res) => {
  const project = await developerProjects.findProjectById(req.params.projectId);
  if (!project) return res.status(404).json({ message: "Developer project not found." });
  const approval = await developerProjects.getProductionApproval(project.id);
  res.setHeader("Cache-Control", "no-store");
  return res.json({ project: { id: project.id, name: project.name, status: project.status }, approval: productionApprovalResponse(approval) });
}));

router.post("/developer-projects/:projectId/production-approval/:submissionId/review", requirePlatformPermission("platform.developer_api.manage"), requireIdempotency("platform.developer_production_approval.review"), asyncHandler(async (req, res) => {
  const project = await developerProjects.findProjectById(req.params.projectId);
  if (!project) return res.status(404).json({ message: "Developer project not found." });
  const review = cleanDeveloperProductionReview(req.body);
  const approval = await db.withTransaction(async (client) => {
    const reviewedApproval = await developerProjects.reviewProductionApproval({
      projectId: project.id,
      submissionId: req.params.submissionId,
      status: review.status,
      reviewerUserId: req.user._id,
      feedback: review.feedback
    }, { client });
    if (!reviewedApproval) return null;
    await securityAuditService.record({
      actorId: req.user._id,
      actorRole: "platform_admin",
      sessionId: req.auth.sessionId,
      action: `developer.production_approval.${review.status}`,
      resourceType: "developer_project",
      resourceId: project.id,
      reason: review.feedback || `Production application ${review.status}.`,
      outcome: "success",
      afterState: { status: reviewedApproval.status, submissionId: req.params.submissionId }
    }, { client });
    return reviewedApproval;
  });
  if (!approval) return res.status(404).json({ message: "Production application submission not found." });
  return res.json({ project: { id: project.id, name: project.name, status: project.status }, approval: productionApprovalResponse(approval) });
}));

router.get("/business-categories", requirePlatformPermission("platform.settings.manage"), asyncHandler(async (_req, res) => {
  res.json({ items: await businessCategories.list(true) });
}));
router.post("/business-categories", requirePlatformPermission("platform.settings.manage"), asyncHandler(async (req, res) => {
  res.status(201).json({ category: await businessCategories.save(null, req.body, { actorId: req.user._id, actorRole: "platform_admin", sessionId: req.auth.sessionId }) });
}));
router.patch("/business-categories/:categoryId", requirePlatformPermission("platform.settings.manage"), asyncHandler(async (req, res) => {
  res.json({ category: await businessCategories.save(req.params.categoryId, req.body, { actorId: req.user._id, actorRole: "platform_admin", sessionId: req.auth.sessionId }) });
}));


router.get("/capabilities", requirePlatformPermission("platform.plan_policy.read"), (_req, res) => {
  res.json({
    planMatrix: true,
    planPolicyMutations: releaseControls.planPolicyMutations,
    usageCreditCatalog: releaseControls.usageCreditCatalog,
    usageCreditAdministration: releaseControls.usageCreditGrants,
    usageCreditCases: releaseControls.usageCreditRefunds || releaseControls.usageCreditDisputes,
    tenantOverrides: releaseControls.entitlementOverrides
  });
});

const PRIVILEGED_ACTIONS = new Set([
  "credit.pack.publish", "credit.grant", "credit.revoke",
  "credit.refund.resolve", "credit.dispute.open", "credit.dispute.resolve",
  "plan.defaults.publish", "queue.fees.publish", "subscription.transition", "subscription.suspend"
  , "moderation.campaign_report.status", "moderation.rating_dispute.resolve", "platform.user_sessions.revoke", "platform.user.password_reset.send", "platform.account_deletion.cleanup.begin", "platform.account_deletion.report.send", "entitlement.override.publish", "entitlement.override.revoke", "allowance.reverse", "allowance.reconcile"
]);

const PRIVILEGED_ACTION_CONTROLS = Object.freeze({
  "credit.pack.publish": "usageCreditCatalog",
  "credit.grant": "usageCreditGrants",
  "credit.revoke": "usageCreditGrants",
  "credit.refund.resolve": "usageCreditRefunds",
  "credit.dispute.open": "usageCreditDisputes",
  "credit.dispute.resolve": "usageCreditDisputes",
  "plan.defaults.publish": "planPolicyMutations",
  "queue.fees.publish": "planPolicyMutations",
  "subscription.transition": "subscriptionLifecycle",
  "subscription.suspend": "subscriptionLifecycle",
  "entitlement.override.publish": "entitlementOverrides",
  "entitlement.override.revoke": "entitlementOverrides",
  "allowance.reverse": "allowanceRepairs",
  "allowance.reconcile": "allowanceRepairs"
});

function assertPrivilegedActionEnabled(action) {
  const controlName = PRIVILEGED_ACTION_CONTROLS[action];
  if (controlName) assertReleaseControl(controlName);
}

router.post(
  "/privileged-actions/preview",
  asyncHandler(async (req, res) => {
    const action = String(req.body.action || "");
    if (!PRIVILEGED_ACTIONS.has(action)) throw Object.assign(new Error("Privileged action is not allowlisted."), { statusCode: 400 });
    assertPrivilegedActionEnabled(action);
    const permissionByAction = {
      "credit.pack.publish": "platform.credit_catalog.manage", "credit.grant": "platform.credit_grants.manage", "credit.revoke": "platform.credit_revocations.manage",
      "credit.refund.resolve": "platform.credit_adjustments.manage", "credit.dispute.open": "platform.credit_disputes.manage", "credit.dispute.resolve": "platform.credit_disputes.manage",
      "plan.defaults.publish": "platform.plans.manage", "queue.fees.publish": "platform.queue_fees.manage", "subscription.transition": "platform.subscription_lifecycle.manage", "subscription.suspend": "platform.subscription_lifecycle.manage", "moderation.campaign_report.status": "platform.settings.manage", "moderation.rating_dispute.resolve": "platform.settings.manage", "platform.user_sessions.revoke": "platform.user_sessions.revoke"
      , "platform.user.password_reset.send": "platform.user_password_reset.send", "platform.account_deletion.cleanup.begin": "platform.account_deletion.manage", "platform.account_deletion.report.send": "platform.account_deletion.manage", "entitlement.override.publish": "platform.entitlement_overrides.manage", "entitlement.override.revoke": "platform.entitlement_overrides.manage", "allowance.reverse": "platform.credit_adjustments.manage", "allowance.reconcile": "platform.credit_reconcile"
    };
    if (!getGlobalPermissions(req.user).has(permissionByAction[action])) throw Object.assign(new Error("You do not have permission to preview this action."), { statusCode: 403 });
    const target = String(req.body.target || "");
    const reason = String(req.body.reason || "");
    const preview = await privilegedPreviewService.resolvePreview({ action, target, payload: req.body.payload || {} });
    const confirmation = await privilegedTransactionService.issueConfirmation({ actorId: req.user._id, session: req.auth.session, action, target, reason, payload: preview.payload, previewRevision: preview.revision });
    res.json({ preview, confirmation });
  })
);

router.post(
  "/users/:userId/password-reset",
  requirePlatformPermission("platform.user_password_reset.send"),
  requireIdempotency("platform.user_password_reset.send"),
  asyncHandler(async (req, res) => {
    if (!/^\d{1,18}$/.test(req.params.userId)) return res.status(400).json({ message: "Invalid user ID." });
    const userId = String(req.params.userId);
    const reason = String(req.body?.reason || "").trim().replace(/\s+/g, " ");
    if (reason.length < 8 || reason.length > 500) return res.status(400).json({ message: "Enter an audit reason between 8 and 500 characters." });
    const payload = { userId };
    const issued = await db.withTransaction(async (client) => {
      const user = (await client.query("SELECT id,email,roles FROM users WHERE id=$1 FOR UPDATE", [Number(userId)])).rows[0];
      if (!user) return { missing: true };
      if (!user.email) return { noEmail: true };
      const preview = await privilegedPreviewService.resolvePreview({ action: "platform.user.password_reset.send", target: userId, payload }, { client, lock: true });
      await privilegedTransactionService.consumeConfirmation({
        token: req.get("x-transaction-confirmation"), actorId: req.user._id, session: req.auth.session,
        action: "platform.user.password_reset.send", target: userId, reason, payload,
        previewRevision: req.body?.previewRevision, currentPreviewRevision: preview.revision
      }, { client });
      const reset = await passwordResetService.issuePasswordResetToken({
        user: { _id: String(user.id), email: user.email, roles: user.roles || [] }, req, client
      });
      return { user, reset };
    });
    if (issued.missing) return res.status(404).json({ message: "User not found." });
    if (issued.noEmail) return res.status(409).json({ message: "This account has no email address for password recovery." });
    try {
      const delivered = await notificationService.sendEmail({
        to: issued.user.email,
        subject: "Reset your GetPrio password",
        text: ["A Platform administrator requested a password reset for your GetPrio account.", `Reset link: ${issued.reset.resetUrl}`, `This link expires at ${new Date(issued.reset.expiresAt).toISOString()}.`, "If you did not expect this email, ignore it and contact GetPrio support."].join("\n\n"),
        emailTemplate: { illustration: "account-verification", actionLabel: "Reset password", actionUrl: issued.reset.resetUrl },
        purpose: "general",
        metadata: { category: "platform_password_reset" }
      });
      if (!delivered) throw Object.assign(new Error("Password reset email could not be delivered."), { statusCode: 503 });
      await securityAuditService.record({ actorId: req.user._id, actorRole: "platform_admin", sessionId: req.auth.sessionId, action: "platform.user.password_reset.send", resourceType: "user", resourceId: userId, reason, outcome: "success", metadata: { delivery: "email" } });
    } catch (deliveryError) {
      await db.withTransaction(async (client) => {
        await passwordResetTokenRepository.invalidateUnusedTokensForUser(userId, { client });
        await securityAuditService.record({ actorId: req.user._id, actorRole: "platform_admin", sessionId: req.auth.sessionId, action: "platform.user.password_reset.send", resourceType: "user", resourceId: userId, reason, outcome: "failed", metadata: { delivery: "email" } }, { client });
      });
      throw deliveryError;
    }
    return res.json({ success: true, message: "Password reset instructions were sent to the account email." });
  })
);

router.post(
  "/users/:userId/sessions/revoke",
  requirePlatformPermission("platform.user_sessions.revoke"),
  requireIdempotency("platform.user_sessions.revoke"),
  asyncHandler(async (req, res) => {
    if (!/^\d{1,18}$/.test(req.params.userId)) return res.status(400).json({ message: "Invalid user ID." });
    if (String(req.params.userId) === String(req.user._id)) return res.status(409).json({ message: "The current Platform session cannot revoke itself. Sign out from the account menu instead." });
    const reason = String(req.body?.reason || "").trim();
    const payload = { userId: String(req.params.userId) };
    const result = await db.withTransaction(async (client) => {
      const targetUser = (await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [Number(req.params.userId)])).rows[0];
      if (!targetUser) return null;
      const preview = await privilegedPreviewService.resolvePreview({ action: "platform.user_sessions.revoke", target: req.params.userId, payload }, { client, lock: true });
      await privilegedTransactionService.consumeConfirmation({ token: req.get("x-transaction-confirmation"), actorId: req.user._id, session: req.auth.session, action: "platform.user_sessions.revoke", target: req.params.userId, reason, payload, previewRevision: req.body.previewRevision, currentPreviewRevision: preview.revision }, { client });
      const revokedSessions = await authSessionsRepository.revokeAllSessionsForUser(req.params.userId, reason, { client });
      await securityAuditService.record({ actorId: req.user._id, actorRole: "platform_admin", sessionId: req.auth.sessionId, action: "platform.user_sessions.revoke", resourceType: "user", resourceId: req.params.userId, reason, outcome: "success", metadata: { revokedSessions } }, { client });
      return { user: { id: String(targetUser.id) }, revokedSessions };
    });
    if (!result) return res.status(404).json({ message: "User not found." });
    return res.json(result);
  })
);

// Compatibility alias for the first Usage Credit dashboard client.
router.post(
  "/credit-actions/preview",
  requirePlatformPermission("platform.credit_catalog.manage"),
  asyncHandler(async (req, res) => {
    const action = String(req.body.action || "");
    if (!["credit.pack.publish", "credit.grant", "credit.revoke"].includes(action)) throw Object.assign(new Error("Credit action is not allowlisted."), { statusCode: 400 });
    assertPrivilegedActionEnabled(action);
    const target = String(req.body.target || "");
    const preview = await privilegedPreviewService.resolvePreview({ action, target, payload: req.body.payload || {} });
    const confirmation = await privilegedTransactionService.issueConfirmation({ actorId: req.user._id, session: req.auth.session, action, target, reason: req.body.reason, payload: preview.payload, previewRevision: preview.revision });
    res.json({ preview, confirmation });
  })
);

async function executeCreditConfirmation(req, action, target, payload, callback) {
  return db.withTransaction(async (client) => {
    const preview = await privilegedPreviewService.resolvePreview({ action, target: String(target), payload }, { client, lock: true });
    await privilegedTransactionService.consumeConfirmation({ token: req.get("x-transaction-confirmation"), actorId: req.user._id, session: req.auth.session, action, target: String(target), reason: req.body.reason, payload, previewRevision: req.body.previewRevision, currentPreviewRevision: preview.revision }, { client });
    return callback(client);
  });
}

router.get("/credit-packs", requirePlatformPermission("platform.credit_commerce.read"), requireReleaseControl("usageCreditCatalog"), asyncHandler(async (_req, res) => res.json({ packs: await usageCreditService.listCatalog() })));

router.patch(
  "/credit-packs/:code",
  requirePlatformPermission("platform.credit_catalog.manage"),
  requireReleaseControl("usageCreditCatalog"),
  requireIdempotency("platform.credit_pack.publish"),
  asyncHandler(async (req, res) => {
    const payload = { code: req.params.code, name: req.body.name, state: req.body.state, ticketUnits: req.body.ticketUnits, journeyUnits: req.body.journeyUnits, priceCents: req.body.priceCents };
    const pack = await executeCreditConfirmation(req, "credit.pack.publish", req.params.code, payload, (client) => usageCreditService.publishPack(req.params.code, req.body, req.user._id, { client }));
    await securityAuditService.record({ actorId: req.user._id, actorRole: "platform_admin", sessionId: req.auth.sessionId, action: "credit.pack.publish", resourceType: "usage_credit_pack", resourceId: pack.code, reason: req.body.reason, outcome: "success", afterState: pack });
    res.json({ pack });
  })
);

router.get("/credit-purchases", requirePlatformPermission("platform.credit_commerce.read"), asyncHandler(async (_req, res) => {
  const [purchases, cases] = await Promise.all([usageCreditRepository.listPurchases(null), usageCreditRepository.listCases()]);
  res.json({ purchases, ...cases });
}));

router.get("/tenants/:tenantId/capacity", requirePlatformPermission("platform.capacity.read"), asyncHandler(async (req, res) => {
  if (!/^\d{1,18}$/.test(req.params.tenantId)) return res.status(400).json({ message: "Invalid tenant ID." });
  const tenant = await tenantRepository.findTenantById(req.params.tenantId);
  if (!tenant) return res.status(404).json({ message: "Tenant not found." });
  res.json({
    tenant: { id: String(tenant._id), name: tenant.name, slug: tenant.slug },
    capacity: await usageCreditService.getTenantCapacity(req.params.tenantId, true)
  });
}));
router.get("/tenants/:tenantId/entitlement-overrides", requirePlatformPermission("platform.plan_policy.read"), requireReleaseControl("entitlementOverrides"), asyncHandler(async (req,res) => {
  res.json({ overrides: await entitlementOverrideRepository.listForTenant(req.params.tenantId) });
}));

router.get("/security-audit-events", requirePlatformPermission("platform.security_audit.read"), asyncHandler(async (req,res) => {
  const result = req.query.page !== undefined ? await platformRecords.listRecords("audit", req.query) : null;
  const items = result ? result.items : await securityAuditRepository.listEvents({ limit: req.query.limit, tenantId: req.query.tenantId });
  await securityAuditService.record({ actorId:req.user._id, actorRole:"platform_admin", sessionId:req.auth.sessionId, action:"security.audit.read", resourceType:"security_audit", resourceId:req.query.tenantId || "platform", reason:"Platform audit review", outcome:"success", metadata:{returned:items.length} });
  res.json(result || { items });
}));

router.post(
  "/tenants/:tenantId/credit-grants",
  requirePlatformPermission("platform.credit_grants.manage"),
  requireReleaseControl("usageCreditGrants"),
  requireIdempotency("platform.credit_grant.create"),
  asyncHandler(async (req, res) => {
    const payload = { tenantId: req.params.tenantId, ticketUnits: req.body.ticketUnits, journeyUnits: req.body.journeyUnits, expiresAt: req.body.expiresAt || null };
    const lots = await executeCreditConfirmation(req, "credit.grant", req.params.tenantId, payload, (client) => usageCreditService.grant({ ...req.body, ...payload }, req.user._id, { client }));
    await securityAuditService.record({ actorId: req.user._id, actorRole: "platform_admin", sessionId: req.auth.sessionId, action: "credit.grant", resourceType: "tenant", resourceId: req.params.tenantId, reason: req.body.reason, outcome: "success", afterState: { lots } });
    res.status(201).json({ lots });
  })
);

router.post(
  "/credit-lots/:lotId/revoke",
  requirePlatformPermission("platform.credit_revocations.manage"),
  requireReleaseControl("usageCreditGrants"),
  requireIdempotency("platform.credit_lot.revoke"),
  asyncHandler(async (req, res) => {
    const payload = { lotId: req.params.lotId, units: req.body.units };
    const lot = await executeCreditConfirmation(req, "credit.revoke", req.params.lotId, payload, (client) => usageCreditService.revoke(payload, { client }));
    await securityAuditService.record({ actorId: req.user._id, actorRole: "platform_admin", sessionId: req.auth.sessionId, action: "credit.revoke", resourceType: "usage_credit_lot", resourceId: req.params.lotId, reason: req.body.reason, outcome: "success", afterState: lot });
    res.json({ lot });
  })
);

router.post(
  "/credit-purchases/:purchaseId/refunds/resolve",
  requirePlatformPermission("platform.credit_adjustments.manage"),
  requireReleaseControl("usageCreditRefunds"),
  requireIdempotency("platform.credit_refund.resolve"),
  asyncHandler(async (req, res) => {
    const payload = { purchaseId: req.params.purchaseId, outcome: req.body.outcome, providerRefundId: req.body.providerRefundId || null };
    const refund = await executeCreditConfirmation(req, "credit.refund.resolve", req.params.purchaseId, payload, (client) => usageCreditService.resolveRefund(req.params.purchaseId, req.body.outcome, req.body.providerRefundId, { client }));
    await securityAuditService.record({ actorId: req.user._id, actorRole: "platform_admin", sessionId: req.auth.sessionId, action: "credit.refund.resolve", resourceType: "usage_credit_purchase", resourceId: req.params.purchaseId, reason: req.body.reason, outcome: "success", afterState: refund });
    res.json({ refund });
  })
);

router.post(
  "/credit-purchases/:purchaseId/disputes",
  requirePlatformPermission("platform.credit_disputes.manage"),
  requireReleaseControl("usageCreditDisputes"),
  requireIdempotency("platform.credit_dispute.open"),
  asyncHandler(async (req, res) => {
    const payload = { purchaseId: req.params.purchaseId, providerDisputeId: req.body.providerDisputeId };
    const dispute = await executeCreditConfirmation(req, "credit.dispute.open", req.params.purchaseId, payload, (client) => usageCreditService.openDispute(req.params.purchaseId, req.body.providerDisputeId, req.body.details, { client }));
    await securityAuditService.record({ actorId: req.user._id, actorRole: "platform_admin", sessionId: req.auth.sessionId, action: "credit.dispute.open", resourceType: "usage_credit_purchase", resourceId: req.params.purchaseId, reason: req.body.reason, outcome: "success", afterState: dispute });
    res.status(201).json({ dispute });
  })
);

router.post(
  "/credit-disputes/:providerDisputeId/resolve",
  requirePlatformPermission("platform.credit_disputes.manage"),
  requireReleaseControl("usageCreditDisputes"),
  requireIdempotency("platform.credit_dispute.resolve"),
  asyncHandler(async (req, res) => {
    const payload = { providerDisputeId: req.params.providerDisputeId, outcome: req.body.outcome };
    const dispute = await executeCreditConfirmation(req, "credit.dispute.resolve", req.params.providerDisputeId, payload, (client) => usageCreditService.resolveDispute(req.params.providerDisputeId, req.body.outcome, { client }));
    await securityAuditService.record({ actorId: req.user._id, actorRole: "platform_admin", sessionId: req.auth.sessionId, action: "credit.dispute.resolve", resourceType: "usage_credit_dispute", resourceId: req.params.providerDisputeId, reason: req.body.reason, outcome: "success", afterState: dispute });
    res.json({ dispute });
  })
);

router.post("/tenants/:tenantId/entitlement-overrides", requirePlatformPermission("platform.entitlement_overrides.manage"), requireReleaseControl("entitlementOverrides"), requireIdempotency("platform.entitlement_override.publish"), asyncHandler(async (req,res) => {
  const payload={tenantId:req.params.tenantId,subscriptionId:req.body.subscriptionId,policyKey:req.body.policyKey,value:req.body.value,expiresAt:req.body.expiresAt || null};
  if (!/^(feature\.(queue|branding|discovery|booking|campaigns)|allowance\.(queueTickets|queueEmailJourneys|serviceBookings))$/.test(String(payload.policyKey || ""))) throw Object.assign(new Error("Entitlement override key is invalid."),{statusCode:400});
  const override=await executeCreditConfirmation(req,"entitlement.override.publish",req.params.tenantId,payload,(client)=>entitlementOverrideRepository.create({...payload,reason:req.body.reason,actorId:req.user._id},{client}));
  if(!override) throw Object.assign(new Error("Subscription not found for this tenant."),{statusCode:404});
  await securityAuditService.record({actorId:req.user._id,actorRole:"platform_admin",sessionId:req.auth.sessionId,tenantId:req.params.tenantId,action:"entitlement.override.publish",resourceType:"tenant_entitlement_override",resourceId:override.id,reason:req.body.reason,outcome:"success",afterState:override});
  res.status(201).json({override});
}));

router.post("/tenants/:tenantId/entitlement-overrides/:overrideId/revoke", requirePlatformPermission("platform.entitlement_overrides.manage"), requireReleaseControl("entitlementOverrides"), requireIdempotency("platform.entitlement_override.revoke"), asyncHandler(async (req,res) => {
  const payload={tenantId:req.params.tenantId,overrideId:req.params.overrideId};
  const override=await executeCreditConfirmation(req,"entitlement.override.revoke",req.params.overrideId,payload,(client)=>entitlementOverrideRepository.revoke({...payload,actorId:req.user._id},{client}));
  if(!override) throw Object.assign(new Error("Active entitlement override not found."),{statusCode:404});
  await securityAuditService.record({actorId:req.user._id,actorRole:"platform_admin",sessionId:req.auth.sessionId,tenantId:req.params.tenantId,action:"entitlement.override.revoke",resourceType:"tenant_entitlement_override",resourceId:req.params.overrideId,reason:req.body.reason,outcome:"success",afterState:override});
  res.json({override});
}));

router.post("/tenants/:tenantId/allowance-operations/:operationId/reverse", requirePlatformPermission("platform.credit_adjustments.manage"), requireReleaseControl("allowanceRepairs"), requireIdempotency("platform.allowance.reverse"), asyncHandler(async (req,res) => {
  const payload={tenantId:req.params.tenantId,operationId:req.params.operationId};
  const result=await executeCreditConfirmation(req,"allowance.reverse",req.params.operationId,payload,(client)=>allowanceLedgerRepository.reverseOperation({...payload,operationKey:`platform-reversal:${req.params.operationId}`,actorUserId:req.user._id,reason:req.body.reason},{client}));
  if(!result) throw Object.assign(new Error("Allowance operation not found."),{statusCode:404});
  await securityAuditService.record({actorId:req.user._id,actorRole:"platform_admin",sessionId:req.auth.sessionId,tenantId:req.params.tenantId,action:"allowance.reverse",resourceType:"allowance_operation",resourceId:req.params.operationId,reason:req.body.reason,outcome:"success",afterState:result.operation});
  res.json(result);
}));

router.post("/tenants/:tenantId/allowance-reconciliations", requirePlatformPermission("platform.credit_reconcile"), requireReleaseControl("allowanceRepairs"), requireIdempotency("platform.allowance.reconcile"), asyncHandler(async (req,res) => {
  const payload={tenantId:req.params.tenantId,resourceKey:req.body.resourceKey,expectedUnits:Number(req.body.expectedUnits),ledgerUnits:Number(req.body.ledgerUnits)};
  const reconciliation=await executeCreditConfirmation(req,"allowance.reconcile",req.params.tenantId,payload,(client)=>allowanceLedgerRepository.recordReconciliation({...payload,details:{reason:req.body.reason,correlationId:req.correlationId}},{client}));
  await securityAuditService.record({actorId:req.user._id,actorRole:"platform_admin",sessionId:req.auth.sessionId,tenantId:req.params.tenantId,action:"allowance.reconcile",resourceType:"allowance_reconciliation",resourceId:reconciliation.id,reason:req.body.reason,outcome:reconciliation.status,afterState:reconciliation});
  res.status(201).json({reconciliation});
}));

router.get(
  "/queue-lifecycle/diagnostics",
  requirePlatformPermission("platform.queue_lifecycle.read"),
  asyncHandler(async (req, res) => {
    res.json({
      queueDays: await queueDayRepository.listDiagnostics({
        state: req.query.state,
        limit: req.query.limit
      })
    });
  })
);

router.post(
  "/queue-lifecycle/:queueDayId/reconcile",
  requirePlatformPermission("platform.queue_lifecycle.reconcile"),
  asyncHandler(async (req, res) => {
    const result = await queueDayLifecycleService.reconcileQueueDayById(req.params.queueDayId);
    res.json({ queueDay: result.queueDay, outcomes: result.outcomes, idempotent: result.idempotent });
  })
);

router.post(
  "/queue-lifecycle/notifications/:outboxId/requeue",
  requirePlatformPermission("platform.queue_notifications.requeue"),
  asyncHandler(async (req, res) => {
    const notification = await queueNotificationOutboxRepository.requeue(req.params.outboxId);
    if (!notification) {
      const error = new Error("Retryable notification intent not found.");
      error.statusCode = 404;
      throw error;
    }
    res.json({ notification });
  })
);

router.post(
  "/queue-lifecycle/repair/preview",
  requirePlatformPermission("platform.queue_lifecycle.repair"),
  asyncHandler(async (req, res) => {
    const action = String(req.body?.action || "");
    const targetId = String(req.body?.targetId || "");
    const reason = String(req.body?.reason || "");
    if (!["reconcile_overdue_queue_day", "requeue_notification"].includes(action)) {
      const error = new Error("Repair action is not allowlisted.");
      error.statusCode = 400;
      throw error;
    }
    const previewRevision = "queue-repair-v1";
    const confirmation = await privilegedTransactionService.issueConfirmation({
      actorId: req.user._id,
      session: req.auth.session,
      action,
      target: targetId,
      reason,
      payload: { action, targetId },
      previewRevision
    });
    res.json({
      preview: {
        action,
        targetId,
        requiresMfa: true,
        mutatesCustomerIdentity: false,
        revision: previewRevision
      },
      confirmation
    });
  })
);

router.post(
  "/queue-lifecycle/repair/execute",
  requirePlatformPermission("platform.queue_lifecycle.repair"),
  asyncHandler(async (req, res) => {
    const action = String(req.body?.action || "");
    const targetId = String(req.body?.targetId || "");
    await privilegedTransactionService.consumeConfirmation({
      token: req.get("x-transaction-confirmation"),
      actorId: req.user._id,
      session: req.auth.session,
      action,
      target: targetId,
      reason: req.body?.reason,
      payload: { action, targetId },
      previewRevision: req.body?.previewRevision
    });
    if (action === "reconcile_overdue_queue_day") {
      const result = await queueDayLifecycleService.reconcileQueueDayById(targetId);
      res.json({ action, targetId: String(targetId), idempotent: result.idempotent });
      return;
    }
    if (action === "requeue_notification") {
      const notification = await queueNotificationOutboxRepository.requeue(targetId);
      if (!notification) {
        const error = new Error("Retryable notification intent not found.");
        error.statusCode = 404;
        throw error;
      }
      res.json({ action, targetId: String(targetId), notification });
      return;
    }
    const error = new Error("Repair action is not allowlisted.");
    error.statusCode = 400;
    throw error;
  })
);

router.get(
  "/overview",
  requirePlatformPermission("platform.billing.read"),
  asyncHandler(async (_req, res) => {
    const [totals, queueFees, recentPayments, analytics] = await Promise.all([
      platformRepository.getOverviewTotals(),
      queueFeeService.listQueueFees(),
      platformRepository.listRecentPayments({ limit: 10 }),
      platformRepository.getOverviewAnalytics()
    ]);

    res.json({
      totals,
      queueFees,
      recentPayments: recentPayments.map(queueJoinPaymentService.formatPayment),
      analytics
    });
  })
);

router.get(
  "/plans",
  requirePlatformPermission("platform.billing.read"),
  asyncHandler(async (_req, res) => {
    res.json({
      plans: await subscriptionPlanRepository.listPlans()
    });
  })
);

router.patch(
  "/plans/:planSlug",
  requirePlatformPermission("platform.plans.manage"),
  requireReleaseControl("planPolicyMutations"),
  requireIdempotency("platform.plan.update"),
  asyncHandler(async (req, res) => {
    if (req.body.plan?.slug !== req.params.planSlug) {
      const error = new Error("Plan slug mismatch.");
      error.statusCode = 400;
      throw error;
    }

    validatePlanMutation(req.body.plan);
    const plan = await db.withTransaction(async (client) => {
      const preview = await privilegedPreviewService.resolvePreview({ action: "plan.defaults.publish", target: req.params.planSlug, payload: { plan: req.body.plan } }, { client, lock: true });
      await privilegedTransactionService.consumeConfirmation({
        token: req.get("x-transaction-confirmation"), actorId: req.user._id, session: req.auth.session,
        action: "plan.defaults.publish", target: req.params.planSlug, reason: req.body.reason,
        payload: { plan: req.body.plan }, previewRevision: req.body.previewRevision,
        currentPreviewRevision: preview.revision
      }, { client });
      const beforeState = await subscriptionPlanRepository.findPlanBySlug(req.params.planSlug, { client });
      const updatedPlan = await subscriptionPlanRepository.updatePlan(req.body.plan, req.user?._id, { client });
      if (!updatedPlan) {
        const error = new Error("Plan not found.");
        error.statusCode = 404;
        throw error;
      }
      await securityAuditService.record({
        actorId: req.user._id,
        actorRole: "platform_admin",
        sessionId: req.auth.sessionId,
        action: "platform.plan.update",
        resourceType: "subscription_plan",
        resourceId: updatedPlan.slug,
        reason: req.body.reason || "Plan policy update",
        outcome: "success",
        beforeState,
        afterState: updatedPlan
      }, { client });
      return updatedPlan;
    });
    res.json({ plan });
  })
);

router.get(
  "/queue-fees",
  requirePlatformPermission("platform.billing.read"),
  asyncHandler(async (_req, res) => {
    res.json({
      queueFees: await queueFeeService.listQueueFees()
    });
  })
);

router.patch(
  "/queue-fees",
  requirePlatformPermission("platform.queue_fees.manage"),
  requireReleaseControl("planPolicyMutations"),
  requireIdempotency("platform.queue_fees.update"),
  asyncHandler(async (req, res) => {
    const queueFees = await db.withTransaction(async (client) => {
      const payload = { queueFees: req.body.queueFees };
      const preview = await privilegedPreviewService.resolvePreview({ action: "queue.fees.publish", target: "all-plans", payload }, { client, lock: true });
      await privilegedTransactionService.consumeConfirmation({
        token: req.get("x-transaction-confirmation"), actorId: req.user._id, session: req.auth.session,
        action: "queue.fees.publish", target: "all-plans", reason: req.body.reason,
        payload, previewRevision: req.body.previewRevision, currentPreviewRevision: preview.revision
      }, { client });
      const beforeState = await queueFeeService.listQueueFees({ client });
      const updatedQueueFees = await queueFeeService.updateQueueFees({ queueFees: req.body.queueFees, user: req.user }, { client });
      await securityAuditService.record({
        actorId: req.user._id,
        actorRole: "platform_admin",
        sessionId: req.auth.sessionId,
        action: "platform.queue_fees.update",
        resourceType: "queue_fee_policy",
        resourceId: "all-plans",
        reason: req.body.reason || "Queue fee policy update",
        outcome: "success",
        beforeState,
        afterState: updatedQueueFees
      }, { client });
      return updatedQueueFees;
    });
    res.json({ queueFees });
  })
);

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeMobileApprovedHosts(value) {
  if (!Array.isArray(value)) {
    const error = new Error("mobileApprovedHosts must be an array.");
    error.statusCode = 400;
    throw error;
  }
  const hosts = [...new Set(value.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean))];
  if (hosts.length > 20) {
    const error = new Error("At most 20 mobile HTTPS hosts may be maintained.");
    error.statusCode = 400;
    throw error;
  }
  for (const host of hosts) {
    try {
      const url = new URL(`https://${host}`);
      if (url.hostname !== host || url.pathname !== "/" || url.search || url.hash || url.username || url.password) throw new Error();
    } catch {
      const error = new Error("Each mobile approved host must be a hostname with no path and no credentials.");
      error.statusCode = 400;
      throw error;
    }
  }
  return hosts;
}

router.get(
  "/settings",
  requirePlatformPermission("platform.settings.manage"),
  asyncHandler(async (_req, res) => {
    res.json({
      settings: await platformRepository.getPlatformSettings()
    });
  })
);

router.patch(
  "/settings",
  requirePlatformPermission("platform.settings.manage"),
  asyncHandler(async (req, res) => {
    const maxImageUploadKb = req.body.maxImageUploadKb;
    if (maxImageUploadKb !== undefined && !isValidImageUploadLimit(maxImageUploadKb)) {
      const error = new Error("Maximum image size must be a whole number from 1 to 8192 KB.");
      error.statusCode = 400;
      throw error;
    }
    const enterpriseInquiryEmail = normalizeEmail(req.body.enterpriseInquiryEmail);
    const defaultTimezone = normalizeTimeZone(req.body.defaultTimezone, "");
    const mobileApprovedHosts = Object.prototype.hasOwnProperty.call(req.body, "mobileApprovedHosts")
      ? normalizeMobileApprovedHosts(req.body.mobileApprovedHosts)
      : undefined;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(enterpriseInquiryEmail)) {
      const error = new Error("A valid enterprise inquiry email is required.");
      error.statusCode = 400;
      throw error;
    }
    if (!isValidTimeZone(defaultTimezone)) {
      const error = new Error("A valid default timezone is required.");
      error.statusCode = 400;
      throw error;
    }

    const requestedReason = String(req.body.reason || "").trim().replace(/\s+/g, " ");
    if (requestedReason.length < 8 || requestedReason.length > 500) {
      const error = new Error("Enter an audit reason between 8 and 500 characters.");
      error.statusCode = 400;
      error.code = "INVALID_REASON";
      throw error;
    }
    const reason = requestedReason;
    res.json({
      settings: await db.withTransaction(async (client) => {
        const beforeState = await platformRepository.getPlatformSettings({ client });
        const expectedSettings = req.body.expectedSettings;
        if (expectedSettings && ["enterpriseInquiryEmail", "defaultTimezone", "mobileApprovedHosts", "maxImageUploadKb"].some((key) => JSON.stringify(expectedSettings[key]) !== JSON.stringify(beforeState[key]))) {
          const error = new Error("Platform settings changed after this page loaded. Refresh and review your changes before saving again.");
          error.statusCode = 409;
          error.code = "SETTINGS_CHANGED";
          throw error;
        }
        const settings = await platformRepository.updatePlatformSettings({
          enterpriseInquiryEmail,
          defaultTimezone,
          mobileApprovedHosts,
          maxImageUploadKb,
          userId: req.user?._id
        }, { client });
        const changedFields = Object.keys(settings).filter((key) => JSON.stringify(beforeState[key]) !== JSON.stringify(settings[key]));
        await securityAuditService.record({
          actorId: req.user?._id,
          actorRole: "platform_admin",
          sessionId: req.auth?.sessionId,
          action: "platform.settings.update",
          resourceType: "platform_settings",
          resourceId: "global",
          reason,
          outcome: "success",
          metadata: { changedFields },
          beforeState,
          afterState: settings
        }, { client });
        return settings;
      })
    });
  })
);

router.get(
  "/queue-join-payments",
  requirePlatformPermission("platform.billing.read"),
  asyncHandler(async (req, res) => {
    const payments = await queueJoinPaymentRepository.listPayments({
      status: req.query.status,
      limit: req.query.limit
    });

    res.json({
      items: payments.map(queueJoinPaymentService.formatPayment)
    });
  })
);

router.get(
  "/tenants",
  requirePlatformPermission("platform.tenants.read"),
  asyncHandler(async (req, res) => {
    res.json(req.query.page !== undefined ? await platformRecords.listRecords("tenants", req.query) : {
      items: await platformRepository.listTenants({ limit: req.query.limit })
    });
  })
);

router.get(
  "/subscriptions",
  requirePlatformPermission("platform.billing.read"),
  asyncHandler(async (req, res) => {
    res.json({
      items: await billingRepository.listSubscriptions({ limit: req.query.limit })
    });
  })
);

router.post(
  "/subscriptions",
  requirePlatformPermission("platform.subscription_lifecycle.manage"),
  requireReleaseControl("subscriptionLifecycle"),
  requireIdempotency("platform.subscription_transition.create"),
  asyncHandler(async (req, res) => {
    const { tenantId, planSlug, reason, metadata } = req.body || {};
    const tenant = await tenantRepository.findTenantById(tenantId);
    if (!tenant) {
      const error = new Error("Tenant not found.");
      error.statusCode = 404;
      throw error;
    }

    const plan = await subscriptionPlanRepository.findPlanBySlug(planSlug);
    if (!plan) {
      const error = new Error("Subscription plan not found.");
      error.statusCode = 404;
      throw error;
    }

    const transition = await db.withTransaction(async (client) => {
      const payload = { tenantId: String(tenantId), planSlug };
      const preview = await privilegedPreviewService.resolvePreview({ action: "subscription.transition", target: tenantId, payload }, { client, lock: true });
      await privilegedTransactionService.consumeConfirmation({ token: req.get("x-transaction-confirmation"), actorId: req.user._id, session: req.auth.session, action: "subscription.transition", target: tenantId, reason, payload, previewRevision: req.body.previewRevision, currentPreviewRevision: preview.revision }, { client });
      return subscriptionLifecycleService.requestTransition({ tenantId: tenant._id, toPlanSlug: plan.slug, reason: String(reason || "Platform subscription lifecycle change"), actorId: req.user._id, metadata }, { client });
    });
    res.status(201).json({ transition });
  })
);

router.patch(
  "/subscriptions/:subscriptionId",
  requirePlatformPermission("platform.subscription_lifecycle.manage"),
  asyncHandler(async (_req, _res) => {
    const error = new Error("Direct subscription edits are retired. Create a lifecycle transition instead.");
    error.statusCode = 405;
    error.code = "SUBSCRIPTION_TRANSITION_REQUIRED";
    throw error;
  })
);

router.post(
  "/subscriptions/:subscriptionId/suspend",
  requirePlatformPermission("platform.subscription_lifecycle.manage"),
  requireReleaseControl("subscriptionLifecycle"),
  requireIdempotency("platform.subscription.suspend"),
  asyncHandler(async (req, res) => {
    const payload = { subscriptionId: req.params.subscriptionId };
    const subscription = await db.withTransaction(async (client) => {
      const preview = await privilegedPreviewService.resolvePreview({ action: "subscription.suspend", target: req.params.subscriptionId, payload }, { client, lock: true });
      await privilegedTransactionService.consumeConfirmation({ token: req.get("x-transaction-confirmation"), actorId: req.user._id, session: req.auth.session, action: "subscription.suspend", target: req.params.subscriptionId, reason: req.body.reason, payload, previewRevision: req.body.previewRevision, currentPreviewRevision: preview.revision }, { client });
      return subscriptionLifecycleService.suspendSubscription(req.params.subscriptionId, { reason: req.body.reason, actorId: req.user._id }, { client });
    });
    if (!subscription) {
      const error = new Error("Subscription not found.");
      error.statusCode = 404;
      throw error;
    }

    res.json({ subscription });
  })
);

router.delete(
  "/subscriptions/:subscriptionId",
  requirePlatformPermission("platform.billing.manage"),
  asyncHandler(async (_req, _res) => {
    const error = new Error("Subscription history cannot be deleted. Use a lifecycle transition or corrective event.");
    error.statusCode = 405;
    error.code = "SUBSCRIPTION_DELETE_RETIRED";
    throw error;
  })
);

router.get("/subscription-transitions", requirePlatformPermission("platform.billing.read"), requireReleaseControl("subscriptionLifecycle"), asyncHandler(async (req, res) => res.json({ items: await subscriptionLifecycleRepository.listTransitions(req.query.tenantId || null) })));

router.post(
  "/subscription-transitions/execute-due",
  requirePlatformPermission("platform.subscription_lifecycle.manage"),
  requireReleaseControl("subscriptionLifecycle"),
  requireIdempotency("platform.subscription_transition.execute_due"),
  asyncHandler(async (_req, res) => res.json(await subscriptionLifecycleService.executeDue()))
);

router.get(
  "/users",
  requirePlatformPermission("platform.users.read"),
  asyncHandler(async (req, res) => {
    res.json(req.query.page !== undefined ? await platformRecords.listRecords("users", req.query) : {
      items: await platformRepository.listUsers({ limit: req.query.limit })
    });
  })
);

router.get(
  "/campaign-reports",
  requirePlatformPermission("platform.users.read"),
  asyncHandler(async (_req, res) => res.json({ items: await organizerCampaignRepository.listReports() }))
);

router.patch(
  "/campaign-reports/:reportId",
  requirePlatformPermission("platform.settings.manage"),
  requireIdempotency("platform.campaign_report.status"),
  asyncHandler(async (req, res) => {
    const status = String(req.body?.status || "");
    if (!["reviewing", "resolved", "dismissed"].includes(status)) { const error = new Error("Invalid report status."); error.statusCode = 400; throw error; }
    const report = await db.withTransaction(async (client) => {
      const payload = { status };
      const preview = await privilegedPreviewService.resolvePreview({ action: "moderation.campaign_report.status", target: req.params.reportId, payload }, { client, lock: true });
      await privilegedTransactionService.consumeConfirmation({ token: req.get("x-transaction-confirmation"), actorId: req.user._id, session: req.auth.session, action: "moderation.campaign_report.status", target: req.params.reportId, reason: req.body.reason, payload, previewRevision: req.body.previewRevision, currentPreviewRevision: preview.revision }, { client });
      const before = preview.state[0];
      if (!before || !["open", "reviewing"].includes(before.report_status)) {
        const error = new Error("Active campaign report not found.");
        error.statusCode = 404;
        throw error;
      }
      const result = await client.query("UPDATE organizer_campaign_reports SET report_status = $2 WHERE id = $1 AND report_status IN ('open','reviewing') RETURNING *", [Number(req.params.reportId), status]);
      const updated = result.rows[0];
      if (!updated) {
        const error = new Error("Campaign report changed before the action completed.");
        error.statusCode = 409;
        throw error;
      }
      await securityAuditService.record({ actorId: req.user._id, actorRole: "platform_admin", sessionId: req.auth.sessionId, action: "moderation.campaign_report.status", resourceType: "campaign_report", resourceId: req.params.reportId, reason: req.body.reason, outcome: "success", beforeState: { status: before.report_status }, afterState: { status: updated.report_status } }, { client });
      return updated;
    });
    res.json({ report });
  })
);

router.get(
  "/campaign-reports/:reportId/contributions/:contributionId/evidence",
  requirePlatformPermission("platform.settings.manage"),
  asyncHandler(async (req, res) => {
    const report = await organizerCampaignRepository.findReportById(req.params.reportId);
    if (!report || !["open", "reviewing"].includes(report.report_status)) { const error = new Error("Active campaign report not found."); error.statusCode = 404; throw error; }
    const contribution = await organizerCampaignRepository.findContributionById(req.params.contributionId);
    if (!contribution || String(contribution.campaignId) !== String(report.campaign_id)) { const error = new Error("Evidence not found."); error.statusCode = 404; throw error; }
    const evidence = req.query.kind === "reimbursement"
      ? await organizerCampaignRepository.findReimbursementEvidenceByContributionId(contribution.id)
      : await organizerCampaignRepository.findContributionEvidenceById(contribution.id);
    if (!evidence?.object_key) { const error = new Error("Evidence not found."); error.statusCode = 404; throw error; }
    await organizerCampaignRepository.recordEvent({ campaignId: report.campaign_id, eventType: "campaign_evidence_viewed", actorUserId: req.user?._id, actorRole: "platform_admin", source: "platform", metadata: { reportId: report.id, contributionId: contribution.id, kind: req.query.kind === "reimbursement" ? "reimbursement" : "contribution" } });
    res.json(await paymentProofStorageService.createCampaignEvidenceViewAccess({ objectKey: evidence.object_key, fileName: evidence.file_name, contentType: evidence.content_type, sizeBytes: evidence.size_bytes }));
  })
);

router.patch(
  "/campaigns/:campaignId/freeze",
  requirePlatformPermission("platform.settings.manage"),
  asyncHandler(async (req, res) => {
    const reason = String(req.body?.reason || "").trim();
    if (!reason) { const error = new Error("Freeze reason is required."); error.statusCode = 400; throw error; }
    if (reason.length > 500) { const error = new Error("Freeze reason must be 500 characters or fewer."); error.statusCode = 400; throw error; }
    res.json({ campaign: await organizerCampaignRepository.freezeCampaign({ campaignId: req.params.campaignId, actorUserId: req.user?._id, reason }) });
  })
);

router.get(
  "/rating-disputes",
  requirePlatformPermission("platform.users.read"),
  asyncHandler(async (_req, res) => res.json({ items: await ratingRepository.listDisputes() }))
);

router.patch(
  "/rating-disputes/:disputeId",
  requirePlatformPermission("platform.settings.manage"),
  requireIdempotency("platform.moderation.rating_dispute.resolve"),
  asyncHandler(async (req, res) => {
    const status = String(req.body?.status || "");
    const moderationStatus = String(req.body?.moderationStatus || "");
    if (!["resolved", "dismissed"].includes(status) || !["active", "hidden"].includes(moderationStatus)) {
      const error = new Error("Choose a valid dispute resolution."); error.statusCode = 400; throw error;
    }
    const dispute = await db.withTransaction(async (client) => {
      const payload = { status, moderationStatus };
      const preview = await privilegedPreviewService.resolvePreview({ action: "moderation.rating_dispute.resolve", target: req.params.disputeId, payload }, { client, lock: true });
      await privilegedTransactionService.consumeConfirmation({ token: req.get("x-transaction-confirmation"), actorId: req.user._id, session: req.auth.session, action: "moderation.rating_dispute.resolve", target: req.params.disputeId, reason: req.body.reason, payload, previewRevision: req.body.previewRevision, currentPreviewRevision: preview.revision }, { client });
      const before = preview.state[0];
      if (!before || !["open", "reviewing"].includes(before.dispute_status)) { const error = new Error("Rating dispute not found."); error.statusCode = 404; throw error; }
      const result = await client.query("UPDATE rating_disputes SET dispute_status = $2, resolved_by_user_id = $3, resolved_at = NOW() WHERE id = $1 AND dispute_status IN ('open','reviewing') RETURNING *", [Number(req.params.disputeId), status, Number(req.user._id)]);
      const updated = result.rows[0];
      if (!updated) { const error = new Error("Rating dispute changed before the action completed."); error.statusCode = 409; throw error; }
      const table = before.rating_type === "vendor_review" ? "vendor_reviews" : "user_trust_ratings";
      await client.query(`UPDATE ${table} SET moderation_status = $2 WHERE id = $1`, [Number(before.rating_id), moderationStatus]);
      await securityAuditService.record({ actorId: req.user._id, actorRole: "platform_admin", sessionId: req.auth.sessionId, action: "moderation.rating_dispute.resolve", resourceType: "rating_dispute", resourceId: req.params.disputeId, reason: req.body.reason, outcome: "success", beforeState: { status: before.dispute_status }, afterState: { status: updated.dispute_status, moderationStatus } }, { client });
      return updated;
    });
    res.json({ dispute });
  })
);

router.get(
  "/billing-events",
  requirePlatformPermission("platform.billing.read"),
  asyncHandler(async (req, res) => {
    res.json({
      items: await platformRepository.listBillingEvents({ limit: req.query.limit })
    });
  })
);

module.exports = router;
