/** Location execution choice. Commercial policy is resolved independently by the server. */
export const QUEUE_TYPES = ["simple", "resource", "workflow"] as const;
export type QueueType = typeof QUEUE_TYPES[number];
export interface QueueTypeConfiguration {
  contract: "queue-type-v1";
  scope: { tenantSlug: string; locationSlug: string };
  type: QueueType;
  revision: string;
  futureAdmissionsOnly: true;
  capabilities: Record<QueueType, boolean>;
  readiness: Record<QueueType, { ready: boolean; reason: string | null }>;
  notice: string;
}
export function isQueueType(value: unknown): value is QueueType {
  return typeof value === "string" && QUEUE_TYPES.includes(value as QueueType);
}
