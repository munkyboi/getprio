const db = require("../config/db");
const repository = require("../repositories/subscriptionLifecycle");
const planRepository = require("../repositories/subscriptionPlans");
const suspensionRepository = require("../repositories/subscriptionSuspension");
const suspensionContexts = new WeakMap();
const { assertPermission } = require("./permissions");

const PLAN_ORDER = { free: 0, economical: 1, pro: 2, enterprise: 3 };

async function freeAssignmentLock(client, sql, values, code) {
  try { return await client.query(sql, values); }
  catch (error) {
    if (error.code === "55P03") throw Object.assign(new Error("Free assignment state is being updated. Retry after that change completes."), { statusCode: 409, code });
    throw error;
  }
}

async function prepareFreeAssignmentActor(actorId, options = {}) {
  if (!options.client) throw new Error("Free assignment actor preparation requires a transaction client.");
  if (actorId == null) throw Object.assign(new Error("User session is no longer valid."), { statusCode: 401 });
  if (typeof actorId === "number" && !Number.isSafeInteger(actorId)) throw Object.assign(new Error("Actor identifier must be an exact integer."), { statusCode: 400, code: "INVALID_ACTOR_ID" });
  return assertSubscriptionActor(options.client, String(actorId), false, { forActorUpdate: true });
}

async function assignFreeToApprovedTenant(tenantId, input = {}, options = {}) {
  if (typeof tenantId === "number" && !Number.isSafeInteger(tenantId)) throw Object.assign(new Error("Tenant identifier must be an exact integer."), { statusCode: 400, code: "INVALID_TENANT_ID" });
  const assign = async (client) => {
    const tenantResult = await client.query(
      `SELECT id, vendor_approval_status FROM tenants WHERE id = $1 FOR UPDATE`,
      [String(tenantId)]
    );
    const tenant = tenantResult.rows[0];
    if (!tenant) throw Object.assign(new Error("Vendor not found."), { statusCode: 404 });
    if (input.actorId != null) await prepareFreeAssignmentActor(input.actorId, { client });
    if (tenant.vendor_approval_status !== "approved") {
      return { assigned: false, reason: "vendor_not_approved" };
    }

    const history = await freeAssignmentLock(client,
      `SELECT id FROM tenant_subscriptions WHERE tenant_id = $1 ORDER BY created_at LIMIT 1 FOR UPDATE NOWAIT`,
      [String(tenantId)], "SUBSCRIPTION_BUSY"
    );
    if (history.rows[0]) return { assigned: false, reason: "subscription_history_exists" };

    const plan = await freeAssignmentLock(client, "SELECT slug FROM subscription_plans WHERE slug = $1 FOR SHARE NOWAIT", ["free"], "SUBSCRIPTION_PLAN_BUSY");
    if (!plan.rows.length) throw Object.assign(new Error("Free subscription plan not found."), { statusCode: 404 });
    const transition = await repository.createTransition({
      tenantId,
      toPlanSlug: "free",
      transitionType: "free_assignment",
      status: "scheduled",
      reason: input.reason || "Automatic Free assignment after vendor approval",
      effectiveAt: new Date(),
      actorId: input.actorId,
      metadata: input.metadata
    }, { client });
    const scheduledContext = await repository.prepareScheduledTransition(transition.id, { client });
    if (!scheduledContext) throw Object.assign(new Error("Free assignment transition disappeared."), { statusCode: 409 });
    const completed = await repository.executeTransition(transition.id, { client, scheduledContext });
    return { assigned: true, transition: completed };
  };

  if (options.client) return assign(options.client);
  return db.withTransaction(assign);
}

async function requestTransition(input, options = {}) {
  if (!(input.toPlanSlug in PLAN_ORDER) || !(await planRepository.findPlanBySlug(input.toPlanSlug, { client: options.client }))) throw Object.assign(new Error("Subscription plan not found."), { statusCode: 404 });
  const transition = async (client) => {
    const current = await repository.lockCurrent(input.tenantId, { client });
    if (!current && input.toPlanSlug !== "free") throw Object.assign(new Error("A paid transition requires an existing subscription lifecycle."), { statusCode: 409 });
    if (current && ["past_due", "unpaid", "suspended"].includes(current.status)) throw Object.assign(new Error("Resolve the restricted subscription before changing plans."), { statusCode: 409, code: "RESTRICTED_PLAN_CHANGE_DENIED" });
    const fromOrder = PLAN_ORDER[current?.plan_slug] ?? -1;
    const toOrder = PLAN_ORDER[input.toPlanSlug];
    const transitionType = !current ? "free_assignment" : input.toPlanSlug === "free" ? "paid_exit" : toOrder > fromOrder ? "upgrade" : toOrder < fromOrder ? "downgrade" : "admin_resolution";
    if (input.vendorRequested && ["upgrade", "admin_resolution", "free_assignment"].includes(transitionType)) throw Object.assign(new Error("Paid upgrades use verified checkout. Choose a lower plan to schedule a term-end change."), { statusCode: 409, code: "PAID_CHECKOUT_REQUIRED" });
    if (transitionType === "upgrade") {
      const providerEvidence = input.metadata?.providerEvidence;
      if (providerEvidence?.status !== "confirmed" || !providerEvidence.provider || !providerEvidence.paymentId) {
        throw Object.assign(new Error("Paid upgrades require provider-confirmed checkout."), { statusCode: 409, code: "PAID_CHECKOUT_REQUIRED" });
      }
    }
    const immediate = transitionType === "upgrade" || transitionType === "free_assignment" || transitionType === "admin_resolution";
    const effectiveAt = immediate ? new Date() : new Date(current.current_period_end);
    const transition = await repository.createTransition({ tenantId: input.tenantId, fromSubscriptionId: current?.id, fromPlanSlug: current?.plan_slug, toPlanSlug: input.toPlanSlug, transitionType, status: "scheduled", reason: input.reason, effectiveAt, actorId: input.actorId, metadata: input.metadata }, { client });
    if (immediate) return repository.executeTransition(transition.id, { client });
    return transition;
  };
  if (options.client) return transition(options.client);
  return db.withTransaction(transition);
}

async function executeDue() {
  const due = await db.pool.query(`SELECT id FROM subscription_transitions WHERE status = 'scheduled' AND effective_at <= NOW() ORDER BY effective_at LIMIT 100`);
  const results = [];
  for (const row of due.rows) results.push(await db.withTransaction(async (client) => {
    const scheduledContext = await repository.prepareScheduledTransition(row.id, { client });
    return scheduledContext ? repository.executeTransition(row.id, { client, scheduledContext }) : null;
  }));
  const renewals = await repository.renewFreeSubscriptions();
  return { transitions: results, renewals };
}

async function prepareSubscriptionSuspension(subscriptionId, options = {}) {
  const client = options.client;
  if (!client) throw new Error("Suspension preparation requires a transaction client.");
  const located = await suspensionRepository.readSubscription(client, subscriptionId);
  if (!located) return null;
  const tenantId = String(located.tenant_id);
  const tenant = await client.query("SELECT id FROM tenants WHERE id = $1 FOR UPDATE", [tenantId]);
  if (!tenant.rows.length) return null;
  const current = await suspensionRepository.readSubscription(client, subscriptionId, true);
  if (!current) return null;
  assertSuspensionTenant(current, tenantId);
  const actorId = options.actorId == null ? null : String(options.actorId);
  if (options.requirePlatformAuthority && actorId === null) {
    throw Object.assign(new Error("User session is no longer valid."), { statusCode: 401 });
  }
  await assertSubscriptionActor(client, actorId, options.requirePlatformAuthority);
  const context = Object.freeze({});
  suspensionContexts.set(context, { client, subscriptionId: String(subscriptionId), tenantId, actorId, requirePlatformAuthority: options.requirePlatformAuthority });
  return context;
}

async function assertSubscriptionActor(client, actorId, requirePlatformAuthority, options = {}) {
  if (actorId === null) return;
  const actor = await suspensionRepository.readActor(client, actorId, options);
  if (!actor || actor.deletion_requested_at) {
    throw Object.assign(new Error("User session is no longer valid."), { statusCode: 401 });
  }
  if (actor.platform_access_suspended_at) {
    throw Object.assign(new Error("This account's access is suspended. Contact GetPrio support."), {
      statusCode: 403, code: "ACCOUNT_ACCESS_SUSPENDED"
    });
  }
  if (requirePlatformAuthority) assertPermission(actor, "platform.subscription_lifecycle.manage");
  return actor;
}

function assertSuspensionTenant(current, tenantId) {
  if (String(current.tenant_id) !== tenantId) {
    throw Object.assign(new Error("Subscription moved while the action was being prepared. Review the current target."), {
      statusCode: 409, code: "SUBSCRIPTION_SCOPE_CHANGED"
    });
  }
}

async function suspendSubscription(subscriptionId, input = {}, options = {}) {
  const suspend = async (client, context) => {
    const scope = suspensionContexts.get(context);
    if (!scope || scope.client !== client || scope.subscriptionId !== String(subscriptionId) || scope.actorId !== (input.actorId == null ? null : String(input.actorId))) {
      throw Object.assign(new Error("Caller-owned suspension requires a prepared transaction context."), {
        statusCode: 409, code: "SUSPENSION_CONTEXT_REQUIRED"
      });
    }
    suspensionContexts.delete(context);
    await assertSubscriptionActor(client, scope.actorId, scope.requirePlatformAuthority);
    const current = await suspensionRepository.readSubscription(client, subscriptionId, true);
    if (!current) return null;
    assertSuspensionTenant(current, scope.tenantId);
    if (current.status === "suspended") return current;
    if (current.status !== "active") throw Object.assign(new Error("Only an active subscription can be suspended."), { statusCode: 409 });
    await repository.createTransition({ tenantId: current.tenant_id, fromSubscriptionId: current.id, fromPlanSlug: current.plan_slug, toPlanSlug: current.plan_slug, transitionType: "admin_resolution", status: "effective", reason: input.reason, effectiveAt: new Date(), actorId: input.actorId, metadata: { operation: "suspend", previousStatus: current.status } }, { client });
    const updated = await client.query(`UPDATE tenant_subscriptions SET status = 'suspended', updated_at = NOW() WHERE id = $1 RETURNING *`, [current.id]);
    return updated.rows[0];
  };
  if (options.client) return suspend(options.client, options.suspensionContext);
  return db.withTransaction(async client => {
    const context = await prepareSubscriptionSuspension(subscriptionId, { client, actorId: input.actorId });
    return context ? suspend(client, context) : null;
  });
}

module.exports = { prepareFreeAssignmentActor, assignFreeToApprovedTenant, executeDue, requestTransition, prepareSubscriptionSuspension, suspendSubscription };
