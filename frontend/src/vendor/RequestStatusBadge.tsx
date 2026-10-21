import { Badge } from './components/ui/badge';
import { requestStatusIntent } from './requestStatusIntent';

export function RequestStatusBadge({state,label}:{state:string;label?:string}) {
  return <Badge variant={requestStatusIntent(state)} className="request-status-badge">{label || state.replaceAll('_',' ')}</Badge>;
}
