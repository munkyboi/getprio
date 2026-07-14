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
const { getMaxBookableHours, getWeeklyAvailabilityDefaults } = require("../src/utils/availability.ts");
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

test("weekly availability defaults use the selected day's business hours", () => {
  assert.deepEqual(
    getWeeklyAvailabilityDefaults([
      { weekday: 1, opensAt: "07:00", closesAt: "02:00", isClosed: false }
    ], 1),
    { startsAt: "07:00", endsAt: "02:00", endsNextDay: true }
  );
  assert.deepEqual(
    getWeeklyAvailabilityDefaults([
      { weekday: 1, opensAt: "00:00", closesAt: "00:00", isClosed: false }
    ], 1),
    { startsAt: "00:00", endsAt: "23:59", endsNextDay: false }
  );
  assert.deepEqual(getWeeklyAvailabilityDefaults([], 1), { startsAt: "", endsAt: "", endsNextDay: false });
});

test("maximum bookable hours follows the selected location's daily store hours", () => {
  assert.equal(
    getMaxBookableHours([{ weekday: 1, opensAt: "22:00", closesAt: "02:00", isClosed: false }], 1),
    4
  );
  assert.equal(
    getMaxBookableHours([{ weekday: 1, opensAt: "08:00", closesAt: "20:30", isClosed: false }], 1),
    12
  );
  assert.equal(
    getMaxBookableHours([{ weekday: 1, opensAt: "00:00", closesAt: "00:00", isClosed: false }], 1),
    24
  );
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

test("service saves refresh location-service settings before the editor reopens", () => {
  const source = fs.readFileSync(
    path.join(path.resolve(__dirname, ".."), "src", "pages", "VendorDashboardPage.tsx"),
    "utf8"
  );
  const reloadServices = source.match(/async function reloadServices\(\) \{([\s\S]*?)\n  \}/)?.[1] || "";

  assert.match(reloadServices, /vendor-dashboard-services/);
  assert.match(reloadServices, /vendor-dashboard-location-services/);
});

test("vendor dashboard turns shared and dialog errors into one error toast", () => {
  const source = fs.readFileSync(
    path.join(path.resolve(__dirname, ".."), "src", "pages", "VendorDashboardPage.tsx"),
    "utf8"
  );

  assert.match(source, /const dashboardErrorMessage = \[/);
  assert.match(source, /bookingDetailError/);
  assert.match(source, /rescheduleSlotsError/);
  assert.match(source, /groupFundedProofError/);
  assert.match(source, /id: "vendor-dashboard-error"/);
  assert.match(source, /title: "Could not complete that action"/);
});

test("customer booking flows use shared Mantine notifications for API feedback", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const notificationSource = fs.readFileSync(path.join(frontendRoot, "src", "utils", "customerNotifications.ts"), "utf8");
  const groupFundedSource = fs.readFileSync(path.join(frontendRoot, "src", "pages", "GroupFundedCampaignPage.tsx"), "utf8");
  const bookingSource = fs.readFileSync(path.join(frontendRoot, "src", "pages", "BookingRequestPage.tsx"), "utf8");
  const accountSource = fs.readFileSync(path.join(frontendRoot, "src", "pages", "CustomerAccountPage.tsx"), "utf8");

  assert.match(notificationSource, /import \{ notifications \} from "@mantine\/notifications"/);
  assert.match(notificationSource, /export function showCustomerSuccess/);
  assert.match(notificationSource, /export function showCustomerError/);
  assert.match(groupFundedSource, /showCustomerSuccess\("Contribution proof submitted"/);
  assert.match(groupFundedSource, /showCustomerError\(getErrorMessage\(submitError\), "Could not submit contribution proof"\)/);
  assert.match(bookingSource, /showCustomerSuccess\("Campaign created"/);
  assert.match(bookingSource, /showCustomerError\(getErrorMessage\(proofError\), "Could not submit payment proof"\)/);
  assert.match(accountSource, /showCustomerSuccess\("Profile updated"/);
  assert.match(accountSource, /showCustomerError\(getErrorMessage\(saveError\), "Could not update profile"\)/);
});

test("group-funded contributor count uses a stepped slider within service limits", () => {
  const source = fs.readFileSync(
    path.join(path.resolve(__dirname, ".."), "src", "pages", "BookingRequestPage.tsx"),
    "utf8"
  );

  assert.match(source, /import \{[\s\S]*?Slider,[\s\S]*?\} from "@mantine\/core"/);
  assert.match(source, /<Slider[\s\S]*?aria-label="Required contributors"/);
  assert.match(source, /min=\{groupFundedMinContributors\}/);
  assert.match(source, /max=\{groupFundedMaxContributors\}/);
  assert.match(source, /step=\{1\}/);
  assert.match(source, /onChange=\{setRequiredContributors\}/);
  assert.match(source, /className="booking-value-slider"/);
  assert.match(source, /className="booking-slider-bounds" justify="space-between"/);
  assert.match(source, /Min \{groupFundedMinContributors\}/);
  assert.match(source, /Max \{groupFundedMaxContributors\}/);
});

test("group-funded visit length uses a stepped units slider", () => {
  const source = fs.readFileSync(
    path.join(path.resolve(__dirname, ".."), "src", "pages", "BookingRequestPage.tsx"),
    "utf8"
  );

  assert.match(source, /const groupFundedQuantityLabel = groupFundedQuantityService/);
  assert.match(source, /<Text fw=\{500\} size="sm">\{groupFundedQuantityLabel\}/);
  assert.match(source, /aria-label=\{groupFundedQuantityLabel\}/);
  assert.match(source, /setBookingQuantity\(value\)/);
  assert.match(source, /<Text c="dimmed" size="xs">1<\/Text>/);
  assert.match(source, /max=\{maxGroupFundedBookingQuantity\}/);
  assert.match(source, /\{maxGroupFundedBookingQuantity\}<\/Text>/);
  assert.doesNotMatch(source, /selectedBundleServices\.length\} item/);
});

test("group-funded contribution guidance uses customer-friendly payment language", () => {
  const source = fs.readFileSync(
    path.join(path.resolve(__dirname, ".."), "src", "pages", "BookingRequestPage.tsx"),
    "utf8"
  );

  assert.match(source, /Each person contributes/);
  assert.match(source, /Everyone pays the same amount in full/);
  assert.doesNotMatch(source, /V1 does not support partial payments/);
});

test("group-funded booking has a collapsed campaign summary and prominent submit action", () => {
  const source = fs.readFileSync(
    path.join(path.resolve(__dirname, ".."), "src", "pages", "BookingRequestPage.tsx"),
    "utf8"
  );

  assert.match(source, /<Accordion className="booking-campaign-summary">/);
  assert.match(source, /<Accordion.Control>/);
  assert.match(source, /Campaign summary/);
  assert.match(source, /formatBookingScheduleDate\(bookingDate\)\} · Choose a start time/);
  assert.match(source, /Funding deadline/);
  assert.match(source, /<Text fw=\{800\}>4\. Pick available services<\/Text>/);
  assert.match(source, /Choose a start time to see the services available for that visit\./);
  assert.match(source, /className=\{isGroupFundedMode \? "booking-campaign-submit customer-primary-action" : "customer-primary-action"\}/);
  assert.match(source, /h=\{isGroupFundedMode \? 56 : undefined\}/);
  assert.match(source, /\{isGroupFundedMode \? \[/);
  assert.match(source, /<Stepper\.Step key="verify-otp"/);
  assert.doesNotMatch(source, /\{isGroupFundedMode \? \(\s*<>/);
});

test("group-funded section labels use a consistent heading size", () => {
  const styles = fs.readFileSync(
    path.join(path.resolve(__dirname, ".."), "src", "styles.css"),
    "utf8"
  );

  assert.match(styles, /\.booking-schedule-field :where\(\.mantine-InputWrapper-label\) \{\s+font-size: 1rem;/);
  assert.match(styles, /\.booking-schedule-field :where\(\.mantine-InputWrapper-label\) \{[\s\S]*?font-weight: 800;/);
});

test("group-funded campaign descriptions retain organizer line breaks", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const source = fs.readFileSync(
    path.join(frontendRoot, "src", "pages", "GroupFundedCampaignPage.tsx"),
    "utf8"
  );
  const styles = fs.readFileSync(path.join(frontendRoot, "src", "styles.css"), "utf8");

  assert.match(source, /className="vendor-hero-description group-funded-campaign-description"/);
  assert.match(styles, /\.group-funded-campaign-description \{\s+white-space: pre-wrap;/);
});

test("group-funded campaign hero joins by smoothly scrolling to payment proof", () => {
  const source = fs.readFileSync(
    path.join(path.resolve(__dirname, ".."), "src", "pages", "GroupFundedCampaignPage.tsx"),
    "utf8"
  );

  assert.match(source, /const paymentProofSectionRef = useRef<HTMLDivElement \| null>\(null\);/);
  assert.match(source, /scrollIntoView\(\{ behavior: "smooth", block: "start" \}\)/);
  assert.match(source, /Join campaign/);
  assert.match(source, /onClick=\{scrollToPaymentProof\}/);
  assert.match(source, /ref=\{paymentProofSectionRef\}/);
  assert.doesNotMatch(source, />\s*Vendor details\s*</);
});

test("group-funded campaign business name links to the vendor profile", () => {
  const source = fs.readFileSync(
    path.join(path.resolve(__dirname, ".."), "src", "pages", "GroupFundedCampaignPage.tsx"),
    "utf8"
  );

  assert.match(source, /className="group-funded-vendor-link" component=\{Link\} to=\{`\/vendors\/\$\{campaign\.tenantSlug\}`\}/);
  assert.match(source, /\{campaign\.vendorName\}/);
});

test("group-funded campaign hero uses the vendor category and compact funding summary", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const source = fs.readFileSync(
    path.join(frontendRoot, "src", "pages", "GroupFundedCampaignPage.tsx"),
    "utf8"
  );
  const styles = fs.readFileSync(path.join(frontendRoot, "src", "styles.css"), "utf8");

  assert.match(source, /\{campaign\.vendorCategory \|\| "Business"\}/);
  assert.match(source, /Organized by \{campaign\.organizerDisplayName\}/);
  assert.match(source, /Funding \{formatPaymentAmount\(campaign\.fundedAmountCents, campaign\.currency\)\} \/ \{formatPaymentAmount\(campaign\.targetAmountCents, campaign\.currency\)\}/);
  assert.match(source, /<Text c="dimmed" size="xs">Join fee<\/Text>/);
  assert.match(source, /Deadline: \$\{daysFromNow\}/);
  assert.match(source, /Share link copied to clipboard/);
  assert.doesNotMatch(source, /<Text c="dimmed" size="xs">Target<\/Text>/);
  assert.match(styles, /\.group-funded-hero-badge \{/);
  assert.match(styles, /\.group-funded-share-toast \{/);
  assert.match(styles, /\.group-funded-hero-actions,/);
});

test("group-funded campaign details use thumbnail service rows and a report form", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const source = fs.readFileSync(
    path.join(frontendRoot, "src", "pages", "GroupFundedCampaignPage.tsx"),
    "utf8"
  );
  const styles = fs.readFileSync(path.join(frontendRoot, "src", "styles.css"), "utf8");

  assert.match(source, /<Text className="finazze-section-label">Bundled services<\/Text>/);
  assert.match(source, /<Title order=\{2\}>What's in this campaign<\/Title>/);
  assert.doesNotMatch(source, /bundleItems\.length.*Services/);
  assert.match(source, /className="group-funded-bundle-thumbnail"/);
  assert.match(source, /setImagePreview\(\{ name: item\.serviceName, imageUrl: item\.imageUrl \}\)/);
  assert.match(source, /You’re about to submit a report/);
  assert.match(source, /Why are you reporting this campaign\?/);
  assert.match(source, /Upload a screenshot/);
  assert.match(source, /value: "other"/);
  assert.match(source, /async function savePaymentQr\(\)/);
  assert.match(source, /const \[savingPaymentQr, setSavingPaymentQr\] = useState\(false\);/);
  assert.match(source, /const pendingActionKeysRef = useRef\(new Set<string>\(\)\);/);
  assert.match(source, /function claimPendingAction\(actionKey: string\)/);
  assert.match(source, /submit-contribution:\$\{campaign\.publicToken\}/);
  assert.match(source, /cancel-campaign:\$\{campaign\.publicToken\}/);
  assert.match(source, /save-campaign:\$\{campaign\.publicToken\}/);
  assert.match(source, /report-campaign:\$\{campaign\.publicToken\}/);
  assert.match(source, /const canShareCampaign = !isOrganizer \|\| campaign\?\.contribution\?\.contributionStatus === "verified";/);
  assert.match(source, /setSavingPaymentQr\(true\);/);
  assert.match(source, /setSavingPaymentQr\(false\);/);
  assert.match(source, /account\/group-funded-campaigns\/\$\{encodeURIComponent\(campaign\.publicToken\)\}\/payment-qr/);
  assert.match(source, /URL\.createObjectURL\(qrImage\)/);
  assert.match(source, />\s*Save QR\s*</);
  assert.match(source, /loading=\{savingPaymentQr\}/);
  assert.match(source, /className="group-funded-submit-button"/);
  assert.match(source, /className="group-funded-organizer-action"/);
  assert.match(source, /className="customer-modal group-funded-cancel-modal"/);
  assert.match(source, /title="Cancel this campaign\?"/);
  assert.match(source, /Cancel campaign and start refunds/);
  assert.match(source, /color="red" loading=\{submitting\} onClick=\{cancelCampaign\} size="lg" variant="outline" w="100%"/);
  assert.match(source, /className="customer-modal group-funded-report-modal"/);
  assert.match(source, /className="group-funded-report-actions"/);
  assert.match(source, /<Button onClick=\{\(\) => setReportModalOpen\(false\)\} size="lg" variant="light">Cancel<\/Button>/);
  assert.match(source, /const reportTurnstileSiteKey = import\.meta\.env\.VITE_TURNSTILE_SITE_KEY \|\| "";/);
  assert.match(source, /report-attachments\/direct\?fileName=/);
  assert.match(source, /attachmentObjectKey/);
  assert.match(source, /turnstileToken: reportTurnstileToken \|\| undefined/);
  assert.match(source, /Complete the security check before submitting your report/);
  assert.match(styles, /\.group-funded-report-modal \.mantine-Modal-inner/);
  assert.match(styles, /\.group-funded-report-actions > \.mantine-Button-root/);
  assert.match(source, /className="customer-modal"/);
  assert.match(source, /className="customer-modal-actions" justify="flex-end"/);
  assert.match(styles, /\.customer-modal \.mantine-Modal-content/);
  assert.match(styles, /\.customer-modal-actions > \.mantine-Button-root/);
  assert.doesNotMatch(source, /This slot is not reserved until the campaign is fully funded and approved by the vendor\./);
});

test("customer-facing modals share the mobile-first modal treatment", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const customerModalPages = [
    ["LandingPage.tsx", 1],
    ["CustomerBookingDetailPage.tsx", 2],
    ["JoinedQueuePage.tsx", 4],
    ["VendorProfilePage.tsx", 3],
    ["GroupFundedCampaignPage.tsx", 4]
  ];

  for (const [fileName, minimumModalCount] of customerModalPages) {
    const source = fs.readFileSync(path.join(frontendRoot, "src", "pages", fileName), "utf8");
    assert.ok((source.match(/className="customer-modal(?:\s|\")/g) || []).length >= minimumModalCount, `${fileName} should use customer modal styling`);
  }

  for (const fileName of ["JoinedQueuePage.tsx", "VendorProfilePage.tsx"]) {
    const source = fs.readFileSync(path.join(frontendRoot, "src", "pages", fileName), "utf8");
    assert.match(source, /className="customer-modal contact-vendor-modal"/);
    assert.doesNotMatch(source, /scrollAreaComponent=\{ScrollArea\.Autosize\}/);
  }
});

test("customer-facing primary actions use the mobile action treatment", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const styles = fs.readFileSync(path.join(frontendRoot, "src", "styles.css"), "utf8");
  const actionPages = [
    "LandingPage.tsx",
    "CustomerBookingDetailPage.tsx",
    "JoinedQueuePage.tsx",
    "VendorProfilePage.tsx",
    "JoinQueuePage.tsx",
    "BookingRequestPage.tsx",
    "CustomerAccountPage.tsx"
  ];

  for (const fileName of actionPages) {
    const source = fs.readFileSync(path.join(frontendRoot, "src", "pages", fileName), "utf8");
    assert.match(source, /customer-action-row|customer-primary-action/);
  }
  assert.match(styles, /\.customer-action-row > \.mantine-Button-root,/);
  assert.match(styles, /\.customer-primary-action/);
  assert.match(styles, /\.customer-modal-actions > \.mantine-Group-root \{\s+align-items: stretch;\s+flex-direction: column-reverse;/);
  assert.match(styles, /\.group-funded-report-actions \{\s+position: sticky;\s+bottom: 0;/);
  assert.match(
    fs.readFileSync(path.join(frontendRoot, "src", "pages", "BookingRequestPage.tsx"), "utf8"),
    /Verify and submit booking[\s\S]*customer-primary-action|customer-primary-action[\s\S]*Verify and submit booking/
  );
  assert.match(
    fs.readFileSync(path.join(frontendRoot, "src", "pages", "CustomerBookingDetailPage.tsx"), "utf8"),
    /Submit payment proof[\s\S]*customer-primary-action|customer-primary-action[\s\S]*Submit payment proof/
  );
});

test("vendor discovery uses a mobile-first search and card layout", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(frontendRoot, "src", "pages", "VendorDiscoveryPage.tsx"), "utf8");
  const styles = fs.readFileSync(path.join(frontendRoot, "src", "styles.css"), "utf8");

  assert.match(source, /className="vendor-search-actions"/);
  assert.match(source, /className="vendor-discovery-grid"/);
  assert.match(source, /className="vendor-card-actions"/);
  assert.match(source, /p=\{\{ base: "md", sm: "lg" \}\}/);
  assert.match(styles, /\.vendor-search-actions \{\s+align-items: stretch;\s+flex-direction: column;/);
  assert.match(styles, /\.vendor-search-input \{\s+flex: 0 1 auto;/);
  assert.match(styles, /\.vendor-card-actions > \.mantine-Button-root \{\s+min-height: 3\.25rem;/);
  assert.match(styles, /\.vendor-card \{\s+min-height: 0;/);
});

test("login actions are mobile-first", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const loginSource = fs.readFileSync(path.join(frontendRoot, "src", "pages", "LoginPage.tsx"), "utf8");
  const socialSource = fs.readFileSync(path.join(frontendRoot, "src", "components", "SocialAuthButtons.tsx"), "utf8");
  const styles = fs.readFileSync(path.join(frontendRoot, "src", "styles.css"), "utf8");

  assert.ok((loginSource.match(/className="auth-primary-action"/g) || []).length >= 3);
  assert.match(socialSource, /className="auth-social-action"/);
  assert.match(styles, /\.finazze-auth-card \.auth-primary-action,[\s\S]*?\.finazze-auth-card \.auth-social-action \{\s+width: 100%;\s+min-height: 3\.25rem;/);
});

test("vendor settings provide an editable business profile", () => {
  const source = fs.readFileSync(
    path.join(path.resolve(__dirname, ".."), "src", "pages", "VendorDashboardPage.tsx"),
    "utf8"
  );

  assert.match(source, /<Tabs\.Tab value="contact">Business profile<\/Tabs\.Tab>/);
  assert.match(source, /label="Business name"/);
  assert.match(source, /label="Business category"/);
  assert.match(source, /label="Owner name"/);
  assert.match(source, /label="Owner display name"/);
});

test("vendor group-funded discovery uses mobile-first booking controls and filters", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(frontendRoot, "src", "pages", "VendorProfilePage.tsx"), "utf8");
  const styles = fs.readFileSync(path.join(frontendRoot, "src", "styles.css"), "utf8");

  assert.match(source, /className="vendor-info-panel vendor-booking-options-panel" p=\{\{ base: "md", sm: "xl" \}\}/);
  assert.match(source, /<Stack className="vendor-campaign-filter-stack" gap="sm">/);
  assert.match(source, /<SimpleGrid cols=\{\{ base: 1, xs: 2 \}\} spacing="sm">/);
  assert.match(source, /className="vendor-group-funded-card-footer"/);
  assert.match(styles, /@media \(max-width: 768px\) \{\s+\.vendor-booking-option-tabs-list,/);
  assert.match(styles, /\.vendor-booking-option-toolbar \{\s+flex-direction: column;/);
  assert.match(styles, /\.vendor-group-funded-card-bundle \{\s+grid-template-columns: 1fr;/);
  assert.doesNotMatch(source, />\s*Join this queue\s*</);
  assert.doesNotMatch(source, />\s*Book here\s*</);
  assert.match(source, /className="vendor-booking-option-tab-content"/);
  assert.match(source, /className="vendor-contact-action customer-primary-action"/);
  assert.doesNotMatch(source, /scrollAreaComponent=\{ScrollArea\.Autosize\}/);
  assert.match(styles, /\.vendor-booking-option-tab-content \{\s+display: inline-flex;\s+align-items: center;\s+gap: 0\.45rem;/);
});

test("contact form submit action is mobile-first", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(frontendRoot, "src", "components", "ContactForm.tsx"), "utf8");
  const styles = fs.readFileSync(path.join(frontendRoot, "src", "styles.css"), "utf8");

  assert.match(source, /className="contact-form-submit-action"/);
  assert.match(source, /size="lg"/);
  assert.doesNotMatch(source, /offsetScrollbars/);
  assert.doesNotMatch(source, /<Stack gap="lg" pr="sm">/);
  assert.match(styles, /\.contact-form-footer \{\s+align-items: stretch;\s+flex-direction: column;/);
  assert.match(styles, /\.contact-form-submit-action \{\s+width: 100%;\s+min-height: 3\.25rem;/);
  assert.match(styles, /\.customer-modal\.contact-vendor-modal \.mantine-Modal-content \{\s+height: min\(92dvh, 48rem\) !important;\s+display: flex;/);
  assert.match(styles, /\.customer-modal\.contact-vendor-modal \.contact-form-body \{[\s\S]*?display: flex;\s+flex-direction: column;/);
  assert.match(styles, /\.customer-modal\.contact-vendor-modal \.mantine-Modal-body \{\s+display: flex;\s+flex: 1 1 auto !important;/);
  assert.match(styles, /\.customer-modal\.contact-vendor-modal \.contact-form-main \{\s+flex: 1 1 auto;\s+min-height: 0;/);
  assert.match(styles, /\.contact-form-footer \{[\s\S]*?flex: 0 0 auto;/);
});

test("vendor group-funded discovery defaults to all campaigns without a date range", () => {
  const source = fs.readFileSync(
    path.join(path.resolve(__dirname, ".."), "src", "pages", "VendorProfilePage.tsx"),
    "utf8"
  );

  assert.match(source, /const GROUP_FUNDED_FILTER_STORAGE_KEY = "getprio:vendor-profile:group-funded-filters:v2";/);
  assert.match(source, /ongoing: false,\s+dateRange: \[null, null\]/);
  assert.match(source, /if \(campaignDateFrom\) \{\s+params\.set\("scheduledDateFrom", campaignDateFrom\);/);
  assert.match(source, /if \(campaignDateTo\) \{\s+params\.set\("scheduledDateTo", campaignDateTo\);/);
  assert.match(source, /const campaignMinDate = useMemo\(\(\) => \{/);
  assert.match(source, /minDate=\{campaignMinDate\}/);
  assert.doesNotMatch(source, /GROUP_FUNDED_DEFAULT_RANGE_DAYS/);
});

test("the app has a recovery boundary and a dedicated mobile-first 404 page", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const app = fs.readFileSync(path.join(frontendRoot, "src", "App.tsx"), "utf8");
  const main = fs.readFileSync(path.join(frontendRoot, "src", "main.tsx"), "utf8");
  const boundary = fs.readFileSync(path.join(frontendRoot, "src", "components", "AppErrorBoundary.tsx"), "utf8");
  const notFound = fs.readFileSync(path.join(frontendRoot, "src", "pages", "NotFoundPage.tsx"), "utf8");
  const styles = fs.readFileSync(path.join(frontendRoot, "src", "styles.css"), "utf8");

  assert.match(main, /<AppErrorBoundary>/);
  assert.match(boundary, /static getDerivedStateFromError\(\)/);
  assert.match(boundary, /Try again/);
  assert.match(app, /path="\*" element=\{<AppShell><NotFoundPage \/><\/AppShell>\}/);
  assert.match(notFound, /Error 404/);
  assert.match(notFound, /This page took a detour\./);
  assert.match(notFound, /not-found-wayfinding-transparent\.png/);
  assert.match(styles, /\.not-found-page \{/);
  assert.match(styles, /\.app-error-boundary \{/);
  assert.equal(fs.existsSync(path.join(frontendRoot, "public", "illustrations", "generated", "not-found-wayfinding-transparent.png")), true);
});

test("missing campaign and booking responses use the shared recovery state", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const campaign = fs.readFileSync(path.join(frontendRoot, "src", "pages", "GroupFundedCampaignPage.tsx"), "utf8");
  const booking = fs.readFileSync(path.join(frontendRoot, "src", "pages", "CustomerBookingDetailPage.tsx"), "utf8");
  const state = fs.readFileSync(path.join(frontendRoot, "src", "components", "ResourceErrorState.tsx"), "utf8");
  const styles = fs.readFileSync(path.join(frontendRoot, "src", "styles.css"), "utf8");

  assert.match(state, /const isNotFound = status === 404;/);
  assert.match(state, /className="not-found-page resource-error-state"/);
  assert.match(state, /This link is unavailable\./);
  assert.match(state, /Try again/);
  assert.match(state, /not-found-wayfinding-transparent\.png/);
  assert.match(styles, /\.resource-error-actions \{\s+width: max-content;\s+max-width: 100%;\s+flex-wrap: nowrap;/);
  assert.match(campaign, /<ResourceErrorState/);
  assert.match(campaign, /resourceName="group-funded campaign"/);
  assert.match(booking, /resourceName="booking"/);
  assert.match(campaign, /fallbackError instanceof ApiError \? fallbackError\.status : null/);
  assert.match(booking, /loadError instanceof ApiError \? loadError\.status : null/);
});

test("an unknown queue ticket uses the shared not-found recovery state", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const ticket = fs.readFileSync(path.join(frontendRoot, "src", "pages", "JoinedQueuePage.tsx"), "utf8");

  assert.match(ticket, /import \{ API_BASE_URL, ApiError, apiRequest \} from "\.\.\/api\/client";/);
  assert.match(ticket, /setResponseStatus\(loadError instanceof ApiError \? loadError\.status : null\);/);
  assert.match(ticket, /if \(lookupCode && !nextSnapshot\.focusTicket\)/);
  assert.match(ticket, /if \(responseStatus === 404\)/);
  assert.match(ticket, /resourceName="queue ticket"/);
});
