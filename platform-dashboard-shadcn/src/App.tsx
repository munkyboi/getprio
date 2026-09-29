import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"
import {
  Activity,
  AlertTriangle,
  BookOpenText,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Code2,
  Command as CommandIcon,
  DatabaseZap,
  FileSearch,
  LayoutDashboard,
  LoaderCircle,
  ListChecks,
  LogOut,
  Moon,
  PanelLeft,
  Rocket,
  Search,
  Settings2,
  ShieldCheck,
  Sun,
  Users,
} from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { NavigationMenu, NavigationMenuContent, NavigationMenuItem, NavigationMenuLink, NavigationMenuList, NavigationMenuTrigger } from "@/components/ui/navigation-menu"
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { TooltipProvider } from "@/components/ui/tooltip"
import { PlatformDataTable } from "@/components/platform-data-table"
import { PlatformMetricCard } from "@/components/platform-metric-card"
import { PlatformAccountSettings } from "@/components/platform-account-settings"
import { PlanMatrix } from "@/components/plan-matrix"
import { PlatformHelpCenterManager } from "@/components/platform-help-center"
import { PlatformSettingsEditor } from "@/components/platform-settings-editor"
import { PlatformLogin } from "@/components/platform-login"
import { platformAuth } from "@/lib/platform-auth"
import { platformApi } from "@/lib/platform-api"
import type { AccountDeletionTaskKind, DeveloperProjectGovernanceReadModel, DeveloperProjectSummary, PlatformAccountDeletionQueue, PlatformAccountDeletionRequest, PlatformAttentionItem, PlatformAuditReadModel, PlatformBillingReadModel, PlatformDeveloperApiKey, PlatformDeveloperApiKeyReview, PlatformModerationReadModel, PlatformOverviewReadModel, PlatformQueueOperationsReadModel, PlatformReleaseReadinessReadModel, PlatformReleaseSurfaceState, PlatformServiceHealthReadModel, PlatformServiceState, PlatformSettingsReadModel, PlatformTenantCreditLot, PlatformTenantInspection, PlatformTenantsReadModel, PlatformUserDetails, PlatformUsersReadModel, PlatformViewerContext, SandboxCredentialResult, TenantEntitlementPreview, UserPasswordResetPreview, UserSessionRevokePreview } from "@/lib/platform-contracts"
import { cn } from "cn"
import "./App.css"

type NavItem = { label: string; icon: typeof LayoutDashboard; capability: string; route?: string; subItems?: Array<{ label: string; route: string }> }
type ServiceRow = PlatformServiceHealthReadModel["services"][number]
type QueueRow = PlatformQueueOperationsReadModel["queueDays"][number]
type TenantRow = PlatformTenantsReadModel["tenants"][number]
type UserRow = PlatformUsersReadModel["users"][number]
type AuditRow = PlatformAuditReadModel["events"][number]
type SubscriptionRow = PlatformBillingReadModel["subscriptions"][number]
type CreditPurchaseRow = PlatformBillingReadModel["creditPurchases"][number]
type CreditRefundRow = PlatformBillingReadModel["creditRefunds"][number]
type CreditDisputeRow = PlatformBillingReadModel["creditDisputes"][number]
type ModerationReportRow = PlatformModerationReadModel["campaignReports"][number]
type RatingDisputeRow = PlatformModerationReadModel["ratingDisputes"][number]
type ReleaseSurfaceRow = PlatformReleaseReadinessReadModel["surfaces"][number]
type QueueRepairPreview = {
  action: string
  targetId: string
  revision: string
  confirmationToken: string
  requiresMfa: boolean
  mutatesCustomerIdentity: boolean
}
type SubscriptionSuspendPreview = { action: string; targetId: string; revision: string; confirmationToken: string }
type ModerationPreview = { action: string; targetId: string; revision: string; confirmationToken: string }
type UserSessionAction = { row: UserRow }
type ModerationAction =
  | { kind: "report"; row: ModerationReportRow; status: "reviewing" | "resolved" | "dismissed" }
  | { kind: "dispute"; row: RatingDisputeRow; status: "resolved" | "dismissed"; moderationStatus: "active" | "hidden" }

function PlatformTableViewport({ children }: { children: ReactNode }) {
  return <ScrollArea className="min-w-0 w-full"><div className="min-w-max">{children}</div><ScrollBar orientation="horizontal" /></ScrollArea>
}

function formatReferenceRowIdentity(rowIdentity?: Record<string, string | null>) {
  const fields = Object.entries(rowIdentity || {})
  return fields.length ? fields.map(([column, value]) => `${column}=${value ?? "null"}`).join(", ") : "Row identity unavailable"
}

const navGroups: Array<{ label: string; items: NavItem[] }> = [
  { label: "Workspace", items: [{ label: "Overview", icon: LayoutDashboard, capability: "platform.tenants.read" }] },
  { label: "Operations", items: [{ label: "Queues & recovery", icon: ListChecks, capability: "platform.tenants.read" }, { label: "Tenants", icon: DatabaseZap, capability: "platform.tenants.read" }, { label: "Users", icon: Users, capability: "platform.users.read" }, { label: "Service health", icon: Activity, capability: "platform.tenants.read" }] },
  { label: "Governance", items: [{ label: "Developer projects", icon: Code2, capability: "platform.developer_api.manage" }, { label: "Plan Matrix", icon: Settings2, capability: "platform.billing.read" }, { label: "Billing & credits", icon: CircleDollarSign, capability: "platform.billing.read" }, { label: "Moderation", icon: ShieldCheck, capability: "platform.users.read" }] },
  { label: "Trust", items: [{ label: "Release readiness", icon: Rocket, capability: "platform.tenants.read" }, { label: "Security audit", icon: FileSearch, capability: "platform.security_audit.read" }, { label: "Help Center", icon: BookOpenText, capability: "platform.help_center.manage", route: "Help Center / Overview", subItems: [{ label: "Overview", route: "Help Center / Overview" }, { label: "Topics", route: "Help Center / Topics" }, { label: "Guides", route: "Help Center / Guides" }, { label: "FAQs", route: "Help Center / FAQs" }] }, { label: "Settings", icon: Settings2, capability: "platform.settings.manage" }] },
]

const fixtureCapabilities = navGroups.flatMap((group) => group.items.map((item) => item.capability))

const routePathByLabel: Record<string, string> = {
  Overview: "/",
  "Queues & recovery": "/queues-and-recovery",
  Tenants: "/tenants",
  Users: "/users",
  "Service health": "/service-health",
  "Developer projects": "/developer-projects",
  "Billing & credits": "/billing",
  "Plan Matrix": "/plans",
  Moderation: "/moderation",
  "Release readiness": "/release-readiness",
  "Security audit": "/security-audit",
  "Help Center / Overview": "/help-center",
  "Help Center / Topics": "/help-center/topics",
  "Help Center / Guides": "/help-center/guides",
  "Help Center / FAQs": "/help-center/faqs",
  Settings: "/settings",
  "My account": "/my-account",
}

const routeLabelByPath = new Map(Object.entries(routePathByLabel).map(([label, path]) => [path, label]))

function routeFromLocation() {
  return routeLabelByPath.get(window.location.pathname) || "Overview"
}

type BillingTab = "subscriptions" | "purchases" | "cases"
function billingTabFromLocation(): BillingTab {
  const value = new URLSearchParams(window.location.search).get("billingTab")
  return value === "purchases" || value === "cases" ? value : "subscriptions"
}

function navigateToRoute(route: string) {
  const path = routePathByLabel[route] || "/"
  if (window.location.pathname !== path) {
    window.history.pushState({}, "", path)
  }
  window.dispatchEvent(new PopStateEvent("popstate"))
}

function requestPlatformRefresh() {
  window.dispatchEvent(new Event("platform:refresh"))
}

const chartConfig = { events: { label: "Audit events", color: "var(--chart-1)" }, successfulEvents: { label: "Successful events", color: "var(--chart-2)" } } satisfies ChartConfig

function StatusBadge({ status }: { status: "review" | "complete" | "action" }) {
  const config = { review: { label: "Review", variant: "warning" as const }, complete: { label: "Complete", variant: "success" as const }, action: { label: "Action", variant: "destructive" as const } }[status]
  return <Badge variant={config.variant}>{config.label}</Badge>
}

function SeverityBadge({ item }: { item: PlatformAttentionItem }) {
  return <Badge variant={item.severity === "critical" ? "destructive" : "secondary"}>{item.actionLabel}</Badge>
}

function ServiceStateBadge({ state }: { state: PlatformServiceState }) {
  if (state === "healthy") return <Badge variant="success"><CheckCircle2 data-icon="inline-start" /> Healthy</Badge>
  if (state === "degraded") return <Badge variant="warning"><AlertTriangle data-icon="inline-start" /> Degraded</Badge>
  return <Badge variant="secondary">Unknown</Badge>
}

function ServiceHealth({ health }: { health: PlatformServiceHealthReadModel }) {
  const degraded = health.services.filter((service) => service.state === "degraded").length
  const unknown = health.services.filter((service) => service.state === "unknown").length

  return (
    <div className="grid gap-5">
      <div className="grid gap-1"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">Operations</p><div className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Service health</h1><p className="mt-1 max-w-2xl text-muted-foreground">Cross-surface observations with explicit freshness and evidence boundaries.</p></div><Button variant="outline" className="w-fit gap-2" onClick={requestPlatformRefresh}>Refresh observations <Activity data-icon="inline-start" /></Button></div></div>
      <div className="grid gap-3 sm:grid-cols-3"><MetricCard label="Observed services" value={String(health.services.length)} trend="Current Platform read model" trendTone="neutral" /><MetricCard label="Degraded" value={String(degraded)} trend={degraded ? "Action may be required" : "No degraded observations"} trendTone={degraded ? "attention" : "positive"} /><MetricCard label="Without heartbeat" value={String(unknown)} trend="Not deployment proof" trendTone={unknown ? "attention" : "positive"} /></div>
      <PlatformDataTable columns={serviceColumns} data={health.services} emptyMessage="No service observations." tableClassName="min-w-[760px]" searchColumn="name" searchPlaceholder="Search services…" />
      <Alert><ShieldCheck /><AlertTitle>Reading this surface</AlertTitle><AlertDescription>Healthy means the observed contract is responding. Unknown means the platform does not yet receive a service heartbeat. Neither state is a deployment or physical-device proof.</AlertDescription></Alert>
    </div>
  )
}

function QueueAttentionBadge({ attention }: { attention: "healthy" | "review" | "action" }) {
  if (attention === "healthy") return <Badge variant="success">Healthy</Badge>
  if (attention === "review") return <Badge variant="warning">Review</Badge>
  return <Badge variant="destructive">Action</Badge>
}

function QueueOperations({ operations, onPreview, onExecute }: { operations: PlatformQueueOperationsReadModel; onPreview: (action: "reconcile_overdue_queue_day" | "requeue_notification", targetId: string, reason: string) => Promise<QueueRepairPreview>; onExecute: (preview: QueueRepairPreview, reason: string) => Promise<void> }) {
  const [repairRow, setRepairRow] = useState<QueueRow | null>(null)
  const [repairReason, setRepairReason] = useState("")
  const [repairPreview, setRepairPreview] = useState<QueueRepairPreview | null>(null)
  const [repairPending, setRepairPending] = useState(false)
  const [repairError, setRepairError] = useState<string | null>(null)

  const resetRepair = () => {
    if (repairPending) return
    setRepairRow(null)
    setRepairReason("")
    setRepairPreview(null)
    setRepairError(null)
  }

  const createRepairPreview = async () => {
    if (!repairRow) return
    const reason = repairReason.trim()
    if (reason.length < 1 || reason.length > 500) {
      setRepairError("Enter an audit reason between 1 and 500 characters.")
      return
    }
    setRepairPending(true)
    setRepairError(null)
    try {
      setRepairPreview(await onPreview("reconcile_overdue_queue_day", repairRow.id, reason))
    } catch (error) {
      setRepairError(error instanceof Error ? error.message : "Unable to create a repair preview.")
    } finally {
      setRepairPending(false)
    }
  }

  const executeRepair = async () => {
    if (!repairPreview) return
    const reason = repairReason.trim()
    setRepairPending(true)
    setRepairError(null)
    try {
      await onExecute(repairPreview, reason)
      setRepairPending(false)
      resetRepair()
    } catch (error) {
      setRepairError(error instanceof Error ? error.message : "Unable to execute the queue repair.")
      setRepairPending(false)
    }
  }

  return (
    <div className="grid gap-5">
      <div className="grid gap-1"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">Operations</p><div className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Queues &amp; recovery</h1><p className="mt-1 max-w-2xl text-muted-foreground">Inspect queue-day state, unresolved work, and recovery signals before any privileged repair.</p></div><Button variant="outline" className="w-fit gap-2" onClick={requestPlatformRefresh}>Refresh diagnostics <ListChecks data-icon="inline-start" /></Button></div></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{operations.metrics.map((metric) => <MetricCard key={metric.label} {...metric} />)}</div>
      <PlatformDataTable columns={queueColumns} data={operations.queueDays} emptyMessage="No queue diagnostics." tableClassName="min-w-[1020px]" searchColumn="businessDate" searchPlaceholder="Search queue days…" rowActions={(row) => row.attention === "action" ? <Button variant="outline" size="sm" onClick={() => { setRepairRow(row); setRepairReason(""); setRepairPreview(null); setRepairError(null) }}>Preview repair</Button> : <span className="text-xs text-muted-foreground">Read-only</span>} />
      <Alert><ShieldCheck /><AlertTitle>Recovery guardrail</AlertTitle><AlertDescription>Only queue days with an action signal can be repaired. Every repair requires a server preview, recent MFA assurance, an explicit confirmation token, and an audit reason.</AlertDescription></Alert>
      <Dialog open={Boolean(repairRow)} onOpenChange={(open) => { if (!open) resetRepair() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{repairPreview ? "Confirm queue repair" : "Preview queue repair"}</DialogTitle>
            <DialogDescription>{repairPreview ? "Review the server-issued preview before applying this queue-day reconciliation repair." : "Create a server preview before any queue state changes. Healthy and review rows remain read-only."}</DialogDescription>
          </DialogHeader>
          {repairRow ? <div className="grid gap-3">
            <div className="grid gap-1 rounded-md border bg-muted/30 p-3 text-sm"><span className="font-medium">{repairRow.businessDate} · queue day #{repairRow.id}</span><span className="text-muted-foreground">{repairRow.tenantName} · {repairRow.locationName}</span><span className="text-muted-foreground">Action: Reconcile overdue queue day</span></div>
            <div className="grid gap-2"><label htmlFor="queue-repair-reason" className="text-sm font-medium">Audit reason</label><Textarea id="queue-repair-reason" value={repairReason} onChange={(event) => setRepairReason(event.target.value)} placeholder="Example: provider timeout cleared; reconcile after confirming queue state" maxLength={500} disabled={repairPending || Boolean(repairPreview)} /><p className="text-xs text-muted-foreground">Required. This reason is written to the security audit record.</p></div>
            {repairPreview ? <div className="grid gap-1 rounded-md border border-brand/30 bg-brand/5 p-3 text-sm"><span className="font-medium">Server preview ready</span><span className="text-muted-foreground">Revision: {repairPreview.revision}</span><span className="text-muted-foreground">MFA assurance: {repairPreview.requiresMfa ? "required" : "not required"}</span><span className="text-muted-foreground">Customer identity mutation: {repairPreview.mutatesCustomerIdentity ? "yes" : "none"}</span></div> : null}
            {repairError ? <p className="text-sm text-destructive">{repairError}</p> : null}
          </div> : null}
          <DialogFooter><Button variant="outline" onClick={resetRepair} disabled={repairPending}>Cancel</Button>{repairPreview ? <Button onClick={executeRepair} disabled={repairPending}>{repairPending ? "Applying…" : "Confirm repair"}</Button> : <Button onClick={createRepairPreview} disabled={repairPending}>{repairPending ? "Previewing…" : "Create preview"}</Button>}</DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function TenantApprovalBadge({ status }: { status: PlatformTenantsReadModel["tenants"][number]["vendorApproval"] }) {
  if (status === "approved") return <Badge variant="success">Approved</Badge>
  if (status === "rejected") return <Badge variant="destructive">Rejected</Badge>
  if (status === "pending") return <Badge variant="warning">Pending</Badge>
  return <Badge variant="secondary">Unknown</Badge>
}

function TenantCreditManager({ tenant, canGrant, canRevoke, onInspect, onPreview, onGrant, onRevoke }: { tenant: TenantRow; canGrant: boolean; canRevoke: boolean; onInspect: (tenantId: string) => Promise<PlatformTenantInspection>; onPreview: (action: TenantEntitlementPreview["action"], targetId: string, payload: Record<string, unknown>, reason: string) => Promise<TenantEntitlementPreview>; onGrant: (tenantId: string, ticketUnits: number, journeyUnits: number, expiresAt: string | null, reason: string, preview: TenantEntitlementPreview) => Promise<void>; onRevoke: (lotId: string, units: number, reason: string, preview: TenantEntitlementPreview) => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [inspection, setInspection] = useState<PlatformTenantInspection | null>(null)
  const [loading, setLoading] = useState(false)
  const [action, setAction] = useState<{ kind: "grant" } | { kind: "revoke"; lot: PlatformTenantCreditLot } | null>(null)
  const [tickets, setTickets] = useState("0")
  const [journeys, setJourneys] = useState("0")
  const [expiresOn, setExpiresOn] = useState("")
  const [units, setUnits] = useState("1")
  const [reason, setReason] = useState("")
  const [preview, setPreview] = useState<TenantEntitlementPreview | null>(null)
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const refresh = async () => { setLoading(true); setError(null); try { setInspection(await onInspect(tenant.id)) } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Unable to load usage credits.") } finally { setLoading(false) } }
  const openManager = () => { setOpen(true); void refresh() }
  const startGrant = () => { setAction({ kind: "grant" }); setTickets("0"); setJourneys("0"); setExpiresOn(""); setReason(""); setPreview(null); setPayload(null); setError(null) }
  const startRevoke = (lot: PlatformTenantCreditLot) => { setAction({ kind: "revoke", lot }); setUnits(String(lot.remainingUnits)); setReason(""); setPreview(null); setPayload(null); setError(null) }
  const createPreview = async () => {
    const cleanReason = reason.trim()
    if (cleanReason.length < 8 || cleanReason.length > 500) { setError("Enter a clear audit reason between 8 and 500 characters."); return }
    let kind: "credit.grant" | "credit.revoke"
    let targetId: string
    let requestPayload: Record<string, unknown>
    if (action?.kind === "grant") {
      const ticketUnits = Number(tickets); const journeyUnits = Number(journeys)
      if (![ticketUnits, journeyUnits].every((value) => Number.isSafeInteger(value) && value >= 0) || ticketUnits + journeyUnits < 1) { setError("Enter a positive whole number for at least one credit type."); return }
      kind = "credit.grant"; targetId = tenant.id
      requestPayload = { tenantId: tenant.id, ticketUnits, journeyUnits, expiresAt: expiresOn ? new Date(`${expiresOn}T23:59:59.999Z`).toISOString() : null }
    } else if (action?.kind === "revoke") {
      const revokeUnits = Number(units)
      if (!Number.isSafeInteger(revokeUnits) || revokeUnits < 1 || revokeUnits > action.lot.remainingUnits) { setError(`Enter a whole number from 1 to ${action.lot.remainingUnits}.`); return }
      kind = "credit.revoke"; targetId = action.lot.id; requestPayload = { lotId: action.lot.id, units: revokeUnits }
    } else return
    setPending(true); setError(null); setPayload(requestPayload)
    try { setPreview(await onPreview(kind, targetId, requestPayload, cleanReason)) } catch (previewError) { setError(previewError instanceof Error ? previewError.message : "Unable to create a credit action preview.") } finally { setPending(false) }
  }
  const execute = async () => {
    if (!action || !preview || !payload) return
    setPending(true); setError(null)
    try {
      if (action.kind === "grant") await onGrant(tenant.id, Number(payload.ticketUnits), Number(payload.journeyUnits), payload.expiresAt as string | null, reason.trim(), preview)
      else await onRevoke(action.lot.id, Number(payload.units), reason.trim(), preview)
      setAction(null); setPreview(null); setPayload(null); setReason(""); await refresh()
    } catch (executeError) { setError(executeError instanceof Error ? executeError.message : "Unable to apply the credit action.") } finally { setPending(false) }
  }
  const enabled = inspection?.tenantCreditGrantsEnabled === true
  return <><Button variant="outline" size="sm" onClick={(event) => { event.stopPropagation(); openManager() }}>Usage credits</Button><Dialog open={open} onOpenChange={(next) => { if (!pending) { setOpen(next); if (!next) { setAction(null); setError(null) } } }}><DialogContent className="max-h-[90dvh] overflow-y-auto md:max-w-2xl"><DialogHeader><DialogTitle>{tenant.name} · Usage credits</DialogTitle><DialogDescription>Credit lots and audited grant or revocation controls.</DialogDescription></DialogHeader>{loading ? <p className="py-8 text-center text-sm text-muted-foreground">Loading usage credits…</p> : error && !action ? <p className="text-sm text-destructive">{error}</p> : !inspection ? null : !enabled ? <Alert><ShieldCheck /><AlertTitle>Credit administration disabled</AlertTitle><AlertDescription>The current release control does not allow usage-credit changes.</AlertDescription></Alert> : action ? <div className="grid gap-4">{action.kind === "grant" ? <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-2 text-sm font-medium">Queue ticket credits<Input type="number" min={0} step={1} value={tickets} disabled={pending || Boolean(preview)} onChange={(event) => setTickets(event.target.value)} /></label><label className="grid gap-2 text-sm font-medium">Email journey credits<Input type="number" min={0} step={1} value={journeys} disabled={pending || Boolean(preview)} onChange={(event) => setJourneys(event.target.value)} /></label><label className="grid gap-2 text-sm font-medium sm:col-span-2">Expires on (optional)<Input type="date" value={expiresOn} disabled={pending || Boolean(preview)} onChange={(event) => setExpiresOn(event.target.value)} /></label></div> : <div className="rounded-md border p-3 text-sm"><p className="font-medium">{action.lot.resourceKey.replaceAll(/([A-Z])/g, " $1")}</p><p className="mt-1 text-muted-foreground">{action.lot.remainingUnits.toLocaleString()} unused units available · {action.lot.id}</p><label className="mt-3 grid gap-2 font-medium">Units to revoke<Input type="number" min={1} max={action.lot.remainingUnits} step={1} value={units} disabled={pending || Boolean(preview)} onChange={(event) => setUnits(event.target.value)} /></label></div>}<label className="grid gap-2 text-sm font-medium">Audit reason<Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain the customer support or credit adjustment reason" maxLength={500} disabled={pending || Boolean(preview)} /></label><p className="text-xs text-muted-foreground">A server preview, recent MFA confirmation, and audit entry are required.</p>{preview ? <div className="rounded-md border border-brand/30 bg-brand/5 p-3 text-sm"><p className="font-medium">Server preview ready</p><p className="mt-1 text-muted-foreground">{preview.action} · revision {preview.revision}</p></div> : null}{error ? <p className="text-sm text-destructive">{error}</p> : null}<DialogFooter><Button variant="outline" disabled={pending} onClick={() => { setAction(null); setPreview(null); setPayload(null); setError(null) }}>Back to lots</Button>{preview ? <Button variant={action.kind === "revoke" ? "destructive" : "default"} disabled={pending} onClick={() => void execute()}>{pending ? "Applying…" : action.kind === "revoke" ? "Confirm revocation" : "Grant credits"}</Button> : <Button disabled={pending} onClick={() => void createPreview()}>{pending ? "Previewing…" : "Create preview"}</Button>}</DialogFooter></div> : <div className="grid gap-4">{inspection.capacity.lots.length ? <div className="divide-y rounded-md border">{inspection.capacity.lots.map((lot) => <div key={lot.id} className="flex flex-wrap items-center justify-between gap-3 p-3"><div className="grid min-w-0 gap-1 text-sm"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{lot.resourceKey.replaceAll(/([A-Z])/g, " $1")}</span><Badge variant={lot.status === "active" ? "success" : "secondary"}>{lot.status}</Badge></div><span className="text-muted-foreground">{lot.remainingUnits.toLocaleString()} remaining · {lot.grantedUnits.toLocaleString()} granted · {lot.consumedUnits.toLocaleString()} consumed</span><span className="text-xs text-muted-foreground">{lot.sourceType}{lot.expiresAt ? ` · expires ${new Date(lot.expiresAt).toLocaleDateString()}` : " · no expiry"}{lot.reason ? ` · ${lot.reason}` : ""}</span><span className="font-mono text-xs text-muted-foreground">{lot.id}</span></div>{canRevoke && lot.status === "active" && lot.remainingUnits > 0 ? <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => startRevoke(lot)}>Revoke</Button> : null}</div>)}</div> : <p className="rounded-md border p-4 text-sm text-muted-foreground">No usage-credit lots recorded.</p>}{error ? <p className="text-sm text-destructive">{error}</p> : null}<DialogFooter><Button variant="outline" disabled={!canGrant} onClick={startGrant}>Grant credits</Button><Button variant="outline" onClick={() => setOpen(false)}>Close</Button></DialogFooter></div>}</DialogContent></Dialog></>
}

function Tenants({ tenants, canManageOverrides, canGrantCredits, canRevokeCredits, onInspect, onPreviewEntitlement, onExecuteEntitlement, onGrantCredits, onRevokeCredits }: { tenants: PlatformTenantsReadModel; canManageOverrides: boolean; canGrantCredits: boolean; canRevokeCredits: boolean; onInspect: (tenantId: string) => Promise<PlatformTenantInspection>; onPreviewEntitlement: (action: TenantEntitlementPreview["action"], targetId: string, payload: Record<string, unknown>, reason: string) => Promise<TenantEntitlementPreview>; onExecuteEntitlement: (tenantId: string, overrideId: string | null, payload: Record<string, unknown>, reason: string, preview: TenantEntitlementPreview) => Promise<void>; onGrantCredits: (tenantId: string, ticketUnits: number, journeyUnits: number, expiresAt: string | null, reason: string, preview: TenantEntitlementPreview) => Promise<void>; onRevokeCredits: (lotId: string, units: number, reason: string, preview: TenantEntitlementPreview) => Promise<void> }) {
  const [selectedTenant, setSelectedTenant] = useState<TenantRow | null>(null)
  const [inspection, setInspection] = useState<PlatformTenantInspection | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [policyKey, setPolicyKey] = useState("allowance.queueTickets")
  const [overrideValue, setOverrideValue] = useState("0")
  const [overrideExpiration, setOverrideExpiration] = useState("")
  const [overrideReason, setOverrideReason] = useState("")
  const [overrideAction, setOverrideAction] = useState<{ overrideId: string | null; payload: Record<string, unknown>; label: string } | null>(null)
  const [overridePreview, setOverridePreview] = useState<TenantEntitlementPreview | null>(null)
  const [overridePending, setOverridePending] = useState(false)
  const [overrideError, setOverrideError] = useState<string | null>(null)
  const inspect = async (tenant: TenantRow) => {
    setSelectedTenant(tenant)
    setInspection(null)
    setError(null)
    setPending(true)
    try { setInspection(await onInspect(tenant.id)) } catch (inspectionError) { setError(inspectionError instanceof Error ? inspectionError.message : "Unable to load tenant posture.") } finally { setPending(false) }
  }
  const resetOverride = (force = false) => {
    if (overridePending && !force) return
    setOverrideAction(null)
    setOverridePreview(null)
    setOverrideReason("")
    setOverrideError(null)
  }
  const startRevokeOverride = (override: PlatformTenantInspection["overrides"][number]) => {
    if (!selectedTenant) return
    setOverrideAction({ overrideId: override.id, payload: { tenantId: selectedTenant.id, overrideId: override.id }, label: `Revoke ${override.policyKey}` })
    setOverridePreview(null)
    setOverrideReason("")
    setOverrideError(null)
  }
  const createOverridePreview = async () => {
    if (!selectedTenant || !overrideAction) return
    const reason = overrideReason.trim()
    if (reason.length < 8 || reason.length > 500) { setOverrideError("Enter a clear audit reason between 8 and 500 characters."); return }
    let action = overrideAction
    if (!overrideAction.overrideId) {
      if (!inspection?.capacity.subscriptionId) { setOverrideError("An active subscription is required to publish an entitlement override."); return }
      const feature = policyKey.startsWith("feature.")
      const value: boolean | number = feature ? overrideValue === "true" : Number(overrideValue)
      if (typeof value === "number" && (!Number.isSafeInteger(value) || value < 0)) { setOverrideError("Allowance overrides must be a whole number of zero or more."); return }
      const expiresAt = overrideExpiration ? new Date(`${overrideExpiration}T23:59:59.999Z`).toISOString() : null
      action = { overrideId: null, payload: { tenantId: selectedTenant.id, subscriptionId: inspection.capacity.subscriptionId, policyKey, value, expiresAt }, label: `${policyKey} → ${String(value)}` }
      setOverrideAction(action)
    }
    setOverridePending(true)
    setOverrideError(null)
    try { setOverridePreview(await onPreviewEntitlement(action.overrideId ? "entitlement.override.revoke" : "entitlement.override.publish", action.overrideId || selectedTenant.id, action.payload, reason)) } catch (previewError) { setOverrideError(previewError instanceof Error ? previewError.message : "Unable to create an entitlement preview.") } finally { setOverridePending(false) }
  }
  const executeOverride = async () => {
    if (!selectedTenant || !overrideAction || !overridePreview) return
    setOverridePending(true)
    setOverrideError(null)
    try {
      await onExecuteEntitlement(selectedTenant.id, overrideAction.overrideId, overrideAction.payload, overrideReason.trim(), overridePreview)
      setInspection(await onInspect(selectedTenant.id))
      setOverridePending(false)
      resetOverride(true)
    } catch (executeError) { setOverrideError(executeError instanceof Error ? executeError.message : "Unable to apply the entitlement change."); setOverridePending(false) }
  }
  return (
    <div className="grid gap-5">
      <div className="grid gap-1"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">Operations</p><div className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Tenants</h1><p className="mt-1 max-w-2xl text-muted-foreground">Platform-wide tenant scope, ownership, plan signals, and approval state.</p></div><Button variant="outline" className="w-fit gap-2" onClick={requestPlatformRefresh}>Refresh tenants <Activity data-icon="inline-start" /></Button></div></div>
      <div className="grid gap-3 sm:grid-cols-3">{tenants.metrics.map((metric) => <MetricCard key={metric.label} {...metric} />)}</div>
      <PlatformDataTable columns={tenantColumns} data={tenants.tenants} emptyMessage="No tenants in scope." tableClassName="min-w-[960px]" searchColumn="name" searchPlaceholder="Search tenants…" onRowClick={(row) => void inspect(row)} getRowLabel={(row) => `View subscription details for ${row.name}`} isRowSelected={(row) => selectedTenant?.id === row.id} rowActions={(row) => <TenantCreditManager tenant={row} canGrant={canGrantCredits} canRevoke={canRevokeCredits} onInspect={onInspect} onPreview={onPreviewEntitlement} onGrant={onGrantCredits} onRevoke={onRevokeCredits} />} />
      <Alert><ShieldCheck /><AlertTitle>Tenant controls stay scoped</AlertTitle><AlertDescription>Entitlement changes require the tenant override release control, a server preview, recent MFA confirmation, and an audit reason.</AlertDescription></Alert>
      <Sheet open={Boolean(selectedTenant)} onOpenChange={(open) => { if (!open && !pending && !overridePending) { setSelectedTenant(null); setInspection(null); setError(null); resetOverride() } }}><SheetContent side="right" className="gap-0 overflow-y-auto p-0"><SheetHeader className="sticky top-0 z-10 border-b bg-popover pr-12"><SheetTitle>{selectedTenant?.name || "Subscription details"}</SheetTitle><SheetDescription>{selectedTenant ? `Tenant subscription and capacity details · ${selectedTenant.slug}` : "Tenant subscription and capacity details."}</SheetDescription></SheetHeader>{pending ? <div className="p-5 py-8 text-center text-sm text-muted-foreground">Loading subscription details…</div> : error ? <p role="alert" className="p-5 text-sm text-destructive">{error}</p> : inspection ? <div className="grid gap-5 p-4"><section className="grid gap-3"><h3 className="text-sm font-semibold">Subscription</h3><div className="grid gap-3 rounded-md border p-3 text-sm sm:grid-cols-2"><div className="grid gap-1"><span className="text-xs text-muted-foreground">Plan</span><span className="font-medium">{inspection.capacity.planSlug || "No plan signal"}</span></div><div className="grid gap-1"><span className="text-xs text-muted-foreground">Lifecycle</span><span className="font-medium">{inspection.capacity.lifecycleState || "Unknown"}</span></div><div className="grid gap-1 sm:col-span-2"><span className="text-xs text-muted-foreground">Subscription ID</span><span className="break-all font-mono text-xs">{inspection.capacity.subscriptionId || "No subscription linked"}</span></div></div><div className="grid gap-1 text-xs text-muted-foreground"><span>Tenant: {inspection.tenant.name} ({inspection.tenant.slug})</span><span className="break-all font-mono">Tenant ID: {inspection.tenant.id}</span></div></section><section className="grid gap-2 border-t pt-4"><h3 className="text-sm font-semibold">Allowance posture</h3>{Object.keys(inspection.capacity.resources).length ? <div className="grid gap-2 sm:grid-cols-2">{Object.entries(inspection.capacity.resources).map(([key, resource]) => <div key={key} className="grid gap-1 rounded-md border bg-muted/20 p-3 text-sm"><span className="font-medium">{key.replaceAll(/([A-Z])/g, " $1")}</span><span className="text-muted-foreground">{resource.used.toLocaleString()} used · {resource.limit.toLocaleString()} limit</span><span className="text-muted-foreground">{resource.creditRemaining.toLocaleString()} credit remaining</span></div>)}</div> : <p className="rounded-md border p-3 text-sm text-muted-foreground">No allowance details are available.</p>}</section><section className="grid gap-3 border-t pt-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-semibold">Entitlement overrides</h3><p className="text-xs text-muted-foreground">Overrides replace the selected policy value for this subscription.</p></div>{canManageOverrides && inspection.tenantOverridesEnabled && inspection.capacity.subscriptionId ? <Button variant="outline" size="sm" onClick={() => { setPolicyKey("allowance.queueTickets"); setOverrideValue("0"); setOverrideExpiration(""); setOverrideError(null); setOverrideAction({ overrideId: null, payload: {}, label: "Create entitlement override" }) }}>Add override</Button> : null}</div>{!inspection.tenantOverridesEnabled ? <p className="text-sm text-muted-foreground">Entitlement override controls are disabled by the current release setting.</p> : inspection.overrides.length ? inspection.overrides.map((override) => <div key={override.id} className="flex flex-wrap items-center justify-between gap-3 border-t pt-2 text-sm"><div className="grid min-w-0 gap-1"><span className="font-medium">{override.policyKey}</span><span className="text-muted-foreground">Value: {typeof override.value === "string" ? override.value : JSON.stringify(override.value)} · {override.revokedAt ? "revoked" : "active"}</span><span className="text-xs text-muted-foreground">{override.reason || "No reason recorded"}{override.expiresAt ? ` · expires ${new Date(override.expiresAt).toLocaleDateString()}` : " · no expiry"}</span></div>{canManageOverrides && inspection.tenantOverridesEnabled && !override.revokedAt ? <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => startRevokeOverride(override)}>Revoke</Button> : null}</div>) : <p className="text-sm text-muted-foreground">No entitlement overrides recorded.</p>}</section></div> : null}</SheetContent></Sheet>
      <Dialog open={Boolean(overrideAction)} onOpenChange={(open) => { if (!open) resetOverride() }}><DialogContent><DialogHeader><DialogTitle>{overridePreview ? "Confirm entitlement change" : overrideAction?.overrideId ? "Preview override revocation" : "Preview entitlement override"}</DialogTitle><DialogDescription>{overrideAction?.overrideId ? "The plan value will become effective again after this override is revoked." : "The new override will replace any active override for this policy key."}</DialogDescription></DialogHeader><div className="grid gap-3">{!overrideAction?.overrideId ? <><label className="grid gap-2 text-sm font-medium">Policy key<select className="h-9 rounded-md border border-input bg-background px-3 text-sm font-normal" value={policyKey} disabled={overridePending || Boolean(overridePreview)} onChange={(event) => { setPolicyKey(event.target.value); setOverrideValue(event.target.value.startsWith("feature.") ? "true" : "0"); setOverridePreview(null) }}>{["allowance.queueTickets", "allowance.queueEmailJourneys", "allowance.serviceBookings", "feature.queue", "feature.branding", "feature.discovery", "feature.booking", "feature.campaigns"].map((key) => <option key={key} value={key}>{key}</option>)}</select></label>{policyKey.startsWith("feature.") ? <label className="grid gap-2 text-sm font-medium">Feature value<select className="h-9 rounded-md border border-input bg-background px-3 text-sm font-normal" value={overrideValue} disabled={overridePending || Boolean(overridePreview)} onChange={(event) => setOverrideValue(event.target.value)}><option value="true">Enabled</option><option value="false">Disabled</option></select></label> : <label className="grid gap-2 text-sm font-medium">Allowance limit<Input type="number" min={0} step={1} value={overrideValue} onChange={(event) => setOverrideValue(event.target.value)} disabled={overridePending || Boolean(overridePreview)} /></label>}<label className="grid gap-2 text-sm font-medium">Expires on (optional)<Input type="date" value={overrideExpiration} onChange={(event) => setOverrideExpiration(event.target.value)} disabled={overridePending || Boolean(overridePreview)} /></label></> : <div className="rounded-md border bg-muted/30 p-3 text-sm">{overrideAction.label}</div>}<label className="grid gap-2 text-sm font-medium">Audit reason<Textarea value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} placeholder="Explain the tenant support or policy reason" maxLength={500} disabled={overridePending || Boolean(overridePreview)} /></label><p className="text-xs text-muted-foreground">Required. Recent MFA confirmation and an audit entry are required.</p>{overridePreview ? <div className="rounded-md border border-brand/30 bg-brand/5 p-3 text-sm"><p className="font-medium">Server preview ready</p><p className="mt-1 text-muted-foreground">{overrideAction?.label} · revision {overridePreview.revision}</p></div> : null}{overrideError ? <p className="text-sm text-destructive">{overrideError}</p> : null}</div><DialogFooter><Button variant="outline" onClick={() => resetOverride()} disabled={overridePending}>Cancel</Button>{overridePreview ? <Button variant={overrideAction?.overrideId ? "destructive" : "default"} onClick={executeOverride} disabled={overridePending}>{overridePending ? "Applying…" : overrideAction?.overrideId ? "Confirm revocation" : "Publish override"}</Button> : <Button onClick={() => void createOverridePreview()} disabled={overridePending}>{overridePending ? "Previewing…" : "Create preview"}</Button>}</DialogFooter></DialogContent></Dialog>
    </div>
  )
}

function UserStateBadge({ state }: { state: PlatformUsersReadModel["users"][number]["state"] }) {
  if (state === "active") return <Badge variant="success">Active</Badge>
  if (state === "sandbox") return <Badge variant="secondary">Sandbox</Badge>
  if (state === "locked") return <Badge variant="destructive">Locked</Badge>
  return <Badge variant="warning">Deletion requested</Badge>
}

function deletionStatusVariant(status: PlatformAccountDeletionRequest["status"]) {
  if (status === "completed") return "success" as const
  if (status === "review_required") return "warning" as const
  if (status === "processing") return "secondary" as const
  return "outline" as const
}

function deletionTaskOperation(request: PlatformAccountDeletionRequest) {
  if (request.userReport.status === "sending") return "Sending report to user"
  if (request.cleanup.status === "queued") return "Cleanup queued"
  if (request.cleanup.status === "running") return "Deleting related data"
  if (request.scan.status === "queued") return "Read-only scan queued"
  if (request.scan.status === "running") return "Scanning account data"
  return null
}

function deletionTaskProgress(request: PlatformAccountDeletionRequest) {
  if (request.status === "completed") return "Report sent · completed"
  if (request.userReport.status === "needs_attention") return "Cleanup complete · report pending"
  const operation = deletionTaskOperation(request)
  if (operation) return operation
  if (request.cleanup.status === "completed") return "Review cleanup report"
  if (request.scan.status === "report_ready") return "Cleanup report ready"
  if (request.scan.status === "needs_attention") return "Scan needs attention"
  return "Scan not started"
}

function DeletionTaskProgress({ request }: { request: PlatformAccountDeletionRequest }) {
  const operation = deletionTaskOperation(request)
  return operation
    ? <span role="status" className="inline-flex items-center gap-2 text-foreground"><LoaderCircle aria-hidden="true" className="size-4 shrink-0 animate-spin" />{operation}</span>
    : <>{deletionTaskProgress(request)}</>
}

function PlatformUsers({ users, viewerId, canManage, deletionRequests, deletionError, canManageDeletion, onPreview, onExecute }: { users: PlatformUsersReadModel; viewerId: string; canManage: boolean; deletionRequests: PlatformAccountDeletionQueue | null; deletionError: string | null; canManageDeletion: boolean; onCompleteDeletionTask?: (requestId: string, taskKind: AccountDeletionTaskKind, evidence: string, reason: string, retentionNotice?: string) => Promise<void>; onPreview: (userId: string, reason: string) => Promise<UserSessionRevokePreview>; onExecute: (preview: UserSessionRevokePreview, reason: string) => Promise<{ revokedSessions: number }> }) {
  const canSendPasswordReset = canManage
  const [selectedAction, setSelectedAction] = useState<UserSessionAction | null>(null)
  const [selectedDetailsUserId, setSelectedDetailsUserId] = useState<string | null>(null)
  const [details, setDetails] = useState<PlatformUserDetails | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [detailsPending, setDetailsPending] = useState(false)
  const [detailsError, setDetailsError] = useState<string | null>(null)
  const [reason, setReason] = useState("")
  const [preview, setPreview] = useState<UserSessionRevokePreview | null>(null)
  const [resetOpen, setResetOpen] = useState(false)
  const [resetPreview, setResetPreview] = useState<UserPasswordResetPreview | null>(null)
  const [resetReason, setResetReason] = useState("")
  const [resetPending, setResetPending] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)
  const [resetSent, setResetSent] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedDeletionRequestId, setSelectedDeletionRequestId] = useState<string | null>(null)
  const [deletionReason, setDeletionReason] = useState("")
  const [cleanupSelection, setCleanupSelection] = useState<Record<string, boolean>>({})
  const [cleanupReferenceSelection, setCleanupReferenceSelection] = useState<Record<string, boolean>>({})
  const [cleanupExclusions, setCleanupExclusions] = useState<Record<string, string>>({})
  const [deletionDialog, setDeletionDialog] = useState<"scan" | "cleanup" | "send-report" | null>(null)
  const [deletionPending, setDeletionPending] = useState(false)
  const [deletionConfirmation, setDeletionConfirmation] = useState<{ key: string; revision: string; token: string } | null>(null)
  const [deletionActionError, setDeletionActionError] = useState<string | null>(null)
  const openDeletionRequest = (request: PlatformAccountDeletionRequest) => {
    setSelectedDeletionRequestId(request.id)
    setCleanupSelection({})
    setCleanupReferenceSelection({})
    setCleanupExclusions({})
  }
  const selectedDeletionRequest = deletionRequests?.requests.find((request) => request.id === selectedDeletionRequestId) ?? null
  const scanReport = selectedDeletionRequest?.scan.status === "report_ready" ? selectedDeletionRequest.scan.report : null
  const isCategorySelected = (categoryId: string) => cleanupSelection[categoryId] ?? true
  const isReferenceSelected = (referenceId: string) => cleanupReferenceSelection[referenceId] ?? true
  const referenceSources = (scanReport?.inventory?.sources || []).filter((source) => source.recordCount > 0 && source.source !== "public.users.id")
  const blockedReferenceSources = new Set(scanReport?.categories.find((category) => category.id === "relational_references")?.blockers?.map((blocker) => blocker.source) || [])
  const allReferenceRowsIdentified = referenceSources.every((source) => Array.isArray(source.items) && source.items.every((item) => item.rowIdentity && Object.keys(item.rowIdentity).length > 0))
  const cleanupReadyToQueue = Boolean(scanReport && scanReport.categories.every((category) => {
    if (isCategorySelected(category.id)) return category.id === "relational_references" && category.status === "scanned"
    return (cleanupExclusions[category.id] || "").trim().length >= 8
  }) && isCategorySelected("relational_references") && allReferenceRowsIdentified && referenceSources.every((source) => source.itemsComplete && Array.isArray(source.items) && source.items.length === source.recordCount && source.items.every((item) => isReferenceSelected(item.id))))
  const openDetails = async (row: UserRow) => {
    setSelectedDetailsUserId(row.id)
    setDetailsOpen(true)
    setDetails(null)
    setDetailsError(null)
    setDetailsPending(true)
    setResetSent(false)
    try { setDetails(await platformApi.getUserDetails(row.id)) } catch (detailError) { setDetailsError(detailError instanceof Error ? detailError.message : "Unable to load account details.") } finally { setDetailsPending(false) }
  }
  const reset = () => {
    if (pending) return
    setSelectedAction(null)
    setReason("")
    setPreview(null)
    setError(null)
  }
  const createPreview = async () => {
    if (!selectedAction) return
    const cleanReason = reason.trim()
    if (cleanReason.length < 8 || cleanReason.length > 500) { setError("Enter a clear audit reason between 8 and 500 characters."); return }
    setPending(true)
    setError(null)
    try { setPreview(await onPreview(selectedAction.row.id, cleanReason)) } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Unable to create a session revocation preview.") } finally { setPending(false) }
  }
  const execute = async () => {
    if (!preview) return
    setPending(true)
    setError(null)
    try { await onExecute(preview, reason.trim()); setPending(false); reset() } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Unable to revoke the user sessions."); setPending(false) }
  }
  const createPasswordResetPreview = async () => {
    if (!details) return
    const cleanReason = resetReason.trim()
    if (cleanReason.length < 8 || cleanReason.length > 500) { setResetError("Enter a clear audit reason between 8 and 500 characters."); return }
    setResetPending(true)
    setResetError(null)
    try { setResetPreview(await platformApi.previewUserPasswordReset(details.id, cleanReason)) } catch (resetPreviewError) { setResetError(resetPreviewError instanceof Error ? resetPreviewError.message : "Unable to prepare the password reset email.") } finally { setResetPending(false) }
  }
  const sendPasswordReset = async () => {
    if (!resetPreview) return
    setResetPending(true)
    setResetError(null)
    try { await platformApi.executeUserPasswordReset(resetPreview.targetId, resetReason.trim(), resetPreview.revision, resetPreview.confirmationToken); setResetSent(true); setResetOpen(false); setResetPreview(null); setResetReason("") } catch (sendError) { setResetError(sendError instanceof Error ? sendError.message : "The password reset email could not be sent.") } finally { setResetPending(false) }
  }
  const submitDeletionAction = async () => {
    if (!selectedDeletionRequest || !deletionDialog) return
    const cleanReason = deletionReason.trim()
    if (cleanReason.length < 8 || cleanReason.length > 500) { setDeletionActionError("Enter an audit reason between 8 and 500 characters."); return }
    if (deletionDialog === "cleanup") {
      const report = selectedDeletionRequest.scan.report
      if (!report) { setDeletionActionError("Run the cleanup scan before submitting a deletion action."); return }
      const missingReason = report.categories.find((category) => !isCategorySelected(category.id) && (cleanupExclusions[category.id] || "").trim().length < 8)
      if (missingReason) { setDeletionActionError(`Explain why “${missingReason.label}” is excluded.`); return }
    }
    const payload = deletionDialog === "cleanup"
      ? { reportVersion: selectedDeletionRequest.scan.report!.version, selection: Object.fromEntries(selectedDeletionRequest.scan.report!.categories.map((category) => [category.id, isCategorySelected(category.id)])), references: Object.fromEntries(referenceSources.map((source) => [source.source, (source.items || []).filter((item) => isReferenceSelected(item.id)).map((item) => item.id)])), exclusions: cleanupExclusions }
      : { requestId: selectedDeletionRequest.id }
    const previewAction = deletionDialog === "cleanup" ? "cleanup.begin" : "report.send"
    const confirmationKey = `${deletionDialog}:${selectedDeletionRequest.id}:${cleanReason}:${JSON.stringify(payload)}`
    setDeletionPending(true)
    setDeletionActionError(null)
    try {
      if (deletionDialog !== "scan" && deletionConfirmation?.key !== confirmationKey) {
        const confirmation = await platformApi.previewAccountDeletionAction(selectedDeletionRequest.id, previewAction, payload, cleanReason)
        setDeletionConfirmation({ key: confirmationKey, revision: confirmation.revision, token: confirmation.confirmationToken })
        return
      }
      if (deletionDialog === "scan") {
        await platformApi.beginAccountDeletionScan(selectedDeletionRequest.id, cleanReason)
        setCleanupSelection({})
        setCleanupReferenceSelection({})
        setCleanupExclusions({})
      }
      else if (deletionDialog === "cleanup") await platformApi.beginAccountDeletionCleanup(selectedDeletionRequest.id, selectedDeletionRequest.scan.report!.version, payload.selection as Record<string, boolean>, payload.references as Record<string, string[]>, cleanupExclusions, cleanReason, deletionConfirmation!.revision, deletionConfirmation!.token)
      else await platformApi.sendAccountDeletionReport(selectedDeletionRequest.id, cleanReason, deletionConfirmation!.revision, deletionConfirmation!.token)
      requestPlatformRefresh()
      setDeletionDialog(null)
      setDeletionReason("")
      setDeletionConfirmation(null)
    } catch (actionError) {
      if (actionError instanceof Error && "status" in actionError && Number(actionError.status) === 401) requestPlatformRefresh()
      setDeletionActionError(actionError instanceof Error ? actionError.message : "The account-deletion action could not be queued.")
    } finally {
      setDeletionPending(false)
    }
  }
  return (
    <div className="grid gap-5">
      <div className="grid gap-1"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">Operations</p><div className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Users</h1><p className="mt-1 max-w-2xl text-muted-foreground">Access state and authentication signals across customer, vendor, sandbox, and Platform accounts.</p></div><Button variant="outline" className="w-fit gap-2" onClick={requestPlatformRefresh}>Refresh users <Activity data-icon="inline-start" /></Button></div></div>
      <div className="grid gap-3 sm:grid-cols-3">{users.metrics.map((metric) => <MetricCard key={metric.label} {...metric} />)}</div>
      <Tabs defaultValue="accounts" className="min-w-0">
        <TabsList variant="line" aria-label="User administration sections">
          <TabsTrigger value="accounts" size="lg">Accounts</TabsTrigger>
          {canManageDeletion ? <TabsTrigger value="deletion" size="lg">Data deletion <span className="text-xs text-muted-foreground">{deletionRequests?.requests.filter((request) => request.status !== "completed").length ?? "—"}</span></TabsTrigger> : null}
        </TabsList>
        <TabsContent value="accounts" className="grid gap-4 pt-3">
          <PlatformDataTable columns={userColumns} data={users.users} emptyMessage="No users in scope." tableClassName="min-w-[900px]" searchColumn="name" searchPlaceholder="Search users…" onRowClick={(row) => void openDetails(row)} getRowLabel={(row) => `View account details for ${row.name}`} isRowSelected={(row) => detailsOpen && row.id === selectedDetailsUserId} rowActions={(row) => canManage && row.id !== viewerId ? <Button variant="outline" size="sm" onClick={() => { setSelectedAction({ row }); setReason(""); setPreview(null); setError(null) }}>Revoke sessions</Button> : null} />
          <Alert><ShieldCheck /><AlertTitle>Account security guardrails</AlertTitle><AlertDescription>Profile and authentication details are view-only here. Password recovery sends a one-time link to the account email after recent MFA confirmation; MFA enrollment and recovery remain owner-verified in Account → Security.</AlertDescription></Alert>
        </TabsContent>
        {canManageDeletion ? <TabsContent value="deletion" className="grid gap-4 pt-3">
          <div className="grid gap-1"><h2 className="text-lg font-semibold">Account deletion</h2><p className="text-sm text-muted-foreground">Disable access promptly; preserve shared business records until cleanup is safe and approved.</p></div>
          <Alert><ShieldCheck /><AlertTitle>Explicit, background processing</AlertTitle><AlertDescription>Starting a scan is read-only. Deletion only starts after an admin reviews the categorized report and confirms the selected, allowlisted cleanup. Uncovered categories remain exclusions and are listed in the report sent to the account owner.</AlertDescription></Alert>
          {deletionError ? <Alert variant="destructive"><AlertTriangle /><AlertTitle>Deletion queue unavailable</AlertTitle><AlertDescription>{deletionError}</AlertDescription></Alert> : null}
          {deletionRequests?.requests.length ? <div className="overflow-hidden rounded-xl border bg-card">
            <Table>
              <TableHeader><TableRow><TableHead>Account</TableHead><TableHead>Requested</TableHead><TableHead>Due</TableHead><TableHead>Workflow</TableHead><TableHead className="text-right">State</TableHead></TableRow></TableHeader>
              <TableBody>{deletionRequests.requests.map((request) => { const selected = request.id === selectedDeletionRequestId; return <TableRow key={request.id} data-state={selected ? "selected" : undefined} aria-selected={selected || undefined} aria-label={`Open deletion request for ${request.accountName}`} tabIndex={0} className={cn("cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring hover:bg-muted/40", selected && "bg-muted/50")} onClick={(event) => { if (!(event.target instanceof HTMLElement) || !event.target.closest("button,a,input,select,textarea")) openDeletionRequest(request) }} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); openDeletionRequest(request) } }}>
                <TableCell><span className="grid gap-1"><span className="font-medium">{request.accountName}</span><span className="text-xs text-muted-foreground">{request.accountEmail}</span></span></TableCell>
                <TableCell className="whitespace-nowrap">{new Date(request.requestedAt).toLocaleDateString()}</TableCell>
                <TableCell className="whitespace-nowrap">{new Date(request.dueAt).toLocaleDateString()}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground"><DeletionTaskProgress request={request} /></TableCell>
                <TableCell className="text-right"><Badge variant={deletionStatusVariant(request.status)}>{request.status.replaceAll("_", " ")}</Badge></TableCell>
              </TableRow> })}</TableBody>
            </Table>
          </div> : deletionError ? null : <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">No account-deletion requests in scope.</p>}
          <Sheet open={Boolean(selectedDeletionRequest)} onOpenChange={(open) => { if (!open && !deletionPending) setSelectedDeletionRequestId(null) }}>
            <SheetContent side="right" className="gap-0 p-0">
              {selectedDeletionRequest ? <>
                <SheetHeader className="border-b pr-12">
                  <div className="flex flex-wrap items-center gap-2"><SheetTitle>{selectedDeletionRequest.accountName}</SheetTitle><Badge variant={deletionStatusVariant(selectedDeletionRequest.status)}>{selectedDeletionRequest.status.replaceAll("_", " ")}</Badge></div>
                  <SheetDescription>{selectedDeletionRequest.accountEmail} · requested {new Date(selectedDeletionRequest.requestedAt).toLocaleDateString()} · due {new Date(selectedDeletionRequest.dueAt).toLocaleDateString()}</SheetDescription>
                </SheetHeader>
                <div className="grid gap-5 px-4 pb-5">
                  <section className="grid gap-2"><h3 className="text-sm font-semibold">Request overview</h3><dl className="grid gap-2 rounded-lg border p-3 text-sm sm:grid-cols-2"><div className="grid gap-1"><dt className="text-muted-foreground">Request reference</dt><dd className="break-all font-mono text-xs">{selectedDeletionRequest.id}</dd></div><div className="grid gap-1"><dt className="text-muted-foreground">Policy version</dt><dd>{selectedDeletionRequest.policyVersion}</dd></div><div className="grid gap-1"><dt className="text-muted-foreground">Acknowledgment</dt><dd>{selectedDeletionRequest.acknowledgementSentAt ? `Sent ${new Date(selectedDeletionRequest.acknowledgementSentAt).toLocaleString()}` : "Not observed"}</dd></div><div className="grid gap-1"><dt className="text-muted-foreground">Completion notice</dt><dd>{selectedDeletionRequest.completionSentAt ? `Sent ${new Date(selectedDeletionRequest.completionSentAt).toLocaleString()}` : "Not sent"}</dd></div></dl>
                    {selectedDeletionRequest.lastErrorCode ? <Alert variant="destructive"><AlertTriangle /><AlertTitle>Processing needs attention</AlertTitle><AlertDescription>Attempts: {selectedDeletionRequest.attempts} · latest code: {selectedDeletionRequest.lastErrorCode}{selectedDeletionRequest.nextAttemptAt ? ` · next attempt ${new Date(selectedDeletionRequest.nextAttemptAt).toLocaleString()}` : ""}</AlertDescription></Alert> : null}
                  </section>
                  <section className="grid gap-3 rounded-lg border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">1 · Read-only cleanup scan</h3><Badge variant={selectedDeletionRequest.scan.status === "report_ready" ? "success" : selectedDeletionRequest.scan.status === "needs_attention" ? "destructive" : "secondary"}>{selectedDeletionRequest.scan.status.replaceAll("_", " ")}</Badge></div>
                    <p className="text-sm text-muted-foreground">The background scan inspects numeric relational references only; it does not delete or modify account data.</p>
                    {selectedDeletionRequest.scan.errorCode ? <p role="alert" className="text-sm text-destructive">Scan needs attention: {selectedDeletionRequest.scan.errorCode}</p> : null}
                    {selectedDeletionRequest.cleanup.status !== "queued" && selectedDeletionRequest.cleanup.status !== "running" && selectedDeletionRequest.cleanup.status !== "completed" && (selectedDeletionRequest.scan.status === "not_started" || selectedDeletionRequest.scan.status === "needs_attention" || selectedDeletionRequest.scan.status === "report_ready") ? <Button className="w-fit" disabled={!canManageDeletion || deletionPending} onClick={() => { setDeletionDialog("scan"); setDeletionReason(""); setDeletionActionError(null) }}>{selectedDeletionRequest.scan.status === "report_ready" ? "Redo read-only scan" : "Begin account cleanup"}</Button> : selectedDeletionRequest.scan.status === "queued" || selectedDeletionRequest.scan.status === "running" ? <p role="status" className="flex items-center gap-2 text-sm"><LoaderCircle aria-hidden="true" className="size-4 shrink-0 animate-spin" />The scan is running in the background. This panel will update automatically.</p> : null}
                    {scanReport ? <div className="grid gap-2"><div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"><span>Report v{scanReport.version} · generated {new Date(scanReport.generatedAt).toLocaleString()}</span><span>{scanReport.coverage} coverage</span></div><p className="text-xs text-muted-foreground">{scanReport.scope}</p>
                      <div className="grid gap-2">{scanReport.categories.map((category) => <div key={category.id} className="grid gap-2 rounded-md border p-3 text-sm"><label className="flex items-start gap-2"><input type="checkbox" className="mt-1 size-4 accent-primary" checked={isCategorySelected(category.id)} onChange={(event) => setCleanupSelection((current) => ({ ...current, [category.id]: event.target.checked }))} disabled={!canManageDeletion || selectedDeletionRequest.cleanup.status !== "not_started" && selectedDeletionRequest.cleanup.status !== "needs_attention"} /><span className="grid gap-1"><span className="font-medium">{category.label}</span><span className="text-xs text-muted-foreground">{category.status.replaceAll("_", " ")}{category.sourceCount !== undefined ? ` · ${category.sourceCount} sources · ${category.referenceCount ?? 0} references` : ""}{category.reason ? ` · ${category.reason}` : ""}</span></span></label>
                        {category.blockers?.length ? <ul className="ml-6 grid gap-1 text-xs text-destructive">{category.blockers.slice(0, 12).map((blocker) => <li key={blocker.source}><code>{blocker.source}</code> · {blocker.recordCount} references{blocker.deleteRules.length ? ` · FK ${blocker.deleteRules.join(", ")}` : ""}</li>)}</ul> : null}
                        {category.id === "relational_references" && referenceSources.length ? <div className="ml-6 grid gap-2 rounded-md border p-2"><p className="text-xs text-muted-foreground">Each group names a table and account-reference column. Each checkbox identifies the exact database row by its primary-key column(s); other record fields are not shown. The worker applies that source’s reviewed anonymization or removal rule. Unchecking one pauses the entire cleanup.</p>{referenceSources.map((source) => { const items = Array.isArray(source.items) ? source.items : []; const missingIdentity = items.some((item) => !item.rowIdentity || Object.keys(item.rowIdentity).length === 0); const sourceBlocksCleanup = blockedReferenceSources.has(source.source); return <details key={source.source} className="rounded border px-2 py-1.5"><summary className="cursor-pointer text-xs"><code>{source.source}</code><span className="ml-2 text-muted-foreground">{source.recordCount} references · {source.itemsComplete ? `${items.filter((item) => isReferenceSelected(item.id)).length} included` : "items unavailable"}</span>{sourceBlocksCleanup ? <Badge variant="destructive" className="ml-2">Blocks cleanup</Badge> : <Badge variant="secondary" className="ml-2">Policy-covered</Badge>}</summary><div className="mt-2 grid gap-1 border-t pt-2">{missingIdentity ? <p role="alert" className="text-xs text-destructive">This saved report has no row identifiers. Redo the read-only scan to load the actual row keys; cleanup stays disabled until then.</p> : null}{items.map((item) => { const rowIdentity = formatReferenceRowIdentity(item.rowIdentity); return <label key={item.id} className="flex flex-wrap items-center gap-2 py-1 text-xs"><input type="checkbox" className="size-4 accent-primary" aria-label={`Include ${source.source} row ${rowIdentity}`} checked={isReferenceSelected(item.id)} onChange={(event) => setCleanupReferenceSelection((current) => ({ ...current, [item.id]: event.target.checked }))} disabled={!canManageDeletion || selectedDeletionRequest.cleanup.status !== "not_started" && selectedDeletionRequest.cleanup.status !== "needs_attention"} /><span>{item.rowIdentity && Object.keys(item.rowIdentity).length ? <><span className="sr-only">Row </span><code className="rounded bg-muted px-1 py-0.5">{rowIdentity}</code></> : <span className="text-destructive">Row identity unavailable</span>}</span><Badge variant={sourceBlocksCleanup ? "destructive" : "secondary"}>{sourceBlocksCleanup ? "Blocks cleanup" : "Policy-covered"}</Badge></label> })}{!source.itemsComplete ? <p role="alert" className="text-xs text-destructive">The scan could not enumerate every row in this source; it cannot be included automatically.</p> : null}</div></details> })}</div> : null}
                        {!isCategorySelected(category.id) ? <Textarea value={cleanupExclusions[category.id] || ""} onChange={(event) => setCleanupExclusions((current) => ({ ...current, [category.id]: event.target.value }))} placeholder="Reason this category is excluded (required)" maxLength={500} disabled={!canManageDeletion || selectedDeletionRequest.cleanup.status !== "not_started" && selectedDeletionRequest.cleanup.status !== "needs_attention"} /> : null}</div>)}</div>
                    </div> : null}
                  </section>
                  <section className="grid gap-3 rounded-lg border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">2 · Delete related data</h3><Badge variant={selectedDeletionRequest.cleanup.status === "completed" ? "success" : selectedDeletionRequest.cleanup.status === "needs_attention" ? "destructive" : "secondary"}>{selectedDeletionRequest.cleanup.status.replaceAll("_", " ")}</Badge></div>
                    {selectedDeletionRequest.cleanup.status === "not_started" ? <p className="text-sm text-muted-foreground">Review the scan report and category checklist. Unsupported categories must be unchecked with an explanation.</p> : null}
                    {selectedDeletionRequest.cleanup.status === "queued" || selectedDeletionRequest.cleanup.status === "running" ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle aria-hidden="true" className="size-4 shrink-0 animate-spin" />Allowlisted cleanup is running as a background task. No second cleanup will be enqueued.</p> : null}
                    {selectedDeletionRequest.cleanup.status === "needs_attention" ? <p role="alert" className="text-sm text-destructive">Cleanup needs attention: {selectedDeletionRequest.lastErrorCode || "The transaction did not complete."} No partial transaction was committed; review the report before retrying.</p> : null}
                    {canManageDeletion && scanReport && ["not_started", "needs_attention"].includes(selectedDeletionRequest.cleanup.status) ? <Button variant="destructive" className="w-fit" disabled={!cleanupReadyToQueue || deletionPending} onClick={() => { setDeletionDialog("cleanup"); setDeletionReason(""); setDeletionActionError(null) }}>Delete related data</Button> : null}
                    {selectedDeletionRequest.cleanup.report ? <pre className="overflow-auto rounded-md bg-muted/40 p-3 text-xs">{JSON.stringify(selectedDeletionRequest.cleanup.report, null, 2)}</pre> : null}
                  </section>
                  <section className="grid gap-3 rounded-lg border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">3 · Review and send report</h3><Badge variant={selectedDeletionRequest.userReport.status === "sent" ? "success" : selectedDeletionRequest.userReport.status === "needs_attention" ? "destructive" : "secondary"}>{selectedDeletionRequest.userReport.status.replaceAll("_", " ")}</Badge></div>
                    {selectedDeletionRequest.cleanup.status === "completed" && selectedDeletionRequest.userReport.status !== "sent" ? <><p className="text-sm text-muted-foreground">Review the completed cleanup report above. The request is not marked completed until the user report is accepted for delivery.</p><Button className="w-fit" disabled={!canManageDeletion || deletionPending} onClick={() => { setDeletionDialog("send-report"); setDeletionReason(""); setDeletionActionError(null) }}>Send report to user</Button></> : null}
                    {selectedDeletionRequest.userReport.status === "sending" ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle aria-hidden="true" className="size-4 shrink-0 animate-spin" />Report delivery is running in the background.</p> : null}
                    {selectedDeletionRequest.userReport.status === "needs_attention" ? <p role="alert" className="text-sm text-destructive">Report delivery needs attention: {selectedDeletionRequest.userReport.errorCode}. Cleanup is complete; retrying the report will not rerun deletion.</p> : null}
                    {selectedDeletionRequest.userReport.status === "sent" ? <p className="text-sm text-emerald-600">Report accepted for delivery{selectedDeletionRequest.userReport.sentAt ? ` · ${new Date(selectedDeletionRequest.userReport.sentAt).toLocaleString()}` : ""}. Request completed.</p> : null}
                  </section>
                </div>
              </> : null}
            </SheetContent>
          </Sheet>
        </TabsContent> : null}
      </Tabs>
      <Dialog open={Boolean(deletionDialog)} onOpenChange={(open) => { if (!open && !deletionPending) { setDeletionDialog(null); setDeletionActionError(null); setDeletionConfirmation(null) } }}><DialogContent><DialogHeader><DialogTitle>{deletionDialog === "scan" ? "Begin account cleanup" : deletionDialog === "cleanup" ? "Delete related data" : "Send report to user"}</DialogTitle><DialogDescription>{selectedDeletionRequest ? `${selectedDeletionRequest.accountName} · ${selectedDeletionRequest.accountEmail}` : "Account deletion workflow"}</DialogDescription></DialogHeader><div className="grid gap-3">{deletionDialog === "scan" ? <p className="text-sm text-muted-foreground">This queues a read-only background inventory. It will not delete or change account data.</p> : deletionDialog === "cleanup" ? <Alert variant="destructive"><AlertTriangle /><AlertTitle>Irreversible account cleanup</AlertTitle><AlertDescription>The worker will remove account identity, minimize known customer PII on retained records, and fail closed if database references prevent safe deletion. Only the verified relational action is currently executable; excluded categories will be documented.</AlertDescription></Alert> : <p className="text-sm text-muted-foreground">This queues the reviewed cleanup report to the account email. The deletion request becomes complete only after the mail provider accepts it. A delivery retry does not rerun cleanup.</p>}{deletionConfirmation ? <Alert><ShieldCheck /><AlertTitle>Server confirmation ready</AlertTitle><AlertDescription>Recent authentication and MFA were verified. The confirmation is bound to this exact request, reason, report, and selection for five minutes.</AlertDescription></Alert> : null}<label className="grid gap-2 text-sm font-medium">Audit reason<Textarea value={deletionReason} onChange={(event) => { setDeletionReason(event.target.value); setDeletionConfirmation(null) }} placeholder="Explain why this account-deletion step is approved" maxLength={500} disabled={deletionPending || Boolean(deletionConfirmation)} /></label><p className="text-xs text-muted-foreground">Required (8–500 characters). This reason is recorded in the security audit trail.</p>{deletionActionError ? <p role="alert" className="text-sm text-destructive">{deletionActionError}</p> : null}</div><DialogFooter><Button variant="outline" disabled={deletionPending} onClick={() => { setDeletionDialog(null); setDeletionConfirmation(null) }}>Cancel</Button><Button variant={deletionDialog === "cleanup" ? "destructive" : "default"} disabled={deletionPending} onClick={() => void submitDeletionAction()}>{deletionPending ? "Verifying…" : deletionDialog === "scan" ? "Begin read-only scan" : deletionConfirmation ? deletionDialog === "cleanup" ? "Confirm delete related data" : "Queue report delivery" : "Create secure preview"}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={Boolean(selectedAction)} onOpenChange={(open) => { if (!open) reset() }}><DialogContent><DialogHeader><DialogTitle>{preview ? "Confirm session revocation" : "Preview session revocation"}</DialogTitle><DialogDescription>{preview ? "Review the server-issued preview before signing this account out of every active session." : "This action invalidates every active session for the selected account. The account password and MFA settings are unchanged."}</DialogDescription></DialogHeader>{selectedAction ? <div className="grid gap-3"><div className="grid gap-1 rounded-md border bg-muted/30 p-3 text-sm"><span className="font-medium">{selectedAction.row.name}</span><span className="text-muted-foreground">{selectedAction.row.id} · {selectedAction.row.roles.join(", ") || "No roles"}</span></div><div className="grid gap-2"><label htmlFor="user-session-revoke-reason" className="text-sm font-medium">Audit reason</label><Textarea id="user-session-revoke-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Example: suspected session compromise reported by account owner" maxLength={500} disabled={pending || Boolean(preview)} /><p className="text-xs text-muted-foreground">Required. This reason is written to the security audit record.</p></div>{preview ? <div className="grid gap-1 rounded-md border border-brand/30 bg-brand/5 p-3 text-sm"><span className="font-medium">Server preview ready</span><span className="text-muted-foreground">{preview.activeSessions} active session{preview.activeSessions === 1 ? "" : "s"} will be revoked.</span><span className="text-muted-foreground">Recent MFA assurance is required before execution.</span><span className="text-muted-foreground">Revision: {preview.revision}</span></div> : null}{error ? <p className="text-sm text-destructive">{error}</p> : null}</div> : null}<DialogFooter><Button variant="outline" onClick={reset} disabled={pending}>Cancel</Button>{preview ? <Button variant="destructive" onClick={execute} disabled={pending}>{pending ? "Applying…" : "Confirm revocation"}</Button> : <Button onClick={createPreview} disabled={pending}>{pending ? "Previewing…" : "Create preview"}</Button>}</DialogFooter></DialogContent></Dialog>
      <Sheet open={detailsOpen} onOpenChange={(open) => { setDetailsOpen(open); if (!open) setSelectedDetailsUserId(null) }}><SheetContent side="right" className="gap-0 overflow-y-auto p-0"><SheetHeader className="sticky top-0 z-10 border-b bg-popover pr-12"><SheetTitle>{details?.displayName || details?.name || "Account details"}</SheetTitle><SheetDescription>{details?.email || details?.username || "Profile and authentication posture"}</SheetDescription></SheetHeader>{detailsPending ? <p className="p-5 text-sm text-muted-foreground">Loading account details…</p> : detailsError ? <p role="alert" className="p-5 text-sm text-destructive">{detailsError}</p> : details ? <div className="grid gap-5 p-4">
        <section className="grid gap-3"><h3 className="text-sm font-semibold">Profile</h3><dl className="grid gap-2 rounded-lg border p-3 text-sm">{[["Full name", details.name], ["Display name", details.displayName], ["Username", details.username], ["Email", details.email], ["Phone", details.phone]].map(([label, value]) => <div key={label} className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3"><dt className="text-muted-foreground">{label}</dt><dd className="break-all">{value || "Not provided"}</dd></div>)}<div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3"><dt className="text-muted-foreground">Email status</dt><dd><Badge variant={details.emailVerified ? "success" : "warning"}>{details.emailVerified ? "Verified" : "Unverified"}</Badge></dd></div><div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3"><dt className="text-muted-foreground">Roles</dt><dd>{details.roles.join(", ") || "None"}</dd></div><div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3"><dt className="text-muted-foreground">Account state</dt><dd><UserStateBadge state={details.state} /></dd></div></dl></section>
        <section className="grid gap-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Sign-in security</h3><Badge variant={details.mfaRequired ? "warning" : details.mfaEnabled || details.emailMfaEnabled ? "success" : "secondary"}>{details.mfaRequired ? "MFA required" : details.mfaEnabled || details.emailMfaEnabled ? "MFA enabled" : "MFA not enabled"}</Badge></div><dl className="grid gap-2 rounded-lg border p-3 text-sm">{[["Sign-in method", details.lastLoginProvider || "Not observed"], ["Password login", details.hasPassword ? "Available" : "Not configured"], ["Authenticator factors", String(details.activeMfaFactors)], ["Email OTP", details.emailMfaEnabled ? "Enabled" : "Not enabled"], ["Pending factor setup", String(details.pendingMfaFactors)], ["Unused recovery codes", String(details.unusedRecoveryCodes)], ["Active sessions", String(details.activeSessions)]].map(([label, value]) => <div key={label} className="grid grid-cols-[10rem_minmax(0,1fr)] gap-3"><dt className="text-muted-foreground">{label}</dt><dd>{value}</dd></div>)}</dl><Alert><ShieldCheck /><AlertTitle>MFA is owner-managed</AlertTitle><AlertDescription>The account owner sets up or recovers MFA from GetPrio → Account → Security. Platform staff cannot view authenticator secrets or recovery codes.</AlertDescription></Alert></section>
        <section className="grid gap-3 border-t pt-4"><h3 className="text-sm font-semibold">Account support</h3>{resetSent ? <p role="status" className="text-sm text-emerald-600">Password reset instructions were sent to the account email.</p> : null}<div className="flex flex-wrap gap-2">{canSendPasswordReset ? <Button variant="outline" onClick={() => { setResetReason(""); setResetPreview(null); setResetError(null); setResetOpen(true) }} disabled={!details.email}>Send password reset email</Button> : null}{canManage && details.id !== viewerId ? <Button variant="destructive" onClick={() => { const row = users.users.find((item) => item.id === details.id); if (row) { setSelectedAction({ row }); setReason(""); setPreview(null); setError(null) } }}>Revoke sessions</Button> : null}</div><p className="text-xs text-muted-foreground">A reset link is delivered directly to this verified or unverified account email; the password is never revealed or set by Platform staff.</p></section>
        <div className="text-xs text-muted-foreground">Created {details.createdAt ? new Date(details.createdAt).toLocaleString() : "not recorded"} · Updated {details.updatedAt ? new Date(details.updatedAt).toLocaleString() : "not recorded"}</div>
      </div> : null}</SheetContent></Sheet>
      <Dialog open={resetOpen} onOpenChange={(open) => { if (!resetPending) { setResetOpen(open); if (!open) { setResetPreview(null); setResetError(null) } } }}><DialogContent><DialogHeader><DialogTitle>{resetPreview ? "Confirm password reset email" : "Preview password reset email"}</DialogTitle><DialogDescription>{resetPreview ? `A one-time reset link will be sent to ${details?.email}. Platform staff will not see or set the password.` : `Prepare a reset email for ${details?.email}. The action requires recent MFA assurance and an audit reason.`}</DialogDescription></DialogHeader><div className="grid gap-3"><label className="grid gap-2 text-sm font-medium">Audit reason<Textarea value={resetReason} onChange={(event) => setResetReason(event.target.value)} placeholder="Example: account owner requested password recovery" maxLength={500} disabled={resetPending || Boolean(resetPreview)} /></label><p className="text-xs text-muted-foreground">Required. The email will be sent only to the address on this account.</p>{resetPreview ? <div className="grid gap-1 rounded-md border border-brand/30 bg-brand/5 p-3 text-sm"><span className="font-medium">Server confirmation ready</span><span className="text-muted-foreground">The reset link expires shortly and can be used once.</span><span className="text-muted-foreground">Recent MFA assurance is required · preview {resetPreview.revision}</span></div> : null}{resetError ? <p role="alert" className="text-sm text-destructive">{resetError}</p> : null}</div><DialogFooter><Button variant="outline" onClick={() => setResetOpen(false)} disabled={resetPending}>Cancel</Button>{resetPreview ? <Button onClick={() => void sendPasswordReset()} disabled={resetPending}>{resetPending ? "Sending…" : "Send reset email"}</Button> : <Button onClick={() => void createPasswordResetPreview()} disabled={resetPending}>{resetPending ? "Preparing…" : "Create preview"}</Button>}</DialogFooter></DialogContent></Dialog>
    </div>
  )
}

function AuditOutcomeBadge({ outcome }: { outcome: PlatformAuditReadModel["events"][number]["outcome"] }) {
  if (outcome === "success") return <Badge variant="success">Success</Badge>
  if (outcome === "denied" || outcome === "failed") return <Badge variant="destructive">{outcome}</Badge>
  return <Badge variant="warning">{outcome}</Badge>
}

function SecurityAudit({ audit }: { audit: PlatformAuditReadModel }) {
  return (
    <div className="grid gap-5">
      <div className="grid gap-1"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">Trust</p><div className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Security audit</h1><p className="mt-1 max-w-2xl text-muted-foreground">Searchable evidence for privileged actions, outcomes, scopes, and request correlation.</p></div><Button variant="outline" className="w-fit gap-2" onClick={requestPlatformRefresh}>Refresh audit <Activity data-icon="inline-start" /></Button></div></div>
      <div className="grid gap-3 sm:grid-cols-3">{audit.metrics.map((metric) => <MetricCard key={metric.label} {...metric} />)}</div>
      <PlatformDataTable columns={auditColumns} data={audit.events} emptyMessage="No audit events in scope." tableClassName="min-w-[960px]" searchColumn="action" searchPlaceholder="Search actions…" />
      <Alert><ShieldCheck /><AlertTitle>Audit chain evidence</AlertTitle><AlertDescription>Each event includes a digest for chain verification. The dashboard intentionally exposes action context without returning before/after state or identity contact fields in this list view.</AlertDescription></Alert>
    </div>
  )
}

type CreditCaseAction =
  | { kind: "refund"; row: CreditRefundRow; outcome: "confirmed" | "failed" }
  | { kind: "dispute"; row: CreditDisputeRow; outcome: "won" | "lost" }

function CreditCaseControls({ billing, canResolveRefunds, canResolveDisputes, onPreview, onResolveRefund, onResolveDispute }: { billing: PlatformBillingReadModel; canResolveRefunds: boolean; canResolveDisputes: boolean; onPreview: (action: "credit.refund.resolve" | "credit.dispute.resolve", targetId: string, payload: Record<string, unknown>, reason: string) => Promise<TenantEntitlementPreview>; onResolveRefund: (purchaseId: string, outcome: "confirmed" | "failed", providerRefundId: string | null, reason: string, preview: TenantEntitlementPreview) => Promise<void>; onResolveDispute: (providerDisputeId: string, outcome: "won" | "lost", reason: string, preview: TenantEntitlementPreview) => Promise<void> }) {
  const [caseTab, setCaseTab] = useState<"refunds" | "disputes">("refunds")
  const [selected, setSelected] = useState<CreditCaseAction | null>(null)
  const [reason, setReason] = useState("")
  const [providerRefundId, setProviderRefundId] = useState("")
  const [preview, setPreview] = useState<TenantEntitlementPreview | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reset = () => { if (pending) return; setSelected(null); setReason(""); setProviderRefundId(""); setPreview(null); setError(null) }
  const startRefund = (row: CreditRefundRow) => { setSelected({ kind: "refund", row, outcome: "confirmed" }); setReason(""); setProviderRefundId(""); setPreview(null); setError(null) }
  const startDispute = (row: CreditDisputeRow) => { setSelected({ kind: "dispute", row, outcome: "won" }); setReason(""); setPreview(null); setError(null) }
  const createPreview = async () => {
    if (!selected) return
    const cleanReason = reason.trim()
    if (cleanReason.length < 8 || cleanReason.length > 500) { setError("Enter a clear audit reason between 8 and 500 characters."); return }
    const isRefund = selected.kind === "refund"
    const action = isRefund ? "credit.refund.resolve" : "credit.dispute.resolve"
    const targetId = isRefund ? selected.row.purchaseId : selected.row.providerDisputeId
    const payload = isRefund
      ? { purchaseId: selected.row.purchaseId, outcome: selected.outcome, providerRefundId: providerRefundId.trim() || null }
      : { providerDisputeId: selected.row.providerDisputeId, outcome: selected.outcome }
    setPending(true); setError(null)
    try { setPreview(await onPreview(action, targetId, payload, cleanReason)) } catch (previewError) { setError(previewError instanceof Error ? previewError.message : "Unable to preview this credit case.") } finally { setPending(false) }
  }
  const execute = async () => {
    if (!selected || !preview) return
    setPending(true); setError(null)
    try {
      if (selected.kind === "refund") await onResolveRefund(selected.row.purchaseId, selected.outcome, providerRefundId.trim() || null, reason.trim(), preview)
      else await onResolveDispute(selected.row.providerDisputeId, selected.outcome, reason.trim(), preview)
      setPending(false); reset()
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Unable to resolve this credit case."); setPending(false) }
  }
  const refundActionsEnabled = billing.creditRefundsEnabled
  const disputeActionsEnabled = billing.creditDisputesEnabled
  const renderCaseTypeNavigation = () => <NavigationMenu className="h-7 max-w-full flex-none justify-start"><NavigationMenuList className="h-7 flex-none justify-start"><NavigationMenuItem><NavigationMenuTrigger className="h-7 min-h-7 rounded-none p-0 text-lg font-semibold leading-7 text-foreground hover:bg-transparent focus:bg-transparent data-popup-open:bg-transparent data-open:bg-transparent data-popup-open:hover:bg-transparent data-open:hover:bg-transparent">{caseTab === "refunds" ? "Credit refunds" : "Credit disputes"}</NavigationMenuTrigger><NavigationMenuContent className="min-w-64"><div className="grid gap-1 p-1"><NavigationMenuLink href="#credit-refunds" onClick={(event) => { event.preventDefault(); setCaseTab("refunds") }} className={cn("flex-col items-start gap-0 rounded-md", caseTab === "refunds" && "bg-muted/50")}><span className="font-medium">Credit refunds</span><span className="text-xs text-muted-foreground">Refund outcomes and reconciliation</span></NavigationMenuLink><NavigationMenuLink href="#credit-disputes" onClick={(event) => { event.preventDefault(); setCaseTab("disputes") }} className={cn("flex-col items-start gap-0 rounded-md", caseTab === "disputes" && "bg-muted/50")}><span className="font-medium">Credit disputes</span><span className="text-xs text-muted-foreground">Provider outcomes and unused credits</span></NavigationMenuLink></div></NavigationMenuContent></NavigationMenuItem></NavigationMenuList></NavigationMenu>
  const visibleCount = caseTab === "refunds" ? billing.creditRefunds.length : billing.creditDisputes.length
  return <><Tabs value={caseTab} onValueChange={(value) => { if (value === "refunds" || value === "disputes") setCaseTab(value) }} className="w-full"><TabsContent value="refunds"><section className="grid gap-0"><div className="flex flex-wrap items-end justify-between gap-2 border-y py-4"><div className="grid gap-1">{renderCaseTypeNavigation()}<p className="text-sm text-muted-foreground">Record outcomes after checking the provider’s refund status.</p></div><Badge variant="secondary">{visibleCount} in view</Badge></div><PlatformDataTable columns={creditRefundColumns} data={billing.creditRefunds} emptyMessage="No refund cases in scope." tableClassName="min-w-[850px]" searchColumn="tenant" searchPlaceholder="Search refund cases…" rowActions={(row) => canResolveRefunds && refundActionsEnabled && ["requested", "processing"].includes(row.status) ? <Button variant="outline" size="sm" onClick={() => startRefund(row)}>Record outcome</Button> : <span className="text-xs text-muted-foreground">Read-only</span>} /></section></TabsContent><TabsContent value="disputes"><section className="grid gap-0"><div className="flex flex-wrap items-end justify-between gap-2 border-y py-4"><div className="grid gap-1">{renderCaseTypeNavigation()}<p className="text-sm text-muted-foreground">Review provider outcomes and their effect on unused credits.</p></div><Badge variant="secondary">{visibleCount} in view</Badge></div><PlatformDataTable columns={creditDisputeColumns} data={billing.creditDisputes} emptyMessage="No credit disputes in scope." tableClassName="min-w-[980px]" searchColumn="tenant" searchPlaceholder="Search credit disputes…" rowActions={(row) => canResolveDisputes && disputeActionsEnabled && ["open", "under_review"].includes(row.status) ? <Button variant="outline" size="sm" onClick={() => startDispute(row)}>Resolve</Button> : <span className="text-xs text-muted-foreground">Read-only</span>} /></section></TabsContent></Tabs>{(!refundActionsEnabled || !disputeActionsEnabled) ? <Alert><ShieldCheck /><AlertTitle>Some credit-case actions are disabled</AlertTitle><AlertDescription>{!refundActionsEnabled ? "Refund reconciliation is disabled by release control. " : ""}{!disputeActionsEnabled ? "Dispute resolution is disabled by release control." : ""}Case records remain visible for review.</AlertDescription></Alert> : null}<Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) reset() }}><DialogContent><DialogHeader><DialogTitle>{selected?.kind === "refund" ? "Record provider refund outcome" : "Resolve provider credit dispute"}</DialogTitle><DialogDescription>{selected?.kind === "refund" ? "This does not initiate a refund. Confirmed revokes purchased credits and marks the purchase refunded; failed restores eligible credits." : "A won outcome unfreezes purchased credits. A lost outcome revokes eligible unused credits and marks the purchase failed."}</DialogDescription></DialogHeader>{selected ? <div className="grid gap-3"><div className="grid gap-1 rounded-md border bg-muted/30 p-3 text-sm"><span className="font-medium">{selected.row.tenant} · {selected.row.amount}</span><span className="text-muted-foreground">Purchase {selected.row.purchaseId} · {selected.row.provider} · current state {selected.row.purchaseStatus}</span>{selected.kind === "refund" ? <span className="text-muted-foreground">Refund request: {selected.row.status} · {selected.row.reason || "No reason recorded"}</span> : <><span className="text-muted-foreground">Provider dispute: {selected.row.providerDisputeId}</span><span className="text-muted-foreground">Consumed credit exposure: {selected.row.consumedExposureUnits.toLocaleString()} units</span></>}</div><label className="grid gap-2 text-sm font-medium">Provider outcome<select className="h-9 rounded-md border border-input bg-background px-3 text-sm font-normal" value={selected.outcome} disabled={pending || Boolean(preview)} onChange={(event) => setSelected(selected.kind === "refund" ? { ...selected, outcome: event.target.value as "confirmed" | "failed" } : { ...selected, outcome: event.target.value as "won" | "lost" })}>{selected.kind === "refund" ? <><option value="confirmed">Refund confirmed by provider</option><option value="failed">Refund failed at provider</option></> : <><option value="won">Dispute won</option><option value="lost">Dispute lost</option></>}</select></label>{selected.kind === "refund" ? <label className="grid gap-2 text-sm font-medium">Provider refund reference (optional)<Input value={providerRefundId} maxLength={200} disabled={pending || Boolean(preview)} onChange={(event) => setProviderRefundId(event.target.value)} placeholder="Enter the provider’s refund ID" /></label> : null}<label className="grid gap-2 text-sm font-medium">Audit reason<Textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} disabled={pending || Boolean(preview)} placeholder="Record the provider evidence and resolution rationale" /></label><p className="text-xs text-muted-foreground">Requires a server preview, recent MFA confirmation, and an audit record.</p>{preview ? <div className="rounded-md border border-brand/30 bg-brand/5 p-3 text-sm"><p className="font-medium">Server preview ready</p><p className="mt-1 text-muted-foreground">{preview.action} · revision {preview.revision}</p></div> : null}{error ? <p className="text-sm text-destructive">{error}</p> : null}</div> : null}<DialogFooter><Button variant="outline" onClick={reset} disabled={pending}>Cancel</Button>{preview ? <Button variant="destructive" onClick={() => void execute()} disabled={pending}>{pending ? "Recording…" : "Confirm provider outcome"}</Button> : <Button onClick={() => void createPreview()} disabled={pending}>{pending ? "Previewing…" : "Create preview"}</Button>}</DialogFooter></DialogContent></Dialog></>
}

function BillingStatusBadge({ status }: { status: string }) {
  if (["active", "fulfilled", "confirmed", "won"].includes(status)) return <Badge variant="success">{status.replaceAll("_", " ")}</Badge>
  if (["requested", "processing", "open", "under_review"].includes(status)) return <Badge variant="warning">{status.replaceAll("_", " ")}</Badge>
  if (["past_due", "unpaid", "suspended", "refund_pending", "disputed", "failed", "lost"].includes(status)) return <Badge variant="destructive">{status.replaceAll("_", " ")}</Badge>
  return <Badge variant="secondary">{status.replaceAll("_", " ")}</Badge>
}

function Billing({ billing, canSuspend, canResolveRefunds, canResolveDisputes, onPreviewSuspend, onExecuteSuspend, onPreviewCreditCase, onResolveCreditRefund, onResolveCreditDispute }: { billing: PlatformBillingReadModel; canSuspend: boolean; canResolveRefunds: boolean; canResolveDisputes: boolean; onPreviewSuspend: (subscriptionId: string, reason: string) => Promise<SubscriptionSuspendPreview>; onExecuteSuspend: (preview: SubscriptionSuspendPreview, reason: string) => Promise<void>; onPreviewCreditCase: (action: "credit.refund.resolve" | "credit.dispute.resolve", targetId: string, payload: Record<string, unknown>, reason: string) => Promise<TenantEntitlementPreview>; onResolveCreditRefund: (purchaseId: string, outcome: "confirmed" | "failed", providerRefundId: string | null, reason: string, preview: TenantEntitlementPreview) => Promise<void>; onResolveCreditDispute: (providerDisputeId: string, outcome: "won" | "lost", reason: string, preview: TenantEntitlementPreview) => Promise<void> }) {
  const [billingTab, setBillingTab] = useState<BillingTab>(billingTabFromLocation)
  useEffect(() => {
    const syncTab = () => setBillingTab(billingTabFromLocation())
    window.addEventListener("popstate", syncTab)
    return () => window.removeEventListener("popstate", syncTab)
  }, [])
  const changeBillingTab = (value: string | number | null) => {
    if (value !== "subscriptions" && value !== "purchases" && value !== "cases") return
    setBillingTab(value)
    const url = new URL(window.location.href)
    url.searchParams.set("billingTab", value)
    window.history.pushState({}, "", url)
    window.dispatchEvent(new PopStateEvent("popstate"))
  }
  const [suspendRow, setSuspendRow] = useState<SubscriptionRow | null>(null)
  const [suspendReason, setSuspendReason] = useState("")
  const [suspendPreview, setSuspendPreview] = useState<SubscriptionSuspendPreview | null>(null)
  const [suspendPending, setSuspendPending] = useState(false)
  const [suspendError, setSuspendError] = useState<string | null>(null)
  const resetSuspend = () => {
    if (suspendPending) return
    setSuspendRow(null)
    setSuspendReason("")
    setSuspendPreview(null)
    setSuspendError(null)
  }
  const createSuspendPreview = async () => {
    if (!suspendRow) return
    const reason = suspendReason.trim()
    if (reason.length < 1 || reason.length > 500) {
      setSuspendError("Enter an audit reason between 1 and 500 characters.")
      return
    }
    setSuspendPending(true)
    setSuspendError(null)
    try {
      setSuspendPreview(await onPreviewSuspend(suspendRow.id, reason))
    } catch (error) {
      setSuspendError(error instanceof Error ? error.message : "Unable to create a subscription preview.")
    } finally {
      setSuspendPending(false)
    }
  }
  const executeSuspend = async () => {
    if (!suspendPreview) return
    setSuspendPending(true)
    setSuspendError(null)
    try {
      await onExecuteSuspend(suspendPreview, suspendReason.trim())
      setSuspendPending(false)
      resetSuspend()
    } catch (error) {
      setSuspendError(error instanceof Error ? error.message : "Unable to suspend the subscription.")
      setSuspendPending(false)
    }
  }

  return (
    <div className="grid gap-5">
      <div className="grid gap-1"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">Governance</p><div className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Billing &amp; credits</h1><p className="mt-1 max-w-2xl text-muted-foreground">Provider-neutral subscription state, usage-credit purchases, and reconciliation signals.</p></div><Button variant="outline" className="w-fit gap-2" onClick={requestPlatformRefresh}>Refresh billing <Activity data-icon="inline-start" /></Button></div></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{billing.metrics.map((metric) => <MetricCard key={metric.label} {...metric} />)}</div>
      <Tabs value={billingTab} onValueChange={changeBillingTab} className="w-full"><TabsList variant="line" className="grid h-12 w-full grid-cols-3 gap-2 rounded-none p-0 sm:w-fit"><TabsTrigger size="lg" value="subscriptions">Subscriptions <span className="text-xs text-muted-foreground">{billing.counts.subscriptions}</span></TabsTrigger><TabsTrigger size="lg" value="purchases">Purchases <span className="text-xs text-muted-foreground">{billing.counts.purchases}</span></TabsTrigger><TabsTrigger size="lg" value="cases">Credit cases <span className="text-xs text-muted-foreground">{billing.counts.refunds + billing.counts.disputes}</span></TabsTrigger></TabsList><TabsContent value="subscriptions" className="mt-3"><section className="grid gap-0"><div className="flex flex-wrap items-end justify-between gap-2 border-y py-4"><div><h2 className="h-7 text-lg font-semibold leading-7">Subscriptions</h2><p className="text-sm text-muted-foreground">Provider-neutral tenant subscription state.</p></div><Badge variant="secondary">{billing.subscriptions.length} in view</Badge></div><PlatformDataTable columns={subscriptionColumns} data={billing.subscriptions} emptyMessage="No subscriptions in scope." tableClassName="min-w-[780px]" searchColumn="tenant" searchPlaceholder="Search subscriptions…" rowActions={(row) => canSuspend && ["active", "past_due", "unpaid"].includes(row.status) ? <Button variant="outline" size="sm" onClick={() => { setSuspendRow(row); setSuspendReason(""); setSuspendPreview(null); setSuspendError(null) }}>Preview suspend</Button> : <span className="text-xs text-muted-foreground">Read-only</span>} /></section></TabsContent><TabsContent value="purchases" className="mt-3"><section className="grid gap-0"><div className="flex flex-wrap items-end justify-between gap-2 border-y py-4"><div><h2 className="h-7 text-lg font-semibold leading-7">Usage-credit purchases</h2><p className="text-sm text-muted-foreground">Purchases and current fulfillment state.</p></div><Badge variant="secondary">{billing.creditPurchases.length} in view</Badge></div><PlatformDataTable columns={creditPurchaseColumns} data={billing.creditPurchases} emptyMessage="No credit purchases in scope." tableClassName="min-w-[600px]" searchColumn="tenant" searchPlaceholder="Search purchases…" /></section></TabsContent><TabsContent value="cases" className="mt-3"><CreditCaseControls billing={billing} canResolveRefunds={canResolveRefunds} canResolveDisputes={canResolveDisputes} onPreview={onPreviewCreditCase} onResolveRefund={onResolveCreditRefund} onResolveDispute={onResolveCreditDispute} /></TabsContent></Tabs>
      <Alert><ShieldCheck /><AlertTitle>Provider boundary</AlertTitle><AlertDescription>Provider names are evidence fields only. Subscription suspension requires server preview, recent MFA assurance, release-control availability, confirmation, and an audit reason.</AlertDescription></Alert>
      <Dialog open={Boolean(suspendRow)} onOpenChange={(open) => { if (!open) resetSuspend() }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{suspendPreview ? "Confirm subscription suspension" : "Preview subscription suspension"}</DialogTitle><DialogDescription>{suspendPreview ? "Review the server-issued preview before changing the subscription state." : "Create a server preview before any billing state changes."}</DialogDescription></DialogHeader>
          {suspendRow ? <div className="grid gap-3"><div className="grid gap-1 rounded-md border bg-muted/30 p-3 text-sm"><span className="font-medium">{suspendRow.tenant} · {suspendRow.id}</span><span className="text-muted-foreground">{suspendRow.plan} plan · {suspendRow.provider} · current state {suspendRow.status}</span><span className="text-muted-foreground">Action: Suspend subscription</span></div><div className="grid gap-2"><label htmlFor="subscription-suspend-reason" className="text-sm font-medium">Audit reason</label><Textarea id="subscription-suspend-reason" value={suspendReason} onChange={(event) => setSuspendReason(event.target.value)} placeholder="Example: confirmed unresolved billing case with provider" maxLength={500} disabled={suspendPending || Boolean(suspendPreview)} /><p className="text-xs text-muted-foreground">Required. This reason is written to the security audit record.</p></div>{suspendPreview ? <div className="grid gap-1 rounded-md border border-brand/30 bg-brand/5 p-3 text-sm"><span className="font-medium">Server preview ready</span><span className="text-muted-foreground">Revision: {suspendPreview.revision}</span><span className="text-muted-foreground">MFA assurance is required before execution.</span></div> : null}{suspendError ? <p className="text-sm text-destructive">{suspendError}</p> : null}</div> : null}
          <DialogFooter><Button variant="outline" onClick={resetSuspend} disabled={suspendPending}>Cancel</Button>{suspendPreview ? <Button variant="destructive" onClick={executeSuspend} disabled={suspendPending}>{suspendPending ? "Applying…" : "Confirm suspension"}</Button> : <Button onClick={createSuspendPreview} disabled={suspendPending}>{suspendPending ? "Previewing…" : "Create preview"}</Button>}</DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function PlatformSidebar({ activeRoute, dark, onRouteChange, viewer, onLogout }: { activeRoute: string; dark: boolean; onRouteChange: (route: string) => void; viewer: PlatformViewerContext; onLogout: () => void }) {
  const capabilities = new Set(viewer.capabilities)
  const [signOutOpen, setSignOutOpen] = useState(false)
  return (
    <>
      <Sidebar collapsible="icon" variant="sidebar">
        <SidebarHeader className="px-3 py-4">
          <SidebarMenu><SidebarMenuItem><SidebarMenuButton size="lg" tooltip="GetPrio Platform"><img src={dark ? "/logo-dark.svg" : "/logo.svg"} alt="" className="size-7 shrink-0 object-contain" /><span className="grid flex-1 text-left leading-tight"><span className="font-semibold">GetPrio</span><span className="text-xs text-sidebar-foreground/60">Platform</span></span><ChevronDown className="ml-auto size-4 text-sidebar-foreground/50" /></SidebarMenuButton></SidebarMenuItem></SidebarMenu>
          {!usesLiveData ? <div className="px-2 pt-2"><Badge variant="warning" aria-label="Fixture data only, not connected to live Platform data">Fixture data · not live</Badge></div> : null}
        </SidebarHeader>
        <SidebarContent className="overflow-hidden">
          <ScrollArea className="min-h-0 flex-1">
            {navGroups.map((group) => { const items = group.items.filter((item) => capabilities.has(item.capability)); return items.length ? <SidebarGroup key={group.label}><SidebarGroupLabel>{group.label}</SidebarGroupLabel><SidebarGroupContent><SidebarMenu>{items.map((item) => { const active = item.subItems ? activeRoute.startsWith("Help Center /") : activeRoute === item.label; return <SidebarMenuItem key={item.label}><SidebarMenuButton isActive={active} tooltip={item.label} onClick={() => onRouteChange(item.route || item.label)}><item.icon /><span>{item.label}</span></SidebarMenuButton>{item.subItems ? <SidebarMenuSub>{item.subItems.map((subItem) => <SidebarMenuSubItem key={subItem.route}><SidebarMenuSubButton isActive={activeRoute === subItem.route} onClick={() => onRouteChange(subItem.route)}><span>{subItem.label}</span></SidebarMenuSubButton></SidebarMenuSubItem>)}</SidebarMenuSub> : null}</SidebarMenuItem> })}</SidebarMenu></SidebarGroupContent></SidebarGroup> : null })}
          </ScrollArea>
        </SidebarContent>
        <SidebarFooter className="p-3">
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger render={<SidebarMenuButton size="lg" aria-label="Open account menu" />}>
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-subtle text-xs font-semibold text-brand">{viewer.user.displayName.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span>
                  <span className="grid min-w-0 flex-1 text-left leading-tight"><span className="truncate font-medium">{viewer.user.displayName}</span><span className="truncate text-xs text-sidebar-foreground/60">{viewer.user.role}</span></span>
                  <ChevronDown className="ml-auto size-4 text-sidebar-foreground/50" />
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="end" sideOffset={8} className="min-w-56">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel className="grid gap-1"><span className="truncate font-medium">{viewer.user.displayName}</span><span className="truncate text-xs font-normal text-muted-foreground">{viewer.user.role}</span></DropdownMenuLabel>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem onClick={() => onRouteChange("My account")}>My account</DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem variant="destructive" onClick={() => setSignOutOpen(true)}><LogOut />Sign out</DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <Dialog open={signOutOpen} onOpenChange={setSignOutOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign out of GetPrio Platform?</DialogTitle>
            <DialogDescription>You’ll be returned to the sign-in screen. You can sign back in whenever you’re ready.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSignOutOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { setSignOutOpen(false); onLogout() }}>Sign out</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

type MetricTone = "attention" | "positive" | "neutral" | "info"
type MetricVisual = { icon: typeof Activity; tone: MetricTone }

const metricVisuals: Record<string, MetricVisual> = {
  "Needs attention": { icon: AlertTriangle, tone: "attention" },
  "Active tenants": { icon: Users, tone: "positive" },
  "Queue health": { icon: Activity, tone: "positive" },
  "API projects": { icon: Code2, tone: "info" },
}

const metricIcons: Record<string, typeof Activity> = {
  "Open queue days": ListChecks,
  "Needs reconciliation": AlertTriangle,
  "Unresolved tickets": ListChecks,
  "Notification backlog": Activity,
  "Pending approval": ShieldCheck,
  "Without plan signal": CircleDollarSign,
  "Users in scope": Users,
  "MFA required": ShieldCheck,
  "Account attention": AlertTriangle,
  "Events in view": FileSearch,
  "Failed, denied, or conflicting": AlertTriangle,
  "Chain status": ShieldCheck,
  "Active subscriptions": CircleDollarSign,
  "Restricted billing": AlertTriangle,
  "Pending transitions": Activity,
  "Observed services": Activity,
  Degraded: AlertTriangle,
  "Without heartbeat": Activity,
}

const metricToneClasses: Record<MetricTone, string> = {
  attention: "bg-brand-subtle text-brand",
  positive: "bg-success/10 text-success dark:bg-success/20",
  neutral: "bg-muted text-muted-foreground",
  info: "bg-chart-1/10 text-chart-1 dark:bg-chart-1/20",
}

function MetricCard({ label, value, trend, trendTone, visual }: PlatformOverviewReadModel["metrics"][number] & { visual?: MetricVisual }) {
  const Icon = visual?.icon ?? metricIcons[label] ?? Activity
  const tone = visual?.tone ?? trendTone

  return <PlatformMetricCard label={label} value={value} icon={Icon} iconClassName={metricToneClasses[tone]} supportingContent={trend} />
}

const serviceColumns: ColumnDef<ServiceRow>[] = [
  { accessorKey: "name", header: "Service", cell: ({ row }) => <div className="min-w-64"><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{row.original.name}</p><Badge variant="outline">{row.original.freshness.replaceAll("-", " ")}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{row.original.description}</p><p className="mt-2 text-xs text-muted-foreground">Observed: {row.original.observedAt}</p></div> },
  { accessorKey: "evidence", header: "Evidence", cell: ({ row }) => <div className="min-w-72"><p className="text-sm">{row.original.evidence}</p><p className="mt-1 text-xs text-muted-foreground">{row.original.metric}</p></div> },
  { accessorKey: "state", header: "Status", cell: ({ row }) => <ServiceStateBadge state={row.original.state} /> },
]

const queueColumns: ColumnDef<QueueRow>[] = [
  { accessorKey: "businessDate", header: "Queue day", cell: ({ row }) => <div className="min-w-64"><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{row.original.businessDate}</p><Badge variant="outline">{row.original.state}</Badge></div><p className="mt-1 text-sm text-muted-foreground">Queue day #{row.original.id} · {row.original.tenantName} · {row.original.locationName}</p>{row.original.lastReconciliationError ? <p className="mt-2 text-xs text-brand">{row.original.lastReconciliationError}</p> : null}</div> },
  { accessorKey: "unresolvedTickets", header: "Work remaining", cell: ({ row }) => <div><p className="text-sm font-medium">{row.original.unresolvedTickets} unresolved tickets</p><p className="text-xs text-muted-foreground">{row.original.notificationBacklog} notification jobs queued</p></div> },
  { accessorKey: "reconciliationAttempts", header: "Recovery signal", cell: ({ row }) => <div><p className="text-sm font-medium">{row.original.reconciliationAttempts} reconciliation attempts</p><p className="text-xs text-muted-foreground">Inspect before retrying</p></div> },
  { accessorKey: "attention", header: "State", cell: ({ row }) => <QueueAttentionBadge attention={row.original.attention} /> },
]

const tenantColumns: ColumnDef<TenantRow>[] = [
  { accessorKey: "name", header: "Tenant", cell: ({ row }) => <div className="min-w-64"><div className="flex flex-wrap items-center gap-2"><p className="truncate font-medium">{row.original.name}</p><Badge variant={row.original.active ? "success" : "secondary"}>{row.original.active ? "Active" : "Inactive"}</Badge></div><p className="mt-1 truncate text-sm text-muted-foreground">{row.original.slug} · {row.original.id}</p></div> },
  { accessorKey: "owner", header: "Owner", cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.owner}</span> },
  { accessorKey: "plan", header: "Plan", cell: ({ row }) => <span className="text-sm capitalize">{row.original.plan || "No plan signal"}</span> },
  { accessorKey: "tickets", header: "Tickets", cell: ({ row }) => <span className="text-sm tabular-nums">{row.original.tickets.toLocaleString()}</span> },
  { accessorKey: "vendorApproval", header: "State", cell: ({ row }) => <TenantApprovalBadge status={row.original.vendorApproval} /> },
]

const userColumns: ColumnDef<UserRow>[] = [
  { accessorKey: "name", header: "User", cell: ({ row }) => <div className="min-w-56"><p className="truncate font-medium">{row.original.name}</p><p className="mt-1 truncate text-sm text-muted-foreground">{row.original.id}</p></div> },
  { accessorKey: "roles", header: "Roles", enableSorting: false, cell: ({ row }) => <div className="flex flex-wrap gap-1">{row.original.roles.length ? row.original.roles.map((role) => <Badge variant="outline" key={role}>{role.replaceAll("_", " ")}</Badge>) : <span className="text-sm text-muted-foreground">No roles</span>}</div> },
  { accessorKey: "emailVerified", header: "Verification", cell: ({ row }) => <span className="text-sm">{row.original.emailVerified ? "Verified" : "Unverified"}</span> },
  { accessorKey: "mfa", header: "MFA", cell: ({ row }) => <span className="text-sm capitalize">{row.original.mfa.replaceAll("-", " ")}</span> },
  { accessorKey: "state", header: "State", cell: ({ row }) => <UserStateBadge state={row.original.state} /> },
]

const auditColumns: ColumnDef<AuditRow>[] = [
  { accessorKey: "action", header: "Action", cell: ({ row }) => <div className="min-w-72"><p className="truncate font-medium">{row.original.action}</p><p className="mt-1 truncate text-sm text-muted-foreground">{row.original.resourceType}{row.original.resourceId ? ` · ${row.original.resourceId}` : ""}</p><p className="mt-1 text-xs text-muted-foreground">{row.original.reason || "No reason recorded"} · {row.original.occurredAt}</p></div> },
  { accessorKey: "scope", header: "Scope", cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.scope}</span> },
  { accessorKey: "actor", header: "Actor", cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.actor}</span> },
  { accessorKey: "requestId", header: "Request", cell: ({ row }) => <span className="truncate text-sm text-muted-foreground">{row.original.requestId || "Not recorded"}</span> },
  { accessorKey: "outcome", header: "Outcome", cell: ({ row }) => <AuditOutcomeBadge outcome={row.original.outcome} /> },
]

const subscriptionColumns: ColumnDef<SubscriptionRow>[] = [
  { accessorKey: "tenant", header: "Subscription", cell: ({ row }) => <div className="min-w-56"><p className="truncate font-medium">{row.original.tenant}</p><p className="mt-1 truncate text-sm text-muted-foreground">{row.original.id} · period ends {row.original.periodEnd ? new Date(row.original.periodEnd).toLocaleDateString() : "not scheduled"}</p></div> },
  { accessorKey: "plan", header: "Plan", cell: ({ row }) => <span className="text-sm capitalize">{row.original.plan}</span> },
  { accessorKey: "provider", header: "Provider", cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.provider}</span> },
  { accessorKey: "status", header: "Status", cell: ({ row }) => <BillingStatusBadge status={row.original.status} /> },
]

const creditPurchaseColumns: ColumnDef<CreditPurchaseRow>[] = [
  { accessorKey: "tenant", header: "Credit purchase", cell: ({ row }) => <div className="min-w-56"><p className="truncate font-medium">{row.original.tenant}</p><p className="mt-1 truncate text-sm text-muted-foreground">{row.original.pack} · {row.original.provider} · {row.original.createdAt}</p></div> },
  { accessorKey: "amount", header: "Amount", cell: ({ row }) => <span className="text-sm tabular-nums">{row.original.amount}</span> },
  { accessorKey: "status", header: "Status", cell: ({ row }) => <BillingStatusBadge status={row.original.status} /> },
]

const creditRefundColumns: ColumnDef<CreditRefundRow>[] = [
  { accessorKey: "tenant", header: "Refund case", cell: ({ row }) => <div className="min-w-52"><p className="font-medium">{row.original.tenant}</p><p className="mt-1 text-sm text-muted-foreground">{row.original.purchaseId} · {row.original.provider}</p></div> },
  { accessorKey: "amount", header: "Amount", cell: ({ row }) => <span className="text-sm tabular-nums">{row.original.amount}</span> },
  { accessorKey: "status", header: "Refund state", cell: ({ row }) => <BillingStatusBadge status={row.original.status} /> },
  { accessorKey: "reason", header: "Request reason", cell: ({ row }) => <span className="max-w-64 text-sm text-muted-foreground">{row.original.reason || "Not provided"}</span> },
]

const creditDisputeColumns: ColumnDef<CreditDisputeRow>[] = [
  { accessorKey: "tenant", header: "Dispute case", cell: ({ row }) => <div className="min-w-52"><p className="font-medium">{row.original.tenant}</p><p className="mt-1 text-sm text-muted-foreground">{row.original.purchaseId} · {row.original.provider}</p></div> },
  { accessorKey: "amount", header: "Amount", cell: ({ row }) => <span className="text-sm tabular-nums">{row.original.amount}</span> },
  { accessorKey: "providerDisputeId", header: "Provider reference", cell: ({ row }) => <span className="font-mono text-xs">{row.original.providerDisputeId}</span> },
  { accessorKey: "consumedExposureUnits", header: "Used credits", cell: ({ row }) => <span className="text-sm tabular-nums">{row.original.consumedExposureUnits.toLocaleString()}</span> },
  { accessorKey: "status", header: "Dispute state", cell: ({ row }) => <BillingStatusBadge status={row.original.status} /> },
]

function ModerationStatusBadge({ status }: { status: ModerationReportRow["status"] | RatingDisputeRow["status"] }) {
  if (status === "resolved") return <Badge variant="success">Resolved</Badge>
  if (status === "dismissed") return <Badge variant="secondary">Dismissed</Badge>
  if (status === "reviewing") return <Badge variant="warning">Reviewing</Badge>
  return <Badge variant="destructive">Open</Badge>
}

const moderationReportColumns: ColumnDef<ModerationReportRow>[] = [
  { accessorKey: "campaignTitle", header: "Campaign report", cell: ({ row }) => <div className="min-w-64"><p className="truncate font-medium">{row.original.campaignTitle}</p><p className="mt-1 truncate text-sm text-muted-foreground">{row.original.id} · campaign {row.original.campaignId}</p><p className="mt-1 text-xs text-muted-foreground">{row.original.details || "No reporter detail"}</p></div> },
  { accessorKey: "category", header: "Category", cell: ({ row }) => <span className="text-sm capitalize">{row.original.category.replaceAll("_", " ")}</span> },
  { accessorKey: "reporter", header: "Reporter", cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.reporter}</span> },
  { accessorKey: "createdAt", header: "Created", cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.createdAt}</span> },
  { accessorKey: "status", header: "State", cell: ({ row }) => <ModerationStatusBadge status={row.original.status} /> },
]

const ratingDisputeColumns: ColumnDef<RatingDisputeRow>[] = [
  { accessorKey: "ratingType", header: "Rating dispute", cell: ({ row }) => <div className="min-w-56"><p className="font-medium capitalize">{row.original.ratingType.replaceAll("_", " ")}</p><p className="mt-1 text-sm text-muted-foreground">{row.original.id} · rating {row.original.ratingId}</p></div> },
  { accessorKey: "reason", header: "Reason", cell: ({ row }) => <span className="min-w-64 text-sm">{row.original.reason}</span> },
  { accessorKey: "reporter", header: "Reporter", cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.reporter}</span> },
  { accessorKey: "createdAt", header: "Created", cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.createdAt}</span> },
  { accessorKey: "status", header: "State", cell: ({ row }) => <ModerationStatusBadge status={row.original.status} /> },
]

function Moderation({ moderation, canManage, onPreview, onExecute }: { moderation: PlatformModerationReadModel; canManage: boolean; onPreview: (action: "moderation.campaign_report.status" | "moderation.rating_dispute.resolve", targetId: string, payload: Record<string, string>, reason: string) => Promise<ModerationPreview>; onExecute: (preview: ModerationPreview, action: ModerationAction, reason: string) => Promise<void> }) {
  const [selectedAction, setSelectedAction] = useState<ModerationAction | null>(null)
  const [reason, setReason] = useState("")
  const [preview, setPreview] = useState<ModerationPreview | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reset = () => {
    if (pending) return
    setSelectedAction(null)
    setReason("")
    setPreview(null)
    setError(null)
  }
  const openReportAction = (row: ModerationReportRow) => { setSelectedAction({ kind: "report", row, status: row.status === "open" ? "reviewing" : "resolved" }); setReason(""); setPreview(null); setError(null) }
  const openDisputeAction = (row: RatingDisputeRow) => { setSelectedAction({ kind: "dispute", row, status: "resolved", moderationStatus: "hidden" }); setReason(""); setPreview(null); setError(null) }
  const createPreview = async () => {
    if (!selectedAction) return
    const cleanReason = reason.trim()
    if (cleanReason.length < 8 || cleanReason.length > 500) { setError("Enter a clear audit reason between 8 and 500 characters."); return }
    setPending(true)
    setError(null)
    try {
      const action = selectedAction.kind === "report" ? "moderation.campaign_report.status" : "moderation.rating_dispute.resolve"
      const payload: Record<string, string> = selectedAction.kind === "report" ? { status: selectedAction.status } : { status: selectedAction.status, moderationStatus: selectedAction.moderationStatus }
      setPreview(await onPreview(action, selectedAction.row.id, payload, cleanReason))
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to create the moderation preview.")
    } finally {
      setPending(false)
    }
  }
  const execute = async () => {
    if (!selectedAction || !preview) return
    setPending(true)
    setError(null)
    try {
      await onExecute(preview, selectedAction, reason.trim())
      setPending(false)
      reset()
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to apply the moderation action.")
      setPending(false)
    }
  }

  return <div className="grid gap-5"><div className="grid gap-1"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">Governance</p><div className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Moderation</h1><p className="mt-1 max-w-2xl text-muted-foreground">Triage campaign reports and rating disputes with explicit review state and audit-safe context.</p></div><Button variant="outline" className="w-fit gap-2" onClick={requestPlatformRefresh}>Refresh queue <Activity data-icon="inline-start" /></Button></div></div><div className="grid gap-3 sm:grid-cols-3">{moderation.metrics.map((metric) => <MetricCard key={metric.label} {...metric} />)}</div><section className="grid gap-0"><div className="flex flex-col justify-between gap-2 border-y py-4 md:flex-row md:items-end"><div><h2 className="text-lg font-semibold">Campaign reports</h2><p className="text-sm text-muted-foreground">Reports on organizer campaigns and public content.</p></div><Badge variant="secondary">{moderation.campaignReports.length} in view</Badge></div><PlatformDataTable columns={moderationReportColumns} data={moderation.campaignReports} emptyMessage="No campaign reports in scope." tableClassName="min-w-[1060px]" searchColumn="campaignTitle" searchPlaceholder="Search campaign reports…" rowActions={(row) => canManage && ["open", "reviewing"].includes(row.status) ? <Button variant="outline" size="sm" onClick={() => openReportAction(row)}>{row.status === "open" ? "Review" : "Resolve"}</Button> : <span className="text-xs text-muted-foreground">Read-only</span>} /></section><section className="grid gap-0"><div className="flex flex-col justify-between gap-2 border-y py-4 md:flex-row md:items-end"><div><h2 className="text-lg font-semibold">Rating disputes</h2><p className="text-sm text-muted-foreground">Disputes that can change public visibility or trust state.</p></div><Badge variant="secondary">{moderation.ratingDisputes.length} in view</Badge></div><PlatformDataTable columns={ratingDisputeColumns} data={moderation.ratingDisputes} emptyMessage="No rating disputes in scope." tableClassName="min-w-[1000px]" searchColumn="reason" searchPlaceholder="Search disputes…" rowActions={(row) => canManage && ["open", "reviewing"].includes(row.status) ? <Button variant="outline" size="sm" onClick={() => openDisputeAction(row)}>Resolve</Button> : <span className="text-xs text-muted-foreground">Read-only</span>} /></section><Alert><ShieldCheck /><AlertTitle>Moderation guardrail</AlertTitle><AlertDescription>Only active reports and disputes expose actions. Every change requires a server preview, recent MFA assurance, a confirmation token, and an audit reason.</AlertDescription></Alert>
    <Dialog open={Boolean(selectedAction)} onOpenChange={(open) => { if (!open) reset() }}><DialogContent><DialogHeader><DialogTitle>{preview ? "Confirm moderation action" : "Preview moderation action"}</DialogTitle><DialogDescription>{preview ? "Review the server-issued state transition before applying it." : "Create a server preview before changing moderation state."}</DialogDescription></DialogHeader>{selectedAction ? <div className="grid gap-3"><div className="grid gap-1 rounded-md border bg-muted/30 p-3 text-sm"><span className="font-medium">{selectedAction.kind === "report" ? selectedAction.row.campaignTitle : `${selectedAction.row.ratingType.replaceAll("_", " ")} · ${selectedAction.row.ratingId}`}</span><span className="text-muted-foreground">{selectedAction.kind === "report" ? `${selectedAction.row.id} · current state ${selectedAction.row.status}` : `${selectedAction.row.id} · current state ${selectedAction.row.status}`}</span></div>{selectedAction.kind === "report" ? <div className="grid gap-2"><span className="text-sm font-medium">Next state</span><div className="grid gap-2 sm:grid-cols-3">{(["reviewing", "resolved", "dismissed"] as const).map((status) => <Button key={status} type="button" variant={selectedAction.status === status ? "secondary" : "outline"} size="sm" onClick={() => { setSelectedAction({ ...selectedAction, status }); setPreview(null) }} disabled={pending}>{status.replaceAll("_", " ")}</Button>)}</div></div> : <div className="grid gap-3"><div className="grid gap-2"><span className="text-sm font-medium">Decision</span><div className="grid gap-2 sm:grid-cols-2">{(["resolved", "dismissed"] as const).map((status) => <Button key={status} type="button" variant={selectedAction.status === status ? "secondary" : "outline"} size="sm" onClick={() => { setSelectedAction({ ...selectedAction, status }); setPreview(null) }} disabled={pending}>{status}</Button>)}</div></div><div className="grid gap-2"><span className="text-sm font-medium">Public visibility</span><div className="grid gap-2 sm:grid-cols-2">{(["active", "hidden"] as const).map((moderationStatus) => <Button key={moderationStatus} type="button" variant={selectedAction.moderationStatus === moderationStatus ? "secondary" : "outline"} size="sm" onClick={() => { setSelectedAction({ ...selectedAction, moderationStatus }); setPreview(null) }} disabled={pending}>{moderationStatus}</Button>)}</div></div></div>}<div className="grid gap-2"><label htmlFor="moderation-action-reason" className="text-sm font-medium">Audit reason</label><Textarea id="moderation-action-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Example: evidence reviewed and state updated per policy" maxLength={500} disabled={pending || Boolean(preview)} /><p className="text-xs text-muted-foreground">Required. This reason is written to the security audit record.</p></div>{preview ? <div className="grid gap-1 rounded-md border border-brand/30 bg-brand/5 p-3 text-sm"><span className="font-medium">Server preview ready</span><span className="text-muted-foreground">Revision: {preview.revision}</span><span className="text-muted-foreground">MFA assurance is required before execution.</span></div> : null}{error ? <p className="text-sm text-destructive">{error}</p> : null}</div> : null}<DialogFooter><Button variant="outline" onClick={reset} disabled={pending}>Cancel</Button>{preview ? <Button variant="destructive" onClick={execute} disabled={pending}>{pending ? "Applying…" : "Confirm action"}</Button> : <Button onClick={createPreview} disabled={pending}>{pending ? "Previewing…" : "Create preview"}</Button>}</DialogFooter></DialogContent></Dialog></div>
}

function ReleaseStateBadge({ state }: { state: PlatformReleaseSurfaceState }) {
  if (state === "ready") return <Badge variant="success"><CheckCircle2 data-icon="inline-start" /> Ready</Badge>
  if (state === "review") return <Badge variant="warning">Review</Badge>
  if (state === "blocked") return <Badge variant="destructive">Blocked</Badge>
  return <Badge variant="secondary">Unknown</Badge>
}

const releaseSurfaceColumns: ColumnDef<ReleaseSurfaceRow>[] = [
  { accessorKey: "surface", header: "Surface", cell: ({ row }) => <div className="min-w-56"><p className="font-medium">{row.original.surface}</p><p className="mt-1 text-sm capitalize text-muted-foreground">{row.original.environment}</p></div> },
  { accessorKey: "signal", header: "Signal", cell: ({ row }) => <span className="min-w-56 text-sm">{row.original.signal}</span> },
  { accessorKey: "evidence", header: "Evidence", cell: ({ row }) => <div className="min-w-72"><p className="text-sm">{row.original.evidence}</p><p className="mt-1 text-xs text-muted-foreground">Observed: {row.original.observedAt}</p></div> },
  { accessorKey: "nextAction", header: "Next action", cell: ({ row }) => <span className="min-w-64 text-sm text-muted-foreground">{row.original.nextAction}</span> },
  { accessorKey: "state", header: "State", cell: ({ row }) => <ReleaseStateBadge state={row.original.state} /> },
]

function ReleaseReadiness({ readiness }: { readiness: PlatformReleaseReadinessReadModel }) {
  return <div className="grid gap-5"><div className="grid gap-1"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">Trust</p><div className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Release readiness</h1><p className="mt-1 max-w-2xl text-muted-foreground">One evidence boundary for the Platform web app, API, Sandbox clients, and mobile push.</p></div><Button variant="outline" className="w-fit gap-2" onClick={requestPlatformRefresh}>Refresh observations <Rocket data-icon="inline-start" /></Button></div></div><div className="grid gap-3 sm:grid-cols-3">{readiness.metrics.map((metric) => <MetricCard key={metric.label} {...metric} />)}</div><PlatformDataTable columns={releaseSurfaceColumns} data={readiness.surfaces} emptyMessage="No release surfaces in scope." tableClassName="min-w-[1180px]" stickyColumnId="state" searchColumn="surface" searchPlaceholder="Search surfaces…" /><section className="grid gap-0 border-y"><div className="flex flex-col justify-between gap-2 border-b py-4 md:flex-row md:items-end"><div><h2 className="text-lg font-semibold">Release controls</h2><p className="text-sm text-muted-foreground">Configuration flags are shown as posture, never as a substitute for deployment evidence.</p></div><Badge variant="secondary">{readiness.controls.filter((control) => control.enabled).length} enabled</Badge></div><div className="grid gap-0 sm:grid-cols-2">{readiness.controls.map((control) => <div className="flex items-start justify-between gap-4 border-b py-4 sm:px-4 sm:even:border-l" key={`${control.environment}-${control.label}`}><div className="grid gap-1"><span className="text-sm font-medium">{control.label}</span><span className="text-xs capitalize text-muted-foreground">{control.environment} · {control.detail}</span></div><Badge variant={control.enabled ? "success" : "secondary"}>{control.enabled ? "Enabled" : "Disabled"}</Badge></div>)}</div></section><Alert><ShieldCheck /><AlertTitle>Evidence boundary</AlertTitle><AlertDescription>Configured origins, distribution links, and release flags do not prove a deployed build, tester access, physical-device installation, authenticated live flow, or successful push delivery. Those remain explicit follow-up checks.</AlertDescription></Alert></div>
}

function Overview({ overview, health, viewer }: { overview: PlatformOverviewReadModel; health: PlatformServiceHealthReadModel; viewer: PlatformViewerContext }) {
  return (
    <div className="grid gap-5">
    <div className="grid gap-1"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">Global Platform</p><div className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Welcome, {viewer.user.displayName}</h1><p className="mt-1 text-muted-foreground">Here’s what needs attention across GetPrio.</p></div><Badge variant="outline" className="w-fit">All tenants <ChevronDown data-icon="inline-end" /></Badge></div></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{overview.metrics.map((metric) => <MetricCard key={metric.label} {...metric} visual={metricVisuals[metric.label]} />)}</div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,.85fr)]">
        <div className="grid min-w-0 gap-5">
          <Card className="shadow-none"><CardHeader><CardTitle>Operational activity</CardTitle><CardDescription>Cross-surface audit events · last 14 days · UTC</CardDescription><CardAction><Button variant="link" size="sm" onClick={() => navigateToRoute("Security audit")}>View report <ArrowUpRight data-icon="inline-end" /></Button></CardAction></CardHeader><CardContent className="pl-1 sm:pl-3"><ChartContainer config={chartConfig} className="h-[260px] w-full"><AreaChart accessibilityLayer data={overview.activity} margin={{ left: 8, right: 12, top: 10, bottom: 0 }}><defs><linearGradient id="fillAuditEvents" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--color-events)" stopOpacity={0.28} /><stop offset="95%" stopColor="var(--color-events)" stopOpacity={0} /></linearGradient><linearGradient id="fillSuccessfulEvents" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--color-successfulEvents)" stopOpacity={0.2} /><stop offset="95%" stopColor="var(--color-successfulEvents)" stopOpacity={0} /></linearGradient></defs><CartesianGrid vertical={false} /><XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} /><YAxis hide /><ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} /><Area dataKey="events" type="natural" fill="url(#fillAuditEvents)" stroke="var(--color-events)" strokeWidth={2} /><Area dataKey="successfulEvents" type="natural" fill="url(#fillSuccessfulEvents)" stroke="var(--color-successfulEvents)" strokeWidth={2} /></AreaChart></ChartContainer></CardContent></Card>
          <Card className="shadow-none"><CardHeader><CardTitle>Recent Platform activity</CardTitle><CardDescription>Global scope · latest security audit events</CardDescription><CardAction><Button variant="link" size="sm" onClick={() => navigateToRoute("Security audit")}>Open audit <ArrowUpRight data-icon="inline-end" /></Button></CardAction></CardHeader><CardContent className="p-0"><PlatformTableViewport><Table><TableHeader><TableRow><TableHead>Event</TableHead><TableHead>Scope</TableHead><TableHead>State</TableHead><TableHead>Time</TableHead></TableRow></TableHeader><TableBody>{overview.recentActivity.length ? overview.recentActivity.map((activity) => <TableRow key={activity.id}><TableCell className="font-medium">{activity.event}</TableCell><TableCell className="text-muted-foreground">{activity.scope}</TableCell><TableCell><StatusBadge status={activity.status} /></TableCell><TableCell className="text-muted-foreground">{activity.occurredAt}</TableCell></TableRow>) : <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">No recent audit activity.</TableCell></TableRow>}</TableBody></Table></PlatformTableViewport></CardContent></Card>
        </div>
        <div className="grid content-start gap-5">
          <Card className="shadow-none"><CardHeader><CardTitle>Needs attention</CardTitle><CardDescription>Current read-model items</CardDescription></CardHeader><CardContent className="grid gap-0 p-0">{overview.attentionItems.length ? overview.attentionItems.map((item) => <div className="flex items-start justify-between gap-3 border-t px-4 py-3" key={item.id}><div className="grid gap-1"><span className="text-sm font-medium">{item.title}</span><span className="text-xs text-muted-foreground">{item.detail}</span></div><SeverityBadge item={item} /></div>) : <p className="border-t px-4 py-6 text-sm text-muted-foreground">No current attention items.</p>}</CardContent></Card>
          <Card className="shadow-none"><CardHeader><CardTitle>Service health</CardTitle><CardDescription>Observed status · not deployment proof</CardDescription><CardAction><Button variant="link" size="sm" onClick={() => navigateToRoute("Service health")}>Open health <ArrowUpRight data-icon="inline-end" /></Button></CardAction></CardHeader><CardContent className="grid gap-0 p-0">{health.services.slice(0, 3).map((service) => <div className="flex items-center justify-between gap-3 border-t px-4 py-3" key={service.id}><div className="min-w-0"><p className="truncate text-sm font-medium">{service.name}</p><p className="truncate text-xs text-muted-foreground">{service.evidence}</p></div><ServiceStateBadge state={service.state} /></div>)}</CardContent></Card>
          <Alert><ShieldCheck /><AlertTitle>Evidence boundary</AlertTitle><AlertDescription>Overview indicators summarize current read-model observations. They do not replace the detailed records or prove deployment, delivery, or device state.</AlertDescription></Alert>
        </div>
      </div>
    </div>
  )
}

function DeveloperProjects({ project, projects, selectedProjectId, onProjectChange, projectLoading, onWebhookAction, onDeveloperApprovalReview, onSandboxAction, onRateLimitUpdate, onRevokeApiKey }: { project: DeveloperProjectGovernanceReadModel; projects: DeveloperProjectSummary[]; selectedProjectId: string; onProjectChange: (projectId: string) => void; projectLoading: boolean; onWebhookAction: (action: "suspend" | "reinstate", reason: string) => Promise<void>; onDeveloperApprovalReview: (submissionId: string, status: "approved" | "changes_requested" | "rejected", feedback: string) => Promise<void>; onSandboxAction: (action: "create" | "reset", accountId?: string) => Promise<SandboxCredentialResult>; onRateLimitUpdate: (environment: "sandbox" | "production", readLimitPerMinute: number, writeLimitPerMinute: number, reason: string) => Promise<void>; onRevokeApiKey: (projectId: string, keyId: string, reason: string) => Promise<{ key: Pick<PlatformDeveloperApiKey, "id" | "status" | "revokedAt" | "revokeReason"> }> }) {
  const approvalLabel = project.productionApproval === "in-review" ? "In review" : project.productionApproval.replaceAll("-", " ")
  const webhookHealthy = project.webhookHealth.state === "healthy"
  const webhookSuspended = project.webhookHealth.state === "suspended"
  const [webhookDialogOpen, setWebhookDialogOpen] = useState(false)
  const [webhookAction, setWebhookAction] = useState<"suspend" | "reinstate">("suspend")
  const [webhookReason, setWebhookReason] = useState("")
  const [webhookActionError, setWebhookActionError] = useState<string | null>(null)
  const [webhookActionPending, setWebhookActionPending] = useState(false)
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false)
  const [reviewStatus, setReviewStatus] = useState<"approved" | "changes_requested" | "rejected">("approved")
  const [reviewFeedback, setReviewFeedback] = useState("")
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [reviewPending, setReviewPending] = useState(false)
  const [sandboxDialogOpen, setSandboxDialogOpen] = useState(false)
  const [sandboxAction, setSandboxAction] = useState<"create" | "reset">("create")
  const [sandboxActionError, setSandboxActionError] = useState<string | null>(null)
  const [sandboxActionPending, setSandboxActionPending] = useState(false)
  const [sandboxCredentials, setSandboxCredentials] = useState<SandboxCredentialResult | null>(null)
  const [rateLimitDialogOpen, setRateLimitDialogOpen] = useState(false)
  const [rateLimitEnvironment, setRateLimitEnvironment] = useState<"sandbox" | "production">("production")
  const [rateLimitRead, setRateLimitRead] = useState("")
  const [rateLimitWrite, setRateLimitWrite] = useState("")
  const [rateLimitReason, setRateLimitReason] = useState("")
  const [rateLimitError, setRateLimitError] = useState<string | null>(null)
  const [rateLimitPending, setRateLimitPending] = useState(false)
  const [apiKeyReview, setApiKeyReview] = useState<PlatformDeveloperApiKeyReview | null>(null)
  const [apiKeyReviewFailure, setApiKeyReviewFailure] = useState<{ projectId: string; message: string } | null>(null)
  const apiKeyReviewError = apiKeyReviewFailure?.projectId === selectedProjectId ? apiKeyReviewFailure.message : null
  const apiKeyReviewLoading = apiKeyReview?.project.id !== selectedProjectId && !apiKeyReviewError
  const [apiKeyToRevoke, setApiKeyToRevoke] = useState<PlatformDeveloperApiKey | null>(null)
  const [apiKeyRevokeReason, setApiKeyRevokeReason] = useState("")
  const [apiKeyRevokeError, setApiKeyRevokeError] = useState<string | null>(null)
  const [apiKeyRevokePending, setApiKeyRevokePending] = useState(false)
  const [detailsProject, setDetailsProject] = useState<DeveloperProjectSummary | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  useEffect(() => {
    let mounted = true
    platformApi.getDeveloperApiKeys(selectedProjectId).then((review) => {
      if (mounted) {
        setApiKeyReview(review)
        setApiKeyReviewFailure((current) => current?.projectId === selectedProjectId ? null : current)
      }
    }).catch((loadError) => {
      if (mounted) setApiKeyReviewFailure({ projectId: selectedProjectId, message: loadError instanceof Error ? loadError.message : "API key activity is unavailable." })
    })
    return () => { mounted = false }
  }, [selectedProjectId])
  const projectColumns = useMemo<ColumnDef<DeveloperProjectSummary>[]>(() => [
    { accessorKey: "name", header: "Project", cell: ({ row }) => <div className="grid gap-1"><span className="font-medium">{row.original.name}</span><span className="font-mono text-xs text-muted-foreground">{row.original.id}</span></div> },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <Badge variant={row.original.status === "active" ? "success" : "secondary"}>{row.original.status}</Badge> },
    { accessorKey: "productionApproval", header: "Production approval", cell: ({ row }) => <Badge variant={row.original.productionApproval === "approved" ? "success" : row.original.productionApproval === "in-review" ? "warning" : row.original.productionApproval === "changes-requested" ? "destructive" : "secondary"}>{row.original.productionApproval.replaceAll("-", " ")}</Badge> },
  ], [])

  const openProjectDetails = (item: DeveloperProjectSummary) => {
    if (projectLoading) return
    setDetailsProject(item)
    setDetailsOpen(true)
    if (item.id !== selectedProjectId) onProjectChange(item.id)
  }

  const openWebhookDialog = (action: "suspend" | "reinstate") => {
    setWebhookAction(action)
    setWebhookReason("")
    setWebhookActionError(null)
    setWebhookDialogOpen(true)
  }

  const submitWebhookAction = async () => {
    const reason = webhookReason.trim()
    if (!reason) {
      setWebhookActionError("A reason is required for the audit record.")
      return
    }
    setWebhookActionPending(true)
    setWebhookActionError(null)
    try {
      await onWebhookAction(webhookAction, reason)
      setWebhookDialogOpen(false)
    } catch (actionError) {
      setWebhookActionError(actionError instanceof Error ? actionError.message : "The Platform action could not be completed.")
    } finally {
      setWebhookActionPending(false)
    }
  }

  const openReviewDialog = () => {
    setReviewStatus("approved")
    setReviewFeedback("")
    setReviewError(null)
    setReviewDialogOpen(true)
  }

  const submitReview = async () => {
    const submissionId = project.productionApprovalDetail.pendingSubmissionId
    const feedback = reviewFeedback.trim()
    if (!submissionId) {
      setReviewError("There is no pending production submission to review.")
      return
    }
    if (reviewStatus !== "approved" && !feedback) {
      setReviewError("Feedback is required when requesting changes or rejecting a submission.")
      return
    }
    setReviewPending(true)
    setReviewError(null)
    try {
      await onDeveloperApprovalReview(submissionId, reviewStatus, feedback)
      setReviewDialogOpen(false)
    } catch (actionError) {
      setReviewError(actionError instanceof Error ? actionError.message : "The production review could not be completed.")
    } finally {
      setReviewPending(false)
    }
  }

  const openSandboxDialog = (action: "create" | "reset") => {
    setSandboxAction(action)
    setSandboxActionError(null)
    setSandboxDialogOpen(true)
  }

  const openRateLimitDialog = (environment: "sandbox" | "production") => {
    const limits = project.rateLimits[environment]
    setRateLimitEnvironment(environment)
    setRateLimitRead(String(limits.readLimitPerMinute))
    setRateLimitWrite(String(limits.writeLimitPerMinute))
    setRateLimitReason("")
    setRateLimitError(null)
    setRateLimitDialogOpen(true)
  }

  const submitRateLimit = async () => {
    const readLimit = Number(rateLimitRead)
    const writeLimit = Number(rateLimitWrite)
    const reason = rateLimitReason.trim()
    if (!Number.isSafeInteger(readLimit) || readLimit < 1 || readLimit > 100000 || !Number.isSafeInteger(writeLimit) || writeLimit < 1 || writeLimit > 100000) {
      setRateLimitError("Read and write limits must be whole numbers from 1 to 100,000.")
      return
    }
    if (!reason) {
      setRateLimitError("A reason is required for the audit record.")
      return
    }
    setRateLimitPending(true)
    setRateLimitError(null)
    try {
      await onRateLimitUpdate(rateLimitEnvironment, readLimit, writeLimit, reason)
      setRateLimitDialogOpen(false)
    } catch (actionError) {
      setRateLimitError(actionError instanceof Error ? actionError.message : "The rate limit update could not be completed.")
    } finally {
      setRateLimitPending(false)
    }
  }

  const submitApiKeyRevocation = async () => {
    const key = apiKeyToRevoke
    const reason = apiKeyRevokeReason.trim()
    if (!key) return
    if (reason.length < 8 || reason.length > 500) {
      setApiKeyRevokeError("Enter an audit reason between 8 and 500 characters.")
      return
    }
    setApiKeyRevokePending(true)
    setApiKeyRevokeError(null)
    try {
      const result = await onRevokeApiKey(selectedProjectId, key.id, reason)
      setApiKeyReview((current) => current ? { ...current, keys: current.keys.map((item) => item.id === key.id ? { ...item, ...result.key } : item) } : current)
      setApiKeyToRevoke(null)
      setApiKeyRevokeReason("")
    } catch (revokeError) {
      setApiKeyRevokeError(revokeError instanceof Error ? revokeError.message : "The API key could not be revoked.")
    } finally {
      setApiKeyRevokePending(false)
    }
  }

  const submitSandboxAction = async () => {
    if (sandboxAction === "reset" && !project.sandboxAccounts.appleReviewAccount?.id) {
      setSandboxActionError("The Apple review account is no longer available. Refresh the project and try again.")
      return
    }
    setSandboxActionPending(true)
    setSandboxActionError(null)
    try {
      const result = await onSandboxAction(sandboxAction, project.sandboxAccounts.appleReviewAccount?.id)
      setSandboxCredentials(result)
      setSandboxDialogOpen(false)
    } catch (actionError) {
      setSandboxActionError(actionError instanceof Error ? actionError.message : "The Sandbox account action could not be completed.")
    } finally {
      setSandboxActionPending(false)
    }
  }

  return (
    <div className="grid gap-5">
      <div className="grid gap-1"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">Developer API</p><div className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Developer projects</h1><p className="mt-1 text-muted-foreground">Governance and readiness across environments, credentials, and delivery.</p></div><Button variant="outline" className="w-fit gap-2" onClick={requestPlatformRefresh}>Refresh project <Activity data-icon="inline-start" /></Button></div></div>
      <section className="grid gap-3"><div><h2 className="text-lg font-semibold">Projects</h2><p className="text-sm text-muted-foreground">Select a project to review its governance and readiness details.</p></div><PlatformDataTable columns={projectColumns} data={projects} emptyMessage="No Developer API projects in scope." tableClassName="min-w-[640px]" searchColumn="name" searchPlaceholder="Search projects…" onRowClick={openProjectDetails} getRowLabel={(item) => `Open details for ${item.name}`} isRowSelected={(item) => item.id === (detailsProject?.id ?? selectedProjectId)} /></section>
      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}><SheetContent side="right" className="gap-0 overflow-y-auto p-0"><SheetHeader className="sticky top-0 z-10 border-b bg-popover pr-12"><SheetTitle>{detailsProject?.name ?? "Project details"}</SheetTitle><SheetDescription>{detailsProject?.id ?? "Loading project details…"}</SheetDescription></SheetHeader>{detailsProject ? <div className="grid gap-5 p-4">{projectLoading || project.projectId !== detailsProject.id ? <p className="py-8 text-center text-sm text-muted-foreground">Loading project details…</p> : <><div className="grid gap-3"><div className="flex items-center justify-between gap-3"><span className="text-sm text-muted-foreground">Project status</span><Badge variant={detailsProject.status === "active" ? "success" : "secondary"}>{detailsProject.status}</Badge></div><div className="flex items-center justify-between gap-3"><span className="text-sm text-muted-foreground">Production approval</span><Badge variant={project.productionApproval === "approved" ? "success" : project.productionApproval === "in-review" ? "warning" : project.productionApproval === "changes-requested" ? "destructive" : "secondary"}>{project.productionApproval.replaceAll("-", " ")}</Badge></div><div className="flex items-center justify-between gap-3"><span className="text-sm text-muted-foreground">Owner</span><span className="text-right text-sm">{project.owner}</span></div></div><section className="grid gap-3"><h3 className="text-sm font-semibold">Environment readiness</h3>{project.environments.map((environment) => <div key={environment.name} className="flex items-center justify-between gap-3 rounded-md border p-3"><div className="grid gap-1"><span className="text-sm font-medium capitalize">{environment.name}</span><span className="text-xs text-muted-foreground">Observed {environment.lastObservedAt}</span></div><Badge variant={environment.readiness === "ready" ? "success" : environment.readiness === "blocked" ? "destructive" : "warning"}>{environment.readiness.replaceAll("-", " ")}</Badge></div>)}</section><section className="grid gap-3"><h3 className="text-sm font-semibold">Webhook delivery</h3><div className="flex items-center justify-between gap-3 rounded-md border p-3"><span className="text-sm text-muted-foreground">Health</span><Badge variant={project.webhookHealth.state === "healthy" ? "success" : project.webhookHealth.state === "suspended" ? "destructive" : "warning"}>{project.webhookHealth.state}</Badge></div><div className="grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-md bg-muted p-2"><span className="block text-base font-semibold">{project.webhookHealth.deliveryStats.sent}</span>sent</div><div className="rounded-md bg-muted p-2"><span className="block text-base font-semibold">{project.webhookHealth.deliveryStats.failed}</span>failed</div><div className="rounded-md bg-muted p-2"><span className="block text-base font-semibold">{project.webhookHealth.deliveryStats.pending}</span>pending</div></div></section></>}</div> : null}</SheetContent></Sheet>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-y py-3 text-sm"><span className="font-semibold">{project.projectName}</span><span className="text-muted-foreground">{project.projectId}</span><span className="text-muted-foreground">Owner: {project.owner}</span><Badge variant="secondary">Authenticated read model</Badge></div>
      <div className="grid gap-3 md:grid-cols-3"><Card size="sm" className="shadow-none"><CardHeader className="pb-1"><CardDescription>Production approval</CardDescription></CardHeader><CardContent><div className="text-2xl font-semibold tracking-tight">{approvalLabel}</div><p className="text-xs text-muted-foreground">Review state is separate from deploy state.</p></CardContent></Card><Card size="sm" className="shadow-none"><CardHeader className="pb-1"><CardDescription>Sandbox accounts</CardDescription></CardHeader><CardContent className="grid gap-2"><div className="text-2xl font-semibold tracking-tight">{project.sandboxAccounts.active} / {project.sandboxAccounts.limit}</div><p className="text-xs text-muted-foreground">Apple review: {project.sandboxAccounts.appleReview}</p>{project.sandboxAccounts.appleReviewAccount ? <Button variant="outline" size="sm" className="w-fit" onClick={() => openSandboxDialog("reset")}>Reset credentials</Button> : <Button variant="outline" size="sm" className="w-fit" onClick={() => openSandboxDialog("create")}>Create review account</Button>}</CardContent></Card><Card size="sm" className="shadow-none"><CardHeader className="pb-1"><CardDescription>Webhook health</CardDescription></CardHeader><CardContent><div className="flex items-center gap-2 text-2xl font-semibold tracking-tight">{webhookHealthy ? <CheckCircle2 className="size-5 text-emerald-600" /> : <AlertTriangle className="size-5 text-brand" />}{project.webhookHealth.state}</div><p className="text-xs text-muted-foreground">Observed {project.webhookHealth.lastObservedAt}</p></CardContent></Card></div>
      <Tabs defaultValue="environments" className="w-full">
        <TabsList variant="line" className="grid h-12 w-full grid-cols-3 gap-2 rounded-none p-0 sm:flex sm:w-fit">
          <TabsTrigger size="lg" value="environments">Environments</TabsTrigger>
          <TabsTrigger size="lg" value="webhooks">Webhooks</TabsTrigger>
          <TabsTrigger size="lg" value="governance">Governance</TabsTrigger>
        </TabsList>
        <TabsContent value="governance" className="mt-4">
          <section className="grid gap-0 border-y"><div className="border-b py-4"><h2 className="text-lg font-semibold">Control posture</h2><p className="text-sm text-muted-foreground">Evidence needed before a privileged Developer API action is confirmed.</p></div><div className="grid gap-0 md:grid-cols-2"><div className="grid gap-3 border-b py-4 md:border-r md:px-4"><div className="grid gap-1"><span className="text-sm font-medium">Production submission</span><span className="text-xs text-muted-foreground">{project.productionApprovalDetail.pendingSubmissionId ? `Pending submission ${project.productionApprovalDetail.pendingSubmissionId}` : "No pending submission"}</span>{project.productionApprovalDetail.lastFeedback ? <span className="text-xs text-brand">Latest reviewer feedback: {project.productionApprovalDetail.lastFeedback}</span> : null}</div>{project.productionApprovalDetail.pendingSubmissionId ? <Button variant="outline" size="sm" className="w-fit" onClick={openReviewDialog}>Review submission</Button> : null}</div><div className="grid gap-3 border-b py-4 md:px-4"><div className="grid gap-1"><span className="text-sm font-medium">Production webhooks</span><span className="text-xs text-muted-foreground">{webhookSuspended ? `Suspended: ${project.webhookHealth.suspension?.reason || "No reason recorded"}` : "Delivery is not currently suspended."}</span></div><Button variant={webhookSuspended ? "outline" : "destructive"} size="sm" className="w-fit" onClick={() => openWebhookDialog(webhookSuspended ? "reinstate" : "suspend")}>{webhookSuspended ? "Reinstate delivery" : "Suspend delivery"}</Button></div></div></section>
          <section className="mt-5 grid gap-0 border-y"><div className="flex flex-col justify-between gap-2 border-b py-4 md:flex-row md:items-end"><div><h2 className="text-lg font-semibold">API key activity · last 24 hours</h2><p className="text-sm text-muted-foreground">Use per-key signals to triage suspicious or throttled clients. Only a masked key prefix is shown.</p></div><Badge variant="secondary">{apiKeyReview?.keys.length ?? 0} keys</Badge></div>
            {apiKeyReviewLoading ? <p className="py-6 text-sm text-muted-foreground">Loading key activity…</p> : apiKeyReviewError ? <p role="alert" className="py-4 text-sm text-destructive">{apiKeyReviewError}</p> : !apiKeyReview?.keys.length ? <p className="py-6 text-sm text-muted-foreground">No API keys are registered for this project.</p> : <div className="grid">{apiKeyReview.keys.map((key) => <div key={key.id} className="grid gap-3 border-b py-4 last:border-b-0 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"><div className="grid min-w-0 gap-2"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{key.name}</span><Badge variant={key.environment === "production" ? "warning" : "secondary"}>{key.environment}</Badge><Badge variant={key.status === "active" ? "success" : "secondary"}>{key.status}</Badge><Badge variant={key.signal === "review" ? "warning" : "outline"}>{key.signal === "review" ? "Review signal" : "No signal"}</Badge></div><div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-muted-foreground"><span>{key.keyPrefix}</span><span>{key.scopes.join(", ") || "No scopes"}</span></div><div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"><span>{key.activity.requests.toLocaleString()} requests</span><span>{key.activity.reads.toLocaleString()} reads · {key.activity.writes.toLocaleString()} writes</span><span>{key.activity.clientErrors.toLocaleString()} client errors · {key.activity.serverErrors.toLocaleString()} server errors</span><span>{key.activity.rateLimited.toLocaleString()} rate limited</span><span>{key.activity.authFailures.toLocaleString()} known-key auth failures</span><span>Last seen {key.activity.lastSeenAt ? new Date(key.activity.lastSeenAt).toLocaleString() : "not observed in 24h"}</span></div>{key.revokeReason ? <p className="text-xs text-muted-foreground">Revocation reason: {key.revokeReason}</p> : null}</div>{key.status === "active" ? <Button variant="destructive" size="sm" className="w-fit" onClick={() => { setApiKeyToRevoke(key); setApiKeyRevokeReason(""); setApiKeyRevokeError(null) }}>Emergency revoke</Button> : null}</div>)}</div>}
            <p className="border-t py-3 text-xs text-muted-foreground">Review signal means one or more rate-limited requests, known-key authentication failures, or at least three server errors. It never auto-blocks a key. Unknown or malformed credentials cannot be attributed to a specific key; existing rate limits are project/environment-wide.</p>
          </section>
          <div className="mt-5 grid gap-5"><Card className="shadow-none"><CardHeader><CardTitle>Governance checks</CardTitle><CardDescription>Safe action sequence</CardDescription></CardHeader><CardContent className="grid gap-3 text-sm"><div className="flex items-center justify-between gap-3"><span>Inspect read model</span><Badge variant="success"><CheckCircle2 data-icon="inline-start" /> Ready</Badge></div><div className="flex items-center justify-between gap-3"><span>Preview approval action</span><Badge variant="warning">Next</Badge></div><div className="flex items-center justify-between gap-3"><span>Confirm privileged action</span><Badge variant="secondary">Guarded</Badge></div></CardContent></Card><Alert><ShieldCheck /><AlertTitle>API boundary</AlertTitle><AlertDescription>Key activity comes from an authenticated Platform aggregate. Activity counters are retained for 30 days and contain no raw key, request body, URL, or client IP.</AlertDescription></Alert></div>
        </TabsContent>
        <TabsContent value="environments" className="mt-4">
          <section className="grid gap-0 border-y"><div className="border-b py-4"><h2 className="text-lg font-semibold">API rate limits</h2><p className="text-sm text-muted-foreground">Requests per minute, separated by environment and read/write traffic.</p></div><div className="grid gap-0 md:grid-cols-2">{(["sandbox", "production"] as const).map((environment) => { const limits = project.rateLimits[environment]; return <div className="grid gap-3 border-b py-4 md:border-r md:px-4 md:even:border-r-0" key={environment}><div className="flex items-center justify-between gap-3"><div className="grid gap-1"><span className="text-sm font-medium capitalize">{environment}</span><span className="text-xs text-muted-foreground">{limits.readLimitPerMinute.toLocaleString()} reads · {limits.writeLimitPerMinute.toLocaleString()} writes per minute</span></div><Button variant="outline" size="sm" onClick={() => openRateLimitDialog(environment)}>Edit</Button></div><span className="text-xs text-muted-foreground">{limits.updatedAt ? `Updated ${limits.updatedAt}` : "Using configured defaults"}</span></div> })}</div></section>
          <div className="mt-5"><Card className="shadow-none"><CardHeader><CardTitle>Environment readiness</CardTitle><CardDescription>Read-only observations before privileged actions are introduced.</CardDescription><CardAction><Button variant="link" size="sm" onClick={requestPlatformRefresh}>Refresh project <Activity data-icon="inline-end" /></Button></CardAction></CardHeader><CardContent className="p-0"><PlatformTableViewport><Table><TableHeader><TableRow><TableHead>Environment</TableHead><TableHead>Readiness</TableHead><TableHead>Last observed</TableHead></TableRow></TableHeader><TableBody>{project.environments.map((environment) => <TableRow key={environment.name}><TableCell className="font-medium capitalize">{environment.name}</TableCell><TableCell><Badge variant={environment.readiness === "ready" ? "success" : environment.readiness === "blocked" ? "destructive" : "warning"}>{environment.readiness.replaceAll("-", " ")}</Badge></TableCell><TableCell className="text-muted-foreground">{environment.lastObservedAt}</TableCell></TableRow>)}</TableBody></Table></PlatformTableViewport></CardContent></Card></div>
        </TabsContent>
        <TabsContent value="webhooks" className="mt-4">
          <section className="grid gap-0 border-y"><div className="flex flex-col justify-between gap-2 border-b py-4 md:flex-row md:items-end"><div><h2 className="text-lg font-semibold">Production receivers</h2><p className="text-sm text-muted-foreground">Endpoint names and delivery posture only. URLs and signing material stay outside the Platform read model.</p></div><div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"><span>{project.webhookHealth.deliveryStats.sent} sent</span><span className={project.webhookHealth.deliveryStats.failed ? "text-brand" : ""}>{project.webhookHealth.deliveryStats.failed} failed</span><span>{project.webhookHealth.deliveryStats.pending} pending</span></div></div><PlatformTableViewport><Table><TableHeader><TableRow><TableHead>Receiver</TableHead><TableHead>Events</TableHead><TableHead>Payload</TableHead><TableHead>State</TableHead></TableRow></TableHeader><TableBody>{project.webhookHealth.registrations.length ? project.webhookHealth.registrations.map((registration) => <TableRow key={registration.id}><TableCell><div className="grid gap-1"><span className="font-medium">{registration.name}</span><span className="text-xs text-muted-foreground">{registration.id}</span></div></TableCell><TableCell className="text-sm text-muted-foreground">{registration.events.length} event types</TableCell><TableCell className="text-sm text-muted-foreground">v{registration.payloadVersion}</TableCell><TableCell><Badge variant={registration.status === "active" ? "success" : "secondary"}>{registration.status}</Badge></TableCell></TableRow>) : <TableRow><TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">No production receivers registered.</TableCell></TableRow>}</TableBody></Table></PlatformTableViewport></section>
        </TabsContent>
      </Tabs>
      <Dialog open={Boolean(apiKeyToRevoke)} onOpenChange={(open) => { if (!open && !apiKeyRevokePending) { setApiKeyToRevoke(null); setApiKeyRevokeError(null) } }}><DialogContent><DialogHeader><DialogTitle>Revoke this Developer API key?</DialogTitle><DialogDescription>{apiKeyToRevoke ? `${apiKeyToRevoke.name} · ${apiKeyToRevoke.environment} · ${apiKeyToRevoke.keyPrefix}` : "Revoke this API key."} Revocation takes effect immediately and cannot be undone. The developer will need to create a replacement key.</DialogDescription></DialogHeader><div className="grid gap-2"><label htmlFor="developer-api-key-revoke-reason" className="text-sm font-medium">Audit reason</label><Textarea id="developer-api-key-revoke-reason" value={apiKeyRevokeReason} onChange={(event) => setApiKeyRevokeReason(event.target.value)} placeholder="Example: key exposed in a public repository; revoke and rotate" maxLength={500} disabled={apiKeyRevokePending} /><p className="text-xs text-muted-foreground">Required. The action and reason are written to the security audit trail.</p>{apiKeyRevokeError ? <p role="alert" className="text-sm text-destructive">{apiKeyRevokeError}</p> : null}</div><DialogFooter><Button variant="outline" disabled={apiKeyRevokePending} onClick={() => setApiKeyToRevoke(null)}>Cancel</Button><Button variant="destructive" disabled={apiKeyRevokePending} onClick={() => void submitApiKeyRevocation()}>{apiKeyRevokePending ? "Revoking…" : "Revoke key now"}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={webhookDialogOpen} onOpenChange={setWebhookDialogOpen}><DialogContent><DialogHeader><DialogTitle>{webhookAction === "suspend" ? "Suspend production webhooks?" : "Reinstate production webhooks?"}</DialogTitle><DialogDescription>{webhookAction === "suspend" ? "Delivery will stop for this project’s production webhook receivers until a Platform admin reinstates it." : "Delivery will resume for this project’s production webhook receivers. Confirm that the delivery issue has been addressed."}</DialogDescription></DialogHeader><div className="grid gap-2"><label htmlFor="webhook-action-reason" className="text-sm font-medium">Audit reason</label><Textarea id="webhook-action-reason" value={webhookReason} onChange={(event) => setWebhookReason(event.target.value)} placeholder={webhookAction === "suspend" ? "Example: repeated 5xx responses from the production receiver" : "Example: receiver endpoint recovered and delivery was verified"} maxLength={500} disabled={webhookActionPending} /><p className="text-xs text-muted-foreground">Required. This reason is written to the security audit record.</p>{webhookActionError ? <p className="text-sm text-destructive">{webhookActionError}</p> : null}</div><DialogFooter><Button variant="outline" onClick={() => setWebhookDialogOpen(false)} disabled={webhookActionPending}>Cancel</Button><Button variant={webhookAction === "suspend" ? "destructive" : "default"} onClick={submitWebhookAction} disabled={webhookActionPending}>{webhookActionPending ? "Applying…" : webhookAction === "suspend" ? "Confirm suspension" : "Confirm reinstatement"}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}><DialogContent><DialogHeader><DialogTitle>Review production submission</DialogTitle><DialogDescription>Submission {project.productionApprovalDetail.pendingSubmissionId} will receive a recorded Platform review. Approval is separate from deployment.</DialogDescription></DialogHeader><div className="grid gap-3"><div className="grid gap-2"><span className="text-sm font-medium">Decision</span><div className="grid gap-2 sm:grid-cols-3">{([["approved", "Approve"], ["changes_requested", "Request changes"], ["rejected", "Reject"]] as const).map(([value, label]) => <Button key={value} type="button" variant={reviewStatus === value ? "secondary" : "outline"} size="sm" onClick={() => setReviewStatus(value)} disabled={reviewPending}>{label}</Button>)}</div></div><div className="grid gap-2"><label htmlFor="production-review-feedback" className="text-sm font-medium">Reviewer feedback {reviewStatus === "approved" ? "(optional)" : "(required)"}</label><Textarea id="production-review-feedback" value={reviewFeedback} onChange={(event) => setReviewFeedback(event.target.value)} placeholder={reviewStatus === "approved" ? "Optional approval note" : "Explain what must change before production approval"} maxLength={2000} disabled={reviewPending} />{reviewError ? <p className="text-sm text-destructive">{reviewError}</p> : null}</div></div><DialogFooter><Button variant="outline" onClick={() => setReviewDialogOpen(false)} disabled={reviewPending}>Cancel</Button><Button variant={reviewStatus === "rejected" ? "destructive" : "default"} onClick={submitReview} disabled={reviewPending}>{reviewPending ? "Submitting…" : "Submit review"}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={sandboxDialogOpen} onOpenChange={setSandboxDialogOpen}><DialogContent><DialogHeader><DialogTitle>{sandboxAction === "create" ? "Create Apple review account?" : "Reset Apple review credentials?"}</DialogTitle><DialogDescription>{sandboxAction === "create" ? "This creates a time-limited Sandbox account for Apple review. The generated password will be shown once." : "This invalidates the previous password, sessions, MFA factors, and registered devices for the Apple review account."}</DialogDescription></DialogHeader>{sandboxActionError ? <p className="text-sm text-destructive">{sandboxActionError}</p> : null}<DialogFooter><Button variant="outline" onClick={() => setSandboxDialogOpen(false)} disabled={sandboxActionPending}>Cancel</Button><Button variant="default" onClick={submitSandboxAction} disabled={sandboxActionPending}>{sandboxActionPending ? "Applying…" : sandboxAction === "create" ? "Create account" : "Reset credentials"}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={rateLimitDialogOpen} onOpenChange={setRateLimitDialogOpen}><DialogContent><DialogHeader><DialogTitle>Edit {rateLimitEnvironment} rate limits</DialogTitle><DialogDescription>Changes apply to this Developer API project and are recorded in the security audit.</DialogDescription></DialogHeader><div className="grid gap-3"><div className="grid gap-2"><label htmlFor="rate-limit-read" className="text-sm font-medium">Read requests per minute</label><Input id="rate-limit-read" type="number" min={1} max={100000} value={rateLimitRead} onChange={(event) => setRateLimitRead(event.target.value)} disabled={rateLimitPending} /></div><div className="grid gap-2"><label htmlFor="rate-limit-write" className="text-sm font-medium">Write requests per minute</label><Input id="rate-limit-write" type="number" min={1} max={100000} value={rateLimitWrite} onChange={(event) => setRateLimitWrite(event.target.value)} disabled={rateLimitPending} /></div><div className="grid gap-2"><label htmlFor="rate-limit-reason" className="text-sm font-medium">Audit reason</label><Textarea id="rate-limit-reason" value={rateLimitReason} onChange={(event) => setRateLimitReason(event.target.value)} placeholder="Example: increase approved for the production launch window" maxLength={500} disabled={rateLimitPending} /></div>{rateLimitError ? <p className="text-sm text-destructive">{rateLimitError}</p> : null}</div><DialogFooter><Button variant="outline" onClick={() => setRateLimitDialogOpen(false)} disabled={rateLimitPending}>Cancel</Button><Button onClick={submitRateLimit} disabled={rateLimitPending}>{rateLimitPending ? "Saving…" : "Save rate limits"}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={Boolean(sandboxCredentials)} onOpenChange={(open) => { if (!open) setSandboxCredentials(null) }}><DialogContent><DialogHeader><DialogTitle>Copy Sandbox credentials now</DialogTitle><DialogDescription>{sandboxCredentials?.warning}</DialogDescription></DialogHeader>{sandboxCredentials ? <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 text-sm"><div className="grid gap-1"><span className="text-xs text-muted-foreground">Username</span><code>{sandboxCredentials.credentials.username}</code></div><div className="grid gap-1"><span className="text-xs text-muted-foreground">Email</span><code>{sandboxCredentials.credentials.email}</code></div><div className="grid gap-1"><span className="text-xs text-muted-foreground">Password</span><code>{sandboxCredentials.credentials.password}</code></div><div className="grid gap-1"><span className="text-xs text-muted-foreground">Expires</span><code>{sandboxCredentials.credentials.expiresAt}</code></div></div> : null}<DialogFooter><Button onClick={() => setSandboxCredentials(null)}>Done</Button></DialogFooter></DialogContent></Dialog>
    </div>
  )
}

function RoutePlaceholder({ route }: { route: string }) {
  if (route === "Plan Matrix") return <PlanMatrix />
  const descriptions: Record<string, string> = { "Queues & recovery": "Inspect queue-day lifecycle, reconciliation evidence, and guarded recovery controls.", Tenants: "Review tenant status, billing posture, and audited entitlement controls.", Users: "Review account access, authentication posture, and guarded session actions.", "Service health": "Review cross-surface observations with freshness and evidence boundaries.", "Billing & credits": "Review subscriptions, usage-credit purchases, refunds, and disputes.", Moderation: "Triage campaign reports and rating disputes with explicit review state and audit-safe context.", "Security audit": "Search privileged-action evidence by scope, outcome, and request ID.", Settings: "Review Platform configuration and capability controls." }
  return <div className="grid gap-6"><div className="grid gap-1"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">Platform route</p><h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{route}</h1><p className="max-w-2xl text-muted-foreground">{descriptions[route] ?? "This route does not have a view available in the current Platform session."}</p></div><div className="max-w-2xl border-y py-6"><div className="flex items-center gap-3"><Badge variant="secondary">Access or data unavailable</Badge><span className="text-sm text-muted-foreground">This view may be restricted for your account or its read model may be temporarily unavailable. Refresh to retry, or return to Overview.</span></div><div className="mt-5 flex flex-wrap gap-2"><Button variant="outline" className="h-11 sm:h-9" onClick={requestPlatformRefresh}>Retry</Button><Button variant="ghost" className="h-11 sm:h-9" onClick={() => navigateToRoute("Overview")}>Back to overview</Button></div></div></div>
}

const usesLiveData = import.meta.env.VITE_PLATFORM_DATA_SOURCE === "live"
type AuthStatus = "checking" | "signed-out" | "authenticated" | "forbidden" | "unavailable"

function App() {
  const [dark, setDark] = useState(true)
  const [commandOpen, setCommandOpen] = useState(false)
  const [activeRoute, setActiveRoute] = useState(() => routeFromLocation())
  const [authStatus, setAuthStatus] = useState<AuthStatus>(usesLiveData ? "checking" : "authenticated")
  const [authError, setAuthError] = useState<string | null>(null)
  const [viewer, setViewer] = useState<PlatformViewerContext | null>(null)
  const [overview, setOverview] = useState<PlatformOverviewReadModel | null>(null)
  const [serviceHealth, setServiceHealth] = useState<PlatformServiceHealthReadModel | null>(null)
  const [queueOperations, setQueueOperations] = useState<PlatformQueueOperationsReadModel | null>(null)
  const [tenants, setTenants] = useState<PlatformTenantsReadModel | null>(null)
  const [users, setUsers] = useState<PlatformUsersReadModel | null>(null)
  const [accountDeletionQueue, setAccountDeletionQueue] = useState<PlatformAccountDeletionQueue | null>(null)
  const [accountDeletionError, setAccountDeletionError] = useState<string | null>(null)
  const [securityAudit, setSecurityAudit] = useState<PlatformAuditReadModel | null>(null)
  const [billing, setBilling] = useState<PlatformBillingReadModel | null>(null)
  const [moderation, setModeration] = useState<PlatformModerationReadModel | null>(null)
  const [settings, setSettings] = useState<PlatformSettingsReadModel | null>(null)
  const [releaseReadiness, setReleaseReadiness] = useState<PlatformReleaseReadinessReadModel | null>(null)
  const [developerProject, setDeveloperProject] = useState<DeveloperProjectGovernanceReadModel | null>(null)
  const [developerProjects, setDeveloperProjects] = useState<DeveloperProjectSummary[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [developerProjectLoading, setDeveloperProjectLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)

  useEffect(() => { document.documentElement.classList.toggle("dark", dark) }, [dark])
  useEffect(() => {
    const handlePopState = () => setActiveRoute(routeFromLocation())
    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [])
  useEffect(() => {
    const handleRefresh = () => setRefreshToken((value) => value + 1)
    window.addEventListener("platform:refresh", handleRefresh)
    return () => window.removeEventListener("platform:refresh", handleRefresh)
  }, [])
  useEffect(() => {
    if (!usesLiveData) return
    let mounted = true
    platformAuth.getSession().then(() => {
      if (!mounted) return
      setAuthStatus("authenticated")
    }).catch((authRequestError) => {
      if (!mounted) return
      if (authRequestError instanceof Error && "status" in authRequestError && Number(authRequestError.status) === 401) {
        setAuthStatus("signed-out")
        return
      }
      if (authRequestError instanceof Error && "status" in authRequestError && Number(authRequestError.status) === 403) {
        setAuthError(authRequestError.message)
        setAuthStatus("forbidden")
        return
      }
      setAuthError(authRequestError instanceof Error ? authRequestError.message : "Unable to verify the Platform session.")
      setAuthStatus("unavailable")
    })
    return () => { mounted = false }
  }, [])
  useEffect(() => {
    if (usesLiveData && authStatus !== "authenticated") return
    let mounted = true
    const load = async () => {
      setError(null)
      const viewerResponse = await platformApi.getViewerContext()
      if (!mounted) return
      if (viewerResponse.state === "denied") {
        if (viewerResponse.status === 401) setAuthStatus("signed-out")
        else {
          setAuthError(viewerResponse.message || "This account does not have permission to access the Platform dashboard.")
          setAuthStatus("forbidden")
        }
        return
      }
      if (viewerResponse.state !== "available" || !viewerResponse.data) {
        setError("The Platform read model is not available.")
        return
      }
      const capabilities = new Set(viewerResponse.data.capabilities)
      const can = (capability: string) => capabilities.has(capability)
      const deletionQueuePromise = can("platform.account_deletion.manage")
        ? platformApi.getAccountDeletionRequests().then((queue) => ({ queue })).catch((queueError) => ({ queueError }))
        : Promise.resolve(null)
      const [overviewResponse, healthResponse, queueResponse, tenantsResponse, usersResponse, auditResponse, billingResponse, moderationResponse, settingsResponse, releaseReadinessResponse, projectsResponse] = await Promise.all([
        platformApi.getOverview(),
        platformApi.getServiceHealth(),
        platformApi.getQueueOperations(),
        platformApi.getTenants(),
        can("platform.users.read") ? platformApi.getUsers() : Promise.resolve(null),
        can("platform.security_audit.read") ? platformApi.getSecurityAudit() : Promise.resolve(null),
        can("platform.billing.read") ? platformApi.getBilling() : Promise.resolve(null),
        can("platform.users.read") ? platformApi.getModeration() : Promise.resolve(null),
        can("platform.settings.manage") ? platformApi.getSettings() : Promise.resolve(null),
        platformApi.getReleaseReadiness(),
        can("platform.developer_api.manage") ? platformApi.getDeveloperProjects() : Promise.resolve(null),
      ])
      const deletionQueueResponse = await deletionQueuePromise
      if (!mounted) return
      const requiredResponses = [overviewResponse, healthResponse, queueResponse, tenantsResponse, releaseReadinessResponse]
      const overviewData = overviewResponse.data
      const healthData = healthResponse.data
      const queueData = queueResponse.data
      const tenantsData = tenantsResponse.data
      const releaseReadinessData = releaseReadinessResponse.data
      if (requiredResponses.some((response) => response.state !== "available") || !overviewData || !healthData || !queueData || !tenantsData || !releaseReadinessData) {
        const deniedResponse = requiredResponses.find((response) => response.state === "denied")
        if (usesLiveData && deniedResponse?.status === 401) setAuthStatus("signed-out")
        else if (usesLiveData && deniedResponse?.status === 403) {
          setAuthError(deniedResponse.message || "Your account does not have permission to view required Platform data.")
          setAuthStatus("forbidden")
        }
        else setError("The Platform read model is not available.")
        return
      }
      const activeProjects = projectsResponse?.state === "available" && projectsResponse.data ? projectsResponse.data.projects.filter((project) => project.status === "active") : []
      const firstProject = activeProjects[0]
      const projectResponse = firstProject ? await platformApi.getDeveloperProjectGovernance(firstProject.id) : null
      if (!mounted) return
      if (projectResponse && (projectResponse.state !== "available" || !projectResponse.data)) {
        if (usesLiveData && projectResponse.state === "denied" && projectResponse.status === 401) setAuthStatus("signed-out")
        else if (usesLiveData && projectResponse.state === "denied" && projectResponse.status === 403) {
          setAuthError(projectResponse.message || "Your account does not have permission to view Developer project governance.")
          setAuthStatus("forbidden")
        } else setError(projectResponse.message || "The Developer API governance read model is not available.")
        return
      }
      setViewer(viewerResponse.data)
      setOverview(overviewData)
      setServiceHealth(healthData)
      setQueueOperations(queueData)
      setTenants(tenantsData)
      setUsers(usersResponse?.state === "available" && usersResponse.data ? usersResponse.data : null)
      setAccountDeletionQueue(deletionQueueResponse && "queue" in deletionQueueResponse ? deletionQueueResponse.queue : null)
      setAccountDeletionError(deletionQueueResponse && "queueError" in deletionQueueResponse ? deletionQueueResponse.queueError instanceof Error ? deletionQueueResponse.queueError.message : "The account-deletion queue is unavailable." : null)
      if (deletionQueueResponse && "queueError" in deletionQueueResponse && deletionQueueResponse.queueError instanceof Error && "status" in deletionQueueResponse.queueError && Number(deletionQueueResponse.queueError.status) === 401) setAuthStatus("signed-out")
      setSecurityAudit(auditResponse?.state === "available" && auditResponse.data ? auditResponse.data : null)
      setBilling(billingResponse?.state === "available" && billingResponse.data ? billingResponse.data : null)
      setModeration(moderationResponse?.state === "available" && moderationResponse.data ? moderationResponse.data : null)
      setSettings(settingsResponse?.state === "available" && settingsResponse.data ? settingsResponse.data : null)
      setReleaseReadiness(releaseReadinessData)
      setDeveloperProjects(activeProjects)
      setSelectedProjectId(firstProject?.id || null)
      setDeveloperProject(projectResponse?.data || null)
    }
    load().catch(() => mounted && setError("Unable to load the Platform read model."))
    return () => { mounted = false }
  }, [authStatus, refreshToken])

  useEffect(() => {
    const hasBackgroundWork = accountDeletionQueue?.requests.some((request) =>
      ["queued", "running"].includes(request.scan.status)
      || ["queued", "running"].includes(request.cleanup.status)
      || request.userReport.status === "sending"
    )
    if (!usesLiveData || authStatus !== "authenticated" || !hasBackgroundWork) return
    const timer = window.setInterval(() => {
      void platformApi.getAccountDeletionRequests().then(setAccountDeletionQueue).catch(() => undefined)
    }, 3000)
    return () => window.clearInterval(timer)
  }, [accountDeletionQueue, authStatus])

  const selectDeveloperProject = async (projectId: string) => { if (projectId === selectedProjectId || developerProjectLoading) return; setDeveloperProjectLoading(true); setError(null); const response = await platformApi.getDeveloperProjectGovernance(projectId); if (usesLiveData && response.state === "denied" && response.status === 401) { setAuthStatus("signed-out"); setDeveloperProjectLoading(false); return } if (response.state !== "available" || !response.data) { setError(response.message || "The selected Developer API governance read model is not available."); setDeveloperProjectLoading(false); return } setSelectedProjectId(projectId); setDeveloperProject(response.data); setDeveloperProjectLoading(false) }
  const handleDeveloperWebhookAction = async (action: "suspend" | "reinstate", reason: string) => {
    if (!selectedProjectId) throw new Error("Select a Developer API project first.")
    try {
      if (action === "suspend") await platformApi.suspendDeveloperWebhooks(selectedProjectId, reason)
      else await platformApi.reinstateDeveloperWebhooks(selectedProjectId, reason)
    } catch (actionError) {
      if (actionError instanceof Error && "status" in actionError && Number(actionError.status) === 401) setAuthStatus("signed-out")
      throw actionError
    }
    requestPlatformRefresh()
  }
  const handleDeveloperApprovalReview = async (submissionId: string, status: "approved" | "changes_requested" | "rejected", feedback: string) => {
    if (!selectedProjectId) throw new Error("Select a Developer API project first.")
    try {
      await platformApi.reviewDeveloperApproval(selectedProjectId, submissionId, status, feedback)
    } catch (actionError) {
      if (actionError instanceof Error && "status" in actionError && Number(actionError.status) === 401) setAuthStatus("signed-out")
      throw actionError
    }
    requestPlatformRefresh()
  }
  const handleSandboxAction = async (action: "create" | "reset", accountId?: string): Promise<SandboxCredentialResult> => {
    if (!selectedProjectId) throw new Error("Select a Developer API project first.")
    if (action === "reset" && !accountId) throw new Error("The Apple review account is not available.")
    try {
      const result = action === "create" ? await platformApi.createAppleReviewAccount(selectedProjectId) : await platformApi.resetAppleReviewAccount(selectedProjectId, accountId as string)
      requestPlatformRefresh()
      return result
    } catch (actionError) {
      if (actionError instanceof Error && "status" in actionError && Number(actionError.status) === 401) setAuthStatus("signed-out")
      throw actionError
    }
  }
  const handleRateLimitUpdate = async (environment: "sandbox" | "production", readLimitPerMinute: number, writeLimitPerMinute: number, reason: string) => {
    if (!selectedProjectId) throw new Error("Select a Developer API project first.")
    try {
      await platformApi.updateDeveloperRateLimit(selectedProjectId, environment, readLimitPerMinute, writeLimitPerMinute, reason)
    } catch (actionError) {
      if (actionError instanceof Error && "status" in actionError && Number(actionError.status) === 401) setAuthStatus("signed-out")
      throw actionError
    }
    requestPlatformRefresh()
  }
  const handleDeveloperApiKeyRevoke = async (projectId: string, keyId: string, reason: string) => {
    try {
      return await platformApi.revokeDeveloperApiKey(projectId, keyId, reason)
    } catch (actionError) {
      if (actionError instanceof Error && "status" in actionError && Number(actionError.status) === 401) setAuthStatus("signed-out")
      throw actionError
    }
  }
  const handleQueueRepairPreview = (action: "reconcile_overdue_queue_day" | "requeue_notification", targetId: string, reason: string) => platformApi.previewQueueRepair(action, targetId, reason)
  const handleQueueRepairExecute = async (preview: QueueRepairPreview, reason: string) => {
    try {
      await platformApi.executeQueueRepair(preview.action, preview.targetId, reason, preview.revision, preview.confirmationToken)
    } catch (actionError) {
      if (actionError instanceof Error && "status" in actionError && Number(actionError.status) === 401) setAuthStatus("signed-out")
      throw actionError
    }
    requestPlatformRefresh()
  }
  const handleUserSessionRevokePreview = (userId: string, reason: string) => platformApi.previewUserSessionRevoke(userId, reason)
  const handleAccountDeletionTaskComplete = async (requestId: string, taskKind: AccountDeletionTaskKind, evidence: string, reason: string, retentionNotice?: string) => {
    await platformApi.completeAccountDeletionTask(requestId, taskKind, evidence, reason, retentionNotice)
    requestPlatformRefresh()
  }
  const handlePlatformSettingsSave = async (nextSettings: PlatformSettingsReadModel["settings"], reason: string, expectedSettings: PlatformSettingsReadModel["settings"]) => {
    try {
      const updated = await platformApi.updateSettings(nextSettings, reason, expectedSettings)
      setSettings((current) => current ? { ...current, settings: updated } : current)
      requestPlatformRefresh()
    } catch (actionError) {
      if (actionError instanceof Error && "status" in actionError && Number(actionError.status) === 401) setAuthStatus("signed-out")
      throw actionError
    }
  }
  const handleUserSessionRevokeExecute = async (preview: UserSessionRevokePreview, reason: string) => {
    try {
      const result = await platformApi.executeUserSessionRevoke(preview.targetId, reason, preview.revision, preview.confirmationToken)
      requestPlatformRefresh()
      return result
    } catch (actionError) {
      if (actionError instanceof Error && "status" in actionError && Number(actionError.status) === 401) setAuthStatus("signed-out")
      throw actionError
    }
  }
  const handleTenantInspect = (tenantId: string) => platformApi.inspectTenant(tenantId)
  const handleTenantEntitlementPreview = (action: TenantEntitlementPreview["action"], targetId: string, payload: Record<string, unknown>, reason: string) => platformApi.previewTenantEntitlement(action, targetId, payload, reason)
  const handleTenantEntitlementExecute = async (tenantId: string, overrideId: string | null, payload: Record<string, unknown>, reason: string, preview: TenantEntitlementPreview) => {
    try {
      await platformApi.executeTenantEntitlement(tenantId, overrideId, payload, reason, preview)
    } catch (actionError) {
      if (actionError instanceof Error && "status" in actionError && Number(actionError.status) === 401) setAuthStatus("signed-out")
      throw actionError
    }
    requestPlatformRefresh()
  }
  const handleTenantCreditGrant = async (tenantId: string, ticketUnits: number, journeyUnits: number, expiresAt: string | null, reason: string, preview: TenantEntitlementPreview) => {
    try { await platformApi.grantTenantCredits(tenantId, ticketUnits, journeyUnits, expiresAt, reason, preview) } catch (actionError) {
      if (actionError instanceof Error && "status" in actionError && Number(actionError.status) === 401) setAuthStatus("signed-out")
      throw actionError
    }
    requestPlatformRefresh()
  }
  const handleTenantCreditRevoke = async (lotId: string, units: number, reason: string, preview: TenantEntitlementPreview) => {
    try { await platformApi.revokeTenantCredits(lotId, units, reason, preview) } catch (actionError) {
      if (actionError instanceof Error && "status" in actionError && Number(actionError.status) === 401) setAuthStatus("signed-out")
      throw actionError
    }
    requestPlatformRefresh()
  }
  const handleSubscriptionSuspendPreview = (subscriptionId: string, reason: string) => platformApi.previewSubscriptionSuspend(subscriptionId, reason)
  const handleSubscriptionSuspendExecute = async (preview: SubscriptionSuspendPreview, reason: string) => {
    try {
      await platformApi.executeSubscriptionSuspend(preview.targetId, reason, preview.revision, preview.confirmationToken)
    } catch (actionError) {
      if (actionError instanceof Error && "status" in actionError && Number(actionError.status) === 401) setAuthStatus("signed-out")
      throw actionError
    }
    requestPlatformRefresh()
  }
  const handleCreditCasePreview = (action: "credit.refund.resolve" | "credit.dispute.resolve", targetId: string, payload: Record<string, unknown>, reason: string) => platformApi.previewCreditCase(action, targetId, payload, reason)
  const handleCreditRefundResolve = async (purchaseId: string, outcome: "confirmed" | "failed", providerRefundId: string | null, reason: string, preview: TenantEntitlementPreview) => {
    try { await platformApi.resolveCreditRefund(purchaseId, outcome, providerRefundId, reason, preview) } catch (actionError) {
      if (actionError instanceof Error && "status" in actionError && Number(actionError.status) === 401) setAuthStatus("signed-out")
      throw actionError
    }
    requestPlatformRefresh()
  }
  const handleCreditDisputeResolve = async (providerDisputeId: string, outcome: "won" | "lost", reason: string, preview: TenantEntitlementPreview) => {
    try { await platformApi.resolveCreditDispute(providerDisputeId, outcome, reason, preview) } catch (actionError) {
      if (actionError instanceof Error && "status" in actionError && Number(actionError.status) === 401) setAuthStatus("signed-out")
      throw actionError
    }
    requestPlatformRefresh()
  }
  const handleModerationPreview = (action: "moderation.campaign_report.status" | "moderation.rating_dispute.resolve", targetId: string, payload: Record<string, string>, reason: string) => platformApi.previewModerationAction(action, targetId, payload, reason)
  const handleModerationExecute = async (preview: ModerationPreview, action: ModerationAction, reason: string) => {
    try {
      if (action.kind === "report") await platformApi.updateCampaignReportStatus(action.row.id, action.status, reason, preview.revision, preview.confirmationToken)
      else await platformApi.resolveRatingDispute(action.row.id, action.status, action.moderationStatus, reason, preview.revision, preview.confirmationToken)
    } catch (actionError) {
      if (actionError instanceof Error && "status" in actionError && Number(actionError.status) === 401) setAuthStatus("signed-out")
      throw actionError
    }
    requestPlatformRefresh()
  }
  const handleAuthenticated = () => { setAuthError(null); setAuthStatus("authenticated") }
  const handleAccountSessionExpired = useCallback(() => setAuthStatus("signed-out"), [])
  const handleLogout = async () => { if (usesLiveData) { try { await platformAuth.logout() } catch { /* The local gate still closes if the server is unavailable. */ } } setAuthStatus(usesLiveData ? "signed-out" : "authenticated"); setViewer(null); setOverview(null); setServiceHealth(null); setQueueOperations(null); setTenants(null); setUsers(null); setAccountDeletionQueue(null); setAccountDeletionError(null); setSecurityAudit(null); setBilling(null); setModeration(null); setSettings(null); setReleaseReadiness(null); setDeveloperProject(null) }

  const navigate = (route: string) => {
    navigateToRoute(route)
  }

  const isHelpCenterRoute = activeRoute.startsWith("Help Center /")
  const routeTitle = isHelpCenterRoute ? "Help Center" : activeRoute
  const routeLabel = useMemo(() => isHelpCenterRoute ? activeRoute.replace("Help Center / ", "") : activeRoute === "Overview" ? "Platform control plane" : activeRoute, [activeRoute, isHelpCenterRoute])

  if (usesLiveData && authStatus === "checking") return <div className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">Checking Platform session…</div>
  if (usesLiveData && authStatus === "unavailable") return <div className="grid min-h-screen place-items-center bg-background px-4"><Alert variant="destructive" className="max-w-lg"><AlertTriangle /><AlertTitle>Authentication service unavailable</AlertTitle><AlertDescription>{authError || "Unable to verify the Platform session."}</AlertDescription></Alert></div>
  if (usesLiveData && authStatus === "forbidden") return <div className="grid min-h-screen place-items-center bg-background px-4"><Alert variant="destructive" className="max-w-lg"><ShieldCheck /><AlertTitle>Platform access denied</AlertTitle><AlertDescription>{authError || "Your session is valid, but this account is not authorized to access the Platform dashboard."}</AlertDescription></Alert></div>
  if (usesLiveData && authStatus === "signed-out") return <PlatformLogin dark={dark} onToggleTheme={() => setDark((value) => !value)} onAuthenticated={handleAuthenticated} />

  const activeViewer = viewer || { user: { id: "fixture", displayName: "Carlo Abella", role: "Platform Admin" }, capabilities: fixtureCapabilities, navigation: ["overview", "operations", "developer", "billing", "trust", "settings"] as PlatformViewerContext["navigation"], sessionExpiresAt: "" }
  const availableCapabilities = new Set(activeViewer.capabilities)

  return <TooltipProvider><SidebarProvider defaultOpen><PlatformSidebar activeRoute={activeRoute} dark={dark} viewer={activeViewer} onRouteChange={navigate} onLogout={handleLogout} /><SidebarInset className="min-w-0"><header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-6"><SidebarTrigger className="-ml-1" aria-label="Toggle Platform navigation"><PanelLeft data-icon="inline-start" /></SidebarTrigger><Separator orientation="vertical" className="mr-1 h-4" /><div className="flex min-w-0 items-center gap-2 text-sm"><span className="font-medium">{routeTitle}</span><span className="hidden text-muted-foreground sm:inline">{routeLabel}</span></div><div className="ml-auto flex items-center gap-1"><Button variant="outline" size="sm" className="hidden gap-2 text-muted-foreground md:flex" onClick={() => setCommandOpen(true)}><Search data-icon="inline-start" /> Search <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px]">⌘K</kbd></Button><Button variant="ghost" size="icon" aria-label={dark ? "Switch to light theme" : "Switch to dark theme"} onClick={() => setDark((value) => !value)}>{dark ? <Sun /> : <Moon />}</Button><Button variant="ghost" size="icon" className="md:hidden" aria-label="Open command search" onClick={() => setCommandOpen(true)}><CommandIcon /></Button></div></header><main className="min-w-0 flex-1 p-4 md:p-6 lg:p-8"><div className="mx-auto max-w-[1440px]">{activeRoute === "My account" ? <PlatformAccountSettings live={usesLiveData} onPasswordChanged={() => { setAuthStatus("signed-out"); setViewer(null) }} onSessionExpired={handleAccountSessionExpired} /> : isHelpCenterRoute && viewer && availableCapabilities.has("platform.help_center.manage") ? <PlatformHelpCenterManager page={activeRoute.replace("Help Center / ", "").toLowerCase() as "overview" | "topics" | "guides" | "faqs"} onNavigate={(page) => navigate(`Help Center / ${page[0].toUpperCase()}${page.slice(1)}`)} /> : error ? <Alert variant="destructive"><AlertTriangle /><AlertTitle>Platform unavailable</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : overview && viewer && serviceHealth && queueOperations && tenants && releaseReadiness ? activeRoute === "Overview" ? <Overview overview={overview} health={serviceHealth} viewer={viewer} /> : activeRoute === "Service health" ? <ServiceHealth health={serviceHealth} /> : activeRoute === "Queues & recovery" ? <QueueOperations operations={queueOperations} onPreview={handleQueueRepairPreview} onExecute={handleQueueRepairExecute} /> : activeRoute === "Tenants" ? <Tenants tenants={tenants} canManageOverrides={availableCapabilities.has("platform.entitlement_overrides.manage")} canGrantCredits={availableCapabilities.has("platform.credit_grants.manage")} canRevokeCredits={availableCapabilities.has("platform.credit_revocations.manage")} onInspect={handleTenantInspect} onPreviewEntitlement={handleTenantEntitlementPreview} onExecuteEntitlement={handleTenantEntitlementExecute} onGrantCredits={handleTenantCreditGrant} onRevokeCredits={handleTenantCreditRevoke} /> : activeRoute === "Users" && users ? <PlatformUsers users={users} viewerId={viewer.user.id} canManage={availableCapabilities.has("platform.user_sessions.revoke")} deletionRequests={accountDeletionQueue} deletionError={accountDeletionError} canManageDeletion={availableCapabilities.has("platform.account_deletion.manage")} onCompleteDeletionTask={handleAccountDeletionTaskComplete} onPreview={handleUserSessionRevokePreview} onExecute={handleUserSessionRevokeExecute} /> : activeRoute === "Security audit" && securityAudit ? <SecurityAudit audit={securityAudit} /> : activeRoute === "Billing & credits" && billing ? <Billing billing={billing} canSuspend={availableCapabilities.has("platform.subscription_lifecycle.manage")} canResolveRefunds={availableCapabilities.has("platform.credit_adjustments.manage")} canResolveDisputes={availableCapabilities.has("platform.credit_disputes.manage")} onPreviewSuspend={handleSubscriptionSuspendPreview} onExecuteSuspend={handleSubscriptionSuspendExecute} onPreviewCreditCase={handleCreditCasePreview} onResolveCreditRefund={handleCreditRefundResolve} onResolveCreditDispute={handleCreditDisputeResolve} /> : activeRoute === "Moderation" && moderation ? <Moderation moderation={moderation} canManage={availableCapabilities.has("platform.settings.manage")} onPreview={handleModerationPreview} onExecute={handleModerationExecute} /> : activeRoute === "Release readiness" ? <ReleaseReadiness readiness={releaseReadiness} /> : activeRoute === "Settings" && settings ? <PlatformSettingsEditor settings={settings.settings} controls={settings.controls} editable={usesLiveData && availableCapabilities.has("platform.settings.manage")} onSave={handlePlatformSettingsSave} onRefresh={requestPlatformRefresh} /> : activeRoute === "Developer projects" && developerProject && selectedProjectId ? <DeveloperProjects project={developerProject} projects={developerProjects} selectedProjectId={selectedProjectId} onProjectChange={selectDeveloperProject} projectLoading={developerProjectLoading} onWebhookAction={handleDeveloperWebhookAction} onDeveloperApprovalReview={handleDeveloperApprovalReview} onSandboxAction={handleSandboxAction} onRateLimitUpdate={handleRateLimitUpdate} onRevokeApiKey={handleDeveloperApiKeyRevoke} /> : <RoutePlaceholder route={activeRoute} /> : <div className="grid min-h-[420px] place-items-center text-sm text-muted-foreground">Loading Platform overview…</div>}</div></main></SidebarInset></SidebarProvider><CommandDialog open={commandOpen} onOpenChange={setCommandOpen} title="Search Platform" description="Find a Platform route, tenant, project, or audit event."><Command><CommandInput placeholder="Search routes, tenants, projects…" /><CommandList><CommandEmpty>No matching Platform records.</CommandEmpty><CommandGroup heading="Navigate">{navGroups.flatMap((group) => group.items.flatMap((item) => item.subItems ? item.subItems.map((child) => ({ ...item, label: `Help Center · ${child.label}`, route: child.route })) : [item])).filter((item) => availableCapabilities.has(item.capability)).map((item) => <CommandItem key={item.route || item.label} onSelect={() => { navigate(item.route || item.label); setCommandOpen(false) }}><item.icon />{item.label}</CommandItem>)}</CommandGroup></CommandList></Command></CommandDialog></TooltipProvider>
}

export default App
