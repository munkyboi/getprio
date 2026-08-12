const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const fs = require("node:fs");
const path = require("node:path");

test("vendor entitlements endpoint supports role-safe navigation without exposing billing", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/routes/vendorRoutes.js"), "utf8");
  assert.match(
    source,
    /"\/tenant\/:tenantSlug\/entitlements"[\s\S]*?"tenant\.queue\.read"[\s\S]*?getTenantEntitlements\(tenant\._id\)/
  );
  assert.doesNotMatch(
    source.match(/"\/tenant\/:tenantSlug\/entitlements"[\s\S]*?\n\);/)?.[0] || "",
    /getBillingOverview/
  );
});

test("default profile theme saves do not fall back to the primary location", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/routes/vendorRoutes.js"), "utf8");
  assert.match(
    source,
    /const requestedLocationSlug = normalizeRequestText\(req\.query\.location\);\s+const location = requestedLocationSlug\s+\? await getLocationForTenant\(tenant, requestedLocationSlug\)\s+: null;/
  );
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
    "../services/storeHoursService": {
      assertLocationOpenForCustomerJoin: async () => {
        calls.push(["assertLocationOpenForCustomerJoin"]);
      }
    },
    "../services/queueService": {
      createTicket: async () => ({ ticket: { _id: "ticket-1", ticketNumber: "A001", lookupCode: "LOOKUP1", status: "waiting" }, snapshot: { ok: true } }),
      getQueueSnapshot: async () => ({ ok: true }),
      openQueueDay: async (...args) => {
        calls.push(["openQueueDay", args]);
        return { ok: true };
      },
      extendQueueDay: async (...args) => {
        calls.push(["extendQueueDay", args]);
        return { ok: true };
      },
      callNextTicket: async (...args) => {
        calls.push(["callNextTicket", args]);
        return { ticket: { _id: "ticket-1", ticketNumber: "A001", status: "called" }, snapshot: { ok: true } };
      },
      confirmCurrentTicket: async (...args) => {
        calls.push(["confirmCurrentTicket", args]);
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
      listVendorBookingRescheduleSlots: async ({ tenant, bookingId, date }) => {
        calls.push(["listVendorBookingRescheduleSlots", [tenant, bookingId, date]]);
        return [
          {
            startAt: "2026-06-24T01:00:00.000Z",
            endAt: "2026-06-24T01:30:00.000Z",
            remainingCapacity: 1,
            isAvailable: true
          }
        ];
      },
      checkInVendorBooking: async () => ({ booking: { _id: "booking-1", reference: "BKG-1", locationSlug: "main" }, ticket: { ticketNumber: "A100" } }),
      markVendorBookingNoShow: async () => ({ _id: "booking-1", reference: "BKG-1", locationSlug: "main" })
    },
    "../services/groupFundedBookingService": {
      rejectContribution: async (payload) => {
        calls.push(["rejectContribution", [payload]]);
        return {
          campaign: {
            _id: "campaign-1",
            tenantId: "tenant-1",
            locationId: "location-1",
            serviceId: "service-1",
            organizerUserId: "user-1",
            campaignStatus: "vendor_review",
            visibility: "private_link",
            serviceNameSnapshot: "Consultation",
            locationNameSnapshot: "Main",
            scheduledStartAt: "2026-07-14T01:00:00.000Z",
            scheduledEndAt: "2026-07-14T02:00:00.000Z",
            fundingDeadlineAt: "2026-07-13T01:00:00.000Z",
            targetAmountCents: 10000,
            requiredContributionAmountCents: 5000,
            requiredContributors: 2,
            paidParticipantCount: 2,
            fundedAmountCents: 10000,
            fundedAt: "2026-07-12T01:00:00.000Z"
          },
          contribution: {
            _id: "contribution-1",
            campaignId: "campaign-1",
            userId: "user-2",
            amountCents: 5000,
            currency: "PHP",
            contributionStatus: "refund_pending",
            paymentReference: "REF-1",
            refundStatus: "pending"
          },
          refund: {
            _id: "refund-1",
            campaignId: "campaign-1",
            contributionId: "contribution-1",
            userId: "user-2",
            amountCents: 5000,
            currency: "PHP",
            refundReason: "excess_contribution",
            refundStatus: "pending",
            notes: "Payment received after target.",
            completedAt: null,
            createdAt: "2026-07-12T01:00:00.000Z",
            updatedAt: "2026-07-12T01:00:00.000Z"
          }
        };
      }
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
        groupFundedBookingId: null,
        bookingPaymentSource: "standard",
        groupFundedCampaign: null,
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
    "../repositories/groupFundedBookings": {
      listCampaignItemsByCampaign: async (campaignId) => {
        assert.equal(campaignId, "campaign-1");
        return [
          {
            _id: "campaign-item-1",
            serviceId: "service-1",
            serviceNameSnapshot: "Court 1",
            serviceSlugSnapshot: "court-1",
            bookingQuantity: 3,
            priceAmountCents: 30000,
            currency: "PHP",
            executionMode: "parallel",
            scheduledStartAt: "2026-06-23T08:00:00.000Z",
            scheduledEndAt: "2026-06-23T11:00:00.000Z",
            sortOrder: 0
          }
        ];
      }
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
    "../services/storeHoursService": {
      getOpenStatus: async () => ({}),
      assertLocationOpenForCustomerJoin: async () => {
        calls.push(["assertLocationOpenForCustomerJoin"]);
      }
    },
    "pdfkit": function PDFDocument() {},
    "../utils/pagination": { parsePaginationParams: () => ({ page: 1, pageSize: 10 }), formatPaginationMetadata: () => ({}) }
  });

  const { server, baseUrl } = await startServer(router);
  try {
    const openRes = await fetch(`${baseUrl}/tenant/demo/queue/open?location=main`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedVersion: 1 })
    });
    assert.equal(openRes.status, 200, await openRes.text());

    const walkInRes = await fetch(`${baseUrl}/tenant/demo/tickets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locationSlug: "main", customerName: "Jane Doe" })
    });
    assert.equal(walkInRes.status, 201, await walkInRes.text());

    const extendRes = await fetch(`${baseUrl}/tenant/demo/queue/extend?location=main`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        expectedVersion: 2,
        reason: "serve_remaining_customers"
      })
    });
    assert.equal(extendRes.status, 200, await extendRes.text());

    const pauseRes = await fetch(`${baseUrl}/tenant/demo/queue/pause?location=main`, { method: "POST" });
    assert.equal(pauseRes.status, 200, await pauseRes.text());

    const callNextRes = await fetch(`${baseUrl}/tenant/demo/queue/call-next?location=main`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ counterSlug: "counter-1" })
    });
    assert.equal(callNextRes.status, 200);

    const confirmCurrentRes = await fetch(`${baseUrl}/tenant/demo/queue/current/confirm?location=main`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lookupCode: "abcd1234" })
    });
    assert.equal(confirmCurrentRes.status, 200);

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
    assert.equal(bookingDetail.booking.groupFundedCampaign, null);

    const rescheduleSlotsRes = await fetch(`${baseUrl}/tenant/demo/bookings/booking-1/reschedule-slots?date=2026-06-24`);
    const rescheduleSlotsText = await rescheduleSlotsRes.text();
    assert.equal(rescheduleSlotsRes.status, 200, rescheduleSlotsText);
    assert.deepEqual(JSON.parse(rescheduleSlotsText), {
      slots: [
        {
          startAt: "2026-06-24T01:00:00.000Z",
          endAt: "2026-06-24T01:30:00.000Z",
          remainingCapacity: 1,
          isAvailable: true
        }
      ]
    });

    assert.equal(calls.some(([name]) => name === "callNextTicket"), true);
    assert.deepEqual(calls.find(([name]) => name === "confirmCurrentTicket"), [
      "confirmCurrentTicket",
      [
        { _id: "tenant-1", slug: "demo" },
        "ABCD1234",
        {
          location: { _id: "location-1", slug: "main" },
          actorUserId: "user-1",
          actorRole: "vendor",
          source: "vendor_barcode_scan"
        }
      ]
    ]);
    assert.equal(calls.some(([name]) => name === "restoreSkippedTicket"), true);
    assert.equal(calls.some(([name]) => name === "openQueueDay"), true);
    assert.equal(calls.some(([name]) => name === "extendQueueDay"), true);
    assert.equal(calls.some(([name]) => name === "assertLocationOpenForCustomerJoin"), true);
    assert.deepEqual(calls.find(([name]) => name === "listVendorBookingRescheduleSlots"), [
      "listVendorBookingRescheduleSlots",
      [{ _id: "tenant-1", slug: "demo" }, "booking-1", "2026-06-24"]
    ]);

    const rejectContributionRes = await fetch(
      `${baseUrl}/tenant/demo/group-funded-campaigns/contributions/contribution-1/reject-payment`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Payment received after target.", refundDisposition: "required" })
      }
    );
    const rejectContributionText = await rejectContributionRes.text();
    assert.equal(rejectContributionRes.status, 404, rejectContributionText);
    assert.equal(calls.some(([name]) => name === "rejectContribution"), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
