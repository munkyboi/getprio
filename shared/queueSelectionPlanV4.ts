import type { QueueResourceSetupV1 } from './queueResourceSetupV1';
/** Vendor count-based service contract. Customer endpoints require a separate safe adapter. */
import type {
  QueueSelectionDraftV3,
  QueuePublishedSelectionPlanV3,
  QueueServiceSelectionV3,
  QueueResourceSelectionV3,
  QueueExtraSelectionV3,
  QueueServiceChoiceV3,
  QueuePoolAvailabilityV3,
  QueueQuoteV3,
  QueueChildCommandInputV3,
  QueueChildInterruptInputV3,
  QueueChildRevisionV3,
  QueueResourceMemberChoiceV3,
  QueueChildExecutionV3,
} from "./queueSelectionPlanV3";
import type { QueueWorkflowV2 } from "./queuePlanV2";

export interface QueueDurationPolicyV4 {
  revision: string;
  mode: "fixed" | "adjustable";
  visible: boolean;
  baseMinutes: number;
  minCount: number;
  maxCount: number;
  stepCount: number;
  defaultCount: number;
}
export type QueueAssignmentV4 =
  | { mode: "named"; allocationIdentity: "named_member" }
  | { mode: "automatic"; allocationIdentity: "pooled_capacity" };
export interface QueueExecutionPolicyV4 {
  revision: string;
  resourceStart: "together";
  extraStart: "with_parent";
  extraContainment: "within_parent";
  selectedExtraResolution: "explicit_required";
}
export interface QueueServiceLabelsV4 {
  service: string;
  resources: string;
  duration: string;
  extras: string;
}
export interface QueueServiceConfigurationV4 {
  labels: QueueServiceLabelsV4;
  assignment: QueueAssignmentV4;
  duration: Omit<QueueDurationPolicyV4, "revision">;
  extras: Array<{ serviceId: string; selection: "required" | "optional" }>;
  execution: Omit<QueueExecutionPolicyV4, "revision">;
}
export interface QueueConfiguredServicePolicyV4 {
  contractVersion: 4;
  serviceId: string;
  revision: string;
  configuration: QueueServiceConfigurationV4;
}
export interface QueueServiceConfigurationResponseV4 {
  contractVersion: 4;
  configurationRevision: string;
  policy: QueueConfiguredServicePolicyV4 | null;
}
export interface QueueServiceConfigurationWriteV4 {
  expectedRevision: string;
  configuration: QueueServiceConfigurationV4;
}
export interface QueueServiceConfigurationWriteResponseV4 {
  contractVersion: 4;
  configurationRevision: string;
  policy: QueueConfiguredServicePolicyV4;
}
export interface QueuePolicyPresentationV4 {
  policyRevision: string;
  labels: QueueServiceLabelsV4;
  assignmentPolicy: QueueAssignmentV4 & { revision: string };
  capacity: number;
  unitsRequired: number;
  durationPolicy: QueueDurationPolicyV4;
  executionPolicy: QueueExecutionPolicyV4;
}
export interface QueueExtraSelectionInputV4 {
  extraSelectionId: string;
  serviceId: string | null;
  quantity: number | null;
  durationCount: number | null;
  durationPolicyRevision: string | null;
  /** Flat named-extra v1 selection, never a nested resource hierarchy. */
  resourceMemberIds?: string[];
}
export interface QueueResourceSelectionInputV4 {
  resourceSelectionId: string;
  resourceMemberId: string | null;
  quantity: number | null;
  durationCount: number | null;
  durationPolicyRevision: string | null;
  extras: QueueExtraSelectionInputV4[];
}
export interface QueueServiceSelectionInputV4 {
  serviceSelectionId: string;
  serviceId: string | null;
  resources: QueueResourceSelectionInputV4[];
}
export interface QueueSelectionDraftInputV4 {
  contractVersion: 4;
  serviceSelections: QueueServiceSelectionInputV4[];
  catalogRevision: string | null;
  customer: QueueSelectionDraftV3["customer"];
  notes: string;
}
export interface QueueSelectionDraftV4
  extends Omit<QueueSelectionDraftV3, "contractVersion" | "serviceSelections"> {
  contractVersion: 4;
  serviceSelections: QueueServiceSelectionInputV4[];
}
export interface QueueFrozenDurationV4 {
  durationCount: number;
  baseMinutes: number;
  durationMinutes: number;
  durationPolicyRevision: string;
  durationPolicy: QueueDurationPolicyV4;
}
export interface QueueExtraSelectionV4
  extends QueueExtraSelectionV3,
    QueueFrozenDurationV4 {
  selectionRequirement: "required" | "optional";
  executionPolicy: QueueExecutionPolicyV4;
  namedExtraVersion?: 1;
  resourceMemberIds?: string[];
  resourceMembers?: Array<{id:string;name:string;revision:string;selectionId:string}>;
  memberExecutions?: Array<{resourceMemberId:string;resourceMemberName:string;execution:QueueChildExecutionV3|null}>;
}
export interface QueueResourceSelectionV4
  extends Omit<QueueResourceSelectionV3, "extras">,
    QueueFrozenDurationV4 {
  executionPolicy: QueueExecutionPolicyV4;
  extras: QueueExtraSelectionV4[];
}
export interface QueueServiceSelectionV4
  extends Omit<QueueServiceSelectionV3, "resources">,
    QueuePolicyPresentationV4 {
  inputContractVersion: 4;
  resources: QueueResourceSelectionV4[];
}
export interface QueuePublishedSelectionPlanV4
  extends Omit<
    QueuePublishedSelectionPlanV3,
    "contractVersion" | "serviceSelections" | "extraScheduling"
  > {
  contractVersion: 4;
  policyModel: "explicit_service_configuration";
  serviceSelections: QueueServiceSelectionV4[];
}
export type QueueSelectionPlanV4 =
  | QueueSelectionDraftV4
  | QueuePublishedSelectionPlanV4;
interface QueueExtraChoiceBaseV4 {
  serviceId: string;
  name: string;
  selectionRequirement: "required" | "optional";
  quantityMin: number;
  quantityMax: number;
  resourceReady: boolean;
  availability: QueuePoolAvailabilityV3 | null;
  quote: QueueQuoteV3;
  resourceMembers: QueueResourceMemberChoiceV3[];
}
export type QueueConfiguredExtraPolicyV4 = QueuePolicyPresentationV4;
export type QueueExtraChoiceV4 = QueueExtraChoiceBaseV4 &
  (
    | ({ configured: true } & QueueConfiguredExtraPolicyV4)
    | ({ configured: false } & Partial<QueuePolicyPresentationV4>)
  );
export interface QueueServiceChoiceV4
  extends Omit<
      QueueServiceChoiceV3,
      "selectionMode" | "durationOptionsMinutes" | "extras"
    >,
    QueuePolicyPresentationV4 {
  quantityMin: number;
  quantityMax: number;
  extras: QueueExtraChoiceV4[];
}
export interface QueueServiceHoursWindowV1 {
  status: 'open' | 'closed' | 'unavailable';
  observedAt: string;
  timezone: string;
  opensAt: string | null;
  closesAt: string | null;
  remainingWholeMinutes: number | null;
  provisional: true;
}
export interface QueueSelectionOptionsV4 {
  resourceSetup: QueueResourceSetupV1;
  contractVersion: 4;
  catalogRevision: string;
  observedAt: string;
  workflow: QueueWorkflowV2;
  serviceHoursWindow: QueueServiceHoursWindowV1;
  capabilities: {
    publication: boolean;
    childOutcomes: boolean;
    automaticNamedMemberSelection: false;
    namedExtraMembers?: {version:1;maxMembersPerExtra:100;maxPlanExecutionChildren:100;exactQuantity:true};
    namedResourceAvailability?: {version:1;intervalBased:true;provisional:true};
  };
  quote: QueueQuoteV3;
  services: QueueServiceChoiceV4[];
}
export type QueueChildCommandInputV4 = QueueChildCommandInputV3;
export type QueueChildInterruptInputV4 = QueueChildInterruptInputV3;
export type QueueResourceRetryInputV4 = Omit<
  QueueChildCommandInputV4,
  "allocationGroupId"
> & { interruptedExtras: QueueChildRevisionV3[] };

/** Cancels only a whole current unstarted promise; never frees started work. */
export interface QueueCancelProtectionInputV4 {
  expectedTicketRevision: string;
  expectedPlanRevision: string;
  currentStageId: string;
  expectedStageRevision: string;
  reservationGroupId: string;
  reason: string;
}

/** Read-only, interval-aware preview; never an admission or hold. */
export interface QueueNamedAvailabilityRequestV1 {
  /** Full editor tree verifies the flattened batch has no omitted demand. */
  serviceSelections: QueueServiceSelectionInputV4[];
  requestKey: string;
  catalogRevision: string;
  draftId?: string;
  requests: Array<{
    selectionId: string;
    serviceId: string;
    parentServiceId?: string;
    quantity: number | null;
    durationCount: number | null;
    durationPolicyRevision: string | null;
    resourceMemberIds?: string[];
  }>;
}
export interface QueueIntervalAvailabilityV1 {
  state: "available" | "unavailable" | "unknown";
  /** Current pool units available for pooled-capacity cards, when applicable. */
  availableUnits?: number | null;
  reasonCode: string | null;
  message: string;
  checkedAt: string;
  startsAt: string;
  endsAt: string | null;
  provisional: true;
}
export interface QueueNamedAvailabilityResponseV1 {
  contractVersion: 4;
  availabilityVersion: 1;
  requestKey: string;
  catalogRevision: string;
  currentCatalogRevision: string;
  checkedAt: string;
  commonStartAt: string;
  provisional: true;
  refreshAfterMs: 15000;
  excludedOwnProtection: boolean;
  selections: Array<{
    selectionId: string;
    serviceId: string;
    stageId: string;
    startAssumption: "provisional_stage_start" | "current_stage_start";
    quantity: number | null;
    durationCount: number | null;
    durationPolicyRevision: string | null;
    durationMinutes: number | null;
    startsAt: string;
    endsAt: string | null;
    configurationValid: boolean;
    availability: QueueIntervalAvailabilityV1;
    resourceMembers: Array<Omit<QueueResourceMemberChoiceV3,"availability"> & {availability:QueueIntervalAvailabilityV1}>;
  }>;
}
