import { hasExecutableLocalPlan, missingServicePlanGuidance } from "./localPoolState";
import { LinearTicketState } from "./LinearTicketState";
import type { LocalResourceOperations, LocalPoolWork } from "../../../shared/localPoolDemo";
import { OperationAlert, OperationButton, OperationEmpty, OperationMetric, OperationPanel } from "./OperationsUi";
import { Badge } from "./components/ui/badge";

type Session = LocalResourceOperations["activeSessions"][number];
export function LocalPoolOperations({data,busy,canStart,onStart,onEnd,onEdit,token,tenantSlug,locationSlug}: {
  token:string|null;tenantSlug:string;locationSlug:string;
  data: LocalResourceOperations;
  busy: boolean;
  onEdit: (ticketId:string) => void;
  canStart: (ticket: LocalPoolWork) => boolean;
  onStart: (ticketId: string) => void;
  onEnd: (session: Session, action: "complete" | "interrupt") => void;
}) {
  return <div className="queue-stack">
    <div className="ops-list-heading"><div><h2 className="ops-heading">Resource pool operations</h2><p className="ops-muted">Capacity is observed now. Starting service checks the full required interval again.</p></div><Badge variant="outline">Local demo</Badge></div>
    {data.reconciliation.required ? <OperationAlert color="red" title="Resource records need review">Refresh and reconcile these records before starting more work. Active sessions continue to hold capacity.</OperationAlert> : null}
    {data.pools.map(pool=><OperationPanel key={pool.id}><div className="ops-list-heading"><div><h3 className="ops-heading">{pool.name}</h3><p className="ops-muted">{pool.capacity} configured resource units · Recorded selections appear with each request</p></div></div><div className="ops-grid report-metrics"><OperationMetric label="In use" value={`${pool.allocatedUnits}/${pool.capacity}`} detail="Held by active service sessions"/><OperationMetric label="Available now" value={pool.availableUnits} detail="Starting service still requires server checks"/><OperationMetric label="Reserved now" value={pool.protectedUnitsNow} detail="Protected service demand"/><OperationMetric label="Overdue" value={pool.overdueUnits} detail="Held until service explicitly ends"/></div></OperationPanel>)}
    <div className="pool-work-columns">
      <OperationPanel><h2 className="ops-heading">Other in service · {data.activeSessions.length}</h2><p className="ops-muted">Each session is handled independently. Expected end does not release a unit.</p><div className="pool-session-grid">{data.activeSessions.length ? data.activeSessions.map(session=><article className="queue-counter-ticket" key={session.id}>
        <div className="queue-row"><strong>{session.ticketNumber || "Ticket"}</strong><Badge variant={session.overdue?"critical":"success"}>{session.overdue?"Overdue":"In service"}</Badge></div>
        <LinearTicketState token={token} tenantSlug={tenantSlug} locationSlug={locationSlug} ticketId={session.ticketId}/><p>{data.pools.find(pool=>pool.id===session.poolId)?.name || "Resource pool"} · {session.units} unit{session.units===1?"":"s"}</p>
        <p className="ops-muted">Session {session.id} · Started {new Date(session.startedAt).toLocaleTimeString("en-PH")} · Expected end {new Date(session.expectedEndAt).toLocaleTimeString("en-PH")}</p>
        <div className="queue-row"><OperationButton disabled={busy} onClick={()=>onEnd(session,"complete")}>Complete service<span className="v:sr-only"> for {session.ticketNumber}</span></OperationButton><OperationButton variant="outline" disabled={busy} onClick={()=>onEnd(session,"interrupt")}>Interrupt service<span className="v:sr-only"> for {session.ticketNumber}</span></OperationButton></div>
      </article>) : <OperationEmpty title="No other active sessions" text="Started tickets hold their resource units here until you end service."/>}</div></OperationPanel>
      <div className="queue-stack"><OperationPanel><h2 className="ops-heading">Other called · {data.called.length}</h2><div className="queue-stack">{data.called.length?data.called.map(ticket=><article className="queue-counter-ticket" key={ticket.id}><strong>{ticket.ticketNumber}</strong><LinearTicketState token={token} tenantSlug={tenantSlug} locationSlug={locationSlug} ticketId={ticket.id}/><OperationButton variant="outline" disabled={busy} onClick={()=>onEdit(ticket.id)}>Edit queue details<span className="v:sr-only"> for {ticket.ticketNumber}</span></OperationButton><p>{ticket.plan?.serviceName || "Service requirements unavailable"}</p><p className="ops-muted">{ticket.plan?.durationMinutes || "—"} min · {ticket.plan?.unitsRequired || "—"} resource unit(s)</p><OperationButton disabled={busy || data.reconciliation.required || !canStart(ticket)} onClick={()=>onStart(ticket.id)}>Start service<span className="v:sr-only"> for {ticket.ticketNumber}</span></OperationButton>{!canStart(ticket)?<p className="ops-muted">{hasExecutableLocalPlan(ticket) ? "Confirm this ticket before starting service." : missingServicePlanGuidance}</p>:null}</article>):<OperationEmpty title="No other pending calls" text="Call the next ticket using the counter controls above."/>}</div></OperationPanel>
      <OperationPanel><h2 className="ops-heading">Other waiting · {data.waiting.length}</h2><p className="ops-muted">Order and booking readiness are checked when calling. A free unit does not bypass the queue.</p><div className="pool-waiting-list" role="region" aria-label="Waiting resource tickets" tabIndex={0}>{data.waiting.map(ticket=><article className="pool-waiting-ticket" key={ticket.id}><strong>{ticket.ticketNumber}</strong><LinearTicketState token={token} tenantSlug={tenantSlug} locationSlug={locationSlug} ticketId={ticket.id}/><OperationButton variant="outline" disabled={busy} onClick={()=>onEdit(ticket.id)}>Edit queue details<span className="v:sr-only"> for {ticket.ticketNumber}</span></OperationButton><p>{ticket.plan?.serviceName || "Service requirements unavailable"}</p><p className="ops-muted">{ticket.plan?.durationMinutes || "—"} min · {ticket.plan?.unitsRequired || "—"} resource unit(s){ticket.pendingCarryOver?" · Carry-over":""}</p></article>)}</div></OperationPanel></div>
    </div>
    <p className="ops-muted">Last updated {new Date(data.asOf).toLocaleTimeString("en-PH")} · Service commands are authoritative.</p>
  </div>;
}
