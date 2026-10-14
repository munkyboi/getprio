const db = require('../config/db');

// Business facts remain observable when allowance enforcement is not enabled.
// Existing ledger subjects (including reversed subjects) are counted separately
// so reporting never invents another debit for already-accounted work.
async function getCycleUsage(tenantId, period, options = {}) {
  const client = options.client || db.pool;
  const result = await client.query(`
    WITH facts AS (
      SELECT 'queueTickets'::text AS resource_key, 'queue_ticket'::text AS subject_type, id::text AS subject_id
      FROM tickets WHERE tenant_id=$1 AND created_at >= $2 AND created_at < $3
      UNION ALL
      SELECT 'serviceBookings', 'service_booking', id::text
      FROM bookings WHERE tenant_id=$1 AND created_at >= $2 AND created_at < $3
    )
    SELECT facts.resource_key, COUNT(*)::integer AS created,
      COUNT(*) FILTER (WHERE NOT EXISTS (
        SELECT 1 FROM allowance_operations operation
        JOIN usage_accounts account ON account.id=operation.usage_account_id
        JOIN subscription_allowance_periods period ON period.id=operation.allowance_period_id
        WHERE account.tenant_id=$1 AND account.resource_key=facts.resource_key
          AND period.subscription_id=$4 AND date_trunc('milliseconds',period.period_start)=date_trunc('milliseconds',$2::timestamptz)
          AND date_trunc('milliseconds',period.period_end)=date_trunc('milliseconds',$3::timestamptz)
          AND operation.subject_type=facts.subject_type AND operation.subject_id=facts.subject_id
          AND operation.operation_type IN ('consume','baseline')
          AND EXISTS (SELECT 1 FROM allowance_allocations allocation WHERE allocation.operation_id=operation.id AND allocation.units > 0)
      ))::integer AS unaccounted
    FROM facts GROUP BY facts.resource_key`,
  [tenantId, period.start, period.end, options.subscriptionId]);
  return Object.fromEntries(result.rows.map(row => [row.resource_key, {
    created: Number(row.created), unaccounted: Number(row.unaccounted)
  }]));
}

module.exports = { getCycleUsage };
