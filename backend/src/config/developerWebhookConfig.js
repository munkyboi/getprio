function resolveDeveloperWebhookConfig(source = process.env, nodeEnv = source.NODE_ENV || "development") {
  const configuredEncryptionKey = source.DEVELOPER_WEBHOOK_ENCRYPTION_KEY || "";
  if (nodeEnv === "production" && configuredEncryptionKey.length < 32) {
    throw new Error("DEVELOPER_WEBHOOK_ENCRYPTION_KEY must be set to a strong dedicated key in production.");
  }

  const developerWebhookMaxBodyBytes = Number(source.DEVELOPER_WEBHOOK_MAX_BODY_BYTES || 262144);
  const developerWebhookTimeoutMs = Number(source.DEVELOPER_WEBHOOK_TIMEOUT_MS || 10000);
  const developerWebhookSandboxRetentionDays = Number(source.DEVELOPER_WEBHOOK_SANDBOX_RETENTION_DAYS || 7);
  const developerWebhookProductionRetentionDays = Number(source.DEVELOPER_WEBHOOK_PRODUCTION_RETENTION_DAYS || 30);
  if (!Number.isSafeInteger(developerWebhookMaxBodyBytes) || developerWebhookMaxBodyBytes < 1024) {
    throw new Error("DEVELOPER_WEBHOOK_MAX_BODY_BYTES must be an integer of at least 1024.");
  }
  if (!Number.isSafeInteger(developerWebhookTimeoutMs) || developerWebhookTimeoutMs < 1000) {
    throw new Error("DEVELOPER_WEBHOOK_TIMEOUT_MS must be an integer of at least 1000.");
  }
  if (!Number.isSafeInteger(developerWebhookSandboxRetentionDays) || developerWebhookSandboxRetentionDays < 1) {
    throw new Error("DEVELOPER_WEBHOOK_SANDBOX_RETENTION_DAYS must be a positive integer.");
  }
  if (!Number.isSafeInteger(developerWebhookProductionRetentionDays) || developerWebhookProductionRetentionDays < 1) {
    throw new Error("DEVELOPER_WEBHOOK_PRODUCTION_RETENTION_DAYS must be a positive integer.");
  }

  return {
    developerWebhookEncryptionKey: configuredEncryptionKey || "getprio-local-developer-webhook-encryption-key",
    developerWebhookDispatchEnabled: source.DEVELOPER_WEBHOOK_DISPATCH_ENABLED === "true",
    developerWebhookMaxBodyBytes,
    developerWebhookTimeoutMs,
    developerWebhookSandboxRetentionDays,
    developerWebhookProductionRetentionDays,
  };
}

module.exports = { resolveDeveloperWebhookConfig };
