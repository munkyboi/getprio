import { useState } from "react";
import { TaskDialog, QueueConfirmation } from "./TaskDialog";
import { QueueServiceLines, type QueueServiceChoice, type QueueServiceLineDraft } from "./QueueServiceLines";
import { Button } from "./components/ui/button";
import { ConfigurationCheck, ConfigurationInput, ConfigurationTextarea } from "./ConfigurationUi";

export interface QueuePlanDraft {
  catalogRevision: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  notes: string;
  lines: QueueServiceLineDraft[];
}
export function hasQuantityReduction(before: QueueServiceLineDraft[], after: QueueServiceLineDraft[]): boolean {
  return before.some(previous => {
    const next = after.find(line => line.lineId === previous.lineId && line.serviceId === previous.serviceId);
    return !next || Number(next.units) < Number(previous.units);
  });
}

/** A local draft; callbacks must return an authoritative server result before reporting success. */
export function QueuePlanDialog({initial, options, mode, busy, error, locked, customerReadOnly, publishAvailable = false, uncertain = false, catalogRevision, onClose, onSaveDraft, onPublish, onAmend}: {
  initial: QueuePlanDraft;
  options: QueueServiceChoice[];
  mode: "draft" | "amend";
  busy: boolean;
  error: string;
  locked?: boolean;
  customerReadOnly?: boolean;
  publishAvailable?: boolean;
  uncertain?: boolean;
  catalogRevision?: string;
  onClose: () => void;
  onSaveDraft: (draft: QueuePlanDraft) => Promise<void>;
  onPublish: (draft: QueuePlanDraft) => Promise<void>;
  onAmend: (draft: QueuePlanDraft, reason: string, customerAgreed: boolean) => Promise<void>;
}) {
  const [draft,setDraft]=useState(initial);
  const [reason,setReason]=useState("");
  const [agreed,setAgreed]=useState(false);
  const [discard,setDiscard]=useState(false);
  const [validation,setValidation]=useState("");
  const reduction=mode === "amend" && hasQuantityReduction(initial.lines,draft.lines);
  const changed=JSON.stringify(draft)!==JSON.stringify(initial) || Boolean(reason);
  const close=()=>{if(busy || uncertain)return;if(changed)setDiscard(true);else onClose();};
  return <>
    <TaskDialog opened busy={busy || uncertain} onClose={close} eyebrow="SERVICE PLAN" title={mode === "draft" ? "Prepare queue ticket" : "Amend service plan"}
      description={mode === "draft" ? "Save incomplete work as a draft. Publish becomes available when supported by the server." : "Review changes with the customer before work starts. The server revalidates any protected reservation."}
      footer={<><Button variant="outline" disabled={busy || uncertain} onClick={close}>Cancel</Button>{mode === "draft" ? <Button variant="outline" disabled={busy || locked} onClick={()=>void onSaveDraft(draft)}>{uncertain ? "Retry same save" : "Save draft"}</Button> : null}{(mode === "amend" || publishAvailable) ? <Button type="submit" form="vendor-queue-plan" disabled={busy || locked}>{busy ? "Working…" : mode === "draft" ? "Publish ticket" : "Apply agreed amendment"}</Button> : null}</>}>
      <form id="vendor-queue-plan" noValidate onSubmit={async event=>{
        event.preventDefault();setValidation("");
        if(mode === "draft" && !publishAvailable){await onSaveDraft(draft);return;}
        if(!draft.customerName.trim() || !draft.lines.length || draft.lines.some(line=>!line.serviceId || !Number.isInteger(Number(line.units)) || Number(line.units)<1 || !Number.isInteger(Number(line.durationMinutes)) || Number(line.durationMinutes)<1)){setValidation("Enter a customer name and complete each service, units and duration before publishing.");return;}
        if(mode === "amend" && (!reason.trim() || (reduction && !agreed))){setValidation(reduction ? "Record the reason and confirm the customer agreed to the reduced request." : "Enter the reason for this amendment.");return;}
        if(mode === "draft")await onPublish(draft);else await onAmend(draft,reason.trim(),agreed);
      }}>
        <div className="queue-stack">
          {uncertain ? <p role="alert">The save result is unknown. Retry the same save to reconcile it before editing or closing.</p> : null}
          {error || validation ? <p role="alert">{error || validation}</p> : null}
          <ConfigurationInput label="Customer name" maxLength={254} value={draft.customerName} disabled={busy || uncertain || customerReadOnly || locked} onChange={event=>setDraft({...draft,customerName:event.currentTarget.value})}/>
          <ConfigurationInput label="Email (optional)" maxLength={254} type="email" value={draft.customerEmail} disabled={busy || uncertain || customerReadOnly || locked} onChange={event=>setDraft({...draft,customerEmail:event.currentTarget.value})}/>
          <ConfigurationInput label="Phone (optional)" maxLength={254} type="tel" value={draft.customerPhone} disabled={busy || uncertain || customerReadOnly || locked} onChange={event=>setDraft({...draft,customerPhone:event.currentTarget.value})}/>
          {customerReadOnly ? <p className="ops-muted">Customer identity and contact information remain unchanged.</p> : null}
          <ConfigurationTextarea label="Notes" maxLength={2000} value={draft.notes} disabled={busy || uncertain || locked || mode === "amend"} onChange={event=>setDraft({...draft,notes:event.currentTarget.value})}/>
          <QueueServiceLines lines={draft.lines} options={options} busy={busy || uncertain} locked={locked} onChange={lines=>{setDraft({...draft,lines,catalogRevision:null});setAgreed(false);}}/>
          {catalogRevision ? <ConfigurationCheck label="I reviewed and accept the current service durations and resource requirements" checked={draft.catalogRevision === catalogRevision} disabled={busy || uncertain || locked} onChange={event=>setDraft({...draft,catalogRevision:event.currentTarget.checked ? catalogRevision : null})}/> : null}
          {mode === "amend" ? <><ConfigurationTextarea label="Reason for amendment" value={reason} disabled={busy || uncertain || locked} onChange={event=>setReason(event.currentTarget.value)}/>{reduction ? <ConfigurationCheck label="The customer agreed to this reduced service request" checked={agreed} disabled={busy || uncertain || locked} onChange={event=>setAgreed(event.currentTarget.checked)}/> : null}</> : <p className="ops-muted">A saved draft has no queue position, capacity hold or ticket allowance consumption. Publication is a separate action.</p>}
        </div>
      </form>
    </TaskDialog>
    <QueueConfirmation opened={discard} title="Discard this draft’s changes?" description="Unsaved changes to the service request will be discarded." confirmLabel="Discard changes" cancelLabel="Keep editing" onClose={()=>setDiscard(false)} onConfirm={()=>{setDiscard(false);onClose();}}/>
  </>;
}
