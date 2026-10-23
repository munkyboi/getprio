import { Progress } from './components/ui/progress';
import { Badge } from './components/ui/badge';
import { durationInterval, durationLabel, type AllocationInterval } from './requestDuration';
export function RequestDurationProgress({member,now,label,current=true}:{member:AllocationInterval;now:number;label:string;current?:boolean}){
 const duration=durationInterval(member,now);
 if(!duration||!current&&!member.releasedAt)return <p className="request-metadata">Timing unavailable</p>;
 const band=duration.percent<=25?'blue':duration.percent<=50?'green':duration.percent<=75?'orange':'red';
 return <div className="request-duration-progress" data-progress-band={band}><div className="request-duration-caption"><span>{durationLabel(duration.elapsed)} / {durationLabel(duration.planned)} · {duration.finished?'recorded elapsed':'since start'}</span>{duration.overdue?<Badge variant="warning">OVERDUE</Badge>:null}</div><Progress value={duration.percent} aria-label={`${label} planned time elapsed`} aria-valuetext={`${durationLabel(duration.elapsed)} of ${durationLabel(duration.planned)}${duration.overdue?', overdue':''}${duration.finished?', stopped':''}`}/></div>;
}
