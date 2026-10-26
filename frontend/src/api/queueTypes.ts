import {apiRequest} from './client';
import type {QueueType,QueueTypeConfiguration} from '../../../shared/queueTypes';
const url=(tenant:string,location:string)=>`/vendor/tenant/${encodeURIComponent(tenant)}/locations/${encodeURIComponent(location)}/queue-type`;
export const getQueueType=(token:string,tenant:string,location:string,signal?:AbortSignal)=>apiRequest<QueueTypeConfiguration>(url(tenant,location),{token,signal});
export const saveQueueType=(token:string,tenant:string,location:string,body:{type:QueueType;expectedRevision:string;confirmedFutureOnly:true},key:string)=>apiRequest<QueueTypeConfiguration>(url(tenant,location),{token,method:'PUT',body,headers:{'Idempotency-Key':key}});
