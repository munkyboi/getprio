import type { PlatformTenantInspection } from "@/lib/platform-contracts"
import { capacityCount, capacityEvidence, capacityPeriod, visibleCapacityResources } from "../../../shared/tenantCapacityDisplay"

export function TenantAllowancePosture({ capacity }: { capacity: PlatformTenantInspection["capacity"] }) {
  const resources = visibleCapacityResources(capacity.resources)
  const usageAvailable = capacity.usageAvailable !== false
  return <section className="grid gap-2 border-t pt-4">
    <h3 className="text-sm font-semibold">Allowance posture</h3>
    <p className="break-words text-xs text-muted-foreground">{capacityPeriod(capacity.period)}</p>
    {capacity.observedAt ? <p className="break-all text-xs text-muted-foreground">Snapshot: {capacity.observedAt}</p> : null}
    {resources.length ? <div className="grid gap-2 sm:grid-cols-2">{resources.map(([key, resource]) => <div key={key} className="grid gap-1 rounded-md border bg-muted/20 p-3 text-sm">
      <span className="font-medium">{key === "queueTickets" ? "Queue tickets" : key === "serviceBookings" ? "Service bookings" : key.replaceAll(/([A-Z])/g, " $1")}</span>
      {key === "queueEmailJourneys" ? <span className="text-xs text-amber-600 dark:text-amber-400">Legacy server email quota: retirement pending. Enforcement status is unknown unless reported below.</span> : null}
      <span className="text-muted-foreground">{capacityCount(resource.used, usageAvailable)} base allowance used · {capacityCount(resource.limit)} limit</span>
      <span className="text-muted-foreground">{capacityCount(resource.creditRemaining)} projected credit remaining</span>
      {capacityEvidence(resource, usageAvailable).map((line) => <span key={line.key} className={line.attention ? "text-xs text-amber-600 dark:text-amber-400" : "text-xs text-muted-foreground"}>{line.text}</span>)}
    </div>)}</div> : <p className="rounded-md border p-3 text-sm text-muted-foreground">No allowance details are available.</p>}
    <p className="text-xs text-muted-foreground">Usage reporting does not modify balances or enforcement. Retired resources disappear only when the server stops reporting them.</p>
  </section>
}
