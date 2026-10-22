import type { QueueServiceHoursEligibilityV1 } from './queueServiceHoursEligibilityV1';
/** Implemented draft-only boundary. Published DTOs will be a distinct union. */
export interface QueueDraftLineV2 {
  lineId: string;
  serviceId?: string | null;
  quantity?: number | null;
  durationMinutes?: number | null;
}
export interface QueueDraftInputV2 {
  catalogRevision?: string | null;
  customer?: { name?: string; email?: string; phone?: string };
  lines?: QueueDraftLineV2[];
  notes?: string;
}
export interface QueueDraftV2 {
  contractVersion: 2;
  id: string;
  draftId: string;
  ticketId: null;
  ticketRevision: null;
  planRevision: string;
  state: "draft";
  customer: NonNullable<QueueDraftInputV2["customer"]>;
  lines: QueueDraftLineV2[];
  notes: string;
  catalogRevision: string | null;
  queuePosition: null;
  reservationGroups: [];
  allocationGroups: [];
  currentStage: null;
  resourceWait: null;
  allowedActions: Array<"edit" | "publish" | "delete">;
  publishReadiness?: { ready: boolean; blockReasons: Array<{code:string;message:string}>; provisional:true };
  observedAt: string;
}
export interface QueuePlanStageV2 {
  id: string;
  revision: string;
  attemptId: string;
  attempt: string;
  ordinal: number;
  stationId: string | null;
  stationName: string | null;
  label: string;
  serviceCounterIds: string[];
  assignedUserId: string | null;
  startedAt: string | null;
  endedAt: string | null;
  skippedAt?: string | null;
  skipReason?: string | null;
  skippedByUserId?: string | null;
  state:
    | "pending"
    | "waiting"
    | "called"
    | "in_service"
    | "paused"
    | "completed"
    | "interrupted"
    | "superseded"
    | "skipped";
}
export interface QueuePlanRequirementV2 {
  poolId: string;
  unitsPerQuantity: number;
  totalUnits: number;
  poolRevision: number;
  requirementRevision: number;
}
export interface QueuePlanLineV2 {
  lineId: string;
  lineRevision: string;
  serviceId: string;
  serviceName: string;
  serviceRevision: string;
  stageId: string;
  quantity: number;
  durationMinutes: number;
  executionMode: "parallel";
  priceDisplay: string | null;
  requirements: QueuePlanRequirementV2[];
}
export interface QueueReservationGroupV2 {
  id: string;
  planRevision: string;
  attempt: string;
  stageAttemptId: string;
  state: "protected" | "converted" | "cancelled" | "expired" | "skipped";
  expiresAt: string;
  expectedMemberIds: string[];
  members: Array<{
    id: string;
    lineId: string;
    stageAttemptId: string;
    poolId: string;
    units: number;
    startsAt: string;
    endsAt: string;
    state: "protected" | "converted" | "cancelled";
  }>;
}
export interface QueueAllocationGroupV2 {
  id: string;
  reservationGroupId: string;
  stageAttemptId: string;
  expectedMemberIds: string[];
  startedAt: string;
  releasedAt: string | null;
  outcome: "completed" | "terminated" | null;
  members: Array<{
    id: string;
    lineId: string;
    stageAttemptId: string;
    poolId: string;
    units: number;
    reservationId: string;
    startedAt: string;
    expectedEndAt: string;
    releasedAt: string | null;
    outcome: "completed" | "terminated" | null;
  }>;
}
export interface QueuePublishedPlanV2 {
  serviceHoursEligibility: QueueServiceHoursEligibilityV1;
  contractVersion: 2;
  id: string;
  draftId: string;
  ticketId: string;
  ticketNumber: string;
  ticketRevision: string;
  planRevision: string;
  state:
    | "waiting"
    | "called"
    | "in_service"
    | "served"
    | "skipped"
    | "cancelled"
    | "unserved"
    | "expired"
    | "pending_carry_over";
  customer: NonNullable<QueueDraftInputV2["customer"]>;
  notes: string;
  workflow: { mode: "linear" | "multi_station"; configurationRevision: string };
  lines: QueuePlanLineV2[];
  currentStage: QueuePlanStageV2;
  stages: QueuePlanStageV2[];
  reservationGroups: QueueReservationGroupV2[];
  allocationGroups: QueueAllocationGroupV2[];
  resourceWait: {
    code: "RESOURCE_CAPACITY_UNAVAILABLE" | "RESERVATION_EXPIRED";
    message: string;
    planRevision: string;
    stageId: string;
    observedAt: string;
  } | null;
  publishedAt: string;
  allowedActions: Array<
    | "amend"
    | "call"
    | "start"
    | "complete"
    | "interrupt"
    | "handoff"
    | "pause"
    | "resume"
    | "retry"
    | "reassign"
    | "skip"
    | "recall"
  >;
  permittedReassignmentUsers: Array<{
    id: string;
    name: string;
    role: "owner" | "admin" | "staff";
  }>;
  observedAt: string;
}
export type QueuePlanV2 = QueueDraftV2 | QueuePublishedPlanV2;
export interface QueuePlanCommandInputV2 {
  expectedTicketRevision: string;
  expectedPlanRevision: string;
  currentStageId: string;
  expectedStageRevision: string;
}
export interface QueueServiceChoiceV2 {
  id: string;
  name: string;
  serviceRevision: string;
  durationMinutes: number;
  durationEditable: false;
  quantityMin: number;
  quantityMax: number;
  resourceReady: boolean;
  resourceLabel: string | null;
  unitsPerQuantity: number | null;
  poolId: string | null;
  poolRevision: number | null;
  requirementRevision: number | null;
}
export interface QueueWorkflowV2 {
  configurationRevision: string;
  mode: "linear" | "multi_station";
  stations: Array<{
    stationId: string;
    name: string;
    serviceCounterIds: string[];
  }>;
  stages: Array<{
    stageId: string;
    stationId: string;
    label: string;
    serviceIds: string[];
  }>;
}

/** DELETE /queue/plans/:id. Mandatory Idempotency-Key; branch queue-operation grant. */
export interface QueueDraftDeleteInputV1 { expectedPlanRevision: string }
export interface QueueDraftDeleteResultV1 {
  deletedDraft: { id: string; planRevision: string; state: 'discarded' };
  replayed?: true;
}
