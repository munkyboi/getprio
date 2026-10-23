import { useState } from "react";
import { IconInfoCircle, IconRefresh, IconX } from "@tabler/icons-react";
import type { QueueServiceHoursWindowV1 } from "../../../shared/queueSelectionPlanV4";
import { Alert, AlertAction, AlertDescription } from "./components/ui/alert";
import { Button } from "./components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./components/ui/tooltip";

export const durationCountHelp = "Duration count controls time, independently of resource quantity.";

export function DurationCountHelp() {
  const [open, setOpen] = useState(false);
  return <TooltipProvider><Tooltip open={open} onOpenChange={setOpen}>
    <TooltipTrigger type="button" className="duration-count-info" aria-label="About duration count" onClick={() => setOpen(true)}><IconInfoCircle aria-hidden="true" /></TooltipTrigger>
    <TooltipContent>{durationCountHelp}</TooltipContent>
  </Tooltip></TooltipProvider>;
}

export function DurationHoursRefresh({ disabled, onRefresh }: {disabled: boolean; onRefresh: () => void}) {
  return <TooltipProvider><Tooltip>
    <TooltipTrigger render={<Button type="button" variant="ghost" size="icon" aria-label="Refresh hours" disabled={disabled} onClick={onRefresh}><IconRefresh aria-hidden="true" /></Button>} />
    <TooltipContent>Refresh hours</TooltipContent>
  </Tooltip></TooltipProvider>;
}

type HoursNoticeProps = {
  scope?: {tenant: string; location: string};
  window?: QueueServiceHoursWindowV1;
  state?: string;
  message?: string;
  closesLabel?: string;
  maximumMinutes?: number;
  remainingMs?: number;
  /** Selected count expressed as workflow-aware minutes, independent of quantity. */
  duration?: number;
};

/** Observation timestamps and ticking remaining minutes do not undo dismissal. */
export function requestHoursNoticeKey({scope, window, state, message}: HoursNoticeProps) {
  return JSON.stringify([scope?.tenant, scope?.location, window?.timezone, window?.opensAt, window?.closesAt, state, message]);
}

/** Normal guidance follows the selected duration; blocking issues remain reviewable. */
export function requestHoursNoticeVisible({message, remainingMs, duration}: Pick<HoursNoticeProps, "message" | "remainingMs" | "duration">) {
  return Boolean(message) || typeof remainingMs === "number" && Number.isFinite(remainingMs) && remainingMs >= 0 && typeof duration === "number" && Number.isFinite(duration) && duration > 0 && remainingMs <= duration * 60 * 1000;
}

// The caller keys this child by requestHoursNoticeKey, so a meaningful change presents a fresh notice.
export function RequestHoursNotice({message, closesLabel, remainingMs, duration}: HoursNoticeProps) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || !requestHoursNoticeVisible({message, remainingMs, duration})) return null;
  return <Alert variant={message ? "warning" : "info"} className="request-hours-notice">
    <IconInfoCircle aria-hidden="true" />
    <AlertDescription>
      {!message ? <p>{closesLabel ? `We close at ${closesLabel}. ` : ""}Please choose a duration that finishes before closing.</p> : closesLabel ? <p>We close at {closesLabel}.</p> : null}
      {message ? <p>{message}</p> : null}
    </AlertDescription>
    <AlertAction><Button type="button" variant="ghost" size="icon" aria-label="Dismiss store hours notice" onClick={() => setDismissed(true)}><IconX aria-hidden="true" /></Button></AlertAction>
  </Alert>;
}
