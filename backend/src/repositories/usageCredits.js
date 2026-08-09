const db = require("../config/db");

function client(options = {}) { return options.client || db.pool; }

async function listPacks(options = {}) {
  const result = await client(options).query(
    `SELECT p.id, p.code, p.name, p.state, p.current_revision,
            r.id AS revision_id, r.ticket_units, r.journey_units, r.price_cents, r.currency,
            p.created_at, p.updated_at
     FROM usage_credit_packs p
     JOIN usage_credit_pack_revisions r ON r.pack_id = p.id AND r.revision = p.current_revision
     ORDER BY r.ticket_units, p.code`
  );
  return result.rows;
}

async function findPack(code, options = {}) {
  const result = await client(options).query(
    `SELECT p.id, p.code, p.name, p.state, p.current_revision,
            r.id AS revision_id, r.ticket_units, r.journey_units, r.price_cents, r.currency
     FROM usage_credit_packs p
     JOIN usage_credit_pack_revisions r ON r.pack_id = p.id AND r.revision = p.current_revision
     WHERE p.code = $1 LIMIT 1`, [String(code || "").toUpperCase()]
  );
  return result.rows[0] || null;
}

async function publishRevision(code, input, actorId, options = {}) {
  const queryClient = client(options);
  const locked = await queryClient.query(`SELECT * FROM usage_credit_packs WHERE code = $1 FOR UPDATE`, [code]);
  const pack = locked.rows[0];
  if (!pack) return null;
  if (pack.state === "archived") throw Object.assign(new Error("Archived packs cannot be edited."), { statusCode: 409 });
  const revision = Number(pack.current_revision) + 1;
  await queryClient.query(
    `INSERT INTO usage_credit_pack_revisions
       (pack_id, revision, ticket_units, journey_units, price_cents, currency, created_by_user_id, reason)
     VALUES ($1,$2,$3,$4,$5,'PHP',$6,$7)`,
    [pack.id, revision, input.ticketUnits, input.journeyUnits, input.priceCents, actorId || null, input.reason]
  );
  await queryClient.query(
    `UPDATE usage_credit_packs SET name = $2, state = $3, current_revision = $4, updated_at = NOW() WHERE id = $1`,
    [pack.id, input.name, input.state, revision]
  );
  return findPack(code, options);
}

async function setPackState(code, state, options = {}) {
  const result = await client(options).query(
    `UPDATE usage_credit_packs SET state = $2, updated_at = NOW()
     WHERE code = $1 AND state <> 'archived' RETURNING code`, [code, state]
  );
  return result.rows[0] || null;
}

async function grantLot(input, options = {}) {
  const result = await client(options).query(
    `INSERT INTO usage_credit_lots
       (tenant_id, resource_key, source_type, source_reference, granted_units, expires_at, created_by_user_id, reason)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (tenant_id, resource_key, source_type, source_reference) DO UPDATE
       SET source_reference = EXCLUDED.source_reference
     RETURNING *`,
    [input.tenantId, input.resourceKey, input.sourceType, input.sourceReference, input.units,
      input.expiresAt || null, input.actorId || null, input.reason]
  );
  return result.rows[0];
}

async function listLots(tenantId, options = {}) {
  const result = await client(options).query(
    `SELECT l.*,
            COALESCE((SELECT SUM(CASE WHEN o.signed_units < 0 THEN -a.units ELSE a.units END) FROM allowance_allocations a JOIN allowance_operations o ON o.id=a.operation_id WHERE a.credit_lot_id = l.id), 0)::INTEGER AS consumed_units
     FROM usage_credit_lots l WHERE l.tenant_id = $1 ORDER BY l.created_at DESC`, [tenantId]
  );
  return result.rows;
}

async function revokeLot(lotId, units, options = {}) {
  const queryClient = client(options);
  const result = await queryClient.query(
    `SELECT l.*,
            COALESCE((SELECT SUM(CASE WHEN o.signed_units < 0 THEN -a.units ELSE a.units END) FROM allowance_allocations a JOIN allowance_operations o ON o.id=a.operation_id WHERE a.credit_lot_id = l.id), 0)::INTEGER AS consumed_units
     FROM usage_credit_lots l WHERE l.id = $1 FOR UPDATE`, [lotId]
  );
  const lot = result.rows[0];
  if (!lot) return null;
  const reservation = await queryClient.query(
    `SELECT 1 FROM allowance_reservations r JOIN usage_accounts a ON a.id = r.usage_account_id
     WHERE a.tenant_id = $1 AND a.resource_key = $2 AND r.status = 'active' AND r.expires_at > NOW() LIMIT 1`,
    [lot.tenant_id, lot.resource_key]
  );
  if (reservation.rows[0]) throw Object.assign(new Error("Credits cannot be removed while a customer checkout is reserving this capacity. Try again after the checkout is completed or expires."), { statusCode: 409 });
  const available = Number(lot.granted_units) - Number(lot.revoked_units) - Number(lot.frozen_units) - Number(lot.consumed_units);
  if (units > available) throw Object.assign(new Error("Only unused and unfrozen credits can be removed."), { statusCode: 409 });
  const updated = await queryClient.query(
    `UPDATE usage_credit_lots SET revoked_units = revoked_units + $2,
       status = CASE WHEN revoked_units + $2 + frozen_units >= granted_units THEN 'revoked' ELSE status END,
       updated_at = NOW() WHERE id = $1 RETURNING *`, [lotId, units]
  );
  return updated.rows[0];
}

async function createPurchase(input, options = {}) {
  const result = await client(options).query(
    `INSERT INTO usage_credit_purchases
       (tenant_id, pack_id, pack_revision_id, purchase_key, status, ticket_units, journey_units,
        amount_cents, currency, provider, purchased_by_user_id)
     VALUES ($1,$2,$3,$4,'pending',$5,$6,$7,$8,$9,$10)
     ON CONFLICT (tenant_id, purchase_key) DO UPDATE SET purchase_key = EXCLUDED.purchase_key
     RETURNING *`,
    [input.tenantId, input.packId, input.packRevisionId, input.purchaseKey, input.ticketUnits,
      input.journeyUnits, input.amountCents, input.currency, input.provider, input.actorId]
  );
  return result.rows[0];
}

async function attachProviderCheckout(purchaseId, providerCheckoutId, checkoutUrl, options = {}) {
  const result = await client(options).query(
    `UPDATE usage_credit_purchases SET provider_checkout_id = $2, checkout_url = $3, updated_at = NOW()
     WHERE id = $1 RETURNING *`, [purchaseId, providerCheckoutId, checkoutUrl]
  );
  return result.rows[0] || null;
}

async function findPurchaseByCheckout(providerCheckoutId, options = {}) {
  const result = await client(options).query(
    `SELECT * FROM usage_credit_purchases WHERE provider = 'paymongo' AND provider_checkout_id = $1 LIMIT 1`,
    [providerCheckoutId]
  );
  return result.rows[0] || null;
}

async function findPurchase(id, tenantId, options = {}) {
  const params = [id];
  let scope = "";
  if (tenantId) { params.push(tenantId); scope = " AND tenant_id = $2"; }
  const result = await client(options).query(`SELECT * FROM usage_credit_purchases WHERE id = $1${scope} LIMIT 1`, params);
  return result.rows[0] || null;
}

async function listPurchases(tenantId, options = {}) {
  const result = await client(options).query(
    `SELECT p.*, c.code AS pack_code, c.name AS pack_name
     FROM usage_credit_purchases p JOIN usage_credit_packs c ON c.id = p.pack_id
     WHERE ($1::BIGINT IS NULL OR p.tenant_id = $1) ORDER BY p.created_at DESC LIMIT 200`,
    [tenantId || null]
  );
  return result.rows;
}

async function listCases(options = {}) {
  const [refunds, disputes] = await Promise.all([
    client(options).query(`SELECT r.*, p.tenant_id, p.amount_cents, p.currency FROM usage_credit_refunds r JOIN usage_credit_purchases p ON p.id = r.purchase_id ORDER BY r.created_at DESC LIMIT 200`),
    client(options).query(`SELECT d.*, p.tenant_id, p.amount_cents, p.currency FROM usage_credit_disputes d JOIN usage_credit_purchases p ON p.id = d.purchase_id ORDER BY d.opened_at DESC LIMIT 200`)
  ]);
  return { refunds: refunds.rows, disputes: disputes.rows };
}

async function fulfillPurchase(purchaseId, providerPaymentId, options = {}) {
  const queryClient = client(options);
  const locked = await queryClient.query(`SELECT * FROM usage_credit_purchases WHERE id = $1 FOR UPDATE`, [purchaseId]);
  const purchase = locked.rows[0];
  if (!purchase) return null;
  if (purchase.status === "fulfilled") return purchase;
  if (!["pending", "paid"].includes(purchase.status)) throw Object.assign(new Error("Purchase cannot be fulfilled in its current state."), { statusCode: 409 });
  const subscriptions = await queryClient.query(
    `SELECT status FROM tenant_subscriptions
     WHERE tenant_id = $1 AND status IN ('active','past_due','unpaid','suspended')
     ORDER BY updated_at DESC FOR UPDATE`,
    [purchase.tenant_id]
  );
  if (subscriptions.rows.length !== 1 || subscriptions.rows[0].status !== "active") {
    throw Object.assign(new Error("Usage Credit fulfillment requires an active subscription."), { statusCode: 409, code: "CREDIT_FULFILLMENT_SUBSCRIPTION_RESTRICTED" });
  }
  if (Number(purchase.ticket_units) > 0) await grantLot({ tenantId: purchase.tenant_id, resourceKey: "queueTickets", sourceType: "purchased", sourceReference: `purchase:${purchase.id}:tickets`, units: purchase.ticket_units, reason: "Paid Usage Credit purchase" }, options);
  if (Number(purchase.journey_units) > 0) await grantLot({ tenantId: purchase.tenant_id, resourceKey: "queueEmailJourneys", sourceType: "purchased", sourceReference: `purchase:${purchase.id}:journeys`, units: purchase.journey_units, reason: "Paid Usage Credit purchase" }, options);
  const updated = await queryClient.query(
    `UPDATE usage_credit_purchases SET status = 'fulfilled', provider_payment_id = COALESCE($2, provider_payment_id),
       paid_at = COALESCE(paid_at, NOW()), fulfilled_at = COALESCE(fulfilled_at, NOW()), updated_at = NOW()
     WHERE id = $1 RETURNING *`, [purchaseId, providerPaymentId || null]
  );
  return updated.rows[0];
}

async function requestRefund(purchaseId, actorId, reason, options = {}) {
  const queryClient = client(options);
  const purchaseResult = await queryClient.query(`SELECT * FROM usage_credit_purchases WHERE id = $1 FOR UPDATE`, [purchaseId]);
  const purchase = purchaseResult.rows[0];
  if (!purchase || purchase.status !== "fulfilled") return null;
  const lotsResult = await queryClient.query(
    `SELECT l.*, COALESCE((SELECT SUM(CASE WHEN o.signed_units < 0 THEN -a.units ELSE a.units END) FROM allowance_allocations a JOIN allowance_operations o ON o.id=a.operation_id WHERE a.credit_lot_id = l.id), 0)::INTEGER AS consumed_units
     FROM usage_credit_lots l WHERE l.source_type = 'purchased' AND l.source_reference LIKE $1 FOR UPDATE`,
    [`purchase:${purchase.id}:%`]
  );
  const purchaseLots = lotsResult.rows;
  const reserved = await queryClient.query(
    `SELECT 1 FROM allowance_reservations r JOIN usage_accounts a ON a.id = r.usage_account_id
     WHERE a.tenant_id = $1 AND a.resource_key = ANY($2::text[]) AND r.status = 'active' AND r.expires_at > NOW() LIMIT 1`,
    [purchase.tenant_id, [...new Set(purchaseLots.map((lot) => lot.resource_key))]]
  );
  if (reserved.rows[0]) throw Object.assign(new Error("A customer checkout is currently reserving these credits. Please try the refund again after it completes or expires."), { statusCode: 409 });
  if (!purchaseLots.length || purchaseLots.some((lot) => Number(lot.consumed_units) > 0 || Number(lot.revoked_units) > 0)) {
    throw Object.assign(new Error("Refunds are available only while all credits remain unused."), { statusCode: 409 });
  }
  const age = Date.now() - new Date(purchase.fulfilled_at || purchase.created_at).getTime();
  if (age > 7 * 24 * 60 * 60 * 1000) throw Object.assign(new Error("The seven-day refund window has ended."), { statusCode: 409 });
  for (const lot of purchaseLots) {
    await queryClient.query(`UPDATE usage_credit_lots SET status = 'frozen', frozen_units = granted_units, updated_at = NOW() WHERE id = $1`, [lot.id]);
  }
  await queryClient.query(
    `INSERT INTO usage_credit_refunds (purchase_id, status, reason, requested_by_user_id)
     VALUES ($1,'requested',$2,$3) ON CONFLICT (purchase_id) DO NOTHING`, [purchaseId, reason, actorId]
  );
  const updated = await queryClient.query(`UPDATE usage_credit_purchases SET status = 'refund_pending', updated_at = NOW() WHERE id = $1 RETURNING *`, [purchaseId]);
  return updated.rows[0];
}

async function resolveRefund(purchaseId, outcome, providerRefundId, options = {}) {
  const queryClient = client(options);
  const refundResult = await queryClient.query(`SELECT * FROM usage_credit_refunds WHERE purchase_id = $1 FOR UPDATE`, [purchaseId]);
  const refund = refundResult.rows[0];
  if (!refund) return null;
  if (["confirmed", "failed"].includes(refund.status)) return refund;
  const confirmed = outcome === "confirmed";
  await queryClient.query(
    confirmed
      ? `UPDATE usage_credit_lots SET revoked_units = granted_units, frozen_units = 0, status = 'revoked', updated_at = NOW() WHERE source_type = 'purchased' AND source_reference LIKE $1`
      : `UPDATE usage_credit_lots SET frozen_units = 0, status = CASE WHEN expires_at IS NOT NULL AND expires_at <= NOW() THEN 'expired' ELSE 'active' END, updated_at = NOW() WHERE source_type = 'purchased' AND source_reference LIKE $1`,
    [`purchase:${purchaseId}:%`]
  );
  await queryClient.query(`UPDATE usage_credit_purchases SET status = $2, updated_at = NOW() WHERE id = $1`, [purchaseId, confirmed ? "refunded" : "fulfilled"]);
  const result = await queryClient.query(`UPDATE usage_credit_refunds SET status = $2, provider_refund_id = COALESCE($3, provider_refund_id), updated_at = NOW() WHERE id = $1 RETURNING *`, [refund.id, confirmed ? "confirmed" : "failed", providerRefundId || null]);
  return result.rows[0];
}

async function openDispute(purchaseId, providerDisputeId, details, options = {}) {
  const queryClient = client(options);
  const purchaseResult = await queryClient.query(`SELECT * FROM usage_credit_purchases WHERE id = $1 FOR UPDATE`, [purchaseId]);
  const purchase = purchaseResult.rows[0];
  if (!purchase) return null;
  const lotsResult = await queryClient.query(
    `SELECT l.*, COALESCE((SELECT SUM(CASE WHEN o.signed_units < 0 THEN -a.units ELSE a.units END) FROM allowance_allocations a JOIN allowance_operations o ON o.id=a.operation_id WHERE a.credit_lot_id = l.id), 0)::INTEGER AS consumed_units
     FROM usage_credit_lots l WHERE l.source_type = 'purchased' AND l.source_reference LIKE $1 FOR UPDATE`,
    [`purchase:${purchaseId}:%`]
  );
  const purchaseLots = lotsResult.rows;
  const reservations = await queryClient.query(
    `SELECT a.resource_key, COALESCE(SUM(r.units),0)::INTEGER AS units
     FROM allowance_reservations r JOIN usage_accounts a ON a.id = r.usage_account_id
     WHERE a.tenant_id = $1 AND r.status = 'active' AND r.expires_at > NOW()
     GROUP BY a.resource_key`, [purchase.tenant_id]
  );
  const protectedByResource = Object.fromEntries(reservations.rows.map((row) => [row.resource_key, Number(row.units)]));
  let exposure = 0;
  for (const lot of purchaseLots) {
    const consumed = Number(lot.consumed_units || 0);
    exposure += consumed;
    const unused = Math.max(0, Number(lot.granted_units) - Number(lot.revoked_units) - consumed);
    const protectedUnits = Math.min(unused, protectedByResource[lot.resource_key] || 0);
    protectedByResource[lot.resource_key] = Math.max(0, (protectedByResource[lot.resource_key] || 0) - protectedUnits);
    const frozenUnits = unused - protectedUnits;
    await queryClient.query(`UPDATE usage_credit_lots SET frozen_units = $2, status = CASE WHEN $2 > 0 THEN 'frozen' ELSE 'active' END, updated_at = NOW() WHERE id = $1`, [lot.id, frozenUnits]);
  }
  await queryClient.query(`UPDATE usage_credit_purchases SET status = 'disputed', updated_at = NOW() WHERE id = $1`, [purchaseId]);
  const result = await queryClient.query(
    `INSERT INTO usage_credit_disputes (purchase_id, provider_dispute_id, status, consumed_exposure_units, details)
     VALUES ($1,$2,'open',$3,$4::jsonb)
     ON CONFLICT (provider_dispute_id) DO UPDATE SET details = usage_credit_disputes.details || EXCLUDED.details
     RETURNING *`, [purchaseId, providerDisputeId, exposure, JSON.stringify(details || {})]
  );
  return result.rows[0];
}

async function resolveDispute(providerDisputeId, outcome, options = {}) {
  const queryClient = client(options);
  const disputeResult = await queryClient.query(`SELECT * FROM usage_credit_disputes WHERE provider_dispute_id = $1 FOR UPDATE`, [providerDisputeId]);
  const dispute = disputeResult.rows[0];
  if (!dispute) return null;
  if (dispute.status === "closed" || (dispute.status === "won" && outcome === "won") || (dispute.status === "lost" && outcome !== "lost")) return dispute;
  const won = outcome === "won";
  if (won) {
    await queryClient.query(`UPDATE usage_credit_lots SET frozen_units = 0, status = CASE WHEN expires_at IS NOT NULL AND expires_at <= NOW() THEN 'expired' ELSE 'active' END, updated_at = NOW() WHERE source_type = 'purchased' AND source_reference LIKE $1`, [`purchase:${dispute.purchase_id}:%`]);
  } else {
    const purchase = await queryClient.query(`SELECT tenant_id FROM usage_credit_purchases WHERE id=$1 FOR UPDATE`, [dispute.purchase_id]);
    const lots = await queryClient.query(`SELECT l.*,COALESCE((SELECT SUM(CASE WHEN o.signed_units < 0 THEN -a.units ELSE a.units END) FROM allowance_allocations a JOIN allowance_operations o ON o.id=a.operation_id WHERE a.credit_lot_id=l.id),0)::INTEGER AS consumed_units FROM usage_credit_lots l WHERE l.source_type='purchased' AND l.source_reference LIKE $1 FOR UPDATE`, [`purchase:${dispute.purchase_id}:%`]);
    const reservations = await queryClient.query(`SELECT a.resource_key,COALESCE(SUM(r.units),0)::INTEGER AS units FROM allowance_reservations r JOIN usage_accounts a ON a.id=r.usage_account_id WHERE a.tenant_id=$1 AND r.status='active' AND r.expires_at>NOW() GROUP BY a.resource_key`, [purchase.rows[0].tenant_id]);
    const protectedByResource = Object.fromEntries(reservations.rows.map((row) => [row.resource_key, Number(row.units)]));
    for (const lot of lots.rows) {
      const unused = Math.max(0, Number(lot.granted_units) - Number(lot.revoked_units) - Number(lot.consumed_units));
      const protectedUnits = Math.min(unused, protectedByResource[lot.resource_key] || 0);
      protectedByResource[lot.resource_key] = Math.max(0, (protectedByResource[lot.resource_key] || 0) - protectedUnits);
      const revokeUnits = unused - protectedUnits;
      await queryClient.query(`UPDATE usage_credit_lots SET revoked_units=revoked_units+$2,frozen_units=0,status=CASE WHEN revoked_units+$2>=granted_units THEN 'revoked' ELSE 'active' END,updated_at=NOW() WHERE id=$1`, [lot.id, revokeUnits]);
    }
  }
  await queryClient.query(`UPDATE usage_credit_purchases SET status = $2, updated_at = NOW() WHERE id = $1`, [dispute.purchase_id, won ? "fulfilled" : "failed"]);
  const result = await queryClient.query(`UPDATE usage_credit_disputes SET status = $2, resolved_at = COALESCE(resolved_at,NOW()) WHERE id = $1 RETURNING *`, [dispute.id, won ? "won" : "lost"]);
  return result.rows[0];
}

module.exports = {
  attachProviderCheckout, createPurchase, findPack, findPurchase, findPurchaseByCheckout,
  fulfillPurchase, grantLot, listCases, listLots, listPacks, listPurchases, publishRevision,
  openDispute, requestRefund, resolveDispute, resolveRefund, revokeLot, setPackState
};
