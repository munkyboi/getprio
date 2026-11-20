// Customer-scoped shadcn Base UI composition, matching the approved prototype.
import { useState } from "react";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from "../shadcn/select";
import { Popover, PopoverTrigger, PopoverContent } from "../shadcn/popover";
import { Calendar } from "../shadcn/calendar";
import { CalendarDays as IconCalendar } from "lucide-react";
import { formatDateInputValue } from "../../../utils/dates";
import { Button } from "../ui";
export function BookingSelect({
  value,
  onChange,
  options,
  disabled,
  label = "Location",
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled: boolean;
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => onChange(v || "")}
      disabled={disabled}
      items={options}
    >
      <SelectTrigger className="customer-booking-select" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent sideOffset={6} className="customer-booking-select-popup">
        <SelectGroup>
          {options.map((item) => (
            <SelectItem key={item.value} value={item.value} className="customer-booking-select-item">
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
export function BookingCalendar({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? new Date(`${value}T12:00:00`) : undefined;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        render={<Button type="button" variant="outline" className="customer-booking-date" />}
      >
        <IconCalendar />
        {selected?.toLocaleDateString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric",
        }) || "Choose a date"}
      </PopoverTrigger>
      <PopoverContent sideOffset={6} className="customer-booking-calendar">
        <Calendar
          mode="single"
          required
          selected={selected}
          defaultMonth={selected}
          disabled={{ before: today }}
          onSelect={(date) => {
            if (date) {
              onChange(formatDateInputValue(date));
              setOpen(false);
            }
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
