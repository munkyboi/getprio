import type { QueueServiceHoursWindowV1 } from './queueSelectionPlanV4';
/** Server observation only; commands revalidate the current store window. */
export interface QueueServiceHoursEligibilityV1 {
  status: 'fits' | 'does_not_fit' | 'unavailable' | 'not_enforced';
  reason: { code: string; message: string } | null;
  requiredDurationMinutes: number | null;
  serviceHoursWindow: QueueServiceHoursWindowV1 | null;
  nextChangeAt: string | null;
}
