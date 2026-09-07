const { isValidTimeZone, normalizeTimeZone } = require("../utils/timezones");

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

function getZonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const value = (type) => parts.find((part) => part.type === type)?.value;
  const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    weekday: weekdayNames.indexOf(value("weekday")),
    hour: Number(value("hour")),
    minute: Number(value("minute")),
    second: Number(value("second"))
  };
}

function localDateTimeToInstant(local, timeZone) {
  const desiredUtc = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour || 0,
    local.minute || 0,
    local.second || 0
  );
  let candidate = new Date(desiredUtc);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const actual = getZonedParts(candidate, timeZone);
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second
    );
    const difference = desiredUtc - actualAsUtc;
    if (difference === 0) {
      return candidate;
    }
    candidate = new Date(candidate.getTime() + difference);
  }

  const resolved = getZonedParts(candidate, timeZone);
  if (
    resolved.year !== local.year
    || resolved.month !== local.month
    || resolved.day !== local.day
    || resolved.hour !== (local.hour || 0)
    || resolved.minute !== (local.minute || 0)
  ) {
    throw new Error("The configured store hour resolves to a nonexistent local time.");
  }
  return candidate;
}

function parseTime(value) {
  const match = /^(\d{2}):(\d{2})/.exec(String(value || ""));
  if (!match) {
    return null;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) {
    return null;
  }
  return { hour, minute };
}

function shiftLocalDate(localDate, days) {
  const shifted = new Date(Date.UTC(localDate.year, localDate.month - 1, localDate.day) + days * DAY_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay()
  };
}

function formatBusinessDate(localDate) {
  return [
    String(localDate.year).padStart(4, "0"),
    String(localDate.month).padStart(2, "0"),
    String(localDate.day).padStart(2, "0")
  ].join("-");
}

function buildInterval(localDate, hours, timeZone) {
  if (!hours || hours.isClosed) {
    return null;
  }
  const opens = parseTime(hours.opensAt);
  const closes = parseTime(hours.closesAt);
  if (!opens || !closes) {
    return null;
  }

  const isTwentyFourHours = opens.hour === closes.hour && opens.minute === closes.minute;
  const isOvernight = !isTwentyFourHours
    && (closes.hour * 60 + closes.minute) < (opens.hour * 60 + opens.minute);
  const closeDate = shiftLocalDate(localDate, isOvernight || isTwentyFourHours ? 1 : 0);
  const opensAt = localDateTimeToInstant({ ...localDate, ...opens }, timeZone);
  const closesAt = localDateTimeToInstant({ ...closeDate, ...closes }, timeZone);

  return {
    businessDate: formatBusinessDate(localDate),
    timezone: timeZone,
    opensAt,
    closesAt,
    isOvernight,
    isTwentyFourHours
  };
}

function resolveEffectiveStoreInterval({ now = new Date(), timezone, hours }) {
  const timeZone = normalizeTimeZone(timezone);
  if (!isValidTimeZone(timeZone)) {
    const error = new Error("The location timezone is invalid.");
    error.code = "QUEUE_OUTSIDE_EFFECTIVE_HOURS";
    error.statusCode = 409;
    throw error;
  }
  const current = getZonedParts(now, timeZone);
  const today = {
    year: current.year,
    month: current.month,
    day: current.day,
    weekday: current.weekday
  };

  for (const localDate of [shiftLocalDate(today, -1), today]) {
    const dayHours = (hours || []).find((entry) => Number(entry.weekday) === localDate.weekday);
    const interval = buildInterval(localDate, dayHours, timeZone);
    if (interval && now >= interval.opensAt && now < interval.closesAt) {
      return interval;
    }
  }
  return null;
}

function getWarningPhase(queueDay, now = new Date()) {
  if (!queueDay || queueDay.state !== "open" || !queueDay.currentClosesAt) {
    return null;
  }
  const closesAt = new Date(queueDay.currentClosesAt);
  const remainingMs = closesAt.getTime() - now.getTime();
  if (remainingMs <= 0) {
    return "overdue";
  }
  if (remainingMs <= 15 * MINUTE_MS) {
    return "warning";
  }
  return Number(queueDay.deadlineVersion || 1) > 1 ? "extended" : "normal";
}

module.exports = {
  DAY_MS,
  MINUTE_MS,
  formatBusinessDate,
  getWarningPhase,
  getZonedParts,
  localDateTimeToInstant,
  resolveEffectiveStoreInterval
};
