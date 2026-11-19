export function isDeletedDraftResult(result:unknown,id:string){
 if(!result||typeof result!=='object'||!('deletedDraft' in result))return false;
 const draft=result.deletedDraft;return Boolean(draft&&typeof draft==='object'&&'id' in draft&&draft.id===id&&'state' in draft&&draft.state==='discarded'&&'planRevision' in draft&&typeof draft.planRevision==='string'&&draft.planRevision);
}
export function isPublishedDraftResult(result:unknown,id:string){
 if(!result||typeof result!=='object'||!('plan' in result)||!result.plan||typeof result.plan!=='object')return false;
 const plan=result.plan;return 'id' in plan&&plan.id===id&&'contractVersion' in plan&&typeof plan.contractVersion==='number'&&[2,3,4].includes(plan.contractVersion)&&'ticketId' in plan&&typeof plan.ticketId==='string'&&Boolean(plan.ticketId)&&'ticketNumber' in plan&&typeof plan.ticketNumber==='string'&&Boolean(plan.ticketNumber)&&'state' in plan&&['waiting','called','in_service','served','skipped','cancelled','unserved','expired','pending_carry_over'].includes(String(plan.state));
}
