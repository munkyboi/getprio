/** Branch-scoped setup facts; request commands remain authoritative. */
export type QueueResourceSetupReasonV1 =
  | 'SERVICE_POLICY_NOT_CONFIGURED'
  | 'RESOURCE_MAPPING_MISSING'
  | 'RESOURCE_POOL_ARCHIVED'
  | 'RESOURCE_TRACKING_DISABLED'
  | 'REQUIRED_EXTRA_NOT_READY'
  | 'RESOURCE_REQUIREMENT_INVALID'
  | 'NAMED_RESOURCES_UNAVAILABLE'
  | 'RESOURCE_SELECTION_INFEASIBLE';
export interface QueueResourceSetupPoolV1 {
  id: string;
  name: string;
  capacity: number;
  trackingEnabled: boolean;
  archivedAt: string | null;
  serviceIds: string[];
}
export interface QueueResourceSetupServiceV1 {
  id: string;
  name: string;
  poolId: string | null;
  requestable: boolean;
  reasonCodes: QueueResourceSetupReasonV1[];
}
export interface QueueResourceSetupV1 {
  pools: QueueResourceSetupPoolV1[];
  services: QueueResourceSetupServiceV1[];
}
