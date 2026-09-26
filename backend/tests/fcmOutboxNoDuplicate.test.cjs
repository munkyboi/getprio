const test = require("node:test");
const assert = require("node:assert/strict");
const { requireWithMocks } = require("./testSupport.cjs");

test("outbox Web Push delivery does not send a duplicate direct FCM notification", async () => {
  const browserNotifications = [];
  let fcmCalls = 0;
  const service = requireWithMocks("../src/services/pushNotificationService.js", {
    "../config/env": {
      vapidPublicKey: "public-key",
      vapidPrivateKey: "private-key",
      vapidSubject: "mailto:test@example.com"
    },
    "../repositories/pushSubscriptions": {
      listActiveByUserId: async () => [{
        _id: "subscription-1",
        endpoint: "https://push.example/customer",
        p256dh: "p256dh",
        auth: "auth"
      }],
      recordPushSuccess: async () => {}
    },
    "../repositories/users": {
      findUserById: async () => ({ notificationSettings: { queueAlerts: true } })
    },
    "../../mobile/fcmRegistrationService": {
      isConfigured: () => true,
      sendToUser: async () => {
        fcmCalls += 1;
        return { attempted: 1, sent: 1 };
      }
    },
    "web-push": {
      setVapidDetails: () => {},
      sendNotification: async (_subscription, payload) => browserNotifications.push(JSON.parse(payload))
    }
  });

  const result = await service.notifyCustomerQueueUpdate({
    tenant: { slug: "demo", name: "Demo Tenant" },
    ticket: { _id: "ticket-1", userId: "user-1", ticketNumber: "D001", lookupCode: "ABC12345" },
    action: "called",
    channels: { webPush: true, fcm: false }
  });

  assert.deepEqual(result, { attempted: 1, sent: 1 });
  assert.equal(browserNotifications[0].eventType, "customer_queue_called");
  assert.equal(fcmCalls, 0);
});
