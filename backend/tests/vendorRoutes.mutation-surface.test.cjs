const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const path = require("node:path");

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
    } catch {}
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

async function startServer(router) {
  const app = express();
  app.use(express.json());
  app.use("/api", router);
  app.use((error, _req, res, _next) => {
    console.error(error);
    res.status(error.statusCode || 500).json({ message: error.message || "Unexpected server error." });
  });
  const server = await new Promise((resolve) => {
    const nextServer = app.listen(0, () => resolve(nextServer));
  });
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}/api` };
}

test("vendor routes queue mutations invoke the queue service helpers", async () => {
  const calls = [];
  const router = requireWithMocks("../src/routes/vendorRoutes.js", {
    "../middleware/auth": {
      authenticate: (req, _res, next) => {
        req.user = { _id: "user-1", roles: ["vendor"], tenantMemberships: [{ tenantId: "tenant-1", role: "owner" }] };
        next();
      },
      maybeAuthenticate: (_req, _res, next) => next(),
      userHasTenantAccess: () => true,
      assertTenantPermission: () => {}
    },
    "../repositories/tenants": {
      findTenantBySlug: async () => ({ _id: "tenant-1", slug: "demo" })
    },
    "../repositories/storeLocations": {
      findLocationByTenantAndSlug: async () => ({ _id: "location-1", slug: "main" }),
      findPrimaryLocationByTenantId: async () => ({ _id: "location-1", slug: "main" }),
      listHoursByLocationId: async () => [],
      listLocationsByTenantId: async () => []
    },
    "../services/billingService": {
      getBillingOverview: async () => ({})
    },
    "../services/queueService": {
      createTicket: async () => ({ snapshot: { ok: true } }),
      getQueueSnapshot: async () => ({ ok: true }),
      callNextTicket: async (...args) => {
        calls.push(["callNextTicket", args]);
        return { ticket: { _id: "ticket-1", ticketNumber: "A001", status: "called" }, snapshot: { ok: true } };
      },
      updateCurrentTicketStatus: async (...args) => {
        calls.push(["updateCurrentTicketStatus", args]);
        return { ticket: { _id: "ticket-2", ticketNumber: "A002", status: "served" }, snapshot: { ok: true } };
      },
      closeQueueDay: async () => ({ ok: true }),
      reopenQueueDay: async () => ({ ok: true }),
      pauseQueueDay: async () => ({ ok: true }),
      resumeQueueDay: async () => ({ ok: true }),
      restoreSkippedTicket: async (...args) => {
        calls.push(["restoreSkippedTicket", args]);
        return { ticket: { _id: "ticket-3", ticketNumber: "A003", status: "waiting" }, snapshot: { ok: true } };
      },
      publishSnapshot: async () => {}
    },
    "../services/bookingService": {
      updateVendorBookingStatus: async () => ({ _id: "booking-1", reference: "BKG-1", locationSlug: "main" }),
      createVendorPaymentProofAccess: async () => ({ access: { url: "https://proof.example" } }),
      verifyVendorBookingPayment: async () => ({ _id: "booking-1", reference: "BKG-1", locationSlug: "main" }),
      rejectVendorBookingPayment: async () => ({ _id: "booking-1", reference: "BKG-1", locationSlug: "main" }),
      rescheduleVendorBooking: async () => ({ _id: "booking-1", reference: "BKG-1", locationSlug: "main" }),
      checkInVendorBooking: async () => ({ booking: { _id: "booking-1", reference: "BKG-1", locationSlug: "main" }, ticket: { ticketNumber: "A100" } }),
      markVendorBookingNoShow: async () => ({ _id: "booking-1", reference: "BKG-1", locationSlug: "main" })
    },
    "../repositories/bookings": {
      listBookingsForTenant: async () => ({ bookings: [], totalItems: 0 }),
      findBookingById: async (bookingId) => ({
        _id: String(bookingId),
        reference: "BKG-DETAIL",
        tenantId: "tenant-1",
        tenantName: "Demo Tenant",
        tenantSlug: "demo",
        locationId: "location-1",
        locationName: "Main",
        locationSlug: "main",
        serviceId: "service-1",
        serviceName: "Consultation",
        serviceSlug: "consultation",
        serviceManualPaymentRequired: false,
        servicePriceAmountCents: 0,
        serviceCurrency: "PHP",
        servicePriceDisplay: "Free",
        bookingQuantity: 1,
        customerUserId: null,
        customerName: "Alex",
        customerEmail: "alex@example.com",
        customerPhone: "",
        scheduledStartAt: new Date("2026-06-23T08:00:00.000Z"),
        scheduledEndAt: new Date("2026-06-23T08:30:00.000Z"),
        status: "pending",
        notes: "Test booking",
        paymentReference: "",
        paymentStatus: "unpaid",
        paymentProofObjectKey: null,
        paymentProofFileName: "",
        paymentProofContentType: "",
        paymentProofSizeBytes: null,
        paymentProofUploadedAt: null,
        paymentVerifiedAt: null,
        paymentVerifiedByUserId: null,
        paymentRejectedAt: null,
        paymentRejectedByUserId: null,
        paymentRejectionReason: "",
        pendingExpiresAt: null,
        expiredAt: null,
        expirationReason: "",
        notifyByEmail: true,
        notifyBySms: false,
        smsAlertFeePaymentId: "",
        contactVerifiedAt: null,
        contactVerificationChannel: null,
        queueTicketId: null,
        queueTicketNumber: "",
        queueTicketLookupCode: "",
        queueTicketStatus: null,
        checkedInAt: null,
        checkedInByUserId: null,
        noShowAt: null,
        noShowByUserId: null,
        createdAt: new Date("2026-06-23T08:00:00.000Z"),
        updatedAt: new Date("2026-06-23T08:00:00.000Z")
      })
    },
    "../repositories/vendorServices": { listServicesByTenantId: async () => [] },
    "../repositories/vendorAvailability": { listAvailabilityByLocation: async () => ({ blocks: [], exceptions: [] }) },
    "../repositories/serviceCounters": {
      findCounterByLocationAndSlug: async () => ({ _id: "counter-1", slug: "counter-1", name: "Counter 1" }),
      listCountersByLocation: async () => []
    },
    "../repositories/users": { listUsersByTenantId: async () => [] },
    "../repositories/publicBoardThemes": { getResolvedTheme: async () => ({}) },
    "../services/publicBoardThemeUploadService": { createUpload: async () => ({}) , uploadBinary: async () => ({}) },
    "../services/locationPaymentQrUploadService": { uploadBinary: async () => ({}) },
    "../services/storeHoursService": { getOpenStatus: async () => ({}) },
    "pdfkit": function PDFDocument() {},
    "../utils/pagination": { parsePaginationParams: () => ({ page: 1, pageSize: 10 }), formatPaginationMetadata: () => ({}) }
  });

  const { server, baseUrl } = await startServer(router);
  try {
    const pauseRes = await fetch(`${baseUrl}/tenant/demo/queue/pause?location=main`, { method: "POST" });
    assert.equal(pauseRes.status, 200, await pauseRes.text());

    const callNextRes = await fetch(`${baseUrl}/tenant/demo/queue/call-next?location=main`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ counterSlug: "counter-1" })
    });
    assert.equal(callNextRes.status, 200);

    const restoreRes = await fetch(`${baseUrl}/tenant/demo/queue/tickets/ticket-1/restore?location=main`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lookupCode: "LOOKUP1" })
    });
    assert.equal(restoreRes.status, 200);

    const bookingDetailRes = await fetch(`${baseUrl}/tenant/demo/bookings/booking-1?location=main`);
    const bookingDetailText = await bookingDetailRes.text();
    assert.equal(bookingDetailRes.status, 200, bookingDetailText);
    const bookingDetail = JSON.parse(bookingDetailText);
    assert.equal(bookingDetail.booking.id, "booking-1");
    assert.equal(bookingDetail.booking.reference, "BKG-DETAIL");

    assert.equal(calls.some(([name]) => name === "callNextTicket"), true);
    assert.equal(calls.some(([name]) => name === "restoreSkippedTicket"), true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
