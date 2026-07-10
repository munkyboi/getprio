require("tsx/cjs");

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { ApiError, apiRequest, setAuthHandlers, API_BASE_URL } = require("../src/api/client.ts");
const { getErrorMessage } = require("../src/utils/errors.ts");
const {
  buildTenantSlugFromName,
  buildUsernameFromName,
  isTenantSlugFormatValid,
  isUsernameFormatValid,
  normalizeTenantSlugInput,
  normalizeUsernameInput
} = require("../src/utils/usernames.ts");
const {
  formatPhilippineMobileNumber,
  isPhilippineMobileNumber,
  normalizePhilippineMobileNumber
} = require("../src/utils/phones.ts");
const {
  buildJoinPath,
  buildJoinUrl,
  buildJoinedQueuePath,
  buildJoinedQueuePathWithTicket,
  buildMonitorPath,
  buildMonitorPathWithTicket,
  buildMonitorUrl
} = require("../src/queuePaths.ts");
const {
  formatBookingScheduleDateTime,
  formatBookingScheduleTimeRange,
  formatDateInputValue,
  formatDateTime,
  formatDateTimeInputValue,
  formatDisplayDate,
  formatDisplayTime,
  toDate,
  toTimestamp
} = require("../src/utils/dates.ts");
const {
  clearJoinedQueueAccess,
  getJoinedQueueAccess,
  saveJoinedQueueAccess
} = require("../src/utils/joinedQueueAccess.ts");
const {
  isBrowserPushSupported,
  subscribeToBrowserPush
} = require("../src/utils/pushNotifications.ts");
const {
  getLocationStatusSummary,
  getQueueStateSummary,
  getTicketStateSummary
} = require("../src/utils/queueStatus.ts");
const { getBootstrap } = require("../src/api/vendorDashboardBootstrap.ts");
const {
  getAvailability,
  deleteAvailabilityBlock,
  deleteAvailabilityException,
  getCounters,
  getServices,
  deleteCounter,
  saveAvailabilityBlock,
  saveAvailabilityException,
  saveCounter,
  deactivateService,
  saveService,
  uploadLocationPaymentQr
} = require("../src/api/vendorDashboardCatalog.ts");
const {
  addStaff,
  getClients,
  getHistory,
  getStaff,
  removeStaff,
  saveLocation,
  saveLocationHours,
  saveTheme,
  uploadLocationPaymentQr: uploadLocationPaymentQrOperation,
  uploadThemeAsset,
  syncCheckout,
  updateLocation,
  updateNotificationSettings,
  updateSettings
} = require("../src/api/vendorDashboardOperations.ts");
const {
  getBookingDetail,
  getBookings,
  getRescheduleSlots,
  rescheduleBooking
} = require("../src/api/vendorDashboardBookings.ts");

function mockResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    }
  };
}

function withFetch(handler, fn) {
  const originalFetch = global.fetch;
  global.fetch = handler;
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      global.fetch = originalFetch;
    });
}

function withWindow(fn) {
  const originalWindow = global.window;
  const storage = new Map();
  global.window = {
    localStorage: {
      getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
      },
      setItem(key, value) {
        storage.set(key, String(value));
      },
      removeItem(key) {
        storage.delete(key);
      }
    }
  };

  return Promise.resolve()
    .then(() => fn(storage))
    .finally(() => {
      global.window = originalWindow;
    });
}

function withBrowserPushEnvironment(options, fn) {
  const originalWindow = global.window;
  const originalNavigator = global.navigator;
  const originalAtob = global.atob;
  const pushSubscription = {
    toJSON: () => ({
      endpoint: "https://push.example.test/subscription-1",
      keys: {
        p256dh: "p256dh-key",
        auth: "auth-key"
      }
    })
  };
  const calls = {
    permissionRequests: 0,
    serviceWorkerRegistrations: [],
    pushSubscribes: []
  };
  const permission = options.permission || "default";
  let currentPermission = permission;

  global.window = {
    isSecureContext: options.isSecureContext !== false,
    atob: (value) => Buffer.from(value, "base64").toString("binary"),
    Notification: options.withNotifications === false
      ? undefined
      : {
          get permission() {
            return currentPermission;
          },
          requestPermission: async () => {
            calls.permissionRequests += 1;
            currentPermission = options.requestedPermission || "granted";
            return currentPermission;
          }
        }
  };
  if (options.withPushManager !== false) {
    global.window.PushManager = function PushManager() {};
  }
  global.atob = global.window.atob;

  Object.defineProperty(global, "navigator", {
    configurable: true,
    writable: true,
    value: options.withServiceWorker === false
      ? {}
      : {
          serviceWorker: {
            register: async (scriptUrl) => {
              calls.serviceWorkerRegistrations.push(scriptUrl);
              return {
                pushManager: {
                  subscribe: async (subscribeOptions) => {
                    calls.pushSubscribes.push(subscribeOptions);
                    return pushSubscription;
                  }
                }
              };
            },
            ready: Promise.resolve({
              pushManager: {
                getSubscription: async () => options.existingSubscription || null
              }
            })
          }
        }
  });

  return Promise.resolve()
    .then(() => fn(calls))
    .finally(() => {
      global.window = originalWindow;
      global.atob = originalAtob;
      Object.defineProperty(global, "navigator", {
        configurable: true,
        writable: true,
        value: originalNavigator
      });
    });
}

test("utility formatters and validators cover common cases", () => {
  assert.equal(API_BASE_URL, "http://localhost:5001/api");
  assert.equal(getErrorMessage(new Error("boom")), "boom");
  assert.equal(getErrorMessage("nope", "fallback"), "fallback");

  assert.equal(buildUsernameFromName("Jane Doe!"), "jane_doe");
  assert.equal(normalizeUsernameInput("  Jane.Doe_99  "), "janedoe_99");
  assert.equal(isUsernameFormatValid("abc_123"), true);
  assert.equal(isUsernameFormatValid("ab"), false);

  assert.equal(buildTenantSlugFromName("Fresh Cuts Spa"), "fresh-cuts-spa");
  assert.equal(normalizeTenantSlugInput("  Fresh Cuts Spa "), "fresh-cuts-spa");
  assert.equal(normalizeTenantSlugInput("fresh-"), "fresh-");
  assert.equal(normalizeTenantSlugInput("Fresh--Cuts"), "fresh-cuts");
  assert.equal(isTenantSlugFormatValid("fresh-cuts-spa"), true);
  assert.equal(isTenantSlugFormatValid("-bad-"), false);

  assert.equal(normalizePhilippineMobileNumber("+639171234567"), "09171234567");
  assert.equal(normalizePhilippineMobileNumber("9171234567"), "09171234567");
  assert.equal(isPhilippineMobileNumber("09171234567"), true);
  assert.equal(formatPhilippineMobileNumber("+639171234567"), "(0917) 123-4567");

  assert.equal(buildJoinPath("tenant-1"), "/join/tenant-1");
  assert.equal(buildJoinPath("tenant-1", "main"), "/join/tenant-1/main");
  assert.equal(buildMonitorPath("tenant-1"), "/monitor/tenant-1");
  assert.equal(buildMonitorPath("tenant-1", "main"), "/monitor/tenant-1/main");
  assert.equal(buildJoinedQueuePath("tenant-1"), "/ticket/tenant-1");
  assert.equal(buildJoinedQueuePath("tenant-1", "main"), "/ticket/tenant-1/main");
  assert.equal(buildMonitorPathWithTicket("tenant-1", "abc"), "/monitor/tenant-1?ticket=abc");
  assert.equal(buildJoinedQueuePathWithTicket("tenant-1", "abc", "main"), "/ticket/tenant-1/main?ticket=abc");
  assert.equal(buildJoinUrl("https://example.com", "tenant-1"), "https://example.com/join/tenant-1");
  assert.equal(buildMonitorUrl("https://example.com", "tenant-1", "main"), "https://example.com/monitor/tenant-1/main");

  const localDate = new Date(2026, 5, 30, 8, 30, 0);
  const localDateLater = new Date(2026, 5, 30, 9, 30, 0);

  assert.equal(formatDateTime(localDate), "6/30/2026, 8:30:00 AM");
  assert.equal(formatDisplayDate(localDate), "30 Jun 2026");
  assert.equal(formatDisplayTime(localDate), "8:30 am");
  assert.equal(formatBookingScheduleDateTime(localDate), "30 Jun 2026 8:30 am");
  assert.equal(formatBookingScheduleTimeRange(localDate, localDateLater), "8:30 am - 9:30 am");
  assert.equal(formatDateInputValue(localDate), "2026-06-30");
  assert.equal(formatDateTimeInputValue(localDate), "2026-06-30T08:30");
  assert.equal(toDate("bad value"), null);
  assert.equal(Number.isNaN(toTimestamp("bad value")), true);
});

test("joined queue access persists normalized payloads", async () => {
  await withWindow(async (storage) => {
    saveJoinedQueueAccess("  abc123  ", {
      customerEmail: "  user@example.com ",
      customerPhone: "",
      customerName: " Jane Doe "
    });

    assert.equal(storage.size, 1);
    assert.deepEqual(getJoinedQueueAccess("abc123"), {
      customerEmail: "user@example.com",
      customerName: "Jane Doe"
    });

    clearJoinedQueueAccess("abc123");
    assert.equal(getJoinedQueueAccess("abc123"), null);
  });
});

test("joined queue access tolerates invalid storage and missing lookup codes", async () => {
  const originalWindow = global.window;
  delete global.window;
  assert.equal(getJoinedQueueAccess(""), null);
  saveJoinedQueueAccess("", { customerEmail: "x" });
  clearJoinedQueueAccess("");
  global.window = originalWindow;

  await withWindow(async () => {
    global.window.localStorage.setItem("getprio.joined-queue-access", "not-json");
    assert.equal(getJoinedQueueAccess("abc123"), null);
    clearJoinedQueueAccess("abc123");
  });

  await withWindow(async () => {
    global.window.localStorage.setItem("getprio.joined-queue-access", JSON.stringify({}));
    clearJoinedQueueAccess("abc123");
    assert.equal(getJoinedQueueAccess("abc123"), null);
  });
});

test("queue status summaries cover loading, state, and ticket variants", () => {
  assert.equal(getQueueStateSummary(null).label, "Loading");
  assert.equal(getQueueStateSummary({ queueDay: { isClosed: true }, queueIntake: { state: "open" }, location: { openStatus: { isOpen: true } } }).label, "Closed");
  assert.equal(getQueueStateSummary({ queueDay: { isClosed: false, isPaused: true }, queueIntake: { state: "open" }, location: { openStatus: { isOpen: true } } }).label, "Paused");
  assert.equal(getQueueStateSummary({ queueDay: { isClosed: false, isPaused: false }, queueIntake: { state: "near_limit" }, location: { openStatus: { isOpen: true } } }).label, "Near limit");
  assert.equal(getQueueStateSummary({ queueDay: { isClosed: false, isPaused: false }, queueIntake: { state: "open" }, location: { openStatus: { isOpen: true } } }).label, "Open");
  assert.equal(getLocationStatusSummary(null).label, "Loading");
  assert.equal(getLocationStatusSummary({ queueDay: { isClosed: false, isPaused: false }, queueIntake: { state: "open" }, location: { openStatus: { isOpen: false } } }).label, "Closed");
  assert.equal(getLocationStatusSummary({ queueDay: { isClosed: false, isPaused: false }, queueIntake: { state: "open" }, location: { openStatus: { isOpen: true } } }).label, "Open");
  assert.equal(getTicketStateSummary("waiting").label, "Joined");
  assert.equal(getTicketStateSummary("unknown").label, "Unknown");
});

test("browser push capability detection requires notifications, service workers, and PushManager", async () => {
  await withBrowserPushEnvironment({}, async () => {
    assert.equal(isBrowserPushSupported(), true);
  });

  await withBrowserPushEnvironment({ withNotifications: false }, async () => {
    assert.equal(isBrowserPushSupported(), false);
  });

  await withBrowserPushEnvironment({ withServiceWorker: false }, async () => {
    assert.equal(isBrowserPushSupported(), false);
  });

  await withBrowserPushEnvironment({ withPushManager: false }, async () => {
    assert.equal(isBrowserPushSupported(), false);
  });
});

test("browser push subscription requests permission and saves the browser subscription", async () => {
  const fetchCalls = [];
  await withBrowserPushEnvironment({ requestedPermission: "granted" }, async (browserCalls) => {
    await withFetch(
      async (url, options = {}) => {
        fetchCalls.push([String(url), options]);
        if (String(url).endsWith("/push/vapid-public-key")) {
          return mockResponse(200, {
            publicKey: Buffer.from("public-key").toString("base64url"),
            configured: true
          });
        }
        if (String(url).endsWith("/account/push-subscriptions")) {
          return mockResponse(200, {
            subscription: {
              _id: "subscription-1",
              userId: "user-1",
              tenantId: "tenant-1",
              endpoint: "https://push.example.test/subscription-1",
              userAgent: "node-test",
              isActive: true
            }
          });
        }
        return mockResponse(404, { message: "not found" });
      },
      async () => {
        const result = await subscribeToBrowserPush({ token: "token-1", tenantSlug: "demo" });

        assert.equal(result.permission, "granted");
        assert.equal(result.subscription.endpoint, "https://push.example.test/subscription-1");
        assert.equal(browserCalls.permissionRequests, 1);
        assert.deepEqual(browserCalls.serviceWorkerRegistrations, ["/service-worker.js"]);
        assert.equal(browserCalls.pushSubscribes.length, 1);
      }
    );
  });

  const saveCall = fetchCalls.find(([url]) => url.endsWith("/account/push-subscriptions"));
  assert.equal(saveCall[1].method, "POST");
  assert.equal(saveCall[1].headers.Authorization, "Bearer token-1");
  assert.deepEqual(JSON.parse(saveCall[1].body), {
    tenantSlug: "demo",
    subscription: {
      endpoint: "https://push.example.test/subscription-1",
      keys: {
        p256dh: "p256dh-key",
        auth: "auth-key"
      }
    }
  });
});

test("browser push subscription reports permission and configuration failures", async () => {
  await withBrowserPushEnvironment({ requestedPermission: "denied" }, async () => {
    await assert.rejects(
      () => subscribeToBrowserPush({ token: "token-1" }),
      /permission was not granted/i
    );
  });

  await withBrowserPushEnvironment({ isSecureContext: false }, async () => {
    await assert.rejects(
      () => subscribeToBrowserPush({ token: "token-1" }),
      /secure context|https/i
    );
  });

  await withBrowserPushEnvironment({ requestedPermission: "granted" }, async () => {
    await withFetch(
      async () => mockResponse(200, { publicKey: "", configured: false }),
      async () => {
        await assert.rejects(
          () => subscribeToBrowserPush({ token: "token-1" }),
          /not configured/i
        );
      }
    );
  });
});

test("apiRequest handles auth refresh and errors", async () => {
  let refreshCalls = 0;
  let failureCalls = 0;

  setAuthHandlers({
    refreshToken: async () => {
      refreshCalls += 1;
      return "next-token";
    },
    onAuthFailure: () => {
      failureCalls += 1;
    }
  });

  await withFetch(
    async (url, options) => {
      if (String(url).includes("/refresh")) {
        return mockResponse(200, { token: "next-token", refreshToken: "next-refresh", user: { id: "u1" } });
      }

      const auth = options.headers.Authorization;
      if (auth === "Bearer old-token") {
        return mockResponse(401, { message: "expired" });
      }

      return mockResponse(200, { ok: true });
    },
    async () => {
      const value = await apiRequest("/example", { token: "old-token" });
      assert.deepEqual(value, { ok: true });
      assert.equal(refreshCalls, 1);
      assert.equal(failureCalls, 0);
    }
  );

  await withFetch(
    async () => mockResponse(401, { message: "unauthorized" }),
    async () => {
      await assert.rejects(() => apiRequest("/private", { skipAuthRefresh: true }), (error) => {
        assert.equal(error instanceof ApiError, true);
        assert.equal(error.status, 401);
        return true;
      });
      assert.equal(failureCalls, 1);
    }
  );

  setAuthHandlers({ refreshToken: null, onAuthFailure: null });
});

test("vendor dashboard api helpers build the expected paths", async () => {
  const calls = [];

  await withFetch(async (url, options) => {
    calls.push([String(url), options]);
    if (String(url).includes("/uploads/direct")) {
      return mockResponse(200, { uploaded: true });
    }

    return mockResponse(200, { ok: true });
  }, async () => {
    await getBootstrap("token", "tenant", "?location=main");
    await getServices("token", "tenant");
    await getHistory("token", "tenant", "main");
    await getClients("token", "tenant", "?q=foo");
    await getStaff("token", "tenant");
    await syncCheckout("token", "tenant", "chk_1");
    await updateSettings("token", "tenant", { name: "New" });
    await updateNotificationSettings("token", "tenant", { sms: true });
    await addStaff("token", "tenant", { email: "staff@example.com" });
    await updateLocation("token", "tenant", "main", { isActive: true });
    await saveLocation("token", "tenant", null, { name: "Main" });
    await saveLocationHours("token", "tenant", "main", []);
    await saveTheme("token", "tenant", "main", { title: "Theme" });
    await saveService("token", "tenant", null, { name: "Service" });
    await saveService("token", "tenant", "svc-1", { name: "Service" });
    await deactivateService("token", "tenant", "svc-1");
    await saveAvailabilityBlock("token", "tenant", null, { label: "Block" });
    await saveAvailabilityBlock("token", "tenant", "block-1", { label: "Block" });
    await deleteAvailabilityBlock("token", "tenant", "block-1");
    await saveAvailabilityException("token", "tenant", "exc_1", { label: "Exception" });
    await saveAvailabilityException("token", "tenant", null, { label: "Exception" });
    await deleteAvailabilityException("token", "tenant", "exc_1");
    await saveCounter("token", "tenant", "main", null, { name: "Front" });
    await saveCounter("token", "tenant", "main", "counter-1", { name: "Front" });
    await deleteCounter("token", "tenant", "main", "counter-1");
    await removeStaff("token", "tenant", "staff_1");
    await getAvailability("token", "tenant", "main");
    await getCounters("token", "tenant", "main");
    await uploadThemeAsset("token", "tenant", "main", "logo", { name: "logo.png", type: "image/png" });
    await uploadLocationPaymentQrOperation("token", "tenant", "main", { name: "qr.png", type: "image/png" });
    await getBookings("token", "tenant", "main", 2, " alex ", "pending", ["2026-07-01", "2026-07-31"]);
    await getBookingDetail("token", "tenant", "booking-1", "main");
    await getRescheduleSlots("token", "tenant", "booking-1", "2026-07-07");
    await rescheduleBooking("token", "tenant", "booking-1", "2026-07-07T01:00:00.000Z");
  });

  assert.ok(calls.some(([url]) => url.includes("/vendor/tenant/tenant/locations")));
  assert.ok(calls.some(([url]) => url.includes("/vendor/tenant/tenant/dashboard?location=main")));
  assert.ok(calls.some(([url]) => url.includes("/billing/tenant/tenant/subscription")));
  assert.ok(calls.some(([url]) => url.includes("/vendor/tenant/tenant/clients?q=foo")));
  assert.ok(calls.some(([url]) => url.includes("/vendor/tenant/tenant/staff")));
  assert.ok(calls.some(([url]) => url.includes("/billing/tenant/tenant/checkout/chk_1/sync")));
  assert.ok(calls.some(([url, options]) => url.endsWith("/vendor/tenant/tenant/settings") && options.method === "PATCH"));
  assert.ok(calls.some(([url, options]) => url.endsWith("/vendor/tenant/tenant/notification-settings") && options.method === "PATCH"));
  assert.ok(calls.some(([url, options]) => url.endsWith("/vendor/tenant/tenant/staff") && options.method === "POST"));
  assert.ok(calls.some(([url, options]) => url.endsWith("/vendor/tenant/tenant/locations/main") && options.method === "PATCH"));
  assert.ok(calls.some(([url, options]) => url.endsWith("/vendor/tenant/tenant/locations") && options.method === "POST"));
  assert.ok(calls.some(([url]) => url.includes("/vendor/tenant/tenant/public-board-theme?location=main")));
  assert.ok(calls.some(([url]) => url.includes("/vendor/tenant/tenant/services")));
  assert.ok(calls.some(([url]) => url.includes("/vendor/tenant/tenant/availability")));
  assert.ok(calls.some(([url]) => url.includes("/vendor/tenant/tenant/counters")));
  assert.ok(calls.some(([url]) => url.includes("/uploads/direct?location=main&assetType=logo&fileName=logo.png")));
  assert.ok(calls.some(([url]) => url.includes("/location-payment-qrs/uploads/direct?locationSlug=main&fileName=qr.png")));
  assert.ok(
    calls.some(([url]) =>
      url.includes(
        "/vendor/tenant/tenant/bookings?page=2&pageSize=10&location=main&status=pending&scheduledDateFrom=2026-07-01&scheduledDateTo=2026-07-31&search=alex"
      )
    )
  );
  assert.ok(calls.some(([url]) => url.includes("/vendor/tenant/tenant/bookings/booking-1?location=main")));
  assert.ok(
    calls.some(([url]) =>
      url.includes("/vendor/tenant/tenant/bookings/booking-1/reschedule-slots?date=2026-07-07")
    )
  );
  assert.ok(
    calls.some(
      ([url, options]) =>
        url.endsWith("/vendor/tenant/tenant/bookings/booking-1/reschedule") && options.method === "PATCH"
    )
  );
});

test("web app metadata points crawlers and installed apps at committed assets", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const indexHtml = fs.readFileSync(path.join(frontendRoot, "index.html"), "utf8");
  const manifest = JSON.parse(
    fs.readFileSync(path.join(frontendRoot, "public", "manifest.webmanifest"), "utf8")
  );

  assert.match(indexHtml, /<link rel="manifest" href="\/manifest\.webmanifest" \/>/);
  assert.match(indexHtml, /<link rel="apple-touch-icon" href="\/apple-touch-icon\.png" \/>/);
  assert.match(
    indexHtml,
    /<meta name="viewport" content="width=device-width, initial-scale=1\.0, maximum-scale=1\.0, user-scalable=no, viewport-fit=cover" \/>/
  );
  assert.match(indexHtml, /<meta property="og:image" content="https:\/\/getprio\.online\/hero_image\.png" \/>/);
  assert.match(indexHtml, /<meta name="twitter:card" content="summary_large_image" \/>/);

  assert.equal(manifest.name, "GetPrio");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.display, "standalone");
  assert.deepEqual(
    manifest.icons.map((icon) => [icon.src, icon.sizes, icon.type]),
    [
      ["/app-icon-192.png", "192x192", "image/png"],
      ["/app-icon-512.png", "512x512", "image/png"]
    ]
  );

  for (const asset of ["apple-touch-icon.png", "app-icon-192.png", "app-icon-512.png", "app-icon-1024.png"]) {
    const stats = fs.statSync(path.join(frontendRoot, "public", asset));
    assert.equal(stats.isFile(), true);
    assert.ok(stats.size > 0, `${asset} should not be empty`);
  }
});

test("confirm action modal supports a mobile-specific class hook", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const confirmModalSource = fs.readFileSync(
    path.join(frontendRoot, "src", "components", "ConfirmActionModal.tsx"),
    "utf8"
  );
  const vendorDashboardSource = fs.readFileSync(
    path.join(frontendRoot, "src", "pages", "VendorDashboardPage.tsx"),
    "utf8"
  );

  assert.match(confirmModalSource, /className\?: string;/);
  assert.match(confirmModalSource, /<Modal\s+className=\{className\}/);
  assert.match(vendorDashboardSource, /<ConfirmActionModal\s+className="confirm-action-modal"/);
});
