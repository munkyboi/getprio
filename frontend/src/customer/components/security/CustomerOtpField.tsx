import { useId, type ComponentProps, type ReactNode } from "react";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { OtpInputField } from "../../../components/OtpInputField";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "../shadcn/field";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "../shadcn/input-otp";

const OTP_LENGTH = 6;

type CustomerOtpInputProps = {
  label: string;
  id?: string;
  name?: string;
  value?: string;
  onChange?: (value: string) => void;
  onComplete?: (value: string) => void;
  autoFocus?: boolean;
  disabled?: boolean;
  required?: boolean;
  description?: ReactNode;
  error?: string;
};

export function CustomerOtpInput({
  label,
  id,
  name = "otpCode",
  value,
  onChange,
  onComplete,
  autoFocus = false,
  disabled = false,
  required = false,
  description,
  error,
}: CustomerOtpInputProps) {
  const generatedId = useId();
  const inputId = id || `customer-otp-${generatedId.replaceAll(":", "")}`;
  const descriptionId = description ? `${inputId}-description` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <Field
      className="customer-otp-field"
      data-invalid={Boolean(error)}
      data-disabled={disabled}
    >
      <FieldLabel htmlFor={inputId} className="customer-field">
        {label}
      </FieldLabel>
      <InputOTP
        id={inputId}
        name={name}
        value={value}
        onChange={(nextValue) => onChange?.(nextValue.replace(/\D/g, "").slice(0, OTP_LENGTH))}
        onComplete={onComplete}
        maxLength={OTP_LENGTH}
        pattern={REGEXP_ONLY_DIGITS}
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus={autoFocus}
        disabled={disabled}
        required={required}
        aria-label={label}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        pasteTransformer={(pasted) => pasted.replace(/\D/g, "").slice(0, OTP_LENGTH)}
        containerClassName="customer-otp-input"
      >
        <InputOTPGroup className="customer-otp-group">
          {Array.from({ length: OTP_LENGTH }, (_, index) => (
            <InputOTPSlot
              key={index}
              index={index}
              aria-invalid={Boolean(error)}
            />
          ))}
        </InputOTPGroup>
      </InputOTP>
      {description ? (
        <FieldDescription id={descriptionId}>{description}</FieldDescription>
      ) : null}
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </Field>
  );
}

type CustomerOtpFieldProps = Omit<
  ComponentProps<typeof OtpInputField>,
  "renderPresentation"
> & {
  error?: string;
};

export function CustomerOtpField({ error, ...props }: CustomerOtpFieldProps) {
  return (
    <OtpInputField
      {...props}
      renderPresentation={(m) => (
        <CustomerOtpInput
          label={m.label}
          name={m.name}
          value={m.value}
          onChange={m.onChange}
          autoFocus={m.autoFocus}
          disabled={m.disabled}
          required={m.required}
          description={m.description}
          error={error}
        />
      )}
    />
  );
}
