const { CONTEXT, COLLECTIONS, buildCounts } = require('./resourceInventoryReportQueries');
const { bookingCallNotReady, waitingPriorityOrder, priorityBandRank } = require('./queueDispatchRules');
const SOURCE_CONTEXT = `${CONTEXT}, dispatch_scope AS MATERIALIZED (
  SELECT l.queue_lifecycle_mode,l.is_active AS location_active,t.is_active AS tenant_active,
    q.id::text AS open_day_id,q.version::text AS open_day_version,q.deadline_version::text AS open_deadline_version,
    CASE WHEN l.queue_lifecycle_mode='enforced' THEN to_char(q.business_date,'YYYYMMDD')
      ELSE to_char(transaction_timestamp() AT TIME ZONE COALESCE(l.timezone,'Asia/Manila'),'YYYYMMDD') END AS date_key,
    CASE WHEN l.queue_lifecycle_mode='enforced' THEN COALESCE(q.current_closes_at>transaction_timestamp(),FALSE)
      ELSE NOT EXISTS (SELECT 1 FROM queue_day_closures c WHERE c.tenant_id=$1 AND c.location_id=$2
        AND c.queue_date_key=to_char(transaction_timestamp() AT TIME ZONE COALESCE(l.timezone,'Asia/Manila'),'YYYYMMDD')
        AND c.reopened_at IS NULL) END AS queue_open
  FROM store_locations l JOIN tenants t ON t.id=l.tenant_id
  LEFT JOIN LATERAL (SELECT * FROM queue_days WHERE tenant_id=$1 AND location_id=$2 AND state='open'
    ORDER BY business_date DESC,id DESC LIMIT 1) q ON TRUE
  WHERE l.tenant_id=$1 AND l.id=$2
), candidates AS MATERIALIZED (
  SELECT w.id,w.service_priority_band,${priorityBandRank('w.')} AS priority_rank,w.carry_over_count,w.created_at
  FROM tickets w CROSS JOIN dispatch_scope d
  WHERE w.tenant_id=$1 AND w.location_id=$2 AND w.status='waiting' AND w.date_key=d.date_key
    AND NOT ${bookingCallNotReady('w', true)}
), candidate_order AS (
  SELECT id,DENSE_RANK() OVER (ORDER BY ${waitingPriorityOrder()})::text AS order_group,
    COUNT(*) OVER (PARTITION BY priority_rank,carry_over_count,created_at)::text AS tie_count
  FROM candidates
)`;
const SOURCE_COLLECTIONS = {
  ...COLLECTIONS,
  work: { ...COLLECTIONS.work, rows: `SELECT w.id::text,w.status,w.join_channel,
    (w.developer_project_id IS NOT NULL) AS developer_linked,w.customer_confirmed,w.created_at,w.service_started_at,w.service_ended_at,
    w.service_priority_band,w.carry_over_count,w.current_queue_day_id::text,w.original_queue_day_id::text,
    t.date_key,t.service_counter_id::text,(t.rejoin_deadline_at>transaction_timestamp()) AS recovery_available,
    (EXTRACT(EPOCH FROM w.created_at)*1000000)::bigint::text AS created_at_us,
    (o.id IS NOT NULL) AS sql_candidate,o.order_group,o.tie_count,
    ${bookingCallNotReady('t', true)} AS booking_call_not_ready,
    p.source AS plan_source,p.booking_id::text,p.execution_mode,p.items,p.created_at AS plan_captured_at
    FROM work_scope w JOIN tickets t ON t.id=w.id AND t.tenant_id=$1 AND t.location_id=$2
    LEFT JOIN ticket_service_plans p ON (p.ticket_id,p.tenant_id,p.location_id)=(w.id,$1,$2)
    LEFT JOIN candidate_order o ON o.id=w.id ORDER BY w.id` },
  dispatchScope: { maximum: 1, count:'SELECT COUNT(*) FROM dispatch_scope', rows:'SELECT * FROM dispatch_scope' },
  counters: { maximum: 100, count:'SELECT COUNT(*) FROM service_counters WHERE tenant_id=$1 AND location_id=$2',
    rows:'SELECT id::text,is_active FROM service_counters WHERE tenant_id=$1 AND location_id=$2 ORDER BY id' }
};
module.exports = { SOURCE_CONTEXT, SOURCE_COLLECTIONS, SOURCE_COUNTS: buildCounts(SOURCE_CONTEXT,SOURCE_COLLECTIONS) };
