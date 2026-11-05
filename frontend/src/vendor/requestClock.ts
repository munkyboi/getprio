import { useSyncExternalStore } from 'react';
const listeners=new Set<()=>void>();let timer:ReturnType<typeof setInterval>|undefined;let snapshot=0;
function tick(){snapshot=performance.now();listeners.forEach(listener=>listener());}
function visibility(){if(timer)clearInterval(timer);timer=undefined;if(!document.hidden&&listeners.size){tick();timer=setInterval(tick,1000);}}
function subscribe(listener:()=>void){listeners.add(listener);if(listeners.size===1){document.addEventListener('visibilitychange',visibility);visibility();}return()=>{listeners.delete(listener);if(!listeners.size){if(timer)clearInterval(timer);timer=undefined;document.removeEventListener('visibilitychange',visibility);}};}
/** One visible-page clock across tables. It never polls or issues commands. */
export function useRequestClock(){return useSyncExternalStore(subscribe,()=>snapshot,()=>0);}
