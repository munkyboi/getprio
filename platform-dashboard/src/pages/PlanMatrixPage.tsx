import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Checkbox, Group, Modal, NumberInput, Paper, SegmentedControl, Select, SimpleGrid, Stack, Text, TextInput, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import type { PlatformPlansResponse, PlatformQueueFeesResponse, QueueFeeSetting, SubscriptionPlan, SubscriptionPlanSlug } from "@shared";
import { apiRequest } from "../api";

type CreditPack = { code: string; name: string; state: "draft" | "enabled" | "disabled" | "archived"; revision: number; ticketUnits: number; journeyUnits: number; priceCents: number; priceDisplay: string };
type TenantOption = { _id?: string; id?: string; name?: string; slug?: string; planSlug?: SubscriptionPlanSlug | null };
type CreditLot = { id: string; resourceKey: string; sourceType: string; grantedUnits: number; consumedUnits: number; revokedUnits: number; frozenUnits: number; remainingUnits: number; expiresAt?: string | null; reason?: string };
type Capacity = { planSlug: string; subscriptionId: string | null; planRevision: number | null; features: Record<string, { enabled: boolean; source: string; overrideId?: string | null; suppressedBy?: string }>; resources: Record<string, { limit: number; used: number; creditRemaining: number; resetAt?: string | null; source: string; overrideId?: string | null; warningThresholds?: Array<{ thresholdPercent: number; claimedAt: string; deliveredAt?: string | null }> }>; lots: CreditLot[] };
type EntitlementOverride = { id: string; subscription_id: string; policy_key: string; value: unknown; reason: string; expires_at?: string | null; revoked_at?: string | null };
type CreditPurchase = { id: string; tenant_id: string; pack_code: string; pack_name: string; status: string; amount_cents: number; currency: string; created_at: string };
type CreditRefund = { id: string; purchase_id: string; status: string; reason: string; provider_refund_id?: string | null };
type CreditDispute = { id: string; purchase_id: string; provider_dispute_id: string; status: string; consumed_exposure_units: number };
type CreditTask = { action: string; target: string; endpoint: string; payload: Record<string, unknown>; title: string; description: string; maxUnits?: number; needsProviderDisputeId?: boolean };
type PlanMatrixCapabilities = { planPolicyMutations: boolean; usageCreditCatalog: boolean; usageCreditAdministration: boolean; usageCreditCases: boolean; tenantOverrides: boolean };
const featureLabels = { queue: "Queue system", branding: "Public-facing branding", discovery: "Marketplace discovery", booking: "Service booking", campaigns: "Group-funded campaigns" } as const;
const allowanceLabels = { queueTickets: "Queue Tickets / month", queueEmailJourneys: "Queue Email Journeys / month", serviceBookings: "Service Bookings / month" } as const;
const numericEntitlementLabels = { locations: "Active locations", counters: "Service counters", staffSeats: "Vendor seats", historyDays: "History retention (days)", smsAllowance: "SMS allowance / month" } as const;
const booleanEntitlementLabels = { qrJoinPage: "QR join page", publicQueueBoard: "Public queue board", basicDashboard: "Basic dashboard", queueSettings: "Queue settings", brandedQueuePages: "Branded queue pages", analytics: "Analytics", csvExport: "CSV export", pdfExport: "PDF export", advancedRoles: "Advanced roles", slaSupport: "SLA support", customDomain: "Custom domain", sso: "Single sign-on", emailAlerts: "Email alerts" } as const;

export function PlanMatrixPage({ token }: { token: string }) {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [fees, setFees] = useState<QueueFeeSetting[]>([]);
  const [packs, setPacks] = useState<CreditPack[]>([]);
  const [selected, setSelected] = useState<SubscriptionPlanSlug>("free");
  const [busy, setBusy] = useState(false);
  const [editingPack, setEditingPack] = useState<CreditPack | null>(null);
  const [reason, setReason] = useState("");
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [capacity, setCapacity] = useState<Capacity | null>(null);
  const [grantOpened, setGrantOpened] = useState(false);
  const [grant, setGrant] = useState({ ticketUnits: 0, journeyUnits: 0, expiresAt: "", reason: "" });
  const [purchases, setPurchases] = useState<CreditPurchase[]>([]);
  const [refunds, setRefunds] = useState<CreditRefund[]>([]);
  const [disputes, setDisputes] = useState<CreditDispute[]>([]);
  const [creditTask, setCreditTask] = useState<CreditTask | null>(null);
  const [taskReason, setTaskReason] = useState("");
  const [taskUnits, setTaskUnits] = useState(0);
  const [providerDisputeId, setProviderDisputeId] = useState("");
  const [overrides, setOverrides] = useState<EntitlementOverride[]>([]);
  const [overrideOpened, setOverrideOpened] = useState(false);
  const [overrideForm, setOverrideForm] = useState({ policyKey: "feature.branding", value: "false", expiresAt: "", reason: "" });
  const [capabilities, setCapabilities] = useState<PlanMatrixCapabilities>({ planPolicyMutations: false, usageCreditCatalog: false, usageCreditAdministration: false, usageCreditCases: false, tenantOverrides: false });

  async function load() {
    const [planData, feeData, tenantData, capabilityData] = await Promise.all([
      apiRequest<PlatformPlansResponse>("/platform/plans", { token }),
      apiRequest<PlatformQueueFeesResponse>("/platform/queue-fees", { token }),
      apiRequest<{ items: TenantOption[] }>("/platform/tenants?limit=200", { token }),
      apiRequest<PlanMatrixCapabilities>("/platform/capabilities", { token })
    ]);
    setPlans(planData.plans); setFees(feeData.queueFees); setTenants(tenantData.items); setCapabilities(capabilityData);
    if (capabilityData.usageCreditCatalog) {
      const packData = await apiRequest<{ packs: CreditPack[] }>("/platform/credit-packs", { token });
      setPacks(packData.packs);
    }
    if (capabilityData.usageCreditCases) {
      const commerceData = await apiRequest<{ purchases: CreditPurchase[]; refunds: CreditRefund[]; disputes: CreditDispute[] }>("/platform/credit-purchases", { token });
      setPurchases(commerceData.purchases); setRefunds(commerceData.refunds); setDisputes(commerceData.disputes);
    }
  }
  useEffect(() => { void load(); }, [token]);
  const plan = useMemo(() => plans.find((item) => item.slug === selected), [plans, selected]);
  const fee = fees.find((item) => item.planSlug === selected);
  const subscriberCount = tenants.filter((item) => item.planSlug === selected).length;
  function updatePlan(change: (current: SubscriptionPlan) => SubscriptionPlan) { setPlans((current) => current.map((item) => item.slug === selected ? change(item) : item)); }

  async function savePlan() {
    if (!plan) return;
    setBusy(true);
    try {
      const planReason = `Plan Matrix update for ${plan.name}`;
      const queueFees = fees.map((item) => ({ planSlug: item.planSlug, enabled: item.enabled, amountCents: item.amountCents }));
      const planPayload = { plan };
      const feePayload = { queueFees };
      const planPreview = await apiRequest<{ confirmation: { token: string }; preview: { revision: string } }>("/platform/privileged-actions/preview", { method: "POST", token, body: { action: "plan.defaults.publish", target: plan.slug, reason: planReason, payload: planPayload, previewRevision: `plan-${plan.policyRevision ?? 1}` } });
      const planData = await apiRequest<{ plan: SubscriptionPlan }>(`/platform/plans/${plan.slug}`, { method: "PATCH", token, headers: { "X-Transaction-Confirmation": planPreview.confirmation.token }, body: { plan, reason: planReason, previewRevision: planPreview.preview.revision } });
      const feePreview = await apiRequest<{ confirmation: { token: string }; preview: { revision: string } }>("/platform/privileged-actions/preview", { method: "POST", token, body: { action: "queue.fees.publish", target: "all-plans", reason: "Plan Matrix queue fee update", payload: feePayload, previewRevision: "queue-fees-v1" } });
      const feeData = await apiRequest<PlatformQueueFeesResponse>("/platform/queue-fees", { method: "PATCH", token, headers: { "X-Transaction-Confirmation": feePreview.confirmation.token }, body: { queueFees, reason: "Plan Matrix queue fee update", previewRevision: feePreview.preview.revision } });
      setPlans((current) => current.map((item) => item.slug === planData.plan.slug ? planData.plan : item)); setFees(feeData.queueFees);
      notifications.show({ color: "teal", title: "Plan policy published", message: "New admissions now use the updated live defaults; existing work is preserved." });
    } catch (error) { notifications.show({ color: "red", title: "Plan policy not saved", message: error instanceof Error ? error.message : "Please try again." }); }
    finally { setBusy(false); }
  }

  async function loadCapacity(nextTenantId: string | null) {
    setTenantId(nextTenantId); setCapacity(null);
    if (!nextTenantId) return;
    try {
      const capacityData = await apiRequest<{ capacity: Capacity }>(`/platform/tenants/${nextTenantId}/capacity`, { token });
      setCapacity(capacityData.capacity);
      if (capabilities.tenantOverrides) {
        const overrideData = await apiRequest<{ overrides: EntitlementOverride[] }>(`/platform/tenants/${nextTenantId}/entitlement-overrides`, { token });
        setOverrides(overrideData.overrides);
      } else {
        setOverrides([]);
      }
    }
    catch (error) { notifications.show({ color: "red", title: "Capacity unavailable", message: error instanceof Error ? error.message : "Please try again." }); }
  }

  async function publishOverride() {
    if (!tenantId || !capacity?.subscriptionId || overrideForm.reason.trim().length < 8) return;
    const value = overrideForm.policyKey.startsWith("feature.")
      ? overrideForm.value === "true"
      : Number(overrideForm.value);
    if (!overrideForm.policyKey.startsWith("feature.") && (!Number.isInteger(value) || Number(value) < 0)) return;
    const payload = { tenantId, subscriptionId: capacity.subscriptionId, policyKey: overrideForm.policyKey, value, expiresAt: overrideForm.expiresAt || null };
    setBusy(true);
    try {
      const preview = await apiRequest<{ confirmation:{token:string};preview:{revision:string} }>("/platform/privileged-actions/preview", { method:"POST", token, body:{ action:"entitlement.override.publish", target:tenantId, reason:overrideForm.reason, payload, previewRevision:"entitlement-override-v1" } });
      await apiRequest(`/platform/tenants/${tenantId}/entitlement-overrides`, { method:"POST", token, headers:{"X-Transaction-Confirmation":preview.confirmation.token}, body:{...payload,reason:overrideForm.reason,previewRevision:preview.preview.revision} });
      setOverrideOpened(false); setOverrideForm({ policyKey:"feature.branding",value:"false",expiresAt:"",reason:"" }); await loadCapacity(tenantId);
      notifications.show({color:"teal",title:"Tenant override published",message:"The sparse exception is active and plan defaults remain unchanged."});
    } catch (error) { notifications.show({color:"red",title:"Override not published",message:error instanceof Error ? error.message : "Please try again."}); }
    finally { setBusy(false); }
  }

  async function submitGrant() {
    if (!tenantId || grant.reason.trim().length < 8 || (!grant.ticketUnits && !grant.journeyUnits)) return;
    setBusy(true);
    const payload = { tenantId, ticketUnits: grant.ticketUnits, journeyUnits: grant.journeyUnits, expiresAt: grant.expiresAt || null };
    try {
      const preview = await apiRequest<{ confirmation: { token: string }; preview: { revision: string } }>("/platform/privileged-actions/preview", { method: "POST", token, body: { action: "credit.grant", target: tenantId, reason: grant.reason, payload, previewRevision: "usage-credit-v1" } });
      await apiRequest(`/platform/tenants/${tenantId}/credit-grants`, { method: "POST", token, headers: { "X-Transaction-Confirmation": preview.confirmation.token }, body: { ...payload, reason: grant.reason, previewRevision: preview.preview.revision } });
      setGrantOpened(false); setGrant({ ticketUnits: 0, journeyUnits: 0, expiresAt: "", reason: "" }); await loadCapacity(tenantId);
      notifications.show({ color: "teal", title: "Credits granted", message: "The new auditable credit lots are available to this vendor." });
    } catch (error) { notifications.show({ color: "red", title: "Credits not granted", message: error instanceof Error ? error.message : "Please try again." }); }
    finally { setBusy(false); }
  }

  async function revokeLot(lot: CreditLot) {
    if (!tenantId) return;
    setTaskUnits(lot.remainingUnits); setTaskReason(""); setProviderDisputeId("");
    setCreditTask({ action: "credit.revoke", target: lot.id, endpoint: `/platform/credit-lots/${lot.id}/revoke`, payload: { lotId: lot.id }, title: "Remove unused credits", description: "Choose how many unused units to remove. Consumed, frozen, or reserved credits remain protected.", maxUnits: lot.remainingUnits });
  }

  function openCreditTask(task: CreditTask) { setTaskReason(""); setTaskUnits(task.maxUnits || 0); setProviderDisputeId(""); setCreditTask(task); }

  async function runCaseAction(task: CreditTask) {
    if (taskReason.trim().length < 8) return;
    const payload = { ...task.payload, ...(task.maxUnits ? { units: taskUnits } : {}), ...(task.needsProviderDisputeId ? { providerDisputeId } : {}) };
    setBusy(true);
    try {
      const preview = await apiRequest<{ confirmation: { token: string }; preview: { revision: string } }>("/platform/privileged-actions/preview", { method: "POST", token, body: { action: task.action, target: task.target, reason: taskReason, payload, previewRevision: "usage-credit-v1" } });
      await apiRequest(task.endpoint, { method: "POST", token, headers: { "X-Transaction-Confirmation": preview.confirmation.token }, body: { ...payload, reason: taskReason, previewRevision: preview.preview.revision } });
      setCreditTask(null); await load(); if (tenantId) await loadCapacity(tenantId); notifications.show({ color: "teal", title: "Credit case updated", message: "The balance and provider state were reconciled without rewriting consumed history." });
    } catch (error) { notifications.show({ color: "red", title: "Credit case not updated", message: error instanceof Error ? error.message : "Please try again." }); }
    finally { setBusy(false); }
  }

  async function publishPack() {
    if (!editingPack || reason.trim().length < 8) return;
    setBusy(true);
    const payload = { code: editingPack.code, name: editingPack.name, state: editingPack.state, ticketUnits: editingPack.ticketUnits, journeyUnits: editingPack.journeyUnits, priceCents: editingPack.priceCents };
    try {
      const preview = await apiRequest<{ confirmation: { token: string }; preview: { revision: string } }>("/platform/credit-actions/preview", { method: "POST", token, body: { action: "credit.pack.publish", target: editingPack.code, reason, payload, previewRevision: "usage-credit-v1" } });
      const result = await apiRequest<{ pack: CreditPack }>(`/platform/credit-packs/${editingPack.code}`, { method: "PATCH", token, headers: { "X-Transaction-Confirmation": preview.confirmation.token }, body: { ...editingPack, reason, previewRevision: preview.preview.revision } });
      setPacks((current) => current.map((item) => item.code === result.pack.code ? result.pack : item)); setEditingPack(null); setReason("");
      notifications.show({ color: "teal", title: "Credit pack published", message: `${result.pack.code} revision ${result.pack.revision} is now ${result.pack.state}.` });
    } catch (error) { notifications.show({ color: "red", title: "Credit pack not published", message: error instanceof Error ? error.message : "Please try again." }); }
    finally { setBusy(false); }
  }

  if (!plan) return <Text>Loading Plan Matrix…</Text>;
  return <Stack gap="lg" className="plan-matrix">
    <div><Text c="orange" fw={700} size="xs">PLAN CONTROLS</Text><Title order={2}>Plan Matrix</Title><Text c="dimmed">Control live plan entitlements, monthly allowances, queue fees, and auditable Usage Credit packs.</Text></div>
    <SegmentedControl className="plan-matrix__rail" fullWidth value={selected} onChange={(value) => setSelected(value as SubscriptionPlanSlug)} data={plans.map((item) => ({ label: item.name, value: item.slug }))} />
    <Paper className="portal-card" p="lg">
      <Stack gap="lg">
        <Group className="plan-matrix__plan-header" justify="space-between" align="flex-start"><div><Title order={3}>{plan.name}</Title><Text c="dimmed">Policy revision {plan.policyRevision ?? 1} · {subscriberCount.toLocaleString()} current {subscriberCount === 1 ? "subscriber" : "subscribers"}</Text><Text c="dimmed" size="sm">Saving changes publishes the live default for inheriting vendors. Sparse tenant overrides remain unchanged and admitted work is preserved.</Text></div><Stack className="plan-matrix__plan-actions" gap="sm" align="flex-end"><Badge color={plan.checkoutEnabled ? "teal" : "gray"}>{plan.checkoutEnabled ? "Checkout enabled" : "No checkout"}</Badge><Button className="plan-matrix__save" disabled={!capabilities.planPolicyMutations} loading={busy} onClick={() => void savePlan()}>Save changes</Button></Stack></Group>
        {!capabilities.planPolicyMutations ? <Text c="orange" size="sm">Plan publishing is currently disabled by the server rollout control. Values remain visible for review.</Text> : null}
        <SimpleGrid cols={{ base: 1, md: 2 }}>
          <Card withBorder><Stack><Text fw={700}>Feature entitlements</Text>{Object.entries(featureLabels).map(([key, label]) => <Checkbox key={key} label={label} checked={Boolean(plan.features?.[key as keyof typeof featureLabels])} disabled={key === "queue" && plan.slug === "free"} onChange={(event) => updatePlan((current) => ({ ...current, features: { ...current.features!, [key]: event.target.checked, ...(key === "booking" && !event.target.checked ? { campaigns: false } : {}) } }))} />)}</Stack></Card>
          <Card withBorder><Stack><Text fw={700}>Monthly allowances</Text>{Object.entries(allowanceLabels).map(([key, label]) => <NumberInput key={key} min={0} label={label} value={plan.allowances?.[key as keyof typeof allowanceLabels] ?? 0} onChange={(value) => updatePlan((current) => ({ ...current, allowances: { ...current.allowances!, [key]: Number(value) || 0 } }))} />)}</Stack></Card>
        </SimpleGrid>
        <SimpleGrid cols={{ base: 1, md: 2 }}><Card withBorder><Stack><Text fw={700}>Operational limits</Text>{Object.entries(numericEntitlementLabels).map(([key,label]) => <NumberInput key={key} min={0} label={label} value={Number(plan.entitlements?.[key as keyof typeof numericEntitlementLabels] || 0)} onChange={(value) => updatePlan((current) => ({...current,entitlements:{...current.entitlements,[key]:Number(value) || 0}}))}/>)}</Stack></Card><Card withBorder><Stack><Text fw={700}>Workspace capabilities</Text>{Object.entries(booleanEntitlementLabels).map(([key,label]) => <Checkbox key={key} label={label} checked={Boolean(plan.entitlements?.[key as keyof typeof booleanEntitlementLabels])} onChange={(event) => updatePlan((current) => ({...current,entitlements:{...current.entitlements,[key]:event.target.checked}}))}/>)}</Stack></Card></SimpleGrid>
        <Card withBorder><Group grow align="end"><Checkbox label="Customer queue fee enabled" checked={Boolean(fee?.enabled)} onChange={(event) => setFees((current) => current.map((item) => item.planSlug === selected ? { ...item, enabled: event.target.checked } : item))} /><NumberInput min={0} label="Queue fee amount (centavos)" value={fee?.amountCents ?? 0} onChange={(value) => setFees((current) => current.map((item) => item.planSlug === selected ? { ...item, amountCents: Number(value) || 0 } : item))} /></Group></Card>
      </Stack>
    </Paper>
    {capabilities.usageCreditCatalog ? <><div><Title order={3}>Usage Credit catalog</Title><Text c="dimmed">Credits bypass Queue Ticket and Queue Email Journey limits only. Service Booking limits remain hard.</Text></div><SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>{packs.map((pack) => <Card className="portal-card" key={pack.code} padding="lg"><Stack><Group justify="space-between"><Title order={4}>{pack.code}</Title><Badge color={pack.state === "enabled" ? "teal" : "gray"}>{pack.state}</Badge></Group><Text>{pack.ticketUnits.toLocaleString()} Queue Tickets + {pack.journeyUnits.toLocaleString()} Queue Email Journeys</Text><Text fw={700}>{pack.priceDisplay}</Text><Text c="dimmed" size="sm">Revision {pack.revision}</Text><Button variant="light" onClick={() => { setEditingPack(pack); setReason(""); }}>Edit pack</Button></Stack></Card>)}</SimpleGrid></> : null}
    <Paper className="portal-card" p="lg"><Stack><Group justify="space-between"><div><Title order={3}>Vendor entitlement administration</Title><Text c="dimmed">Inspect effective policy provenance and monthly capacity. Optional overrides and Usage Credit operations appear only when their server controls are enabled.</Text></div><Group><Button variant="light" disabled={!capabilities.tenantOverrides || !tenantId || !capacity?.subscriptionId} onClick={() => setOverrideOpened(true)}>Add override</Button><Button disabled={!capabilities.usageCreditAdministration || !tenantId} onClick={() => setGrantOpened(true)}>Grant credits</Button></Group></Group><Select searchable clearable label="Vendor" placeholder="Select a vendor" value={tenantId} onChange={(value) => void loadCapacity(value)} data={tenants.map((item) => ({ value: String(item._id ?? item.id), label: `${item.name ?? item.slug ?? "Vendor"}${item.slug ? ` (${item.slug})` : ""}` }))}/>{capacity && <><Group><Badge>{capacity.planSlug}</Badge><Text c="dimmed" size="sm">Subscription {capacity.subscriptionId || "requires reconciliation"} · policy revision {capacity.planRevision ?? "--"}</Text></Group><SimpleGrid cols={{ base: 1, sm: 3 }}>{Object.entries(capacity.resources).map(([key, resource]) => <Card withBorder key={key}><Group justify="space-between"><Text fw={700}>{allowanceLabels[key as keyof typeof allowanceLabels] ?? key}</Text><Badge color={resource.source === "override" ? "orange" : "gray"}>{resource.source}</Badge></Group><Text>{resource.used.toLocaleString()} of {resource.limit.toLocaleString()} base used</Text><Text c="teal">{resource.creditRemaining.toLocaleString()} credits available</Text>{resource.warningThresholds?.length ? <Group gap="xs" mt="xs">{resource.warningThresholds.map((warning) => <Badge key={warning.thresholdPercent} color={warning.deliveredAt ? "orange" : "yellow"} variant="light">{warning.thresholdPercent}% {warning.deliveredAt ? "notified" : "pending"}</Badge>)}</Group> : null}</Card>)}</SimpleGrid><Card withBorder><Stack gap="xs"><Group justify="space-between"><Text fw={700}>Effective feature provenance</Text><Text c="dimmed" size="sm">Plan defaults plus active sparse overrides</Text></Group>{Object.entries(capacity.features).map(([key, feature]) => <Group key={key} justify="space-between"><Text>{featureLabels[key as keyof typeof featureLabels] ?? key}</Text><Group><Badge color={feature.enabled ? "teal" : "gray"}>{feature.enabled ? "Enabled" : "Disabled"}</Badge><Badge color={feature.source === "override" ? "orange" : "gray"}>{feature.source}{feature.suppressedBy ? ` · suppressed by ${feature.suppressedBy}` : ""}</Badge></Group></Group>)}</Stack></Card>{capabilities.tenantOverrides ? <Card withBorder><Stack gap="xs"><Group justify="space-between"><Text fw={700}>Tenant overrides</Text><Text c="dimmed" size="sm">Revoked and expired entries stay visible as evidence.</Text></Group>{overrides.length === 0 ? <Text c="dimmed">This vendor inherits every live plan default.</Text> : overrides.map((item) => <Group key={item.id} justify="space-between"><div><Text fw={700}>{item.policy_key} = {String(item.value)}</Text><Text c="dimmed" size="sm">{item.reason}{item.expires_at ? ` · expires ${new Date(item.expires_at).toLocaleString()}` : ""}{item.revoked_at ? " · revoked" : ""}</Text></div><Button color="red" variant="light" disabled={busy || Boolean(item.revoked_at) || !tenantId} onClick={() => tenantId && openCreditTask({action:"entitlement.override.revoke",target:item.id,endpoint:`/platform/tenants/${tenantId}/entitlement-overrides/${item.id}/revoke`,payload:{tenantId,overrideId:item.id},title:"Revoke tenant override",description:`Return ${item.policy_key} to the live ${capacity.planSlug} plan default while preserving this override as audit evidence.`})}>Revoke</Button></Group>)}</Stack></Card> : null}{capabilities.usageCreditAdministration ? <Stack>{capacity.lots.length === 0 ? <Text c="dimmed">No credit lots for this vendor.</Text> : capacity.lots.map((lot) => <Card withBorder key={lot.id}><Group justify="space-between" align="center"><div><Text fw={700}>{lot.resourceKey} · {lot.sourceType}</Text><Text size="sm">{lot.remainingUnits.toLocaleString()} remaining of {lot.grantedUnits.toLocaleString()} · {lot.reason || "No reason recorded"}</Text></div><Button color="red" variant="light" disabled={busy || lot.remainingUnits < 1} onClick={() => void revokeLot(lot)}>Remove unused</Button></Group></Card>)}</Stack> : null}</>}</Stack></Paper>
    {capabilities.usageCreditCases ? <Paper className="portal-card" p="lg"><Stack><Group justify="space-between"><div><Title order={3}>Purchases, refunds, and disputes</Title><Text c="dimmed">Provider-pending cases keep unused credits frozen until a confirmed outcome is recorded.</Text></div><Group><Button component="a" href="/subscriptions" variant="subtle">Subscription transitions</Button><Button component="a" href="/security-audit" variant="subtle">Security audit</Button></Group></Group>{purchases.length === 0 ? <Text c="dimmed">No Usage Credit purchases yet.</Text> : purchases.slice(0, 20).map((purchase) => { const refund = refunds.find((item) => String(item.purchase_id) === String(purchase.id)); const dispute = disputes.find((item) => String(item.purchase_id) === String(purchase.id)); return <Card withBorder key={purchase.id}><Group justify="space-between" align="center"><div><Text fw={700}>{purchase.pack_code || purchase.pack_name} · PHP {(Number(purchase.amount_cents) / 100).toLocaleString("en-PH")}</Text><Text size="sm" c="dimmed">Purchase {purchase.id} · {purchase.status}{refund ? ` · refund ${refund.status}` : ""}{dispute ? ` · dispute ${dispute.status}` : ""}</Text></div><Group>{refund?.status === "requested" || refund?.status === "provider_pending" ? <><Button variant="light" onClick={() => openCreditTask({ action: "credit.refund.resolve", target: String(purchase.id), endpoint: `/platform/credit-purchases/${purchase.id}/refunds/resolve`, payload: { purchaseId: String(purchase.id), outcome: "failed", providerRefundId: refund.provider_refund_id || null }, title: "Restore Usage Credits", description: "Record a failed or canceled provider refund and make the unused credits available again." })}>Restore credits</Button><Button onClick={() => openCreditTask({ action: "credit.refund.resolve", target: String(purchase.id), endpoint: `/platform/credit-purchases/${purchase.id}/refunds/resolve`, payload: { purchaseId: String(purchase.id), outcome: "confirmed", providerRefundId: refund.provider_refund_id || null }, title: "Confirm provider refund", description: "Confirm that the provider returned the funds and permanently revoke the unused credit lots." })}>Confirm refund</Button></> : null}{purchase.status === "fulfilled" && !dispute ? <Button color="orange" variant="light" onClick={() => openCreditTask({ action: "credit.dispute.open", target: String(purchase.id), endpoint: `/platform/credit-purchases/${purchase.id}/disputes`, payload: { purchaseId: String(purchase.id) }, title: "Open provider dispute", description: "Record the provider dispute and freeze unused credits while preserving active customer reservations.", needsProviderDisputeId: true })}>Open dispute</Button> : null}{dispute?.status === "open" ? <><Button variant="light" onClick={() => openCreditTask({ action: "credit.dispute.resolve", target: dispute.provider_dispute_id, endpoint: `/platform/credit-disputes/${dispute.provider_dispute_id}/resolve`, payload: { providerDisputeId: dispute.provider_dispute_id, outcome: "won" }, title: "Record dispute won", description: "Restore eligible unused credits after the provider resolves the dispute in the vendor's favor." })}>Dispute won</Button><Button color="red" variant="light" onClick={() => openCreditTask({ action: "credit.dispute.resolve", target: dispute.provider_dispute_id, endpoint: `/platform/credit-disputes/${dispute.provider_dispute_id}/resolve`, payload: { providerDisputeId: dispute.provider_dispute_id, outcome: "lost" }, title: "Record dispute lost", description: "Revoke unreserved unused credits while preserving consumed history and active reservations." })}>Dispute lost</Button></> : null}</Group></Group></Card>; })}</Stack></Paper> : null}
    <Modal opened={overrideOpened} onClose={() => !busy && setOverrideOpened(false)} closeOnEscape={!busy} closeOnClickOutside={!busy} title={<div className="getprio-modal-title"><Text className="getprio-modal-eyebrow">TENANT ENTITLEMENT</Text><Title className="getprio-modal-heading" order={3}>Add a sparse override</Title></div>} centered size="lg" classNames={{ content:"task-modal",body:"task-modal__body" }}>
      <div className="task-modal-form"><Stack className="task-modal-form__main"><Text>The selected vendor will stop inheriting this one plan value until the override expires or is revoked. Other plan defaults stay live.</Text><Select label="Policy" value={overrideForm.policyKey} onChange={(value) => value && setOverrideForm((current) => ({...current,policyKey:value,value:value.startsWith("feature.") ? "false" : "0"}))} data={[...Object.entries(featureLabels).map(([key,label]) => ({value:`feature.${key}`,label})),...Object.entries(allowanceLabels).map(([key,label]) => ({value:`allowance.${key}`,label}))]}/>{overrideForm.policyKey.startsWith("feature.") ? <Select label="Effective value" value={overrideForm.value} onChange={(value) => value && setOverrideForm((current) => ({...current,value}))} data={[{value:"true",label:"Enabled"},{value:"false",label:"Disabled"}]}/> : <NumberInput min={0} label="Monthly limit" value={Number(overrideForm.value)} onChange={(value) => setOverrideForm((current) => ({...current,value:String(Number(value) || 0)}))}/>}<TextInput type="datetime-local" label="Expires at (optional)" value={overrideForm.expiresAt} onChange={(event) => setOverrideForm((current) => ({...current,expiresAt:event.target.value}))}/><TextInput label="Reason" description="Stored with the override and security audit." value={overrideForm.reason} onChange={(event) => setOverrideForm((current) => ({...current,reason:event.target.value}))}/></Stack><Group className="subscription-editor__footer" justify="space-between"><Text c="dimmed" size="sm">Review the subscriber impact before publishing.</Text><Button loading={busy} disabled={overrideForm.reason.trim().length < 8} onClick={() => void publishOverride()}>Review and publish override</Button></Group></div>
    </Modal>
    <Modal opened={Boolean(editingPack)} onClose={() => !busy && setEditingPack(null)} closeOnEscape={!busy} closeOnClickOutside={!busy} title={<div className="getprio-modal-title"><Text className="getprio-modal-eyebrow">USAGE CREDIT CATALOG</Text><Title className="getprio-modal-heading" order={3}>Publish {editingPack?.code}</Title></div>} centered size="lg" classNames={{ content: "task-modal", body: "task-modal__body" }}>
      {editingPack && <div className="task-modal-form"><Stack className="task-modal-form__main"><Text>Publishing creates an immutable revision. Existing purchases keep their original quantities and price.</Text><TextInput label="Pack name" value={editingPack.name} onChange={(event) => setEditingPack({ ...editingPack, name: event.target.value })}/><Select label="Availability" value={editingPack.state} data={["draft","enabled","disabled"]} onChange={(value) => value && setEditingPack({ ...editingPack, state: value as CreditPack["state"] })}/><SimpleGrid cols={{ base: 1, sm: 3 }}><NumberInput min={1} label="Ticket credits" value={editingPack.ticketUnits} onChange={(value) => setEditingPack({ ...editingPack, ticketUnits: Number(value) || 0 })}/><NumberInput min={1} label="Journey credits" value={editingPack.journeyUnits} onChange={(value) => setEditingPack({ ...editingPack, journeyUnits: Number(value) || 0 })}/><NumberInput min={1} label="Price (centavos)" value={editingPack.priceCents} onChange={(value) => setEditingPack({ ...editingPack, priceCents: Number(value) || 0 })}/></SimpleGrid><TextInput label="Reason for this revision" value={reason} onChange={(event) => setReason(event.target.value)} /></Stack><Group className="subscription-editor__footer" justify="space-between"><Text c="dimmed" size="sm">Existing purchases retain their original immutable revision.</Text><Button loading={busy} disabled={reason.trim().length < 8} onClick={() => void publishPack()}>Review and publish revision</Button></Group></div>}
    </Modal>
    <Modal opened={grantOpened} onClose={() => !busy && setGrantOpened(false)} closeOnEscape={!busy} closeOnClickOutside={!busy} title={<div className="getprio-modal-title"><Text className="getprio-modal-eyebrow">VENDOR USAGE CREDITS</Text><Title className="getprio-modal-heading" order={3}>Grant capacity</Title></div>} centered size="lg" classNames={{ content: "task-modal", body: "task-modal__body" }}><div className="task-modal-form"><Stack className="task-modal-form__main"><Text>Choose one or both resources. Promotional credits are used before purchased credits and may have an optional expiry.</Text><SimpleGrid cols={{ base: 1, sm: 2 }}><NumberInput min={0} label="Queue Ticket credits" value={grant.ticketUnits} onChange={(value) => setGrant({ ...grant, ticketUnits: Number(value) || 0 })}/><NumberInput min={0} label="Queue Email Journey credits" value={grant.journeyUnits} onChange={(value) => setGrant({ ...grant, journeyUnits: Number(value) || 0 })}/></SimpleGrid><TextInput type="datetime-local" label="Expires at (optional)" value={grant.expiresAt} onChange={(event) => setGrant({ ...grant, expiresAt: event.target.value })}/><TextInput label="Reason for this grant" value={grant.reason} onChange={(event) => setGrant({ ...grant, reason:event.target.value })}/></Stack><Group className="subscription-editor__footer" justify="space-between"><Text c="dimmed" size="sm">The grant and reason become permanent audit evidence.</Text><Button loading={busy} disabled={grant.reason.trim().length < 8 || (!grant.ticketUnits && !grant.journeyUnits)} onClick={() => void submitGrant()}>Review and grant credits</Button></Group></div></Modal>
    <Modal opened={Boolean(creditTask)} onClose={() => !busy && setCreditTask(null)} closeOnEscape={!busy} closeOnClickOutside={!busy} title={<div className="getprio-modal-title"><Text className="getprio-modal-eyebrow">USAGE CREDIT CONTROL</Text><Title className="getprio-modal-heading" order={3}>{creditTask?.title}</Title></div>} centered size="lg" classNames={{ content: "task-modal", body: "task-modal__body" }}>{creditTask && <div className="task-modal-form"><Stack className="task-modal-form__main"><Text>{creditTask.description}</Text>{creditTask.maxUnits ? <NumberInput min={1} max={creditTask.maxUnits} label={`Units to remove (maximum ${creditTask.maxUnits})`} value={taskUnits} onChange={(value) => setTaskUnits(Number(value) || 0)}/> : null}{creditTask.needsProviderDisputeId ? <TextInput label="Provider dispute ID" value={providerDisputeId} onChange={(event) => setProviderDisputeId(event.target.value)}/> : null}<TextInput label="Reason" description="This reason is stored in the security audit." value={taskReason} onChange={(event) => setTaskReason(event.target.value)}/></Stack><Group className="subscription-editor__footer" justify="space-between"><Text c="dimmed" size="sm">Review the provider evidence and impact before confirming.</Text><Button loading={busy} disabled={taskReason.trim().length < 8 || Boolean(creditTask.maxUnits && (taskUnits < 1 || taskUnits > creditTask.maxUnits)) || Boolean(creditTask.needsProviderDisputeId && !providerDisputeId.trim())} onClick={() => void runCaseAction(creditTask)}>Review and confirm</Button></Group></div>}</Modal>
  </Stack>;
}
