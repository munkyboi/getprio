import type { QueuePublishedSelectionPlanV3 } from '../../../shared/queueSelectionPlanV3';
import type { QueuePublishedSelectionPlanV4 } from '../../../shared/queueSelectionPlanV4';

export type QueueResourceConflictPlan = QueuePublishedSelectionPlanV3 | QueuePublishedSelectionPlanV4;

/** Displays the backend's authoritative resource-wait projection. */
export function resourceConflictIds(plans:QueueResourceConflictPlan[]){
 return new Set(plans.filter(plan=>plan.state==='waiting'&&Boolean(plan.resourceWait)).map(plan=>plan.id));
}
