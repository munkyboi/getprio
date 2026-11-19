import type { QueueTicketDetails, QueueTicketDetailsUpdate } from "../../../shared/queueTicketDetails";
import { useEffect, useState } from "react";
import { apiRequest, ApiError } from "../api/client";
import { QueueDetailsDialog, type QueueDetailsDraft } from "./QueueDetailsDialog";
import { TaskDialog } from "./TaskDialog";
import { Button } from "./components/ui/button";

type Details = QueueTicketDetails["ticket"];
export function QueueDetailsEditor({token,tenantSlug,locationSlug,ticketId,onClose,onRefresh,onBusy}: {
  token:string|null;tenantSlug:string;locationSlug:string;ticketId:string;
  onClose:()=>void;onRefresh:()=>Promise<void>;onBusy:(busy:boolean)=>void;
}) {
  const [details,setDetails]=useState<Details|null>(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [conflict,setConflict]=useState(false);
  const [revision,setRevision]=useState(0);
  const path=`/vendor/tenant/${encodeURIComponent(tenantSlug)}/queue/tickets/${encodeURIComponent(ticketId)}/details?location=${encodeURIComponent(locationSlug)}`;
  useEffect(()=>{let current=true;const controller=new AbortController();setDetails(null);setError("");setConflict(false);
    apiRequest<QueueTicketDetails>(path,{token:token||"",signal:controller.signal}).then(data=>{if(current)setDetails(data.ticket);}).catch(e=>{if(current)setError(e instanceof Error?e.message:"Ticket details are unavailable.");});
    return()=>{current=false;controller.abort();};
  },[path,token,revision]);
  async function save(draft:QueueDetailsDraft){if(!details || busy)return;setBusy(true);onBusy(true);setError("");
    try{const body:QueueTicketDetailsUpdate={version:details.version,expectedStatus:details.status,customerName:draft.customerName.trim(),notes:draft.notes.trim()||null};await apiRequest<QueueTicketDetails>(path,{token:token||"",method:"PATCH",body});await onRefresh();onClose();}
    catch(e){setError(e instanceof Error?e.message:"Changes could not be saved.");if(e instanceof ApiError && e.status===409){setConflict(true);await onRefresh();}}
    finally{setBusy(false);onBusy(false);}
  }
  return details?<QueueDetailsDialog key={revision} ticketNumber={details.ticketNumber} initial={{customerName:details.customerName,notes:details.notes||""}} readOnly={{email:details.customerEmail||undefined,phone:details.customerPhone||undefined,service:details.serviceName?`${details.serviceName}${details.serviceItemCount?` · ${details.serviceItemCount} service item(s)`:""}`:undefined}} busy={busy} error={error} conflict={conflict} onClose={onClose} onSave={save} onReload={()=>setRevision(n=>n+1)}/>:<TaskDialog opened onClose={onClose} eyebrow="QUEUE TICKET" title="Edit queue details" footer={<Button variant="outline" onClick={onClose}>Close</Button>}>{error?<div className="queue-stack"><p role="alert">{error}</p><Button variant="outline" onClick={()=>setRevision(n=>n+1)}>Reload ticket</Button></div>:<p role="status">Loading ticket details…</p>}</TaskDialog>;
}
