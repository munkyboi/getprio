import type { AiScope } from "./ai-inference-contracts";
export type EvidenceValue =
  | string
  | number
  | boolean
  | null
  | EvidenceValue[]
  | { [key: string]: EvidenceValue };
export type ResourceReportInput = {
  tenantId: string;
  locationId: string;
  windowFrom: string;
  windowTo: string;
};
export type ResourceReport = {
  reportVersion: string;
  scope: {
    tenantId: string;
    locationId: string;
    sourceBinding: string;
    queueKind: string;
  };
  window: { from: string; to: string; horizonCompletenessAttested: false };
  observedAt: string | null;
  completedAt: string;
  timestampDisplayPrecision?: string;
  capacityComparisonPrecision?: string;
  readiness: "not_ready";
  snapshot: null;
  authoritativeInventoryComplete: false;
  scanStatus: string;
  countsStatus: string;
  counts: Record<string, string> | null;
  limits?: Record<string, number>;
  exceededCollections?: string[];
  revisionEvidence?: Record<string, EvidenceValue>;
  historicalEvidence?: Record<string, EvidenceValue>;
  inventory: Record<string, Record<string, EvidenceValue>[]> | null;
  findings: {
    status: string;
    counts: Array<{
      code: string;
      recordType: string;
      classification: string;
      count: string;
    }> | null;
    examples: Array<{
      code: string;
      recordType: string;
      ref: string;
      classification: string;
    }>;
    examplesComplete?: boolean;
  };
  blockers: string[];
  forecastSupport: "not_assessed";
  historicalRepairPerformed: false;
  customerEstimateChanged: false;
};
export type ResourceInventoryApi = {
  searchScopes: (
    query: string,
  ) => Promise<{ scopes: AiScope[]; limited: boolean }>;
  read: (input: ResourceReportInput) => Promise<ResourceReport>;
};
export function defaultReportWindow(now = Date.now()) {
  return {
    windowFrom: new Date(now - 60 * 60000).toISOString(),
    windowTo: new Date(now + 60 * 60000).toISOString(),
  };
}
// UI validation improves feedback; exact containment and scope are enforced by
// the server using its PostgreSQL observation, never the browser clock.
export function validReportWindow(from: string, to: string) {
  const canonical = (value: string) =>
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().replace(".000Z", "Z") ===
      value.replace(".000Z", "Z");
  return (
    canonical(from) &&
    canonical(to) &&
    Date.parse(to) > Date.parse(from) &&
    Date.parse(to) - Date.parse(from) <= 480 * 60000
  );
}
