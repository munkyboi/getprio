import { useContext } from "react";
import { OTPInput, OTPInputContext, REGEXP_ONLY_DIGITS } from "input-otp";

type DeveloperInputOtpProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
};

function InputOtpSlot({ index }: { index: number }) {
  const { slots } = useContext(OTPInputContext);
  const slot = slots[index];

  return (
    <div className="developer-input-otp-slot" data-active={slot?.isActive || undefined}>
      {slot?.char}
      {slot?.hasFakeCaret && <span className="developer-input-otp-caret" aria-hidden="true" />}
    </div>
  );
}

/** Shadcn's InputOTP composition, styled with the Developer Portal tokens. */
export default function DeveloperInputOtp({ id, value, onChange, onComplete, disabled, invalid }: DeveloperInputOtpProps) {
  return (
    <OTPInput
      aria-label="Six-digit verification code"
      aria-invalid={invalid || undefined}
      autoComplete="one-time-code"
      containerClassName="developer-input-otp"
      disabled={disabled}
      inputMode="numeric"
      id={id}
      maxLength={6}
      name="code"
      pattern={REGEXP_ONLY_DIGITS}
      required
      value={value}
      onChange={onChange}
      onComplete={onComplete}
    >
      <div className="developer-input-otp-group" aria-hidden="true">
        <div className="developer-input-otp-segment">
          {Array.from({ length: 3 }, (_, index) => <InputOtpSlot index={index} key={index} />)}
        </div>
        <span className="developer-input-otp-separator">−</span>
        <div className="developer-input-otp-segment">
          {Array.from({ length: 3 }, (_, index) => <InputOtpSlot index={index + 3} key={index + 3} />)}
        </div>
      </div>
    </OTPInput>
  );
}
