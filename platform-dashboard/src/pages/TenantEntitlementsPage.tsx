import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Alert, Badge, Button, Card, Group, Modal, NumberInput, Paper, Select, SimpleGrid, Stack, Text, TextInput, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { apiRequest } from "../api";
import { CreditTaskModal } from "../components/CreditTaskModal";
import { featureLabels, allowanceLabels, type Capacity, type CreditLot, type CreditTask, type EntitlementOverride, type PlanMatrixCapabilities } from "./planControls";

export function TenantEntitlementsPage({ token }: { token: string }) {
  const { tenantId = "" } = useParams();
  return <TenantEntitlements key={tenantId} token={token} tenantId={tenantId} />;
}

function TenantEntitlements({ token, tenantId }: { token: string; tenantId: string }) {
  const [tenant, setTenant] = useState<{ id: string; name: string; slug: string } | null>(null);
  const [capacity, setCapacity] = useState<Capacity | null>(null);
  const [capabilities, setCapabilities] = useState<PlanMatrixCapabilities>({ planPolicyMutations: false, usageCreditCatalog: false, usageCreditAdministration: false, usageCreditCases: false, tenantOverrides: false });
  const [overrides, setOverrides] = useState<EntitlementOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [grantOpened, setGrantOpened] = useState(false);
  const [grant, setGrant] = useState({ ticketUnits: 0, journeyUnits: 0, expiresAt: "", reason: "" });
  const [overrideOpened, setOverrideOpened] = useState(false);
  const [overrideForm, setOverrideForm] = useState({ policyKey: "feature.branding", value: "false", expiresAt: "", reason: "" });
  const [creditTask, setCreditTask] = useState<CreditTask | null>(null);
  const [taskReason, setTaskReason] = useState("");
  const [taskUnits, setTaskUnits] = useState(0);
  const [providerDisputeId, setProviderDisputeId] = useState("");
  const request = useRef<AbortController | null>(null);

  async function loadCapacity() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true); setError("");
    try {
      const [capabilityData, capacityData] = await Promise.all([
        apiRequest<PlanMatrixCapabilities>("/platform/capabilities", { token, signal: controller.signal }),
        apiRequest<{ capacity: Capacity; tenant: { id: string; name: string; slug: string } }>(`/platform/tenants/${tenantId}/capacity`, { token, signal: controller.signal })
      ]);
      const overrideData = capabilityData.tenantOverrides
        ? await apiRequest<{ overrides: EntitlementOverride[] }>(`/platform/tenants/${tenantId}/entitlement-overrides`, { token, signal: controller.signal })
        : { overrides: [] };
      if (controller.signal.aborted) return;
      setCapabilities(capabilityData); setCapacity(capacityData.capacity); setTenant(capacityData.tenant); setOverrides(overrideData.overrides);
    } catch (failure) {
      if (!controller.signal.aborted) { setCapacity(null); setTenant(null); setError(failure instanceof Error ? failure.message : "Unable to load tenant entitlements."); }
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }
  useEffect(() => { void loadCapacity(); return () => request.current?.abort(); }, [tenantId, token]);

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
      setOverrideOpened(false); setOverrideForm({ policyKey:"feature.branding",value:"false",expiresAt:"",reason:"" }); await loadCapacity();
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
      setGrantOpened(false); setGrant({ ticketUnits: 0, journeyUnits: 0, expiresAt: "", reason: "" }); await loadCapacity();
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
      setCreditTask(null); await loadCapacity(); notifications.show({ color: "teal", title: "Credit case updated", message: "The balance and provider state were reconciled without rewriting consumed history." });
    } catch (error) { notifications.show({ color: "red", title: "Credit case not updated", message: error instanceof Error ? error.message : "Please try again." }); }
    finally { setBusy(false); }
  }


  return <Stack gap="lg" className="tenant-entitlements">
    <Group justify="space-between"><Button component={Link} to="/tenants" variant="subtle" mih={44}>Back to Tenants</Button><Button variant="light" mih={44} disabled={busy || loading} onClick={() => void loadCapacity()}>Refresh</Button></Group>
    {loading ? <Text role="status">Loading vendor entitlements…</Text> : error ? <Alert color="red" title="Entitlements unavailable">{error} Use Refresh to retry.</Alert> : <>
    <Paper className="portal-card" p="lg"><Stack><Group justify="space-between"><div><Title order={2}>{tenant?.name}</Title><Text size="sm" c="dimmed">Tenant ID {tenantId} · {tenant?.slug}</Text><Text c="dimmed">Inspect effective policy provenance and monthly capacity. Optional overrides and Usage Credit operations appear only when their server controls are enabled.</Text></div><Group><Button variant="light" disabled={!capabilities.tenantOverrides || !tenantId || !capacity?.subscriptionId} onClick={() => setOverrideOpened(true)}>Add override</Button><Button disabled={!capabilities.usageCreditAdministration || !tenantId} onClick={() => setGrantOpened(true)}>Grant credits</Button></Group></Group>{capacity && <><Group><Badge>{capacity.planSlug}</Badge><Text c="dimmed" size="sm">Subscription {capacity.subscriptionId || "requires reconciliation"} · policy revision {capacity.planRevision ?? "--"}</Text></Group><SimpleGrid cols={{ base: 1, sm: 3 }}>{Object.entries(capacity.resources).map(([key, resource]) => <Card withBorder key={key}><Group justify="space-between"><Text fw={700}>{allowanceLabels[key as keyof typeof allowanceLabels] ?? key}</Text><Badge color={resource.source === "override" ? "orange" : "gray"}>{resource.source}</Badge></Group><Text>{resource.used.toLocaleString()} of {resource.limit.toLocaleString()} base used</Text><Text c="teal">{resource.creditRemaining.toLocaleString()} credits available</Text>{resource.warningThresholds?.length ? <Group gap="xs" mt="xs">{resource.warningThresholds.map((warning) => <Badge key={warning.thresholdPercent} color={warning.deliveredAt ? "orange" : "yellow"} variant="light">{warning.thresholdPercent}% {warning.deliveredAt ? "notified" : "pending"}</Badge>)}</Group> : null}</Card>)}</SimpleGrid><Card withBorder><Stack gap="xs"><Group justify="space-between"><Text fw={700}>Effective feature provenance</Text><Text c="dimmed" size="sm">Plan defaults plus active sparse overrides</Text></Group>{Object.entries(capacity.features).map(([key, feature]) => <Group key={key} justify="space-between"><Text>{featureLabels[key as keyof typeof featureLabels] ?? key}</Text><Group><Badge color={feature.enabled ? "teal" : "gray"}>{feature.enabled ? "Enabled" : "Disabled"}</Badge><Badge color={feature.source === "override" ? "orange" : "gray"}>{feature.source}{feature.suppressedBy ? ` · suppressed by ${feature.suppressedBy}` : ""}</Badge></Group></Group>)}</Stack></Card>{capabilities.tenantOverrides ? <Card withBorder><Stack gap="xs"><Group justify="space-between"><Text fw={700}>Tenant overrides</Text><Text c="dimmed" size="sm">Revoked and expired entries stay visible as evidence.</Text></Group>{overrides.length === 0 ? <Text c="dimmed">This vendor inherits every live plan default.</Text> : overrides.map((item) => <Group key={item.id} justify="space-between"><div><Text fw={700}>{item.policy_key} = {String(item.value)}</Text><Text c="dimmed" size="sm">{item.reason}{item.expires_at ? ` · expires ${new Date(item.expires_at).toLocaleString()}` : ""}{item.revoked_at ? " · revoked" : ""}</Text></div><Button color="red" variant="light" disabled={busy || Boolean(item.revoked_at) || !tenantId} onClick={() => tenantId && openCreditTask({action:"entitlement.override.revoke",target:item.id,endpoint:`/platform/tenants/${tenantId}/entitlement-overrides/${item.id}/revoke`,payload:{tenantId,overrideId:item.id},title:"Revoke tenant override",description:`Return ${item.policy_key} to the live ${capacity.planSlug} plan default while preserving this override as audit evidence.`})}>Revoke</Button></Group>)}</Stack></Card> : null}{capabilities.usageCreditAdministration ? <Stack>{capacity.lots.length === 0 ? <Text c="dimmed">No credit lots for this vendor.</Text> : capacity.lots.map((lot) => <Card withBorder key={lot.id}><Group justify="space-between" align="center"><div><Text fw={700}>{lot.resourceKey} · {lot.sourceType}</Text><Text size="sm">{lot.remainingUnits.toLocaleString()} remaining of {lot.grantedUnits.toLocaleString()} · {lot.reason || "No reason recorded"}</Text></div><Button color="red" variant="light" disabled={busy || lot.remainingUnits < 1} onClick={() => void revokeLot(lot)}>Remove unused</Button></Group></Card>)}</Stack> : null}</>}</Stack></Paper>
    </>}
    <Modal closeButtonProps={{ "aria-label": "Close" }} opened={overrideOpened} onClose={() => !busy && setOverrideOpened(false)} closeOnEscape={!busy} closeOnClickOutside={!busy} title={<div className="getprio-modal-title"><Text className="getprio-modal-eyebrow">TENANT ENTITLEMENT</Text><Title className="getprio-modal-heading" order={3}>Add an override for {tenant?.name}</Title></div>} centered size="lg" classNames={{ content:"task-modal",body:"task-modal__body" }}>
      <div className="task-modal-form"><Stack className="task-modal-form__main"><Text>The selected vendor will stop inheriting this one plan value until the override expires or is revoked. Other plan defaults stay live.</Text><Select label="Policy" value={overrideForm.policyKey} onChange={(value) => value && setOverrideForm((current) => ({...current,policyKey:value,value:value.startsWith("feature.") ? "false" : "0"}))} data={[...Object.entries(featureLabels).map(([key,label]) => ({value:`feature.${key}`,label})),...Object.entries(allowanceLabels).map(([key,label]) => ({value:`allowance.${key}`,label}))]}/>{overrideForm.policyKey.startsWith("feature.") ? <Select label="Effective value" value={overrideForm.value} onChange={(value) => value && setOverrideForm((current) => ({...current,value}))} data={[{value:"true",label:"Enabled"},{value:"false",label:"Disabled"}]}/> : <NumberInput min={0} label="Monthly limit" value={Number(overrideForm.value)} onChange={(value) => setOverrideForm((current) => ({...current,value:String(Number(value) || 0)}))}/>}<TextInput type="datetime-local" label="Expires at (optional)" value={overrideForm.expiresAt} onChange={(event) => setOverrideForm((current) => ({...current,expiresAt:event.target.value}))}/><TextInput label="Reason" description="Stored with the override and security audit." value={overrideForm.reason} onChange={(event) => setOverrideForm((current) => ({...current,reason:event.target.value}))}/></Stack><Group className="subscription-editor__footer" justify="space-between"><Text c="dimmed" size="sm">Review the subscriber impact before publishing.</Text><Button loading={busy} disabled={overrideForm.reason.trim().length < 8} onClick={() => void publishOverride()}>Review and publish override</Button></Group></div>
    </Modal>
    <Modal closeButtonProps={{ "aria-label": "Close" }} opened={grantOpened} onClose={() => !busy && setGrantOpened(false)} closeOnEscape={!busy} closeOnClickOutside={!busy} title={<div className="getprio-modal-title"><Text className="getprio-modal-eyebrow">VENDOR USAGE CREDITS</Text><Title className="getprio-modal-heading" order={3}>Grant credits to {tenant?.name}</Title></div>} centered size="lg" classNames={{ content: "task-modal", body: "task-modal__body" }}><div className="task-modal-form"><Stack className="task-modal-form__main"><Text>Choose one or both resources. Promotional credits are used before purchased credits and may have an optional expiry.</Text><SimpleGrid cols={{ base: 1, sm: 2 }}><NumberInput min={0} label="Queue Ticket credits" value={grant.ticketUnits} onChange={(value) => setGrant({ ...grant, ticketUnits: Number(value) || 0 })}/><NumberInput min={0} label="Queue Email Journey credits" value={grant.journeyUnits} onChange={(value) => setGrant({ ...grant, journeyUnits: Number(value) || 0 })}/></SimpleGrid><TextInput type="datetime-local" label="Expires at (optional)" value={grant.expiresAt} onChange={(event) => setGrant({ ...grant, expiresAt: event.target.value })}/><TextInput label="Reason for this grant" value={grant.reason} onChange={(event) => setGrant({ ...grant, reason:event.target.value })}/></Stack><Group className="subscription-editor__footer" justify="space-between"><Text c="dimmed" size="sm">The grant and reason become permanent audit evidence.</Text><Button loading={busy} disabled={grant.reason.trim().length < 8 || (!grant.ticketUnits && !grant.journeyUnits)} onClick={() => void submitGrant()}>Review and grant credits</Button></Group></div></Modal>
    <CreditTaskModal creditTask={creditTask} busy={busy} setCreditTask={setCreditTask} taskUnits={taskUnits} setTaskUnits={setTaskUnits} providerDisputeId={providerDisputeId} setProviderDisputeId={setProviderDisputeId} taskReason={taskReason} setTaskReason={setTaskReason} runCaseAction={runCaseAction} />
  </Stack>;
}
