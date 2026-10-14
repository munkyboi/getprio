export function capacityCount(value: number | null | undefined, available = true): string {
  return available && typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString() : "Unavailable"
}

export function visibleCapacityResources<T>(resources: Record<string, T>): Array<[string, T]> {
  return Object.entries(resources).filter(([key]) => key !== "queueEmailJourneys")
}

export function capacityPeriod(period: { start: string; end: string } | null | undefined): string {
  if (!period) return "Usage period unavailable"
  const start = new Date(period.start), end = new Date(period.end)
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) return "Usage period unavailable"
  return `${start.toISOString()} → ${end.toISOString()} (end exclusive)`
}
