#!/usr/bin/env node

const API_BASE_URL = process.env.SMOKE_API_URL || process.env.VITE_API_URL || "http://localhost:5001/api";
const APP_BASE_URL = process.env.SMOKE_APP_URL || process.env.APP_BASE_URL || "http://localhost:5173";
const PLATFORM_BASE_URL = process.env.SMOKE_PLATFORM_URL || process.env.PLATFORM_BASE_URL || "http://localhost:7100";

const SMOKE_EMAIL = process.env.SMOKE_EMAIL || "carlo.abella+store4@gmail.com";
const SMOKE_PASSWORD = process.env.SMOKE_PASSWORD || "asdfasdf";
const PLATFORM_SMOKE_EMAIL = process.env.PLATFORM_SMOKE_EMAIL || "getprio-smoke@getprio.local";
const PLATFORM_SMOKE_PASSWORD = process.env.PLATFORM_SMOKE_PASSWORD || "Smoke1234!";
const CAMPAIGN_SMOKE_ENABLED = ["1", "true", "yes"].includes(
  String(process.env.SMOKE_ORGANIZER_CAMPAIGN || process.env.SMOKE_GROUP_FUNDED || "").toLowerCase()
);

function getCliStage() {
  const index = process.argv.indexOf("--stage");
  if (index !== -1 && process.argv[index + 1]) {
    return String(process.argv[index + 1]).toLowerCase();
  }

  const stageArg = process.argv.find((arg) => arg.startsWith("--stage="));
  if (stageArg) {
    return String(stageArg.split("=", 2)[1] || "").toLowerCase();
  }

  return "";
}

const SMOKE_STAGE = getCliStage() || String(process.env.SMOKE_STAGE || "all").toLowerCase();

const publicPages = [
  { path: "/", label: "landing" },
  { path: "/vendors", label: "vendor discovery" },
  { path: "/login", label: "login" },
  { path: "/register/customer", label: "customer register" },
  { path: "/register/vendor", label: "vendor register" },
  { path: "/privacy-policy", label: "privacy policy" },
  { path: "/terms", label: "terms" },
  { path: "/contact", label: "contact" }
];

const customerPages = [
  { path: "/account/profile", label: "customer profile" },
  { path: "/account/tickets", label: "customer tickets" },
  { path: "/account/bookings", label: "customer bookings" },
  { path: "/account/campaigns", label: "customer campaigns" },
  { path: "/account/campaigns/discover", label: "campaign discovery" },
  { path: "/account/settings", label: "customer settings" },
  { path: "/account/notifications", label: "customer notifications" },
  { path: "/account/security", label: "customer security" }
];

const platformPages = [
  { path: "/overview", label: "platform overview" },
  { path: "/queue-fees", label: "platform queue fees" },
  { path: "/plans", label: "platform plans" },
  { path: "/settings", label: "platform settings" },
  { path: "/tenants", label: "platform tenants" },
  { path: "/subscriptions", label: "platform subscriptions" },
  { path: "/users", label: "platform users" },
  { path: "/billing-events", label: "platform billing events" },
  { path: "/campaign-reports", label: "platform campaign reports" },
  { path: "/rating-disputes", label: "platform rating disputes" }
];

function log(message) {
  process.stdout.write(`${message}\n`);
}

function fail(message) {
  throw new Error(message);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  return { response, body, text };
}

async function requestText(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "text/html"
    }
  });
  const text = await response.text();
  return { response, text };
}

function assertOk(response, context) {
  if (!response.ok) {
    fail(`${context} failed with HTTP ${response.status}`);
  }
}

function assertContains(text, needle, context) {
  if (!text.includes(needle)) {
    fail(`${context} missing expected content: ${needle}`);
  }
}

async function login(email, password) {
  const result = await requestJson(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email, password })
  });

  assertOk(result.response, "login");
  if (!result.body?.token || !result.body?.user) {
    fail("login response missing token or user");
  }

  return result.body;
}

async function smokePublicStage() {
  const health = await requestJson(`${API_BASE_URL}/health`);
  assertOk(health.response, "backend health");
  if (health.body?.status !== "ok") {
    fail("backend health did not report ok");
  }
  log("backend health ok");

  const providers = await requestJson(`${API_BASE_URL}/auth/oauth/providers`);
  assertOk(providers.response, "oauth providers");
  if (!providers.body || typeof providers.body.providers !== "object") {
    fail("oauth providers response missing providers map");
  }
  log("oauth provider metadata ok");

  const vapid = await requestJson(`${API_BASE_URL}/push/vapid-public-key`);
  assertOk(vapid.response, "web push vapid metadata");
  if (!vapid.body || typeof vapid.body.configured !== "boolean" || typeof vapid.body.publicKey !== "string") {
    fail("web push vapid metadata missing configured/publicKey fields");
  }
  log("web push vapid metadata ok");

  for (const page of publicPages) {
    const { response, text } = await requestText(`${APP_BASE_URL}${page.path}`);
    assertOk(response, `${page.label} page`);
    assertContains(text, "<div id=\"root\">", `${page.label} page`);
    if (page.path === "/") {
      assertContains(text, "href=\"/manifest.webmanifest\"", "landing metadata");
      assertContains(text, "href=\"/apple-touch-icon.png\"", "landing metadata");
      assertContains(text, "property=\"og:image\"", "landing metadata");
      assertContains(text, "name=\"twitter:card\"", "landing metadata");
    }
    log(`${page.label} page ok`);
  }

  const serviceWorker = await requestText(`${APP_BASE_URL}/service-worker.js`);
  assertOk(serviceWorker.response, "web push service worker");
  assertContains(serviceWorker.text, "self.addEventListener(\"push\"", "web push service worker");
  assertContains(serviceWorker.text, "notificationclick", "web push service worker");
  log("web push service worker ok");

  const manifest = await requestJson(`${APP_BASE_URL}/manifest.webmanifest`);
  assertOk(manifest.response, "web app manifest");
  if (manifest.body?.name !== "GetPrio" || !Array.isArray(manifest.body?.icons)) {
    fail("web app manifest missing name or icons");
  }
  for (const iconSrc of ["/app-icon-192.png", "/app-icon-512.png"]) {
    if (!manifest.body.icons.some((icon) => icon?.src === iconSrc && icon?.type === "image/png")) {
      fail(`web app manifest missing icon: ${iconSrc}`);
    }
  }
  log("web app manifest ok");

  const platform = await requestText(PLATFORM_BASE_URL);
  assertOk(platform.response, "platform dashboard shell");
  assertContains(platform.text, "<div id=\"root\">", "platform dashboard shell");
  log("platform dashboard shell ok");
}

async function smokeCustomerStage() {
  if (!SMOKE_EMAIL || !SMOKE_PASSWORD) {
    log("customer smoke skipped (set SMOKE_EMAIL and SMOKE_PASSWORD to enable)");
    return;
  }

  const auth = await login(SMOKE_EMAIL, SMOKE_PASSWORD);
  const headers = { Authorization: `Bearer ${auth.token}` };

  const accountOverview = await requestJson(`${API_BASE_URL}/account/overview`, { headers });
  assertOk(accountOverview.response, "account overview");
  if (!accountOverview.body?.user) {
    fail("account overview missing user payload");
  }
  log("account overview ok");

  const authMe = await requestJson(`${API_BASE_URL}/auth/me`, { headers });
  assertOk(authMe.response, "auth me");
  if (!authMe.body?.user) {
    fail("auth me missing user payload");
  }
  log("auth me ok");

  const notificationSettingsBefore = await requestJson(`${API_BASE_URL}/account/notification-settings`, { headers });
  assertOk(notificationSettingsBefore.response, "notification settings read");
  if (!notificationSettingsBefore.body?.notificationSettings) {
    fail("notification settings read missing payload");
  }
  if (
    typeof notificationSettingsBefore.body.notificationSettings.bookingAlerts !== "boolean" ||
    typeof notificationSettingsBefore.body.notificationSettings.queueAlerts !== "boolean"
  ) {
    fail("notification settings read missing Web Push status booleans");
  }
  log("notification settings read ok");

  const notificationSettingsUpdate = await requestJson(`${API_BASE_URL}/account/notification-settings`, {
    method: "PATCH",
    headers: {
      ...headers,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      bookingAlerts: Boolean(notificationSettingsBefore.body.notificationSettings.bookingAlerts),
      queueAlerts: !Boolean(notificationSettingsBefore.body.notificationSettings.queueAlerts)
    })
  });
  assertOk(notificationSettingsUpdate.response, "notification settings update");
  if (!notificationSettingsUpdate.body?.notificationSettings) {
    fail("notification settings update missing payload");
  }
  log("notification settings update ok");

  const notificationSettingsRestore = await requestJson(`${API_BASE_URL}/account/notification-settings`, {
    method: "PATCH",
    headers: {
      ...headers,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(notificationSettingsBefore.body.notificationSettings)
  });
  assertOk(notificationSettingsRestore.response, "notification settings restore");
  log("notification settings restore ok");

  const bookings = await requestJson(`${API_BASE_URL}/account/bookings?page=1&pageSize=1`, { headers });
  assertOk(bookings.response, "account bookings");
  if (!Array.isArray(bookings.body?.bookings)) {
    fail("account bookings missing bookings array");
  }
  if (!bookings.body?.pagination || typeof bookings.body.pagination.page !== "number") {
    fail("account bookings missing pagination metadata");
  }
  log("account bookings ok");

  for (const page of customerPages) {
    const { response, text } = await requestText(`${APP_BASE_URL}${page.path}`);
    assertOk(response, `${page.label} page`);
    assertContains(text, "<div id=\"root\">", `${page.label} page`);
    log(`${page.label} page ok`);
  }
}

async function smokeBookingStage() {
  if (!SMOKE_EMAIL || !SMOKE_PASSWORD) {
    log("booking smoke skipped (set SMOKE_EMAIL and SMOKE_PASSWORD to enable)");
    return;
  }

  const auth = await login(SMOKE_EMAIL, SMOKE_PASSWORD);
  const headers = { Authorization: `Bearer ${auth.token}` };

  const vendorSlug = process.env.SMOKE_BOOKING_VENDOR_SLUG || auth.user.tenants?.[0]?.slug || "musashi-pastries";
  const tenantProfile = await requestJson(`${API_BASE_URL}/public/vendors/${vendorSlug}`);
  assertOk(tenantProfile.response, "public vendor profile for booking smoke");
  const vendor = tenantProfile.body?.vendor;
  const firstLocationSlug = vendor?.location?.slug || vendor?.locations?.[0]?.slug;
  const firstServiceSlug = vendor?.services?.[0]?.slug;
  if (!vendor?.slug || !firstLocationSlug || !firstServiceSlug) {
    fail("public vendor profile missing slug, location, or service for booking smoke");
  }
  log("public vendor profile ok");

  const bookingSmsFee = await requestJson(`${API_BASE_URL}/public/vendors/${vendor.slug}/booking-sms-fee`);
  assertOk(bookingSmsFee.response, "booking sms fee");
  if (!bookingSmsFee.body || !Object.prototype.hasOwnProperty.call(bookingSmsFee.body, "queueFee")) {
    fail("booking sms fee missing queueFee");
  }
  log("booking sms fee ok");

  const bookingSlots = await requestJson(
    `${API_BASE_URL}/public/vendors/${vendor.slug}/locations/${firstLocationSlug}/services/${firstServiceSlug}/slots?date=${new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}&bookingQuantity=1`
  );
  assertOk(bookingSlots.response, "booking slots");
  if (!Array.isArray(bookingSlots.body?.slots)) {
    fail("booking slots response missing slots array");
  }
  log("booking slots ok");

  const otpRequest = await requestJson(`${API_BASE_URL}/public/vendors/${vendor.slug}/booking-otp`, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      tenantSlug: vendor.slug,
      locationSlug: firstLocationSlug,
      serviceSlug: firstServiceSlug,
      scheduledStartAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      bookingQuantity: 1,
      customerName: auth.user.name || "Smoke User",
      customerEmail: auth.user.email,
      customerPhone: auth.user.phone || "",
      notes: "smoke-test booking otp",
      channel: "email"
    })
  });
  assertOk(otpRequest.response, "booking otp request");
  if (!otpRequest.body?.otpId || !otpRequest.body?.deliveryChannel) {
    fail("booking otp request missing otp metadata");
  }
  log("booking otp request ok");
}

async function smokeVendorStage() {
  if (!SMOKE_EMAIL || !SMOKE_PASSWORD) {
    log("vendor smoke skipped (set SMOKE_EMAIL and SMOKE_PASSWORD to enable)");
    return;
  }

  const auth = await login(SMOKE_EMAIL, SMOKE_PASSWORD);
  const tenant = Array.isArray(auth.user.tenants) ? auth.user.tenants[0] : null;
  if (!tenant?.slug) {
    log("authenticated vendor smoke skipped (no tenant membership on the smoke account)");
    return;
  }

  const headers = { Authorization: `Bearer ${auth.token}` };
  const locations = await requestJson(`${API_BASE_URL}/vendor/tenant/${tenant.slug}/locations`, { headers });
  assertOk(locations.response, "vendor locations");
  const locationSlug = locations.body?.locations?.[0]?.slug;
  if (!locationSlug) {
    fail("vendor locations did not return a usable location slug");
  }
  log("vendor locations ok");

  const dashboard = await requestJson(
    `${API_BASE_URL}/vendor/tenant/${tenant.slug}/dashboard?location=${encodeURIComponent(locationSlug)}`,
    { headers }
  );
  assertOk(dashboard.response, "vendor dashboard snapshot");
  if (!dashboard.body || typeof dashboard.body !== "object") {
    fail("vendor dashboard snapshot returned no data");
  }
  log("vendor dashboard snapshot ok");

  const staff = await requestJson(`${API_BASE_URL}/vendor/tenant/${tenant.slug}/staff`, { headers });
  assertOk(staff.response, "vendor staff");
  if (!Array.isArray(staff.body?.staff)) {
    fail("vendor staff missing staff array");
  }
  log("vendor staff ok");

  const vendorNotificationSettings = await requestJson(
    `${API_BASE_URL}/vendor/tenant/${tenant.slug}/notification-settings`,
    { headers }
  );
  assertOk(vendorNotificationSettings.response, "vendor notification settings");
  if (
    typeof vendorNotificationSettings.body?.notificationSettings?.queueJoin !== "boolean" ||
    typeof vendorNotificationSettings.body?.notificationSettings?.bookingIntake !== "boolean" ||
    typeof vendorNotificationSettings.body?.notificationSettings?.paymentProofReview !== "boolean"
  ) {
    fail("vendor notification settings missing Web Push status booleans");
  }
  log("vendor notification settings ok");

  const services = await requestJson(`${API_BASE_URL}/vendor/tenant/${tenant.slug}/services`, { headers });
  assertOk(services.response, "vendor services");
  if (!Array.isArray(services.body?.services)) {
    fail("vendor services missing services array");
  }
  if (
    services.body.services.length > 0 &&
    !services.body.services.every((service) => ["service", "location"].includes(service.bookingCapacityScope))
  ) {
    fail("vendor services missing valid bookingCapacityScope values");
  }
  log("vendor services ok");

  const availability = await requestJson(
    `${API_BASE_URL}/vendor/tenant/${tenant.slug}/availability?location=${encodeURIComponent(locationSlug)}`,
    { headers }
  );
  assertOk(availability.response, "vendor availability");
  if (!Array.isArray(availability.body?.blocks) || !Array.isArray(availability.body?.exceptions)) {
    fail("vendor availability missing blocks or exceptions arrays");
  }
  log("vendor availability ok");

  const bookings = await requestJson(
    `${API_BASE_URL}/vendor/tenant/${tenant.slug}/bookings?page=1&pageSize=1&location=${encodeURIComponent(locationSlug)}`,
    { headers }
  );
  assertOk(bookings.response, "vendor bookings");
  if (!Array.isArray(bookings.body?.bookings)) {
    fail("vendor bookings missing bookings array");
  }
  log("vendor bookings ok");

  const firstBookingId = bookings.body.bookings[0]?.id;
  if (firstBookingId) {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const rescheduleSlots = await requestJson(
      `${API_BASE_URL}/vendor/tenant/${tenant.slug}/bookings/${firstBookingId}/reschedule-slots?date=${tomorrow}`,
      { headers }
    );
    if (rescheduleSlots.response.status === 409) {
      log("vendor booking reschedule slots skipped (fixture booking is not reschedulable)");
      return;
    }
    assertOk(rescheduleSlots.response, "vendor booking reschedule slots");
    if (!Array.isArray(rescheduleSlots.body?.slots)) {
      fail("vendor booking reschedule slots missing slots array");
    }
    log("vendor booking reschedule slots ok");
  } else {
    log("vendor booking reschedule slots skipped (no vendor booking fixture)");
  }
}

async function smokeOrganizerCampaignStage() {
  if (!CAMPAIGN_SMOKE_ENABLED) {
    log("organizer campaign smoke skipped (set SMOKE_ORGANIZER_CAMPAIGN=1 to enable)");
    return;
  }
  if (!SMOKE_EMAIL || !SMOKE_PASSWORD) {
    log("organizer campaign smoke skipped (set SMOKE_EMAIL and SMOKE_PASSWORD to enable)");
    return;
  }

  const auth = await login(SMOKE_EMAIL, SMOKE_PASSWORD);
  const headers = { Authorization: `Bearer ${auth.token}` };
  const bookingId = process.env.SMOKE_ORGANIZER_CAMPAIGN_BOOKING_ID;
  if (!bookingId) {
    log("organizer campaign smoke skipped (set SMOKE_ORGANIZER_CAMPAIGN_BOOKING_ID to an owned paid/confirmed opt-in booking)");
    return;
  }
  const deadlineAt = process.env.SMOKE_ORGANIZER_CAMPAIGN_DEADLINE_AT || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const createCampaign = await requestJson(`${API_BASE_URL}/account/campaigns`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      bookingId, title: `Organizer campaign smoke ${Date.now()}`,
      description: "Private organizer-collected campaign smoke fixture",
      deadlineAt, contributionFeeCents: 10000, requiredContributors: 2,
      paymentInstructions: "Smoke-only direct organizer payment instructions"
    })
  });
  assertOk(createCampaign.response, "organizer campaign creation");
  const campaign = createCampaign.body?.campaign;
  if (!campaign?.id || !campaign?.publicToken) fail("organizer campaign creation missing id or generic share token");
  log("organizer campaign creation ok");

  const publish = await requestJson(`${API_BASE_URL}/account/campaigns/${campaign.id}/publish`, { method: "PATCH", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ visibility: "private_link" }) });
  assertOk(publish.response, "organizer campaign private publication");
  log("organizer campaign private publication ok");
  const preview = await requestJson(`${API_BASE_URL}/public/campaigns/${campaign.publicToken}`);
  assertOk(preview.response, "organizer campaign privacy-minimized preview");
  if ("paymentInstructions" in (preview.body?.campaign || {})) fail("public campaign preview leaked payment instructions");
  log("organizer campaign privacy-minimized preview ok");

  const legacyAccount = await requestJson(`${API_BASE_URL}/account/group-funded-campaigns`, { headers });
  if (legacyAccount.response.status !== 410) fail("legacy customer campaign API was not retired");
  const tenant = Array.isArray(auth.user.tenants) ? auth.user.tenants[0] : null;
  if (tenant?.slug) {
    const legacyVendor = await requestJson(`${API_BASE_URL}/vendor/tenant/${tenant.slug}/group-funded-campaigns`, { headers });
    if (legacyVendor.response.status !== 404) fail("legacy vendor campaign API was not retired");
  }
  log("legacy campaign APIs retired ok");
}

async function smokePlatformStage() {
  const platformAuth = await login(PLATFORM_SMOKE_EMAIL, PLATFORM_SMOKE_PASSWORD);
  const platformHeaders = { Authorization: `Bearer ${platformAuth.token}` };

  const platformOverview = await requestJson(`${API_BASE_URL}/platform/overview`, { headers: platformHeaders });
  assertOk(platformOverview.response, "platform overview api");
  if (!platformOverview.body?.totals) {
    fail("platform overview api missing totals");
  }
  log("platform overview api ok");

  const platformPlans = await requestJson(`${API_BASE_URL}/platform/plans`, { headers: platformHeaders });
  assertOk(platformPlans.response, "platform plans api");
  if (!Array.isArray(platformPlans.body?.plans)) {
    fail("platform plans api missing plans array");
  }
  log("platform plans api ok");

  const platformQueueFees = await requestJson(`${API_BASE_URL}/platform/queue-fees`, { headers: platformHeaders });
  assertOk(platformQueueFees.response, "platform queue fees api");
  if (!Array.isArray(platformQueueFees.body?.queueFees)) {
    fail("platform queue fees api missing queueFees array");
  }
  log("platform queue fees api ok");

  const platformSettings = await requestJson(`${API_BASE_URL}/platform/settings`, { headers: platformHeaders });
  assertOk(platformSettings.response, "platform settings api");
  if (!platformSettings.body?.settings) {
    fail("platform settings api missing settings");
  }
  log("platform settings api ok");

  for (const page of platformPages) {
    const { response, text } = await requestText(`${PLATFORM_BASE_URL}${page.path}`);
    assertOk(response, `${page.label} page`);
    assertContains(text, "<div id=\"root\">", `${page.label} page`);
    log(`${page.label} page ok`);
  }
}

async function main() {
  log(`api=${API_BASE_URL}`);
  log(`app=${APP_BASE_URL}`);
  log(`platform=${PLATFORM_BASE_URL}`);
  log(`stage=${SMOKE_STAGE}`);

  if (SMOKE_STAGE === "all" || SMOKE_STAGE === "public") {
    await smokePublicStage();
  }
  if (SMOKE_STAGE === "all" || SMOKE_STAGE === "customer") {
    await smokeCustomerStage();
  }
  if (SMOKE_STAGE === "all" || SMOKE_STAGE === "booking") {
    await smokeBookingStage();
  }
  if (SMOKE_STAGE === "all" || SMOKE_STAGE === "vendor") {
    await smokeVendorStage();
  }
  if (SMOKE_STAGE === "all" || SMOKE_STAGE === "campaign" || SMOKE_STAGE === "group-funded") {
    await smokeOrganizerCampaignStage();
  }
  if (SMOKE_STAGE === "all" || SMOKE_STAGE === "platform") {
    await smokePlatformStage();
  }

  log("smoke checks completed");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
