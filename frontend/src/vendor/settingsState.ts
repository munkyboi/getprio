import type { QueueSnapshot, UpdateTenantSettingsRequest } from "@shared";

export function queueSettingsPayload(settings: UpdateTenantSettingsRequest) {
  return {
    queuePrefix: settings.queuePrefix,
    averageServiceMinutes: settings.averageServiceMinutes,
    notificationThreshold: settings.notificationThreshold,
    autoPauseEnabled: settings.autoPauseEnabled,
    autoPauseThreshold: settings.autoPauseThreshold,
    autoResumeEnabled: settings.autoResumeEnabled,
    autoResumeVacancyPercent: settings.autoResumeVacancyPercent,
  };
}

export function tenantSettingsFromSnapshot(
  tenant: QueueSnapshot["tenant"],
): UpdateTenantSettingsRequest {
  return {
    name: tenant.name || "",
    publicProfileDisplayName: tenant.publicProfileDisplayName || "",
    publicProfileDescription: tenant.publicProfileDescription || "",
    publicProfileCategory: tenant.publicProfileCategory || "",
    businessCategoryId: tenant.businessCategoryId || null,
    queuePrefix: tenant.queuePrefix,
    averageServiceMinutes: tenant.averageServiceMinutes,
    notificationThreshold: tenant.notificationThreshold,
    autoPauseEnabled: tenant.autoPauseEnabled,
    autoPauseThreshold: tenant.autoPauseThreshold ?? 20,
    autoResumeEnabled: tenant.autoResumeEnabled,
    autoResumeVacancyPercent: tenant.autoResumeVacancyPercent ?? 20,
  };
}
