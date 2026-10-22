import { IconEdit, IconTrash } from '@tabler/icons-react';
import { EntityCard, EntityIconAction } from './EntityCards';
import { Button } from './components/ui/button';
import { TaskDialog } from './TaskDialog';
import { RequestStatusBadge } from './RequestStatusBadge';
export type DraftReadinessView={ready:boolean;reasons:string[]};
/** Presentation only: callers supply server-authorized draft actions and readiness. */
export function SavedRequestDraftCard({state,name,revision,serviceCount,readiness,canPublish,canDelete,canEdit,busy,onEdit,onPublish,onDelete}:{state:'draft';name:string;revision:string;serviceCount:number;readiness?:DraftReadinessView;canPublish:boolean;canDelete:boolean;canEdit:boolean;busy:boolean;onEdit:()=>void;onPublish:()=>void;onDelete:()=>void}){
 if(state!=='draft')return null;
 const ready=Boolean(readiness?.ready&&canPublish),reasons=readiness?.reasons.length?readiness.reasons:[readiness?.ready?'Publication is not available for this draft.':'Refresh this draft to check what is needed before publication.'];
 return <EntityCard title={name} footer={<div className="queue-row saved-request-draft-actions"><Button disabled={busy||!ready} onClick={onPublish}>Publish request</Button><EntityIconAction label={`Edit service request for ${name}`} disabled={busy||!canEdit} onClick={onEdit}><IconEdit aria-hidden="true"/></EntityIconAction>{canDelete?<EntityIconAction label={`Delete draft for ${name}`} disabled={busy} onClick={onDelete}><IconTrash aria-hidden="true"/></EntityIconAction>:null}</div>}>
 <p><RequestStatusBadge state="draft" label="Draft"/> · {serviceCount} catalog service selection(s) · Draft revision {revision}</p><p className="ops-muted">No ticket, queue position or resource hold.</p>{ready?<p className="ops-muted">Ready to publish.</p>:<ul className="saved-request-draft-reasons" aria-label={`Publication requirements for ${name}`}>{reasons.map(reason=><li key={reason}>{reason}</li>)}</ul>}
 </EntityCard>;
}
export function DraftDeleteConfirmation({name,busy,uncertain,error,onCancel,onConfirm}:{name:string;busy:boolean;uncertain:boolean;error:string;onCancel:()=>void;onConfirm:()=>void}){
 return <TaskDialog opened title={`Delete draft for ${name}?`} description="Remove this unpublished request draft. Published requests and queue history are unaffected." busy={busy||uncertain} onClose={onCancel} footer={uncertain?<span className="v:contents" ref={node=>{if(node)requestAnimationFrame(()=>{if(node.isConnected)node.querySelector<HTMLButtonElement>('button')?.focus();});}}><Button disabled={busy} onClick={onConfirm}>Retry same delete command</Button></span>:<><Button variant="outline" disabled={busy} onClick={onCancel}>Keep draft</Button><Button variant="destructive" disabled={busy} onClick={onConfirm}>Delete draft</Button></>}>
 <div className="queue-stack"><p>{name}</p>{error?<p role="alert">{error}</p>:null}{uncertain?<p role="alert">The response was lost. Deletion may already be recorded. Retry the same command before continuing.</p>:null}</div>
 </TaskDialog>;
}
