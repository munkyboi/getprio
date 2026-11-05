import type { QueueServiceHoursEligibilityV1 } from './queueServiceHoursEligibilityV1';
/** Named-resource vendor preview contract. Customer intake remains separate. */
import type { QueuePlanStageV2, QueueWorkflowV2 } from "./queuePlanV2";
export interface QueueExtraSelectionInputV3 {
  extraSelectionId: string;
  serviceId: string | null;
  quantity: number | null;
  durationMinutes: number | null;
}
export interface QueueResourceSelectionInputV3 {
  resourceSelectionId: string;
  resourceMemberId: string | null;
  quantity: number | null;
  durationMinutes: number | null;
  extras: QueueExtraSelectionInputV3[];
}
export interface QueueServiceSelectionInputV3 {
  serviceSelectionId: string;
  serviceId: string | null;
  resources: QueueResourceSelectionInputV3[];
}
export interface QueueSelectionDraftInputV3 {
  serviceSelections: QueueServiceSelectionInputV3[];
  catalogRevision: string | null;
  customer: { name?: string; email?: string; phone?: string };
  notes: string;
}
export interface QueueDurationPolicyV3 {
  revision: string;
  optionsMinutes: number[];
}
export interface QueueQuoteV3 {
  status: "unavailable";
  reasonCode: "SERVICE_PRICING_NOT_CONFIGURED";
}
export interface QueueChildCommandInputV3 {
  expectedTicketRevision: string;
  expectedPlanRevision: string;
  currentStageId: string;
  expectedStageRevision: string;
  childAttemptId: string;
  expectedChildRevision: string;
  allocationGroupId: string;
}
export interface QueueChildRevisionV3 {
  childAttemptId: string;
  expectedChildRevision: string;
}
export interface QueueChildInterruptInputV3 extends QueueChildCommandInputV3 {
  reason: string;
  /** Exact unfinished active extras, explicitly included with the court. */
  interruptedExtras: QueueChildRevisionV3[];
}
export type QueueCourtRetryInputV3 = Omit<
  QueueChildCommandInputV3,
  "allocationGroupId"
> & {
  /** Exact interrupted unfinished extras; completed extras keep their attempts. */
  interruptedExtras: QueueChildRevisionV3[];
};
export interface QueueChildExecutionV3 {
  childAttemptId: string;
  revision: string;
  attempt: string;
  planRevision: string;
  stageId: string;
  stageAttemptId: string;
  selectionId: string;
  selectionKind: "resource" | "extra";
  parentChildAttemptId: string | null;
  parentResourceSelectionId: string | null;
  state:
    | "pending"
    | "waiting"
    | "protected"
    | "in_service"
    | "completed"
    | "interrupted"
    | "superseded"
    | "skipped";
  isCurrent: boolean;
  startedAt: string | null;
  endedAt: string | null;
  satisfiedDependencyAttemptIds: string[];
  reservationGroupId: string | null;
  reservationMemberIds: string[];
  allocationGroupId: string | null;
  allocationMemberIds: string[];
  allowedActions: Array<"complete" | "interrupt" | "retry">;
}
export interface QueueExtraSelectionV3
  extends Omit<
    QueueExtraSelectionInputV3,
    "serviceId" | "quantity" | "durationMinutes"
  > {
  serviceId: string;
  quantity: number;
  durationMinutes: number;
  serviceSelectionId: string;
  parentResourceSelectionId: string;
  serviceName: string;
  serviceRevision: string;
  policyRevision: string;
  required: true;
  quote: QueueQuoteV3;
  execution: QueueChildExecutionV3 | null;
}
export interface QueueResourceSelectionV3
  extends Omit<
    QueueResourceSelectionInputV3,
    "extras" | "quantity" | "durationMinutes"
  > {
  quantity: number;
  durationMinutes: number;
  serviceSelectionId: string;
  resourceMemberName: string | null;
  resourceMemberRevision: string | null;
  policyRevision: string;
  quote: QueueQuoteV3;
  execution: QueueChildExecutionV3 | null;
  extras: QueueExtraSelectionV3[];
}
export interface QueueServiceSelectionV3
  extends Omit<QueueServiceSelectionInputV3, "resources" | "serviceId"> {
  serviceId: string;
  serviceName: string;
  serviceRevision: string;
  policyRevision: string;
  stageId: string;
  quote: QueueQuoteV3;
  resources: QueueResourceSelectionV3[];
}
export interface QueueSelectionDraftV3 {
  contractVersion: 3;
  id: string;
  draftId: string;
  ticketId: null;
  ticketRevision: null;
  planRevision: string;
  state: "draft";
  customer: { name?: string; email?: string; phone?: string };
  serviceSelections: QueueServiceSelectionInputV3[];
  notes: string;
  catalogRevision: string | null;
  queuePosition: null;
  reservationGroups: [];
  allocationGroups: [];
  currentStage: null;
  resourceWait: null;
  quote: QueueQuoteV3;
  allowedActions: Array<"edit" | "publish" | "delete">;
  publishReadiness?: { ready: boolean; blockReasons: Array<{code:string;message:string}>; provisional:true };
  observedAt: string;
}
export interface QueueReservationGroupV3 {
  id: string;
  planRevision: string;
  stageAttemptId: string;
  attempt: string;
  state: "protected" | "converted" | "cancelled" | "expired" | "skipped";
  expiresAt: string;
  expectedMembers: Array<{
    lineId: string;
    childAttemptId: string;
    reservationId: string;
  }>;
  members: Array<{
    id: string;
    childAttemptId: string;
    selectionId: string;
    poolId: string;
    units: number;
    resourceMemberId: string | null;
    startsAt: string;
    endsAt: string;
    state: "protected" | "converted" | "cancelled";
  }>;
}
export interface QueueAllocationGroupV3 {
  id: string;
  stageAttemptId: string;
  reservationGroupId: string;
  expectedMembers: Array<{
    lineId: string;
    childAttemptId: string;
    reservationId: string;
    allocationId: string;
  }>;
  startedAt: string;
  releasedAt: string | null;
  outcome: "completed" | "terminated" | null;
  resolutionState: "open" | "partial" | "completed" | "interrupted" | "mixed";
  resolutionSummary: {
    total: number;
    resolved: number;
    completed: number;
    interrupted: number;
  } | null;
  members: Array<{
    id: string;
    childAttemptId: string;
    selectionId: string;
    poolId: string;
    units: number;
    resourceMemberId: string | null;
    reservationId: string;
    startedAt: string;
    expectedEndAt: string;
    releasedAt: string | null;
    outcome: "completed" | "terminated" | null;
  }>;
}
export interface QueueResourceWaitV3 {
  code:
    | "RESOURCE_CAPACITY_UNAVAILABLE"
    | "RESOURCE_OCCUPIED"
    | "RESOURCE_PROTECTED"
    | "ANONYMOUS_RESOURCE_USAGE"
    | "RESERVATION_EXPIRED"
    | "RESERVATION_CANCELLED";
  message: string;
  planRevision: string;
  stageId: string;
  observedAt: string;
  /** Present for capacity wait; absent for group-wide expiry/cancellation. */
  selectionId?: string;
  selectionKind?: "resource" | "extra";
  parentResourceSelectionId?: string | null;
  serviceName?: string;
  resourceMemberName?: string | null;
  parentResourceName?: string | null;
}
export interface QueuePublishedSelectionPlanV3 {
  serviceHoursEligibility: QueueServiceHoursEligibilityV1;
  contractVersion: 3;
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
    | "paused"
    | "awaiting_handoff"
    | "served"
    | "skipped"
    | "cancelled"
    | "unserved"
    | "expired"
    | "pending_carry_over";
  customer: QueueSelectionDraftV3["customer"];
  notes: string;
  workflow: Pick<QueueWorkflowV2, "mode" | "configurationRevision">;
  serviceSelections: QueueServiceSelectionV3[];
  currentStage: QueuePlanStageV2;
  stages: QueuePlanStageV2[];
  childAttempts: QueueChildExecutionV3[];
  reservationGroups: QueueReservationGroupV3[];
  allocationGroups: QueueAllocationGroupV3[];
  resourceWait: QueueResourceWaitV3 | null;
  quote: QueueQuoteV3;
  extraScheduling: "same_start_within_parent";
  capabilities: { execution: boolean; childOutcomes: boolean };
  allowedActions: Array<
    "amend" | "call" | "start" | "handoff" | "pause" | "resume" | "reassign" | "cancelProtection" | "skip" | "recall"
  >;
  publishedAt: string;
  observedAt: string;
}
export type QueueSelectionPlanV3 =
  | QueueSelectionDraftV3
  | QueuePublishedSelectionPlanV3;
export interface QueuePoolAvailabilityV3 {
  availableUnits: number | null;
  provisional: true;
  observedAt: string;
}
export interface QueueResourceMemberChoiceV3 {
  id: string;
  name: string;
  revision: string;
  /** Stable vendor-managed list position; inactive members retain this position. */
  displayOrder?: number;
  isActive: boolean;
  archivedAt: string | null;
  availability: {
    state:
      | "unknown"
      | "occupied"
      | "protected"
      | "provisional_free"
      | "inactive"
      | "archived";
    provisional: true;
    observedAt: string;
  };
}
export interface QueueExtraChoiceV3 {
  serviceId: string;
  name: string;
  policyRevision: string;
  durationOptionsMinutes: number[];
  quantityMin: number;
  quantityMax: number;
  resourceReady: boolean;
  availability: QueuePoolAvailabilityV3;
  quote: QueueQuoteV3;
}
export interface QueueServiceChoiceV3 {
  id: string;
  name: string;
  serviceRevision: string;
  policyRevision: string;
  selectionMode: "named" | "pooled";
  durationOptionsMinutes: number[];
  resourceReady: boolean;
  availability: QueuePoolAvailabilityV3;
  quote: QueueQuoteV3;
  resourceMembers: QueueResourceMemberChoiceV3[];
  extras: QueueExtraChoiceV3[];
}
export interface QueueSelectionOptionsV3 {
  contractVersion: 3;
  catalogRevision: string;
  observedAt: string;
  workflow: QueueWorkflowV2;
  capabilities: { publication: boolean; childOutcomes: boolean };
  quote: QueueQuoteV3;
  extraScheduling: "same_start_within_parent";
  services: QueueServiceChoiceV3[];
}
