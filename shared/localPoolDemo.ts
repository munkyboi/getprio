/** Disposable loopback fixture only; never a production/inference-ready DTO. */
export interface LocalPoolWork {
  id: string;
  ticketNumber: string;
  status: string;
  serviceCounterId: string | null;
  queueDayId: string | null;
  queueDateKey: string | null;
  pendingCarryOver: boolean;
  timingActive: boolean;
  serviceStartedAt: string | null;
  plan: null | {
    source: string;
    itemCount: number;
    serviceId: string | null;
    serviceName: string | null;
    durationMinutes: number | null;
    poolId: string | null;
    unitsRequired: number | null;
    resourceKnown: boolean;
  };
}
export interface LocalResourceOperations {
  contractVersion: 'local-resource-operations-v1';
  localDemo: true;
  scope: { tenantId: string; locationId: string };
  asOf: string;
  ledgerRevision: string;
  forecastReadiness: 'not_evaluated';
  availabilityMeaning: 'observed_now_only_start_command_is_authoritative';
  queueDay: { id: string | null; version: string | null; dateKey: string; open: boolean };
  readyWaitingCount: number;
  dispatchAdviceOnly: true;
  counterDispatch: Array<{
    serviceCounterId: string | null;
    counterSlug: string | null;
    counterName: string;
    currentTicketId: string | null;
    canCallNext: boolean;
    blockReason: string | null;
  }>;
  pools: Array<{
    id: string; name: string; capacity: number; revision: string; trackingEnabled: boolean;
    archivedAt: string | null;
    availabilityQuality: 'observed' | 'unknown';
    availabilityReasonCodes: Array<'pool_archived' | 'tracking_disabled' | 'protection_expired' | 'protection_inconsistent' | 'reconciliation_required'>;
    allocatedUnits: number; protectedUnitsNow: number; availableUnits: number;
    overdueUnits: number; overCapacity: boolean;
  }>;
  waiting: LocalPoolWork[];
  called: LocalPoolWork[];
  activeSessions: Array<{
    id: string; ticketId: string; ticketNumber: string | null; poolId: string;
    units: number; startedAt: string; expectedEndAt: string; overdue: boolean;
  }>;
  reconciliation: { required: boolean; issues: Array<{
    code: string; allocationId?: string; reservationId?: string; poolId?: string; ticketId?: string;
  }> };
}
