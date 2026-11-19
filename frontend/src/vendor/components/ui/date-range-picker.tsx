import { useEffect, useState } from "react";
import { format } from "date-fns";
import { IconCalendar } from "@tabler/icons-react";
import type { DateRange as CalendarDateRange } from "react-day-picker";
import { Calendar } from "./calendar";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "./popover";
import { Button } from "./button";
import { cn } from "cn";

type DateRange = [Date | null, Date | null];

function rangeFromValue(value: DateRange): CalendarDateRange {
  return { from: value[0] || undefined, to: value[1] || undefined };
}

function rangeLabel(value: DateRange) {
  if (value[0] && value[1]) return `${format(value[0], "MMM d, yyyy")} – ${format(value[1], "MMM d, yyyy")}`;
  if (value[0]) return `${format(value[0], "MMM d, yyyy")} – End date`;
  return "Date range";
}

export function DateRangePicker({
  value,
  onChange,
  disabled = false,
  className,
}: {
  value: DateRange;
  onChange: (value: DateRange) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<CalendarDateRange>(rangeFromValue(value));

  useEffect(() => {
    if (open) setDraft(rangeFromValue(value));
  }, [open, value]);

  function apply() {
    onChange([draft.from || null, draft.to || null]);
    setOpen(false);
  }

  function clear() {
    setDraft({ from: undefined, to: undefined });
    onChange([null, null]);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button type="button" variant="outline" disabled={disabled} />}
        className={cn("date-range-trigger", className)}
        aria-label="Filter by booking date range"
      >
        <IconCalendar aria-hidden="true" data-icon="inline-start" />
        <span>{rangeLabel(value)}</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="date-range-popover">
        <PopoverHeader>
          <PopoverTitle>Booking date</PopoverTitle>
          <PopoverDescription>Select a start and end date.</PopoverDescription>
        </PopoverHeader>
        <Calendar
          mode="range"
          required={false}
          selected={draft}
          onSelect={range => setDraft(range || { from: undefined, to: undefined })}
          numberOfMonths={2}
        />
        <div className="date-range-actions">
          <Button type="button" variant="ghost" onClick={clear}>Clear</Button>
          <Button type="button" onClick={apply}>Apply range</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
