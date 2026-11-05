import type { QueueChildExecutionV3, QueuePublishedSelectionPlanV3 } from '../../../shared/queueSelectionPlanV3';
import type { QueuePublishedSelectionPlanV4 } from '../../../shared/queueSelectionPlanV4';
import { namedChildCommand, namedPlanRevisions } from './namedQueueCommands';

type Plan = QueuePublishedSelectionPlanV3 | QueuePublishedSelectionPlanV4;
export type CompletionReview = { plan: Plan; child?: QueueChildExecutionV3; label: string };
export type CompletionCommand = { kind: 'command'; id: string; action: 'complete'; body: object; key: string };

export function completionBody(review: CompletionReview) {
  const { plan, child } = review;
  if (!plan.capabilities.childOutcomes) throw Error('Completion is unavailable. Refresh this request.');
  if (child) {
    if (!child.allowedActions.includes('complete')) throw Error('This resource cannot be completed. Refresh this request.');
    return namedChildCommand(plan, child);
  }
  const groups = plan.allocationGroups.filter(group => group.stageAttemptId === plan.currentStage.attemptId && !group.releasedAt);
  if (groups.length !== 1) throw Error('Refresh this request to review its active allocation.');
  return { ...namedPlanRevisions(plan), allocationGroupId: groups[0].id, completeAll: true };
}

/** Opening/dismissing a review never executes a command; confirmation is the only write boundary. */
export function createCompletionReview({ onChange, execute, isLocked, createKey }: {
  onChange: (review: CompletionReview | null) => void;
  execute: (command: CompletionCommand) => Promise<void>;
  isLocked: () => boolean;
  createKey: () => string;
}) {
  let current: CompletionReview | null = null;
  let confirming = false;
  const reset = () => { current = null; onChange(null); };
  return {
    open(review: CompletionReview) {
      if (isLocked() || confirming) return;
      completionBody(review);
      current = review;
      onChange(review);
    },
    dismiss() { if (!isLocked() && !confirming) reset(); },
    reset,
    async confirm() {
      if (!current || isLocked() || confirming) return;
      const command: CompletionCommand = { kind: 'command', id: current.plan.id, action: 'complete', body: completionBody(current), key: createKey() };
      confirming = true;
      try { await execute(command); } finally { confirming = false; }
    },
  };
}
