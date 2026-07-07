import { TextInput, type TextInputProps } from "@mantine/core";
import { formatPhilippineMobileNumber, normalizePhilippineMobileNumber } from "../utils/phones";

type PhilippineMobileInputProps = Omit<TextInputProps, "value" | "defaultValue" | "onChange"> & {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
};

export default function PhilippineMobileInput({
  value,
  defaultValue,
  onChange,
  ...props
}: PhilippineMobileInputProps) {
  const displayValue = formatPhilippineMobileNumber(value ?? defaultValue ?? "");

  return (
    <TextInput
      {...props}
      description={props.description || "Enter a Philippine mobile number like (0917) 123-4567."}
      inputMode="numeric"
      placeholder="(0917) 123-4567"
      value={displayValue}
      onChange={(event) => {
        const normalized = normalizePhilippineMobileNumber(event.currentTarget.value);
        onChange?.(normalized);
      }}
    />
  );
}
