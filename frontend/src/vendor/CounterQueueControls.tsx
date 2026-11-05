import { serviceHoursRecovery } from "./linearQueueErrors";
import { counterCommandWrite, validateCounterContext } from './queueCounterCommands';
import { API_BASE_URL } from '../api/client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueueCounterCommandV1, QueueCounterControlsV1, QueueCounterActionNameV1 } from '../../../shared/queueCounterControlsV1';
import type { QueuePublishedPlanV2 } from '../../../shared/queuePlanV2';
import type { QueuePublishedSelectionPlanV3 } from '../../../shared/queueSelectionPlanV3';
import type { QueuePublishedSelectionPlanV4 } from '../../../shared/queueSelectionPlanV4';
import { queueReadRequest } from './queueReadRequest';
import { executeQueueWrite, retryPendingQueueWrite, useQueueCommandRunning, useQueueCommandLocked, type QueueWrite } from './queueCommandOwner';
import { ApiError } from '../api/client';
import { OperationButton } from './OperationsUi';
import { IconListNumbers, IconPlayerTrackNext, IconPlayerPlay, IconPlayerSkipForward } from '@tabler/icons-react';
import { counterCardPlan, counterServerCandidate, counterToolbarActions, counterSelectedCall, counterCurrentStart, counterDispatchCurrent, counterInspectionPlans, counterReadReady, counterLatestPlans, type CounterCardPlan } from './queueCounterCard';
import { TaskDialog } from './TaskDialog';
import { ConfigurationTextarea } from './ConfigurationUi';
import { useVendorNotifications } from './VendorToasts';
import type { ReactNode } from 'react';
import { listQueueSelections } from '../api/queueSelectionsV3';
import { refreshCounterRequests, subscribeCounterUpdates, queueStreamScope, useQueueStreamHealthy } from './queueCounterLiveUpdates';
import { CounterRequestCards } from './CounterRequestCards';
import { RequestPreviewResources } from './RequestPreviewResources';
import { requestCallNotification } from './callRequestNotifications';
import { Separator } from './components/ui/separator';

const labels:Partial<Record<QueueCounterActionNameV1,string>>={callNext:'Call next',callNextEligible:'Call next eligible',start:'Start service',complete:'Complete service',interrupt:'Interrupt service',skip:'Skip current',confirm:'Confirm ticket',manageRequest:'Open current request'};
export function CounterQueueControls({token,tenant,location,counterSlug,busy,onScan,trailingAction}:{token:string;tenant:string;location:string;counterSlug:string;busy:boolean;onScan:(command:Extract<QueueCounterCommandV1,{kind:'scan'}>)=>void;trailingAction?:ReactNode}){
 const running=useQueueCommandRunning(),locked=useQueueCommandLocked(),client=useQueryClient(),notifications=useVendorNotifications();
 const [error,setError]=useState(''),[working,setWorking]=useState(false),[uncertain,setUncertain]=useState(false),[requestDetailsPlanId,setRequestDetailsPlanId]=useState<string|null>(null);
 const [selectedNextPlanId,setSelectedNextPlanId]=useState<string|null>(null);
 const [confirmation,setConfirmation]=useState<{action:QueueCounterActionNameV1;command:QueueCounterCommandV1;scope:string}|null>(null),[reason,setReason]=useState('');
 const resourceAvailabilityWarning=error.includes('The selected resource is unavailable or its occupancy cannot be determined');
 const pending=useRef<QueueWrite|null>(null);const scope=JSON.stringify([token,tenant,location,counterSlug]);
 const streamScope=queueStreamScope(token,tenant,location), streamHealthy=useQueueStreamHealthy(streamScope);
 const query=useQuery({queryKey:['queue-counter-controls',token,tenant,location,counterSlug],enabled:Boolean(token&&tenant&&location&&counterSlug),retry:false,refetchInterval:streamHealthy?false:15000,refetchIntervalInBackground:false,queryFn:async({signal})=>{
  const requestKey=crypto.randomUUID();const response=await queueReadRequest<QueueCounterControlsV1>(`/vendor/tenant/${encodeURIComponent(tenant)}/queue/counter-controls?location=${encodeURIComponent(location)}&counterSlug=${encodeURIComponent(counterSlug)}&requestKey=${requestKey}`,{token,signal});
  return validateCounterContext(response,requestKey,counterSlug);
 }});
 useEffect(()=>{const refresh=()=>{void refreshCounterRequests(client,token,tenant,location);};window.addEventListener('queue-plans-updated',refresh);window.addEventListener('vendor-queue-snapshot-updated',refresh);return()=>{window.removeEventListener('queue-plans-updated',refresh);window.removeEventListener('vendor-queue-snapshot-updated',refresh);};},[client,token,tenant,location]);
 useEffect(()=>{
  if(!token||!tenant||!location||!query.data?.scope.locationId)return;
  const refresh=()=>{window.dispatchEvent(new Event('queue-plans-updated'));};
  return subscribeCounterUpdates(`${API_BASE_URL}/vendor/tenant/${encodeURIComponent(tenant)}/queue/stream?location=${encodeURIComponent(location)}`,refresh,{scope:streamScope,locationId:query.data.scope.locationId});
 },[client,location,tenant,token,streamScope,query.data?.scope.locationId]);
 useEffect(()=>{if(!uncertain)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[uncertain]);
 useEffect(()=>{if(!resourceAvailabilityWarning)return;notifications.show({id:`queue-resource-warning-${error}`,color:'yellow',title:'Resource availability warning',message:error});},[error,notifications,resourceAvailabilityWarning]);
 async function send(command?:QueueCounterCommandV1,action?:QueueCounterActionNameV1){
  if(working)return;setError('');
  if(!pending.current){if(!command)return;if(command.kind==='openRequest'){return;}if(command.kind==='scan'){onScan(command);return;}
   try{pending.current=counterCommandWrite(command,{token,tenant,location},crypto.randomUUID(),action==='skip'||action==='interrupt'?reason:undefined);}catch(e){setError(e instanceof Error?e.message:'Refresh this counter.');return;}
  }
  setWorking(true);try{await executeQueueWrite(pending.current);pending.current=null;setUncertain(false);setConfirmation(null);void client.invalidateQueries();window.dispatchEvent(new Event('queue-plans-updated'));}
  catch(e){const message=e instanceof ApiError ? serviceHoursRecovery(e.code) || e.message : e instanceof Error ? e.message : 'Queue action failed.';const unknown=!(e instanceof ApiError)||e.status>=500;if(pending.current&&/\/(?:call|call-next)(?:\?|$)/.test(pending.current.path))notifications.show(requestCallNotification({message,commandKey:pending.current.key,unknown},JSON.stringify([tenant,location,counterSlug])));else setError(message);setUncertain(unknown);if(!unknown){pending.current=null;void query.refetch();}}
  finally{setWorking(false);}
 }
 const data=query.data;const disabled=busy||locked||!counterReadReady(query);
 const dispatchCurrent=counterDispatchCurrent(data?.current);
 const currentPlanId=data?.current?.planId,backendNextPlanId=data?.next?.planId;
 const nextPlanQuery=useQuery({queryKey:['queue-counter-next-plan',token,tenant,location,currentPlanId,backendNextPlanId],enabled:Boolean(currentPlanId||backendNextPlanId),retry:false,queryFn:async({signal})=>({plans:await Promise.all([...new Set([currentPlanId,backendNextPlanId].filter((id):id is string=>Boolean(id)))].map(async id=>{const response=await queueReadRequest<{plan:CounterCardPlan}>(`/vendor/tenant/${encodeURIComponent(tenant)}/queue/plans/${encodeURIComponent(id)}?location=${encodeURIComponent(location)}`,{token,signal});if(response.plan.id!==id)throw new Error('Refresh this counter to load the correct request.');return response.plan;}))})});

 const activePlans=useInfiniteQuery({queryKey:['queue-counter-resource-conflicts',token,tenant,location],initialPageParam:undefined as string|undefined,queryFn:({signal,pageParam})=>listQueueSelections(token,tenant,location,'active',signal,pageParam),getNextPageParam:page=>page.nextCursor||undefined,retry:false,enabled:Boolean(token&&tenant&&location)});
 useEffect(()=>{if(activePlans.isPending||activePlans.isFetchingNextPage||!activePlans.hasNextPage)return;void activePlans.fetchNextPage();},[activePlans.fetchNextPage,activePlans.hasNextPage,activePlans.isFetchingNextPage,activePlans.isPending]);
 const requestDetailsQuery=useQuery({queryKey:['queue-counter-request-details',token,tenant,location,requestDetailsPlanId],enabled:Boolean(requestDetailsPlanId),retry:false,queryFn:async({signal})=>queueReadRequest<{plan:QueuePublishedPlanV2|QueuePublishedSelectionPlanV3|QueuePublishedSelectionPlanV4}>(`/vendor/tenant/${encodeURIComponent(tenant)}/queue/plans/${encodeURIComponent(requestDetailsPlanId!)}?location=${encodeURIComponent(location)}`,{token,signal})});
 const hydratedPlans=nextPlanQuery.data?.plans||[];
 const activePublishedPlans=activePlans.data?.pages.flatMap(page=>page.plans).filter((plan):plan is QueuePublishedSelectionPlanV3|QueuePublishedSelectionPlanV4=>plan.state!=='draft')||[];
 const exactPlans=counterLatestPlans(hydratedPlans,activePublishedPlans);
 const requestPickerPlans=useMemo(()=>counterInspectionPlans(exactPlans,dispatchCurrent),[exactPlans,dispatchCurrent]);
 useEffect(()=>{if(selectedNextPlanId&&!requestPickerPlans.some(plan=>plan.id===selectedNextPlanId))setSelectedNextPlanId(null);},[requestPickerPlans,selectedNextPlanId]);
 const selectedRequestPlan=requestPickerPlans.find(plan=>plan.id===selectedNextPlanId)||null;
 const currentPlan=exactPlans.find(plan=>plan.id===currentPlanId);
 const backendNextPlan=counterServerCandidate(data?.next,exactPlans.find(plan=>plan.id===backendNextPlanId));
 const displayNextPlan=counterCardPlan(selectedRequestPlan,backendNextPlan);
 const actions=counterToolbarActions(data?.current,data?.actions.confirm.command?.kind==='scan');
 const cardCallCommand=counterSelectedCall(displayNextPlan,counterSlug,data?.scope.counterId,!dispatchCurrent&&Boolean(data?.actions.callNextEligible.enabled)&&counterReadReady(query)&&counterReadReady(activePlans)&&(!(currentPlanId||backendNextPlanId)||counterReadReady(nextPlanQuery)));
 const currentStartCommand=counterCurrentStart(data?.current,data?.actions.start,counterSlug,data?.scope.counterId);
 const eligible=Boolean(counterSelectedCall(displayNextPlan,counterSlug,data?.scope.counterId,true));

 return <div className="queue-stack queue-counter-context"><div className="queue-counter-layout"><div className="queue-counter-main"><div className="queue-row">{actions.map(name=>{const action=data?.actions[name];const command=name==='start'?currentStartCommand:action?.command;return <OperationButton key={name} disabled={disabled||working||!action?.enabled||!command} onClick={()=>{if(!command)return;if(['skip','interrupt','complete'].includes(name)){setReason('');setConfirmation({action:name,command,scope});}else void send(command,name);}}>{name==='callNext'?<IconListNumbers aria-hidden="true"/>:name==='callNextEligible'?<IconPlayerTrackNext aria-hidden="true"/>:name==='start'?<IconPlayerPlay aria-hidden="true"/>:name==='skip'?<IconPlayerSkipForward aria-hidden="true"/>:null}{labels[name]}</OperationButton>;})}{trailingAction}</div></div>
 <Separator aria-hidden="true" className="queue-counter-controls-separator"/>
 <CounterRequestCards current={dispatchCurrent} currentPlan={currentPlan} nextTarget={data?.next} nextPlan={displayNextPlan} pickerPlans={requestPickerPlans} selected={Boolean(selectedRequestPlan&&selectedRequestPlan.id!==backendNextPlanId)} loading={query.isPending||nextPlanQuery.isFetching} disabled={disabled||working} openDisabled={busy||locked} startEnabled={Boolean(currentStartCommand)} callEnabled={Boolean(cardCallCommand)} eligible={eligible} onSelect={setSelectedNextPlanId} onOpen={setRequestDetailsPlanId} onStart={()=>{if(currentStartCommand)void send(currentStartCommand,'start');}} onCall={()=>{if(cardCallCommand)void send(cardCallCommand,'callNext');}}/>
 </div>
 {query.error?<div role="alert"><p>{query.error instanceof Error?query.error.message:'Counter controls unavailable.'}</p><OperationButton variant="outline" disabled={query.isFetching||locked} onClick={()=>void query.refetch()}>Refresh counter controls</OperationButton></div>:null}
 {locked&&!working&&!pending.current?<div role="status"><p>A request action is pending. Reconcile it before another queue action.</p><OperationButton disabled={running} onClick={async()=>{setWorking(true);try{await retryPendingQueueWrite();setError('');void client.invalidateQueries();}catch(e){setError(e instanceof Error?e.message:'Reconciliation failed.');}finally{setWorking(false);}}}>Retry pending request command</OperationButton></div>:null}
 {error&&!resourceAvailabilityWarning?<p role="alert">{error}</p>:null}{uncertain?<div role="alert"><p>The result is unknown. Retry this exact command before another queue action.</p><OperationButton disabled={working} onClick={()=>void send()}>Retry same toolbar command</OperationButton></div>:null}
 {requestDetailsPlanId?<TaskDialog opened title={requestDetailsQuery.data?.plan?.ticketNumber?`Request ${requestDetailsQuery.data.plan.ticketNumber}`:'Request details'} description="Services, resources, durations, and extras recorded for this request." onClose={()=>setRequestDetailsPlanId(null)} footer={<><OperationButton variant="outline" onClick={()=>{window.dispatchEvent(new CustomEvent('queue-request-amend',{detail:{planId:requestDetailsPlanId,tenant,location}}));setRequestDetailsPlanId(null);}}>Amend service request</OperationButton><OperationButton variant="outline" onClick={()=>setRequestDetailsPlanId(null)}>Close</OperationButton></>}>
   {requestDetailsQuery.isPending?<p role="status">Loading request details…</p>:null}
   {requestDetailsQuery.error?<p role="alert">{requestDetailsQuery.error instanceof Error?requestDetailsQuery.error.message:'Request details are unavailable.'}</p>:null}
   {requestDetailsQuery.data?.plan?<RequestPreviewResources plan={requestDetailsQuery.data.plan} scope={{token,tenant,location}}/>:null}
 </TaskDialog>:null}
 {confirmation?<TaskDialog opened title={`${labels[confirmation.action]}?`} description={confirmation.action==='skip'?'Release the unstarted protection and keep this request skipped until an explicit Recall. No new ticket is issued.':'Apply the selected action to this counter’s recorded current request.'} busy={working||uncertain} onClose={()=>setConfirmation(null)} footer={uncertain?<OperationButton disabled={working} onClick={()=>void send()}>Retry same toolbar command</OperationButton>:<OperationButton disabled={working||locked||scope!==confirmation.scope||((confirmation.action==='skip'||confirmation.action==='interrupt')&&(!reason.trim()||reason.trim().length>500))} onClick={()=>void send(confirmation.command,confirmation.action)}>{labels[confirmation.action]}</OperationButton>}>
 {(confirmation.action==='skip'||confirmation.action==='interrupt')?<ConfigurationTextarea label="Reason (required)" required maxLength={500} value={reason} disabled={working||uncertain} onChange={event=>setReason(event.currentTarget.value)}/>:null}{scope!==confirmation.scope?<p role="alert">The counter changed. Close this dialog and review its current controls.</p>:null}</TaskDialog>:null}
 </div>;
}
