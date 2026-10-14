const db = require("../config/db");
const billingRepository = require("./billing");

function client(options = {}) { return options.client || db.pool; }
const scheduledContexts = new WeakMap();

async function scheduledLock(queryClient, sql, values, code) {
  try { return await queryClient.query(sql, values); }
  catch (error) {
    if (error.code === "55P03") throw Object.assign(new Error("Subscription lifecycle state is being updated. Retry after that change completes."), { statusCode: 409, code });
    throw error;
  }
}

async function prepareScheduledTransition(transitionId, options = {}) {
  const queryClient = options.client;
  if (!queryClient) throw new Error("Scheduled transition preparation requires a transaction client.");
  const located = (await queryClient.query("SELECT tenant_id FROM subscription_transitions WHERE id = $1", [String(transitionId)])).rows[0];
  if (!located) return null;
  const tenantId = String(located.tenant_id);
  if (!(await queryClient.query("SELECT id FROM tenants WHERE id = $1 FOR UPDATE", [tenantId])).rows.length) return null;
  const current = (await scheduledLock(queryClient, "SELECT * FROM subscription_transitions WHERE id = $1 FOR UPDATE NOWAIT", [String(transitionId)], "SUBSCRIPTION_TRANSITION_BUSY")).rows[0];
  if (!current) return null;
  assertScheduledTenant(current, tenantId);
  const context = Object.freeze({});
  scheduledContexts.set(context, { client: queryClient, transitionId: String(transitionId), tenantId });
  return context;
}

function assertScheduledTenant(transition, tenantId) {
  if (String(transition.tenant_id) !== tenantId) throw Object.assign(new Error("Transition moved while execution was being prepared."), { statusCode: 409, code: "SUBSCRIPTION_TRANSITION_SCOPE_CHANGED" });
}

async function lockCurrent(tenantId, options = {}) {
  const result = await client(options).query(
    `SELECT * FROM tenant_subscriptions WHERE tenant_id = $1
     ORDER BY updated_at DESC FOR UPDATE`, [tenantId]
  );
  return currentSubscription(result.rows);
}

function currentSubscription(rows) {
  const active = rows.filter((row) => ["active", "past_due", "unpaid", "suspended"].includes(row.status));
  if (active.length > 1) throw Object.assign(new Error("Multiple current subscription records require reconciliation."), { statusCode: 409, code: "SUBSCRIPTION_AMBIGUOUS" });
  return active[0] || null;
}

async function createTransition(input, options = {}) {
  const result = await client(options).query(
    `INSERT INTO subscription_transitions
       (tenant_id, from_subscription_id, from_plan_slug, to_plan_slug, transition_type, status,
        reason, effective_at, created_by_user_id, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) RETURNING *`,
    [input.tenantId, input.fromSubscriptionId || null, input.fromPlanSlug || null, input.toPlanSlug,
      input.transitionType, input.status, input.reason, input.effectiveAt, input.actorId || null,
      JSON.stringify(input.metadata || {})]
  );
  return result.rows[0];
}

async function listTransitions(tenantId, options = {}) {
  const result = await client(options).query(
    `SELECT * FROM subscription_transitions WHERE ($1::BIGINT IS NULL OR tenant_id = $1)
     ORDER BY created_at DESC LIMIT 200`, [tenantId || null]
  );
  return result.rows;
}

async function executeTransition(transitionId, options = {}) {
  const queryClient = client(options);
  let scheduledScope;
  if (Object.hasOwn(options, "scheduledContext")) {
    scheduledScope = scheduledContexts.get(options.scheduledContext);
    if (!scheduledScope || scheduledScope.client !== queryClient || scheduledScope.transitionId !== String(transitionId)) {
      throw Object.assign(new Error("Scheduled execution requires its prepared transaction context."), { statusCode: 409, code: "SCHEDULED_TRANSITION_CONTEXT_REQUIRED" });
    }
    scheduledContexts.delete(options.scheduledContext);
  }
  const transitionResult = scheduledScope
    ? await scheduledLock(queryClient, "SELECT * FROM subscription_transitions WHERE id = $1 FOR UPDATE NOWAIT", [String(transitionId)], "SUBSCRIPTION_TRANSITION_BUSY")
    : await queryClient.query(`SELECT * FROM subscription_transitions WHERE id = $1 FOR UPDATE`, [transitionId]);
  const transition = transitionResult.rows[0];
  if (!transition) return null;
  if (scheduledScope) assertScheduledTenant(transition, scheduledScope.tenantId);
  if (transition.status === "effective") return transition;
  if (!["scheduled", "pending_payment"].includes(transition.status) || new Date(transition.effective_at) > new Date()) {
    throw Object.assign(new Error("Subscription transition is not ready."), { statusCode: 409 });
  }
  if (scheduledScope) {
    const plan = await scheduledLock(queryClient, "SELECT slug FROM subscription_plans WHERE slug = $1 FOR SHARE NOWAIT", [transition.to_plan_slug], "SUBSCRIPTION_PLAN_BUSY");
    if (!plan.rows.length) throw Object.assign(new Error("Subscription plan not found."), { statusCode: 404 });
  }
  let current;
  if (scheduledScope) {
    const result = await scheduledLock(queryClient, "SELECT * FROM tenant_subscriptions WHERE tenant_id = $1 ORDER BY updated_at DESC FOR UPDATE NOWAIT", [scheduledScope.tenantId], "SUBSCRIPTION_BUSY");
    current = currentSubscription(result.rows);
  } else current = await lockCurrent(transition.tenant_id, options);
  if (current && String(current.id) !== String(transition.from_subscription_id)) throw Object.assign(new Error("Subscription changed after this transition was scheduled."), { statusCode: 409, code: "SUBSCRIPTION_REVISION_CONFLICT" });
  if (current && ["past_due", "unpaid", "suspended"].includes(current.status) && transition.to_plan_slug === "free") throw Object.assign(new Error("Restricted subscriptions cannot be converted to Free."), { statusCode: 409, code: "RESTRICTED_TO_FREE_DENIED" });
  if (transition.transition_type === "upgrade" && transition.to_plan_slug !== "free") {
    const providerEvidence = transition.metadata?.providerEvidence;
    if (providerEvidence?.status !== "confirmed" || !providerEvidence.provider || !providerEvidence.paymentId) {
      throw Object.assign(new Error("Paid upgrades require reconciled provider payment evidence."), { statusCode: 409, code: "PAID_PROVIDER_EVIDENCE_REQUIRED" });
    }
  }
  if (current) await queryClient.query(`UPDATE tenant_subscriptions SET status = 'expired', current_period_end = LEAST(COALESCE(current_period_end, NOW()), NOW()), updated_at = NOW() WHERE id = $1`, [current.id]);
  const now = new Date();
  const end = new Date(now);
  end.setUTCMonth(end.getUTCMonth() + 1);
  const next = await billingRepository.createTenantSubscription({ tenantId: transition.tenant_id, planSlug: transition.to_plan_slug, status: "active", provider: transition.to_plan_slug === "free" ? "system" : "manual", billingInterval: "monthly", currentPeriodStart: now, currentPeriodEnd: end, entitlements: {}, entitlementModelVersion: transition.to_plan_slug === "free" ? 2 : 1, metadata: { transitionId: String(transition.id) } }, options);
  const completed = await queryClient.query(`UPDATE subscription_transitions SET status = 'effective', completed_at = NOW(), updated_at = NOW(), metadata = metadata || $2::jsonb WHERE id = $1 RETURNING *`, [transition.id, JSON.stringify({ toSubscriptionId: next.id })]);
  return completed.rows[0];
}

async function renewFreeSubscriptions(options = {}) {
  const result = await client(options).query(
    `WITH RECURSIVE periods AS (
       SELECT id, current_period_end AS period_start,
              current_period_end + INTERVAL '1 month' AS period_end
       FROM tenant_subscriptions
       WHERE plan_slug = 'free' AND status = 'active' AND current_period_end <= NOW()
       UNION ALL
       SELECT periods.id, periods.period_end,
              periods.period_end + INTERVAL '1 month'
       FROM periods
       WHERE periods.period_end <= NOW()
     ), current_periods AS (
       SELECT DISTINCT ON (id) id, period_start, period_end
       FROM periods
       WHERE period_end > NOW()
       ORDER BY id, period_end
     )
     UPDATE tenant_subscriptions subscription
     SET current_period_start = current_periods.period_start,
         current_period_end = current_periods.period_end,
         updated_at = NOW()
     FROM current_periods
     WHERE subscription.id = current_periods.id
     RETURNING subscription.id, subscription.tenant_id,
               subscription.current_period_start, subscription.current_period_end`
  );
  return result.rows;
}

module.exports = { prepareScheduledTransition, createTransition, executeTransition, listTransitions, lockCurrent, renewFreeSubscriptions };
