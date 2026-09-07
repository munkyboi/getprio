const test = require("node:test");
const assert = require("node:assert/strict");

const helpers = require("../src/routes/vendorRouteHelpers");
const { resolveMobileQrBaseUrl } = require("../src/config/env");

test("vendor route helpers normalize tenant and location data", async () => {
  const tenantRepository = {
    async findTenantBySlug() {
      return { _id: 10, slug: "tenant" };
    }
  };
  const userHasTenantAccess = () => true;

  const tenant = await helpers.getAuthorizedTenant({ id: 1 }, "Tenant", tenantRepository, userHasTenantAccess);
  assert.equal(tenant._id, 10);

  await assert.rejects(
    () => helpers.getAuthorizedTenant({ id: 1 }, "Tenant", { findTenantBySlug: async () => null }, userHasTenantAccess),
    (error) => error.statusCode === 404
  );

  await assert.rejects(
    () =>
      helpers.getAuthorizedTenant({ id: 1 }, "Tenant", tenantRepository, () => false),
    (error) => error.statusCode === 403
  );
});

test("vendor route helpers normalize payloads and format entities", async () => {
  const location = {
    _id: 5,
    tenantId: 10,
    queueJoinId: "123e4567-e89b-42d3-a456-426614174000",
    name: "Main",
    slug: "main",
    addressLine1: "A",
    addressLine2: "B",
    city: "City",
    province: "Province",
    postalCode: "1234",
    country: "PH",
    contactEmail: "x@example.com",
    contactPhone: "123",
    timezone: "Asia/Manila",
    paymentMethodLabel: "QR",
    paymentAccountDisplayName: "Display",
    paymentAccountIdentifierDisplay: "ID",
    paymentQrImageUrl: "/qr.png",
    paymentQrActive: true,
    isPrimary: true,
    isActive: true
  };

  const storeLocations = require("../src/repositories/storeLocations");
  const hours = require("../src/services/storeHoursService");
  storeLocations.listHoursByLocationId = async () => [{ weekday: 1, opensAt: "08:00", closesAt: "17:00", isClosed: false }];
  hours.getOpenStatus = async () => ({ isOpen: true, summary: "Open" });

  const formatted = await helpers.formatLocation(location, { slug: "tenant" });
  assert.equal(formatted.slug, "main");
  assert.equal(formatted.hours.length, 1);
  assert.match(
    formatted.qrJoinUrl,
    /^https:\/\/[^/]+\/join\/tenant\/main\?source=qr&id=123e4567-e89b-42d3-a456-426614174000$/
  );

  assert.equal(helpers.normalizeTenantNotificationSettings({ bookingIntake: false }).bookingIntake, false);
  assert.equal(helpers.normalizeTenantNotificationSettings({ queueJoin: false }).queueJoin, false);
  assert.equal(helpers.normalizeTenantNotificationSettings({}).queueJoin, true);
  assert.equal(helpers.normalizeCounterSlug("Front Desk"), "front-desk");
  assert.equal(helpers.buildPriceDisplay(1234), "₱12.34");

  const normalizedLocation = helpers.normalizeLocationPayload({
    name: "  Branch  ",
    paymentQrActive: false
  });
  assert.equal(normalizedLocation.name, "Branch");

  const normalizedService = helpers.normalizeServicePayload({
    name: "  Cut  ",
    durationMinutes: 30,
    bookingCapacityScope: "location",
    priceAmountCents: 500
  });
  assert.equal(normalizedService.name, "Cut");
  assert.equal(normalizedService.slug, "cut");
  assert.equal(normalizedService.bookingCapacityScope, "location");

  assert.throws(
    () => helpers.normalizeLocationPayload({ name: "gago branch" }),
    /Location name contains language/
  );
  assert.throws(
    () => helpers.normalizeServicePayload({
      name: "Cut",
      description: "yawa",
      durationMinutes: 30,
      priceAmountCents: 500
    }),
    /Service description contains language/
  );

  assert.throws(
    () =>
      helpers.normalizeServicePayload({
        name: "Cut",
        durationMinutes: 30,
        bookingCapacityScope: "staff",
        priceAmountCents: 500
      }),
    /bookingCapacityScope must be service or location/
  );

  const formattedService = helpers.formatVendorService({ _id: 1, tenantId: 10, name: "Cut", slug: "cut", bookingCapacityScope: "location" });
  assert.equal(formattedService.slug, "cut");
  assert.equal(formattedService.bookingCapacityScope, "location");
});

test("vendor route helpers build mobile queue QR links from the dedicated HTTPS origin", () => {
  const links = helpers.buildLocationLinks(
    {
      slug: "main",
      queueJoinId: "123e4567-e89b-42d3-a456-426614174000"
    },
    { slug: "tenant" },
    {
      appBaseUrl: "http://localhost:5173/",
      mobileQrBaseUrl: "https://192.168.1.22:5173/"
    }
  );

  assert.deepEqual(links, {
    joinUrl: "http://localhost:5173/join/tenant/main",
    qrJoinUrl:
      "https://192.168.1.22:5173/join/tenant/main?source=qr&id=123e4567-e89b-42d3-a456-426614174000",
    monitorUrl: "http://localhost:5173/monitor/tenant/main"
  });
});

test("mobile queue QR configuration requires a path-free HTTPS origin", () => {
  assert.equal(
    resolveMobileQrBaseUrl(
      { MOBILE_QR_BASE_URL: "https://192.168.1.22:5173/" },
      "http://localhost:5173",
      5173
    ),
    "https://192.168.1.22:5173"
  );
  assert.equal(
    resolveMobileQrBaseUrl({ NODE_ENV: "development" }, "http://localhost:5173", 5173),
    "https://localhost:5173"
  );
  assert.throws(
    () =>
      resolveMobileQrBaseUrl(
        { MOBILE_QR_BASE_URL: "http://192.168.1.22:5173" },
        "http://localhost:5173",
        5173
      ),
    /MOBILE_QR_BASE_URL must be an HTTPS origin/
  );
  assert.throws(
    () =>
      resolveMobileQrBaseUrl(
        { MOBILE_QR_BASE_URL: "https://getprio.example/mobile" },
        "http://localhost:5173",
        5173
      ),
    /MOBILE_QR_BASE_URL must be an HTTPS origin/
  );
});

test("vendor route helpers normalize group-funded location service settings", () => {
  const disabled = helpers.normalizeGroupFundedLocationServicePayload({});
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.allowPublicCampaigns, false);

  const enabled = helpers.normalizeGroupFundedLocationServicePayload({
    groupFunded: {
      enabled: true,
      minRequiredContributors: 2,
      maxRequiredContributors: 8,
      defaultRequiredContributors: 7,
      minContributionAmountCents: 10000,
      maxContributionAmountCents: 200000,
      minDeadlineHours: 24,
      maxDeadlineDays: 7,
      allowPublicCampaigns: true
    }
  });

  assert.deepEqual(enabled, {
    enabled: true,
    minRequiredContributors: 2,
    maxRequiredContributors: 8,
    defaultRequiredContributors: 4,
    minContributionAmountCents: null,
    maxContributionAmountCents: null,
    minDeadlineHours: 24,
    maxDeadlineDays: 7,
    allowPublicCampaigns: true
  });

  const clampedDefault = helpers.normalizeGroupFundedLocationServicePayload({
    groupFunded: {
      enabled: true,
      minRequiredContributors: 5,
      maxRequiredContributors: 8,
      defaultRequiredContributors: 4,
      minDeadlineHours: 24,
      maxDeadlineDays: 7
    }
  });
  assert.equal(clampedDefault.defaultRequiredContributors, 5);

  assert.throws(
    () =>
      helpers.normalizeGroupFundedLocationServicePayload({
        groupFunded: {
          enabled: true,
          minRequiredContributors: 2,
          maxRequiredContributors: 8,
          defaultRequiredContributors: 4,
          minDeadlineHours: 200,
          maxDeadlineDays: 7
        }
      }),
    /deadline bounds/
  );

  const ignoredShareBounds = helpers.normalizeGroupFundedLocationServicePayload({
    groupFunded: {
      enabled: true,
      minRequiredContributors: 2,
      maxRequiredContributors: 8,
      defaultRequiredContributors: 4,
      minContributionAmountCents: 200000,
      maxContributionAmountCents: 10000,
      minDeadlineHours: 24,
      maxDeadlineDays: 7
    }
  });
  assert.equal(ignoredShareBounds.minContributionAmountCents, null);
  assert.equal(ignoredShareBounds.maxContributionAmountCents, null);
});
