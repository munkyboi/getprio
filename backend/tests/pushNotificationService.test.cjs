const test = require("node:test");
const assert = require("node:assert/strict");
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
    } catch {
      // Try next candidate.
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
    return require(targetPath);
  } finally {
    for (const [resolvedDependency, cachedModule] of originals.entries()) {
      if (cachedModule) {
        require.cache[resolvedDependency] = cachedModule;
      } else {
        delete require.cache[resolvedDependency];
      }
    }
  }
}

test("push service saves normalized browser subscription payloads", async () => {
  const calls = [];
  const service = requireWithMocks("../src/services/pushNotificationService.js", {
    "../config/env": {
      vapidPublicKey: "public-key",
      vapidPrivateKey: "private-key",
      vapidSubject: "mailto:test@example.com"
    },
    "../repositories/pushSubscriptions": {
      upsertSubscription: async (data) => {
        calls.push(data);
        return { _id: "sub-1", ...data };
      }
    },
    "../repositories/users": {
      findUserById: async () => ({ notificationSettings: {} })
    },
    "web-push": {
      setVapidDetails: () => {},
      sendNotification: async () => {}
    }
  });

  const subscription = await service.saveSubscription({
    user: { _id: "user-1" },
    tenant: { _id: "tenant-1" },
    payload: {
      subscription: {
        endpoint: "https://push.example/subscription",
        keys: {
          p256dh: "p256dh-key",
          auth: "auth-key"
        }
      }
    },
    userAgent: "node-test"
  });

  assert.equal(subscription._id, "sub-1");
  assert.deepEqual(calls[0], {
    userId: "user-1",
    tenantId: "tenant-1",
    endpoint: "https://push.example/subscription",
    p256dh: "p256dh-key",
    auth: "auth-key",
    userAgent: "node-test"
  });
});

test("push service rejects invalid subscription payloads", async () => {
  const service = requireWithMocks("../src/services/pushNotificationService.js", {
    "../config/env": {},
    "../repositories/pushSubscriptions": {},
    "../repositories/users": {
      findUserById: async () => ({ notificationSettings: {} })
    },
    "web-push": {
      setVapidDetails: () => {},
      sendNotification: async () => {}
    }
  });

  await assert.rejects(
    () => service.saveSubscription({ user: { _id: "user-1" }, payload: { endpoint: "" } }),
    /valid browser push subscription/
  );
});

test("push service deactivates stale subscriptions on gone responses", async () => {
  const deactivated = [];
  const service = requireWithMocks("../src/services/pushNotificationService.js", {
    "../config/env": {
      vapidPublicKey: "public-key",
      vapidPrivateKey: "private-key",
      vapidSubject: "mailto:test@example.com"
    },
    "../repositories/pushSubscriptions": {
      listActiveByTenantId: async () => [
        {
          _id: "sub-1",
          endpoint: "https://push.example/stale",
          p256dh: "p256dh-key",
          auth: "auth-key"
        }
      ],
      deactivateByEndpoint: async (endpoint) => {
        deactivated.push(endpoint);
      }
    },
    "../repositories/users": {
      findUserById: async () => ({ notificationSettings: {} })
    },
    "web-push": {
      setVapidDetails: () => {},
      sendNotification: async () => {
        const error = new Error("Gone");
        error.statusCode = 410;
        throw error;
      }
    }
  });

  const result = await service.notifyVendorQueueJoin({
    tenant: { _id: "tenant-1" },
    ticket: {
      _id: "ticket-1",
      ticketNumber: "A001",
      customerName: "Customer"
    }
  });

  assert.deepEqual(deactivated, ["https://push.example/stale"]);
  assert.deepEqual(result, { attempted: 1, sent: 0 });
});

test("push service sends customer booking notifications when booking alerts are enabled", async () => {
  const notifications = [];
  const successes = [];
  const service = requireWithMocks("../src/services/pushNotificationService.js", {
    "../config/env": {
      vapidPublicKey: "public-key",
      vapidPrivateKey: "private-key",
      vapidSubject: "mailto:test@example.com"
    },
    "../repositories/pushSubscriptions": {
      listActiveByUserId: async (userId) => [
        {
          _id: "sub-1",
          userId,
          endpoint: "https://push.example/customer",
          p256dh: "p256dh-key",
          auth: "auth-key"
        }
      ],
      recordPushSuccess: async (subscriptionId) => {
        successes.push(subscriptionId);
      }
    },
    "../repositories/users": {
      findUserById: async () => ({ notificationSettings: { bookingAlerts: true } })
    },
    "web-push": {
      setVapidDetails: () => {},
      sendNotification: async (_subscription, payload) => {
        notifications.push(JSON.parse(payload));
      }
    }
  });

  const result = await service.notifyCustomerBookingUpdate({
    booking: {
      _id: "booking-1",
      reference: "BKG-123",
      tenantName: "Demo Tenant",
      serviceName: "Consultation",
      customerUserId: "user-1"
    },
    action: "confirmed"
  });

  assert.deepEqual(result, { attempted: 1, sent: 1 });
  assert.equal(successes[0], "sub-1");
  assert.equal(notifications[0].title, "Booking update");
  assert.equal(notifications[0].body, "Demo Tenant confirmed BKG-123 for Consultation.");
  assert.equal(notifications[0].url, "/account/bookings/booking-1");
  assert.equal(notifications[0].eventType, "customer_booking_confirmed");
});

test("push service skips customer notifications when the customer opted out", async () => {
  let subscriptionLookupCount = 0;
  const service = requireWithMocks("../src/services/pushNotificationService.js", {
    "../config/env": {
      vapidPublicKey: "public-key",
      vapidPrivateKey: "private-key",
      vapidSubject: "mailto:test@example.com"
    },
    "../repositories/pushSubscriptions": {
      listActiveByUserId: async () => {
        subscriptionLookupCount += 1;
        return [];
      }
    },
    "../repositories/users": {
      findUserById: async () => ({ notificationSettings: { queueAlerts: false } })
    },
    "web-push": {
      setVapidDetails: () => {},
      sendNotification: async () => {}
    }
  });

  const result = await service.notifyCustomerQueueUpdate({
    tenant: { slug: "demo", name: "Demo Tenant" },
    ticket: {
      _id: "ticket-1",
      userId: "user-1",
      ticketNumber: "D001",
      lookupCode: "ABC12345"
    },
    action: "called"
  });

  assert.deepEqual(result, { attempted: 0, sent: 0 });
  assert.equal(subscriptionLookupCount, 0);
});

test("push service sends customer queue notifications with ticket links", async () => {
  const notifications = [];
  const service = requireWithMocks("../src/services/pushNotificationService.js", {
    "../config/env": {
      vapidPublicKey: "public-key",
      vapidPrivateKey: "private-key",
      vapidSubject: "mailto:test@example.com"
    },
    "../repositories/pushSubscriptions": {
      listActiveByUserId: async () => [
        {
          _id: "sub-1",
          endpoint: "https://push.example/customer",
          p256dh: "p256dh-key",
          auth: "auth-key"
        }
      ],
      recordPushSuccess: async () => {}
    },
    "../repositories/users": {
      findUserById: async () => ({ notificationSettings: { queueAlerts: true } })
    },
    "web-push": {
      setVapidDetails: () => {},
      sendNotification: async (_subscription, payload) => {
        notifications.push(JSON.parse(payload));
      }
    }
  });

  const result = await service.notifyCustomerQueueUpdate({
    tenant: { slug: "demo", name: "Demo Tenant" },
    ticket: {
      _id: "ticket-1",
      userId: "user-1",
      ticketNumber: "D001",
      lookupCode: "ABC12345"
    },
    action: "called"
  });

  assert.deepEqual(result, { attempted: 1, sent: 1 });
  assert.equal(notifications[0].title, "Queue update");
  assert.equal(notifications[0].body, "Demo Tenant is calling D001.");
  assert.equal(notifications[0].url, "/ticket/demo?ticket=ABC12345");
  assert.equal(notifications[0].eventType, "customer_queue_called");
});

test("push service targets explicit vendor roles for payment proof review alerts", async () => {
  const roleFilters = [];
  const notifications = [];
  const service = requireWithMocks("../src/services/pushNotificationService.js", {
    "../config/env": {
      vapidPublicKey: "public-key",
      vapidPrivateKey: "private-key",
      vapidSubject: "mailto:test@example.com"
    },
    "../repositories/pushSubscriptions": {
      listActiveByTenantId: async (_tenantId, options) => {
        roleFilters.push(options.roles);
        return [
          {
            _id: "sub-1",
            tenantId: "tenant-1",
            userId: "vendor-user-1",
            endpoint: "https://push.example/vendor",
            p256dh: "p256dh-key",
            auth: "auth-key"
          }
        ];
      },
      recordPushSuccess: async () => {}
    },
    "../repositories/users": {
      findUserById: async () => ({ notificationSettings: {} })
    },
    "web-push": {
      setVapidDetails: () => {},
      sendNotification: async (_subscription, payload) => {
        notifications.push(JSON.parse(payload));
      }
    }
  });

  const result = await service.notifyVendorPaymentProofReview({
    tenant: { _id: "tenant-1" },
    booking: {
      _id: "booking-1",
      reference: "BKG-123",
      customerName: "Customer One"
    }
  });

  assert.deepEqual(result, { attempted: 1, sent: 1 });
  assert.deepEqual(roleFilters[0], ["owner", "admin", "staff"]);
  assert.equal(notifications[0].title, "Payment proof ready");
  assert.equal(notifications[0].body, "Customer One submitted payment evidence for BKG-123.");
  assert.equal(notifications[0].eventType, "vendor_payment_proof_review");
});

test("push service de-duplicates repeated sends with the same notification tag", async () => {
  let subscriptionLookups = 0;
  let sendCount = 0;
  const service = requireWithMocks("../src/services/pushNotificationService.js", {
    "../config/env": {
      vapidPublicKey: "public-key",
      vapidPrivateKey: "private-key",
      vapidSubject: "mailto:test@example.com"
    },
    "../repositories/pushSubscriptions": {
      listActiveByTenantId: async () => {
        subscriptionLookups += 1;
        return [
          {
            _id: "sub-1",
            tenantId: "tenant-1",
            userId: "vendor-user-1",
            endpoint: "https://push.example/vendor",
            p256dh: "p256dh-key",
            auth: "auth-key"
          }
        ];
      },
      recordPushSuccess: async () => {}
    },
    "../repositories/users": {
      findUserById: async () => ({ notificationSettings: {} })
    },
    "web-push": {
      setVapidDetails: () => {},
      sendNotification: async () => {
        sendCount += 1;
      }
    }
  });

  const first = await service.notifyVendorBookingIntake({
    tenant: { _id: "tenant-1" },
    booking: { _id: "booking-dedupe", reference: "BKG-DEDUP" }
  });
  const second = await service.notifyVendorBookingIntake({
    tenant: { _id: "tenant-1" },
    booking: { _id: "booking-dedupe", reference: "BKG-DEDUP" }
  });

  assert.deepEqual(first, { attempted: 1, sent: 1 });
  assert.deepEqual(second, { attempted: 0, sent: 0, deduped: true });
  assert.equal(subscriptionLookups, 1);
  assert.equal(sendCount, 1);
});
