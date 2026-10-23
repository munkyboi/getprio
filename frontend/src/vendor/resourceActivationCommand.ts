import type { ResourceConfiguration } from '../components/VendorResourceConfigurationForms';
import type { LocalResourceActivationInputV1 } from '../../../shared/localResourceActivationV1';
import { apiRequest } from '../api/client';

export interface ResourceActivationAttempt {path:string;body:LocalResourceActivationInputV1;key:string}
export function prepareResourceActivation(configuration:ResourceConfiguration,poolId:string,tenant:string,location:string,key:string):ResourceActivationAttempt {
  const capability=configuration.localActivation;
  const pool=capability?.pools.find(item=>item.poolId===poolId);
  if(capability?.capability!=='local-resource-activation-v1'||!capability.available||pool?.status!=='ready'||!pool.poolRevision||!configuration.version)
    throw new Error(pool?.blockReason?.message||'Resource tracking is not ready to enable. Refresh this location’s setup.');
  return {path:`/vendor/tenant/${encodeURIComponent(tenant)}/locations/${encodeURIComponent(location)}/resources/${encodeURIComponent(poolId)}/activate`,body:{expectedPoolRevision:pool.poolRevision,configurationVersion:configuration.version},key};
}
export function submitResourceActivation(token:string,attempt:ResourceActivationAttempt) {
  return apiRequest<ResourceConfiguration>(attempt.path,{token,method:'POST',body:attempt.body,headers:{'Idempotency-Key':attempt.key}});
}
