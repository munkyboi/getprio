import { format, getTime, isValid, parseISO } from "date-fns";

export type DateInput = string | Date | number | null | undefined;

export function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const date = typeof value === "string" ? parseISO(value) : new Date(value);

  return isValid(date) ? date : null;
}

export function toTimestamp(value: DateInput): number {
  const date = toDate(value);

  return date ? getTime(date) : Number.NaN;
}

export function formatDateTime(value: DateInput): string {
  const date = toDate(value);

  return date ? format(date, "M/d/yyyy, h:mm:ss a") : "";
}

export function formatDisplayDate(value: DateInput, timeZone?: string): string {
  const date = toDate(value);

  if (!date) {
    return "";
  }

  return timeZone
    ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone }).format(date)
    : format(date, "d MMM yyyy");
}

export function formatDisplayTime(value: DateInput, timeZone?: string): string {
  const date = toDate(value);

  if (!date) {
    return "";
  }

  return timeZone
    ? new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone }).format(date).toLowerCase()
    : format(date, "h:mm a").toLowerCase();
}

export function formatBookingScheduleDate(value: DateInput, timeZone?: string): string {
  return formatDisplayDate(value, timeZone);
}

export function formatBookingScheduleDateTime(value: DateInput): string {
  const date = formatDisplayDate(value);
  const time = formatDisplayTime(value);

  if (!date || !time) {
    return date || time;
  }

  return `${date} ${time}`;
}

export function formatBookingScheduleTimeRange(startValue: DateInput, endValue: DateInput, timeZone?: string): string {
  const start = formatDisplayTime(startValue, timeZone);
  const end = formatDisplayTime(endValue, timeZone);

  if (!start || !end) {
    return start || end;
  }

  return `${start} - ${end}`;
}

export function formatDateInputValue(value: DateInput = new Date()): string {
  const date = toDate(value);

  return date ? format(date, "yyyy-MM-dd") : "";
}

export function formatDateTimeInputValue(value: DateInput): string {
  const date = toDate(value);

  return date ? format(date, "yyyy-MM-dd'T'HH:mm") : "";
}
