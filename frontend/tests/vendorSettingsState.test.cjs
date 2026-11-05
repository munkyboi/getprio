require("tsx/cjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  queueSettingsPayload,
  tenantSettingsFromSnapshot,
} = require("../src/vendor/settingsState.ts");

test("queue-only settings updates omit owner profile fields but retain all intake flags", () => {
  const current = {
    name: "Business",
    businessCategoryId: "category",
    publicProfileCategory: "Sports",
    publicProfileDisplayName: "Public business",
    publicProfileDescription: "Description",
    queuePrefix: "Q",
    averageServiceMinutes: 15,
    notificationThreshold: 3,
    autoPauseEnabled: true,
    autoPauseThreshold: 20,
    autoResumeEnabled: true,
    autoResumeVacancyPercent: 25,
  };
  const request = queueSettingsPayload(current);
  for (const key of [
    "name",
    "businessCategoryId",
    "publicProfileCategory",
    "publicProfileDisplayName",
    "publicProfileDescription",
  ])
    assert.equal(Object.hasOwn(request, key), false);
  assert.deepEqual(request, {
    queuePrefix: "Q",
    averageServiceMinutes: 15,
    notificationThreshold: 3,
    autoPauseEnabled: true,
    autoPauseThreshold: 20,
    autoResumeEnabled: true,
    autoResumeVacancyPercent: 25,
  });
  assert.equal(
    queueSettingsPayload({
      ...current,
      autoPauseEnabled: false,
      autoResumeEnabled: false,
    }).autoResumeEnabled,
    false,
  );
});

test("saved settings snapshots preserve explicit disabled intake state and existing defaults", () => {
  const settings = tenantSettingsFromSnapshot({
    name: "Business",
    queuePrefix: "Q",
    averageServiceMinutes: 15,
    notificationThreshold: 3,
    autoPauseEnabled: false,
    autoPauseThreshold: null,
    autoResumeEnabled: false,
    autoResumeVacancyPercent: null,
  });
  assert.equal(settings.autoPauseEnabled, false);
  assert.equal(settings.autoResumeEnabled, false);
  assert.equal(settings.autoPauseThreshold, 20);
  assert.equal(settings.autoResumeVacancyPercent, 20);
  assert.equal(settings.publicProfileDisplayName, "");
  assert.equal(settings.businessCategoryId, null);
});
