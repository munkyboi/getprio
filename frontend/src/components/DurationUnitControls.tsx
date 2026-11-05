import {
  ConfigurationInput,
  ConfigurationNumber,
} from "../vendor/ConfigurationUi";
import { FieldGroup } from "../vendor/components/ui/field";
import type { SaveVendorServiceRequest } from "@shared";

type UnitFields = Pick<
  SaveVendorServiceRequest,
  "bookingQuantityLabel" | "bookingQuantityMin" | "bookingQuantityMax"
>;
export default function DurationUnitControls({
  value,
  onChange,
  durationMinutes,
}: {
  durationMinutes: number;
  value: UnitFields;
  onChange: (changes: UnitFields) => void;
}) {
  const min = value.bookingQuantityMin ?? 1;
  const max = value.bookingQuantityMax ?? 24;
  return (
    <FieldGroup className="config-quantity-fields">
      <ConfigurationInput
        label="Quantity unit label"
        description="Name shown beside the quantity, such as Hours or Sessions."
        maxLength={40}
        required
        value={value.bookingQuantityLabel ?? "Units"}
        onChange={(event) =>
          onChange({ bookingQuantityLabel: event.currentTarget.value })
        }
      />
      <ConfigurationNumber
        inputMode="numeric"
        label="Minimum quantity"
        description="Lowest quantity customers can choose. It must fit within a 24-hour booking."
        min={1}
        max={Math.min(24, Math.floor(1440 / durationMinutes))}
        required
        value={min}
        error={
          !Number.isInteger(min) || min < 1 || min > 24
            ? "Enter a whole number from 1 to 24."
            : min * durationMinutes > 1440
              ? "Minimum quantity needs more than 24 hours. Reduce the quantity or duration."
              : undefined
        }
        onChange={(next) => onChange({ bookingQuantityMin: Number(next) })}
      />
      <ConfigurationNumber
        inputMode="numeric"
        label="Maximum quantity"
        description="Highest quantity customers can choose (1–24). Booking times are also limited to 24 hours."
        min={Math.max(1, min)}
        max={24}
        required
        value={max}
        error={
          !Number.isInteger(max) || max < 1 || max > 24
            ? "Enter a whole number from 1 to 24."
            : max < min
              ? "Maximum quantity must be at least the minimum."
              : undefined
        }
        onChange={(next) => onChange({ bookingQuantityMax: Number(next) })}
      />
    </FieldGroup>
  );
}
