import type { DateInput } from "./dates";
import { toDate } from "./dates";

const DEFAULT_TIME_ZONE = "Asia/Manila";

function formatDate(value: DateInput, timeZone: string) {
  const date = toDate(value);

  return date
    ? new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone
      }).format(date)
    : "";
}

function formatTime(value: DateInput, timeZone: string) {
  const date = toDate(value);

  return date
    ? new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone
      }).format(date)
    : "";
}

function formatDuration(startValue: DateInput, endValue: DateInput) {
  const start = toDate(startValue);
  const end = toDate(endValue);

  if (!start || !end) {
    return "";
  }

  const durationMinutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  const parts: string[] = [];

  if (hours) {
    parts.push(`${hours} ${hours === 1 ? "Hour" : "Hours"}`);
  }
  if (minutes) {
    parts.push(`${minutes} ${minutes === 1 ? "Minute" : "Minutes"}`);
  }

  return parts.join(" ");
}

export function formatCampaignHeroDeadline(value: DateInput, timeZone = DEFAULT_TIME_ZONE) {
  const date = formatDate(value, timeZone);
  const time = formatTime(value, timeZone);

  return date && time ? `${date} at ${time}` : date || time;
}

export function formatCampaignHeroScheduleDate(value: DateInput, timeZone = DEFAULT_TIME_ZONE) {
  return formatDate(value, timeZone);
}

export function formatCampaignHeroScheduleSummary(
  startValue: DateInput,
  endValue: DateInput,
  timeZone = DEFAULT_TIME_ZONE
) {
  const start = formatTime(startValue, timeZone);
  const end = formatTime(endValue, timeZone);
  const duration = formatDuration(startValue, endValue);

  if (!start || !end) {
    return start || end;
  }

  return `${start} - ${end}${duration ? ` (${duration})` : ""}`;
}
