const DEFAULT_TIMEZONE = "Asia/Manila";

function normalizeTimeZone(value, fallback = DEFAULT_TIMEZONE) {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function isValidTimeZone(value) {
  const normalized = normalizeTimeZone(value, "");
  if (!normalized) {
    return false;
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: normalized }).format();
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  DEFAULT_TIMEZONE,
  isValidTimeZone,
  normalizeTimeZone
};
