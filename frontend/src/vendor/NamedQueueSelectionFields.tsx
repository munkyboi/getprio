import { IconTrash } from '@tabler/icons-react';
import { ConfigurationInput, ConfigurationSelect } from './ConfigurationUi';
import { EntityCard, EntityGrid, EntityIconAction } from './EntityCards';
import { Button } from './components/ui/button';
import { namedSelectionScheduleIssues, updateCourtSelection, updateExtraSelection, type NamedQueueServiceDraft } from './namedQueueSelectionDraft';

/** UI options adapter; populate only from the reviewed server catalog, never inferred booking policy. */
export interface NamedQueueServiceChoice {
 id:string;name:string;durationOptionsMinutes:number[];
 resourceMembers:Array<{id:string;name:string;availabilityLabel?:string}>;
 extras:Array<{id:string;name:string;quantityMin:number;quantityMax:number;durationOptionsMinutes:number[];availabilityLabel?:string;resourceReady?:boolean}>;
}
const fieldLabel=(label:string,context:string)=><>{label}<span className="v:sr-only"> for {context}</span></>;
function durationOptions(minutes:number[],current:string){return [{value:'__none__',label:'Choose duration'},...minutes.map(value=>({value:String(value),label:`${value} minutes`})),...(current&&!minutes.includes(Number(current))?[{value:current,label:`${current} minutes · Review duration`}]:[])];}
/** Prepared nested controls. No transport/query/command or availability inference. */
export function NamedQueueSelectionFields({selections,options,busy,onChange}:{selections:NamedQueueServiceDraft[];options:NamedQueueServiceChoice[];busy:boolean;onChange:(selections:NamedQueueServiceDraft[])=>void}) {
 const issues=namedSelectionScheduleIssues(selections);
 return <section className="queue-stack named-queue-fields" aria-label="Service resource selections">
  <div className="ops-list-heading"><div><h2>Services requested</h2><p className="ops-muted">Select resources beneath a service. Review their configured duration and extra policies.</p></div><Button type="button" variant="outline" disabled={busy} onClick={()=>onChange([...selections,{serviceSelectionId:crypto.randomUUID(),serviceId:'',courts:[]}])}>Add service</Button></div>
  <p className="ops-muted">Availability while editing is provisional. These selections do not reserve resources. A quote is unavailable unless the server supplies an explicit configured rate policy.</p>
  <EntityGrid label="Service selections">{selections.map((service,serviceIndex)=>{
   const catalog=options.find(option=>option.id===service.serviceId);
   return <EntityCard key={service.serviceSelectionId} title={`Service ${serviceIndex+1}${catalog?` · ${catalog.name}`:''}`} footer={<EntityIconAction label={`Remove service ${serviceIndex+1}`} disabled={busy} onClick={()=>onChange(selections.filter(item=>item.serviceSelectionId!==service.serviceSelectionId))}><IconTrash aria-hidden="true"/></EntityIconAction>}>
    <div className="queue-stack">
     <ConfigurationSelect label={`Service ${serviceIndex+1}`} value={service.serviceId||'__none__'} disabled={busy} data={[{value:'__none__',label:'Choose service'},...options.map(option=>({value:option.id,label:option.name})),...(!catalog&&service.serviceId?[{value:service.serviceId,label:'Unavailable service'}]:[])]} onChange={value=>onChange(selections.map(item=>item.serviceSelectionId===service.serviceSelectionId?{...item,serviceId:value==='__none__'?'':value||''}:item))}/>
     {service.serviceId&&!catalog?<p role="alert">This service is unavailable. Existing resource and extra selections are retained for review.</p>:null}
     <Button type="button" variant="outline" disabled={busy||!catalog} onClick={()=>onChange(selections.map(item=>item.serviceSelectionId===service.serviceSelectionId?{...item,courts:[...item.courts,{courtSelectionId:crypto.randomUUID(),resourceMemberId:'',durationMinutes:'',extras:[]}]}:item))}>Add resource to service {serviceIndex+1}</Button>
     <ol className="queue-stack" aria-label={`Resources for service ${serviceIndex+1}`}>{service.courts.map((court,courtIndex)=>{
      const member=catalog?.resourceMembers.find(item=>item.id===court.resourceMemberId),label=`service ${serviceIndex+1}, resource ${courtIndex+1}`;
      return <li key={court.courtSelectionId}><fieldset className="queue-stack named-court-fields"><legend>{member?.name||`Resource ${courtIndex+1}`}</legend>
       <ConfigurationSelect label={fieldLabel("Resource",label)} value={court.resourceMemberId||'__none__'} disabled={busy||!catalog} data={[{value:'__none__',label:'Choose resource'},...(catalog?.resourceMembers||[]).map(item=>({value:item.id,label:item.name})),...(!member&&court.resourceMemberId?[{value:court.resourceMemberId,label:'Unavailable resource'}]:[])]} onChange={value=>onChange(updateCourtSelection(selections,service.serviceSelectionId,court.courtSelectionId,{resourceMemberId:value==='__none__'?'':value||''}))}/>
       <p className="ops-muted">One named resource · Duration does not change resource quantity.</p>
       {member?.availabilityLabel?<p>{member.availabilityLabel} · Provisional, not a hold.</p>:null}
       <ConfigurationSelect label={fieldLabel("Duration",label)} value={court.durationMinutes||'__none__'} disabled={busy||!catalog?.durationOptionsMinutes.length} data={durationOptions(catalog?.durationOptionsMinutes||[],court.durationMinutes)} onChange={value=>onChange(updateCourtSelection(selections,service.serviceSelectionId,court.courtSelectionId,{durationMinutes:value==='__none__'?'':value||''}))}/>
       <div className="queue-row"><Button type="button" variant="outline" disabled={busy||!catalog?.extras.length} onClick={()=>onChange(selections.map(item=>item.serviceSelectionId===service.serviceSelectionId?{...item,courts:item.courts.map(record=>record.courtSelectionId===court.courtSelectionId?{...record,extras:[...record.extras,{extraSelectionId:crypto.randomUUID(),serviceId:'',quantity:'',durationMinutes:''}]}:record)}:item))}>Add extra for {member?.name||`resource ${courtIndex+1}`}</Button><EntityIconAction label={`Remove ${label}`} disabled={busy} onClick={()=>onChange(selections.map(item=>item.serviceSelectionId===service.serviceSelectionId?{...item,courts:item.courts.filter(record=>record.courtSelectionId!==court.courtSelectionId)}:item))}><IconTrash aria-hidden="true"/></EntityIconAction></div>
       <ul className="queue-stack" aria-label={`Extras for ${label}`}>{court.extras.map((extra,extraIndex)=>{
        const extraPolicy=catalog?.extras.find(item=>item.id===extra.serviceId),extraLabel=`${label}, extra ${extraIndex+1}`;
        const minutes=extraPolicy?.durationOptionsMinutes.filter(value=>Boolean(court.durationMinutes)&&value<=Number(court.durationMinutes))||[];
        return <li key={extra.extraSelectionId}><fieldset className="queue-stack named-extra-fields"><legend>{extraPolicy?.name||`Extra ${extraIndex+1}`}</legend>
         <ConfigurationSelect label={fieldLabel("Extra service",extraLabel)} value={extra.serviceId||'__none__'} disabled={busy||!catalog} data={[{value:'__none__',label:'Choose extra'},...(catalog?.extras||[]).map(item=>({value:item.id,label:item.name})),...(!extraPolicy&&extra.serviceId?[{value:extra.serviceId,label:'Unavailable extra'}]:[])]} onChange={value=>onChange(updateExtraSelection(selections,service.serviceSelectionId,court.courtSelectionId,extra.extraSelectionId,{serviceId:value==='__none__'?'':value||''}))}/>
         {extraPolicy?.availabilityLabel?<p className="ops-muted">{extraPolicy.availabilityLabel} · Provisional, not a hold.</p>:null}{extraPolicy?.resourceReady===false?<p role="status">This extra’s resource setup is not ready for publication.</p>:null}
         <ConfigurationInput label={fieldLabel("Extra quantity",extraLabel)} type="number" inputMode="numeric" step={1} min={extraPolicy?.quantityMin} max={extraPolicy?.quantityMax} value={extra.quantity} disabled={busy||!extraPolicy} onChange={event=>onChange(updateExtraSelection(selections,service.serviceSelectionId,court.courtSelectionId,extra.extraSelectionId,{quantity:event.currentTarget.value}))}/>
         <ConfigurationSelect label={fieldLabel("Extra duration",extraLabel)} value={extra.durationMinutes||'__none__'} disabled={busy||!minutes.length} data={durationOptions(minutes,extra.durationMinutes)} onChange={value=>onChange(updateExtraSelection(selections,service.serviceSelectionId,court.courtSelectionId,extra.extraSelectionId,{durationMinutes:value==='__none__'?'':value||''}))}/>
         {issues.filter(issue=>issue.extraSelectionId===extra.extraSelectionId&&issue.courtSelectionId===court.courtSelectionId).map(issue=><p key={issue.extraSelectionId} role="alert">{issue.message}</p>)}
         <EntityIconAction label={`Remove ${extraLabel}`} disabled={busy} onClick={()=>onChange(selections.map(item=>item.serviceSelectionId===service.serviceSelectionId?{...item,courts:item.courts.map(record=>record.courtSelectionId===court.courtSelectionId?{...record,extras:record.extras.filter(value=>value.extraSelectionId!==extra.extraSelectionId)}:record)}:item))}><IconTrash aria-hidden="true"/></EntityIconAction>
        </fieldset></li>;
       })}</ul>
      </fieldset></li>;
     })}</ol>
    </div>
   </EntityCard>;
  })}</EntityGrid>
 </section>;
}
