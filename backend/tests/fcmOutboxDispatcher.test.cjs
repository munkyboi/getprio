const test = require("node:test");
const assert = require("node:assert/strict");
const { requireWithMocks } = require("./testSupport.cjs");

function buildIntent() {
  return {
    id: "42",
    tenant_id: 7,
    ticket_id: 9,
    recipient_key: "user:21",
    channel: "fcm",
    template_name: "ticket_called"
  };
}

test("FCM outbox delivery resolves stale installations without retrying accepted ones", async () => {
  const registrations = [
    { id: "101", installationId: "ios-1", token: "token-1", platform: "ios" },
    { id: "102", installationId: "ios-2", token: "token-2", platform: "ios" }
  ];
  const activeLookups = [];
  const marks = [];
  const deliveries = [];
  const service = requireWithMocks("../src/services/queueNotificationOutboxDispatcher.js", {
    "../repositories/notificationDeliveries": {
      recordDelivery: async (data) => deliveries.push(data)
    },
    "../repositories/tenants": {
      findTenantById: async () => ({ _id: 7, name: "Demo Tenant", slug: "demo" })
    },
    "../repositories/storeLocations": {},
    "../repositories/tickets": {
      findTicketById: async () => ({
        _id: 9,
        userId: "21",
        ticketNumber: "D009",
        lookupCode: "LOOKUP9"
      })
    },
    "../repositories/users": {
      findUserById: async () => ({ notificationSettings: { queueAlerts: true } })
    },
    "../services/notificationService": {},
    "../services/pushNotificationService": {
      buildCustomerQueueNotificationPayload: ({ tenant, ticket, action, notificationId }) => ({
        title: "Queue update",
        body: `${tenant.name} is ${action} ${ticket.ticketNumber}.`,
        route: "ticket",
        ticketRef: ticket.lookupCode,
        eventType: `customer_queue_${action}`,
        notificationId
      }),
      notifyCustomerQueueUpdate: async () => {}
    },
    "../../mobile/fcmRegistrationService": {
      sendToRegistrations: async ({ registrations: pending, payload }) => {
        assert.equal(pending.length, 2);
        assert.equal(payload.route, "ticket");
        assert.equal(payload.ticketRef, "LOOKUP9");
        assert.match(payload.notificationId, /^outbox:42$/);
        return {
          attempted: 2,
          sent: 1,
          configured: true,
          outcomes: [
            { registrationId: "101", installationId: "ios-1", status: "accepted" },
            { registrationId: "102", installationId: "ios-2", status: "failed", error: "FCM delivery failed (400)." }
          ]
        };
      }
    },
    "../../mobile/pushRegistrationRepository": {
      listActiveByUserId: async () => {
        activeLookups.push(true);
        return activeLookups.length === 1 ? registrations : [registrations[0]];
      }
    },
    "../../mobile/mobilePushOutboxDeliveryRepository": {
      ensurePending: async (outboxId, values) => assert.deepEqual([outboxId, values], ["42", registrations]),
      claimPending: async (outboxId, workerId) => {
        assert.deepEqual([outboxId, workerId], ["42", "queue-outbox-direct"]);
        return registrations;
      },
      releasePending: async () => {},
      markSent: async (outboxId, registrationId) => marks.push(["sent", outboxId, registrationId]),
      markStale: async (outboxId, registrationId) => marks.push(["stale", outboxId, registrationId]),
      markFailure: async () => { throw new Error("transient failure should not be marked"); }
    },
    "./queueEmailTemplates": {
      queueLifecycleEmail: () => ({ subject: "Queue", html: "Queue" }),
      queueReconciliationEmail: () => ({ subject: "Queue", html: "Queue" })
    }
  });

  await service.dispatchIntent(buildIntent());

  assert.deepEqual(marks, [
    ["sent", "42", "101"],
    ["stale", "42", "102"]
  ]);
  assert.deepEqual(deliveries, [{
    tenantId: 7,
    ticketId: 9,
    channel: "fcm",
    purpose: "ticket_called",
    recipient: "user:21",
    provider: "fcm",
    status: "sent",
    outboxId: "42",
    metadata: { attempted: 2, sent: 1, stale: 1, skipped: false }
  }]);
});

test("FCM outbox delivery leaves transient installations pending for the outbox retry", async () => {
  const marks = [];
  const service = requireWithMocks("../src/services/queueNotificationOutboxDispatcher.js", {
    "../repositories/notificationDeliveries": {
      recordDelivery: async () => { throw new Error("must not record sent delivery"); }
    },
    "../repositories/tenants": { findTenantById: async () => ({ _id: 7, name: "Demo", slug: "demo" }) },
    "../repositories/storeLocations": {},
    "../repositories/tickets": {
      findTicketById: async () => ({ _id: 9, userId: "21", ticketNumber: "D009", lookupCode: "LOOKUP9" })
    },
    "../repositories/users": { findUserById: async () => ({ notificationSettings: { queueAlerts: true } }) },
    "../services/notificationService": {},
    "../services/pushNotificationService": {
      buildCustomerQueueNotificationPayload: () => ({ route: "ticket", ticketRef: "LOOKUP9" }),
      notifyCustomerQueueUpdate: async () => {}
    },
    "../../mobile/fcmRegistrationService": {
      sendToRegistrations: async () => ({
        attempted: 1,
        sent: 0,
        configured: true,
        outcomes: [{ registrationId: "101", status: "failed", error: "network" }]
      })
    },
    "../../mobile/pushRegistrationRepository": {
      listActiveByUserId: async () => [{ id: "101", installationId: "ios-1", token: "token-1", platform: "ios" }]
    },
    "../../mobile/mobilePushOutboxDeliveryRepository": {
      ensurePending: async () => {},
      claimPending: async () => [{ id: "101", installationId: "ios-1", token: "token-1", platform: "ios" }],
      releasePending: async () => {},
      markSent: async () => { throw new Error("must not mark transient delivery sent"); },
      markStale: async () => { throw new Error("must not mark transient delivery stale"); },
      markFailure: async (...args) => marks.push(args)
    },
    "./queueEmailTemplates": {
      queueLifecycleEmail: () => ({ subject: "Queue", html: "Queue" }),
      queueReconciliationEmail: () => ({ subject: "Queue", html: "Queue" })
    }
  });

  await assert.rejects(
    service.dispatchIntent({ ...buildIntent(), id: "43" }),
    /FCM delivery failed for 1 installation/
  );
  assert.deepEqual(marks, [["43", "101", "network", { workerId: "queue-outbox-direct" }]]);
});
