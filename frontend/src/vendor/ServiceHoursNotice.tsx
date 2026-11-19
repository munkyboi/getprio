import type { QueueServiceHoursEligibilityV1 } from '../../../shared/queueServiceHoursEligibilityV1';
import { Badge } from './components/ui/badge';
import { serviceHoursNotice } from './queueServiceHoursPresentation';

export function ServiceHoursNotice({eligibility, showNeutral = false}: {eligibility?: QueueServiceHoursEligibilityV1 | null; showNeutral?: boolean}) {
  const notice = serviceHoursNotice(eligibility);
  if (!notice.blocked && !showNeutral) return null;
  return <div className="request-hours-notice"><Badge variant={notice.blocked ? 'warning' : 'secondary'} className="v:h-auto v:min-h-5 v:max-w-full v:whitespace-normal v:text-left">{notice.label}</Badge>{notice.message ? <p className="request-metadata">{notice.message}</p> : null}</div>;
}
