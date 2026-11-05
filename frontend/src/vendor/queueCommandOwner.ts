import { isDeletedDraftResult, isPublishedDraftResult } from './draftActionResponse';
import { ApiError, apiRequest } from '../api/client';
import { useSyncExternalStore } from 'react';
export type QueueWrite = {path:string;token:string;body:object;key:string;method?:string;confirmation?:{kind:'draft-delete'|'draft-publish';id:string}};
let pending:QueueWrite|null=null;
let running=false;
let locked=false;
const listeners=new Set<()=>void>();
const warnBeforeUnload=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
const emit=()=>{locked=running||Boolean(pending);if(typeof window!=='undefined'&&window.addEventListener){if(locked)window.addEventListener('beforeunload',warnBeforeUnload);else window.removeEventListener('beforeunload',warnBeforeUnload);}for(const listener of listeners)listener();};
export function useQueueCommandLocked(){return useSyncExternalStore(listener=>{listeners.add(listener);return()=>{listeners.delete(listener);};},()=>locked,()=>false);}
export function useQueueCommandRunning(){return useSyncExternalStore(listener=>{listeners.add(listener);return()=>{listeners.delete(listener);};},()=>running,()=>false);}
/** One synchronous owner across toolbar and cards; uncertain writes retain their exact payload. */
export async function executeQueueWrite<T>(write:QueueWrite):Promise<T>{
 if(running)throw new ApiError('A queue action is already running.',409);
 if(pending&&JSON.stringify(pending)!==JSON.stringify(write))throw new ApiError('Retry the pending queue action before making another change.',409);
 pending??=structuredClone(write);running=true;emit();
 try{const request=pending;const result=await apiRequest<T>(request.path,{token:request.token,method:request.method||'POST',body:request.body,headers:{'Idempotency-Key':request.key}});if(request.confirmation&&!(request.confirmation.kind==='draft-delete'?isDeletedDraftResult(result,request.confirmation.id):isPublishedDraftResult(result,request.confirmation.id)))throw Error('Unexpected draft response. Retry the same command to reconcile it.');pending=null;return result;}
 catch(error){if(error instanceof ApiError&&error.status<500)pending=null;throw error;}
 finally{running=false;emit();}
}

export async function retryPendingQueueWrite(){
 if(!pending)throw new ApiError('No queue command needs reconciliation.',409);
 const key=pending.key;
 try{const result=await executeQueueWrite(pending);if(typeof window!=='undefined'){window.dispatchEvent(new CustomEvent('queue-command-confirmed',{detail:{key,result}}));window.dispatchEvent(new Event('queue-plans-updated'));}return result;}
 catch(error){if(typeof window!=='undefined'&&error instanceof ApiError&&error.status<500){window.dispatchEvent(new CustomEvent('queue-command-rejected',{detail:{key,error}}));window.dispatchEvent(new Event('queue-plans-updated'));}throw error;}
}
