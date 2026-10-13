require("tsx/cjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  serviceQuantityError,
  dateExceptionPayload,
} = require("../src/vendor/serviceConfigurationState.ts");

test("service quantity settings preserve the configurable ceiling while rejecting impossible minimum bookings", () => {
  const service = {
    allowBookingQuantity: true,
    durationMinutes: 120,
    bookingQuantityMin: 2,
    bookingQuantityMax: 24,
  };
  assert.equal(serviceQuantityError(service), "");
  for (const fields of [
    { bookingQuantityMin: 0 },
    { bookingQuantityMax: 25 },
    { bookingQuantityMax: 1.5 },
    { bookingQuantityMax: 1 },
    { bookingQuantityMin: 13 },
  ]) {
    assert.notEqual(serviceQuantityError({ ...service, ...fields }), "");
  }
  assert.equal(
    serviceQuantityError({ ...service, allowBookingQuantity: false }),
    "",
  );
});

test("whole-day exception blocks every service while partial exceptions preserve blank capacity and exact local date", () => {
  const form = {
    serviceSlug: "court-a",
    exceptionDate: "2026-10-14",
    startsAt: "10:00",
    endsAt: "12:00",
    capacity: null,
    isAvailable: true,
    reason: "Maintenance",
    locationSlug: "old",
  };
  assert.deepEqual(dateExceptionPayload(form, false, "main"), {
    ...form,
    locationSlug: "main",
  });
  assert.deepEqual(dateExceptionPayload(form, true, "main"), {
    ...form,
    startsAt: "",
    endsAt: "",
    isAvailable: false,
    serviceSlug: "",
    locationSlug: "main",
  });
  assert.equal(form.startsAt, "10:00");
  assert.equal(
    dateExceptionPayload({ ...form, capacity: 3 }, false, "main").capacity,
    3,
  );
});

test("service status mutation retains saved unit bounds and service settings in the scoped catalog request", async () => {
  const fs = require("node:fs"),
    vm = require("node:vm"),
    ts = require("typescript");
  const source = fs.readFileSync(
    require("node:path").join(
      __dirname,
      "../src/pages/VendorDashboardPage.tsx",
    ),
    "utf8",
  );
  const start = source.indexOf("  async function handleToggleServiceActive("),
    end = source.indexOf("  async function handleDeleteService", start);
  const service = {
    id: "court-id",
    slug: "court",
    name: "Court",
    durationMinutes: 60,
    allowBookingQuantity: true,
    bookingQuantityLabel: "Hours",
    bookingQuantityMin: 2,
    bookingQuantityMax: 5,
    manualPaymentRequired: true,
    bookingCapacityScope: "location",
    priceAmountCents: 50000,
    priceDisplay: "PHP 500/hour",
    sortOrder: 3,
  };
  const calls = [];
  const context = {
    token: "fixture",
    selectedTenantSlug: "sports",
    setBusyAction() {},
    setError() {},
    setServices() {},
    reloadBookings: async () => {},
    showSuccessNotification() {},
    vendorDashboardCatalog: {
      saveService: async (...args) => {
        calls.push(args);
        return { service: { ...service, isActive: false } };
      },
    },
  };
  const fn = vm.runInNewContext(
    ts.transpileModule(
      source.slice(start, end) + "\nhandleToggleServiceActive;",
      { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
    ).outputText,
    context,
  );
  await fn(service, false);
  assert.deepEqual(calls[0].slice(0, 3), ["fixture", "sports", "court"]);
  const body = calls[0][3];
  for (const key of [
    "bookingQuantityMin",
    "bookingQuantityMax",
    "bookingQuantityLabel",
    "durationMinutes",
    "priceAmountCents",
    "manualPaymentRequired",
    "bookingCapacityScope",
  ])
    assert.equal(body[key], service[key]);
  assert.equal(body.isActive, false);
});

test("opening and saving an existing service-specific date-only block preserves its service scope", () => {
  const fs = require("node:fs"),
    vm = require("node:vm"),
    ts = require("typescript");
  const source = fs.readFileSync(
    require("node:path").join(
      __dirname,
      "../src/pages/VendorDashboardPage.tsx",
    ),
    "utf8",
  );
  const start = source.indexOf("  function openAvailabilityExceptionDialog("),
    end = source.indexOf(
      "  async function handleSaveAvailabilityException",
      start,
    );
  const context = {
    selectedLocationSlug: "main",
    serviceSlugById: new Map([["court-id", "court-a"]]),
    formatDateInputValue: (value) => value,
    setError() {},
    setEditingAvailabilityExceptionId() {},
    setAvailabilityExceptionDialogOpen() {},
    setAvailabilityExceptionForm(value) {
      context.form = value;
    },
    setAvailabilityExceptionBlockEntireDay(value) {
      context.wholeDay = value;
    },
  };
  const open = vm.runInNewContext(
    ts.transpileModule(
      source.slice(start, end) + "\nopenAvailabilityExceptionDialog;",
      { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
    ).outputText,
    context,
  );
  const exception = {
    id: "existing",
    serviceId: "court-id",
    exceptionDate: "2026-10-14",
    startsAt: null,
    endsAt: null,
    isAvailable: false,
    capacity: null,
    reason: "Court maintenance",
  };
  open(exception);
  assert.equal(context.wholeDay, false);
  const saved = dateExceptionPayload(
    { ...context.form, reason: "Updated reason" },
    context.wholeDay,
    "main",
  );
  assert.equal(saved.serviceSlug, "court-a");
  assert.equal(saved.isAvailable, false);
  assert.equal(saved.startsAt, "");
  assert.equal(saved.endsAt, "");
  open({ ...exception, serviceId: null });
  assert.equal(context.wholeDay, true);
  assert.equal(
    dateExceptionPayload(context.form, context.wholeDay, "main").serviceSlug,
    "",
  );
});
