const storeLocationRepository = require("../repositories/storeLocations");

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toMinutes(value) {
  const [hours = "0", minutes = "0"] = String(value || "00:00").split(":");
  return Number(hours) * 60 + Number(minutes);
}

function getLocationParts(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone || "Asia/Manila",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const weekdayName = parts.find((part) => part.type === "weekday")?.value || "Sun";
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value || 0);

  return {
    weekday: WEEKDAY_LABELS.indexOf(weekdayName),
    minuteOfDay: hour * 60 + minute
  };
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
  getOpenStatus,
  assertLocationOpenForCustomerJoin
};
