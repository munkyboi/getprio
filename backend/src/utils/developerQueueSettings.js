function invalid(message) {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = "INVALID_REQUEST";
  return error;
}

function defaultQueuePrefix(slug) {
  return String(slug || "").trim().replace(/[^a-z0-9]/gi, "").slice(0, 4).toUpperCase();
}

function queuePrefix(value, slug) {
  const normalized = value === undefined || value === null || String(value).trim() === ""
    ? defaultQueuePrefix(slug)
    : String(value).trim().toUpperCase();
  if (!/^[A-Z0-9]{1,4}$/.test(normalized)) throw invalid("queuePrefix must be 1 to 4 letters or numbers.");
  return normalized;
}

function integerSetting(value, label, defaultValue, min, max) {
  const normalized = value === undefined || value === null || value === "" ? defaultValue : Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < min || normalized > max) {
    throw invalid(`${label} must be an integer between ${min} and ${max}.`);
  }
  return normalized;
}

function normalizeDeveloperQueueSettings(input = {}, slug, { partial = false } = {}) {
  const result = {};
  if (!partial || input.queuePrefix !== undefined || input.queue_prefix !== undefined) result.queuePrefix = queuePrefix(input.queuePrefix ?? input.queue_prefix, slug);
  if (!partial || input.averageServiceMinutes !== undefined || input.average_service_minutes !== undefined) result.averageServiceMinutes = integerSetting(input.averageServiceMinutes ?? input.average_service_minutes, "averageServiceMinutes", 15, 1, 120);
  if (!partial || input.notificationThreshold !== undefined || input.notification_threshold !== undefined) result.notificationThreshold = integerSetting(input.notificationThreshold ?? input.notification_threshold, "notificationThreshold", 2, 1, 10);
  return result;
}

module.exports = { defaultQueuePrefix, normalizeDeveloperQueueSettings };
