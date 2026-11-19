import { apiRequest, ApiError } from "../api/client";
let cooldown: ApiError | null = null;
/** Share the server's cooldown across per-ticket reads in this browser page. */
export async function queueReadRequest<T>(path:string,options:{token:string;signal?:AbortSignal}):Promise<T> {
  if(cooldown?.retryAt && Date.now()<cooldown.retryAt)throw cooldown;
  try{return await apiRequest<T>(path,options);}catch(error){
    if(error instanceof ApiError && error.status===429)cooldown=error;
    throw error;
  }
}
