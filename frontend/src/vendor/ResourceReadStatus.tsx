import { OperationAlert, OperationButton } from './OperationsUi';

export function ResourceReadStatus({state,refreshing,onRetry}:{state:'checking'|'unavailable'|'ready'|'not_applicable';refreshing:boolean;onRetry:()=>void}) {
  if(state==='ready')return null;
  if(state==='not_applicable')return <p role="status">Resource observations are not available for this business in this local preview.</p>;
  if(state==='checking')return <p role="status">Checking resource reconciliation status…</p>;
  return <OperationAlert color="orange" title="Resource status unavailable">Resource reconciliation status could not be checked. Refresh before relying on resource availability.<OperationButton variant="outline" disabled={refreshing} onClick={onRetry}>Retry resource status</OperationButton></OperationAlert>;
}
