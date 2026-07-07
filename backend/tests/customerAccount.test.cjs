const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const express = require("express");

function buildAsyncHandlerMock() {
  return (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function buildAuthMock(options = {}) {
  return {
    authenticate(req, _res, next) {
      req.user = {
        _id: "user-1",
        name: "Customer One",
        username: "customer_one",
        email: "customer@example.com",
        phone: "09171234567",
        emailVerified: true,
        mfaEnabled: false,
        mfaRequired: false
      };
      next();
    },
    assertTenantPermission: options.assertTenantPermission || (() => {})
  };
}

function buildErrorHandlerMock() {
  return (error, _req, res, _next) => {
    res.status(error.statusCode || 500).json({
      message: error.message || "Unexpected server error."
    });
  };
}

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

function buildFutureManilaSlot(weeksAhead = 1, weekday = 1, hour = 10, minute = 0) {
  const now = new Date();
  const manilaNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const currentWeekday = manilaNow.getUTCDay();
  const daysUntilWeekday = (7 + weekday - currentWeekday) % 7 || 7;
  const targetManila = new Date(manilaNow);

  targetManila.setUTCDate(manilaNow.getUTCDate() + daysUntilWeekday + (weeksAhead - 1) * 7);
  targetManila.setUTCHours(hour, minute, 0, 0);

  return new Date(targetManila.getTime() - 8 * 60 * 60 * 1000).toISOString();
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

async function startServer(router, basePath) {
  const app = express();
  app.use(express.json());
  app.use(basePath, router);
  app.use(buildErrorHandlerMock());

  const server = await new Promise((resolve) => {
    const nextServer = app.listen(0, () => resolve(nextServer));
  });

  return {
    server,
    baseUrl: `http://127.0.0.1:${server.address().port}${basePath}`
  };
}

async function stopServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

test("customer account overview and history expose owned tickets only", async () => {
  const tickets = [
    {
      _id: "ticket-1",
      lookupCode: "ABC12345",
      ticketNumber: "DMO-001",
      tenantName: "Demo Tenant",
      tenantSlug: "demo",
      locationName: "Main",
      locationSlug: "main",
      status: "waiting",
      createdAt: "2026-06-19T01:00:00.000Z",
      updatedAt: "2026-06-19T01:05:00.000Z"
    }
  ];

  const router = requireWithMocks("../src/routes/accountRoutes.js", {
    "../middleware/auth": buildAuthMock(),
    "../middleware/asyncHandler": buildAsyncHandlerMock(),
    "../repositories/tickets": {
      listTicketsForCustomerAccount: async () => tickets
    },
    "../services/passwordResetService": {
      changePassword: async () => {}
    }
  });

  const { server, baseUrl } = await startServer(router, "/api/account");

  try {
    const overviewResponse = await fetch(`${baseUrl}/overview`, {
      headers: { Authorization: "Bearer token" }
    });
    assert.equal(overviewResponse.status, 200);
    const overview = await overviewResponse.json();
    assert.equal(overview.user.email, "customer@example.com");
    assert.equal(overview.tickets.length, 1);
    assert.equal(overview.tickets[0].ticketNumber, "DMO-001");

    const historyResponse = await fetch(`${baseUrl}/history?limit=500`, {
      headers: { Authorization: "Bearer token" }
    });
    assert.equal(historyResponse.status, 200);
    const history = await historyResponse.json();
    assert.equal(history.tickets.length, 1);
    assert.equal(history.tickets[0].lookupCode, "ABC12345");
  } finally {
    await stopServer(server);
  }
});

test("customer can update profile name without changing username", async () => {
  const profileUpdates = [];
  const router = requireWithMocks("../src/routes/accountRoutes.js", {
    "../middleware/auth": buildAuthMock(),
    "../middleware/asyncHandler": buildAsyncHandlerMock(),
    "../repositories/tickets": {
      listTicketsForCustomerAccount: async () => []
    },
    "../repositories/users": {
      updateUser: async (userId, changes) => {
        profileUpdates.push({ userId, changes });
        return {
          _id: userId,
          name: changes.name,
          username: "customer_one",
          email: "customer@example.com",
          phone: "09171234567",
          emailVerified: true,
          mfaEnabled: false,
          mfaRequired: false
        };
      }
    },
    "../services/passwordResetService": {
      changePassword: async () => {}
    }
  });

  const { server, baseUrl } = await startServer(router, "/api/account");

  try {
    const response = await fetch(`${baseUrl}/profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: "Bearer token" },
      body: JSON.stringify({
        name: "Customer Updated"
      })
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.user.name, "Customer Updated");
    assert.equal(body.user.username, "customer_one");
    assert.equal(body.success, true);
    assert.deepEqual(profileUpdates[0], {
      userId: "user-1",
      changes: {
        name: "Customer Updated"
      }
    });

    const invalidResponse = await fetch(`${baseUrl}/profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: "Bearer token" },
      body: JSON.stringify({
        name: ""
      })
    });
    assert.equal(invalidResponse.status, 400);
  } finally {
    await stopServer(server);
  }
});

test("account push subscription route creates and updates tenant-scoped subscriptions", async () => {
  const permissionChecks = [];
  const saves = [];
  const router = requireWithMocks("../src/routes/accountRoutes.js", {
    "../middleware/auth": buildAuthMock({
      assertTenantPermission: (user, tenantId, permission) => {
        permissionChecks.push({ userId: user._id, tenantId, permission });
      }
    }),
    "../middleware/asyncHandler": buildAsyncHandlerMock(),
    "../repositories/tickets": {
      listTicketsForCustomerAccount: async () => []
    },
    "../repositories/tenants": {
      findTenantBySlug: async (slug, options) => {
        assert.deepEqual(options, { activeOnly: true });
        return { _id: "tenant-1", slug };
      }
    },
    "../services/pushNotificationService": {
      saveSubscription: async (input) => {
        saves.push(input);
        return {
          _id: "subscription-1",
          userId: input.user._id,
          tenantId: input.tenant._id,
          endpoint: input.payload.endpoint,
          p256dh: input.payload.keys.p256dh,
          auth: input.payload.keys.auth,
          userAgent: input.userAgent,
          isActive: true
        };
      }
    },
    "../services/passwordResetService": {
      changePassword: async () => {}
    }
  });

  const { server, baseUrl } = await startServer(router, "/api/account");

  try {
    const createResponse = await fetch(`${baseUrl}/push-subscriptions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token",
        "User-Agent": "node-test-agent"
      },
      body: JSON.stringify({
        tenantSlug: "demo-vendor",
        subscription: {
          endpoint: "https://push.example.test/subscription-1",
          keys: {
            p256dh: "p256dh-key-1",
            auth: "auth-key-1"
          }
        }
      })
    });
    assert.equal(createResponse.status, 201);
    const created = await createResponse.json();
    assert.equal(created.subscription.endpoint, "https://push.example.test/subscription-1");
    assert.equal(created.subscription.p256dh, "p256dh-key-1");

    const updateResponse = await fetch(`${baseUrl}/push-subscriptions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token",
        "User-Agent": "node-test-agent"
      },
      body: JSON.stringify({
        tenantSlug: "demo-vendor",
        subscription: {
          endpoint: "https://push.example.test/subscription-1",
          keys: {
            p256dh: "p256dh-key-2",
            auth: "auth-key-2"
          }
        }
      })
    });
    assert.equal(updateResponse.status, 201);
    const updated = await updateResponse.json();
    assert.equal(updated.subscription.p256dh, "p256dh-key-2");
    assert.equal(updated.subscription.auth, "auth-key-2");

    assert.deepEqual(permissionChecks, [
      { userId: "user-1", tenantId: "tenant-1", permission: "tenant.queue.read" },
      { userId: "user-1", tenantId: "tenant-1", permission: "tenant.queue.read" }
    ]);
    assert.equal(saves.length, 2);
    assert.equal(saves[0].user._id, "user-1");
    assert.equal(saves[0].tenant._id, "tenant-1");
    assert.equal(saves[0].payload.keys.auth, "auth-key-1");
    assert.equal(saves[1].payload.keys.auth, "auth-key-2");
  } finally {
    await stopServer(server);
  }
});

test("account push subscription route rejects invalid payloads and unauthorized tenant scope", async () => {
  const router = requireWithMocks("../src/routes/accountRoutes.js", {
    "../middleware/auth": buildAuthMock({
      assertTenantPermission: () => {
        const error = new Error("Forbidden.");
        error.statusCode = 403;
        throw error;
      }
    }),
    "../middleware/asyncHandler": buildAsyncHandlerMock(),
    "../repositories/tickets": {
      listTicketsForCustomerAccount: async () => []
    },
    "../repositories/tenants": {
      findTenantBySlug: async () => ({ _id: "tenant-2", slug: "other-vendor" })
    },
    "../services/pushNotificationService": {
      saveSubscription: async ({ payload }) => {
        if (!payload?.endpoint || !payload?.keys?.p256dh || !payload?.keys?.auth) {
          const error = new Error("A valid browser push subscription is required.");
          error.statusCode = 400;
          throw error;
        }

        return { _id: "subscription-1" };
      }
    },
    "../services/passwordResetService": {
      changePassword: async () => {}
    }
  });

  const { server, baseUrl } = await startServer(router, "/api/account");

  try {
    const invalidResponse = await fetch(`${baseUrl}/push-subscriptions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer token" },
      body: JSON.stringify({
        subscription: {
          endpoint: "https://push.example.test/missing-keys"
        }
      })
    });
    assert.equal(invalidResponse.status, 400);
    const invalidBody = await invalidResponse.json();
    assert.match(invalidBody.message, /valid browser push subscription/);

    const forbiddenResponse = await fetch(`${baseUrl}/push-subscriptions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer token" },
      body: JSON.stringify({
        tenantSlug: "other-vendor",
        subscription: {
          endpoint: "https://push.example.test/subscription-2",
          keys: {
            p256dh: "p256dh-key",
            auth: "auth-key"
          }
        }
      })
    });
    assert.equal(forbiddenResponse.status, 403);
  } finally {
    await stopServer(server);
  }
});

test("account push subscription route deactivates only the authenticated user's subscription", async () => {
  const deletions = [];
  const router = requireWithMocks("../src/routes/accountRoutes.js", {
    "../middleware/auth": buildAuthMock(),
    "../middleware/asyncHandler": buildAsyncHandlerMock(),
    "../repositories/tickets": {
      listTicketsForCustomerAccount: async () => []
    },
    "../services/pushNotificationService": {
      deleteSubscription: async (input) => {
        deletions.push(input);
        if (input.subscriptionId === "missing") {
          return null;
        }

        return {
          _id: input.subscriptionId,
          userId: input.user._id,
          isActive: false
        };
      }
    },
    "../services/passwordResetService": {
      changePassword: async () => {}
    }
  });

  const { server, baseUrl } = await startServer(router, "/api/account");

  try {
    const deleteResponse = await fetch(`${baseUrl}/push-subscriptions/subscription-1`, {
      method: "DELETE",
      headers: { Authorization: "Bearer token" }
    });
    assert.equal(deleteResponse.status, 200);
    const body = await deleteResponse.json();
    assert.equal(body.subscription._id, "subscription-1");
    assert.equal(body.subscription.userId, "user-1");
    assert.equal(body.subscription.isActive, false);

    const missingResponse = await fetch(`${baseUrl}/push-subscriptions/missing`, {
      method: "DELETE",
      headers: { Authorization: "Bearer token" }
    });
    assert.equal(missingResponse.status, 404);

    assert.equal(deletions.length, 2);
    assert.equal(deletions[0].user._id, "user-1");
    assert.equal(deletions[0].subscriptionId, "subscription-1");
    assert.equal(deletions[1].user._id, "user-1");
    assert.equal(deletions[1].subscriptionId, "missing");
  } finally {
    await stopServer(server);
  }
});

test("customer booking payment proof endpoints delegate through authenticated booking service", async () => {
  const calls = [];
  const booking = {
    _id: "booking-1",
    reference: "BKG-PROOF",
    tenantId: "tenant-1",
    tenantName: "Demo Tenant",
    tenantSlug: "demo",
    locationId: "location-1",
    locationName: "Main Branch",
    locationSlug: "main",
    serviceId: "service-1",
    serviceName: "Consultation",
    serviceSlug: "consultation",
    serviceManualPaymentRequired: false,
    servicePriceAmountCents: 50000,
    serviceCurrency: "PHP",
    servicePriceDisplay: "PHP 500",
    locationPaymentMethodLabel: "GCash InstaPay QR",
    locationPaymentAccountDisplayName: "Demo Tenant Main Branch",
    locationPaymentAccountIdentifierDisplay: "0917 *** 4567",
    locationPaymentQrImageUrl: "https://cdn.example.test/payment-qr.png",
    locationPaymentQrActive: true,
    bookingQuantity: 1,
    customerUserId: "user-1",
    customerName: "Customer One",
    customerEmail: "customer@example.com",
    customerPhone: "09171234567",
    scheduledStartAt: "2026-06-29T02:00:00.000Z",
    scheduledEndAt: "2026-06-29T03:00:00.000Z",
    status: "pending",
    notes: "",
    paymentReference: "REF-123",
    paymentStatus: "pending",
    paymentProofObjectKey: "payment-proofs/tenants/tenant-1/bookings/booking-1/proof.jpg",
    paymentProofFileName: "proof.jpg",
    paymentProofContentType: "image/jpeg",
    paymentProofSizeBytes: 1234,
    paymentProofUploadedAt: "2026-06-23T06:00:00.000Z",
    notifyByEmail: true,
    notifyBySms: false,
    smsAlertFeePaymentId: "",
    contactVerifiedAt: "2026-06-23T05:30:00.000Z",
    contactVerificationChannel: "email",
    queueTicketId: null,
    checkedInAt: null,
    noShowAt: null,
    createdAt: "2026-06-23T05:00:00.000Z",
    updatedAt: "2026-06-23T06:00:00.000Z"
  };
  const router = requireWithMocks("../src/routes/accountRoutes.js", {
    "../middleware/auth": buildAuthMock(),
    "../middleware/asyncHandler": buildAsyncHandlerMock(),
    "../repositories/tickets": {
      listTicketsForCustomerAccount: async () => []
    },
    "../repositories/bookings": {
      listBookingsForCustomer: async () => [],
      findBookingById: async () => booking
    },
    "../services/bookingService": {
      createCustomerPaymentProofUpload: async (input) => {
        calls.push(["upload", input]);
        return {
          proof: {
            objectKey: "payment-proofs/tenants/tenant-1/bookings/booking-1/proof.jpg",
            fileName: "proof.jpg",
            contentType: "image/jpeg",
            sizeBytes: 1234
          },
          upload: {
            method: "PUT",
            url: "https://example.test/upload",
            headers: { "Content-Type": "image/jpeg" },
            expiresInSeconds: 300
          }
        };
      },
      uploadCustomerPaymentProofDirect: async (input) => {
        calls.push(["direct-upload", input]);
        return {
          proof: {
            objectKey: "payment-proofs/tenants/tenant-1/bookings/booking-1/direct-proof.jpg",
            fileName: "direct-proof.jpg",
            contentType: "image/jpeg",
            sizeBytes: input.fileBuffer.length
          }
        };
      },
      submitCustomerPaymentProof: async (input) => {
        calls.push(["submit", input]);
        return booking;
      },
      createCustomerPaymentProofAccess: async (input) => {
        calls.push(["access", input]);
        return {
          proof: {
            fileName: "proof.jpg",
            contentType: "image/jpeg",
            sizeBytes: 1234,
            uploadedAt: "2026-06-23T06:00:00.000Z"
          },
          access: {
            method: "GET",
            url: "https://example.test/view",
            expiresInSeconds: 300
          }
        };
      }
    },
    "../services/passwordResetService": {
      changePassword: async () => {}
    }
  });

  const { server, baseUrl } = await startServer(router, "/api/account");

  try {
    const uploadResponse = await fetch(`${baseUrl}/bookings/booking-1/payment-proof/uploads`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer token" },
      body: JSON.stringify({
        fileName: "proof.jpg",
        contentType: "image/jpeg",
        sizeBytes: 1234
      })
    });
    assert.equal(uploadResponse.status, 201);
    const upload = await uploadResponse.json();
    assert.equal(upload.upload.method, "PUT");
    assert.equal(upload.proof.objectKey.includes("/bookings/booking-1/"), true);

    const directUploadResponse = await fetch(`${baseUrl}/bookings/booking-1/payment-proof/uploads/direct?fileName=direct-proof.jpg`, {
      method: "POST",
      headers: { "Content-Type": "image/jpeg", Authorization: "Bearer token" },
      body: Buffer.from("proof")
    });
    assert.equal(directUploadResponse.status, 201);
    const directUpload = await directUploadResponse.json();
    assert.equal(directUpload.proof.fileName, "direct-proof.jpg");
    assert.equal(directUpload.proof.sizeBytes, 5);

    const submitResponse = await fetch(`${baseUrl}/bookings/booking-1/payment-proof`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer token" },
      body: JSON.stringify({
        paymentReference: "REF-123",
        objectKey: upload.proof.objectKey,
        fileName: "proof.jpg",
        contentType: "image/jpeg",
        sizeBytes: 1234
      })
    });
    assert.equal(submitResponse.status, 200);
    const submitted = await submitResponse.json();
    assert.equal(submitted.booking.paymentStatus, "pending");
    assert.equal(submitted.booking.paymentProof.fileName, "proof.jpg");
    assert.equal(submitted.booking.manualPaymentDestination, null);

    const accessResponse = await fetch(`${baseUrl}/bookings/booking-1/payment-proof`, {
      headers: { Authorization: "Bearer token" }
    });
    assert.equal(accessResponse.status, 200);
    const access = await accessResponse.json();
    assert.equal(access.access.method, "GET");
    assert.equal(access.proof.contentType, "image/jpeg");

    assert.deepEqual(calls.map(([name]) => name), ["upload", "direct-upload", "submit", "access"]);
    assert.equal(calls.every(([, input]) => input.user._id === "user-1"), true);
  } finally {
    await stopServer(server);
  }
});

test("customer booking detail exposes manual payment destination before proof submission", async () => {
  const booking = {
    _id: "booking-1",
    reference: "BKG-PAY",
    tenantId: "tenant-1",
    tenantName: "Demo Tenant",
    tenantSlug: "demo",
    locationId: "location-1",
    locationName: "Main Branch",
    locationSlug: "main",
    serviceId: "service-1",
    serviceName: "Consultation",
    serviceSlug: "consultation",
    serviceManualPaymentRequired: true,
    servicePriceAmountCents: 50000,
    serviceCurrency: "PHP",
    servicePriceDisplay: "PHP 500",
    locationPaymentMethodLabel: "GCash InstaPay QR",
    locationPaymentAccountDisplayName: "Demo Tenant Main Branch",
    locationPaymentAccountIdentifierDisplay: "0917 *** 4567",
    locationPaymentQrImageUrl: "https://cdn.example.test/payment-qr.png",
    locationPaymentQrActive: true,
    bookingQuantity: 2,
    customerUserId: "user-1",
    customerName: "Customer One",
    customerEmail: "customer@example.com",
    customerPhone: "09171234567",
    scheduledStartAt: "2026-06-29T02:00:00.000Z",
    scheduledEndAt: "2026-06-29T04:00:00.000Z",
    status: "pending",
    notes: "",
    paymentReference: "",
    paymentStatus: "unpaid",
    paymentProofObjectKey: "",
    paymentVerifiedAt: null,
    paymentRejectedAt: null,
    paymentRejectionReason: "",
    notifyByEmail: true,
    notifyBySms: false,
    smsAlertFeePaymentId: "",
    contactVerifiedAt: "2026-06-23T05:30:00.000Z",
    contactVerificationChannel: "email",
    queueTicketId: null,
    checkedInAt: null,
    noShowAt: null,
    createdAt: "2026-06-23T05:00:00.000Z",
    updatedAt: "2026-06-23T05:00:00.000Z"
  };
  const router = requireWithMocks("../src/routes/accountRoutes.js", {
    "../middleware/auth": buildAuthMock(),
    "../middleware/asyncHandler": buildAsyncHandlerMock(),
    "../repositories/tickets": {
      listTicketsForCustomerAccount: async () => []
    },
    "../repositories/bookings": {
      findBookingById: async () => booking
    },
    "../services/bookingService": {
      expirePendingBookingsForCustomer: async () => []
    },
    "../services/passwordResetService": {
      changePassword: async () => {}
    }
  });

  const { server, baseUrl } = await startServer(router, "/api/account");

  try {
    const response = await fetch(`${baseUrl}/bookings/booking-1`, {
      headers: { Authorization: "Bearer token" }
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.booking.manualPaymentDestination.methodLabel, "GCash InstaPay QR");
    assert.equal(body.booking.manualPaymentDestination.qrImageUrl, "https://cdn.example.test/payment-qr.png");
    assert.equal(body.booking.manualPaymentDestination.amountCents, 100000);
  } finally {
    await stopServer(server);
  }
});

test("customer booking detail hides manual payment destination when service does not require proof", async () => {
  const booking = {
    _id: "booking-2",
    reference: "BKG-NOPAY",
    tenantId: "tenant-1",
    tenantName: "Demo Tenant",
    tenantSlug: "demo",
    locationId: "location-1",
    locationName: "Main Branch",
    locationSlug: "main",
    serviceId: "service-1",
    serviceName: "Haircut",
    serviceSlug: "haircut",
    serviceManualPaymentRequired: false,
    servicePriceAmountCents: 30000,
    serviceCurrency: "PHP",
    servicePriceDisplay: "PHP 300",
    locationPaymentMethodLabel: "GCash InstaPay QR",
    locationPaymentAccountDisplayName: "Demo Tenant Main Branch",
    locationPaymentAccountIdentifierDisplay: "0917 *** 4567",
    locationPaymentQrImageUrl: "https://cdn.example.test/payment-qr.png",
    locationPaymentQrActive: true,
    bookingQuantity: 1,
    customerUserId: "user-1",
    customerName: "Customer One",
    customerEmail: "customer@example.com",
    customerPhone: "09171234567",
    scheduledStartAt: "2026-06-29T02:00:00.000Z",
    scheduledEndAt: "2026-06-29T04:00:00.000Z",
    status: "pending",
    notes: "",
    paymentReference: "",
    paymentStatus: "unpaid",
    paymentProofObjectKey: "",
    paymentVerifiedAt: null,
    paymentRejectedAt: null,
    paymentRejectionReason: "",
    notifyByEmail: true,
    notifyBySms: false,
    smsAlertFeePaymentId: "",
    contactVerifiedAt: "2026-06-23T05:30:00.000Z",
    contactVerificationChannel: "email",
    queueTicketId: null,
    checkedInAt: null,
    noShowAt: null,
    createdAt: "2026-06-23T05:00:00.000Z",
    updatedAt: "2026-06-23T05:00:00.000Z"
  };
  const router = requireWithMocks("../src/routes/accountRoutes.js", {
    "../middleware/auth": buildAuthMock(),
    "../middleware/asyncHandler": buildAsyncHandlerMock(),
    "../repositories/tickets": {
      listTicketsForCustomerAccount: async () => []
    },
    "../repositories/bookings": {
      findBookingById: async () => booking
    },
    "../services/bookingService": {
      expirePendingBookingsForCustomer: async () => []
    },
    "../services/passwordResetService": {
      changePassword: async () => {}
    }
  });

  const { server, baseUrl } = await startServer(router, "/api/account");

  try {
    const response = await fetch(`${baseUrl}/bookings/booking-2`, {
      headers: { Authorization: "Bearer token" }
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.booking.manualPaymentDestination, null);
  } finally {
    await stopServer(server);
  }
});

test("customer bookings can be created only inside vendor availability", async () => {
  const bookings = [];
  const initialScheduledStartAt = buildFutureManilaSlot(1, 1, 10, 0);
  const rejectedScheduledStartAt = buildFutureManilaSlot(1, 1, 18, 0);
  let verifiedScheduledStartAt = initialScheduledStartAt;
  const router = requireWithMocks("../src/routes/accountRoutes.js", {
    "../middleware/auth": buildAuthMock(),
    "../middleware/asyncHandler": buildAsyncHandlerMock(),
    "../repositories/tickets": {
      listTicketsForCustomerAccount: async () => []
    },
    "../repositories/bookings": {
      listBookingsForCustomer: async () => bookings,
      createBooking: async (data) => {
        const booking = {
          _id: "booking-1",
          reference: "BKG-TEST0001",
          tenantId: "tenant-1",
          tenantName: "Demo Tenant",
          tenantSlug: "demo",
          locationId: "location-1",
          locationName: "Main Branch",
          locationSlug: "main",
          serviceId: "service-1",
          serviceName: "Consultation",
          serviceSlug: "consultation",
          servicePriceDisplay: "PHP 500",
          customerUserId: data.customerUserId,
          customerName: data.customerName,
          customerEmail: data.customerEmail,
          customerPhone: data.customerPhone,
          scheduledStartAt: data.scheduledStartAt,
          scheduledEndAt: data.scheduledEndAt,
          status: "pending",
          notes: data.notes || "",
          paymentReference: data.paymentReference || "",
          paymentStatus: "unpaid",
          createdAt: "2026-06-22T00:00:00.000Z",
          updatedAt: "2026-06-22T00:00:00.000Z"
        };
        bookings.push(booking);
        return booking;
      }
    },
    "../services/bookingService": requireWithMocks("../src/services/bookingService.js", {
      "../repositories/bookings": {
        countOverlappingActiveBookings: async () => 0,
        createBooking: async (data) => {
          const booking = {
            _id: "booking-1",
            reference: "BKG-TEST0001",
            tenantId: "tenant-1",
            tenantName: "Demo Tenant",
            tenantSlug: "demo",
            locationId: "location-1",
            locationName: "Main Branch",
            locationSlug: "main",
            serviceId: "service-1",
            serviceName: "Consultation",
            serviceSlug: "consultation",
            servicePriceDisplay: "PHP 500",
            customerUserId: data.customerUserId,
            customerName: data.customerName,
            customerEmail: data.customerEmail,
            customerPhone: data.customerPhone,
            scheduledStartAt: data.scheduledStartAt,
            scheduledEndAt: data.scheduledEndAt,
            status: "pending",
            notes: data.notes || "",
            paymentReference: data.paymentReference || "",
            paymentStatus: "unpaid",
            createdAt: "2026-06-22T00:00:00.000Z",
            updatedAt: "2026-06-22T00:00:00.000Z"
          };
          bookings.push(booking);
          return booking;
        }
      },
      "../repositories/tenants": {
        findTenantBySlug: async (slug) =>
          slug === "demo"
            ? {
                _id: "tenant-1",
                slug: "demo",
                name: "Demo Tenant",
                publicProfileEnabled: true,
                vendorApprovalStatus: "approved"
              }
            : null
      },
      "../repositories/storeLocations": {
        findLocationByTenantAndSlug: async (_tenantId, slug) =>
          slug === "main"
            ? {
                _id: "location-1",
                tenantId: "tenant-1",
                slug: "main",
                name: "Main Branch",
                isActive: true
              }
            : null
      },
      "../repositories/vendorServices": {
        normalizeServiceSlug: (value) => String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
        findServiceByTenantAndSlug: async (_tenantId, slug) =>
          slug === "consultation"
            ? {
                _id: "service-1",
                tenantId: "tenant-1",
                name: "Consultation",
                slug: "consultation",
                durationMinutes: 60,
                isActive: true
              }
            : null
      },
      "../repositories/vendorAvailability": {
        listAvailabilityByLocation: async () => ({
          blocks: [
            {
              _id: "block-1",
              tenantId: "tenant-1",
              locationId: "location-1",
              serviceId: "service-1",
              weekday: 1,
              startsAt: "09:00",
              endsAt: "17:00",
              capacity: 1,
              isActive: true
            }
          ],
          exceptions: []
        })
      },
      "./bookingOtpService": {
        getVerifiedBookingPayload: async () => ({
          otpId: "booking-otp-1",
          contactVerifiedAt: "2026-06-29T01:55:00.000Z",
          contactVerificationChannel: "email",
      payload: {
        tenantSlug: "demo",
        locationSlug: "main",
        serviceSlug: "consultation",
        scheduledStartAt: verifiedScheduledStartAt,
            customerName: "Customer One",
            customerEmail: "customer@example.com",
            customerPhone: "09171234567",
            notifyBySms: false,
            notes: "First visit"
          }
        }),
        consumeBookingVerificationToken: async () => {}
      },
      "./bookingSmsAlertPaymentService": {
        getBookingSmsFeeForTenant: async () => ({ enabled: false, amountCents: 0, currency: "PHP", displayAmount: "PHP 0.00", planSlug: "economical" }),
        shouldChargeBookingSmsFee: () => false,
        assertPaidBookingSmsPayment: async () => {}
      },
      "./notificationService": {
        sendEmail: async () => {},
        sendSms: async () => {}
      }
    }),
    "../services/passwordResetService": {
      changePassword: async () => {}
    }
  });

  const { server, baseUrl } = await startServer(router, "/api/account");

  try {
    const acceptedResponse = await fetch(`${baseUrl}/bookings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token"
      },
      body: JSON.stringify({
        tenantSlug: "demo",
        locationSlug: "main",
        serviceSlug: "consultation",
        scheduledStartAt: initialScheduledStartAt,
        bookingVerificationToken: "verified-token",
        notes: "First visit"
      })
    });
    assert.equal(acceptedResponse.status, 201);
    const accepted = await acceptedResponse.json();
    assert.equal(accepted.booking.reference, "BKG-TEST0001");
    assert.equal(accepted.booking.status, "pending");

    verifiedScheduledStartAt = rejectedScheduledStartAt;
    const rejectedResponse = await fetch(`${baseUrl}/bookings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token"
      },
      body: JSON.stringify({
        tenantSlug: "demo",
        locationSlug: "main",
        serviceSlug: "consultation",
        scheduledStartAt: rejectedScheduledStartAt,
        bookingVerificationToken: "verified-token"
      })
    });
    assert.equal(rejectedResponse.status, 409);

    const listResponse = await fetch(`${baseUrl}/bookings`, {
      headers: { Authorization: "Bearer token" }
    });
    assert.equal(listResponse.status, 200);
    assert.equal((await listResponse.json()).bookings.length, 1);
  } finally {
    await stopServer(server);
  }
});

test("customer bookings route forwards search, status, and date filters", async () => {
  const captured = [];
  const router = requireWithMocks("../src/routes/accountRoutes.js", {
    "../middleware/auth": buildAuthMock(),
    "../middleware/asyncHandler": buildAsyncHandlerMock(),
    "../repositories/tickets": {
      listTicketsForCustomerAccount: async () => []
    },
    "../repositories/bookings": {
      listBookingsForCustomer: async (_userId, options) => {
        captured.push(options);
        return [];
      }
    },
    "../services/bookingService": {
      expirePendingBookingsForCustomer: async () => []
    },
    "../services/passwordResetService": {
      changePassword: async () => {}
    }
  });

  const { server, baseUrl } = await startServer(router, "/api/account");

  try {
    const response = await fetch(
      `${baseUrl}/bookings?search=Haircut&status=confirmed&scheduledDateFrom=2026-07-01&scheduledDateTo=2026-07-31`,
      {
        headers: { Authorization: "Bearer token" }
      }
    );

    assert.equal(response.status, 200);
    assert.equal(captured.length, 1);
    assert.deepEqual(captured[0], {
      page: 1,
      pageSize: 10,
      offset: 0,
      search: "Haircut",
      status: "confirmed",
      scheduledDateFrom: "2026-07-01",
      scheduledDateTo: "2026-07-31"
    });
  } finally {
    await stopServer(server);
  }
});

test("customer bookings use store hours when no booking availability is configured", async () => {
  const bookings = [];
  const initialScheduledStartAt = buildFutureManilaSlot(1, 1, 10, 0);
  const rejectedScheduledStartAt = buildFutureManilaSlot(1, 1, 18, 0);
  let verifiedScheduledStartAt = initialScheduledStartAt;
  const router = requireWithMocks("../src/routes/accountRoutes.js", {
    "../middleware/auth": buildAuthMock(),
    "../middleware/asyncHandler": buildAsyncHandlerMock(),
    "../repositories/tickets": {
      listTicketsForCustomerAccount: async () => []
    },
    "../repositories/bookings": {
      listBookingsForCustomer: async () => bookings,
      createBooking: async (data) => {
        const booking = {
          _id: "booking-1",
          reference: "BKG-TEST0002",
          tenantId: "tenant-1",
          tenantName: "Demo Tenant",
          tenantSlug: "demo",
          locationId: "location-1",
          locationName: "Main Branch",
          locationSlug: "main",
          serviceId: "service-1",
          serviceName: "Consultation",
          serviceSlug: "consultation",
          servicePriceDisplay: "PHP 500",
          customerUserId: data.customerUserId,
          customerName: data.customerName,
          customerEmail: data.customerEmail,
          customerPhone: data.customerPhone,
          scheduledStartAt: data.scheduledStartAt,
          scheduledEndAt: data.scheduledEndAt,
          status: "pending",
          notes: data.notes || "",
          paymentReference: data.paymentReference || "",
          paymentStatus: "unpaid",
          createdAt: "2026-06-22T00:00:00.000Z",
          updatedAt: "2026-06-22T00:00:00.000Z"
        };
        bookings.push(booking);
        return booking;
      }
    },
    "../services/bookingService": requireWithMocks("../src/services/bookingService.js", {
      "../repositories/bookings": {
        countOverlappingActiveBookings: async () => 0,
        createBooking: async (data) => {
          const booking = {
            _id: "booking-1",
            reference: "BKG-TEST0002",
            tenantId: "tenant-1",
            tenantName: "Demo Tenant",
            tenantSlug: "demo",
            locationId: "location-1",
            locationName: "Main Branch",
            locationSlug: "main",
            serviceId: "service-1",
            serviceName: "Consultation",
            serviceSlug: "consultation",
            servicePriceDisplay: "PHP 500",
            customerUserId: data.customerUserId,
            customerName: data.customerName,
            customerEmail: data.customerEmail,
            customerPhone: data.customerPhone,
            scheduledStartAt: data.scheduledStartAt,
            scheduledEndAt: data.scheduledEndAt,
            status: "pending",
            notes: data.notes || "",
            paymentReference: data.paymentReference || "",
            paymentStatus: "unpaid",
            createdAt: "2026-06-22T00:00:00.000Z",
            updatedAt: "2026-06-22T00:00:00.000Z"
          };
          bookings.push(booking);
          return booking;
        }
      },
      "../repositories/tenants": {
        findTenantBySlug: async () => ({
          _id: "tenant-1",
          slug: "demo",
          name: "Demo Tenant",
          publicProfileEnabled: true,
          vendorApprovalStatus: "approved"
        })
      },
      "../repositories/storeLocations": {
        findLocationByTenantAndSlug: async () => ({
          _id: "location-1",
          tenantId: "tenant-1",
          slug: "main",
          name: "Main Branch",
          timezone: "Asia/Manila",
          isActive: true
        }),
        listHoursByLocationId: async () => [
          { weekday: 1, opensAt: "09:00", closesAt: "17:00", isClosed: false }
        ]
      },
      "../repositories/vendorServices": {
        normalizeServiceSlug: (value) => String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
        findServiceByTenantAndSlug: async () => ({
          _id: "service-1",
          tenantId: "tenant-1",
          name: "Consultation",
          slug: "consultation",
          durationMinutes: 60,
          isActive: true
        })
      },
      "../repositories/vendorAvailability": {
        listAvailabilityByLocation: async () => ({
          blocks: [],
          exceptions: []
        })
      },
      "./bookingOtpService": {
        getVerifiedBookingPayload: async () => ({
          otpId: "booking-otp-1",
          contactVerifiedAt: "2026-06-29T01:55:00.000Z",
          contactVerificationChannel: "email",
          payload: {
            tenantSlug: "demo",
            locationSlug: "main",
            serviceSlug: "consultation",
            scheduledStartAt: verifiedScheduledStartAt,
            customerName: "Customer One",
            customerEmail: "customer@example.com",
            customerPhone: "09171234567",
            notifyBySms: false,
            notes: ""
          }
        }),
        consumeBookingVerificationToken: async () => {}
      },
      "./bookingSmsAlertPaymentService": {
        getBookingSmsFeeForTenant: async () => ({ enabled: false, amountCents: 0, currency: "PHP", displayAmount: "PHP 0.00", planSlug: "economical" }),
        shouldChargeBookingSmsFee: () => false,
        assertPaidBookingSmsPayment: async () => {}
      },
      "./notificationService": {
        sendEmail: async () => {},
        sendSms: async () => {}
      }
    }),
    "../services/passwordResetService": {
      changePassword: async () => {}
    }
  });

  const { server, baseUrl } = await startServer(router, "/api/account");

  try {
    const acceptedResponse = await fetch(`${baseUrl}/bookings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token"
      },
      body: JSON.stringify({
        tenantSlug: "demo",
        locationSlug: "main",
        serviceSlug: "consultation",
        scheduledStartAt: initialScheduledStartAt,
        bookingVerificationToken: "verified-token"
      })
    });
    assert.equal(acceptedResponse.status, 201);
    assert.equal((await acceptedResponse.json()).booking.reference, "BKG-TEST0002");

    verifiedScheduledStartAt = rejectedScheduledStartAt;
    const rejectedResponse = await fetch(`${baseUrl}/bookings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token"
      },
      body: JSON.stringify({
        tenantSlug: "demo",
        locationSlug: "main",
        serviceSlug: "consultation",
        scheduledStartAt: rejectedScheduledStartAt,
        bookingVerificationToken: "verified-token"
      })
    });
    assert.equal(rejectedResponse.status, 409);
  } finally {
    await stopServer(server);
  }
});

test("customer can view and cancel own pending booking before check-in", async () => {
  const bookings = new Map([
    [
      "booking-1",
      {
        _id: "booking-1",
        reference: "BKG-TEST0003",
        tenantId: "tenant-1",
        tenantName: "Demo Tenant",
        tenantSlug: "demo",
        locationId: "location-1",
        locationName: "Main Branch",
        locationSlug: "main",
        serviceId: "service-1",
        serviceName: "Consultation",
        serviceSlug: "consultation",
        servicePriceDisplay: "PHP 500",
        customerUserId: "user-1",
        customerName: "Customer One",
        customerEmail: "customer@example.com",
        customerPhone: "09171234567",
        scheduledStartAt: "2026-07-06T01:00:00.000Z",
        scheduledEndAt: "2026-07-06T02:00:00.000Z",
        status: "pending",
        notes: "",
        paymentReference: "",
        paymentStatus: "unpaid",
        notifyByEmail: true,
        notifyBySms: false,
        smsAlertFeePaymentId: "",
        contactVerifiedAt: "2026-07-06T00:30:00.000Z",
        contactVerificationChannel: "email",
        queueTicketId: null,
        checkedInAt: null,
        noShowAt: null,
        createdAt: "2026-07-06T00:30:00.000Z",
        updatedAt: "2026-07-06T00:30:00.000Z"
      }
    ]
  ]);

  const router = requireWithMocks("../src/routes/accountRoutes.js", {
    "../middleware/auth": buildAuthMock(),
    "../middleware/asyncHandler": buildAsyncHandlerMock(),
    "../repositories/tickets": {
      listTicketsForCustomerAccount: async () => []
    },
    "../repositories/bookings": {
      listBookingsForCustomer: async () => [...bookings.values()],
      findBookingById: async (bookingId) => bookings.get(String(bookingId)) || null,
      updateBooking: async (bookingId, data) => {
        const current = bookings.get(String(bookingId));
        const updated = { ...current, ...data, updatedAt: "2026-07-06T00:40:00.000Z" };
        bookings.set(String(bookingId), updated);
        return updated;
      }
    },
    "../services/bookingService": requireWithMocks("../src/services/bookingService.js", {
      "../repositories/bookings": {
        findBookingById: async (bookingId) => bookings.get(String(bookingId)) || null,
        updateBooking: async (bookingId, data) => {
          const current = bookings.get(String(bookingId));
          const updated = { ...current, ...data, updatedAt: "2026-07-06T00:40:00.000Z" };
          bookings.set(String(bookingId), updated);
          return updated;
        }
      },
      "../repositories/tenants": {},
      "../repositories/storeLocations": {},
      "../repositories/vendorServices": {
        normalizeServiceSlug: (value) => String(value || "").trim().toLowerCase()
      },
      "../repositories/vendorAvailability": {},
      "./bookingOtpService": {},
      "./bookingSmsAlertPaymentService": {},
      "./notificationService": {
        sendEmail: async () => {},
        sendSms: async () => {}
      }
    }),
    "../services/passwordResetService": {
      changePassword: async () => {}
    }
  });

  const { server, baseUrl } = await startServer(router, "/api/account");

  try {
    const detailResponse = await fetch(`${baseUrl}/bookings/booking-1`, {
      headers: { Authorization: "Bearer token" }
    });
    assert.equal(detailResponse.status, 200);
    assert.equal((await detailResponse.json()).booking.reference, "BKG-TEST0003");

    const cancelResponse = await fetch(`${baseUrl}/bookings/booking-1`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token"
      },
      body: JSON.stringify({ reason: "Schedule changed" })
    });
    assert.equal(cancelResponse.status, 200);
    const cancelled = await cancelResponse.json();
    assert.equal(cancelled.booking.status, "canceled");
    assert.equal(cancelled.booking.notes, "Schedule changed");
  } finally {
    await stopServer(server);
  }
});

test("customer booking cancellation rejects other owners and checked-in bookings", async () => {
  const bookings = new Map([
    [
      "other-booking",
      {
        _id: "other-booking",
        tenantId: "tenant-1",
        customerUserId: "other-user",
        status: "pending",
        checkedInAt: null,
        queueTicketId: null
      }
    ],
    [
      "checked-in-booking",
      {
        _id: "checked-in-booking",
        tenantId: "tenant-1",
        customerUserId: "user-1",
        status: "confirmed",
        checkedInAt: "2026-07-06T01:05:00.000Z",
        queueTicketId: "ticket-1"
      }
    ],
    [
      "completed-booking",
      {
        _id: "completed-booking",
        tenantId: "tenant-1",
        customerUserId: "user-1",
        status: "completed",
        checkedInAt: null,
        queueTicketId: null
      }
    ]
  ]);

  const router = requireWithMocks("../src/routes/accountRoutes.js", {
    "../middleware/auth": buildAuthMock(),
    "../middleware/asyncHandler": buildAsyncHandlerMock(),
    "../repositories/tickets": {
      listTicketsForCustomerAccount: async () => []
    },
    "../repositories/bookings": {
      listBookingsForCustomer: async () => [],
      findBookingById: async (bookingId) => bookings.get(String(bookingId)) || null
    },
    "../services/bookingService": requireWithMocks("../src/services/bookingService.js", {
      "../repositories/bookings": {
        findBookingById: async (bookingId) => bookings.get(String(bookingId)) || null,
        updateBooking: async () => {
          throw new Error("updateBooking should not be called");
        }
      },
      "../repositories/tenants": {},
      "../repositories/storeLocations": {},
      "../repositories/vendorServices": {
        normalizeServiceSlug: (value) => String(value || "").trim().toLowerCase()
      },
      "../repositories/vendorAvailability": {},
      "./bookingOtpService": {},
      "./bookingSmsAlertPaymentService": {},
      "./notificationService": {
        sendEmail: async () => {},
        sendSms: async () => {}
      }
    }),
    "../services/passwordResetService": {
      changePassword: async () => {}
    }
  });

  const { server, baseUrl } = await startServer(router, "/api/account");

  try {
    const otherResponse = await fetch(`${baseUrl}/bookings/other-booking`, {
      headers: { Authorization: "Bearer token" }
    });
    assert.equal(otherResponse.status, 404);

    const checkedInResponse = await fetch(`${baseUrl}/bookings/checked-in-booking`, {
      method: "DELETE",
      headers: { Authorization: "Bearer token" }
    });
    assert.equal(checkedInResponse.status, 409);

    const terminalResponse = await fetch(`${baseUrl}/bookings/completed-booking`, {
      method: "DELETE",
      headers: { Authorization: "Bearer token" }
    });
    assert.equal(terminalResponse.status, 409);
  } finally {
    await stopServer(server);
  }
});
