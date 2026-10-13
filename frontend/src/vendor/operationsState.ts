import type { BookingSlotSummary } from "@shared";

/** Keep a selection only while the latest server response still admits that slot. */
export function availableRescheduleSelection(
  slots: ReadonlyArray<Pick<BookingSlotSummary, "startAt" | "isAvailable">>,
  selected: string,
): string {
  return slots.some(slot => slot.isAvailable && String(slot.startAt) === selected) ? selected : "";
}

/** Changing the lower bound must not leave a previously selected end before it. */
export function dateRangeWithStart(
  start: Date | null,
  end: Date | null,
): [Date | null, Date | null] {
  return [start, start && end && end < start ? null : end];
}
