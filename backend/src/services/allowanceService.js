const releaseControls = require("../config/releaseControls");
const allowanceLedgerRepository = require("../repositories/allowanceLedger");
const { resolveTenantPolicy } = require("./entitlementResolver");

const RESOURCE_FLAGS = {
  queueTickets: "allowanceQueueTickets",
  queueEmailJourneys: "allowanceQueueEmailJourneys",
  serviceBookings: "allowanceServiceBookings"
};

function anchoredMonthDate(anchor, monthOffset) {
  const year = anchor.getUTCFullYear();
  const month = anchor.getUTCMonth() + monthOffset;
  const first = new Date(Date.UTC(year, month, 1, anchor.getUTCHours(), anchor.getUTCMinutes(), anchor.getUTCSeconds(), anchor.getUTCMilliseconds()));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(anchor.getUTCDate(), lastDay));
  return first;
}

function calculateMonthlyPeriod(anchorValue, nowValue = new Date()) {
  const anchor = new Date(anchorValue);
  const now = new Date(nowValue);
  if (Number.isNaN(anchor.getTime()) || Number.isNaN(now.getTime())) {
    throw new Error("A valid allowance period anchor is required.");
  }
  let offset = Math.max(0, (now.getUTCFullYear() - anchor.getUTCFullYear()) * 12 + now.getUTCMonth() - anchor.getUTCMonth());
  let start = anchoredMonthDate(anchor, offset);
  if (start.getTime() > now.getTime() && offset > 0) {
    offset -= 1;
    start = anchoredMonthDate(anchor, offset);
  }
  return { start, end: anchoredMonthDate(anchor, offset + 1) };
}

async function consumeAllowance(input, options = {}) {
  const controls = options.controls || releaseControls;
  if (!controls[RESOURCE_FLAGS[input.resourceKey]]) {
    return { consumed: true, bypassed: true };
  }
  const policy = await resolveTenantPolicy(input.tenantId, { client: options.client });
  if (policy.lifecycle.state !== "active") {
    const error = new Error(policy.restriction?.message || "This subscription is not active.");
    error.statusCode = 403;
    error.code = policy.restriction?.code || "SUBSCRIPTION_RESTRICTED";
    throw error;
  }
  if (policy.authority?.served !== "new") return { consumed: true, bypassed: "legacy_authority" };
  const period = policy.period?.start && policy.period?.end
    ? { start: new Date(policy.period.start), end: new Date(policy.period.end) }
    : calculateMonthlyPeriod(new Date(), options.now || new Date());
  const result = await allowanceLedgerRepository.consumeBase({
    ...input,
    subscriptionId: policy.lifecycle.subscriptionId,
    limit: policy.allowances[input.resourceKey].limit,
    periodStart: period.start,
    periodEnd: period.end
  }, { client: options.client });
  if (!result.consumed && input.hard !== false) {
    const error = new Error(input.exhaustedMessage || "This vendor has reached its monthly capacity. Please try again after the reset or contact the vendor.");
    error.statusCode = 409;
    error.code = `ALLOWANCE_${input.resourceKey.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase()}_EXHAUSTED`;
    error.details = { available: result.available, resetAt: period.end };
    throw error;
  }
  return { ...result, resetAt: period.end };
}

async function reserveAllowance(input, options = {}) {
  const controls = options.controls || releaseControls;
  if (!controls[RESOURCE_FLAGS[input.resourceKey]]) return { reserved: true, bypassed: true };
  const policy = await resolveTenantPolicy(input.tenantId, { client: options.client });
  if (policy.lifecycle.state !== "active") throw Object.assign(new Error(policy.restriction?.message || "This subscription is not active."), { statusCode: 403, code: policy.restriction?.code || "SUBSCRIPTION_RESTRICTED" });
  if (policy.authority?.served !== "new") return { reserved: true, bypassed: "legacy_authority" };
  const period = policy.period?.start && policy.period?.end
    ? { start: new Date(policy.period.start), end: new Date(policy.period.end) }
    : calculateMonthlyPeriod(new Date(), options.now || new Date());
  const result = await allowanceLedgerRepository.reserve({ ...input, subscriptionId: policy.lifecycle.subscriptionId, limit: policy.allowances[input.resourceKey].limit, periodStart: period.start, periodEnd: period.end }, { client: options.client });
  if (!result.reserved) throw Object.assign(new Error("This vendor has reached its monthly Queue Ticket capacity. No payment was started."), { statusCode: 409, code: "ALLOWANCE_QUEUE_TICKETS_EXHAUSTED", details: { available: result.available, resetAt: period.end } });
  return { ...result, resetAt: period.end };
}

async function releaseReservation(input, options = {}) {
  if (!(options.controls || releaseControls)[RESOURCE_FLAGS[input.resourceKey]]) return false;
  return allowanceLedgerRepository.releaseReservation(input.tenantId, input.resourceKey, input.reservationKey, { client: options.client });
}

async function commitReservation(input, options={}) {
  if (!(options.controls || releaseControls)[RESOURCE_FLAGS[input.resourceKey]]) return {committed:true,bypassed:true};
  const result=await allowanceLedgerRepository.commitReservation(input,{client:options.client});
  if(!result) throw Object.assign(new Error("The reserved capacity could not be found for this payment."),{statusCode:409,code:"ALLOWANCE_RESERVATION_MISSING"});
  return result;
}

module.exports = { calculateMonthlyPeriod, commitReservation, consumeAllowance, releaseReservation, reserveAllowance };
