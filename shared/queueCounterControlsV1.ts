import type { QueueServiceHoursEligibilityV1 } from './queueServiceHoursEligibilityV1';
/** Vendor-only authoritative counter context. Freshness hints never authorize writes. */
import type { QueuePlanStageV2 } from './queuePlanV2';
export interface QueueCounterBindingV1 { counterSlug: string; expectedCounterId: string }
export interface QueuePlanRevisionsV1 {
  expectedTicketRevision: string;
  expectedPlanRevision: string;
  currentStageId: string;
  expectedStageRevision: string;
}
export interface QueuePlanSkipInputV1 extends QueuePlanRevisionsV1 {
  reservationGroupId: string;
  reason: string;
  counterSlug?: string;
  expectedCounterId?: string;
}
export interface QueuePlanRecallInputV1 extends QueuePlanRevisionsV1 {
  reason: string;
  counterSlug?: string;
  expectedCounterId?: string;
}
export type QueueCounterCommandV1 =
  | { kind: 'plan'; planId: string; action: 'call' | 'start' | 'complete' | 'interrupt' | 'skip'; body: QueueCounterBindingV1 & QueuePlanRevisionsV1 & { reservationGroupId?: string; allocationGroupId?: string; reason?: string; dispatchMode?: 'nextEligible' | 'selectedRequest' } }
  | { kind: 'legacy'; ticketId?: string; action: 'callNext' | 'start' | 'serve' | 'complete' | 'interrupt' | 'skip'; body: QueueCounterBindingV1 & { ticketId?: string; reason?: string } }
  | ({ kind: 'scan'; ticketId: string; ticketNumber: string } & QueueCounterBindingV1)
  | { kind: 'openRequest'; planId: string };
export interface QueueCounterActionV1 {
  enabled: boolean;
  blockReason: { code: string; message: string } | null;
  command: QueueCounterCommandV1 | null;
}
export type QueueCounterActionNameV1 = 'callNext' | 'callNextEligible' | 'start' | 'complete' | 'interrupt' | 'skip' | 'confirm' | 'manageRequest';
export interface QueueCounterTargetV1 {
  serviceHoursEligibility: QueueServiceHoursEligibilityV1;
  kind: 'legacy' | 'plan' | 'unknown';
  ticketId: string;
  ticketNumber: string;
  customerName: string;
  state: string;
  serviceStartedAt: string | null;
  joinChannel?: string | null;
  customerConfirmedAt?: string | null;
  planId?: string;
  contractVersion?: 2 | 3 | 4;
  currentStage?: QueuePlanStageV2;
  allowedActions?: string[];
  capabilities?: { execution: boolean; childOutcomes: boolean };
  resourceWait?: { code: string; message: string } | null;
  blockReason?: { code: string; message: string };
}
export interface QueueCounterControlsV1 {
  controlVersion: 1;
  requestKey: string;
  contextKey: string;
  scope: { tenantId: string; locationId: string; counterId: string; counterSlug: string };
  observedAt: string;
  counter: { id: string; slug: string; name: string; isActive: boolean };
  queueDay: { id: string | null; dateKey: string; open: boolean };
  current: QueueCounterTargetV1 | null;
  next: QueueCounterTargetV1 | null;
  fifoNext?: QueueCounterTargetV1 | null;
  actions: Record<QueueCounterActionNameV1, QueueCounterActionV1>;
  recallPolicy: 'preserve_original_band_age_sequence';
  refreshAfterMs: 15000;
}
