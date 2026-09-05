import { CreditTaskModal } from "../components/CreditTaskModal";
import { featureLabels, allowanceLabels, type CreditTask, type PlanMatrixCapabilities } from "./planControls";
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Checkbox, Group, Modal, NumberInput, Paper, SegmentedControl, Select, SimpleGrid, Stack, Text, TextInput, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import type { PlatformPlansResponse, PlatformQueueFeesResponse, QueueFeeSetting, SubscriptionPlan, SubscriptionPlanSlug } from "@shared";
import { apiRequest } from "../api";

type CreditPack = { code: string; name: string; state: "draft" | "enabled" | "disabled" | "archived"; revision: number; ticketUnits: number; journeyUnits: number; priceCents: number; priceDisplay: string };
type TenantOption = { _id?: string; id?: string; name?: string; slug?: string; planSlug?: SubscriptionPlanSlug | null };
type CreditPurchase = { id: string; tenant_id: string; pack_code: string; pack_name: string; status: string; amount_cents: number; currency: string; created_at: string };
type CreditRefund = { id: string; purchase_id: string; status: string; reason: string; provider_refund_id?: string | null };
type CreditDispute = { id: string; purchase_id: string; provider_dispute_id: string; status: string; consumed_exposure_units: number };
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
  const [purchases, setPurchases] = useState<CreditPurchase[]>([]);
  const [refunds, setRefunds] = useState<CreditRefund[]>([]);
  const [disputes, setDisputes] = useState<CreditDispute[]>([]);
  const [creditTask, setCreditTask] = useState<CreditTask | null>(null);
  const [taskReason, setTaskReason] = useState("");
  const [taskUnits, setTaskUnits] = useState(0);
  const [providerDisputeId, setProviderDisputeId] = useState("");
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

  function openCreditTask(task: CreditTask) { setTaskReason(""); setTaskUnits(task.maxUnits || 0); setProviderDisputeId(""); setCreditTask(task); }

  async function runCaseAction(task: CreditTask) {
    if (taskReason.trim().length < 8) return;
    const payload = { ...task.payload, ...(task.maxUnits ? { units: taskUnits } : {}), ...(task.needsProviderDisputeId ? { providerDisputeId } : {}) };
    setBusy(true);
    try {
      const preview = await apiRequest<{ confirmation: { token: string }; preview: { revision: string } }>("/platform/privileged-actions/preview", { method: "POST", token, body: { action: task.action, target: task.target, reason: taskReason, payload, previewRevision: "usage-credit-v1" } });
      await apiRequest(task.endpoint, { method: "POST", token, headers: { "X-Transaction-Confirmation": preview.confirmation.token }, body: { ...payload, reason: taskReason, previewRevision: preview.preview.revision } });
      setCreditTask(null); await load(); notifications.show({ color: "teal", title: "Credit case updated", message: "The balance and provider state were reconciled without rewriting consumed history." });
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
    {capabilities.usageCreditCases ? <Paper className="portal-card" p="lg"><Stack><Group justify="space-between"><div><Title order={3}>Purchases, refunds, and disputes</Title><Text c="dimmed">Provider-pending cases keep unused credits frozen until a confirmed outcome is recorded.</Text></div><Group><Button component="a" href="/subscriptions" variant="subtle">Subscription transitions</Button><Button component="a" href="/security-audit" variant="subtle">Security audit</Button></Group></Group>{purchases.length === 0 ? <Text c="dimmed">No Usage Credit purchases yet.</Text> : purchases.slice(0, 20).map((purchase) => { const refund = refunds.find((item) => String(item.purchase_id) === String(purchase.id)); const dispute = disputes.find((item) => String(item.purchase_id) === String(purchase.id)); return <Card withBorder key={purchase.id}><Group justify="space-between" align="center"><div><Text fw={700}>{purchase.pack_code || purchase.pack_name} · PHP {(Number(purchase.amount_cents) / 100).toLocaleString("en-PH")}</Text><Text size="sm" c="dimmed">Purchase {purchase.id} · {purchase.status}{refund ? ` · refund ${refund.status}` : ""}{dispute ? ` · dispute ${dispute.status}` : ""}</Text></div><Group>{refund?.status === "requested" || refund?.status === "provider_pending" ? <><Button variant="light" onClick={() => openCreditTask({ action: "credit.refund.resolve", target: String(purchase.id), endpoint: `/platform/credit-purchases/${purchase.id}/refunds/resolve`, payload: { purchaseId: String(purchase.id), outcome: "failed", providerRefundId: refund.provider_refund_id || null }, title: "Restore Usage Credits", description: "Record a failed or canceled provider refund and make the unused credits available again." })}>Restore credits</Button><Button onClick={() => openCreditTask({ action: "credit.refund.resolve", target: String(purchase.id), endpoint: `/platform/credit-purchases/${purchase.id}/refunds/resolve`, payload: { purchaseId: String(purchase.id), outcome: "confirmed", providerRefundId: refund.provider_refund_id || null }, title: "Confirm provider refund", description: "Confirm that the provider returned the funds and permanently revoke the unused credit lots." })}>Confirm refund</Button></> : null}{purchase.status === "fulfilled" && !dispute ? <Button color="orange" variant="light" onClick={() => openCreditTask({ action: "credit.dispute.open", target: String(purchase.id), endpoint: `/platform/credit-purchases/${purchase.id}/disputes`, payload: { purchaseId: String(purchase.id) }, title: "Open provider dispute", description: "Record the provider dispute and freeze unused credits while preserving active customer reservations.", needsProviderDisputeId: true })}>Open dispute</Button> : null}{dispute?.status === "open" ? <><Button variant="light" onClick={() => openCreditTask({ action: "credit.dispute.resolve", target: dispute.provider_dispute_id, endpoint: `/platform/credit-disputes/${dispute.provider_dispute_id}/resolve`, payload: { providerDisputeId: dispute.provider_dispute_id, outcome: "won" }, title: "Record dispute won", description: "Restore eligible unused credits after the provider resolves the dispute in the vendor's favor." })}>Dispute won</Button><Button color="red" variant="light" onClick={() => openCreditTask({ action: "credit.dispute.resolve", target: dispute.provider_dispute_id, endpoint: `/platform/credit-disputes/${dispute.provider_dispute_id}/resolve`, payload: { providerDisputeId: dispute.provider_dispute_id, outcome: "lost" }, title: "Record dispute lost", description: "Revoke unreserved unused credits while preserving consumed history and active reservations." })}>Dispute lost</Button></> : null}</Group></Group></Card>; })}</Stack></Paper> : null}
    <Modal opened={Boolean(editingPack)} onClose={() => !busy && setEditingPack(null)} closeOnEscape={!busy} closeOnClickOutside={!busy} title={<div className="getprio-modal-title"><Text className="getprio-modal-eyebrow">USAGE CREDIT CATALOG</Text><Title className="getprio-modal-heading" order={3}>Publish {editingPack?.code}</Title></div>} centered size="lg" classNames={{ content: "task-modal", body: "task-modal__body" }}>
      {editingPack && <div className="task-modal-form"><Stack className="task-modal-form__main"><Text>Publishing creates an immutable revision. Existing purchases keep their original quantities and price.</Text><TextInput label="Pack name" value={editingPack.name} onChange={(event) => setEditingPack({ ...editingPack, name: event.target.value })}/><Select label="Availability" value={editingPack.state} data={["draft","enabled","disabled"]} onChange={(value) => value && setEditingPack({ ...editingPack, state: value as CreditPack["state"] })}/><SimpleGrid cols={{ base: 1, sm: 3 }}><NumberInput min={1} label="Ticket credits" value={editingPack.ticketUnits} onChange={(value) => setEditingPack({ ...editingPack, ticketUnits: Number(value) || 0 })}/><NumberInput min={1} label="Journey credits" value={editingPack.journeyUnits} onChange={(value) => setEditingPack({ ...editingPack, journeyUnits: Number(value) || 0 })}/><NumberInput min={1} label="Price (centavos)" value={editingPack.priceCents} onChange={(value) => setEditingPack({ ...editingPack, priceCents: Number(value) || 0 })}/></SimpleGrid><TextInput label="Reason for this revision" value={reason} onChange={(event) => setReason(event.target.value)} /></Stack><Group className="subscription-editor__footer" justify="space-between"><Text c="dimmed" size="sm">Existing purchases retain their original immutable revision.</Text><Button loading={busy} disabled={reason.trim().length < 8} onClick={() => void publishPack()}>Review and publish revision</Button></Group></div>}
    </Modal>
    <CreditTaskModal creditTask={creditTask} busy={busy} setCreditTask={setCreditTask} taskUnits={taskUnits} setTaskUnits={setTaskUnits} providerDisputeId={providerDisputeId} setProviderDisputeId={setProviderDisputeId} taskReason={taskReason} setTaskReason={setTaskReason} runCaseAction={runCaseAction} />
  </Stack>;
}
