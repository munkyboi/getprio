/** Explicit fixture-only setup capability; never production tracking readiness. */
export interface LocalResourceActivationV1 {
  capability: 'local-resource-activation-v1';
  available: boolean;
  pools: Array<{
    poolId: string;
    poolRevision: string;
    status: 'enabled' | 'ready' | 'blocked' | 'unavailable';
    blockReason: {code:string;message:string} | null;
  }>;
}
export interface LocalResourceActivationInputV1 {
  expectedPoolRevision: string;
  configurationVersion: string;
}
