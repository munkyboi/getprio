import { NumberInput, SimpleGrid, TextInput } from "@mantine/core";
import type { SaveVendorServiceRequest } from "@shared";

type UnitFields = Pick<SaveVendorServiceRequest, "bookingQuantityLabel" | "bookingQuantityMin" | "bookingQuantityMax">;
export default function DurationUnitControls({ value, onChange }: { value: UnitFields; onChange: (changes: UnitFields) => void }) {
  const min = value.bookingQuantityMin ?? 1;
  const max = value.bookingQuantityMax ?? 24;
  return <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
    <TextInput label="Quantity unit label" description="Name shown beside the quantity, such as Hours or Sessions." maxLength={40} required value={value.bookingQuantityLabel ?? "Units"} onChange={(event) => onChange({ bookingQuantityLabel: event.currentTarget.value })} />
    <NumberInput label="Minimum quantity" description="Lowest quantity customers can choose (1–24)." min={1} max={24} allowDecimal={false} required value={min} error={!Number.isInteger(min) || min < 1 || min > 24 ? "Enter a whole number from 1 to 24." : undefined} onChange={(next) => onChange({ bookingQuantityMin: Number(next) })} />
    <NumberInput label="Maximum quantity" description="Highest quantity customers can choose (1–24)." min={1} max={24} allowDecimal={false} required value={max} error={!Number.isInteger(max) || max < 1 || max > 24 ? "Enter a whole number from 1 to 24." : max < min ? "Maximum quantity must be at least the minimum." : undefined} onChange={(next) => onChange({ bookingQuantityMax: Number(next) })} />
  </SimpleGrid>;
}
