import { queueReadRequest } from "./queueReadRequest";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "../api/client";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";

/** Read contract from API b2ec0f39; reservation timestamps describe protection, not a promised start. */
interface LinearTicketPlan {
  lifecycle?: { state: "published" | "waiting" | "called" | "in_service" | "terminal"; planState: "published" | "unpublished"; terminal: boolean };
  reservation?: null | { id: string; state: string; poolId: string; units: number; startsAt: string; endsAt: string };
}
const labels = {published:"Published",waiting:"Waiting",called:"Called",in_service:"In service",terminal:"Closed"};
export function LinearTicketState({token,tenantSlug,locationSlug,ticketId}:{token:string|null;tenantSlug:string;locationSlug:string;ticketId:string}) {
  const query=useQuery({
    queryKey:["vendor-linear-ticket",token,tenantSlug,locationSlug,ticketId],
    queryFn:({signal})=>queueReadRequest<LinearTicketPlan>(`/vendor/tenant/${encodeURIComponent(tenantSlug)}/queue/tickets/${encodeURIComponent(ticketId)}/service-plan?location=${encodeURIComponent(locationSlug)}`,{token:token||"",signal}),
    enabled:Boolean(token&&tenantSlug&&locationSlug&&ticketId),retry:false,staleTime:30000,refetchOnWindowFocus:false,refetchIntervalInBackground:false,
    refetchInterval:query=>query.state.error instanceof ApiError && query.state.error.status===429 ? false : 30000,
  });
  if(query.isError)return <div><p role="status">{query.error instanceof ApiError && query.error.status===429 ? `Too many refresh requests. ${query.error.retryAt ? `Try again after ${new Date(query.error.retryAt).toLocaleTimeString("en-PH")}.` : "Wait before retrying."}` : "Service and reservation status could not be refreshed."}</p><Button variant="outline" onClick={()=>void query.refetch()}>Retry ticket status</Button></div>;
  if(!query.data)return <p role="status">Loading service status…</p>;
  if(!query.data.lifecycle)return <p className="ops-muted">Detailed service status is unavailable on this server.</p>;
  const {lifecycle,reservation}=query.data;
  return <div className="queue-stack"><div><Badge variant="outline">{labels[lifecycle.state]}</Badge>{lifecycle.planState==="published"?<Badge variant="secondary">Service plan published</Badge>:null}</div>
    {reservation?.state==="protected"?<p className="ops-muted">Resources reserved for this ticket · {reservation.units} resource unit{reservation.units===1?"":"s"}. Starting service checks the reservation again.</p>:reservation?.state==="converted"?<p className="ops-muted">Reservation converted to a service allocation.</p>:reservation?<p className="ops-muted">Resource reservation: {reservation.state}. Refresh before taking the next action.</p>:null}
  </div>;
}
