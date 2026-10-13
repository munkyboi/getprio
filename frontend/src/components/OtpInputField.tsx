import { useEffect, useId, useRef } from "react";
import { Input, PinInput } from "@mantine/core";
import { useVendorAccount } from "../vendor/AccountPresentation";
import { ConfigurationInput } from "../vendor/ConfigurationUi";

type OtpInputFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onVerify?: () => Promise<void>;
  verificationKey?: string;
  autoVerifyEnabled?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  description?: string;
  name?: string;
  required?: boolean;
};

export function OtpInputField({
  label,
  value,
  onChange,
  onVerify,
  verificationKey = "",
  autoVerifyEnabled = true,
  disabled = false,
  description,
  autoFocus,
  name,
  required,
}: OtpInputFieldProps) {
  const id = useId();
  const vendor = useVendorAccount();
  const verifying = useRef(false);
  const lastAttempt = useRef(
    /^\d{6}$/.test(value) ? `${verificationKey}:${value}` : "",
  );

  useEffect(() => {
    if (!/^\d{6}$/.test(value)) {
      lastAttempt.current = "";
      return;
    }
    const attempt = `${verificationKey}:${value}`;
    if (lastAttempt.current === attempt) return;
    lastAttempt.current = attempt;
    // Completing prerequisites later must not submit a partially typed password.
    if (!onVerify || disabled || !autoVerifyEnabled || verifying.current)
      return;
    verifying.current = true;
    // Wait for controlled state to commit so verification reads all six digits.
    void onVerify().finally(() => {
      verifying.current = false;
    });
  }, [value, verificationKey, onVerify, autoVerifyEnabled, disabled]);

  if (vendor)
    return (
      <ConfigurationInput
        label={label}
        description={description}
        type="password"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        pattern="[0-9]{6}"
        autoFocus={autoFocus}
        name={name}
        required={required}
        value={value}
        disabled={disabled}
        onChange={(event) =>
          onChange(event.currentTarget.value.replace(/\D/g, "").slice(0, 6))
        }
      />
    );
  return (
    <Input.Wrapper
      label={label}
      description={description}
      required={required}
      id={`${id}-1`}
    >
      <PinInput
        autoFocus={autoFocus}
        name={name}
        id={id}
        ariaLabel={label}
        className="otp-input-field"
        size="lg"
        length={6}
        type="number"
        inputMode="numeric"
        mask
        placeholder=""
        oneTimeCode
        gap={4}
        classNames={{ pinInput: "otp-input-field__cell" }}
        getInputProps={(index) => ({
          "aria-label": `${label}, digit ${index + 1} of 6`,
          "aria-describedby": description ? `${id}-1-description` : undefined,
        })}
        value={value}
        onChange={(nextValue) =>
          onChange(nextValue.replace(/\D/g, "").slice(0, 6))
        }
        disabled={disabled}
      />
    </Input.Wrapper>
  );
}
