const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const FIXED_NOW = Date.parse("2026-07-05T00:00:00.000Z");
const originalDateNow = Date.now;

test.before(() => {
  Date.now = () => FIXED_NOW;
});

test.after(() => {
  Date.now = originalDateNow;
});

function resolveMockPath(requestPath, baseDir) {
  if (!requestPath.startsWith(".")) {
    return require.resolve(requestPath, { paths: [baseDir] });
  }

  const absoluteBase = path.resolve(baseDir, requestPath);
  const candidates = [
    absoluteBase,
    `${absoluteBase}.js`,
    `${absoluteBase}.ts`,
    path.join(absoluteBase, "index.js"),
    path.join(absoluteBase, "index.ts")
  ];

  for (const candidate of candidates) {
    try {
      return require.resolve(candidate);
    } catch {
      // Try the next candidate.
    }
  }

  throw new Error(`Unable to resolve mock path: ${requestPath}`);
}

function requireWithMocks(targetPath, mocks) {
  const resolvedTarget = require.resolve(targetPath);
  const originals = new Map();

  try {
    for (const [requestPath, mockExports] of Object.entries(mocks)) {
      const resolvedDependency = resolveMockPath(requestPath, path.dirname(resolvedTarget));
      originals.set(resolvedDependency, require.cache[resolvedDependency]);
      require.cache[resolvedDependency] = {
        id: resolvedDependency,
        filename: resolvedDependency,
        loaded: true,
        exports: mockExports
      };
    }

    delete require.cache[resolvedTarget];
    return require(resolvedTarget);
  } finally {
    delete require.cache[resolvedTarget];
    for (const [resolvedDependency, originalEntry] of originals.entries()) {
      if (originalEntry) {
        require.cache[resolvedDependency] = originalEntry;
      } else {
        delete require.cache[resolvedDependency];
      }
    }
  }
}

const tenant = {
  _id: "tenant-1",
  slug: "demo",
  name: "Demo Tenant",
  publicProfileEnabled: true,
  vendorApprovalStatus: "approved"
};

const location = {
  _id: "location-1",
  tenantId: "tenant-1",
  slug: "main",
  name: "Main Branch",
  timezone: "Asia/Manila",
  isActive: true
};

const service = {
  _id: "service-1",
  tenantId: "tenant-1",
  name: "Consultation",
  slug: "consultation",
  durationMinutes: 60,
  allowBookingQuantity: false,
  bookingQuantityLabel: "Units",
  isActive: true
};

function buildBookingService({
  serviceOverride = {},
  servicesBySlug = {},
  locationOverride = {},
  locationServiceOverride = {},
  availability,
  hours = [],
  countOverlappingActiveBookings = async () => 0,
  countOverlappingActiveCapacityHolds = async () => 0,
  expirePendingBookings = async () => [],
  createBooking = async () => ({ _id: "booking-1", reference: "BKG-TEST", customerEmail: "customer@example.com", notifyBySms: false }),
  findBookingById = async () => null,
  findBookingByIdForUpdate = async () => null,
  listBookingsForCheckInReminder,
  markBookingCheckInReminderSent,
  updateBooking = async () => null,
  getVerifiedBookingPayload = async () => ({
    otpId: "booking-otp-1",
    contactVerifiedAt: "2026-07-06T00:30:00.000Z",
    contactVerificationChannel: "email",
    payload: {
      tenantSlug: "demo",
      locationSlug: "main",
      serviceSlug: "consultation",
      scheduledStartAt: "2026-07-06T01:00:00.000Z",
      customerName: "Customer One",
      customerEmail: "customer@example.com",
      customerPhone: "09171234567",
      notifyBySms: false,
      notes: ""
    }
  }),
  getBookingSmsFeeForTenant = async () => ({ enabled: false, amountCents: 0, currency: "PHP", displayAmount: "PHP 0.00", planSlug: "economical" }),
  shouldChargeBookingSmsFee = () => false,
  assertPaidBookingSmsPayment = async () => {},
  createTicketForTenantInTransaction = async () => ({
    _id: "ticket-1",
    ticketNumber: "D001",
    lookupCode: "LOOKUP1",
    status: "waiting"
  }),
  assertQueueIntakeOpen = async () => {},
  maybeNotifyUpcomingTickets = async () => {},
  maybeAutoPauseQueueDay = async () => {},
  publishSnapshot = async () => ({}),
  pushNotificationService = {
    notifyVendorBookingIntake: async () => ({}),
    notifyVendorPaymentProofReview: async () => ({}),
    notifyCustomerBookingUpdate: async () => ({})
  }
}) {
  const queueServiceMock = {
    assertQueueIntakeOpen,
    createTicketForTenantInTransaction,
    maybeNotifyUpcomingTickets,
    maybeAutoPauseQueueDay,
    publishSnapshot
  };
  const bookingService = requireWithMocks("../src/services/bookingService.js", {
    "../config/db": {
      withTransaction: async (callback) => callback({ query: async () => ({ rows: [] }) })
    },
    "../repositories/bookings": {
      createBooking,
      countOverlappingActiveBookings,
      expirePendingBookings,
      findBookingById,
      findBookingByIdForUpdate,
      ...(listBookingsForCheckInReminder ? { listBookingsForCheckInReminder } : {}),
      ...(markBookingCheckInReminderSent ? { markBookingCheckInReminderSent } : {}),
      updateBooking
    },
    "../repositories/groupFundedBookings": {
      countOverlappingActiveCapacityHolds
    },
    "../repositories/tenants": {
      findTenantBySlug: async (slug) => (slug === "demo" ? tenant : null),
      findTenantById: async (id) => (String(id) === String(tenant._id) ? tenant : null)
    },
    "../repositories/storeLocations": {
      findLocationByTenantAndSlug: async (_tenantId, slug) => (slug === "main" ? { ...location, ...locationOverride } : null),
      findLocationById: async (id) => (String(id) === String(location._id) ? { ...location, ...locationOverride } : null),
      listHoursByLocationId: async () => hours
    },
    "../repositories/locationServices": {
      findLocationServiceByLocationAndServiceId: async (_tenantId, _locationId, _serviceId) => ({
        _id: "location-service-1",
        tenantId: tenant._id,
        locationId: location._id,
        serviceId: service._id,
        capacity: 1,
        isActive: true,
        sortOrder: 0,
        priceAmountCents: null,
        priceDisplay: null,
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z",
        ...locationServiceOverride
      })
    },
    "../repositories/vendorServices": {
      normalizeServiceSlug: (value) => String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
      findServiceByTenantAndSlug: async (_tenantId, slug) => {
        if (servicesBySlug[slug]) return servicesBySlug[slug];
        return slug === "consultation" ? { ...service, ...serviceOverride } : null;
      }
    },
    "../repositories/vendorAvailability": {
      listAvailabilityByLocation: async () => availability
    },
    "./bookingOtpService": {
      getVerifiedBookingPayload,
      consumeBookingVerificationToken: async () => {}
    },
    "./bookingSmsAlertPaymentService": {
      getBookingSmsFeeForTenant,
      shouldChargeBookingSmsFee,
      assertPaidBookingSmsPayment
    },
    "./notificationService": {
      sendEmail: async () => {},
      sendSms: async () => {}
    },
    "./pushNotificationService": pushNotificationService,
    "./paymentProofStorageService": {
      assertUploadMetadata: () => {},
      assertObjectKeyBelongsToBooking: (_booking, objectKey) => objectKey,
      createUpload: async ({ booking, body }) => ({
        bookingId: booking._id,
        proof: body
      }),
      uploadBinary: async ({ booking, body, fileBuffer }) => ({
        bookingId: booking._id,
        proof: body,
        fileBufferLength: fileBuffer.length
      }),
      createViewAccess: async ({ booking }) => ({
        bookingId: booking._id,
        objectKey: `payment-proofs/tenants/${booking.tenantId}/bookings/${booking._id}/proof.png`
      })
    },
    "./queueService": queueServiceMock
  });
  bookingService._setQueueServiceForTest(queueServiceMock);
  return bookingService;
}

test("booking slots generate service-duration Asia/Manila starts that fit explicit availability", async () => {
  const bookingService = buildBookingService({
    availability: {
      blocks: [
        {
          _id: "block-1",
          serviceId: "service-1",
          weekday: 1,
          startsAt: "09:00",
          endsAt: "11:00",
          capacity: 2,
          isActive: true
        }
      ],
      exceptions: []
    }
  });

  const slots = await bookingService.listBookingSlots({
    tenantSlug: "demo",
    locationSlug: "main",
    serviceSlug: "consultation",
    date: "2026-07-06"
  });

  assert.deepEqual(slots.map((slot) => slot.startAt), [
    "2026-07-06T01:00:00.000Z",
    "2026-07-06T02:00:00.000Z"
  ]);
  assert.equal(slots.every((slot) => slot.isAvailable && slot.remainingCapacity === 2), true);
});

test("booking slots use the selected service duration as the interval", async () => {
  const bookingService = buildBookingService({
    serviceOverride: {
      durationMinutes: 45
    },
    availability: {
      blocks: [
        {
          _id: "block-1",
          serviceId: "service-1",
          weekday: 1,
          startsAt: "09:00",
          endsAt: "12:00",
          capacity: 2,
          isActive: true
        }
      ],
      exceptions: []
    }
  });

  const slots = await bookingService.listBookingSlots({
    tenantSlug: "demo",
    locationSlug: "main",
    serviceSlug: "consultation",
    date: "2026-07-06"
  });

  assert.deepEqual(
    slots.map((slot) => [slot.startAt, slot.endAt]),
    [
      ["2026-07-06T01:00:00.000Z", "2026-07-06T01:45:00.000Z"],
      ["2026-07-06T01:45:00.000Z", "2026-07-06T02:30:00.000Z"],
      ["2026-07-06T02:30:00.000Z", "2026-07-06T03:15:00.000Z"],
      ["2026-07-06T03:15:00.000Z", "2026-07-06T04:00:00.000Z"]
    ]
  );
});

test("booking slots use booking quantity to set the customer-facing interval", async () => {
  const bookingService = buildBookingService({
    serviceOverride: {
      allowBookingQuantity: true,
      bookingQuantityLabel: "Hours"
    },
    availability: {
      blocks: [
        {
          _id: "block-1",
          serviceId: "service-1",
          weekday: 1,
          startsAt: "09:00",
          endsAt: "13:00",
          capacity: 2,
          isActive: true
        }
      ],
      exceptions: []
    }
  });

  const slots = await bookingService.listBookingSlots({
    tenantSlug: "demo",
    locationSlug: "main",
    serviceSlug: "consultation",
    date: "2026-07-06",
    bookingQuantity: 2
  });

  assert.deepEqual(
    slots.map((slot) => [slot.startAt, slot.endAt]),
    [
      ["2026-07-06T01:00:00.000Z", "2026-07-06T03:00:00.000Z"],
      ["2026-07-06T03:00:00.000Z", "2026-07-06T05:00:00.000Z"]
    ]
  );
});

test("composed slots resolve parallel service intervals only when every court is available", async () => {
  const vipCourt = {
    _id: "service-2", tenantId: "tenant-1", name: "VIP Court", slug: "vip-court",
    durationMinutes: 60, allowBookingQuantity: false, isActive: true
  };
  const bookingService = buildBookingService({
    servicesBySlug: { "vip-court": vipCourt },
    availability: {
      blocks: [
        { _id: "court-1", serviceId: "service-1", weekday: 1, startsAt: "09:00", endsAt: "12:00", capacity: 1, isActive: true },
        { _id: "vip", serviceId: "service-2", weekday: 1, startsAt: "10:00", endsAt: "12:00", capacity: 1, isActive: true }
      ],
      exceptions: []
    }
  });

  const result = await bookingService.evaluateComposedBookingSlots({
    tenantSlug: "demo", locationSlug: "main", date: "2026-07-06", executionMode: "parallel",
    items: [{ serviceSlug: "consultation" }, { serviceSlug: "vip-court" }]
  });

  assert.deepEqual(result.slots.map((slot) => slot.startAt), ["2026-07-06T02:00:00.000Z", "2026-07-06T02:30:00.000Z", "2026-07-06T03:00:00.000Z"]);
  assert.deepEqual(result.slots[0].items.map((item) => [item.serviceSlug, item.startAt, item.endAt]), [
    ["consultation", "2026-07-06T02:00:00.000Z", "2026-07-06T03:00:00.000Z"],
    ["vip-court", "2026-07-06T02:00:00.000Z", "2026-07-06T03:00:00.000Z"]
  ]);
});

test("composed slots resolve sequential salon-service intervals in the requested order", async () => {
  const shave = {
    _id: "service-2", tenantId: "tenant-1", name: "Shave", slug: "shave",
    durationMinutes: 30, allowBookingQuantity: false, isActive: true
  };
  const bookingService = buildBookingService({
    servicesBySlug: { shave },
    availability: {
      blocks: [{ _id: "all", serviceId: null, weekday: 1, startsAt: "09:00", endsAt: "12:00", capacity: 2, isActive: true }],
      exceptions: []
    }
  });

  const result = await bookingService.evaluateComposedBookingSlots({
    tenantSlug: "demo", locationSlug: "main", date: "2026-07-06", executionMode: "sequential",
    items: [{ serviceSlug: "consultation" }, { serviceSlug: "shave" }]
  });

  assert.deepEqual(result.slots[0].items.map((item) => [item.startAt, item.endAt]), [
    ["2026-07-06T01:00:00.000Z", "2026-07-06T02:00:00.000Z"],
    ["2026-07-06T02:00:00.000Z", "2026-07-06T02:30:00.000Z"]
  ]);
  assert.equal(result.slots[0].endAt, "2026-07-06T02:30:00.000Z");
});

test("composed slots reject mixed manual-payment requirements", async () => {
  const manualService = {
    _id: "service-2", tenantId: "tenant-1", name: "Manual", slug: "manual",
    durationMinutes: 30, allowBookingQuantity: false, manualPaymentRequired: true, isActive: true
  };
  const bookingService = buildBookingService({
    servicesBySlug: { manual: manualService },
    locationOverride: {
      paymentQrActive: true,
      paymentMethodLabel: "GCash",
      paymentAccountDisplayName: "Demo account",
      paymentQrImageUrl: "https://example.com/qr.png"
    },
    availability: { blocks: [], exceptions: [] }
  });

  await assert.rejects(
    bookingService.evaluateComposedBookingSlots({
      tenantSlug: "demo", locationSlug: "main", date: "2026-07-06", executionMode: "parallel",
      items: [{ serviceSlug: "consultation" }, { serviceSlug: "manual" }]
    }),
    /same payment requirement/
  );
});

test("booking slots apply unavailable exceptions before available exception windows", async () => {
  const bookingService = buildBookingService({
    availability: {
      blocks: [
        {
          _id: "block-1",
          serviceId: null,
          weekday: 1,
          startsAt: "09:00",
          endsAt: "12:00",
          capacity: 2,
          isActive: true
        }
      ],
      exceptions: [
        {
          serviceId: null,
          exceptionDate: "2026-07-06",
          startsAt: "10:00",
          endsAt: "11:00",
          isAvailable: false,
          capacity: null
        },
        {
          serviceId: "service-1",
          exceptionDate: "2026-07-06",
          startsAt: "13:00",
          endsAt: "14:00",
          isAvailable: true,
          capacity: 1
        }
      ]
    }
  });

  const slots = await bookingService.listBookingSlots({
    tenantSlug: "demo",
    locationSlug: "main",
    serviceSlug: "consultation",
    date: "2026-07-06"
  });

  assert.deepEqual(slots.map((slot) => slot.startAt), [
    "2026-07-06T01:00:00.000Z",
    "2026-07-06T03:00:00.000Z",
    "2026-07-06T05:00:00.000Z"
  ]);
});

test("booking creation rejects a blocked availability exception even when the stored date is a Date object", async () => {
  const bookingService = buildBookingService({
    getVerifiedBookingPayload: async () => ({
      otpId: "booking-otp-1",
      contactVerifiedAt: "2026-07-23T00:30:00.000Z",
      contactVerificationChannel: "email",
      payload: {
        tenantSlug: "demo",
        locationSlug: "main",
        serviceSlug: "consultation",
        scheduledStartAt: "2026-07-23T05:00:00.000Z",
        bookingQuantity: 1,
        customerName: "Customer One",
        customerEmail: "customer@example.com",
        customerPhone: "09171234567",
        notifyBySms: false,
        notes: ""
      }
    }),
    availability: {
      blocks: [
        {
          _id: "block-1",
          serviceId: null,
          weekday: 4,
          startsAt: "09:00",
          endsAt: "17:00",
          capacity: 2,
          isActive: true
        }
      ],
      exceptions: [
        {
          serviceId: null,
          exceptionDate: new Date("2026-07-23T00:00:00.000Z"),
          startsAt: "13:00",
          endsAt: "15:00",
          isAvailable: false,
          capacity: null
        }
      ]
    }
  });

  await assert.rejects(
    () =>
      bookingService.createCustomerBooking({
        user: { _id: "user-1", email: "customer@example.com", name: "Customer One" },
        body: {
          tenantSlug: "demo",
          locationSlug: "main",
          serviceSlug: "consultation",
          scheduledStartAt: "2026-07-23T05:00:00.000Z",
          bookingQuantity: 1,
          customerName: "Customer One",
          customerEmail: "customer@example.com",
          customerPhone: "09171234567",
          bookingVerificationToken: "token"
        }
      }),
    (error) => error.statusCode === 409 && /not available for booking/i.test(error.message)
  );
});

test("booking slots fall back to store hours when no booking availability exists", async () => {
  const bookingService = buildBookingService({
    availability: {
      blocks: [],
      exceptions: []
    },
    hours: [
      { weekday: 1, opensAt: "09:00", closesAt: "10:00", isClosed: false }
    ]
  });

  const slots = await bookingService.listBookingSlots({
    tenantSlug: "demo",
    locationSlug: "main",
    serviceSlug: "consultation",
    date: "2026-07-06"
  });

  assert.deepEqual(slots, [
    {
      startAt: "2026-07-06T01:00:00.000Z",
      endAt: "2026-07-06T02:00:00.000Z",
      remainingCapacity: 1,
      isAvailable: true
    }
  ]);
});

test("group-funded candidate slots use branch business hours and omit a short overnight remainder", async () => {
  const bookingService = buildBookingService({
    availability: { blocks: [], exceptions: [] },
    hours: [{ weekday: 1, opensAt: "22:00", closesAt: "01:00", isClosed: false }]
  });

  const slots = await bookingService.listGroupFundedCandidateSlots({
    tenantSlug: "demo",
    locationSlug: "main",
    date: "2026-07-06"
  });

  assert.equal(slots[0].startAt, "2026-07-06T14:00:00.000Z");
  assert.equal(slots.at(-1).startAt, "2026-07-06T16:00:00.000Z");
});

test("booking slots include both dates of an overnight weekly availability rule", async () => {
  const bookingService = buildBookingService({
    availability: {
      blocks: [
        {
          _id: "block-overnight",
          serviceId: "service-1",
          weekday: 1,
          startsAt: "07:00",
          endsAt: "02:00",
          endsNextDay: true,
          capacity: 1,
          isActive: true
        }
      ],
      exceptions: []
    }
  });

  const mondaySlots = await bookingService.listBookingSlots({
    tenantSlug: "demo",
    locationSlug: "main",
    serviceSlug: "consultation",
    date: "2026-07-06"
  });
  const tuesdaySlots = await bookingService.listBookingSlots({
    tenantSlug: "demo",
    locationSlug: "main",
    serviceSlug: "consultation",
    date: "2026-07-07"
  });

  assert.equal(mondaySlots.at(-1).startAt, "2026-07-06T17:00:00.000Z");
  assert.deepEqual(tuesdaySlots.map((slot) => slot.startAt), [
    "2026-07-06T16:00:00.000Z",
    "2026-07-06T17:00:00.000Z"
  ]);
});

test("booking slots omit past slot starts", async () => {
  const bookingService = buildBookingService({
    availability: {
      blocks: [
        {
          _id: "block-1",
          serviceId: "service-1",
          weekday: 1,
          startsAt: "09:00",
          endsAt: "17:00",
          capacity: 1,
          isActive: true
        }
      ],
      exceptions: []
    }
  });

  const slots = await bookingService.listBookingSlots({
    tenantSlug: "demo",
    locationSlug: "main",
    serviceSlug: "consultation",
    date: "2020-07-06"
  });

  assert.deepEqual(slots, []);
});

test("group-funded slot lookup includes active review holds when requested", async () => {
  const bookingService = buildBookingService({
    availability: {
      blocks: [{ _id: "block-1", serviceId: "service-1", weekday: 1, startsAt: "09:00", endsAt: "10:00", capacity: 1, isActive: true }],
      exceptions: []
    },
    countOverlappingActiveCapacityHolds: async () => 1
  });

  const slots = await bookingService.listBookingSlots({
    tenantSlug: "demo", locationSlug: "main", serviceSlug: "consultation", date: "2026-07-06", includeGroupFundedHolds: true
  });

  assert.equal(slots[0].isAvailable, false);
  assert.equal(slots[0].disabledReason, "capacity_full");
});

test("group-funded service eligibility checks every half-hour branch candidate", async () => {
  const bookingService = buildBookingService({
    availability: {
      blocks: [{
        _id: "block-1",
        serviceId: "service-1",
        weekday: 1,
        startsAt: "07:00",
        endsAt: "02:00",
        endsNextDay: true,
        capacity: 1,
        isActive: true
      }],
      exceptions: []
    },
    serviceOverride: { allowBookingQuantity: true }
  });

  const slots = await bookingService.listBookingSlots({
    tenantSlug: "demo",
    locationSlug: "main",
    serviceSlug: "consultation",
    date: "2026-07-06",
    bookingQuantity: 4,
    includeGroupFundedHolds: true,
    slotIntervalMinutes: 30
  });

  assert.ok(slots.some((slot) => slot.startAt === "2026-07-06T14:00:00.000Z"));
});

test("booking slots subtract active overlapping booking capacity", async () => {
  const bookingService = buildBookingService({
    availability: {
      blocks: [
        {
          _id: "block-1",
          serviceId: "service-1",
          weekday: 1,
          startsAt: "09:00",
          endsAt: "10:00",
          capacity: 1,
          isActive: true
        }
      ],
      exceptions: []
    },
    countOverlappingActiveBookings: async (_tenantId, options) =>
      options.startsAt === "2026-07-06T01:00:00.000Z" ? 1 : 0
  });

  const slots = await bookingService.listBookingSlots({
    tenantSlug: "demo",
    locationSlug: "main",
    serviceSlug: "consultation",
    date: "2026-07-06"
  });

  assert.equal(slots.length, 1);
  assert.equal(slots[0].remainingCapacity, 0);
  assert.equal(slots[0].isAvailable, false);
  assert.equal(slots[0].disabledReason, "capacity_full");
});

test("booking slots count different-duration service overlaps for branch-wide capacity", async () => {
  const capacityChecks = [];
  const existingStart = new Date("2026-07-06T02:00:00.000Z");
  const existingEnd = new Date("2026-07-06T02:30:00.000Z");
  const bookingService = buildBookingService({
    serviceOverride: {
      durationMinutes: 90,
      bookingCapacityScope: "location"
    },
    availability: {
      blocks: [
        {
          _id: "block-1",
          serviceId: null,
          weekday: 1,
          startsAt: "09:00",
          endsAt: "12:00",
          capacity: 1,
          isActive: true
        }
      ],
      exceptions: []
    },
    countOverlappingActiveBookings: async (_tenantId, options) => {
      capacityChecks.push(options);
      if (options.serviceId === null) {
        const candidateStart = new Date(options.startsAt);
        const candidateEnd = new Date(options.endsAt);
        return candidateStart < existingEnd && candidateEnd > existingStart ? 1 : 0;
      }

      return 0;
    }
  });

  const slots = await bookingService.listBookingSlots({
    tenantSlug: "demo",
    locationSlug: "main",
    serviceSlug: "consultation",
    date: "2026-07-06"
  });

  assert.deepEqual(
    slots.map((slot) => [slot.startAt, slot.endAt, slot.isAvailable, slot.remainingCapacity]),
    [
      ["2026-07-06T01:00:00.000Z", "2026-07-06T02:30:00.000Z", false, 0],
      ["2026-07-06T02:30:00.000Z", "2026-07-06T04:00:00.000Z", true, 1]
    ]
  );
  assert.equal(capacityChecks.every((options) => options.serviceId === null), true);
});

test("booking slots keep service-specific court capacity isolated from other services", async () => {
  const capacityChecks = [];
  const existingStart = new Date("2026-07-10T05:00:00.000Z");
  const existingEnd = new Date("2026-07-10T08:00:00.000Z");
  const bookingService = buildBookingService({
    serviceOverride: {
      durationMinutes: 60,
      bookingCapacityScope: "service"
    },
    availability: {
      blocks: [
        {
          _id: "block-1",
          serviceId: "service-1",
          weekday: 5,
          startsAt: "13:00",
          endsAt: "16:00",
          capacity: 1,
          isActive: true
        }
      ],
      exceptions: []
    },
    countOverlappingActiveBookings: async (_tenantId, options) => {
      capacityChecks.push(options);
      return 0;
    }
  });

  const slots = await bookingService.listBookingSlots({
    tenantSlug: "demo",
    locationSlug: "main",
    serviceSlug: "consultation",
    date: "2026-07-10"
  });

  assert.deepEqual(
    slots.map((slot) => [slot.startAt, slot.endAt, slot.isAvailable, slot.remainingCapacity]),
    [
      ["2026-07-10T05:00:00.000Z", "2026-07-10T06:00:00.000Z", true, 1],
      ["2026-07-10T06:00:00.000Z", "2026-07-10T07:00:00.000Z", true, 1],
      ["2026-07-10T07:00:00.000Z", "2026-07-10T08:00:00.000Z", true, 1]
    ]
  );
  assert.equal(capacityChecks.every((options) => options.serviceId === "service-1"), true);
});

test("booking slots treat all-service availability blocks as shared branch capacity", async () => {
  const capacityChecks = [];
  const existingStart = new Date("2026-07-07T05:00:00.000Z");
  const existingEnd = new Date("2026-07-07T06:00:00.000Z");
  const bookingService = buildBookingService({
    serviceOverride: {
      durationMinutes: 30,
      bookingCapacityScope: "service"
    },
    availability: {
      blocks: [
        {
          _id: "block-1",
          serviceId: null,
          weekday: 2,
          startsAt: "13:00",
          endsAt: "15:00",
          capacity: 2,
          isActive: true
        }
      ],
      exceptions: []
    },
    countOverlappingActiveBookings: async (_tenantId, options) => {
      capacityChecks.push(options);
      const candidateStart = new Date(options.startsAt);
      const candidateEnd = new Date(options.endsAt);
      return candidateStart < existingEnd && candidateEnd > existingStart ? 1 : 0;
    }
  });

  const slots = await bookingService.listBookingSlots({
    tenantSlug: "demo",
    locationSlug: "main",
    serviceSlug: "consultation",
    date: "2026-07-07"
  });

  assert.deepEqual(
    slots.slice(0, 3).map((slot) => [slot.startAt, slot.endAt, slot.remainingCapacity]),
    [
      ["2026-07-07T05:00:00.000Z", "2026-07-07T05:30:00.000Z", 1],
      ["2026-07-07T05:30:00.000Z", "2026-07-07T06:00:00.000Z", 1],
      ["2026-07-07T06:00:00.000Z", "2026-07-07T06:30:00.000Z", 2]
    ]
  );
  assert.equal(capacityChecks.every((options) => options.serviceId === null), true);
});

test("service capacity acts as the floor for all-service availability", async () => {
  const bookingService = buildBookingService({
    locationServiceOverride: {
      capacity: 5
    },
    availability: {
      blocks: [
        {
          _id: "block-1",
          serviceId: null,
          weekday: 2,
          startsAt: "13:00",
          endsAt: "14:00",
          capacity: 1,
          isActive: true
        }
      ],
      exceptions: []
    },
    countOverlappingActiveBookings: async () => 0
  });

  const slots = await bookingService.listBookingSlots({
    tenantSlug: "demo",
    locationSlug: "main",
    serviceSlug: "consultation",
    date: "2026-07-07"
  });

  assert.equal(slots[0].remainingCapacity, 5);
});

test("booking slots keep same-service capacity isolated by default", async () => {
  const capacityChecks = [];
  const bookingService = buildBookingService({
    availability: {
      blocks: [
        {
          _id: "block-1",
          serviceId: "service-1",
          weekday: 1,
          startsAt: "09:00",
          endsAt: "10:00",
          capacity: 1,
          isActive: true
        }
      ],
      exceptions: []
    },
    countOverlappingActiveBookings: async (_tenantId, options) => {
      capacityChecks.push(options);
      return 0;
    }
  });

  const slots = await bookingService.listBookingSlots({
    tenantSlug: "demo",
    locationSlug: "main",
    serviceSlug: "consultation",
    date: "2026-07-06"
  });

  assert.equal(slots.length, 1);
  assert.equal(capacityChecks[0].serviceId, "service-1");
});

test("customer booking creation rejects a selected slot when active bookings fill capacity", async () => {
  const bookingService = buildBookingService({
    availability: {
      blocks: [
        {
          _id: "block-1",
          serviceId: "service-1",
          weekday: 1,
          startsAt: "09:00",
          endsAt: "10:00",
          capacity: 1,
          isActive: true
        }
      ],
      exceptions: []
    },
    countOverlappingActiveBookings: async () => 1,
    createBooking: async () => {
      throw new Error("createBooking should not be called");
    }
  });

  await assert.rejects(
    () =>
      bookingService.createCustomerBooking({
        user: {
          _id: "user-1",
          name: "Customer One",
          email: "customer@example.com",
          phone: "09171234567"
        },
        body: {
          tenantSlug: "demo",
          locationSlug: "main",
          serviceSlug: "consultation",
          scheduledStartAt: "2026-07-06T01:00:00.000Z",
          bookingVerificationToken: "verified-token"
        }
      }),
    (error) => error.statusCode === 409 && /slot is no longer available/i.test(error.message)
  );
});

test("customer booking creation rejects branch-wide overlaps from other services", async () => {
  const capacityChecks = [];
  const bookingService = buildBookingService({
    serviceOverride: {
      durationMinutes: 90,
      bookingCapacityScope: "location"
    },
    availability: {
      blocks: [
        {
          _id: "block-1",
          serviceId: null,
          weekday: 1,
          startsAt: "09:00",
          endsAt: "12:00",
          capacity: 1,
          isActive: true
        }
      ],
      exceptions: []
    },
    countOverlappingActiveBookings: async (_tenantId, options) => {
      capacityChecks.push(options);
      return 1;
    },
    createBooking: async () => {
      throw new Error("createBooking should not be called");
    }
  });

  await assert.rejects(
    () =>
      bookingService.createCustomerBooking({
        user: {
          id: "customer-1",
          name: "Customer One",
          email: "customer@example.com",
          phone: "09171234567"
        },
        body: {
          tenantSlug: "demo",
          locationSlug: "main",
          serviceSlug: "consultation",
          scheduledStartAt: "2026-07-06T01:00:00.000Z",
          bookingVerificationToken: "verified-token"
        }
      }),
    (error) => error.statusCode === 409 && /slot is no longer available/i.test(error.message)
  );
  assert.equal(capacityChecks[0].serviceId, null);
  assert.equal(capacityChecks[0].startsAt, "2026-07-06T01:00:00.000Z");
  assert.equal(capacityChecks[0].endsAt, "2026-07-06T02:30:00.000Z");
});

test("customer booking creation blocks manual-payment service when branch QR is inactive", async () => {
  const bookingService = buildBookingService({
    serviceOverride: {
      manualPaymentRequired: true
    },
    locationOverride: {
      paymentQrActive: false,
      paymentMethodLabel: "",
      paymentAccountDisplayName: "",
      paymentQrImageUrl: ""
    },
    availability: {
      blocks: [],
      exceptions: []
    },
    hours: [
      { weekday: 1, opensAt: "09:00", closesAt: "10:00", isClosed: false }
    ],
    createBooking: async () => {
      throw new Error("createBooking should not be called");
    }
  });

  await assert.rejects(
    () =>
      bookingService.createCustomerBooking({
        user: {
          _id: "user-1",
          name: "Customer One",
          email: "customer@example.com",
          phone: "09171234567"
        },
        body: {
          tenantSlug: "demo",
          locationSlug: "main",
          serviceSlug: "consultation",
          scheduledStartAt: "2026-07-06T01:00:00.000Z",
          bookingVerificationToken: "verified-token"
        }
      }),
    (error) => error.statusCode === 409 && /manual payment is not available/i.test(error.message)
  );
});

test("customer booking creation stores quantity and reserves the multiplied service duration", async () => {
  let capturedBooking = null;
  const bookingService = buildBookingService({
    serviceOverride: {
      allowBookingQuantity: true,
      bookingQuantityLabel: "Hours"
    },
    availability: {
      blocks: [
        {
          _id: "block-1",
          serviceId: "service-1",
          weekday: 1,
          startsAt: "09:00",
          endsAt: "12:00",
          capacity: 1,
          isActive: true
        }
      ],
      exceptions: []
    },
    getVerifiedBookingPayload: async () => ({
      otpId: "booking-otp-1",
      contactVerifiedAt: "2026-07-06T00:30:00.000Z",
      contactVerificationChannel: "email",
      payload: {
        tenantSlug: "demo",
        locationSlug: "main",
        serviceSlug: "consultation",
        scheduledStartAt: "2026-07-06T01:00:00.000Z",
        bookingQuantity: 2,
        customerName: "Customer One",
        customerEmail: "customer@example.com",
        customerPhone: "09171234567",
        notifyBySms: false,
        notes: ""
      }
    }),
    createBooking: async (data) => {
      capturedBooking = data;
      return { ...data, _id: "booking-1", reference: "BKG-TEST", notifyBySms: false };
    }
  });

  await bookingService.createCustomerBooking({
    user: {
      _id: "user-1",
      name: "Customer One",
      email: "customer@example.com",
      phone: "09171234567"
    },
    body: {
      tenantSlug: "demo",
      locationSlug: "main",
      serviceSlug: "consultation",
      scheduledStartAt: "2026-07-06T01:00:00.000Z",
      bookingQuantity: 2,
      bookingVerificationToken: "verified-token"
    }
  });

  assert.equal(capturedBooking.bookingQuantity, 2);
  assert.equal(capturedBooking.scheduledStartAt, "2026-07-06T01:00:00.000Z");
  assert.equal(capturedBooking.scheduledEndAt, "2026-07-06T03:00:00.000Z");
  assert.ok(capturedBooking.pendingExpiresAt);
  const pendingExpiresInMinutes = Math.round((new Date(capturedBooking.pendingExpiresAt).getTime() - Date.now()) / 60_000);
  assert.equal(pendingExpiresInMinutes, 15);
});

test("customer booking creation persists a sequential composed timeline from the shared plan", async () => {
  let capturedBooking = null;
  const shave = {
    _id: "service-2", tenantId: "tenant-1", name: "Shave", slug: "shave",
    durationMinutes: 30, allowBookingQuantity: false, isActive: true
  };
  const bookingService = buildBookingService({
    servicesBySlug: { shave },
    availability: {
      blocks: [{ _id: "all", serviceId: null, weekday: 1, startsAt: "09:00", endsAt: "12:00", capacity: 2, isActive: true }],
      exceptions: []
    },
    getVerifiedBookingPayload: async () => ({
      otpId: "booking-otp-1", contactVerifiedAt: "2026-07-06T00:30:00.000Z", contactVerificationChannel: "email",
      payload: {
        tenantSlug: "demo", locationSlug: "main", serviceSlug: "consultation",
        scheduledStartAt: "2026-07-06T01:00:00.000Z", bookingQuantity: 1, executionMode: "sequential",
        bundleItems: [{ serviceSlug: "consultation", bookingQuantity: 1 }, { serviceSlug: "shave", bookingQuantity: 1 }],
        customerName: "Customer One", customerEmail: "customer@example.com", customerPhone: "09171234567", notifyBySms: false, notes: ""
      }
    }),
    createBooking: async (data) => {
      capturedBooking = data;
      return { ...data, _id: "booking-1", reference: "BKG-TEST", notifyBySms: false };
    }
  });

  await bookingService.createCustomerBooking({
    user: { _id: "user-1", name: "Customer One", email: "customer@example.com", phone: "09171234567" },
    body: {
      tenantSlug: "demo", locationSlug: "main", serviceSlug: "consultation",
      scheduledStartAt: "2026-07-06T01:00:00.000Z", executionMode: "sequential",
      bundleItems: [{ serviceSlug: "consultation", bookingQuantity: 1 }, { serviceSlug: "shave", bookingQuantity: 1 }],
      bookingVerificationToken: "verified-token"
    }
  });

  assert.equal(capturedBooking.executionMode, "sequential");
  assert.equal(capturedBooking.serviceId, "service-1");
  assert.equal(capturedBooking.scheduledEndAt, "2026-07-06T02:30:00.000Z");
  assert.deepEqual(capturedBooking.bundleItems.map((item) => [item.serviceSlug, item.scheduledStartAt, item.scheduledEndAt]), [
    ["consultation", "2026-07-06T01:00:00.000Z", "2026-07-06T02:00:00.000Z"],
    ["shave", "2026-07-06T02:00:00.000Z", "2026-07-06T02:30:00.000Z"]
  ]);
});

test("customer booking creation rejects quantity when the service does not allow units", async () => {
  const bookingService = buildBookingService({
    availability: {
      blocks: [
        {
          _id: "block-1",
          serviceId: "service-1",
          weekday: 1,
          startsAt: "09:00",
          endsAt: "12:00",
          capacity: 1,
          isActive: true
        }
      ],
      exceptions: []
    }
  });

  await assert.rejects(
    () =>
      bookingService.createCustomerBooking({
        user: {
          _id: "user-1",
          name: "Customer One",
          email: "customer@example.com",
          phone: "09171234567"
        },
        body: {
          tenantSlug: "demo",
          locationSlug: "main",
          serviceSlug: "consultation",
          scheduledStartAt: "2026-07-06T01:00:00.000Z",
          bookingQuantity: 2,
          bookingVerificationToken: "verified-token"
        }
      }),
    (error) => error.statusCode === 400 && /does not allow booking multiple units/i.test(error.message)
  );
});

test("customer booking creation requires verified booking contact evidence", async () => {
  const bookingService = buildBookingService({
    availability: {
      blocks: [],
      exceptions: []
    },
    hours: [
      { weekday: 1, opensAt: "09:00", closesAt: "10:00", isClosed: false }
    ]
  });

  await assert.rejects(
    () =>
      bookingService.createCustomerBooking({
        user: {
          _id: "user-1",
          name: "Customer One",
          email: "customer@example.com",
          phone: "09171234567"
        },
        body: {
          tenantSlug: "demo",
          locationSlug: "main",
          serviceSlug: "consultation",
          scheduledStartAt: "2026-07-06T01:00:00.000Z"
        }
      }),
    (error) => error.statusCode === 400 && /verification is required/i.test(error.message)
  );
});

test("customer booking creation requires paid SMS fee when SMS alerts are enabled and fee applies", async () => {
  const bookingService = buildBookingService({
    availability: {
      blocks: [],
      exceptions: []
    },
    hours: [
      { weekday: 1, opensAt: "09:00", closesAt: "10:00", isClosed: false }
    ],
    getVerifiedBookingPayload: async () => ({
      otpId: "booking-otp-1",
      contactVerifiedAt: "2026-07-06T00:30:00.000Z",
      contactVerificationChannel: "sms",
      payload: {
        tenantSlug: "demo",
        locationSlug: "main",
        serviceSlug: "consultation",
        scheduledStartAt: "2026-07-06T01:00:00.000Z",
        customerName: "Customer One",
        customerEmail: "customer@example.com",
        customerPhone: "09171234567",
        notifyBySms: true,
        notes: ""
      }
    }),
    getBookingSmsFeeForTenant: async () => ({ enabled: true, amountCents: 5000, currency: "PHP", displayAmount: "PHP 50.00", planSlug: "economical" }),
    shouldChargeBookingSmsFee: () => true,
    assertPaidBookingSmsPayment: async () => {
      const error = new Error("Paid SMS alert payment is required before creating this booking.");
      error.statusCode = 409;
      throw error;
    }
  });

  await assert.rejects(
    () =>
      bookingService.createCustomerBooking({
        user: {
          _id: "user-1",
          name: "Customer One",
          email: "customer@example.com",
          phone: "09171234567"
        },
        body: {
          tenantSlug: "demo",
          locationSlug: "main",
          serviceSlug: "consultation",
          scheduledStartAt: "2026-07-06T01:00:00.000Z",
          bookingVerificationToken: "verified-token"
        }
      }),
    (error) => error.statusCode === 409 && /paid sms alert payment/i.test(error.message)
  );
});

test("vendor reschedule clears linked ticket and check-in state", async () => {
  const updates = [];
  const bookingService = buildBookingService({
    findBookingById: async () => ({
      _id: "booking-1",
      tenantId: "tenant-1",
      locationSlug: "main",
      serviceSlug: "consultation",
      bookingQuantity: 1,
      status: "confirmed",
      scheduledStartAt: "2026-07-06T01:00:00.000Z"
    }),
    updateBooking: async (_id, data) => {
      updates.push(data);
      return { _id: "booking-1", reference: "BKG-1" };
    },
    availability: {
      blocks: [
        {
          _id: "block-1",
          serviceId: "service-1",
          weekday: 1,
          startsAt: "09:00",
          endsAt: "12:00",
          capacity: 1,
          isActive: true
        }
      ],
      exceptions: []
    }
  });

  await bookingService.rescheduleVendorBooking({
    tenant,
    bookingId: "booking-1",
    scheduledStartAt: "2026-07-06T03:00:00.000Z"
  });

  assert.equal(updates.length, 1);
  assert.equal(updates[0].status, "rescheduled");
  assert.equal(updates[0].queueTicketId, null);
  assert.equal(updates[0].checkedInAt, null);
  assert.equal(updates[0].checkedInByUserId, null);
});

test("vendor reschedule slots exclude the current booking from capacity", async () => {
  const capacityChecks = [];
  const bookingService = buildBookingService({
    findBookingById: async () => ({
      _id: "booking-1",
      tenantId: "tenant-1",
      locationSlug: "main",
      serviceSlug: "consultation",
      bookingQuantity: 1,
      status: "confirmed",
      scheduledStartAt: "2026-07-06T01:00:00.000Z"
    }),
    availability: {
      blocks: [
        {
          _id: "block-1",
          serviceId: "service-1",
          weekday: 1,
          startsAt: "09:00",
          endsAt: "10:00",
          capacity: 1,
          isActive: true
        }
      ],
      exceptions: []
    },
    countOverlappingActiveBookings: async (_tenantId, options) => {
      capacityChecks.push(options);
      return 0;
    }
  });

  const slots = await bookingService.listVendorBookingRescheduleSlots({
    tenant,
    bookingId: "booking-1",
    date: "2026-07-06"
  });

  assert.equal(slots.length, 1);
  assert.equal(capacityChecks[0].excludeBookingId, "booking-1");
  assert.equal(capacityChecks[0].serviceId, "service-1");
});

function buildVendorBooking(overrides = {}) {
  const scheduledStartAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const scheduledEndAt = new Date(Date.now() + 55 * 60 * 1000).toISOString();

  return {
    _id: "booking-1",
    reference: "BKG-CHECKIN",
    tenantId: tenant._id,
    tenantName: tenant.name,
    tenantSlug: tenant.slug,
    locationId: location._id,
    locationName: location.name,
    locationSlug: location.slug,
    serviceId: service._id,
    serviceName: service.name,
    serviceSlug: service.slug,
    serviceManualPaymentRequired: false,
    customerUserId: "customer-1",
    customerName: "Customer One",
    customerEmail: "customer@example.com",
    customerPhone: "09171234567",
    scheduledStartAt,
    scheduledEndAt,
    status: "confirmed",
    notes: "",
    paymentReference: "",
    paymentStatus: "unpaid",
    paymentProofObjectKey: "",
    paymentProofFileName: "",
    paymentProofContentType: "",
    paymentProofSizeBytes: null,
    paymentProofUploadedAt: null,
    paymentVerifiedAt: null,
    paymentVerifiedByUserId: null,
    paymentRejectedAt: null,
    paymentRejectedByUserId: null,
    paymentRejectionReason: "",
    notifyByEmail: true,
    notifyBySms: true,
    queueTicketId: null,
    checkedInAt: null,
    checkedInByUserId: null,
    noShowAt: null,
    noShowByUserId: null,
    createdAt: scheduledStartAt,
    updatedAt: scheduledStartAt,
    ...overrides
  };
}

test("vendor check-in creates a checked-in booking queue ticket and links it once", async () => {
  const previousDateNow = Date.now;
  Date.now = () => Date.parse("2026-07-06T01:05:00.000Z");
  try {
    const calls = {
      ticketPayload: null,
      updatedBooking: null,
      intakeChecked: false,
      snapshotPublished: false
    };
    const booking = buildVendorBooking();
    const bookingService = buildBookingService({
      availability: { blocks: [], exceptions: [] },
      findBookingByIdForUpdate: async () => booking,
      updateBooking: async (_bookingId, data) => {
        calls.updatedBooking = data;
        return {
          ...booking,
          ...data,
          queueTicketNumber: "D001",
          queueTicketLookupCode: "LOOKUP1",
          queueTicketStatus: "waiting"
        };
      },
      assertQueueIntakeOpen: async () => {
        calls.intakeChecked = true;
      },
      createTicketForTenantInTransaction: async (_client, payload) => {
        calls.ticketPayload = payload;
        return {
          _id: "ticket-1",
          ticketNumber: "D001",
          lookupCode: "LOOKUP1",
          status: "waiting"
        };
      },
      publishSnapshot: async () => {
        calls.snapshotPublished = true;
        return {};
      }
    });

    const result = await bookingService.checkInVendorBooking({
      tenant,
      location,
      bookingId: "booking-1",
      user: { _id: "vendor-user-1" },
      overrideWindow: true,
      overrideReason: "Unit test override"
    });

    assert.equal(calls.intakeChecked, true);
    assert.equal(calls.snapshotPublished, true);
    assert.equal(calls.ticketPayload.servicePriorityBand, "checked_in_booking");
    assert.equal(calls.ticketPayload.notifyByEmail, true);
    assert.equal(calls.ticketPayload.notifyBySms, true);
    assert.equal(calls.ticketPayload.userId, "customer-1");
    assert.equal(calls.updatedBooking.queueTicketId, "ticket-1");
    assert.equal(calls.updatedBooking.checkedInByUserId, "vendor-user-1");
    assert.equal(result.ticket.ticketNumber, "D001");
    assert.equal(result.booking.linkedTicket, undefined);
  } finally {
    Date.now = previousDateNow;
  }
});

test("vendor check-in rejects duplicate linked bookings", async () => {
  const bookingService = buildBookingService({
    availability: { blocks: [], exceptions: [] },
    findBookingByIdForUpdate: async () => buildVendorBooking({
      queueTicketId: "ticket-1",
      checkedInAt: new Date().toISOString()
    })
  });

  await assert.rejects(
    () =>
      bookingService.checkInVendorBooking({
        tenant,
        location,
        bookingId: "booking-1",
        user: { _id: "vendor-user-1" }
      }),
    (error) => error.statusCode === 409 && /already been checked in/i.test(error.message)
  );
});

test("vendor check-in requires late override outside the check-in window", async () => {
  const bookingService = buildBookingService({
    availability: { blocks: [], exceptions: [] },
    findBookingByIdForUpdate: async () => buildVendorBooking({
      scheduledStartAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      scheduledEndAt: new Date(Date.now() + 30 * 60 * 1000).toISOString()
    })
  });

  await assert.rejects(
    () =>
      bookingService.checkInVendorBooking({
        tenant,
        location,
        bookingId: "booking-1",
        user: { _id: "vendor-user-1" },
        overrideWindow: false
      }),
    (error) => error.statusCode === 409 && /late check-in override/i.test(error.message)
  );
});

test("check-in window stays at fifteen minutes around the scheduled time", async () => {
  const bookingService = buildBookingService({});
  const windowState = bookingService._getCheckInWindowState({
    scheduledStartAt: "2026-07-05T06:00:00.000Z",
    serviceManualPaymentRequired: true,
    locationTimezone: "Asia/Manila"
  }, new Date("2026-07-05T05:44:00.000Z"));

  assert.equal(windowState.isTooEarly, true);
  assert.equal(windowState.isLate, false);
  assert.equal(windowState.isWithinWindow, false);
});

test("vendor no-show cancels late confirmed booking and records actor", async () => {
  const booking = buildVendorBooking({
    scheduledStartAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    scheduledEndAt: new Date(Date.now() + 30 * 60 * 1000).toISOString()
  });
  let updatedBooking;
  const bookingService = buildBookingService({
    availability: { blocks: [], exceptions: [] },
    findBookingById: async () => booking,
    updateBooking: async (_bookingId, data) => {
      updatedBooking = data;
      return { ...booking, ...data };
    }
  });

  const result = await bookingService.markVendorBookingNoShow({
    tenant,
    location,
    bookingId: "booking-1",
    user: { _id: "vendor-user-1" }
  });

  assert.equal(updatedBooking.status, "canceled");
  assert.equal(updatedBooking.noShowByUserId, "vendor-user-1");
  assert.equal(result.status, "canceled");
});

test("vendor payment verification marks submitted proof as paid with actor audit", async () => {
  const booking = buildVendorBooking({
    status: "pending",
    paymentStatus: "pending",
    paymentProofObjectKey: "payment-proofs/tenants/tenant-1/bookings/booking-1/proof.jpg"
  });
  let updatedBooking;
  const bookingService = buildBookingService({
    availability: { blocks: [], exceptions: [] },
    findBookingById: async () => booking,
    updateBooking: async (_bookingId, data) => {
      updatedBooking = data;
      return { ...booking, ...data };
    }
  });

  const result = await bookingService.verifyVendorBookingPayment({
    tenant,
    bookingId: "booking-1",
    user: { _id: "vendor-user-1" }
  });

  assert.equal(updatedBooking.paymentStatus, "paid");
  assert.equal(updatedBooking.paymentVerifiedByUserId, "vendor-user-1");
  assert.equal(updatedBooking.paymentRejectedAt, null);
  assert.equal(result.paymentStatus, "paid");
});

test("vendor payment verification sends a customer payment-verified push", async () => {
  const booking = buildVendorBooking({
    status: "pending",
    paymentStatus: "pending",
    paymentProofObjectKey: "payment-proofs/tenants/tenant-1/bookings/booking-1/proof.jpg"
  });
  const pushedActions = [];
  const bookingService = buildBookingService({
    availability: { blocks: [], exceptions: [] },
    findBookingById: async () => booking,
    updateBooking: async (_bookingId, data) => ({ ...booking, ...data }),
    pushNotificationService: {
      notifyVendorBookingIntake: async () => ({}),
      notifyVendorPaymentProofReview: async () => ({}),
      notifyCustomerBookingUpdate: async ({ action }) => {
        pushedActions.push(action);
        return { attempted: 1, sent: 1 };
      }
    }
  });

  await bookingService.verifyVendorBookingPayment({
    tenant,
    bookingId: "booking-1",
    user: { _id: "vendor-user-1" }
  });

  assert.deepEqual(pushedActions, ["payment_verified"]);
});

test("pending booking expiration sends customer push notifications", async () => {
  const expiredBooking = buildVendorBooking({
    status: "canceled",
    expiredAt: "2026-07-03T02:00:00.000Z"
  });
  const pushedActions = [];
  const bookingService = buildBookingService({
    availability: { blocks: [], exceptions: [] },
    expirePendingBookings: async () => ["booking-1"],
    findBookingById: async () => expiredBooking,
    pushNotificationService: {
      notifyVendorBookingIntake: async () => ({}),
      notifyVendorPaymentProofReview: async () => ({}),
      notifyCustomerBookingUpdate: async ({ action }) => {
        pushedActions.push(action);
        return { attempted: 1, sent: 1 };
      }
    }
  });

  const expired = await bookingService.expirePendingBookingsForTenant("tenant-1");

  assert.deepEqual(expired, ["booking-1"]);
  assert.deepEqual(pushedActions, ["pending_expired"]);
});

test("check-in reminder scan sends opening and closing customer pushes once", async () => {
  const marked = [];
  const pushedActions = [];
  const windowBooking = buildVendorBooking({ _id: "booking-window" });
  const closingBooking = buildVendorBooking({ _id: "booking-closing" });
  const bookingService = buildBookingService({
    availability: { blocks: [], exceptions: [] },
    listBookingsForCheckInReminder: async ({ type }) =>
      type === "closing" ? [closingBooking] : [windowBooking],
    markBookingCheckInReminderSent: async (bookingId, type) => {
      marked.push([bookingId, type]);
    },
    pushNotificationService: {
      notifyVendorBookingIntake: async () => ({}),
      notifyVendorPaymentProofReview: async () => ({}),
      notifyCustomerBookingUpdate: async ({ action }) => {
        pushedActions.push(action);
        return { attempted: 1, sent: 1 };
      }
    }
  });

  await bookingService.notifyDueCheckInReminderBookings({ tenantId: "tenant-1" });

  assert.deepEqual(pushedActions, ["check_in_window_open", "check_in_closing"]);
  assert.deepEqual(marked, [
    ["booking-window", "window"],
    ["booking-closing", "closing"]
  ]);
});

test("customer payment proof submission notifies vendor reviewers when enabled", async () => {
  const notifications = [];
  const booking = buildVendorBooking({
    customerUserId: "customer-1",
    status: "pending",
    serviceManualPaymentRequired: true,
    paymentStatus: "unpaid",
    paymentProofObjectKey: ""
  });
  const updatedBooking = {
    ...booking,
    paymentReference: "REF-123",
    paymentStatus: "pending",
    paymentProofObjectKey: "payment-proofs/tenants/tenant-1/bookings/booking-1/proof.jpg",
    paymentProofFileName: "proof.jpg",
    paymentProofContentType: "image/jpeg",
    paymentProofSizeBytes: 1024,
    paymentProofUploadedAt: "2026-07-03T02:00:00.000Z"
  };
  const bookingService = buildBookingService({
    availability: { blocks: [], exceptions: [] },
    findBookingById: async () => booking,
    updateBooking: async () => updatedBooking,
    pushNotificationService: {
      notifyVendorBookingIntake: async () => ({}),
      notifyVendorPaymentProofReview: async (input) => {
        notifications.push(input);
        return { attempted: 1, sent: 1 };
      },
      notifyCustomerBookingUpdate: async () => ({})
    }
  });

  const result = await bookingService.submitCustomerPaymentProof({
    user: { _id: "customer-1" },
    bookingId: "booking-1",
    body: {
      paymentReference: "REF-123",
      objectKey: "payment-proofs/tenants/tenant-1/bookings/booking-1/proof.jpg",
      fileName: "proof.jpg",
      contentType: "image/jpeg",
      sizeBytes: 1024
    }
  });

  assert.equal(result.paymentStatus, "pending");
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].tenant._id, "tenant-1");
  assert.equal(notifications[0].booking._id, "booking-1");
});

test("vendor payment rejection cancels booking and requires customer-visible reason", async () => {
  const booking = buildVendorBooking({
    status: "pending",
    paymentStatus: "pending",
    paymentProofObjectKey: "payment-proofs/tenants/tenant-1/bookings/booking-1/proof.jpg"
  });
  let updatedBooking;
  const bookingService = buildBookingService({
    availability: { blocks: [], exceptions: [] },
    findBookingById: async () => booking,
    updateBooking: async (_bookingId, data) => {
      updatedBooking = data;
      return { ...booking, ...data };
    }
  });

  await assert.rejects(
    () =>
      bookingService.rejectVendorBookingPayment({
        tenant,
        bookingId: "booking-1",
        user: { _id: "vendor-user-1" },
        reason: ""
      }),
    (error) => error.statusCode === 400 && /rejection reason/i.test(error.message)
  );

  const result = await bookingService.rejectVendorBookingPayment({
    tenant,
    bookingId: "booking-1",
    user: { _id: "vendor-user-1" },
    reason: "Reference number does not match the receipt."
  });

  assert.equal(updatedBooking.status, "canceled");
  assert.equal(updatedBooking.paymentStatus, "failed");
  assert.equal(updatedBooking.paymentRejectedByUserId, "vendor-user-1");
  assert.equal(updatedBooking.paymentRejectionReason, "Reference number does not match the receipt.");
  assert.equal(result.status, "canceled");
});

test("vendor cannot confirm booking while submitted payment proof is awaiting verification", async () => {
  const bookingService = buildBookingService({
    availability: { blocks: [], exceptions: [] },
    findBookingById: async () => buildVendorBooking({
      status: "pending",
      paymentStatus: "pending",
      paymentProofObjectKey: "payment-proofs/tenants/tenant-1/bookings/booking-1/proof.jpg"
    })
  });

  await assert.rejects(
    () =>
      bookingService.updateVendorBookingStatus({
        tenant,
        bookingId: "booking-1",
        status: "confirmed"
      }),
    (error) => error.statusCode === 409 && /verified before/i.test(error.message)
  );
});

test("booking payment proof helpers require ownership and accept submission payloads", async () => {
  const bookingService = buildBookingService({
    findBookingById: async (bookingId) =>
      bookingId === "booking-1"
        ? {
            _id: "booking-1",
            customerUserId: "user-1",
            tenantId: "tenant-1",
            locationId: "location-1",
            serviceManualPaymentRequired: true,
            locationPaymentQrActive: true,
            status: "pending",
            customerEmail: "customer@example.com",
            customerPhone: "09171234567",
            tenantName: "Demo Tenant",
            reference: "BKG-TEST"
          }
        : null,
    updateBooking: async (_bookingId, data) => ({
      _id: "booking-1",
      customerUserId: "user-1",
      tenantId: "tenant-1",
      locationId: "location-1",
      serviceManualPaymentRequired: true,
      locationPaymentQrActive: true,
      status: "pending",
      customerEmail: "customer@example.com",
      customerPhone: "09171234567",
      tenantName: "Demo Tenant",
      reference: "BKG-TEST",
      ...data
    })
  });

  await assert.rejects(
    () =>
      bookingService.createCustomerPaymentProofUpload({
        user: { _id: "user-2" },
        bookingId: "booking-1",
        body: { fileName: "proof.png", contentType: "image/png", sizeBytes: 10 }
      }),
    (error) => error.statusCode === 404
  );

  const upload = await bookingService.createCustomerPaymentProofUpload({
    user: { _id: "user-1" },
    bookingId: "booking-1",
    body: { fileName: "proof.png", contentType: "image/png", sizeBytes: 10 }
  });
  assert.equal(upload.proof.fileName, "proof.png");

  const submitted = await bookingService.submitCustomerPaymentProof({
    user: { _id: "user-1" },
    bookingId: "booking-1",
    body: {
      paymentReference: "GCASH-123",
      objectKey: "payment-proofs/tenants/tenant-1/bookings/booking-1/proof.png",
      fileName: "proof.png",
      contentType: "image/png",
      sizeBytes: 10
    }
  });
  assert.equal(submitted.paymentReference, "GCASH-123");
  assert.equal(submitted.paymentStatus, "pending");
});

test("booking payment proof helpers reject services that do not require manual payment", async () => {
  const bookingService = buildBookingService({
    findBookingById: async () => ({
      _id: "booking-1",
      customerUserId: "user-1",
      tenantId: "tenant-1",
      locationId: "location-1",
      serviceManualPaymentRequired: false,
      locationPaymentQrActive: true,
      status: "pending",
      customerEmail: "customer@example.com",
      customerPhone: "09171234567",
      tenantName: "Demo Tenant",
      reference: "BKG-TEST"
    })
  });

  await assert.rejects(
    () =>
      bookingService.createCustomerPaymentProofUpload({
        user: { _id: "user-1" },
        bookingId: "booking-1",
        body: { fileName: "proof.png", contentType: "image/png", sizeBytes: 10 }
      }),
    (error) => error.statusCode === 409
  );
});

test("booking payment proof helpers reject group-funded bookings", async () => {
  const bookingService = buildBookingService({
    findBookingById: async () => ({
      _id: "booking-1",
      customerUserId: "user-1",
      tenantId: "tenant-1",
      locationId: "location-1",
      serviceManualPaymentRequired: true,
      locationPaymentQrActive: true,
      status: "confirmed",
      bookingPaymentSource: "group_funded",
      groupFundedBookingId: "campaign-1",
      customerEmail: "customer@example.com",
      customerPhone: "09171234567",
      tenantName: "Demo Tenant",
      reference: "BKG-TEST"
    })
  });

  await assert.rejects(
    () =>
      bookingService.submitCustomerPaymentProof({
        user: { _id: "user-1" },
        bookingId: "booking-1",
        body: {
          paymentReference: "GCASH-123",
          objectKey: "payment-proofs/tenants/tenant-1/bookings/booking-1/proof.png",
          fileName: "proof.png",
          contentType: "image/png",
          sizeBytes: 10
        }
      }),
    (error) => error.statusCode === 409 && /group-funded/i.test(error.message)
  );
});
