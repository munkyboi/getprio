type Intent = 'secondary' | 'info' | 'success' | 'warning' | 'destructive';
const intents: Record<string, Intent> = {
  draft:'secondary', pending:'secondary', superseded:'secondary',
  waiting:'warning', pending_carry_over:'warning', paused:'warning',
  called:'info', protected:'info', in_service:'info', awaiting_handoff:'info',
  open:'info', converted:'info',
  served:'success', completed:'success', released:'success',
  interrupted:'warning', partial:'warning', mixed:'warning',
  skipped:'warning', unserved:'warning',
  cancelled:'destructive', canceled:'destructive', terminated:'destructive',
  expired:'secondary',
};
/** Presentation only: never derive lifecycle state or permission from badge intent. */
export function requestStatusIntent(state: string): Intent {
  const key=state.toLowerCase().replaceAll(' ','_');
  return Object.hasOwn(intents,key)?intents[key]:'secondary';
}
