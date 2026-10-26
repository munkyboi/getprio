/** Customer-safe workflow projection. Never contains operator, pool or allocation identities. */
export type QueueJourneyStageState='pending'|'awaiting_readiness'|'awaiting_arrival'|'waiting'|'called'|'in_service'|'paused'|'completed'|'interrupted'|'cancelled'|'skipped';
export interface QueueJourneyProgress {
 contract:'queue-journey-progress-v1';
 reference:string;
 currentStage:number;
 stages:Array<{ordinal:number;label:string;state:QueueJourneyStageState;reference:string;queuePosition:number|null}>;
}
export const journeyStageLabels:Record<QueueJourneyStageState,string>={pending:'Later in your visit',awaiting_readiness:'Waiting for results or preparation',awaiting_arrival:'Please check in at this station',waiting:'Waiting at this station',called:'Please go to the service counter',in_service:'Being served',paused:'Service paused',completed:'Completed',interrupted:'Staff assistance needed',cancelled:'Cancelled',skipped:'Missed call'};
export function currentJourneyStage(journey:QueueJourneyProgress){return journey.stages.find(stage=>stage.ordinal===journey.currentStage)||null;}
