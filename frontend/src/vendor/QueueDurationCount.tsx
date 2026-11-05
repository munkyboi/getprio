import { DurationCountHelp, durationCountHelp } from "./RequestDurationPresentation";
import { Separator } from "./components/ui/separator";
import { Button } from "./components/ui/button";
import { countPolicyIssue, type CountIntersection } from "./durationCountPolicy";
import type { QueueDurationPolicyV4 } from "../../../shared/queueSelectionPlanV4";
import { useId, useState, type ReactNode } from "react";
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
  FieldGroup,
} from "./components/ui/field";
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
  InputGroupText,
} from "./components/ui/input-group";

/** Validate the explicit count policy; never derive counts from historical minutes. */
export function durationCountIssue(
  value: string,
  policy: QueueDurationPolicyV4,
): string | undefined {
  return countPolicyIssue(value, policy);
}

export function durationTotalLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60),
    remainder = minutes % 60;
  return [
    hours ? `${hours} ${hours === 1 ? "hour" : "hours"}` : "",
    remainder ? `${remainder} ${remainder === 1 ? "minute" : "minutes"}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Prepared v4 control. The parent retains invalid input and the captured policy revision. */
export function QueueDurationCount({
  label,
  value,
  policy,
  capturedRevision,
  capturedBaseMinutes,
  disabled,
  onChange,
  bounds,
  hours,
  validationIssue,
  withStepper = false,
  inputSuffix,
  totalLabel,
  summaryAction,
}: {
  label: ReactNode;
  value: string;
  policy: QueueDurationPolicyV4;
  capturedRevision: string;
  capturedBaseMinutes?: number;
  disabled: boolean;
  onChange: (value: string) => void;
  bounds?: CountIntersection | null;
  hours?: { message?: string; closesLabel?: string; maximumMinutes?: number };
  validationIssue?: string;
  withStepper?: boolean;
  inputSuffix?: ReactNode;
  totalLabel?: ReactNode;
  summaryAction?: ReactNode;
}) {
  const id = useId();
  const [touched, setTouched] = useState(false);
  const stale = capturedRevision !== policy.revision;
  const issue = stale
    ? "Duration policy changed. Review the service configuration before continuing."
    : validationIssue || durationCountIssue(value, policy);
  const computed = Number(value) * policy.baseMinutes;
  const total =
    !issue && Number.isSafeInteger(computed) && computed > 0
      ? computed
      : undefined;
  const minimum = bounds?.min ?? policy.minCount;
  const maximum = bounds?.max ?? policy.maxCount;
  const step = bounds?.step ?? policy.stepCount;
  const count = Number(value);
  const canStep = Boolean(bounds && !disabled && !stale && value.trim() && Number.isSafeInteger(count) && !validationIssue && !durationCountIssue(value,policy));
  return (
    <FieldGroup>
      {stale ? (
        <p role="alert">
          {capturedBaseMinutes
            ? `Previously reviewed base: ${capturedBaseMinutes} minutes. `
            : "Previously reviewed total is unavailable. "}
          Current policy base: {policy.baseMinutes} minutes. Accept the current
          policy explicitly before using its total.
        </p>
      ) : null}
      {hours ? <div className="request-duration-hours"><FieldDescription>{hours.closesLabel ? `Closes at ${hours.closesLabel}. ` : ""}{hours.maximumMinutes !== undefined ? `Maximum before closing: ${durationTotalLabel(hours.maximumMinutes)}.` : ""}</FieldDescription>{hours.message ? <p role="alert">{hours.message}</p> : null}<FieldDescription>Based on starting now. Resource availability is checked separately.</FieldDescription></div> : null}
      {policy.visible || withStepper ? (
        <Field
          data-invalid={Boolean(issue && (touched || stale))}
          data-disabled={disabled}
        >
          <div className="duration-count-label"><FieldLabel htmlFor={id}>{label}</FieldLabel><DurationCountHelp /></div>
          <div className={withStepper ? "request-duration-input-row" : undefined}>
          {withStepper ? <Button type="button" variant="outline" aria-label="Decrease duration count" disabled={!canStep || count-step<minimum} onClick={()=>onChange(String(count-step))}>−</Button> : null}
          <InputGroup className="v:min-h-11">
            <InputGroupInput
              id={id}
              type="number"
              inputMode="numeric"
              min={minimum}
              max={maximum}
              step={step}
              value={value}
              readOnly={withStepper ? Boolean(bounds?.fixed && count === bounds.min) : policy.mode === "fixed"}
              disabled={disabled}
              aria-invalid={Boolean(issue && (touched || stale))}
              aria-describedby={`${id}-help${issue && (touched || stale) ? ` ${id}-error` : ""}`}
              onBlur={() => setTouched(true)}
              onChange={(event) => {
                setTouched(false);
                onChange(event.currentTarget.value);
              }}
            />
            {!withStepper ? <InputGroupAddon align="inline-end">
              <InputGroupText>{inputSuffix || <>× {policy.baseMinutes} min</>}</InputGroupText>
            </InputGroupAddon> : null}
          </InputGroup>
          {withStepper ? <Button type="button" variant="outline" aria-label="Increase duration count" disabled={!canStep || count+step>maximum} onClick={()=>onChange(String(count+step))}>+</Button> : null}
          </div>
          {withStepper ? <FieldDescription>{inputSuffix || <>× {policy.baseMinutes} min</>}</FieldDescription> : null}
          <FieldDescription id={`${id}-help`} className="v:sr-only">{durationCountHelp}</FieldDescription>
          {issue && (touched || stale) ? (
            <FieldError id={`${id}-error`}>{issue}</FieldError>
          ) : null}
        </Field>
      ) : issue ? (
        <p role="alert">{issue}</p>
      ) : null}
      <div className="duration-summary-row">
      <p role="status" className="queue-duration-summary">
        {totalLabel !== undefined ? totalLabel : total === undefined ? (
          "Total duration requires review."
        ) : (
          <>
            <strong>{durationTotalLabel(total)}</strong>
            <span className="ops-muted">
              {value} × {policy.baseMinutes} min
            </span>
          </>
        )}
      </p>
      {summaryAction ? <><Separator orientation="vertical" />{summaryAction}</> : null}
      </div>
    </FieldGroup>
  );
}
