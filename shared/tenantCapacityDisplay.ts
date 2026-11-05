export function capacityCount(value: number | null | undefined, available = true): string {
  return available && typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString() : "Unavailable"
}

export function visibleCapacityResources<T>(resources: Record<string, T>): Array<[string, T]> {
  // The server omits retired resources. Older servers must remain diagnosable.
  return Object.entries(resources)
}

export function capacityPeriod(period: { start: string; end: string } | null | undefined): string {
  if (!period) return "Usage period unavailable"
  const start = new Date(period.start), end = new Date(period.end)
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) return "Usage period unavailable"
  return `${start.toISOString()} → ${end.toISOString()} (end exclusive)`
}

export function capacityEvidence(resource: {
  observedUsed?: number | null; baseUsed?: number | null; creditUsed?: number | null; unaccountedUsed?: number | null;
  accountingStatus?: "complete" | "partial" | "unavailable"; enforcementEnabled?: boolean;
}, available = true): Array<{ key: string; text: string; attention?: boolean }> {
  const lines: Array<{ key: string; text: string; attention?: boolean }> = []
  if (resource.observedUsed !== undefined) lines.push({ key: "observed", text: `${capacityCount(resource.observedUsed, available)} created in this period` })
  if (resource.baseUsed !== undefined) lines.push({ key: "ledger", text: `Ledger: ${capacityCount(resource.baseUsed, available)} base · ${capacityCount(resource.creditUsed, available)} credit · ${capacityCount(resource.unaccountedUsed, available)} unaccounted` })
  if (resource.accountingStatus === "partial") lines.push({ key: "partial", text: "Partial accounting: includes records without ledger allocations. No ledger entries were repaired.", attention: true })
  if (resource.enforcementEnabled !== undefined) lines.push({ key: "enforcement", text: `Quota enforcement: ${resource.enforcementEnabled ? "enabled" : "disabled"}` })
  return lines
}
