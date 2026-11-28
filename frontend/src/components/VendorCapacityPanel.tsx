import { useEffect, useState } from "react";
import { Badge } from "../vendor/components/ui/badge";
import { Progress } from "../vendor/components/ui/progress";
import { ConfigurationInput } from "../vendor/ConfigurationUi";
import { OperationAlert, OperationButton, OperationPanel } from "../vendor/OperationsUi";
import { TaskDialog } from "../vendor/TaskDialog";
import { apiRequest } from "../api/client";

type Resource = { limit: number | null; used: number | null; creditRemaining: number | null; resetAt: string | null };
type Capacity = { planSlug: string | null; lifecycleState: string; resources: Record<string, Resource>; lots?: Array<{ id: string; resourceKey: string; remainingUnits: number; expiresAt: string | null; status: string; sourceType: string }> };
type Pack = { code: string; name: string; ticketUnits: number; journeyUnits: number; priceDisplay: string };
const labels: Record<string, string> = { queueTickets: "Queue Tickets", queueEmailJourneys: "Queue Email Journeys", serviceBookings: "Service Bookings" };

export default function VendorCapacityPanel({ tenantSlug, token }: Readonly<{ tenantSlug: string; token: string }>) {
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
  if (!capacity) return error ? <OperationAlert color="red">{error}</OperationAlert> : <p role="status" className="ops-muted">Loading monthly capacity…</p>;

  return (
    <div className="queue-stack">
      <div className="ops-row ops-between">
        <div><p className="neura-label">Monthly capacity</p><h3 className="account-panel-title">{commercial ? "Plan usage and credits" : "Operational capacity"}</h3></div>
        <Badge variant="outline">{capacity.planSlug || capacity.lifecycleState}</Badge>
      </div>
      {error && <OperationAlert color="red">{error}</OperationAlert>}
      <div className="v:grid v:gap-4 v:sm:grid-cols-3">
        {Object.entries(capacity.resources).map(([key, resource]) => <ResourceCapacity key={key} label={labels[key] || key} resource={resource} />)}
      </div>
      {commercial ? <>
        <div>
          <h4 className="v:font-semibold">Usage Credits</h4>
          <p className="ops-muted">Credits carry forward and bypass Ticket and Journey limits. They never bypass Service Booking limits.</p>
        </div>
        <div className="v:grid v:gap-4 v:sm:grid-cols-3">
          {packs.map(pack => (
            <OperationPanel key={pack.code}>
              <div className="queue-stack">
                <div className="ops-row ops-between"><strong>{pack.code}</strong><Badge>{pack.priceDisplay}</Badge></div>
                <p>{pack.ticketUnits.toLocaleString()} Tickets + {pack.journeyUnits.toLocaleString()} Journeys</p>
                <OperationButton loading={busy === pack.code} onClick={() => void buy(pack.code)}>Buy credits</OperationButton>
              </div>
            </OperationPanel>
          ))}
        </div>
        {capacity.planSlug !== "free" && (
          <OperationPanel>
            <div className="ops-row ops-between">
              <div><strong>Paid plan exit</strong><p className="ops-muted">Keep paid access through the current term, then move to the queue-only Free plan.</p></div>
              <OperationButton variant="outline" onClick={() => setExitOpened(true)}>Schedule move to Free</OperationButton>
            </div>
          </OperationPanel>
        )}
        <TaskDialog
          opened={exitOpened} onClose={() => setExitOpened(false)} busy={busy === "paid-exit"}
          title="Move to Free at term end"
          description="Your current paid features remain available until the end of the billing term. Usage Credits stay with your account."
          footer={<OperationButton loading={busy === "paid-exit"} disabled={exitReason.trim().length < 8} onClick={() => void requestPaidExit()}>Review and schedule change</OperationButton>}
        >
          <ConfigurationInput label="Reason for this change" value={exitReason} onChange={event => setExitReason(event.target.value)} />
        </TaskDialog>
      </> : <OperationAlert>You can see whether the team can keep operating. Owners and administrators manage plans, purchases, and billing details.</OperationAlert>}
    </div>
  );
}

function ResourceCapacity({ label, resource }: { label: string; resource: Resource }) {
  const { limit, used, creditRemaining, resetAt } = resource;
  const reset = resetAt && <p className="ops-muted v:text-xs">Resets {new Date(resetAt).toLocaleDateString()}</p>;
  if (limit == null || used == null || creditRemaining == null) {
    return <OperationPanel><div className="queue-stack"><strong>{label}</strong><h4>Unavailable</h4><p className="ops-muted">Capacity details are temporarily unavailable.</p>{reset}</div></OperationPanel>;
  }
  const available = Math.max(0, limit - used) + creditRemaining;
  const percentage = limit === 0 ? 0 : Math.min(100, (used / limit) * 100);
  const tone = available === 0 ? "v:[&_[data-slot=progress-indicator]]:bg-destructive" : percentage >= 90 ? "v:[&_[data-slot=progress-indicator]]:bg-amber-500" : undefined;
  return (
    <OperationPanel>
      <div className="queue-stack">
        <strong>{label}</strong>
        <h4>{available.toLocaleString()} available</h4>
        <Progress aria-label={`${label} usage`} value={percentage} className={tone} />
        <p className="ops-muted">{used.toLocaleString()} of {limit.toLocaleString()} monthly units used{creditRemaining ? ` + ${creditRemaining.toLocaleString()} credits` : ""}</p>
        {reset}
      </div>
    </OperationPanel>
  );
}
