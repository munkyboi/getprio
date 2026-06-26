const env = require("../config/env");
const paymentRepository = require("../repositories/bookingSmsAlertPayments");
const bookingOtpService = require("./bookingOtpService");
const queueFeeService = require("./queueFeeService");

const PAYMONGO_PROVIDER = "paymongo";

function buildBasicAuth(secretKey) {
  return Buffer.from(`${secretKey}:`).toString("base64");
}

function getClientUrl(path) {
  return `${env.clientUrl.replace(/\/$/, "")}${path}`;
}

function formatPayment(payment) {
  return {
    id: payment._id,
    tenantId: payment.tenantId,
    bookingOtpId: payment.bookingOtpId,
    planSlug: payment.planSlug,
    provider: payment.provider,
    providerCheckoutSessionId: payment.providerCheckoutSessionId,
    checkoutUrl: payment.checkoutUrl,
    amountCents: payment.amountCents,
    currency: payment.currency,
    status: payment.status,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt
  };
}

function shouldChargeBookingSmsFee(queueFee, payload) {
  return Boolean(queueFee?.enabled) && Number(queueFee?.amountCents || 0) > 0 && Boolean(payload?.notifyBySms);
}

function buildReturnUrl(tenant, payment, status) {
  const params = new URLSearchParams({
    booking_sms_payment: payment._id,
    payment_status: status
  });
  return getClientUrl(`/vendors/${tenant.slug}/book?${params.toString()}`);
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

async function getBookingSmsFeeForTenant(tenantId) {
  return queueFeeService.getQueueFeeForTenant(tenantId);
}

async function createBookingSmsCheckout({ tenant, bookingVerificationToken }) {
  const verified = await bookingOtpService.getVerifiedBookingPayload({
    tenant,
    token: bookingVerificationToken
  });
  const queueFee = await getBookingSmsFeeForTenant(tenant._id);
  if (!shouldChargeBookingSmsFee(queueFee, verified.payload)) {
    return {
      requiresPayment: false,
      queueFee
    };
  }

  if (!env.paymongoSecretKey) {
    const error = new Error("PayMongo is not configured.");
    error.statusCode = 503;
    throw error;
  }

  const payment = await paymentRepository.createPayment({
    tenantId: tenant._id,
    bookingOtpId: verified.otpId,
    planSlug: queueFee.planSlug,
    provider: PAYMONGO_PROVIDER,
    amountCents: queueFee.amountCents,
    currency: queueFee.currency,
    payload: verified.payload,
    metadata: {
      purpose: "booking_sms_alert_fee",
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
        requiresPayment: true,
        queueFee,
        payment: formatPayment(payment),
        checkoutSession: {
          id: payment._id,
          provider: PAYMONGO_PROVIDER,
          providerCheckoutSessionId: payment.providerCheckoutSessionId,
          checkoutUrl: payment.checkoutUrl,
          status: payment.status,
          amountCents: payment.amountCents,
          currency: payment.currency
        }
      };
    }

    const body = {
      data: {
        attributes: {
          description: `GetPrio booking SMS alerts for ${tenant.name}`,
          line_items: [
            {
              currency: queueFee.currency,
              amount: queueFee.amountCents,
              name: "GetPrio booking SMS alerts",
              quantity: 1,
              description: `SMS booking alerts for ${tenant.name}`
            }
          ],
          payment_method_types: env.paymongoPaymentMethodTypes,
          metadata: {
            purpose: "booking_sms_alert_fee",
            localBookingSmsAlertPaymentId: payment._id,
            tenantId: String(tenant._id),
            tenantSlug: tenant.slug,
            planSlug: queueFee.planSlug
          },
          send_email_receipt: true,
          show_description: true,
          show_line_items: true,
          success_url: buildReturnUrl(tenant, payment, "success"),
          cancel_url: buildReturnUrl(tenant, payment, "cancelled")
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
      requiresPayment: true,
      queueFee,
      payment: formatPayment(updatedPayment),
      checkoutSession: {
        id: updatedPayment._id,
        provider: PAYMONGO_PROVIDER,
        providerCheckoutSessionId,
        checkoutUrl,
        status: updatedPayment.status,
        amountCents: updatedPayment.amountCents,
        currency: updatedPayment.currency
      }
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
      console.warn("Unable to mark booking SMS alert payment failed", {
        paymentId: payment._id,
        error: markError.message
      });
    }

    throw error;
  }
}

async function syncBookingSmsPayment({ tenant, paymentId }) {
  const payment = await paymentRepository.findPaymentById(paymentId);
  if (!payment || payment.tenantId !== String(tenant._id)) {
    const error = new Error("Booking SMS alert payment not found.");
    error.statusCode = 404;
    throw error;
  }

  if (payment.status === "paid") {
    return { synced: true, paid: true, payment: formatPayment(payment) };
  }

  if (!payment.providerCheckoutSessionId) {
    return { synced: false, paid: false, payment: formatPayment(payment) };
  }

  const providerCheckout = await retrievePayMongoCheckout(payment.providerCheckoutSessionId);
  if (!isPaidPayMongoCheckout(providerCheckout)) {
    return { synced: true, paid: false, payment: formatPayment(payment) };
  }

  const providerPayment = getFirstPayment(providerCheckout);
  const paymentAttributes = providerPayment?.attributes || {};
  const paidPayment = await paymentRepository.markPaid(payment._id, {
    providerPaymentId: providerPayment?.id || null,
    paidAt: paymentAttributes?.paid_at,
    metadata: {
      paidAmount: paymentAttributes?.amount || payment.amountCents,
      paidCurrency: paymentAttributes?.currency || payment.currency
    }
  });

  return { synced: true, paid: true, payment: formatPayment(paidPayment) };
}

async function assertPaidBookingSmsPayment({ tenant, paymentId, bookingOtpId }) {
  const payment = await paymentRepository.findPaymentById(paymentId);
  if (
    !payment ||
    payment.tenantId !== String(tenant._id) ||
    payment.bookingOtpId !== String(bookingOtpId) ||
    payment.status !== "paid"
  ) {
    const error = new Error("Paid SMS alert payment is required before creating this booking.");
    error.statusCode = 409;
    throw error;
  }

  return payment;
}

async function handlePayMongoPaidCheckout(resource, _event, options = {}) {
  const payment = await paymentRepository.findPaymentByProviderId(resource.id, options);
  if (!payment) {
    return { handled: false };
  }

  const providerPayment = getFirstPayment(resource);
  await paymentRepository.markPaid(
    payment._id,
    {
      providerPaymentId: providerPayment?.id || null,
      paidAt: providerPayment?.attributes?.paid_at,
      metadata: { webhookHandled: true }
    },
    options
  );

  return { handled: true };
}

module.exports = {
  getBookingSmsFeeForTenant,
  shouldChargeBookingSmsFee,
  createBookingSmsCheckout,
  syncBookingSmsPayment,
  assertPaidBookingSmsPayment,
  handlePayMongoPaidCheckout
};
