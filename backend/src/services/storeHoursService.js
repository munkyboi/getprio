const storeLocationRepository = require("../repositories/storeLocations");

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toMinutes(value) {
  const [hours = "0", minutes = "0"] = String(value || "00:00").split(":");
  return Number(hours) * 60 + Number(minutes);
}

function getLocationParts(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone || "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const weekdayName = parts.find((part) => part.type === "weekday")?.value || "Sun";
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value || 0);
  const year = parts.find((part) => part.type === "year")?.value || "1970";
  const month = parts.find((part) => part.type === "month")?.value || "01";
  const day = parts.find((part) => part.type === "day")?.value || "01";

  return {
    weekday: WEEKDAY_LABELS.indexOf(weekdayName),
    minuteOfDay: hour * 60 + minute,
    dateKey: `${year}${month}${day}`
  };
}

function getLocationDateKey(date = new Date(), timezone = "Asia/Manila") {
  return getLocationParts(date, timezone).dateKey;
}

function addDaysToDateKey(dateKey, days) {
  const year = Number(String(dateKey).slice(0, 4));
  const month = Number(String(dateKey).slice(4, 6));
  const day = Number(String(dateKey).slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day + Number(days)));
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function getWeekdayForDateKey(dateKey) {
  const year = Number(String(dateKey).slice(0, 4));
  const month = Number(String(dateKey).slice(4, 6));
  const day = Number(String(dateKey).slice(6, 8));
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function isOpenForHour(hour, weekday, minuteOfDay) {
  if (!hour || hour.isClosed) {
    return false;
  }

  const open = toMinutes(hour.opensAt);
  const close = toMinutes(hour.closesAt);

  if (open === close) {
    return true;
  }

  if (open < close) {
    return minuteOfDay >= open && minuteOfDay < close;
  }

  return minuteOfDay >= open || minuteOfDay < close;
}

function buildHoursSummary(hours) {
  const openDays = hours.filter((hour) => !hour.isClosed);
  if (!openDays.length) {
    return "Closed";
  }

  if (openDays.length === 7 && openDays.every((hour) => hour.opensAt === "00:00" && hour.closesAt === "00:00")) {
    return "Open 24 hours";
  }

  return openDays
    .map((hour) => `${WEEKDAY_LABELS[hour.weekday]} ${hour.opensAt || "--:--"}-${hour.closesAt || "--:--"}`)
    .join(", ");
}

function formatHour(hour) {
  if (!hour) {
    return null;
  }

  return {
    weekday: hour.weekday,
    opensAt: hour.opensAt || "",
    closesAt: hour.closesAt || "",
    isClosed: Boolean(hour.isClosed)
  };
}

async function getOpenStatus(location, options = {}) {
  const hours = options.hours || (await storeLocationRepository.listHoursByLocationId(location._id));
  const now = options.now || new Date();
  const timezone = location.timezone || "Asia/Manila";
  const { weekday, minuteOfDay } = getLocationParts(now, timezone);
  const todaysHours = hours.find((hour) => hour.weekday === weekday);
  const isOpen = isOpenForHour(todaysHours, weekday, minuteOfDay);

  return {
    isOpen,
    timezone,
    summary: buildHoursSummary(hours),
    today: formatHour(todaysHours),
    nextOpenAt: null
  };
}

async function getNextOpenQueueDateKey(location, options = {}) {
  const hours = options.hours || (await storeLocationRepository.listHoursByLocationId(location._id));
  const timezone = location.timezone || "Asia/Manila";
  const fromDateKey = options.fromDateKey || getLocationDateKey(options.now || new Date(), timezone);
  const maxDays = Number(options.maxDays || 370);

  for (let offset = 1; offset <= maxDays; offset += 1) {
    const candidateDateKey = addDaysToDateKey(fromDateKey, offset);
    const weekday = getWeekdayForDateKey(candidateDateKey);
    const hour = hours.find((item) => item.weekday === weekday);
    if (hour && !hour.isClosed) {
      return candidateDateKey;
    }
  }

  const error = new Error("No open queue day is configured for this location.");
  error.statusCode = 400;
  throw error;
}

async function assertLocationOpenForCustomerJoin(location) {
  const openStatus = await getOpenStatus(location);
  if (openStatus.isOpen) {
    return openStatus;
  }

  const error = new Error("This location is currently closed. Please join during store hours.");
  error.statusCode = 403;
  error.openStatus = openStatus;
  throw error;
}

module.exports = {
  WEEKDAY_LABELS,
  buildHoursSummary,
  getLocationDateKey,
  getNextOpenQueueDateKey,
  getOpenStatus,
  assertLocationOpenForCustomerJoin
};
