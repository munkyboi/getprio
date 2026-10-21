import { Fragment, type ReactNode } from 'react';
import { IconChevronDown, IconChevronRight, IconEdit, IconSend, IconTrash } from '@tabler/icons-react';
import type { SavedQueueDraft } from './savedDraftCommands';
import type { SavedDraftTableActions } from './SavedRequestDrafts';
import { serviceHoursRecovery } from './linearQueueErrors';
import { draftServiceLabels } from './serviceRequestRows';
import { TableRow, TableCell } from './components/ui/table';
import { Button } from './components/ui/button';
import { RequestStatusBadge } from './RequestStatusBadge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './components/ui/tooltip';
function DraftAction({label,disabled,hint,onClick,children}:{label:string;disabled:boolean;hint?:string;onClick:()=>void;children:ReactNode}) {
  return <Tooltip><TooltipTrigger render={<span className="draft-action-trigger" tabIndex={disabled?0:undefined} aria-label={disabled?`${label}. ${hint||'This action is unavailable.'}`:undefined}/>}><Button type="button" variant="ghost" size="icon" aria-label={label} disabled={disabled} onClick={onClick}>{children}</Button></TooltipTrigger><TooltipContent>{hint?`${label}. ${hint}`:label}</TooltipContent></Tooltip>;
}
export function SavedRequestDraftRow({draft,actions,expanded,detailId,onToggle,serviceNames}:{draft:SavedQueueDraft;actions:SavedDraftTableActions;expanded:boolean;detailId:string;onToggle:()=>void;serviceNames:Readonly<Record<string,string>>}) {
  const name=draft.customer.name||'Unnamed request';
  const ready=Boolean(draft.publishReadiness?.ready&&draft.allowedActions.includes('publish'));
  const reasons=draft.publishReadiness?.blockReasons.map(reason=>serviceHoursRecovery(reason.code)||reason.message)||[];
  const guidance=ready?'Ready to publish.':reasons.join(' ')||(draft.publishReadiness?.ready?'Publishing is not available for this draft.':'Refresh this draft to check what is needed before publishing.');
  const labels=draftServiceLabels(draft,serviceNames);
  return <Fragment><TableRow className="request-draft-row">
    <TableCell data-label="Progress"><span aria-label="Not queued">—</span></TableCell>
    <TableCell data-label="Request"><div className="request-table-identity"><Button type="button" variant="ghost" size="icon" aria-label={`${expanded?'Collapse':'Expand'} draft for ${name}`} aria-expanded={expanded} aria-controls={detailId} onClick={onToggle}>{expanded?<IconChevronDown aria-hidden="true"/>:<IconChevronRight aria-hidden="true"/>}</Button><div><strong>{name}</strong><p className="ops-muted">Not queued</p></div></div></TableCell>
    <TableCell data-label="Status"><RequestStatusBadge state="draft" label="Draft"/></TableCell>
    <TableCell data-label="Services"><p>{labels.length} service{labels.length===1?'':'s'}</p></TableCell>
    <TableCell data-label="Last updated"><span title="Saved time is unavailable">—</span></TableCell>
    <TableCell data-label="Actions"><TooltipProvider><div className="request-row-actions">
      <DraftAction label={`Publish request for ${name}`} disabled={actions.busy||!ready} hint={!ready?guidance:undefined} onClick={()=>actions.onPublish(draft)}><IconSend aria-hidden="true"/></DraftAction>
      <DraftAction label={`Edit service request for ${name}`} disabled={actions.busy||!draft.allowedActions.includes('edit')} onClick={()=>actions.onEdit(draft)}><IconEdit aria-hidden="true"/></DraftAction>
      {draft.allowedActions.includes('delete')?<DraftAction label={`Delete draft for ${name}`} disabled={actions.busy} onClick={()=>actions.onDelete(draft)}><IconTrash aria-hidden="true"/></DraftAction>:null}
    </div></TooltipProvider></TableCell>
  </TableRow><TableRow hidden={!expanded} className="request-detail-row request-draft-detail"><TableCell colSpan={6}><div id={detailId} className="queue-stack"><p>No ticket, queue position or resource hold until this request is published.</p><ul aria-label={`Services in draft for ${name}`}>{labels.map((label,index)=><li key={index}>{label}</li>)}</ul><p>{guidance}</p></div></TableCell></TableRow></Fragment>;
}
