import { useEffect, useMemo, useState } from "react"
import type { QueueFeeSetting, SubscriptionPlan, SubscriptionPlanSlug } from "../../../shared/types"
import { AlertTriangle, Check, LoaderCircle, ShieldCheck } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { platformApi } from "@/lib/platform-api"
import type { PlanPolicyPreview, PlatformPlanMatrix } from "@/lib/platform-contracts"

const features = [
  ["queue", "Queue system"], ["branding", "Branded experience"], ["discovery", "Marketplace discovery"],
  ["booking", "Service bookings"], ["campaigns", "Group-funded campaigns"],
] as const
const allowances = [
  ["queueTickets", "Queue tickets / month"], ["queueEmailJourneys", "Email journeys / month"], ["serviceBookings", "Service bookings / month"],
] as const
const numericEntitlements = [
  ["locations", "Active locations"], ["counters", "Service counters"], ["staffSeats", "Vendor seats"],
  ["historyDays", "History retention (days)"], ["smsAllowance", "SMS allowance / month"],
] as const
const booleanEntitlements = [
  ["qrJoinPage", "QR join page"], ["publicQueueBoard", "Public queue board"], ["basicDashboard", "Basic dashboard"],
  ["queueSettings", "Queue settings"], ["brandedQueuePages", "Branded queue pages"], ["analytics", "Analytics"],
  ["csvExport", "CSV export"], ["pdfExport", "PDF export"], ["advancedRoles", "Advanced roles"],
  ["slaSupport", "SLA support"], ["customDomain", "Custom domain"], ["sso", "Single sign-on"], ["emailAlerts", "Email alerts"],
] as const

type PendingPublish = {
  kind: "plan" | "fees"
  preview: PlanPolicyPreview
  reason: string
  plan?: SubscriptionPlan
  queueFees?: Array<Pick<QueueFeeSetting, "planSlug" | "enabled" | "amountCents">>
  summary: string
}

function NumericField({ label, value, disabled, onChange }: { label: string; value: number; disabled: boolean; onChange: (value: number) => void }) {
  return <div className="space-y-2"><Label>{label}</Label><Input type="number" min={0} step={1} value={value} disabled={disabled} onChange={(event) => onChange(Math.trunc(Math.max(0, Number(event.target.value) || 0)))} /></div>
}

function ToggleField({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled: boolean; onChange: (checked: boolean) => void }) {
  return <label className="flex min-h-10 items-center gap-3 rounded-md border px-3 py-2 text-sm"><input type="checkbox" className="size-4 accent-primary" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /><span>{label}</span></label>
}

export function PlanMatrix() {
  const [matrix, setMatrix] = useState<PlatformPlanMatrix | null>(null)
  const [capabilities, setCapabilities] = useState<string[]>([])
  const [plans, setPlans] = useState<SubscriptionPlan[]>([])
  const [queueFees, setQueueFees] = useState<QueueFeeSetting[]>([])
  const [initialPlans, setInitialPlans] = useState<SubscriptionPlan[]>([])
  const [initialFees, setInitialFees] = useState<QueueFeeSetting[]>([])
  const [selectedSlug, setSelectedSlug] = useState<SubscriptionPlanSlug>("free")
  const [planReason, setPlanReason] = useState("")
  const [feeReason, setFeeReason] = useState("")
  const [pending, setPending] = useState<PendingPublish | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    void Promise.all([platformApi.getPlanMatrix(), platformApi.getViewerContext()]).then(([data, viewer]) => {
      if (!mounted) return
      if (viewer.state === "available" && viewer.data) setCapabilities(viewer.data.capabilities)
      setMatrix(data)
      setPlans(data.plans)
      setQueueFees(data.queueFees)
      setInitialPlans(data.plans)
      setInitialFees(data.queueFees)
      if (data.plans.length) setSelectedSlug(data.plans.find((plan) => plan.slug === "free")?.slug || data.plans[0].slug)
    }).catch((loadError) => {
      if (mounted) setError(loadError instanceof Error ? loadError.message : "Plan Matrix could not be loaded.")
    }).finally(() => mounted && setLoading(false))
    return () => { mounted = false }
  }, [])

  const plan = plans.find((item) => item.slug === selectedSlug)
  const fee = queueFees.find((item) => item.planSlug === selectedSlug)
  const canPublishPlan = Boolean(matrix?.planPolicyMutations && capabilities.includes("platform.plans.manage"))
  const canPublishFees = Boolean(matrix?.planPolicyMutations && capabilities.includes("platform.queue_fees.manage"))
  const planChanged = useMemo(() => JSON.stringify(plans) !== JSON.stringify(initialPlans), [plans, initialPlans])
  const feesChanged = useMemo(() => JSON.stringify(queueFees) !== JSON.stringify(initialFees), [queueFees, initialFees])

  const updatePlan = (change: (current: SubscriptionPlan) => SubscriptionPlan) => {
    setPlans((current) => current.map((item) => item.slug === selectedSlug ? change(item) : item))
  }
  const updateFee = (change: (current: QueueFeeSetting) => QueueFeeSetting) => {
    setQueueFees((current) => current.map((item) => item.planSlug === selectedSlug ? change(item) : item))
  }

  const requestPlanPreview = async () => {
    if (!plan || planReason.trim().length < 8) return
    setBusy(true); setError(null); setNotice(null)
    try {
      const preview = await platformApi.previewPlanPolicy("plan.defaults.publish", plan.slug, { plan }, planReason.trim(), `plan-${plan.policyRevision ?? 1}`)
      setPending({ kind: "plan", preview, reason: planReason.trim(), plan, summary: `Publish ${plan.name} as the new default policy for future admissions.` })
    } catch (previewError) { setError(previewError instanceof Error ? previewError.message : "A secure plan preview could not be created.") }
    finally { setBusy(false) }
  }

  const requestFeesPreview = async () => {
    if (feeReason.trim().length < 8) return
    const payload = queueFees.map(({ planSlug, enabled, amountCents }) => ({ planSlug, enabled, amountCents }))
    setBusy(true); setError(null); setNotice(null)
    try {
      const preview = await platformApi.previewPlanPolicy("queue.fees.publish", "all-plans", { queueFees: payload }, feeReason.trim(), "queue-fees-v1")
      setPending({ kind: "fees", preview, reason: feeReason.trim(), queueFees: payload, summary: "Publish customer queue fee settings across all plans." })
    } catch (previewError) { setError(previewError instanceof Error ? previewError.message : "A secure queue-fee preview could not be created.") }
    finally { setBusy(false) }
  }

  const confirmPublish = async () => {
    if (!pending) return
    setBusy(true); setError(null)
    try {
      if (pending.kind === "plan" && pending.plan) {
        const updated = await platformApi.publishPlan(pending.plan, pending.reason, pending.preview)
        const next = plans.map((item) => item.slug === updated.slug ? updated : item)
        setPlans(next); setInitialPlans(next); setPlanReason("")
        setNotice(`${updated.name} policy published. Existing subscriptions and admitted work are unchanged.`)
      } else if (pending.kind === "fees" && pending.queueFees) {
        const updated = await platformApi.publishQueueFees(pending.queueFees, pending.reason, pending.preview)
        setQueueFees(updated); setInitialFees(updated); setFeeReason("")
        setNotice("Queue fee policy published.")
      }
      setPending(null)
    } catch (publishError) { setError(publishError instanceof Error ? publishError.message : "The policy was not published.") }
    finally { setBusy(false) }
  }

  if (loading) return <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /> Loading Plan Matrix…</div>
  if (error && !matrix) return <Alert variant="destructive"><AlertTriangle /><AlertTitle>Plan Matrix unavailable</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>
  if (!matrix || !plan) return <p className="text-sm text-muted-foreground">No plan policies are available.</p>

  const readOnlyReason = !matrix.planPolicyMutations ? "Plan policy publishing is disabled by the server rollout control." : !canPublishPlan && !canPublishFees ? "Your account can review plans but does not have plan-management permissions." : null

  return <section className="space-y-6" aria-label="Plan Matrix">
    <header className="space-y-1"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Commercial policy</p><h1 className="text-2xl font-semibold tracking-tight">Plan Matrix</h1><p className="text-sm text-muted-foreground">Review global plan entitlements, monthly allowances, operational limits, and customer queue fees.</p></header>
    {error ? <Alert variant="destructive"><AlertTriangle /><AlertTitle>Action needs attention</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
    {notice ? <Alert><Check /><AlertTitle>Policy updated</AlertTitle><AlertDescription>{notice}</AlertDescription></Alert> : null}
    {readOnlyReason ? <Alert><ShieldCheck /><AlertTitle>Read-only policy view</AlertTitle><AlertDescription>{readOnlyReason}</AlertDescription></Alert> : null}
    <Tabs value={selectedSlug} onValueChange={(value) => setSelectedSlug(value as SubscriptionPlanSlug)}>
      <TabsList aria-label="Subscription plans">{plans.map((item) => <TabsTrigger key={item.slug} value={item.slug}>{item.name}</TabsTrigger>)}</TabsList>
      <TabsContent value={selectedSlug} className="mt-5 space-y-6">
    <Card>
      <CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle>{plan.name}</CardTitle><CardDescription>{(matrix.activeSubscribersByPlan[plan.slug] ?? 0).toLocaleString()} active subscribers · policy revision {plan.policyRevision ?? 1} · published defaults apply to future admissions; tenant-specific overrides remain separate.</CardDescription></div><Badge variant={plan.checkoutEnabled ? "default" : "secondary"}>{plan.checkoutEnabled ? "Checkout enabled" : "Checkout disabled"}</Badge></div></CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="plan-name">Plan name</Label><Input id="plan-name" value={plan.name} disabled={!canPublishPlan} onChange={(event) => updatePlan((current) => ({ ...current, name: event.target.value }))} /></div>
          <div className="space-y-2"><Label htmlFor="plan-best-for">Positioning</Label><Input id="plan-best-for" value={plan.bestFor} disabled={!canPublishPlan} onChange={(event) => updatePlan((current) => ({ ...current, bestFor: event.target.value }))} /></div>
        </div>
        <ToggleField label="Allow self-serve checkout" checked={plan.checkoutEnabled} disabled={!canPublishPlan} onChange={(checkoutEnabled) => updatePlan((current) => ({ ...current, checkoutEnabled }))} />
        <div className="grid gap-5 xl:grid-cols-2">
          <div className="space-y-3"><h2 className="text-base font-medium">Feature entitlements</h2><div className="grid gap-2">{features.map(([key, label]) => <ToggleField key={key} label={label} checked={Boolean(plan.features?.[key])} disabled={!canPublishPlan || (key === "queue" && plan.slug === "free") || (key === "campaigns" && !plan.features?.booking)} onChange={(checked) => updatePlan((current) => ({ ...current, features: { queue: false, branding: false, discovery: false, booking: false, campaigns: false, ...current.features, [key]: checked, ...(key === "booking" && !checked ? { campaigns: false } : {}) } }))} />)}</div><p className="text-xs text-muted-foreground">Group-funded campaigns require Service bookings.</p></div>
          <div className="space-y-3"><h2 className="text-base font-medium">Monthly allowances</h2><div className="grid gap-3 sm:grid-cols-2">{allowances.map(([key, label]) => <NumericField key={key} label={label} value={plan.allowances?.[key] ?? 0} disabled={!canPublishPlan} onChange={(value) => updatePlan((current) => ({ ...current, allowances: { queueTickets: 0, queueEmailJourneys: 0, serviceBookings: 0, ...current.allowances, [key]: value } }))} />)}</div></div>
        </div>
        <div className="grid gap-5 xl:grid-cols-2">
          <div className="space-y-3"><h2 className="text-base font-medium">Operational limits</h2><div className="grid gap-3 sm:grid-cols-2">{numericEntitlements.map(([key, label]) => <NumericField key={key} label={label} value={Number(plan.entitlements[key] || 0)} disabled={!canPublishPlan} onChange={(value) => updatePlan((current) => ({ ...current, entitlements: { ...current.entitlements, [key]: value } }))} />)}</div></div>
          <div className="space-y-3"><h2 className="text-base font-medium">Workspace capabilities</h2><div className="grid gap-2 sm:grid-cols-2">{booleanEntitlements.map(([key, label]) => <ToggleField key={key} label={label} checked={Boolean(plan.entitlements[key])} disabled={!canPublishPlan} onChange={(checked) => updatePlan((current) => ({ ...current, entitlements: { ...current.entitlements, [key]: checked } }))} />)}</div></div>
        </div>
        <div className="space-y-3 border-t pt-5">
          <div><h2 className="text-base font-medium">Publish plan defaults</h2><p className="text-sm text-muted-foreground">Publishing does not rewrite existing subscriptions or admitted work. Tenant overrides remain unchanged.</p></div>
          <div className="flex flex-col gap-3 sm:flex-row"><div className="flex-1 space-y-2"><Label htmlFor="plan-audit-reason">Audit reason</Label><Textarea id="plan-audit-reason" value={planReason} maxLength={500} disabled={!canPublishPlan || busy} onChange={(event) => setPlanReason(event.target.value)} placeholder="Explain why this plan policy is changing (8–500 characters)." /></div><div className="flex items-end"><Button disabled={!canPublishPlan || !planChanged || planReason.trim().length < 8 || busy} onClick={() => void requestPlanPreview()}>{busy ? <LoaderCircle className="animate-spin" /> : null}Review and publish</Button></div></div>
        </div>
      </CardContent>
    </Card>
    <Card>
      <CardHeader><CardTitle>Customer queue fees</CardTitle><CardDescription>Queue fees are published as a separate policy change and require their own permission, preview, and audit reason.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        {fee ? <><ToggleField label={`Enable customer queue fee for ${plan.name}`} checked={fee.enabled} disabled={!canPublishFees} onChange={(enabled) => updateFee((current) => ({ ...current, enabled }))} /><NumericField label="Fee amount (centavos)" value={fee.amountCents} disabled={!canPublishFees} onChange={(amountCents) => updateFee((current) => ({ ...current, amountCents }))} /></> : <p className="text-sm text-muted-foreground">No queue fee setting exists for this plan.</p>}
        <div className="flex flex-col gap-3 sm:flex-row"><div className="flex-1 space-y-2"><Label htmlFor="fee-audit-reason">Audit reason</Label><Textarea id="fee-audit-reason" value={feeReason} maxLength={500} disabled={!canPublishFees || busy} onChange={(event) => setFeeReason(event.target.value)} placeholder="Explain why queue fee settings are changing (8–500 characters)." /></div><div className="flex items-end"><Button variant="outline" disabled={!canPublishFees || !feesChanged || feeReason.trim().length < 8 || busy} onClick={() => void requestFeesPreview()}>{busy ? <LoaderCircle className="animate-spin" /> : null}Review fee changes</Button></div></div>
      </CardContent>
    </Card>
    <Dialog open={Boolean(pending)} onOpenChange={(open) => { if (!open && !busy) setPending(null) }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Review policy publication</DialogTitle><DialogDescription>Confirm the server-reviewed change before it becomes the active default.</DialogDescription></DialogHeader>
        <div className="space-y-3 rounded-lg border p-4 text-sm"><p>{pending?.summary}</p><p className="text-muted-foreground">Audit reason: {pending?.reason}</p><p className="text-muted-foreground">The server will reject this confirmation if the policy changed after preview.</p></div>
        <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setPending(null)}>Cancel</Button><Button disabled={busy} onClick={() => void confirmPublish()}>{busy ? <LoaderCircle className="animate-spin" /> : null}Confirm publication</Button></DialogFooter>
      </DialogContent>
    </Dialog>
      </TabsContent>
    </Tabs>
  </section>
}
