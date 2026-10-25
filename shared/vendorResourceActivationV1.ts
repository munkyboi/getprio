/** Server-authorized local/staging activation, separate from disposable fixture capability. */
export interface VendorResourceActivationV1 {
  capability: 'vendor-resource-activation-v1';
  available: boolean;
  pools: Array<{
    poolId: string;
    poolRevision: string;
    status: 'enabled' | 'ready' | 'blocked' | 'unavailable';
    blockReason: {code: string; message: string} | null;
  }>;
}
export interface VendorResourceActivationInputV1 {
  expectedPoolRevision: string;
  configurationVersion: string;
}
