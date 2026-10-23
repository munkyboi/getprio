import {
  IconUser,
  IconListDetails,
  IconClipboardCheck,
  IconCheck,
  IconAlertCircle,
} from "@tabler/icons-react";
import { Button } from "./components/ui/button";

// Adapted from Shadcn Studio's Base UI Stepper 9 lateral navigation.
// Form state and confirmed command outcomes remain owned by the request editor.
export const requestSteps = [
  {
    id: "services",
    title: "Select resources",
    description: "Choose resources and one request duration",
    icon: IconListDetails,
  },
  {
    id: "customer",
    title: "Customer details",
    description: "Name and optional contact details",
    icon: IconUser,
  },
  {
    id: "review",
    title: "Review",
    description: "Check policies and choose how to save",
    icon: IconClipboardCheck,
  },
] as const;
export type RequestStep = (typeof requestSteps)[number]["id"];
export function RequestSteps({
  current,
  completed,
  invalid,
  locked,
  onChange,
}: {
  current: RequestStep;
  completed: RequestStep[];
  invalid: RequestStep | null;
  locked: boolean;
  onChange: (step: RequestStep) => void;
}) {
  return (
    <nav aria-label="Service request progress" className="request-step-nav">
      <ol>
        {requestSteps.map((step, index) => {
          const Icon =
            invalid === step.id
              ? IconAlertCircle
              : current === step.id
                ? step.icon
                : completed.includes(step.id)
                  ? IconCheck
                  : step.icon;
          const state =
            invalid === step.id
              ? "Needs attention"
              : current === step.id
                ? "Current step"
                : completed.includes(step.id)
                  ? "Visited"
                  : "Not reviewed";
          return (
            <li
              key={step.id}
              data-current={current === step.id}
              data-invalid={invalid === step.id}
            >
              <Button
                type="button"
                variant="ghost"
                disabled={locked}
                aria-current={current === step.id ? "step" : undefined}
                aria-controls={`request-step-${step.id}`}
                onClick={() => onChange(step.id)}
                className="request-step-trigger"
              >
                <span className="request-step-icon" data-state={
                  invalid === step.id
                    ? "invalid"
                    : current === step.id
                      ? "current"
                      : completed.includes(step.id)
                        ? "completed"
                        : "upcoming"
                }>
                  <Icon aria-hidden="true" />
                </span>
                <span>
                  <strong>
                    {index + 1}. {step.title}
                  </strong>
                  <span className="ops-muted request-step-description">
                    {step.description}
                  </span>
                  <span className="v:sr-only">{state}</span>
                </span>
              </Button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
