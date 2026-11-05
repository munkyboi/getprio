// A read observes recorded ledger values; it never repairs or releases them.
function quality(pool, issues) {
  const reasons = [];
  if (pool.archived_at) reasons.push('pool_archived');
  if (!pool.tracking_enabled) reasons.push('tracking_disabled');
  const relevant = issues.filter(issue => !issue.poolId || issue.poolId === pool.id);
  for (const code of ['protection_expired', 'protection_inconsistent']) {
    if (relevant.some(issue => issue.code === code)) reasons.push(code);
  }
  if (relevant.length) reasons.push('reconciliation_required');
  return {availabilityQuality:reasons.length ? 'unknown' : 'observed', availabilityReasonCodes:reasons};
}
module.exports = {quality};
