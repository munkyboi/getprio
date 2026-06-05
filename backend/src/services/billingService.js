const crypto = require("crypto");
const db = require("../config/db");
const env = require("../config/env");
const billingRepository = require("../repositories/billing");
const {
  findPlanBySlug,
  getPlanEntitlements,
  listAddOns,
  listPlans
} = require("./subscriptionPlans");
const queueJoinPaymentService = require("./queueJoinPaymentService");

const PAYMONGO_PROVIDER = "paymongo";

function addMonths(date, months) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function normalizeOrigin(origin) {
  return String(origin || "").replace(/\/$/, "");
}

function buildBasicAuth(secretKey) {
  return Buffer.from(`${secretKey}:`).toString("base64");
}

function buildAllowedReturnOrigins() {
  const origins = new Set();
  const configuredOrigins = [env.clientUrl, env.appBaseUrl, env.platformDashboardUrl]
    .filter(Boolean)
    .map((origin) => normalizeOrigin(origin));

  for (const origin of configuredOrigins) {
    origins.add(origin);

    try {
      const url = new URL(origin);
      if (!url.port) {
        continue;
      }

      origins.add(`${url.protocol}//localhost:${url.port}`);
      origins.add(`${url.protocol}//127.0.0.1:${url.port}`);
    } catch {
      // Ignore invalid URLs and keep the configured value only.
    }
  }

  return origins;
}

const allowedReturnOrigins = buildAllowedReturnOrigins();

function resolveReturnOrigin(requestOrigin) {
  const normalizedOrigin = normalizeOrigin(requestOrigin);
  if (normalizedOrigin && allowedReturnOrigins.has(normalizedOrigin)) {
    return normalizedOrigin;
  }

  return normalizeOrigin(env.clientUrl);
}

function getTenantBillingUrl(path, requestOrigin) {
  return `${resolveReturnOrigin(requestOrigin)}${path}`;
}

function buildCheckoutReturnUrl(checkout, plan, status, requestOrigin) {
  const params = new URLSearchParams({
    billing: status,
    plan: plan.slug,
    checkout: checkout._id
  });

  return getTenantBillingUrl(`/dashboard?${params.toString()}`, requestOrigin);
}

function formatPlanResponse(plan) {
  return {
    slug: plan.slug,
    name: plan.name,
    price: plan.price,
    bestFor: plan.bestFor,
    checkoutEnabled: plan.checkoutEnabled,
    entitlements: plan.entitlements,
    included: plan.included
  };
}

async function buildSubscriptionResponse(subscription) {
  if (!subscription) {
    return null;
  }

  const plan = await findPlanBySlug(subscription.planSlug);

  return {
    id: subscription._id,
    planSlug: subscription.planSlug,
    planName: plan?.name || subscription.planSlug,
    status: subscription.status,
    provider: subscription.provider,
    billingInterval: subscription.billingInterval,
    currentPeriodStart: subscription.currentPeriodStart,
    currentPeriodEnd: subscription.currentPeriodEnd,
    entitlements: {
      ...(plan?.entitlements || {}),
      ...(subscription.entitlements || {})
    }
  };
}

async function getBillingOverview(tenantId) {
  const plans = await listPlans();
  return {
    plans: plans.map(formatPlanResponse),
    addOns: listAddOns(),
    subscription: tenantId
      ? await buildSubscriptionResponse(await billingRepository.getActiveSubscriptionByTenantId(tenantId))
      : null
  };
}

async function getTenantEntitlements(tenantId) {
  const subscription = tenantId
    ? await billingRepository.getActiveSubscriptionByTenantId(tenantId)
    : null;

  if (subscription?.status === "active" && subscription.entitlements) {
    return subscription.entitlements;
  }

  return getPlanEntitlements("economical");
}

async function createPayMongoCheckout({
  tenant,
  user,
  planSlug,
  billingInterval = "monthly",
  requestOrigin
}) {
  const plan = await findPlanBySlug(planSlug);
  if (!plan) {
    const error = new Error("Unknown subscription plan.");
    error.statusCode = 400;
    throw error;
  }

  if (!plan.checkoutEnabled) {
    const error = new Error("This plan requires a custom quote.");
    error.statusCode = 400;
    throw error;
  }

  if (!env.paymongoSecretKey) {
    const error = new Error("PayMongo is not configured.");
    error.statusCode = 503;
    throw error;
  }

  if (!["monthly", "annual"].includes(billingInterval)) {
    const error = new Error("Unknown billing interval.");
    error.statusCode = 400;
    throw error;
  }

  const amountCents =
    billingInterval === "annual"
      ? plan.price.annualAmountCents
      : plan.price.monthlyAmountCents;

  const checkout = await billingRepository.createCheckoutSession({
    tenantId: tenant._id,
    planSlug: plan.slug,
    provider: PAYMONGO_PROVIDER,
    amountCents,
    currency: plan.price.currency,
    metadata: {
      tenantId: String(tenant._id),
      tenantSlug: tenant.slug,
      planSlug: plan.slug,
      userId: String(user._id),
      billingInterval
    }
  });

  const successUrl = buildCheckoutReturnUrl(checkout, plan, "success", requestOrigin);
  const cancelUrl = buildCheckoutReturnUrl(checkout, plan, "cancelled", requestOrigin);
  const payload = {
    data: {
      attributes: {
        description: `GetPrio ${plan.name} ${billingInterval} subscription for ${tenant.name}`,
        line_items: [
          {
            currency: plan.price.currency,
            amount: amountCents,
            name: `GetPrio ${plan.name}`,
            quantity: 1,
            description: plan.included.join(", ")
          }
        ],
        payment_method_types: env.paymongoPaymentMethodTypes,
        metadata: {
          localCheckoutId: checkout._id,
          tenantId: String(tenant._id),
          tenantSlug: tenant.slug,
          planSlug: plan.slug,
          billingInterval
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
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.errors?.[0]?.detail || data?.errors?.[0]?.code || "Unable to create checkout session.";
    const error = new Error(`PayMongo checkout failed: ${detail}`);
    error.statusCode = 502;
    throw error;
  }

  const attributes = data?.data?.attributes || {};
  const providerCheckoutSessionId = data?.data?.id;
  const checkoutUrl = attributes.checkout_url;

  if (!providerCheckoutSessionId || !checkoutUrl) {
    const error = new Error("PayMongo did not return a checkout URL.");
    error.statusCode = 502;
    throw error;
  }

  const updatedCheckout = await billingRepository.updateCheckoutSessionProviderData(checkout._id, {
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
    checkoutSession: {
      id: updatedCheckout._id,
      provider: PAYMONGO_PROVIDER,
      providerCheckoutSessionId: updatedCheckout.providerCheckoutSessionId,
      checkoutUrl: updatedCheckout.checkoutUrl,
      status: updatedCheckout.status,
      planSlug: updatedCheckout.planSlug,
      billingInterval,
      amountCents: updatedCheckout.amountCents,
      currency: updatedCheckout.currency
    }
  };
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

function parsePayMongoSignature(signatureHeader) {
  return String(signatureHeader || "")
    .split(",")
    .map((part) => part.trim().split("="))
    .reduce((signature, [key, value]) => {
      if (key) {
        signature[key] = value || "";
      }
      return signature;
    }, {});
}

function safeCompare(left, right) {
  const leftBuffer = Buffer.from(left || "", "hex");
  const rightBuffer = Buffer.from(right || "", "hex");

  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function verifyPayMongoWebhook({ rawBody, signatureHeader, livemode }) {
  if (!env.paymongoWebhookSecret) {
    return true;
  }

  const signature = parsePayMongoSignature(signatureHeader);
  const timestamp = signature.t;
  const expectedSignature = livemode ? signature.li : signature.te;

  if (!timestamp || !expectedSignature) {
    return false;
  }

  const signedPayload = `${timestamp}.${rawBody.toString("utf8")}`;
  const digest = crypto
    .createHmac("sha256", env.paymongoWebhookSecret)
    .update(signedPayload)
    .digest("hex");

  return safeCompare(digest, expectedSignature);
}

function getFirstPayment(checkoutSession) {
  const payments = checkoutSession?.attributes?.payments || [];
  return payments[0]?.data || payments[0] || null;
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

async function activateCheckoutSession(checkout, providerCheckoutSessionId, paymentAttributes, providerPaymentId, options = {}) {
  const plan = await findPlanBySlug(checkout.planSlug);
  if (!plan) {
    return {
      missingPlan: true
    };
  }

  await billingRepository.markCheckoutSessionPaid(checkout._id, options);
  const now = new Date();
  const subscription = await billingRepository.activateTenantSubscription(
    {
      tenantId: checkout.tenantId,
      planSlug: plan.slug,
      provider: PAYMONGO_PROVIDER,
      providerCheckoutSessionId,
      billingInterval: checkout.metadata?.billingInterval || "monthly",
      currentPeriodStart: now,
      currentPeriodEnd: addMonths(now, checkout.metadata?.billingInterval === "annual" ? 12 : 1),
      entitlements: plan.entitlements,
      metadata: {
        providerPaymentId,
        paidAt: normalizeProviderTimestamp(paymentAttributes.paid_at),
        amount: paymentAttributes.amount || checkout.amountCents,
        currency: paymentAttributes.currency || checkout.currency
      }
    },
    options
  );

  return {
    subscription: await buildSubscriptionResponse(subscription)
  };
}

async function syncPayMongoCheckout({ tenant, checkoutId }) {
  const checkout = await billingRepository.findCheckoutSessionById(checkoutId);
  if (!checkout || checkout.tenantId !== String(tenant._id)) {
    const error = new Error("Checkout session not found.");
    error.statusCode = 404;
    throw error;
  }

  if (checkout.status === "paid") {
    return {
      synced: true,
      paid: true,
      billing: await getBillingOverview(tenant._id)
    };
  }

  if (!checkout.providerCheckoutSessionId) {
    return {
      synced: false,
      paid: false,
      billing: await getBillingOverview(tenant._id)
    };
  }

  const providerCheckout = await retrievePayMongoCheckout(checkout.providerCheckoutSessionId);
  if (!isPaidPayMongoCheckout(providerCheckout)) {
    return {
      synced: true,
      paid: false,
      billing: await getBillingOverview(tenant._id)
    };
  }

  const payment = getFirstPayment(providerCheckout);
  const paymentAttributes = payment?.attributes || {};
  const providerPaymentId = payment?.id || null;

  const activation = await db.withTransaction(async (client) =>
    activateCheckoutSession(
      checkout,
      providerCheckout.id || checkout.providerCheckoutSessionId,
      paymentAttributes,
      providerPaymentId,
      { client }
    )
  );

  return {
    synced: true,
    paid: Boolean(activation.subscription),
    subscription: activation.subscription || null,
    billing: await getBillingOverview(tenant._id)
  };
}

async function handlePayMongoWebhook(rawBody, signatureHeader) {
  let event;

  try {
    event = JSON.parse(rawBody.toString("utf8"));
  } catch {
    const error = new Error("Invalid webhook payload.");
    error.statusCode = 400;
    throw error;
  }

  const attributes = event?.data?.attributes || {};
  const livemode = Boolean(attributes.livemode);
  if (!verifyPayMongoWebhook({ rawBody, signatureHeader, livemode })) {
    const error = new Error("Invalid PayMongo webhook signature.");
    error.statusCode = 401;
    throw error;
  }

  const eventType = attributes.type;
  const eventId = event?.data?.id;
  const resource = attributes.data || {};

  if (!eventId || !eventType) {
    const error = new Error("PayMongo webhook is missing event metadata.");
    error.statusCode = 400;
    throw error;
  }

  if (eventType !== "checkout_session.payment.paid") {
    await billingRepository.recordBillingEvent({
      provider: PAYMONGO_PROVIDER,
      providerEventId: eventId,
      eventType,
      payload: event
    });

    return {
      ignored: true,
      eventType
    };
  }

  const providerCheckoutSessionId = resource.id;
  const payment = getFirstPayment(resource);
  const paymentAttributes = payment?.attributes || {};
  const providerPaymentId = payment?.id || null;
  const queueJoinPayment = await queueJoinPaymentService.handlePayMongoPaidCheckout(
    resource,
    event
  );

  if (queueJoinPayment.handled) {
    return {
      eventType,
      queueJoinPayment
    };
  }

  return db.withTransaction(async (client) => {
    const checkout = await billingRepository.findCheckoutSessionByProviderId(
      providerCheckoutSessionId,
      { client }
    );

    const eventRecord = await billingRepository.recordBillingEvent(
      {
        provider: PAYMONGO_PROVIDER,
        providerEventId: eventId,
        eventType,
        providerCheckoutSessionId,
        providerPaymentId,
        tenantId: checkout?.tenantId,
        payload: event
      },
      { client }
    );

    if (!eventRecord) {
      return {
        duplicate: true,
        eventType
      };
    }

    if (!checkout) {
      return {
        missingCheckout: true,
        eventType
      };
    }

    if (checkout.status === "paid") {
      return {
        alreadyPaid: true,
        eventType,
        subscription: await buildSubscriptionResponse(
          await billingRepository.getActiveSubscriptionByTenantId(checkout.tenantId, { client })
        )
      };
    }

    const activation = await activateCheckoutSession(
      checkout,
      providerCheckoutSessionId,
      paymentAttributes,
      providerPaymentId,
      { client }
    );

    if (activation.missingPlan) {
      return {
        missingPlan: true,
        eventType
      };
    }

    return {
      eventType,
      subscription: activation.subscription
    };
  });
}

module.exports = {
  getBillingOverview,
  getTenantEntitlements,
  createPayMongoCheckout,
  syncPayMongoCheckout,
  handlePayMongoWebhook
};
