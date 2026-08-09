const crypto = require("node:crypto");
const db = require("../config/db");
const env = require("../config/env");
const releaseControls = require("../config/releaseControls");
const repository = require("../repositories/usageCredits");
const allowanceLedgerRepository = require("../repositories/allowanceLedger");
const { resolveTenantPolicy } = require("./entitlementResolver");

function runTransaction(options, callback) {
  if (options.client) return callback(options.client);
  return db.withTransaction(callback);
}

function positiveInteger(value, label) {
  const result = Number(value);
  if (!Number.isInteger(result) || result <= 0) throw Object.assign(new Error(`${label} must be a positive whole number.`), { statusCode: 400 });
  return result;
}

function formatPack(row) {
  return {
    id: String(row.id), code: row.code, name: row.name, state: row.state,
    revision: Number(row.current_revision), ticketUnits: Number(row.ticket_units),
    journeyUnits: Number(row.journey_units), priceCents: Number(row.price_cents), currency: row.currency,
    priceDisplay: `PHP ${(Number(row.price_cents) / 100).toLocaleString("en-PH")}`
  };
}

function formatLot(row, commercial = true) {
  const consumed = Number(row.consumed_units || 0);
  const remaining = Math.max(0, Number(row.granted_units) - Number(row.revoked_units) - Number(row.frozen_units) - consumed);
  const base = { id: String(row.id), resourceKey: row.resource_key, remainingUnits: remaining, expiresAt: row.expires_at, status: row.status };
  return commercial ? { ...base, sourceType: row.source_type, grantedUnits: Number(row.granted_units), consumedUnits: consumed, revokedUnits: Number(row.revoked_units), frozenUnits: Number(row.frozen_units), reason: row.reason, createdAt: row.created_at } : base;
}

async function listCatalog() { return (await repository.listPacks()).map(formatPack); }

async function publishPack(code, input, actorId, options = {}) {
  if (!releaseControls.usageCreditCatalog) throw Object.assign(new Error("Usage Credit catalog changes are temporarily unavailable."), { statusCode: 503, code: "CREDIT_CATALOG_DISABLED" });
  const state = String(input.state || "enabled");
  if (!["draft", "enabled", "disabled"].includes(state)) throw Object.assign(new Error("Pack state is invalid."), { statusCode: 400 });
  const row = await runTransaction(options, (client) => repository.publishRevision(String(code).toUpperCase(), {
    name: String(input.name || code).trim(), state,
    ticketUnits: positiveInteger(input.ticketUnits, "Ticket credits"),
    journeyUnits: positiveInteger(input.journeyUnits, "Journey credits"),
    priceCents: positiveInteger(input.priceCents, "Price"), reason: String(input.reason || "").trim()
  }, actorId, { client }));
  if (!row) throw Object.assign(new Error("Usage Credit pack not found."), { statusCode: 404 });
  return formatPack(row);
}

async function grant(input, actorId, options = {}) {
  if (!releaseControls.usageCreditGrants) throw Object.assign(new Error("Usage Credit grants are temporarily unavailable."), { statusCode: 503, code: "CREDIT_GRANTS_DISABLED" });
  const ticketUnits = Number(input.ticketUnits || 0);
  const journeyUnits = Number(input.journeyUnits || 0);
  if ((!ticketUnits && !journeyUnits) || ![ticketUnits, journeyUnits].every((v) => Number.isInteger(v) && v >= 0)) throw Object.assign(new Error("Grant at least one Ticket or Queue Email Journey credit."), { statusCode: 400 });
  const reason = String(input.reason || "").trim();
  if (reason.length < 4) throw Object.assign(new Error("A reason is required."), { statusCode: 400 });
  const reference = String(input.reference || crypto.randomUUID());
  return runTransaction(options, async (client) => {
    const lots = [];
    if (ticketUnits) lots.push(await repository.grantLot({ tenantId: input.tenantId, resourceKey: "queueTickets", sourceType: "promotional", sourceReference: `${reference}:tickets`, units: ticketUnits, expiresAt: input.expiresAt, actorId, reason }, { client }));
    if (journeyUnits) lots.push(await repository.grantLot({ tenantId: input.tenantId, resourceKey: "queueEmailJourneys", sourceType: "promotional", sourceReference: `${reference}:journeys`, units: journeyUnits, expiresAt: input.expiresAt, actorId, reason }, { client }));
    return lots.map((lot) => formatLot(lot));
  });
}

async function revoke(input, options = {}) {
  if (!releaseControls.usageCreditGrants) throw Object.assign(new Error("Usage Credit changes are temporarily unavailable."), { statusCode: 503 });
  const result = await runTransaction(options, (client) => repository.revokeLot(input.lotId, positiveInteger(input.units, "Credits"), { client }));
  if (!result) throw Object.assign(new Error("Credit lot not found."), { statusCode: 404 });
  return formatLot(result);
}

async function getTenantCapacity(tenantId, commercial = true) {
  const [lots, ledger, policy] = await Promise.all([
    repository.listLots(tenantId),
    allowanceLedgerRepository.getCapacity(tenantId),
    resolveTenantPolicy(tenantId)
  ]);
  const usageByResource = Object.fromEntries(ledger.usage.map((row) => [row.resource_key, row]));
  const warningsByResource = (ledger.warnings || []).reduce((groups, row) => {
    (groups[row.resource_key] ||= []).push(row);
    return groups;
  }, {});
  const formattedLots = lots.map((lot) => formatLot(lot, commercial));
  const resources = Object.fromEntries(Object.entries(policy.allowances).map(([key, allowance]) => {
    const creditRemaining = formattedLots.filter((lot, index) => {
      const source = lots[index];
      return lot.resourceKey === key && source.status === "active" && (!source.expires_at || new Date(source.expires_at) > new Date());
    }).reduce((sum, lot) => sum + lot.remainingUnits, 0);
    return [key, {
      limit: Number(allowance.limit),
      used: Number(usageByResource[key]?.base_used || 0),
      creditRemaining: key === "serviceBookings" ? 0 : creditRemaining,
      resetAt: policy.period?.end || null,
      source: allowance.source,
      overrideId: allowance.overrideId,
      warningThresholds: (warningsByResource[key] || []).map((row) => ({
        thresholdPercent: Number(row.threshold_percent),
        claimedAt: row.claimed_at,
        deliveredAt: row.delivered_at || null
      }))
    }];
  }));
  return {
    planSlug: policy.lifecycle.planSlug,
    subscriptionId: policy.lifecycle.subscriptionId,
    lifecycleState: policy.lifecycle.state,
    planRevision: policy.planRevision,
    resources,
    ...(commercial ? { features: policy.features, lots: formattedLots } : {})
  };
}

async function createCheckout({ tenant, user, packCode, purchaseKey, requestOrigin }) {
  if (!releaseControls.usageCreditCheckout) throw Object.assign(new Error("Usage Credit checkout is temporarily unavailable."), { statusCode: 503, code: "CREDIT_CHECKOUT_DISABLED" });
  if (!env.paymongoSecretKey) throw Object.assign(new Error("Payment checkout is temporarily unavailable."), { statusCode: 503 });
  const policy = await resolveTenantPolicy(tenant._id);
  if (policy.lifecycle.state !== "active") {
    throw Object.assign(new Error("Usage Credits require an active subscription."), { statusCode: 409, code: "CREDIT_CHECKOUT_SUBSCRIPTION_RESTRICTED" });
  }
  const pack = await repository.findPack(packCode);
  if (!pack || pack.state !== "enabled") throw Object.assign(new Error("This Usage Credit pack is not available."), { statusCode: 409 });
  const purchase = await repository.createPurchase({ tenantId: tenant._id, packId: pack.id, packRevisionId: pack.revision_id, purchaseKey, ticketUnits: pack.ticket_units, journeyUnits: pack.journey_units, amountCents: pack.price_cents, currency: pack.currency, provider: "paymongo", actorId: user._id });
  if (purchase.provider_checkout_id) return { purchaseId: String(purchase.id), checkoutUrl: purchase.checkout_url };
  const origin = [env.clientUrl, env.appBaseUrl].map((v) => String(v || "").replace(/\/$/, "")).includes(String(requestOrigin || "").replace(/\/$/, "")) ? String(requestOrigin).replace(/\/$/, "") : String(env.clientUrl).replace(/\/$/, "");
  const returnParams = new URLSearchParams({ credits: "success", purchase: String(purchase.id) });
  const body = { data: { attributes: {
    description: `${pack.name} for ${tenant.name}`,
    line_items: [{ currency: pack.currency, amount: Number(pack.price_cents), name: pack.name, quantity: 1, description: `${pack.ticket_units} Queue Tickets and ${pack.journey_units} Queue Email Journeys` }],
    payment_method_types: env.paymongoPaymentMethodTypes,
    metadata: { productType: "usage_credit", purchaseId: String(purchase.id), tenantId: String(tenant._id), packCode: pack.code, packRevision: String(pack.current_revision) },
    send_email_receipt: true, show_description: true, show_line_items: true,
    success_url: `${origin}/dashboard?${returnParams}`, cancel_url: `${origin}/dashboard?credits=cancelled`
  } } };
  const response = await fetch(`${env.paymongoApiUrl.replace(/\/$/, "")}/checkout_sessions`, { method: "POST", headers: { Accept: "application/json", Authorization: `Basic ${Buffer.from(`${env.paymongoSecretKey}:`).toString("base64")}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.data?.id || !data?.data?.attributes?.checkout_url) throw Object.assign(new Error("Unable to start Usage Credit checkout."), { statusCode: 502 });
  await repository.attachProviderCheckout(purchase.id, data.data.id, data.data.attributes.checkout_url);
  return { purchaseId: String(purchase.id), checkoutUrl: data.data.attributes.checkout_url };
}

function paidResource(resource) {
  const payments = resource?.attributes?.payments || [];
  return payments.find((item) => item?.attributes?.status === "paid") || null;
}

async function handlePaidCheckout(resource) {
  const metadata = resource?.attributes?.metadata || {};
  if (metadata.productType !== "usage_credit") return { handled: false };
  const purchase = await repository.findPurchaseByCheckout(resource.id);
  if (!purchase) return { handled: true, missing: true };
  const payment = paidResource(resource);
  const amount = Number(payment?.attributes?.amount || resource?.attributes?.line_items?.[0]?.amount || 0);
  const currency = String(payment?.attributes?.currency || resource?.attributes?.line_items?.[0]?.currency || "").toUpperCase();
  if (!payment || amount !== Number(purchase.amount_cents) || currency !== purchase.currency) throw Object.assign(new Error("Usage Credit payment details do not match the server snapshot."), { statusCode: 409 });
  const fulfilled = await db.withTransaction((client) => repository.fulfillPurchase(purchase.id, payment.id, { client }));
  return { handled: true, purchaseId: String(fulfilled.id), status: fulfilled.status };
}

async function syncCheckout(purchaseId, tenantId) {
  const purchase = await repository.findPurchase(purchaseId, tenantId);
  if (!purchase) throw Object.assign(new Error("Usage Credit purchase not found."), { statusCode: 404 });
  if (purchase.status === "fulfilled") return { purchaseId: String(purchase.id), status: purchase.status, idempotent: true };
  if (!purchase.provider_checkout_id) throw Object.assign(new Error("Payment checkout is still being prepared."), { statusCode: 409 });
  const response = await fetch(`${env.paymongoApiUrl.replace(/\/$/, "")}/checkout_sessions/${purchase.provider_checkout_id}`, { headers: { Accept: "application/json", Authorization: `Basic ${Buffer.from(`${env.paymongoSecretKey}:`).toString("base64")}` } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error("Unable to confirm the Usage Credit payment yet."), { statusCode: 502 });
  const result = await handlePaidCheckout(data.data);
  return result.handled ? result : { purchaseId: String(purchase.id), status: "pending" };
}

async function requestRefund(purchaseId, tenantId, actorId, reason, options = {}) {
  if (!releaseControls.usageCreditRefunds) throw Object.assign(new Error("Usage Credit refunds are temporarily unavailable."), { statusCode: 503 });
  const owned = await repository.findPurchase(purchaseId, tenantId);
  if (!owned) throw Object.assign(new Error("Purchase not found."), { statusCode: 404 });
  const result = await runTransaction(options, (client) => repository.requestRefund(purchaseId, actorId, String(reason || "Refund requested"), { client }));
  if (!result) throw Object.assign(new Error("Purchase is not eligible for refund."), { statusCode: 409 });
  return result;
}

async function resolveRefund(purchaseId, outcome, providerRefundId, options = {}) {
  if (!releaseControls.usageCreditRefunds) throw Object.assign(new Error("Usage Credit refund reconciliation is temporarily unavailable."), { statusCode: 503 });
  if (!["confirmed", "failed"].includes(outcome)) throw Object.assign(new Error("Refund outcome is invalid."), { statusCode: 400 });
  const refund = await runTransaction(options, (client) => repository.resolveRefund(purchaseId, outcome, providerRefundId, { client }));
  if (!refund) throw Object.assign(new Error("Refund request not found."), { statusCode: 404 });
  return refund;
}

async function openDispute(purchaseId, providerDisputeId, details, options = {}) {
  if (!String(providerDisputeId || "").trim()) throw Object.assign(new Error("Provider dispute ID is required."), { statusCode: 400 });
  const dispute = await runTransaction(options, (client) => repository.openDispute(purchaseId, String(providerDisputeId), details, { client }));
  if (!dispute) throw Object.assign(new Error("Usage Credit purchase not found."), { statusCode: 404 });
  return dispute;
}

async function resolveDispute(providerDisputeId, outcome, options = {}) {
  if (!["won", "lost"].includes(outcome)) throw Object.assign(new Error("Dispute outcome is invalid."), { statusCode: 400 });
  const dispute = await runTransaction(options, (client) => repository.resolveDispute(providerDisputeId, outcome, { client }));
  if (!dispute) throw Object.assign(new Error("Usage Credit dispute not found."), { statusCode: 404 });
  return dispute;
}

module.exports = { createCheckout, getTenantCapacity, grant, handlePaidCheckout, listCatalog, openDispute, publishPack, requestRefund, resolveDispute, resolveRefund, revoke, syncCheckout };
