import type { QueueCounterCommandV1, QueueCounterControlsV1 } from '../../../shared/queueCounterControlsV1';
import type { QueueWrite } from './queueCommandOwner';
export function validateCounterContext(response:QueueCounterControlsV1,requestKey:string,counterSlug:string){
 if(response.controlVersion!==1||response.requestKey!==requestKey||response.scope.counterSlug!==counterSlug||response.counter.slug!==counterSlug||response.scope.counterId!==response.counter.id)throw Error('The counter changed. Refresh its controls.');return response;
}
export function counterCommandWrite(command:Extract<QueueCounterCommandV1,{kind:'plan'|'legacy'}>,scope:{token:string;tenant:string;location:string},key:string,reason?:string):QueueWrite{
 if(!command.body.counterSlug||!command.body.expectedCounterId)throw Error('Refresh the selected counter before continuing.');
 const base=`/vendor/tenant/${encodeURIComponent(scope.tenant)}/queue`;
 const suffix=command.kind==='plan'?`/plans/${encodeURIComponent(command.planId)}/${command.action}`:command.action==='callNext'?'/call-next':command.action==='skip'?'/current/skip':command.action==='serve'?'/current/serve':`/tickets/${encodeURIComponent(command.ticketId||command.body.ticketId||'')}/service/${command.action}`;
 if((command.action==='skip'||command.action==='interrupt')&&(!reason?.trim()||reason.trim().length>500))throw Error('Enter a reason between 1 and 500 characters.');
 return {path:`${base}${suffix}?location=${encodeURIComponent(scope.location)}`,token:scope.token,body:{...command.body,...(reason===undefined?{}:{reason:reason.trim()})},key};
}
