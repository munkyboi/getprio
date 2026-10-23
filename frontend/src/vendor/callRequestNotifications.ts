export type RequestCallRejection={commandKey:string;message:string;unknown:boolean};
export function requestCallNotification(rejection:RequestCallRejection,scope:string){
 return {id:`queue-call-error-${JSON.stringify([scope,rejection.commandKey,rejection.unknown,rejection.message])}`,color:rejection.unknown?'red':'yellow',title:'Unable to call request',message:rejection.message,autoClose:7000};
}
/** Deduplicate the same command result, while keeping new attempts and reconciliation changes visible. */
export function showRequestCallRejections(rejections:Record<string,RequestCallRejection>,scope:string,seen:Set<string>,show:(notice:ReturnType<typeof requestCallNotification>)=>unknown){
 for(const rejection of Object.values(rejections)){
  const notification=requestCallNotification(rejection,scope);
  if(seen.has(notification.id))continue;
  seen.add(notification.id);show(notification);
 }
}
