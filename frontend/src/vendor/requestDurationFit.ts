import type { QueueDurationPolicyV4, QueueSelectionOptionsV4 } from "../../../shared/queueSelectionPlanV4";
import type { NamedQueueServiceDraft } from "./namedQueueSelectionDraft";
import { countPolicyIntersection, countPolicyIssue } from "./durationCountPolicy";

export function selectionDurationPolicy(row: NamedQueueServiceDraft, options: QueueSelectionOptionsV4): QueueDurationPolicyV4 | undefined {
  const choices = row.directResource ? options.services.flatMap(service=>service.extras).filter(extra=>extra.serviceId===row.serviceId).map(extra=>extra.durationPolicy) : options.services.filter(service=>service.id===row.serviceId).map(service=>service.durationPolicy);
  const unique = [...new Map(choices.filter(Boolean).map(policy=>[JSON.stringify(policy),policy])).values()];
  return unique.length === 1 ? unique[0] : undefined;
}

export function requestDurationFit(rows: NamedQueueServiceDraft[], options: QueueSelectionOptionsV4, requestStartedAt: number | undefined, monotonicNow: number) {
  const unknown = {state: "unknown" as const, message: "We couldn't check the opening hours. Refresh hours to try again."};
  const window = options.serviceHoursWindow;
  if (!window || window.provisional !== true || !Number.isFinite(Date.parse(window.observedAt)) || !window.timezone || !Number.isFinite(requestStartedAt) || !Number.isFinite(monotonicNow) || monotonicNow < requestStartedAt!) return unknown;
  if (window.status === "closed") return {state: "closed" as const, message: "We're closed right now. Save this request as a draft and come back during opening hours."};
  if (window.status !== "open" || !window.timezone || window.opensAt === null || window.closesAt === null || !Number.isSafeInteger(window.remainingWholeMinutes) || window.remainingWholeMinutes! < 0) return unknown;
  const observed = Date.parse(window.observedAt), opens = Date.parse(window.opensAt), closes = Date.parse(window.closesAt);
  if (![observed, opens, closes].every(Number.isFinite) || opens > observed || closes <= observed || Math.floor((closes-observed)/60000) !== window.remainingWholeMinutes) return unknown;
  const remainingMs = closes-observed-(monotonicNow-requestStartedAt!);
  if (remainingMs <= 0) return {state:"closed" as const,message:"We're closed right now. Save this request as a draft and come back during opening hours."};
  const remaining = Math.min(window.remainingWholeMinutes!, Math.max(0, Math.floor(remainingMs/60000)));
  const selected = rows.filter(row => row.courts.length);
  if (!selected.length) return unknown;
  const policies: QueueDurationPolicyV4[] = [];
  const roots: {id: string; base: number; duration: number}[] = [];
  for (const row of selected) {
    const policy = selectionDurationPolicy(row, options);
    if (!policy) return unknown;
    policies.push(...row.courts.map(()=>policy));
    roots.push({id: row.serviceId, base: policy.baseMinutes, duration: Math.max(...row.courts.map(resource=>countPolicyIssue(resource.durationCount || "",policy) ? NaN : Number(resource.durationCount)*policy.baseMinutes))});
  }
  let base: number, duration: number;
  if (options.workflow.mode === "linear") {
    base = Math.max(...roots.map(root=>root.base)); duration = Math.max(...roots.map(root=>root.duration));
  } else if (options.workflow.mode === "multi_station") {
    const stages = options.workflow.stages;
    if (!stages.length || new Set(stages.map(stage=>stage.stageId)).size !== stages.length || roots.some(root=>stages.filter(stage=>stage.serviceIds.includes(root.id)).length!==1)) return unknown;
    base=0;duration=0;
    for (const stage of stages) {
      const members=roots.filter(root=>stage.serviceIds.includes(root.id));
      if(members.length){base+=Math.max(...members.map(root=>root.base));duration+=Math.max(...members.map(root=>root.duration));}
    }
  } else return unknown;
  if (!Number.isSafeInteger(base) || base<=0) return unknown;
  let closesLabel: string;
  try { closesLabel = new Intl.DateTimeFormat(undefined,{hour:"numeric",minute:"2-digit",timeZone:window.timezone}).format(new Date(closes)); } catch {return unknown;}
  if (!countPolicyIntersection(policies)) return {state:"incompatible" as const,message:"These resources need different durations. Review your selections.",closesLabel,remaining,remainingMs,policies};
  const countBounds=countPolicyIntersection(policies,Math.floor(remaining/base));
  if(!countBounds) return {state:"no_fit" as const,message:"There isn't enough time for this request before closing. Save it as a draft or choose different resources.",closesLabel,remaining,remainingMs,policies};
  return {state:"open" as const,message:Number.isFinite(duration)&&duration<=remaining?undefined:Number.isFinite(duration)?"There isn't enough time before closing. Choose a shorter duration.":"Enter a valid duration to check whether this request fits before closing.",closesLabel,remaining,remainingMs,policies,countBounds,duration,maximumMinutes:countBounds.max*base};
}
