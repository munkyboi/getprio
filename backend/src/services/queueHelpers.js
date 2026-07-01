const crypto = require("crypto");
const env = require("../config/env");

function getDateKey(date = new Date(), timezone = env.appTimezone || "Asia/Manila") {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  return formatter.format(date).replace(/-/g, "");
}

function getRecoveryDeadline(date = new Date()) {
  return new Date(date.getTime() + env.queueRecoveryGraceMinutes * 60 * 1000);
}

function buildQueueEventActor(options = {}) {
  return {
    actorUserId: options.actorUserId || null,
    actorRole: options.actorRole || null,
    source: options.source || "system"
  };
}

function formatTicketNumber(prefix, value) {
  return `${prefix}${String(value).padStart(3, "0")}`;
}

function buildLookupCode() {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

function redactPublicContactDetails(entity) {
  if (!entity) {
    return null;
  }

  const { contactEmail: _contactEmail, contactPhone: _contactPhone, ...publicEntity } = entity;
  return publicEntity;
}

function getQueueIntakeState({
  waitingCount,
  autoPauseEnabled,
  autoPauseThreshold,
  autoResumeEnabled,
  autoResumeVacancyPercent,
  isPaused,
  pauseMode
}) {
  if (!autoPauseEnabled || !autoPauseThreshold) {
    return {
      autoPauseEnabled: Boolean(autoPauseEnabled),
      autoPauseThreshold: autoPauseThreshold || null,
      autoResumeEnabled: Boolean(autoResumeEnabled),
      autoResumeVacancyPercent: autoResumeVacancyPercent || null,
      currentWaitingCount: waitingCount,
      fillRatio: null,
      thresholdRemaining: null,
      resumeWaitingCount: null,
      state: "disabled",
      stateLabel: "Auto-pause off"
    };
  }

  const fillRatio = Math.min(waitingCount / autoPauseThreshold, 1);
  const thresholdRemaining = Math.max(autoPauseThreshold - waitingCount, 0);
  const resumeWaitingCount =
    autoResumeEnabled && autoResumeVacancyPercent
      ? Math.floor(autoPauseThreshold * (1 - autoResumeVacancyPercent / 100))
      : null;

  if (isPaused) {
    return {
      autoPauseEnabled: true,
      autoPauseThreshold,
      autoResumeEnabled: Boolean(autoResumeEnabled),
      autoResumeVacancyPercent: autoResumeVacancyPercent || null,
      currentWaitingCount: waitingCount,
      fillRatio,
      thresholdRemaining,
      resumeWaitingCount,
      state: "paused",
      stateLabel: pauseMode === "manual" ? "Paused" : "Auto-paused"
    };
  }

  if (fillRatio >= 0.85) {
    return {
      autoPauseEnabled: true,
      autoPauseThreshold,
      autoResumeEnabled: Boolean(autoResumeEnabled),
      autoResumeVacancyPercent: autoResumeVacancyPercent || null,
      currentWaitingCount: waitingCount,
      fillRatio,
      thresholdRemaining,
      resumeWaitingCount,
      state: "near_limit",
      stateLabel: "Near limit"
    };
  }

  return {
    autoPauseEnabled: true,
    autoPauseThreshold,
    autoResumeEnabled: Boolean(autoResumeEnabled),
    autoResumeVacancyPercent: autoResumeVacancyPercent || null,
    currentWaitingCount: waitingCount,
    fillRatio,
    thresholdRemaining,
    resumeWaitingCount,
    state: "open",
    stateLabel: "Open"
  };
}

function getAutoResumeWaitingCount(tenant) {
  if (
    !tenant.autoPauseEnabled ||
    !tenant.autoPauseThreshold ||
    !tenant.autoResumeEnabled ||
    !tenant.autoResumeVacancyPercent
  ) {
    return null;
  }

  return Math.floor(
    Number(tenant.autoPauseThreshold) * (1 - Number(tenant.autoResumeVacancyPercent) / 100)
  );
}

module.exports = {
  buildLookupCode,
  buildQueueEventActor,
  formatTicketNumber,
  getAutoResumeWaitingCount,
  getDateKey,
  getQueueIntakeState,
  getRecoveryDeadline,
  redactPublicContactDetails
};
