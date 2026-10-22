export type AiMode = "off" | "private_shadow"
export type AiPilot = {
  tenantId: string
  locationId: string
  requestedMode: AiMode
}
export type AiPolicy = {
  requestedMode: AiMode
  timeoutMs: number
  freshnessMs: number
  pilots: AiPilot[]
}
export type AiPolicyRecord = AiPolicy & { revision: string; updatedAt: string }
export type AiStatus = {
  policy: AiPolicyRecord
  effectiveMode: "off" | "private_shadow"
  predictor: { kind: string; version: string; target: string }
  readiness: { status: string; blockers: string[] }
  capture: { status: string; privacyApproval: string; detail: string }
  diagnostics: {
    status: string
    forecastSupport: number | null
    latencyMs: number | null
    errors: number | null
    lastEvidenceAt: string | null
  }
  pilots: Array<
    AiPilot & {
      effectiveMode: string
      blockers: string[]
      tenantName?: string
      locationName?: string
    }
  >
}
export type AiScope = {
  tenantId: string
  locationId: string
  tenantName: string
  locationName: string
}
export type AiPreview = {
  policy: AiPolicy
  revision: string
  confirmation: { token: string; expiresAt: string }
}
export type AiInferenceApi = {
  read: () => Promise<AiStatus>
  searchScopes: (
    query: string
  ) => Promise<{ scopes: AiScope[]; limited: boolean }>
  preview: (policy: AiPolicy, reason: string) => Promise<AiPreview>
  save: (
    preview: AiPreview,
    reason: string,
    operationKey: string
  ) => Promise<AiStatus>
}
