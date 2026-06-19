const db = require("../config/db");
const env = require("../config/env");
const billingRepository = require("../repositories/billing");
const paymentRepository = require("../repositories/queueJoinPayments");
const tenantRepository = require("../repositories/tenants");
const storeLocationRepository = require("../repositories/storeLocations");
const { buildMonitorUrl } = require("../publicLinks");
const queueFeeService = require("./queueFeeService");
const {
  createTicketForTenantInTransaction,
  maybeNotifyUpcomingTickets,
  publishSnapshot
} = require("./queueService");

const PAYMONGO_PROVIDER = "paymongo";

function buildBasicAuth(secretKey) {
  return Buffer.from(`${secretKey}:`).toString("base64");
}

function getClientUrl(path) {
  return `${env.clientUrl.replace(/\/$/, "")}${path}`;
}

function buildReturnUrl(tenant, payment, status) {
  const params = new URLSearchParams({
    payment: payment._id,
    payment_status: status
  });

  const locationSlug = payment.payload?.locationSlug;
  const path =
    status === "success"
      ? locationSlug
        ? `/ticket/${tenant.slug}/${locationSlug}`
        : `/ticket/${tenant.slug}`
      : locationSlug
        ? `/join/${tenant.slug}/${locationSlug}`
        : `/join/${tenant.slug}`;
  return getClientUrl(`${path}?${params.toString()}`);
}

function formatPayment(payment) {
  return {
    id: payment._id,
    tenantId: payment.tenantId,
    tenantName: payment.tenantName,
    tenantSlug: payment.tenantSlug,
    otpId: payment.otpId,
    planSlug: payment.planSlug,
    provider: payment.provider,
    providerCheckoutSessionId: payment.providerCheckoutSessionId,
    checkoutUrl: payment.checkoutUrl,
    amountCents: payment.amountCents,
    currency: payment.currency,
    status: payment.status,
    ticketId: payment.ticketId,
    ticketLookupCode: payment.ticketLookupCode,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt
  };
}

function buildTicketResponse(ticket) {
  return {
    id: String(ticket._id),
    lookupCode: ticket.lookupCode,
    ticketNumber: ticket.ticketNumber,
    customerName: ticket.customerName,
    status: ticket.status
  };
}

function shouldChargeQueueFee(queueFee, payload) {
  return Boolean(queueFee?.enabled) && Number(queueFee?.amountCents || 0) > 0 && Boolean(payload?.notifyBySms);
}

function normalizeProviderTimestamp(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "number" || /^\d+$/.test(String(value))) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return null;
    }

    const milliseconds = numericValue < 100000000000 ? numericValue * 1000 : numericValue;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getFirstPayment(checkoutSession) {
  const payments = checkoutSession?.attributes?.payments || [];
  return payments[0]?.data || payments[0] || null;
}

function isPaidPayMongoCheckout(checkoutSession) {
  const attributes = checkoutSession?.attributes || {};
  const payment = getFirstPayment(checkoutSession);
  const paymentAttributes = payment?.attributes || {};
  const paidStatuses = new Set(["paid", "succeeded", "success"]);

  return (
    paidStatuses.has(String(attributes.status || "").toLowerCase()) ||
    paidStatuses.has(String(attributes.payment_status || "").toLowerCase()) ||
    paidStatuses.has(String(paymentAttributes.status || "").toLowerCase()) ||
    Boolean(paymentAttributes.paid_at)
  );
}

async function retrievePayMongoCheckout(providerCheckoutSessionId) {
  const response = await fetch(
    `${env.paymongoApiUrl.replace(/\/$/, "")}/checkout_sessions/${providerCheckoutSessionId}`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${buildBasicAuth(env.paymongoSecretKey)}`
      }
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.errors?.[0]?.detail || data?.errors?.[0]?.code || "Unable to retrieve checkout session.";
    const error = new Error(`PayMongo checkout sync failed: ${detail}`);
    error.statusCode = 502;
    throw error;
  }

  return data?.data || null;
}

async function createPayMongoCheckoutForJoin({ tenant, otpId, payload, queueFee }) {
  if (!env.paymongoSecretKey) {
    const error = new Error("PayMongo is not configured.");
    error.statusCode = 503;
    throw error;
  }

  const payment = await paymentRepository.createPayment({
    tenantId: tenant._id,
    otpId,
    planSlug: queueFee.planSlug,
    provider: PAYMONGO_PROVIDER,
    amountCents: queueFee.amountCents,
    currency: queueFee.currency,
    payload,
    metadata: {
      purpose: "queue_join_fee",
      tenantId: String(tenant._id),
      tenantSlug: tenant.slug,
      planSlug: queueFee.planSlug
    }
  });

  let providerCheckoutSessionId = null;
  let checkoutUrl = null;

  try {
    if (payment.providerCheckoutSessionId && payment.checkoutUrl) {
      return {
        payment,
        checkoutUrl: payment.checkoutUrl,
        providerCheckoutSessionId: payment.providerCheckoutSessionId
      }
    }

    const successUrl = buildReturnUrl(tenant, payment, "success");
    const cancelUrl = buildReturnUrl(tenant, payment, "cancelled");
    const body = {
      data: {
        attributes: {
          description: `GetPrio queue join fee for ${tenant.name}`,
          line_items: [
            {
              currency: queueFee.currency,
              amount: queueFee.amountCents,
              name: "GetPrio queue join fee",
              quantity: 1,
              description: `Priority queue access for ${tenant.name}`
            }
          ],
          payment_method_types: env.paymongoPaymentMethodTypes,
          metadata: {
            purpose: "queue_join_fee",
            localQueueJoinPaymentId: payment._id,
            tenantId: String(tenant._id),
            tenantSlug: tenant.slug,
            planSlug: queueFee.planSlug
          },
          send_email_receipt: true,
          show_description: true,
          show_line_items: true,
          success_url: successUrl,
          cancel_url: cancelUrl
        }
      }
    };

    const response = await fetch(`${env.paymongoApiUrl.replace(/\/$/, "")}/checkout_sessions`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${buildBasicAuth(env.paymongoSecretKey)}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = data?.errors?.[0]?.detail || data?.errors?.[0]?.code || "Unable to create checkout session.";
      const error = new Error(`PayMongo checkout failed: ${detail}`);
      error.statusCode = 502;
      throw error;
    }

    const attributes = data?.data?.attributes || {};
    providerCheckoutSessionId = data?.data?.id;
    checkoutUrl = attributes.checkout_url;

    if (!providerCheckoutSessionId || !checkoutUrl) {
      const error = new Error("PayMongo did not return a checkout URL.");
      error.statusCode = 502;
      throw error;
    }

    const updatedPayment = await paymentRepository.updateProviderData(payment._id, {
      providerCheckoutSessionId,
      checkoutUrl,
      metadata: {
        paymongoResponse: {
          id: providerCheckoutSessionId,
          clientKey: attributes.client_key || null
        }
      }
    });

    return {
      payment: updatedPayment,
      checkoutUrl,
      providerCheckoutSessionId
    };
  } catch (error) {
    try {
      await paymentRepository.markFailed(payment._id, {
        providerCheckoutSessionId: providerCheckoutSessionId || payment.providerCheckoutSessionId || null,
        checkoutUrl: checkoutUrl || payment.checkoutUrl || null,
        metadata: {
          failureReason: error.message || "Checkout creation failed.",
          failureStatusCode: error.statusCode || 500
        }
      });
    } catch (markError) {
      console.warn("Unable to mark queue join payment failed", {
        paymentId: payment._id,
        error: markError.message
      });
    }

    throw error;
  }
}

async function createQueueJoinCheckout({ tenant, otpId, payload, queueFee }) {
  const checkout = await createPayMongoCheckoutForJoin({
    tenant,
    otpId,
    payload,
    queueFee
  });

  return {
    requiresPayment: true,
    queueFee,
    payment: formatPayment(checkout.payment),
    checkoutSession: {
      id: checkout.payment._id,
      provider: PAYMONGO_PROVIDER,
      providerCheckoutSessionId: checkout.providerCheckoutSessionId,
      checkoutUrl: checkout.checkoutUrl,
      status: checkout.payment.status,
      amountCents: checkout.payment.amountCents,
      currency: checkout.payment.currency
    }
  };
}

async function createZeroFeeTicket({ tenant, payload, queueFee }) {
  const location = payload.locationSlug
    ? await storeLocationRepository.findLocationByTenantAndSlug(tenant._id, payload.locationSlug)
    : null;
  const result = await require("./queueService").createTicket({
    tenant,
    location: location || undefined,
    ...payload
  });

  return {
    requiresPayment: false,
    queueFee,
    ticket: buildTicketResponse(result.ticket),
    snapshot: result.snapshot
  };
}

async function handleVerifiedJoin({ tenant, otpId, payload }) {
  await queueFeeService.assertTenantCanAcceptCustomerJoins(tenant._id);
  const queueFee = await queueFeeService.getQueueFeeForTenant(tenant._id);
  if (!shouldChargeQueueFee(queueFee, payload)) {
    return createZeroFeeTicket({ tenant, payload, queueFee });
  }

  return createQueueJoinCheckout({
    tenant,
    otpId,
    payload,
    queueFee
  });
}

async function handleDirectJoin({ tenant, payload }) {
  await queueFeeService.assertTenantCanAcceptCustomerJoins(tenant._id);
  const queueFee = await queueFeeService.getQueueFeeForTenant(tenant._id);
  if (shouldChargeQueueFee(queueFee, payload)) {
    const error = new Error("Verification is required before continuing to payment for this queue.");
    error.statusCode = 409;
    throw error;
  }

  return createZeroFeeTicket({ tenant, payload, queueFee });
}

async function issueTicketForPaidPayment(payment, providerPaymentId, paymentAttributes, options = {}) {
  const tenant = await tenantRepository.findTenantById(payment.tenantId, options);
  if (!tenant) {
    const error = new Error("Tenant not found for queue join payment.");
    error.statusCode = 404;
    throw error;
  }

  if (payment.ticketId && payment.ticketLookupCode) {
    return {
      payment,
      tenant,
      ticket: null,
      alreadyIssued: true
    };
  }

  await queueFeeService.assertTenantCanAcceptCustomerJoins(payment.tenantId, options);
  const location = payment.payload?.locationSlug
    ? await storeLocationRepository.findLocationByTenantAndSlug(
        tenant._id,
        payment.payload.locationSlug,
        options
      )
    : null;

  const ticket = await createTicketForTenantInTransaction(options.client, {
    tenant,
    location: location || undefined,
    ...payment.payload
  });

  const updatedPayment = await paymentRepository.markPaidWithTicket(
    payment._id,
    {
      providerPaymentId,
      paidAt: normalizeProviderTimestamp(paymentAttributes?.paid_at),
      ticketId: ticket._id,
      ticketLookupCode: ticket.lookupCode,
      metadata: {
        paidAmount: paymentAttributes?.amount || payment.amountCents,
        paidCurrency: paymentAttributes?.currency || payment.currency
      }
    },
    options
  );

  return {
    payment: updatedPayment,
    tenant,
    ticket,
    alreadyIssued: false
  };
}

async function activatePaidPayment(paymentId, providerPaymentId, paymentAttributes) {
  const result = await db.withTransaction(async (client) => {
    const lockedPayment = await paymentRepository.findPaymentByIdForUpdate(paymentId, { client });
    if (!lockedPayment) {
      const error = new Error("Queue join payment not found.");
      error.statusCode = 404;
      throw error;
    }

    return issueTicketForPaidPayment(lockedPayment, providerPaymentId, paymentAttributes, { client });
  });

  if (!result.alreadyIssued) {
    await maybeNotifyUpcomingTickets(result.tenant, {
      locationSlug: result.payment.payload?.locationSlug
    });
  }

  const snapshot = await publishSnapshot(result.tenant, {
    lookupCode: result.payment.ticketLookupCode || result.ticket?.lookupCode,
    locationSlug: result.payment.payload?.locationSlug
  });

  return {
    payment: result.payment,
    ticket: result.ticket,
    snapshot
  };
}

async function syncQueueJoinPayment({ tenant, paymentId }) {
  const payment = await paymentRepository.findPaymentById(paymentId);
  if (!payment || payment.tenantId !== String(tenant._id)) {
    const error = new Error("Queue join payment not found.");
    error.statusCode = 404;
    throw error;
  }

  if (payment.status === "paid" && payment.ticketLookupCode) {
    const snapshot = await publishSnapshot(tenant, {
      lookupCode: payment.ticketLookupCode,
      locationSlug: payment.payload?.locationSlug
    });
    return {
      synced: true,
      paid: true,
      payment: formatPayment(payment),
      ticket: snapshot.focusTicket
        ? {
            id: snapshot.focusTicket.id,
            lookupCode: snapshot.focusTicket.lookupCode,
            ticketNumber: snapshot.focusTicket.ticketNumber,
            customerName: snapshot.focusTicket.customerName,
            status: snapshot.focusTicket.status
          }
        : undefined,
      snapshot
    };
  }

  if (!payment.providerCheckoutSessionId) {
    return {
      synced: false,
      paid: false,
      payment: formatPayment(payment)
    };
  }

  const providerCheckout = await retrievePayMongoCheckout(payment.providerCheckoutSessionId);
  if (!isPaidPayMongoCheckout(providerCheckout)) {
    return {
      synced: true,
      paid: false,
      payment: formatPayment(payment)
    };
  }

  const providerPayment = getFirstPayment(providerCheckout);
  const paymentAttributes = providerPayment?.attributes || {};
  const activated = await activatePaidPayment(
    payment._id,
    providerPayment?.id || null,
    paymentAttributes
  );

  return {
    synced: true,
    paid: true,
    payment: formatPayment(activated.payment),
    ticket: activated.snapshot.focusTicket
      ? {
          id: activated.snapshot.focusTicket.id,
          lookupCode: activated.snapshot.focusTicket.lookupCode,
          ticketNumber: activated.snapshot.focusTicket.ticketNumber,
          customerName: activated.snapshot.focusTicket.customerName,
          status: activated.snapshot.focusTicket.status
        }
      : activated.ticket
        ? buildTicketResponse(activated.ticket)
        : undefined,
    snapshot: activated.snapshot
  };
}

async function handlePayMongoPaidCheckout(resource, event, options = {}) {
  const providerCheckoutSessionId = resource.id;
  const existingPayment = await paymentRepository.findPaymentByProviderId(
    providerCheckoutSessionId,
    options
  );

  if (!existingPayment) {
    return {
      handled: false
    };
  }

  const providerPayment = getFirstPayment(resource);
  const paymentAttributes = providerPayment?.attributes || {};
  const providerPaymentId = providerPayment?.id || null;

  const eventRecord = await billingRepository.recordBillingEvent(
    {
      provider: PAYMONGO_PROVIDER,
      providerEventId: event?.data?.id,
      eventType: event?.data?.attributes?.type,
      providerCheckoutSessionId,
      providerPaymentId,
      tenantId: existingPayment.tenantId,
      payload: event
    },
    options
  );

  if (!eventRecord) {
    return {
      handled: true,
      duplicate: true
    };
  }

  const activated = await activatePaidPayment(
    existingPayment._id,
    providerPaymentId,
    paymentAttributes
  );

  return {
    handled: true,
    payment: formatPayment(activated.payment)
  };
}

async function getMonitorUrlForPayment(payment) {
  if (!payment.ticketLookupCode) {
    return null;
  }

  const tenant = await tenantRepository.findTenantById(payment.tenantId);
  if (!tenant) {
    return null;
  }

  return `${buildMonitorUrl(env.appBaseUrl, tenant.slug, payment.payload?.locationSlug)}?ticket=${payment.ticketLookupCode}`;
}

module.exports = {
  formatPayment,
  handleDirectJoin,
  handleVerifiedJoin,
  syncQueueJoinPayment,
  handlePayMongoPaidCheckout,
  getMonitorUrlForPayment
};
