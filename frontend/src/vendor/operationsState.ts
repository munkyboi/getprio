import type { BookingSlotSummary } from "@shared";

/** Keep a selection only while the latest server response still admits that slot. */
export function availableRescheduleSelection(
  slots: ReadonlyArray<Pick<BookingSlotSummary, "startAt" | "isAvailable">>,
  selected: string,
): string {
  return slots.some(slot => slot.isAvailable && String(slot.startAt) === selected) ? selected : "";
}

/** Never retain an end date before the start, regardless of which bound changed. */
export function orderedDateRange(
  start: Date | null,
  end: Date | null,
): [Date | null, Date | null] {
  return [start, start && end && end < start ? null : end];
}

/** Keep controlled pagination valid when filters or refreshed data reduce the page count. */
export function boundedPage(value: number, total: number): number {
  return Math.min(Math.max(1, value), Math.max(1, total));
}
