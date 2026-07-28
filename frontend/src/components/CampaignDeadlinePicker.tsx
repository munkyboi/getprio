import { Stack, Text } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useEffect, useMemo, useState } from "react";

type CampaignDeadlinePickerProps = {
  disabled?: boolean;
  onChange: (value: string) => void;
  scheduledStartAt: string | Date | undefined;
  value: string;
};

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const CAMPAIGN_CUTOFF_HOUR = 22;

function pad(part: number) {
  return String(part).padStart(2, "0");
}

function isDateOnly(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function shiftDateOnly(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

function formatManilaDate(value: string | Date) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const manila = new Date(parsed.getTime() + MANILA_OFFSET_MS);
  return `${manila.getUTCFullYear()}-${pad(manila.getUTCMonth() + 1)}-${pad(manila.getUTCDate())}`;
}

export function resolveCampaignDeadline(value: string) {
  if (!isDateOnly(value)) return "";
  return new Date(`${value}T${CAMPAIGN_CUTOFF_HOUR}:00:00+08:00`).toISOString();
}

export function formatCampaignDeadlineDate(value: string | Date) {
  return formatManilaDate(value);
}

export function formatCampaignDeadline(value: string | Date) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Manila"
  }).format(parsed);
}

export function getCampaignDeadlineBounds(scheduledStartAt: string | Date | undefined, now = new Date()) {
  const today = formatManilaDate(now);
  const todayCutoff = today ? new Date(resolveCampaignDeadline(today)) : null;
  const min = todayCutoff && now < todayCutoff ? today : shiftDateOnly(today, 1);
  const bookingStart = scheduledStartAt ? new Date(scheduledStartAt) : null;

  if (!bookingStart || Number.isNaN(bookingStart.getTime())) {
    return { min, max: null, hasValidWindow: false };
  }

  const bookingDate = formatManilaDate(bookingStart);
  const bookingDateCutoff = new Date(resolveCampaignDeadline(bookingDate));
  const max = bookingDateCutoff < bookingStart ? bookingDate : shiftDateOnly(bookingDate, -1);
  return { min, max, hasValidWindow: min <= max };
}

export default function CampaignDeadlinePicker({ disabled = false, onChange, scheduledStartAt, value }: CampaignDeadlinePickerProps) {
  const [now, setNow] = useState(() => new Date());
  const bounds = useMemo(() => getCampaignDeadlineBounds(scheduledStartAt, now), [now, scheduledStartAt]);
  const selectedDate = useMemo(() => formatCampaignDeadlineDate(value), [value]);
  const resolvedDeadline = useMemo(() => selectedDate ? resolveCampaignDeadline(selectedDate) : "", [selectedDate]);
  const hasInvalidSelection = Boolean(selectedDate && (
    !bounds.max || selectedDate < bounds.min || selectedDate > bounds.max
  ));
  const error = !bounds.hasValidWindow
    ? "No 10:00 PM campaign cutoff is available before this booking starts."
    : hasInvalidSelection
      ? "Choose a date within the available campaign window."
      : undefined;

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(new Date()), 60 * 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  return <Stack gap={4}>
    <DatePickerInput
      clearable
      description={bounds.max
        ? `Choose a date from ${bounds.min} through ${bounds.max}. The cutoff is fixed at 10:00 PM Asia/Manila.`
        : "The cutoff is fixed at 10:00 PM Asia/Manila."}
      disabled={disabled || !bounds.hasValidWindow}
      error={error}
      label="Campaign deadline"
      maxDate={bounds.max || undefined}
      minDate={bounds.min}
      onChange={(nextValue) => onChange(nextValue ? resolveCampaignDeadline(nextValue) : "")}
      placeholder="Select campaign deadline date"
      required
      value={selectedDate || null}
      valueFormat="MMM D, YYYY"
    />
    {resolvedDeadline ? <Text c="dimmed" size="xs">Contributions close {formatCampaignDeadline(resolvedDeadline)}.</Text> : null}
  </Stack>;
}
