const test = require("node:test");
const assert = require("node:assert/strict");

const helpers = require("../src/routes/vendorRouteHelpers");

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
