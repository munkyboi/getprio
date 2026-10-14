import { createRoot } from "react-dom/client"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from "../src/components/ui/sheet"
import { TenantAllowancePosture } from "../src/components/tenant-allowance-posture"
import type { PlatformTenantInspection } from "../src/lib/platform-contracts"
import "../src/index.css"

if (!import.meta.env.DEV || !["localhost", "127.0.0.1"].includes(location.hostname)) throw new Error("Local test harness only")
const unavailable = location.search.includes("unavailable=1")
const legacy = location.search.includes("legacy=1")
const count = (value: number) => unavailable ? null : value
const resource = { limit: 5000, used: count(7), observedUsed: count(10), baseUsed: count(3), creditUsed: count(3), unaccountedUsed: count(4), creditRemaining: 25, resetAt: null, accountingStatus: unavailable ? "unavailable" as const : "partial" as const, enforcementEnabled: false }
const capacity: PlatformTenantInspection["capacity"] = {
  planSlug: "pro", subscriptionId: "5", lifecycleState: "active", lots: [],
  period: unavailable ? null : { start: "2026-10-01T00:00:00Z", end: "2026-11-01T00:00:00Z" },
  observedAt: "2026-10-14T03:00:00Z", usageAvailable: !unavailable,
  resources: { queueTickets: resource, serviceBookings: { ...resource, limit: 1000 }, ...(legacy ? { queueEmailJourneys: { ...resource, enforcementEnabled: true } } : {}) },
}
createRoot(document.getElementById("root")!).render(<main className="mx-auto max-w-3xl p-4">{location.search.includes("sheet=1") ? <Sheet><SheetTrigger>Inspect tenant</SheetTrigger><SheetContent className="gap-0 p-0"><SheetHeader className="sticky top-0 z-10 border-b bg-popover pr-12"><SheetTitle>Tenant capacity details</SheetTitle><SheetDescription>Scrollable subscription evidence.</SheetDescription></SheetHeader><div className="p-4"><TenantAllowancePosture capacity={capacity} />{Array.from({ length: 40 }, (_, index) => <p key={index}>Retained evidence row {index + 1}</p>)}</div></SheetContent></Sheet> : <TenantAllowancePosture capacity={capacity} />}</main>)
