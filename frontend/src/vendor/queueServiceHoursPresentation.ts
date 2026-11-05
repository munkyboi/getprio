import type { QueueServiceHoursEligibilityV1 } from '../../../shared/queueServiceHoursEligibilityV1';

/** Only the server classifies hours; missing metadata never implies historical eligibility. */
export function serviceHoursCallAllowed(value: QueueServiceHoursEligibilityV1 | null | undefined) {
  return value?.status === 'fits' || value?.status === 'not_enforced';
}
export function serviceHoursNotice(value: QueueServiceHoursEligibilityV1 | null | undefined) {
  if (value?.status === 'fits') return {blocked: false, label: 'Fits current hours', message: '', neutral: true};
  if (value?.status === 'not_enforced') return {blocked: false, label: 'Earlier request · hours limit not applied', message: '', neutral: true};
  const closed = value?.status === 'does_not_fit' && value.serviceHoursWindow?.status === 'closed';
  const code = value?.reason?.code;
  const knownReason = !code || code === 'SERVICE_DURATION_EXCEEDS_STORE_HOURS' || code === 'STORE_HOURS_UNAVAILABLE';
  const message = !knownReason && value?.reason?.message ? value.reason.message
    : closed ? "We're closed right now. This request can't be called until we're open."
    : value?.status === 'does_not_fit' ? "There isn't enough time before closing. Choose a shorter duration."
    : "We couldn't check the opening hours. Refresh to try again.";
  return {blocked: true, neutral: false,
    label: closed ? "We're closed right now" : value?.status === 'does_not_fit' ? 'Not enough time before closing' : 'Opening hours unavailable',
    message};
}
