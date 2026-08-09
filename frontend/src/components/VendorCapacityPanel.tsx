import { useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Group, Modal, Progress, SimpleGrid, Stack, Text, TextInput, Title } from "@mantine/core";
import { apiRequest } from "../api/client";

type Resource = { limit: number; used: number; creditRemaining: number; resetAt: string | null };
type Capacity = { planSlug: string | null; lifecycleState: string; resources: Record<string, Resource>; lots?: Array<{ id: string; resourceKey: string; remainingUnits: number; expiresAt: string | null; status: string; sourceType: string }> };
type Pack = { code: string; name: string; ticketUnits: number; journeyUnits: number; priceDisplay: string };
const labels: Record<string, string> = { queueTickets: "Queue Tickets", queueEmailJourneys: "Queue Email Journeys", serviceBookings: "Service Bookings" };

export default function VendorCapacityPanel({ tenantSlug, token }: { tenantSlug: string; token: string }) {
  const [capacity, setCapacity] = useState<Capacity | null>(null);
  const [commercial, setCommercial] = useState(false);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [exitOpened, setExitOpened] = useState(false);
  const [exitReason, setExitReason] = useState("");
  const [experienceEnabled, setExperienceEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    if (!tenantSlug) return;
    apiRequest<{ vendorCapacityExperience: boolean }>("/billing/capabilities", { token })
      .then((capabilities) => {
        setExperienceEnabled(capabilities.vendorCapacityExperience);
        if (!capabilities.vendorCapacityExperience) return null;
        return apiRequest<{ capacity: Capacity; commercial: boolean }>(`/billing/tenant/${tenantSlug}/capacity`, { token });
      })
      .then(async (data) => {
        if (!data) return;
        setCapacity(data.capacity); setCommercial(data.commercial);
        if (data.commercial) setPacks((await apiRequest<{ packs: Pack[] }>("/billing/credit-packs", { token })).packs);
      }).catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Capacity is unavailable."));
  }, [tenantSlug, token]);
  async function buy(packCode: string) {
    setBusy(packCode); setError("");
    try {
      const reason="Vendor purchased a Usage Credit pack"; const payload={packCode};
      const preview=await apiRequest<{confirmation:{token:string};preview:{revision:string}}>(`/billing/tenant/${tenantSlug}/commercial-actions/preview`,{method:"POST",token,body:{action:"credit.checkout",reason,payload}});
      const result = await apiRequest<{ checkoutUrl: string }>(`/billing/tenant/${tenantSlug}/credit-checkout`, { method: "POST", token,headers:{"X-Transaction-Confirmation":preview.confirmation.token}, body: { packCode,reason,previewRevision:preview.preview.revision } });
      window.location.assign(result.checkoutUrl);
    } catch (purchaseError) { setError(purchaseError instanceof Error ? purchaseError.message : "Checkout is unavailable."); setBusy(""); }
  }
  async function requestPaidExit() {
    if (exitReason.trim().length < 8) return;
    setBusy("paid-exit"); setError("");
    try {
      const preview = await apiRequest<{ confirmation: { token: string }; preview: { revision: string } }>(`/billing/tenant/${tenantSlug}/subscription-transitions/preview`, { method: "POST", token, body: { toPlanSlug: "free", reason: exitReason } });
      await apiRequest(`/billing/tenant/${tenantSlug}/subscription-transitions`, { method: "POST", token, headers: { "X-Transaction-Confirmation": preview.confirmation.token }, body: { toPlanSlug: "free", reason: exitReason, previewRevision: preview.preview.revision } });
      setExitOpened(false); setExitReason("");
    } catch (transitionError) { setError(transitionError instanceof Error ? transitionError.message : "The plan change could not be scheduled."); }
    finally { setBusy(""); }
  }
  if (experienceEnabled === false) return null;
  if (error && !capacity) return <Alert color="red">{error}</Alert>;
  if (!capacity) return <Text c="dimmed">Loading monthly capacity…</Text>;
  return <Stack gap="md">
    <Group justify="space-between"><div><Text className="neura-label">MONTHLY CAPACITY</Text><Title order={3}>{commercial ? "Plan usage and credits" : "Operational capacity"}</Title></div><Badge variant="light">{capacity.planSlug || capacity.lifecycleState}</Badge></Group>
    {error ? <Alert color="red">{error}</Alert> : null}
    <SimpleGrid cols={{ base: 1, sm: 3 }}>{Object.entries(capacity.resources).map(([key, resource]) => {
      const available = Math.max(0, resource.limit - resource.used) + resource.creditRemaining;
      const percentage = resource.limit > 0 ? Math.min(100, (resource.used / resource.limit) * 100) : 100;
      return <Card key={key} withBorder><Stack gap="xs"><Text fw={700}>{labels[key] || key}</Text><Title order={4}>{available.toLocaleString()} available</Title><Progress color={available === 0 ? "red" : percentage >= 90 ? "orange" : "teal"} value={percentage}/><Text c="dimmed" size="sm">{resource.used.toLocaleString()} of {resource.limit.toLocaleString()} monthly units used{resource.creditRemaining ? ` + ${resource.creditRemaining.toLocaleString()} credits` : ""}</Text>{resource.resetAt ? <Text c="dimmed" size="xs">Resets {new Date(resource.resetAt).toLocaleDateString()}</Text> : null}</Stack></Card>;
    })}</SimpleGrid>
    {commercial ? <><div><Title order={4}>Usage Credits</Title><Text c="dimmed" size="sm">Credits carry forward and bypass Ticket and Journey limits. They never bypass Service Booking limits.</Text></div><SimpleGrid cols={{ base: 1, sm: 3 }}>{packs.map((pack) => <Card key={pack.code} withBorder><Stack><Group justify="space-between"><Text fw={700}>{pack.code}</Text><Badge>{pack.priceDisplay}</Badge></Group><Text size="sm">{pack.ticketUnits.toLocaleString()} Tickets + {pack.journeyUnits.toLocaleString()} Journeys</Text><Button loading={busy === pack.code} onClick={() => void buy(pack.code)}>Buy credits</Button></Stack></Card>)}</SimpleGrid>{capacity.planSlug !== "free" ? <Card withBorder><Group justify="space-between" align="center"><div><Text fw={700}>Paid plan exit</Text><Text c="dimmed" size="sm">Keep paid access through the current term, then move to the queue-only Free plan.</Text></div><Button variant="light" onClick={() => setExitOpened(true)}>Schedule move to Free</Button></Group></Card> : null}<Modal opened={exitOpened} onClose={() => setExitOpened(false)} title={<div><Text className="neura-label">PLAN CHANGE</Text><Title order={3}>Move to Free at term end</Title></div>} centered size="lg"><Stack><Text>Your current paid features remain available until the end of the billing term. Usage Credits stay with your account.</Text><TextInput label="Reason for this change" value={exitReason} onChange={(event) => setExitReason(event.target.value)}/><Button fullWidth loading={busy === "paid-exit"} disabled={exitReason.trim().length < 8} onClick={() => void requestPaidExit()}>Review and schedule change</Button></Stack></Modal></> : <Alert color="blue">You can see whether the team can keep operating. Owners and administrators manage plans, purchases, and billing details.</Alert>}
  </Stack>;
}
