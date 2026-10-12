// Every collection uses the same scope and work predicate. No queue-date or
// customer-claim filter: actual held work can outlive a closed queue day.
const CONTEXT = `WITH scope_tickets AS MATERIALIZED (
  SELECT id,status,join_channel,developer_project_id,created_at,service_started_at,service_ended_at,
    service_priority_band,carry_over_count,current_queue_day_id,original_queue_day_id
  FROM tickets WHERE tenant_id=$1 AND location_id=$2
), held_allocations AS MATERIALIZED (
  SELECT * FROM resource_allocations WHERE tenant_id=$1 AND location_id=$2 AND released_at IS NULL
), work_scope AS MATERIALIZED (
  SELECT t.* FROM scope_tickets t WHERE t.status IN ('waiting','called','skipped','pending_carry_over')
    OR (t.service_started_at IS NOT NULL AND t.service_ended_at IS NULL)
    OR EXISTS (SELECT 1 FROM held_allocations a WHERE a.ticket_id=t.id)
), linked_bookings AS (
  SELECT p.booking_id AS id FROM ticket_service_plans p JOIN work_scope w ON w.id=p.ticket_id
    WHERE p.tenant_id=$1 AND p.location_id=$2 AND p.booking_id IS NOT NULL
  UNION SELECT b.id FROM bookings b JOIN work_scope w ON w.id=b.queue_ticket_id
    WHERE b.tenant_id=$1 AND b.location_id=$2
), relevant_items AS MATERIALIZED (
  SELECT i.*,b.status AS booking_status,b.pending_expires_at,
    (b.payment_proof_object_key IS NOT NULL AND b.payment_proof_object_key<>'') AS proof_present,
    b.scheduled_start_at AS booking_scheduled_start_at,
    (b.status='pending' AND NOT (b.payment_proof_object_key IS NOT NULL AND b.payment_proof_object_key<>'')
      AND b.pending_expires_at<=transaction_timestamp()) AS pending_expired,
    (i.scheduled_end_at>transaction_timestamp()) AS interval_not_elapsed,
    (EXTRACT(EPOCH FROM (i.scheduled_end_at-i.scheduled_start_at))/60)::text AS duration_minutes,
    (SELECT COUNT(*)::text FROM booking_bundle_items sibling
      WHERE sibling.booking_id=i.booking_id AND sibling.tenant_id=$1 AND sibling.location_id=$2) AS item_count
  FROM booking_bundle_items i JOIN bookings b
    ON (b.id,b.tenant_id,b.location_id)=(i.booking_id,i.tenant_id,i.location_id)
  WHERE i.tenant_id=$1 AND i.location_id=$2 AND
    ((i.scheduled_start_at<$4::timestamptz AND i.scheduled_end_at>$3::timestamptz)
      OR i.booking_id IN (SELECT id FROM linked_bookings)
      OR EXISTS (SELECT 1 FROM resource_ledger_reservations r WHERE r.booking_item_id=i.id AND r.tenant_id=$1 AND r.location_id=$2
        AND r.state='protected' AND ((r.starts_at<$4::timestamptz AND r.ends_at>$3::timestamptz)
          OR r.starts_at IS NULL OR r.ends_at IS NULL OR NOT isfinite(r.starts_at) OR NOT isfinite(r.ends_at)))
      OR EXISTS (SELECT 1 FROM resource_ledger_reservations r JOIN held_allocations a ON a.reservation_id=r.id
        WHERE r.booking_item_id=i.id AND r.tenant_id=$1 AND r.location_id=$2))
), relevant_bindings AS MATERIALIZED (
  SELECT r.* FROM resource_ledger_reservations r WHERE r.tenant_id=$1 AND r.location_id=$2 AND
    ((r.state='protected' AND ((r.starts_at<$4::timestamptz AND r.ends_at>$3::timestamptz)
      OR r.starts_at IS NULL OR r.ends_at IS NULL OR NOT isfinite(r.starts_at) OR NOT isfinite(r.ends_at)))
      OR r.booking_item_id IN (SELECT id FROM relevant_items)
      OR r.id IN (SELECT reservation_id FROM held_allocations))
), relevant_days AS MATERIALIZED (
  SELECT q.* FROM queue_days q WHERE q.tenant_id=$1 AND q.location_id=$2 AND
    (q.state='open' OR q.id IN (SELECT current_queue_day_id FROM work_scope)
      OR q.id IN (SELECT original_queue_day_id FROM work_scope))
), relevant_segments AS MATERIALIZED (
  SELECT s.* FROM queue_ticket_segments s JOIN work_scope w ON w.id=s.ticket_id
    JOIN queue_days q ON q.id=s.queue_day_id AND q.tenant_id=$1 AND q.location_id=$2
  WHERE s.ended_at IS NULL
)`;

const COLLECTIONS = {
  pools: { maximum: 100, count: 'SELECT COUNT(*) FROM location_resource_pools WHERE tenant_id=$1 AND location_id=$2',
    rows: 'SELECT id::text,capacity,revision::text,tracking_enabled FROM location_resource_pools WHERE tenant_id=$1 AND location_id=$2 ORDER BY id' },
  requirements: { maximum: 10000, count: 'SELECT COUNT(*) FROM service_resource_requirements WHERE tenant_id=$1 AND location_id=$2',
    rows: 'SELECT service_id::text,pool_id::text,units_required,revision::text FROM service_resource_requirements WHERE tenant_id=$1 AND location_id=$2 ORDER BY service_id' },
  work: { maximum: 10000, count: 'SELECT COUNT(*) FROM work_scope', rows: `SELECT w.id::text,w.status,w.join_channel,
    (w.developer_project_id IS NOT NULL) AS developer_linked,w.created_at,w.service_started_at,w.service_ended_at,
    w.service_priority_band,w.carry_over_count,w.current_queue_day_id::text,w.original_queue_day_id::text,
    p.source AS plan_source,p.booking_id::text,p.execution_mode,p.items,p.created_at AS plan_captured_at
    FROM work_scope w LEFT JOIN ticket_service_plans p ON (p.ticket_id,p.tenant_id,p.location_id)=(w.id,$1,$2) ORDER BY w.id` },
  allocations: { maximum: 10000, count: 'SELECT COUNT(*) FROM held_allocations', rows: `SELECT id::text,ticket_id::text,pool_id::text,
    pool_revision::text,units,reservation_id::text,started_at,expected_end_at,
    (SELECT a.started_at IS NOT DISTINCT FROM w.service_started_at FROM work_scope w WHERE w.id=a.ticket_id) AS ticket_start_matches
    FROM held_allocations a ORDER BY id` },
  bookingItems: { maximum: 20000, count: 'SELECT COUNT(*) FROM relevant_items', rows: `SELECT id::text,booking_id::text,service_id::text,
    booking_quantity,scheduled_start_at,scheduled_end_at,booking_scheduled_start_at,booking_status,pending_expires_at,proof_present,item_count,
    pending_expired,interval_not_elapsed,duration_minutes
    FROM relevant_items ORDER BY id` },
  bindings: { maximum: 20000, count: 'SELECT COUNT(*) FROM relevant_bindings', rows: `SELECT id::text,booking_id::text,booking_item_id::text,
    pool_id::text,pool_revision::text,requirement_revision::text,units,starts_at,ends_at,state,
    CASE WHEN isfinite(starts_at) THEN (EXTRACT(EPOCH FROM starts_at)*1000000)::bigint::text END AS starts_at_us,
    CASE WHEN isfinite(ends_at) THEN (EXTRACT(EPOCH FROM ends_at)*1000000)::bigint::text END AS ends_at_us,
    (starts_at<$4::timestamptz AND ends_at>$3::timestamptz) AS overlaps_window,
    (SELECT r.starts_at=i.scheduled_start_at AND r.ends_at=i.scheduled_end_at FROM relevant_items i WHERE i.id=r.booking_item_id) AS booking_interval_matches
    FROM relevant_bindings r ORDER BY id` },
  queueDays: { maximum: 10000, count: 'SELECT COUNT(*) FROM relevant_days', rows: `SELECT id::text,business_date::text,state,intake_mode,
    version::text,deadline_version::text,last_reconciled_at,(last_reconciliation_error IS NOT NULL) AS reconciliation_error
    FROM relevant_days ORDER BY id` },
  segments: { maximum: 20000, count: 'SELECT COUNT(*) FROM relevant_segments', rows: `SELECT id::text,ticket_id::text,queue_day_id::text,
    sequence,priority_band,activated_at,legacy_inferred FROM relevant_segments ORDER BY id` }
};

const COUNTS = `${CONTEXT} SELECT ${Object.entries(COLLECTIONS).map(([name, collection]) => `(${collection.count})::text AS "${name}"`).join(',')},
  (SELECT COUNT(*)::text FROM scope_tickets) AS "historicalTickets",
  (SELECT COUNT(*)::text FROM scope_tickets WHERE status='served' AND service_started_at IS NULL) AS "servedWithoutExplicitStart",
  (SELECT COUNT(*)::text FROM scope_tickets t WHERE service_started_at IS NOT NULL AND NOT EXISTS
    (SELECT 1 FROM ticket_service_plans p WHERE p.ticket_id=t.id AND p.tenant_id=$1 AND p.location_id=$2)) AS "startedWithoutCapturedPlan",
  (SELECT COUNT(*)::text FROM resource_ledger_reservations r WHERE r.tenant_id=$1 AND r.location_id=$2 AND r.state='converted'
    AND NOT EXISTS (SELECT 1 FROM resource_allocations a WHERE a.reservation_id=r.id AND a.tenant_id=$1 AND a.location_id=$2)) AS "convertedWithoutAllocation",
  (SELECT COUNT(*)::text FROM bookings b WHERE b.tenant_id=$1 AND b.location_id=$2
    AND b.status IN ('pending','confirmed','rescheduled')
    AND ((b.scheduled_start_at<$4::timestamptz AND b.scheduled_end_at>$3::timestamptz) OR b.id IN (SELECT id FROM linked_bookings))
    AND NOT EXISTS (SELECT 1 FROM booking_bundle_items i WHERE i.booking_id=b.id AND i.tenant_id=$1 AND i.location_id=$2)) AS "bookingParentsWithoutItems"`;
module.exports = { CONTEXT, COLLECTIONS, COUNTS };
