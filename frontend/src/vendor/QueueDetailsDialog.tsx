import { useEffect, useRef, useState } from "react";
import { TaskDialog, QueueConfirmation } from "./TaskDialog";
import { Button } from "./components/ui/button";
import { Field, FieldGroup, FieldLabel, FieldDescription } from "./components/ui/field";
import { Input } from "./components/ui/input";
import { Textarea } from "./components/ui/textarea";

export type QueueDetailsDraft = { customerName: string; notes: string };
export function QueueDetailsDialog({ticketNumber,initial,readOnly,busy,error,conflict,onClose,onSave,onReload}: {
  ticketNumber:string; initial:QueueDetailsDraft; readOnly:{email?:string;phone?:string;service?:string};
  busy:boolean; error:string; conflict:boolean; onClose:()=>void;
  onSave:(draft:QueueDetailsDraft)=>Promise<void>; onReload:()=>void;
}) {
  const nameInput=useRef<HTMLInputElement>(null);
  useEffect(()=>{nameInput.current?.focus();},[]);
  const [draft,setDraft]=useState(initial);
  const [discard,setDiscard]=useState<"close"|"reload"|null>(null);
  const [invalid,setInvalid]=useState("");
  const dirty=draft.customerName!==initial.customerName || draft.notes!==initial.notes;
  const close=()=>{if(!busy){if(dirty)setDiscard("close");else onClose();}};
  return <>
    <TaskDialog opened busy={busy} onClose={close} eyebrow="QUEUE TICKET" title={`Edit queue details · ${ticketNumber}`} description="Update the customer's name or notes before service starts. Contact information and service requirements stay linked to the original ticket."
      footer={<><Button variant="outline" disabled={busy} onClick={close}>Cancel</Button><Button type="submit" form="queue-details-editor" disabled={busy || conflict || !dirty} aria-busy={busy}>{busy?"Saving…":"Save changes"}</Button></>}>
      <form id="queue-details-editor" onSubmit={async event=>{event.preventDefault(); if(!draft.customerName.trim()){setInvalid("Enter the customer's name.");return;}setInvalid("");await onSave(draft);}}>
        <FieldGroup>
          {error?<p role="alert">{error}</p>:null}
          {conflict?<div className="queue-stack"><p>Your edits have been kept. Reload the current ticket before editing again.</p><Button variant="outline" disabled={busy} onClick={()=>setDiscard("reload")}>Review current ticket</Button></div>:null}
          <Field><FieldLabel htmlFor="queue-details-name">Customer name</FieldLabel><Input ref={nameInput} autoFocus id="queue-details-name" maxLength={120} value={draft.customerName} disabled={busy || conflict} required aria-invalid={Boolean(invalid)} aria-describedby={invalid?"queue-details-name-error":undefined} onChange={e=>setDraft({...draft,customerName:e.currentTarget.value})}/>{invalid?<p id="queue-details-name-error" role="alert">{invalid}</p>:null}</Field>
          <Field><FieldLabel htmlFor="queue-details-notes">Notes (optional)</FieldLabel><Textarea id="queue-details-notes" maxLength={1000} value={draft.notes} disabled={busy || conflict} onChange={e=>setDraft({...draft,notes:e.currentTarget.value})}/><FieldDescription>Include details that help your team serve this customer.</FieldDescription></Field>
          <div className="queue-stack"><p className="ops-muted">Contact and service details</p><p>Email: {readOnly.email || "Not provided"}</p><p>Phone: {readOnly.phone || "Not provided"}</p><p>Service: {readOnly.service || "No service selected"}</p></div>
        </FieldGroup>
      </form>
    </TaskDialog>
    <QueueConfirmation opened={Boolean(discard)} title="Discard your changes?" description="Your unsaved name and notes will be discarded." confirmLabel={discard==="reload"?"Reload ticket":"Discard changes"} cancelLabel="Keep editing" onClose={()=>setDiscard(null)} onConfirm={()=>{setDiscard(null);if(discard==="reload")onReload();else onClose();}}/>
  </>;
}
