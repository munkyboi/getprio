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

export function formatDisplayDate(value: DateInput): string {
  const date = toDate(value);

  return date ? format(date, "d MMM yyyy") : "";
}

export function formatDisplayTime(value: DateInput): string {
  const date = toDate(value);

  return date ? format(date, "h:mm a").toLowerCase() : "";
}

export function formatBookingScheduleDate(value: DateInput): string {
  return formatDisplayDate(value);
}

export function formatBookingScheduleDateTime(value: DateInput): string {
  const date = formatDisplayDate(value);
  const time = formatDisplayTime(value);

  if (!date || !time) {
    return date || time;
  }

  return `${date} ${time}`;
}

export function formatBookingScheduleTimeRange(startValue: DateInput, endValue: DateInput): string {
  const start = formatDisplayTime(startValue);
  const end = formatDisplayTime(endValue);

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
