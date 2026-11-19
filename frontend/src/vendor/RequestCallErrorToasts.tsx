import { useEffect, useRef } from 'react';
import { useVendorNotifications } from './VendorToasts';
import { showRequestCallRejections, type RequestCallRejection } from './callRequestNotifications';
/** Consume actual rejection events through the existing scoped toast host. */
export function RequestCallErrorToasts({rejections,scope}:{rejections:Record<string,RequestCallRejection>;scope:string}){
 const notifications=useVendorNotifications(),seen=useRef(new Set<string>());
 useEffect(()=>{showRequestCallRejections(rejections,scope,seen.current,notice=>notifications.show(notice));},[rejections,scope,notifications]);
 return null;
}
