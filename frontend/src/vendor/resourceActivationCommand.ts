import type { ResourceConfiguration } from '../components/VendorResourceConfigurationForms';
import type { VendorResourceActivationInputV1 } from '../../../shared/vendorResourceActivationV1';
import { apiRequest } from '../api/client';

export interface ResourceActivationAttempt {path:string;body:VendorResourceActivationInputV1;key:string}
export function resourceActivationCapability(configuration:ResourceConfiguration|undefined){
  return configuration?.resourceActivation?.available ? configuration.resourceActivation : configuration?.localActivation?.available ? configuration.localActivation : configuration?.resourceActivation || configuration?.localActivation;
}
export function prepareResourceActivation(configuration:ResourceConfiguration,poolId:string,tenant:string,location:string,key:string):ResourceActivationAttempt {
  const capability=resourceActivationCapability(configuration);
  const pool=capability?.pools.find(item=>item.poolId===poolId);
  if(!['vendor-resource-activation-v1','local-resource-activation-v1'].includes(capability?.capability||'')||!capability?.available||pool?.status!=='ready'||!pool.poolRevision||!configuration.version)
    throw new Error(pool?.blockReason?.message||'Resource tracking is not ready to enable. Refresh this location’s setup.');
  return {path:`/vendor/tenant/${encodeURIComponent(tenant)}/locations/${encodeURIComponent(location)}/resources/${encodeURIComponent(poolId)}/${capability.capability==='vendor-resource-activation-v1'?'tracking/activate':'activate'}`,body:{expectedPoolRevision:pool.poolRevision,configurationVersion:configuration.version},key};
}
export function submitResourceActivation(token:string,attempt:ResourceActivationAttempt) {
  return apiRequest<ResourceConfiguration>(attempt.path,{token,method:'POST',body:attempt.body,headers:{'Idempotency-Key':attempt.key}});
}
