export type MaintenancePolicy = { enabled: boolean; forceScreen: boolean; message: string }
export type MaintenanceRecord = MaintenancePolicy & { revision: string; updatedAt: string }
export type MaintenancePreview = { policy: MaintenancePolicy; revision: string; confirmation: { token: string; expiresAt: string } }
export type MaintenanceApi = {
  read: () => Promise<MaintenanceRecord>
  preview: (policy: MaintenancePolicy, reason: string) => Promise<MaintenancePreview>
  save: (preview: MaintenancePreview, reason: string, operationKey: string) => Promise<MaintenanceRecord>
}
