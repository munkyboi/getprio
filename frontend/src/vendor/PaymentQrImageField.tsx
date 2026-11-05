import { useEffect, useRef, useState } from "react";
import { ConfigurationFile } from "./ConfigurationUi";
import { Button } from "./components/ui/button";
export function PaymentQrImageField({url,file,disabled,onFile,onUpload}:{url:string;file:File|null;disabled:boolean;onFile:(file:File|null)=>void;onUpload:(file:File,onPrepared:(blob:Blob)=>void)=>Promise<boolean>}){
 const [preview,setPreview]=useState<string|null>(null),[uploaded,setUploaded]=useState(false),[failed,setFailed]=useState(false),[retry,setRetry]=useState(0);
 const generation=useRef(0);
 useEffect(()=>()=>{generation.current+=1;},[]);
 useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview);},[preview]);
 useEffect(()=>{setFailed(false);},[url]);
 async function select(next:File|null){const request=++generation.current;onFile(next);setPreview(null);setUploaded(false);setFailed(false);if(!next)return;const ok=await onUpload(next,blob=>{if(generation.current===request)setPreview(URL.createObjectURL(blob));});if(generation.current!==request)return;setUploaded(ok);if(!ok){setPreview(null);onFile(null);}}
 return <><ConfigurationFile accept="image/jpeg,image/png,image/webp" disabled={disabled} label="QR image" description="Images are resized to the current platform limit before upload when possible." onChange={next=>void select(next)} placeholder={url?"Replace QR image":"Upload QR image"} value={file}/>
 {(preview||url)&&!failed?<img key={`visible:${retry}:${preview||url}`} alt="Payment QR preview" src={preview||url} className="config-image" onError={()=>setFailed(true)}/>:null}
 {uploaded&&preview&&url?<img key={`saved:${retry}:${url}`} alt="" aria-hidden="true" style={{display:"none"}} src={url} onLoad={()=>{setPreview(null);setFailed(false);}} onError={()=>setFailed(true)}/>:null}
 {failed?<div className="queue-stack"><p role="status">The image preview could not load. Your saved details have not been changed.</p><Button variant="outline" disabled={disabled} onClick={()=>{setFailed(false);setRetry(n=>n+1);}}>Retry preview</Button></div>:null}
 </>;
}
