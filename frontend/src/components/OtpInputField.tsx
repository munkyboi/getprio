import React, { useEffect, useId, useRef, type ReactNode } from "react";
import { Input, PinInput } from "@mantine/core";
import { useVendorAccount } from "../vendor/AccountPresentation";
import { Field, FieldDescription, FieldLabel } from "../vendor/components/ui/field";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "../vendor/components/ui/input-otp";
import { REGEXP_ONLY_DIGITS } from "input-otp";

export type OtpPresentationModel = {label:string;value:string;onChange:(value:string)=>void;disabled:boolean;autoFocus?:boolean;description?:string;name?:string;required?:boolean;};

export function otpVerificationDecision(value: string, verificationKey: string, lastAttempt: string, canVerify: boolean, verifying: boolean) {
  const attempt = /^\d{6}$/.test(value) ? `${verificationKey}:${value}` : "";
  return {
    attempt,
    complete: Boolean(attempt),
    shouldVerify: Boolean(attempt) && attempt !== lastAttempt && canVerify && !verifying,
  };
}

type OtpInputFieldProps = {
  renderPresentation?: (model:OtpPresentationModel)=>ReactNode;
  label: string;
  vendor?: boolean;
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
  renderPresentation,
  vendor: vendorPresentation = false,
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
  const accountPresentation = useVendorAccount();
  const vendor = vendorPresentation || accountPresentation;
  const verifying = useRef(false);
  const lastAttempt = useRef(
    /^\d{6}$/.test(value) ? `${verificationKey}:${value}` : "",
  );

  useEffect(() => {
    const decision = otpVerificationDecision(value, verificationKey, lastAttempt.current, Boolean(onVerify && autoVerifyEnabled && !disabled), verifying.current);
    if (!decision.complete) {
      lastAttempt.current = "";
      return;
    }
    // Consume every complete code once. If verification is currently guarded
    // (for example while another prerequisite is incomplete), enabling it
    // later must not submit the stale code without a fresh code commit or
    // challenge key.
    if (lastAttempt.current === decision.attempt) return;
    lastAttempt.current = decision.attempt;
    if (!decision.shouldVerify) return;
    verifying.current = true;
    // Wait for controlled state to commit so verification reads all six digits.
    void onVerify().finally(() => {
      verifying.current = false;
    });
  }, [value, verificationKey, onVerify, autoVerifyEnabled, disabled]);

  // CUSTOMER PRESENTATION INJECTION START
  if(renderPresentation)return renderPresentation({label,value,onChange,disabled,autoFocus,description,name,required});
  // CUSTOMER PRESENTATION INJECTION END
  if (vendor) {
    const inputId = `${id}-input`;
    const descriptionId = description ? `${id}-description` : undefined;
    return (
      <Field data-disabled={disabled}>
        <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
        <InputOTP
          id={inputId}
          name={name}
          value={value}
          onChange={(nextValue) => onChange(nextValue.replace(/\D/g, "").slice(0, 6))}
          maxLength={6}
          pattern={REGEXP_ONLY_DIGITS}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus={autoFocus}
          disabled={disabled}
          required={required}
          aria-label={label}
          aria-describedby={descriptionId}
          pasteTransformer={(pasted) => pasted.replace(/\D/g, "").slice(0, 6)}
          containerClassName="vendor-otp-input"
        >
          <InputOTPGroup className="vendor-otp-group">
            {Array.from({ length: 6 }, (_, index) => <InputOTPSlot key={index} index={index} />)}
          </InputOTPGroup>
        </InputOTP>
        {description ? <FieldDescription id={descriptionId}>{description}</FieldDescription> : null}
      </Field>
    );
  }
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
