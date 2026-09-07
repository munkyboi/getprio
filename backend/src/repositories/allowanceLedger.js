const db = require("../config/db");

function runMutation(options, callback) {
  if (options.client) return callback(options.client);
  return db.withTransaction(callback);
}

async function consumeBase(input, options = {}) {
  return runMutation(options, (client) => consumeBaseWithClient(input, client));
}

async function consumeBaseWithClient(input, client) {
  const accountResult = await client.query(
    `INSERT INTO usage_accounts (tenant_id, resource_key)
     VALUES ($1, $2)
     ON CONFLICT (tenant_id, resource_key) DO UPDATE SET resource_key = EXCLUDED.resource_key
     RETURNING id`,
    [Number(input.tenantId), input.resourceKey]
  );
  const accountId = accountResult.rows[0].id;
  await client.query(`SELECT id FROM usage_accounts WHERE id = $1 FOR UPDATE`, [accountId]);

  const existing = await client.query(
    `SELECT id, signed_units FROM allowance_operations
     WHERE usage_account_id = $1 AND operation_key = $2 LIMIT 1`,
    [accountId, input.operationKey]
  );
  if (existing.rows[0]) {
    return { consumed: true, idempotent: true, operationId: String(existing.rows[0].id) };
  }

  const periodResult = await client.query(
    `INSERT INTO subscription_allowance_periods (subscription_id, period_start, period_end)
     VALUES ($1, $2, $3)
     ON CONFLICT (subscription_id, period_start) DO UPDATE SET period_end = EXCLUDED.period_end
     RETURNING id`,
    [Number(input.subscriptionId), input.periodStart, input.periodEnd]
  );
  const periodId = periodResult.rows[0].id;
  const usageResult = await client.query(
    `SELECT COALESCE(SUM(CASE WHEN ao.signed_units < 0 THEN -aa.units ELSE aa.units END), 0)::INTEGER AS used
     FROM allowance_allocations aa
     JOIN allowance_operations ao ON ao.id = aa.operation_id
     WHERE ao.usage_account_id = $1 AND aa.allowance_period_id = $2
       AND aa.source_type = 'base'`,
    [accountId, periodId]
  );
  const reservationResult = await client.query(
    `SELECT COALESCE(SUM(units), 0)::INTEGER AS reserved
     FROM allowance_reservations
     WHERE usage_account_id = $1 AND allowance_period_id = $2
       AND status = 'active' AND expires_at > NOW()`,
    [accountId, periodId]
  );
  const used = Number(usageResult.rows[0]?.used || 0);
  const reserved = Number(reservationResult.rows[0]?.reserved || 0);
  const baseCapacity = Math.max(0, Number(input.limit) - used);
  const creditLotsResult = input.resourceKey === "serviceBookings"
    ? { rows: [] }
    : await client.query(
      `SELECT l.id, l.granted_units, l.revoked_units, l.frozen_units, l.source_type, l.expires_at,
              (SELECT COALESCE(SUM(CASE WHEN ao.signed_units < 0 THEN -aa.units ELSE aa.units END), 0)::INTEGER
               FROM allowance_allocations aa JOIN allowance_operations ao ON ao.id=aa.operation_id WHERE aa.credit_lot_id = l.id) AS consumed_units
       FROM usage_credit_lots l
       WHERE l.tenant_id = $1 AND l.resource_key = $2 AND l.status = 'active'
         AND (l.expires_at IS NULL OR l.expires_at > NOW())
       ORDER BY
         CASE WHEN l.source_type = 'promotional' AND l.expires_at IS NOT NULL THEN 0
              WHEN l.source_type = 'promotional' THEN 1 ELSE 2 END,
         l.expires_at NULLS LAST, l.created_at, l.id
       FOR UPDATE`,
      [Number(input.tenantId), input.resourceKey]
    );
  const creditLots = creditLotsResult.rows.map((lot) => ({
    ...lot,
    available: Math.max(0, Number(lot.granted_units) - Number(lot.revoked_units) - Number(lot.frozen_units) - Number(lot.consumed_units))
  }));
  const creditCapacity = creditLots.reduce((sum, lot) => sum + lot.available, 0);
  const baseAvailable = Math.max(0, baseCapacity - reserved);
  const reservedAfterBase = Math.max(0, reserved - baseCapacity);
  const creditAvailable = Math.max(0, creditCapacity - reservedAfterBase);
  const available = baseAvailable + creditAvailable;
  if (available < Number(input.units)) {
    return { consumed: false, available, baseAvailable, creditAvailable, used, reserved };
  }

  const operationResult = await client.query(
    `INSERT INTO allowance_operations (
       usage_account_id, allowance_period_id, operation_key, operation_type,
       signed_units, subject_type, subject_id, actor_user_id, reason, metadata
     ) VALUES ($1,$2,$3,'consume',$4,$5,$6,$7,$8,$9::jsonb)
     RETURNING id`,
    [
      accountId, periodId, input.operationKey, Number(input.units), input.subjectType,
      String(input.subjectId), input.actorUserId ? Number(input.actorUserId) : null,
      input.reason || null, JSON.stringify(input.metadata || {})
    ]
  );
  let unitsRemaining = Number(input.units);
  const baseUnits = Math.min(baseAvailable, unitsRemaining);
  if (baseUnits > 0) {
    await client.query(
      `INSERT INTO allowance_allocations (operation_id, source_type, allowance_period_id, units)
       VALUES ($1, 'base', $2, $3)`,
      [operationResult.rows[0].id, periodId, baseUnits]
    );
    unitsRemaining -= baseUnits;
  }
  const creditAllocations = [];
  for (const lot of creditLots) {
    if (unitsRemaining <= 0) break;
    const lotUnits = Math.min(lot.available, unitsRemaining);
    if (lotUnits <= 0) continue;
    await client.query(
      `INSERT INTO allowance_allocations (operation_id, source_type, credit_lot_id, units)
       VALUES ($1, 'credit', $2, $3)`,
      [operationResult.rows[0].id, lot.id, lotUnits]
    );
    creditAllocations.push({ lotId: String(lot.id), units: lotUnits });
    unitsRemaining -= lotUnits;
  }
  if (Number(input.limit) > 0 && baseUnits > 0) {
    await client.query(
      `INSERT INTO allowance_warning_claims (usage_account_id, allowance_period_id, threshold_percent)
       SELECT $1, $2, threshold FROM unnest(ARRAY[80,90,100]) threshold
       WHERE (($3::NUMERIC + $4::NUMERIC) / $5::NUMERIC) * 100 >= threshold
       ON CONFLICT (usage_account_id, allowance_period_id, threshold_percent) DO NOTHING`,
      [accountId, periodId, used, baseUnits, Number(input.limit)]
    );
  }
  return {
    consumed: true,
    idempotent: false,
    operationId: String(operationResult.rows[0].id),
    used: used + baseUnits,
    remaining: available - Number(input.units),
    allocations: { baseUnits, creditLots: creditAllocations }
  };
}

async function getCapacity(tenantId, options = {}) {
  const client = options.client || db.pool;
  const result = await client.query(
    `SELECT ua.resource_key,
            COALESCE(SUM(CASE WHEN aa.source_type = 'base'
              AND sap.period_start <= NOW() AND sap.period_end > NOW()
              THEN CASE WHEN ao.signed_units < 0 THEN -aa.units ELSE aa.units END ELSE 0 END), 0)::INTEGER AS base_used,
            COALESCE(SUM(CASE WHEN aa.source_type = 'credit' THEN CASE WHEN ao.signed_units < 0 THEN -aa.units ELSE aa.units END ELSE 0 END), 0)::INTEGER AS credit_used
     FROM usage_accounts ua
     LEFT JOIN allowance_operations ao ON ao.usage_account_id = ua.id
     LEFT JOIN allowance_allocations aa ON aa.operation_id = ao.id
     LEFT JOIN subscription_allowance_periods sap ON sap.id = aa.allowance_period_id
     WHERE ua.tenant_id = $1
     GROUP BY ua.resource_key`,
    [Number(tenantId)]
  );
  const lots = await client.query(
    `SELECT resource_key,
            COALESCE(SUM(granted_units - revoked_units - frozen_units), 0)::INTEGER AS granted,
            MIN(expires_at) FILTER (WHERE expires_at > NOW()) AS next_expiry
     FROM usage_credit_lots
     WHERE tenant_id = $1 AND status = 'active' AND (expires_at IS NULL OR expires_at > NOW())
     GROUP BY resource_key`,
    [Number(tenantId)]
  );
  const warnings = await client.query(
    `SELECT ua.resource_key, awc.threshold_percent, awc.claimed_at, awc.delivered_at
     FROM allowance_warning_claims awc
     JOIN usage_accounts ua ON ua.id=awc.usage_account_id
     JOIN subscription_allowance_periods sap ON sap.id=awc.allowance_period_id
     WHERE ua.tenant_id=$1 AND sap.period_start <= NOW() AND sap.period_end > NOW()
     ORDER BY ua.resource_key, awc.threshold_percent`,
    [Number(tenantId)]
  );
  return { usage: result.rows, credits: lots.rows, warnings: warnings.rows };
}

async function reserve(input, options = {}) {
  return runMutation(options, (client) => reserveWithClient(input, client));
}

async function reserveWithClient(input, queryClient) {
  const accountResult = await queryClient.query(
    `INSERT INTO usage_accounts (tenant_id, resource_key) VALUES ($1,$2)
     ON CONFLICT (tenant_id, resource_key) DO UPDATE SET resource_key = EXCLUDED.resource_key RETURNING id`,
    [input.tenantId, input.resourceKey]
  );
  const accountId = accountResult.rows[0].id;
  await queryClient.query(`SELECT id FROM usage_accounts WHERE id = $1 FOR UPDATE`, [accountId]);
  const periodResult = await queryClient.query(
    `INSERT INTO subscription_allowance_periods (subscription_id, period_start, period_end) VALUES ($1,$2,$3)
     ON CONFLICT (subscription_id, period_start) DO UPDATE SET period_end = EXCLUDED.period_end RETURNING id`,
    [input.subscriptionId, input.periodStart, input.periodEnd]
  );
  const periodId = periodResult.rows[0].id;
  const existing = await queryClient.query(`SELECT * FROM allowance_reservations WHERE usage_account_id = $1 AND reservation_key = $2`, [accountId, input.reservationKey]);
  if (existing.rows[0]) {
    const current = existing.rows[0];
    if (current.status === "active" && new Date(current.expires_at) > new Date()) return { reserved: true, idempotent: true, reservationId: String(current.id) };
    if (current.status === "committed") return { reserved: true, idempotent: true, reservationId: String(current.id) };
    if (current.status === "active") await queryClient.query(`UPDATE allowance_reservations SET status = 'expired', updated_at = NOW() WHERE id = $1`, [current.id]);
    await queryClient.query(`DELETE FROM allowance_reservation_allocations WHERE reservation_id=$1`,[current.id]);
  }
  const availability = await queryClient.query(
    `SELECT
       GREATEST(0, $3::INTEGER - COALESCE((SELECT SUM(CASE WHEN o.signed_units < 0 THEN -a.units ELSE a.units END) FROM allowance_allocations a JOIN allowance_operations o ON o.id = a.operation_id WHERE o.usage_account_id = $1 AND a.allowance_period_id = $2 AND a.source_type = 'base'),0))::INTEGER AS base_available,
       COALESCE((SELECT SUM(r.units) FROM allowance_reservations r WHERE r.usage_account_id = $1 AND r.allowance_period_id = $2 AND r.status = 'active' AND r.expires_at > NOW()),0)::INTEGER AS reserved,
       COALESCE((SELECT SUM(l.granted_units-l.revoked_units-l.frozen_units-COALESCE((SELECT SUM(CASE WHEN o.signed_units < 0 THEN -a.units ELSE a.units END) FROM allowance_allocations a JOIN allowance_operations o ON o.id=a.operation_id WHERE a.credit_lot_id=l.id),0)) FROM usage_credit_lots l WHERE l.tenant_id=$4 AND l.resource_key=$5 AND l.status='active' AND (l.expires_at IS NULL OR l.expires_at>NOW())),0)::INTEGER AS credit_available`,
    [accountId, periodId, input.limit, input.tenantId, input.resourceKey]
  );
  const available = Math.max(0, Number(availability.rows[0].base_available) + (input.resourceKey === "serviceBookings" ? 0 : Number(availability.rows[0].credit_available)) - Number(availability.rows[0].reserved));
  if (available < input.units) return { reserved: false, available };
  const result = await queryClient.query(
    `INSERT INTO allowance_reservations (usage_account_id, allowance_period_id, reservation_key, subject_type, subject_id, units, status, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,'active',$7)
     ON CONFLICT (usage_account_id, reservation_key) DO UPDATE SET allowance_period_id = EXCLUDED.allowance_period_id,
       subject_type = EXCLUDED.subject_type, subject_id = EXCLUDED.subject_id, units = EXCLUDED.units,
       status = 'active', expires_at = EXCLUDED.expires_at, updated_at = NOW()
     RETURNING id`,
    [accountId, periodId, input.reservationKey, input.subjectType, String(input.subjectId), input.units, input.expiresAt]
  );
  let remaining = Number(input.units);
  const baseUnits = Math.min(remaining, Math.max(0, Number(availability.rows[0].base_available) - Number(availability.rows[0].reserved)));
  if (baseUnits > 0) {
    await queryClient.query(`INSERT INTO allowance_reservation_allocations (reservation_id,source_type,allowance_period_id,units) VALUES ($1,'base',$2,$3)`, [result.rows[0].id, periodId, baseUnits]);
    remaining -= baseUnits;
  }
  if (remaining > 0) {
    const lots = await queryClient.query(
      `SELECT l.id,GREATEST(0,l.granted_units-l.revoked_units-l.frozen_units
        -COALESCE((SELECT SUM(CASE WHEN o.signed_units<0 THEN -a.units ELSE a.units END) FROM allowance_allocations a JOIN allowance_operations o ON o.id=a.operation_id WHERE a.credit_lot_id=l.id),0)
        -COALESCE((SELECT SUM(ra.units) FROM allowance_reservation_allocations ra JOIN allowance_reservations r ON r.id=ra.reservation_id WHERE ra.credit_lot_id=l.id AND r.status='active' AND r.expires_at>NOW()),0))::INTEGER AS available
       FROM usage_credit_lots l WHERE l.tenant_id=$1 AND l.resource_key=$2 AND l.status='active' AND (l.expires_at IS NULL OR l.expires_at>NOW())
       ORDER BY CASE WHEN l.source_type='promotional' AND l.expires_at IS NOT NULL THEN 0 WHEN l.source_type='promotional' THEN 1 ELSE 2 END,l.expires_at NULLS LAST,l.created_at FOR UPDATE`,
      [input.tenantId,input.resourceKey]
    );
    for (const lot of lots.rows) {
      if (remaining<=0) break; const units=Math.min(remaining,Number(lot.available)); if(units<=0) continue;
      await queryClient.query(`INSERT INTO allowance_reservation_allocations (reservation_id,source_type,credit_lot_id,units) VALUES ($1,'credit',$2,$3)`,[result.rows[0].id,lot.id,units]); remaining-=units;
    }
  }
  if (remaining > 0) throw Object.assign(new Error("Reserved capacity source could not be allocated."),{statusCode:409,code:"ALLOWANCE_RESERVATION_CONFLICT"});
  return { reserved: true, idempotent: false, reservationId: String(result.rows[0].id) };
}

async function commitReservation(input, options = {}) {
  return runMutation(options, (client) => commitReservationWithClient(input, client));
}

async function commitReservationWithClient(input, queryClient) {
  const reservationResult=await queryClient.query(`SELECT r.* FROM allowance_reservations r JOIN usage_accounts a ON a.id=r.usage_account_id WHERE a.tenant_id=$1 AND a.resource_key=$2 AND r.reservation_key=$3 FOR UPDATE`,[input.tenantId,input.resourceKey,input.reservationKey]);
  const reservation=reservationResult.rows[0]; if(!reservation) return null;
  if(reservation.status==='committed') return {committed:true,idempotent:true,operationId:String(reservation.committed_operation_id)};
  if(!['active','expired'].includes(reservation.status)) throw Object.assign(new Error("Allowance reservation is no longer available."),{statusCode:409});
  const existing=await queryClient.query(`SELECT id FROM allowance_operations WHERE usage_account_id=$1 AND operation_key=$2`,[reservation.usage_account_id,input.operationKey]);
  if(existing.rows[0]) return {committed:true,idempotent:true,operationId:String(existing.rows[0].id)};
  const operation=await queryClient.query(`INSERT INTO allowance_operations (usage_account_id,allowance_period_id,operation_key,operation_type,signed_units,subject_type,subject_id,actor_user_id,reason,metadata) VALUES ($1,$2,$3,'consume',$4,$5,$6,$7,$8,$9::jsonb) RETURNING id`,[reservation.usage_account_id,reservation.allowance_period_id,input.operationKey,reservation.units,input.subjectType,String(input.subjectId),input.actorUserId || null,input.reason,JSON.stringify(input.metadata || {})]);
  await queryClient.query(`INSERT INTO allowance_allocations (operation_id,source_type,allowance_period_id,credit_lot_id,units) SELECT $1,source_type,allowance_period_id,credit_lot_id,units FROM allowance_reservation_allocations WHERE reservation_id=$2`,[operation.rows[0].id,reservation.id]);
  await queryClient.query(`UPDATE allowance_reservations SET status='committed',committed_operation_id=$2,updated_at=NOW() WHERE id=$1`,[reservation.id,operation.rows[0].id]);
  return {committed:true,idempotent:false,operationId:String(operation.rows[0].id)};
}

async function releaseReservation(tenantId, resourceKey, reservationKey, options = {}) {
  const result = await (options.client || db.pool).query(
    `UPDATE allowance_reservations r SET status = 'released', updated_at = NOW()
     FROM usage_accounts a WHERE r.usage_account_id = a.id AND a.tenant_id = $1 AND a.resource_key = $2
       AND r.reservation_key = $3 AND r.status = 'active' RETURNING r.id`,
    [tenantId, resourceKey, reservationKey]
  );
  return Boolean(result.rows[0]);
}

async function reverseOperation(input, options = {}) {
  return runMutation(options, (client) => reverseOperationWithClient(input, client));
}

async function reverseOperationWithClient(input, queryClient) {
  const originalResult = await queryClient.query(
    `SELECT ao.* FROM allowance_operations ao JOIN usage_accounts ua ON ua.id=ao.usage_account_id
     WHERE ao.id=$1 AND ua.tenant_id=$2 FOR UPDATE`, [input.operationId, input.tenantId]
  );
  const original = originalResult.rows[0];
  if (!original) return null;
  const existing = await queryClient.query(`SELECT * FROM allowance_operations WHERE reverses_operation_id=$1 LIMIT 1`, [original.id]);
  if (existing.rows[0]) return { operation: existing.rows[0], idempotent: true };
  if (!['consume','baseline','adjustment'].includes(original.operation_type)) throw Object.assign(new Error("This allowance operation cannot be reversed."), { statusCode: 409 });
  const reversal = await queryClient.query(
    `INSERT INTO allowance_operations (usage_account_id,allowance_period_id,operation_key,operation_type,signed_units,subject_type,subject_id,actor_user_id,reason,metadata,reverses_operation_id)
     VALUES ($1,$2,$3,'reversal',$4,$5,$6,$7,$8,$9::jsonb,$10) RETURNING *`,
    [original.usage_account_id, original.allowance_period_id, input.operationKey, -Math.abs(Number(original.signed_units)), original.subject_type, original.subject_id, input.actorUserId || null, input.reason, JSON.stringify(input.metadata || {}), original.id]
  );
  await queryClient.query(`INSERT INTO allowance_allocations (operation_id,source_type,allowance_period_id,credit_lot_id,units) SELECT $1,source_type,allowance_period_id,credit_lot_id,units FROM allowance_allocations WHERE operation_id=$2`, [reversal.rows[0].id, original.id]);
  return { operation: reversal.rows[0], idempotent: false };
}

async function recordReconciliation(input, options = {}) {
  const result = await (options.client || db.pool).query(
    `INSERT INTO allowance_reconciliation_records (tenant_id,resource_key,expected_units,ledger_units,status,details)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb) RETURNING *`,
    [input.tenantId, input.resourceKey, input.expectedUnits, input.ledgerUnits, input.expectedUnits === input.ledgerUnits ? "matched" : "anomaly", JSON.stringify(input.details || {})]
  );
  return result.rows[0];
}

async function claimWarningDeliveries(limit = 20, options = {}) {
  const queryClient = options.client || db.pool;
  const result = await queryClient.query(
    `WITH candidates AS (
       SELECT id FROM allowance_warning_claims
       WHERE (delivery_status IN ('pending','failed')
          OR (delivery_status='processing' AND last_delivery_attempt_at < NOW() - INTERVAL '5 minutes'))
         AND delivery_attempts < 5
       ORDER BY claimed_at, id
       FOR UPDATE SKIP LOCKED LIMIT $1
     ), claimed AS (
       UPDATE allowance_warning_claims warning
       SET delivery_status='processing', delivery_attempts=delivery_attempts+1,
           last_delivery_attempt_at=NOW()
       FROM candidates WHERE warning.id=candidates.id
       RETURNING warning.*
     )
     SELECT claimed.*, account.tenant_id, account.resource_key,
            tenant.name AS tenant_name, period.period_end,
            COALESCE(array_agg(DISTINCT users.email) FILTER (WHERE users.email IS NOT NULL), '{}') AS recipients
     FROM claimed
     JOIN usage_accounts account ON account.id=claimed.usage_account_id
     JOIN tenants tenant ON tenant.id=account.tenant_id
     JOIN subscription_allowance_periods period ON period.id=claimed.allowance_period_id
     LEFT JOIN tenant_memberships membership ON membership.tenant_id=account.tenant_id
       AND membership.is_active=TRUE AND membership.role IN ('owner','admin')
     LEFT JOIN users ON users.id=membership.user_id
     GROUP BY claimed.id, claimed.usage_account_id, claimed.allowance_period_id,
              claimed.threshold_percent, claimed.claimed_at, claimed.delivery_status,
              claimed.delivery_attempts, claimed.delivered_at, claimed.last_delivery_error,
              claimed.last_delivery_attempt_at,
              account.tenant_id, account.resource_key, tenant.name, period.period_end`,
    [Math.min(Math.max(Number(limit) || 20, 1), 100)]
  );
  return result.rows;
}

async function completeWarningDelivery(id, error, options = {}) {
  await (options.client || db.pool).query(
    `UPDATE allowance_warning_claims
     SET delivery_status=$2, delivered_at=CASE WHEN $2='delivered' THEN NOW() ELSE delivered_at END,
         last_delivery_error=$3
     WHERE id=$1`,
    [id, error ? "failed" : "delivered", error ? String(error).slice(0, 1000) : null]
  );
}

module.exports = { claimWarningDeliveries, commitReservation, completeWarningDelivery, consumeBase, getCapacity, recordReconciliation, releaseReservation, reserve, reverseOperation };
