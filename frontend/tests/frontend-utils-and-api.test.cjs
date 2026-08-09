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
  formatBookingScheduleDate,
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
  getCustomerTicketStateSummary,
  getLocationStatusSummary,
  getQueueStateSummary,
  getTicketStateSummary,
  isQueueAcceptingJoins,
  resolveQueueDayState
} = require("../src/utils/queueStatus.ts");
const {
  getQueueCustomerDisplayName,
  getQueueCustomerFullNameLabel,
  maskCustomerName
} = require("../src/utils/queueNames.ts");
const { getMaxBookableHours, getWeeklyAvailabilityDefaults } = require("../src/utils/availability.ts");
const { getCampaignFundingPercent } = require("../src/utils/campaignFunding.ts");
const { formatRatingCount } = require("../src/utils/ratings.ts");
const {
  formatCampaignHeroDeadline,
  formatCampaignHeroScheduleDate,
  formatCampaignHeroScheduleSummary
} = require("../src/utils/campaignHero.ts");
const { getBillingOverview, getBootstrap } = require("../src/api/vendorDashboardBootstrap.ts");
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
  rateOrganizer,
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

test("campaign funding progress uses monetary percentage and a bottom-right label", () => {
  const component = fs.readFileSync(
    path.join(path.resolve(__dirname, ".."), "src", "components", "CampaignFundingProgress.tsx"),
    "utf8"
  );

  assert.equal(getCampaignFundingPercent(8500, 10000), 85);
  assert.equal(getCampaignFundingPercent(1000, 1500), 67);
  assert.equal(getCampaignFundingPercent(2000, 1500), 100);
  assert.equal(getCampaignFundingPercent(-1, 0), 0);
  assert.match(component, /aria-label=\{`Campaign funding \$\{fundingPercent\}%`\}/);
  assert.match(component, /ta="right"/);
  assert.match(component, /Funding: \{fundingPercent\}%/);
});

test("rating counts stay exact below one thousand and compact above it", () => {
  assert.equal(formatRatingCount(0), "0");
  assert.equal(formatRatingCount(2), "2");
  assert.equal(formatRatingCount(999), "999");
  assert.equal(formatRatingCount(1000), "1k");
  assert.equal(formatRatingCount(4215), "4.2k");
  assert.equal(formatRatingCount(1_250_000), "1.3m");
});

test("campaign hero cards format deadlines and schedules consistently", () => {
  const component = fs.readFileSync(
    path.join(path.resolve(__dirname, ".."), "src", "components", "CampaignHeroStats.tsx"),
    "utf8"
  );
  const start = "2026-08-20T02:30:00.000Z";
  const end = "2026-08-20T06:30:00.000Z";
  const deadline = "2026-08-19T14:00:00.000Z";

  assert.equal(formatCampaignHeroDeadline(deadline), "19 Aug 2026 at 10:00 PM");
  assert.equal(formatCampaignHeroScheduleDate(start), "20 Aug 2026");
  assert.equal(formatCampaignHeroScheduleSummary(start, end), "10:30 AM - 2:30 PM (4 Hours)");
  assert.match(component, /<Text size="xs">Join fee<\/Text>/);
  assert.match(component, /Deadline: \{formatCampaignHeroDeadline\(deadlineAt, timeZone\)\}/);
  assert.match(component, /<Text size="xs">Schedule<\/Text>/);
  assert.match(component, /formatCampaignHeroScheduleDate\(scheduledStartAt, timeZone\)/);
  assert.match(component, /formatCampaignHeroScheduleSummary\(scheduledStartAt, scheduledEndAt, timeZone\)/);
  assert.match(component, /<CampaignContributorProgress/);
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
  assert.equal(getQueueStateSummary({ queueDay: { isClosed: true }, queueIntake: { state: "open" }, location: { openStatus: { isOpen: true } } }).label, "Queue closed");
  assert.equal(getQueueStateSummary({ queueDay: { isClosed: true, state: "unopened", availabilityReason: "not_opened" }, queueIntake: { state: "closed" }, location: { openStatus: { isOpen: true } } }).label, "Not open yet");
  assert.equal(getQueueStateSummary({ queueDay: { isClosed: false, state: "open", availabilityReason: "reconciling" }, queueIntake: { state: "closed" }, location: { openStatus: { isOpen: true } } }).label, "Queue closing");
  assert.equal(getQueueStateSummary({ queueDay: { isClosed: true, availabilityReason: "outside_store_hours" }, queueIntake: { state: "closed" }, location: { openStatus: { isOpen: false, nextOpenAt: null } } }).label, "Store closed");
  assert.equal(getQueueStateSummary({ queueDay: { isClosed: false, isPaused: true }, queueIntake: { state: "open" }, location: { openStatus: { isOpen: true } } }).label, "Paused");
  assert.equal(getQueueStateSummary({ queueDay: { isClosed: false, isPaused: false }, queueIntake: { state: "near_limit" }, location: { openStatus: { isOpen: true } } }).label, "Near limit");
  assert.equal(getQueueStateSummary({ queueDay: { isClosed: false, isPaused: false }, queueIntake: { state: "open" }, location: { openStatus: { isOpen: true } } }).label, "Open");
  assert.equal(getLocationStatusSummary(null).label, "Loading");
  assert.equal(getLocationStatusSummary({ queueDay: { isClosed: false, isPaused: false }, queueIntake: { state: "open" }, location: { openStatus: { isOpen: false } } }).label, "Closed");
  assert.equal(getLocationStatusSummary({ queueDay: { isClosed: false, isPaused: false }, queueIntake: { state: "open" }, location: { openStatus: { isOpen: true } } }).label, "Open");
  assert.equal(getTicketStateSummary("waiting").label, "Joined");
  assert.equal(getTicketStateSummary("pending_carry_over").label, "Saved for carry-over");
  assert.equal(getTicketStateSummary("expired").label, "Expired");
  assert.match(getTicketStateSummary("unserved").message, /final/);
  assert.equal(getTicketStateSummary("unknown").label, "Unknown");
  assert.equal(getCustomerTicketStateSummary("called", null).label, "Called");
  assert.equal(
    getCustomerTicketStateSummary("called", "2026-08-09T02:32:00.000Z").label,
    "Confirmed"
  );
  assert.match(
    getCustomerTicketStateSummary("called", "2026-08-09T02:32:00.000Z").message,
    /wait for staff to begin service/
  );
});

test("queue customer names prefer display names and mask submitted-name fallbacks", () => {
  assert.equal(maskCustomerName("Doreen Mills"), "D***n M***s");
  assert.equal(getQueueCustomerDisplayName("Doreen Mills", "Maldita"), "Maldita");
  assert.equal(getQueueCustomerDisplayName("Doreen Mills", "  "), "D***n M***s");
});

test("customer-facing and staff-facing queue labels show display names beside full names", () => {
  assert.equal(getQueueCustomerFullNameLabel("Alex Boyer", "LexBoy"), "Alex Boyer (LexBoy)");
  assert.equal(getQueueCustomerFullNameLabel("Alex Boyer", "  "), "Alex Boyer");
  assert.equal(getQueueCustomerFullNameLabel("Alex Boyer", "alex boyer"), "Alex Boyer");
});

test("queue name formatters tolerate identity-redacted live updates", () => {
  assert.equal(getQueueCustomerDisplayName(undefined, undefined), "Customer");
  assert.equal(getQueueCustomerFullNameLabel(undefined, undefined), "Customer");
});

test("vendor queue live updates refetch the authenticated snapshot instead of rendering public data", () => {
  const source = fs.readFileSync(
    path.join(path.resolve(__dirname, ".."), "src", "pages", "VendorDashboardPage.tsx"),
    "utf8"
  );
  const streamEffect = source.match(
    /const eventSource = new EventSource\([\s\S]*?eventSource\.onerror = \(\) => \{/
  );

  assert.ok(streamEffect, "vendor dashboard should subscribe to queue updates");
  assert.doesNotMatch(streamEffect[0], /setSnapshot\(payload\)/);
  assert.match(
    streamEffect[0],
    /invalidateQueries\(\{[\s\S]*?queryKey:\s*\[\s*"vendor-dashboard-queue-lifecycle"/
  );
});

test("queue day state resolver supports both lifecycle and legacy snapshots", () => {
  assert.equal(resolveQueueDayState({ state: "unopened", isClosed: true }), "unopened");
  assert.equal(resolveQueueDayState({ state: "open", isClosed: false }), "open");
  assert.equal(resolveQueueDayState({ state: "closed", isClosed: true }), "closed");
  assert.equal(resolveQueueDayState({ isClosed: false }), "open");
  assert.equal(resolveQueueDayState({ isClosed: true }), "closed");
});

test("queue join availability supports lifecycle and legacy snapshots", () => {
  assert.equal(isQueueAcceptingJoins(null), false);
  assert.equal(
    isQueueAcceptingJoins({
      queueDay: { isClosed: false, isPaused: false },
      queueIntake: { state: "open" }
    }),
    true
  );
  assert.equal(
    isQueueAcceptingJoins({
      queueDay: { isClosed: false, isPaused: true },
      queueIntake: { state: "paused" }
    }),
    false
  );
  assert.equal(
    isQueueAcceptingJoins({
      queueDay: { state: "open", intakeMode: "accepting", isClosed: false, isPaused: false },
      queueIntake: { state: "open" }
    }),
    true
  );
  assert.equal(
    isQueueAcceptingJoins({
      queueDay: {
        state: "open",
        intakeMode: "accepting",
        availabilityReason: "reconciling",
        isClosed: false,
        isPaused: false
      },
      queueIntake: { state: "closed" }
    }),
    false
  );
});

test("join queue page is a focused vendor-themed customer flow", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const source = fs.readFileSync(
    path.join(frontendRoot, "src", "pages", "JoinQueuePage.tsx"),
    "utf8"
  );
  const styles = fs.readFileSync(path.join(frontendRoot, "src", "styles.css"), "utf8");

  assert.match(source, /className="vendor-profile-page join-queue-page"/);
  assert.match(source, /className="vendor-hero-shell join-queue-card"/);
  assert.match(source, /Your saved contact details are prefilled/);
  assert.match(source, /const requiresQueuePayment = Boolean\([\s\S]*?tenantInfo\?\.queueFee\.enabled/);
  assert.match(source, /const canSkipOtp = !form\.notifyByEmail && !requiresQueuePayment/);
  assert.match(source, /A queue fee of \{tenantInfo\.queueFee\.displayAmount\} is required/);
  assert.doesNotMatch(source, /Profile details/);
  assert.doesNotMatch(source, /What happens next/);
  assert.doesNotMatch(source, /finazze-join-side/);
  assert.match(source, /className="join-queue-status-top"[\s\S]*?className="join-queue-status-badge"/);
  assert.match(styles, /\.join-queue-frame/);
  assert.match(styles, /\.join-queue-status-badge \{[\s\S]*?flex: 0 0 auto;[\s\S]*?width: max-content;[\s\S]*?max-width: none;/);
  assert.match(styles, /\.join-queue-status-badge :where\(\.mantine-Badge-label\) \{[\s\S]*?text-overflow: clip;[\s\S]*?white-space: nowrap;/);
  assert.match(styles, /\.join-queue-status-message \{[\s\S]*?text-align: left;/);
  assert.match(styles, /@media \(min-width: 48\.0625em\) \{[\s\S]*?\.join-queue-header/);
});

test("vendor queue auto-close uses the selected global tray and mobile task modal contract", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const source = fs.readFileSync(
    path.join(frontendRoot, "src", "components", "VendorQueueLifecycleTray.tsx"),
    "utf8"
  );
  const dashboard = fs.readFileSync(
    path.join(frontendRoot, "src", "pages", "VendorDashboardPage.tsx"),
    "utf8"
  );
  const styles = fs.readFileSync(path.join(frontendRoot, "src", "styles.css"), "utf8");

  assert.match(dashboard, /<VendorQueueLifecycleTray/);
  assert.match(source, /Review & extend/);
  assert.match(source, /Cancel auto-close/);
  assert.match(source, /Confirm 30-minute extension/);
  assert.match(source, /Close queue and reconcile/);
  assert.match(source, /serverOffset/);
  assert.match(source, /aria-live=/);
  assert.ok(source.includes('window.addEventListener("focus"'));
  assert.ok(source.includes('window.addEventListener("online"'));
  assert.match(styles, /\.queue-lifecycle-tray/);
  assert.match(styles, /\.queue-auto-close-modal \.mantine-Modal-content/);
  assert.match(styles, /height: min\(92dvh, 48rem\)/);
  assert.match(styles, /env\(safe-area-inset-bottom\)/);
});

test("public queue board uses the compact calendar and status clock", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const source = fs.readFileSync(
    path.join(frontendRoot, "src", "pages", "PublicQueuePage.tsx"),
    "utf8"
  );
  const styles = fs.readFileSync(path.join(frontendRoot, "src", "styles.css"), "utf8");

  assert.match(source, /className="public-board-tv-calendar"/);
  assert.match(source, /className="public-board-tv-clock-statuses"/);
  assert.match(source, /Location <strong>\{locationState\.label\}<\/strong>/);
  assert.match(source, /Queue <strong>\{queueState\.label\}<\/strong>/);
  assert.doesNotMatch(source, /Top tickets are emphasized/);
  assert.match(styles, /\.public-board-tv-clock \{[\s\S]*?grid-template-columns: 88px minmax\(0, 1fr\)/);
});

test("public and customer queue streams retain EventSource automatic reconnect", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  for (const file of ["JoinQueuePage.tsx", "PublicQueuePage.tsx", "JoinedQueuePage.tsx"]) {
    const source = fs.readFileSync(path.join(frontendRoot, "src", "pages", file), "utf8");
    assert.match(source, /Live (queue )?updates interrupted\. Reconnecting…/);
    const onError = source.match(/eventSource\.onerror = \(\) => \{([\s\S]*?)\n    \};/);
    assert.ok(onError, `${file} should define an EventSource error handler`);
    assert.doesNotMatch(onError[1], /eventSource\.close\(\)/);
  }
});

test("joined queue details refetch through the authenticated owner boundary", () => {
  const source = fs.readFileSync(
    path.join(path.resolve(__dirname, ".."), "src", "pages", "JoinedQueuePage.tsx"),
    "utf8"
  );

  assert.match(source, /apiRequest<QueueSnapshot>\(`\$\{basePath\}\/queue\$\{query\}`,[\s\S]*?token/);
  assert.match(source, /new EventSource\(`\$\{API_BASE_URL\}\$\{basePath\}\/stream`\)/);
  assert.doesNotMatch(source, /new EventSource\(`\$\{API_BASE_URL\}\$\{basePath\}\/stream\$\{query\}`\)/);
  assert.match(source, /eventSource\.onmessage = \(\) => \{[\s\S]*?loadSnapshot\(\)/);
  assert.match(source, /\[401, 403, 404\]\.includes\(responseStatus \|\| 0\)/);
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
    await getBillingOverview("token", "tenant");
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
    await rateOrganizer("token", "tenant", "booking-1", { stars: 5 });
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
  assert.ok(
    calls.some(
      ([url, options]) =>
        url.endsWith("/vendor/tenant/tenant/bookings/booking-1/organizer-rating") && options.method === "POST"
    )
  );
});

test("subscription plans load independently when dashboard bootstrap fails", async () => {
  const billingResponse = {
    plans: [{ slug: "free" }, { slug: "economical" }, { slug: "pro" }, { slug: "enterprise" }],
    addOns: [],
    subscription: null
  };

  await withFetch(async (url) => {
    if (String(url).includes("/billing/tenant/tenant/subscription")) {
      return mockResponse(200, billingResponse);
    }

    return mockResponse(500, { message: "Dashboard data unavailable." });
  }, async () => {
    await assert.rejects(() => getBootstrap("token", "tenant", ""));
    assert.deepEqual(await getBillingOverview("token", "tenant"), billingResponse);
  });

  const dashboardSource = fs.readFileSync(
    path.join(path.resolve(__dirname, ".."), "src", "pages", "VendorDashboardPage.tsx"),
    "utf8"
  );
  assert.match(dashboardSource, /const billingOverviewQuery = useQuery\(/);
  assert.match(dashboardSource, /vendorDashboardBootstrap\.getBillingOverview\(token, selectedTenantSlug\)/);
  assert.match(dashboardSource, /setBilling\(billingOverviewQuery\.data\)/);
  assert.match(dashboardSource, /className="subscription-plan-grid"/);
  assert.match(dashboardSource, /const visiblePlans = billing\.plans\.filter\(\(plan\) => !paidOnly \|\| plan\.slug !== "free"\)/);
  assert.match(dashboardSource, /md: Math\.min\(visiblePlans\.length, 4\)/);
  assert.match(dashboardSource, /className="subscription-plan-modal"[\s\S]*?size="90rem"/);
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
  assert.match(confirmModalSource, /className=\{\["task-modal", "confirm-action-modal", className\]\.filter\(Boolean\)\.join\(" "\)\}/);
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

test("customer booking history summarizes standard and campaign service bundles", () => {
  const source = fs.readFileSync(
    path.join(path.resolve(__dirname, ".."), "src", "pages", "CustomerAccountPage.tsx"),
    "utf8"
  );

  assert.match(source, /const isGroupFundedBooking = booking\.bookingPaymentSource === "group_funded"/);
  assert.match(source, /booking\.groupFundedCampaign\?\.bundleItems\?\.length/);
  assert.match(source, /: booking\.bundleItems \|\| \[\]/);
  assert.match(source, /\+\$\{additionalServiceCount\} service/);
  assert.match(source, /\{executionModeLabel\} bundle/);
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

test("vendor group-funded settings keep policy controls concise", () => {
  const source = fs.readFileSync(
    path.join(path.resolve(__dirname, ".."), "src", "pages", "VendorDashboardPage.tsx"),
    "utf8"
  );

  assert.match(source, /label="Min contributors"/);
  assert.match(source, /label="Max contributors"/);
  assert.match(source, />Advanced funding window</);
  assert.match(source, /label="Min deadline hours"/);
  assert.match(source, /label="Max deadline days"/);
  assert.match(source, /label="Allow public campaigns on vendor profile"/);
  assert.doesNotMatch(source, /label="Default contributors"/);
  assert.doesNotMatch(source, /label="Min share"/);
  assert.doesNotMatch(source, /label="Max share"/);
});

test("booking services use their own stepped quantity sliders", () => {
  const source = fs.readFileSync(
    path.join(path.resolve(__dirname, ".."), "src", "pages", "BookingRequestPage.tsx"),
    "utf8"
  );

  assert.match(source, /const quantityLabel = getBookingQuantityLabel\(service\)/);
  assert.match(source, /aria-label=\{`\$\{service\.name\} \$\{quantityLabel\}`\}/);
  assert.match(source, /const updateServiceQuantity = useCallback/);
  assert.match(source, /onChange=\{\(value\) => updateServiceQuantity\(service, value\)\}/);
  assert.match(source, /max=\{maxGroupFundedBookingQuantity\}/);
  assert.match(source, /disabled=\{Boolean\(otp\) \|\| !isSelected\}/);
  assert.doesNotMatch(source, /selectedBundleServices\.length\} item/);
});

test("together bookings synchronize matching-duration service quantity sliders", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const source = fs.readFileSync(
    path.join(frontendRoot, "src", "pages", "BookingRequestPage.tsx"),
    "utf8"
  );

  assert.match(source, /const shouldSynchronizeTogetherQuantities = useMemo/);
  assert.match(source, /executionMode !== "parallel"/);
  assert.match(source, /service\.durationMinutes === sharedDuration/);
  assert.match(source, /const updateServiceQuantity = useCallback/);
  assert.match(source, /if \(shouldSynchronizeTogetherQuantities\) \{/);
  assert.match(source, /onChange=\{\(value\) => updateServiceQuantity\(service, value\)\}/);
  assert.match(source, /Matching service durations are linked while this visit is together\./);
});

test("group-funded slot selection keeps the composed service bundle selected", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const source = fs.readFileSync(
    path.join(frontendRoot, "src", "pages", "BookingRequestPage.tsx"),
    "utf8"
  );

  assert.match(source, /includeGroupFundedHolds: isGroupFundedMode/);
  assert.match(source, /setSlots\(data\.slots \|\| \[\]\);/);
  assert.doesNotMatch(source, /groupFundedSlotsByService/);
  assert.doesNotMatch(source, /groupFundedServiceEligibility/);
  assert.doesNotMatch(source, /eligibleSlugs/);
});

test("booking availability uses a time-slot picker and resolves deadline bounds from the selected instant", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const source = fs.readFileSync(
    path.join(frontendRoot, "src", "pages", "BookingRequestPage.tsx"),
    "utf8"
  );
  const styles = fs.readFileSync(path.join(frontendRoot, "src", "styles.css"), "utf8");

  assert.match(source, /slots\.find\(\(slot\) => toTimestamp\(slot\.startAt\) === selectedTimestamp\)/);
  assert.match(source, /import \{ Carousel \} from "@mantine\/carousel";/);
  assert.match(source, /import \{ useMediaQuery \} from "@mantine\/hooks";/);
  assert.match(source, /className="booking-time-slot-carousel"/);
  assert.match(source, /const slotCarouselGroups = useMemo\(\(\) => \{/);
  assert.match(source, /const groupSize = isMobileViewport \? 4 : 1;/);
  assert.match(source, /slotCarouselGroups\.map\(\(slotGroup\) => \(/);
  assert.match(source, /className="booking-time-slot-carousel-slide"/);
  assert.match(source, /slideSize=\{\{ base: "100%", sm: "25%" \}\}/);
  assert.doesNotMatch(source, /withIndicators=/);
  assert.match(source, /role="radio"/);
  assert.match(source, /Available start times — \$\{formatDuration\(bundleVisitDurationMinutes/);
  assert.doesNotMatch(source, /timeSlotGroups/);
  assert.match(source, /Unavailable — \$\{unavailableSlotResourceLabel\} is booked/);
  assert.match(source, /className="booking-time-slot-summary"/);
  assert.match(source, /Funding deadline:/);
  assert.doesNotMatch(source, /className="booking-schedule-field booking-schedule-field--slot"/);
  assert.match(styles, /\.booking-time-slot-carousel \{/);
  assert.doesNotMatch(styles, /\.booking-time-slot-period \{/);
  assert.match(styles, /\.booking-time-slot-summary \{/);
  assert.match(styles, /\.booking-time-slot\[data-selected="true"\] \{/);
});

test("customer interactive cards use elevation and outlines without hover movement", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const styles = fs.readFileSync(path.join(frontendRoot, "src", "styles.css"), "utf8");

  for (const selector of [
    ".booking-time-slot:hover:not(:disabled)",
    ".vendor-card:hover",
    ".vendor-profile-hero-branch:hover",
    ".vendor-service-card:hover",
    ".vendor-location-card:hover"
  ]) {
    const start = styles.indexOf(`${selector} {`);
    const end = styles.indexOf("}", start);
    const block = start >= 0 && end >= 0 ? styles.slice(start, end) : "";
    assert.ok(block, `${selector} should have a hover treatment`);
    assert.doesNotMatch(block, /transform:/);
    assert.match(block, /outline:/);
    assert.match(block, /box-shadow:/);
  }
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
  assert.match(source, /Funding adjustment/);
  assert.match(source, /const fundingTargetAmountCents = payableAmountCents \+ fundingAdjustmentCents;/);
  assert.match(source, /const isCampaignReady = Boolean\(/);
  assert.match(source, /campaignTitle\.trim\(\)/);
  assert.match(source, /color=\{isCampaignReady \? "green" : "gray"\}/);
  assert.match(source, /isCampaignReady \? "Ready" : "Not ready"/);
  assert.match(source, /<Text fw=\{800\}>1\. Plan your visit<\/Text>/);
  assert.match(source, /Choose a branch, services, and visit length before selecting an available time/);
  assert.match(source, /<SimpleGrid cols=\{\{ base: 1, md: 2 \}\} spacing="xs">/);
  assert.match(source, /\/composed-slots/);
  assert.match(source, /className="booking-campaign-submit customer-primary-action"/);
  assert.match(source, /className="booking-campaign-submit__total"/);
  assert.match(source, /color="green" component="span" variant="filled"/);
  assert.match(source, /formatPaymentAmount\(fundingTargetAmountCents, selectedBundleServices\[0\]\?\.currency \|\| "PHP"\)/);
  assert.match(source, /h=\{56\}/);
  assert.match(source, /\{isGroupFundedMode \? \[/);
  assert.match(source, /<Stepper\.Step key="verify-otp"/);
  assert.doesNotMatch(source, /\{isGroupFundedMode \? \(\s*<>/);
});

test("booking summary lists every selected service with its own quantity and price", () => {
  const source = fs.readFileSync(
    path.join(path.resolve(__dirname, ".."), "src", "pages", "BookingRequestPage.tsx"),
    "utf8"
  );

  assert.match(source, /<Text c="dimmed" size="sm">Services<\/Text>/);
  assert.match(source, /selectedBundleServices\.map\(\(service\) => \(/);
  assert.match(source, /formatDuration\(service\.durationMinutes \* getBundleItemQuantity\(service\)\)/);
  assert.match(source, /getServiceLineAmountCents\(service, getBundleItemQuantity\(service\)\)/);
});

test("group-funded section labels use a consistent heading size", () => {
  const styles = fs.readFileSync(
    path.join(path.resolve(__dirname, ".."), "src", "styles.css"),
    "utf8"
  );

  assert.match(styles, /\.booking-schedule-field :where\(\.mantine-InputWrapper-label\) \{\s+font-size: 1rem;/);
  assert.match(styles, /\.booking-schedule-field :where\(\.mantine-InputWrapper-label\) \{[\s\S]*?font-weight: 800;/);
});

test("group-funded campaign descriptions render rich text formatting", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const source = fs.readFileSync(
    path.join(frontendRoot, "src", "pages", "GroupFundedCampaignPage.tsx"),
    "utf8"
  );
  const styles = fs.readFileSync(path.join(frontendRoot, "src", "styles.css"), "utf8");

  assert.match(source, /className="vendor-hero-description group-funded-campaign-description rich-campaign-description"/);
  assert.match(styles, /\.rich-campaign-description p,/);
  assert.match(styles, /\.rich-campaign-description blockquote/);
});

test("signed-out contributors can log in and return to the campaign payment proof", () => {
  const source = fs.readFileSync(
    path.join(path.resolve(__dirname, ".."), "src", "pages", "GroupFundedCampaignPage.tsx"),
    "utf8"
  );

  assert.match(source, /const campaignPath = `\$\{location\.pathname\}\$\{location\.search\}\$\{location\.hash\}`;/);
  assert.match(source, /const loginPath = `\/login\?next=\$\{encodeURIComponent\(campaignPath\)\}`;/);
  assert.match(source, /<Button component=\{Link\} to=\{loginPath\} w="fit-content">\s+Log in to contribute\s+<\/Button>/);
});

test("group-funded campaign details disclose the funding adjustment and target", () => {
  const source = fs.readFileSync(
    path.join(path.resolve(__dirname, ".."), "src", "pages", "GroupFundedCampaignPage.tsx"),
    "utf8"
  );

  assert.match(source, /const fundingAdjustmentCents = Math\.max\(0, Number\(campaign\?\.roundingAdjustmentCents \|\| 0\)\);/);
  assert.match(source, /const fundingTargetAmountCents = Number\(campaign\?\.targetAmountCents \|\| 0\) \+ fundingAdjustmentCents;/);
  assert.match(source, /<CampaignFundingProgress[\s\S]*?fundedAmountCents=\{campaign\.fundedAmountCents\}[\s\S]*?targetAmountCents=\{fundingTargetAmountCents\}/);
  assert.match(source, /formatPaymentAmount\(fundingTargetAmountCents, campaign\.currency\)/);
  assert.match(source, /<Title order=\{2\}>Campaign breakdown<\/Title>/);
  assert.match(source, /Funding adjustment/);
  assert.match(source, /Funding target/);
  assert.match(source, /Each contributor/);
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

test("vendor-approved campaigns replace organizer actions with the linked booking", () => {
  const source = fs.readFileSync(
    path.join(path.resolve(__dirname, ".."), "src", "pages", "GroupFundedCampaignPage.tsx"),
    "utf8"
  );

  assert.match(source, /const hasApprovedBooking = Boolean\(/);
  assert.match(source, /campaign\?\.linkedBookingId && \(campaign\.campaignStatus === "vendor_approved" \|\| campaign\.campaignStatus === "confirmed"\)/);
  assert.match(source, /const canViewApprovedBooking = isOrganizer && hasApprovedBooking;/);
  assert.match(source, /to=\{`\/account\/bookings\/\$\{campaign\.linkedBookingId\}`\}/);
  assert.match(source, />\s+View booking\s+<\/Button>/);
  assert.match(source, /isOrganizer && !hasApprovedBooking && \(canEditCampaign \|\| canCancel \|\| isCampaignFullyFunded\)/);
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
  assert.match(source, /<CampaignFundingProgress[\s\S]*?fundedAmountCents=\{campaign\.fundedAmountCents\}[\s\S]*?targetAmountCents=\{fundingTargetAmountCents\}/);
  assert.match(source, /className="group-funded-ticket-funding"/);
  assert.match(source, /<Text size="xs">Join fee<\/Text>/);
  assert.match(source, /Deadline: \$\{daysFromNow\}/);
  assert.match(source, /Share link copied to clipboard/);
  assert.doesNotMatch(source, /<Text c="dimmed" size="xs">Target<\/Text>/);
  assert.match(styles, /\.group-funded-hero-category-badge \{/);
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
  assert.match(source, /<Paper className="booking-detail-services-card" p="md">/);
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
  assert.match(source, /color="red" loading=\{submitting\} onClick=\{cancelCampaign\} size="lg" w="100%"/);
  assert.match(source, /className="customer-modal group-funded-report-modal"/);
  assert.match(source, /className="group-funded-report-actions"/);
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
  const dashboard = fs.readFileSync(path.join(frontendRoot, "src", "pages", "VendorDashboardPage.tsx"), "utf8");
  const themeUtils = fs.readFileSync(path.join(frontendRoot, "src", "utils", "vendorTheme.ts"), "utf8");
  const styles = fs.readFileSync(path.join(frontendRoot, "src", "styles.css"), "utf8");

  assert.match(source, /className="vendor-search-actions"/);
  assert.match(source, /className="vendor-discovery-grid"/);
  assert.match(source, /className="vendor-card-actions"/);
  assert.match(source, /p=\{\{ base: "md", sm: "lg" \}\}/);
  assert.match(styles, /\.vendor-search-actions \{\s+align-items: stretch;\s+flex-direction: column;/);
  assert.match(styles, /\.vendor-search-input \{\s+flex: 0 1 auto;/);
  assert.match(styles, /\.vendor-card-actions > \.mantine-Button-root \{\s+min-height: 3\.25rem;/);
  assert.match(styles, /\.vendor-card \{\s+min-height: 0;/);
  assert.match(source, /"--vendor-theme-logo-fit": theme\.logoFit/);
  assert.match(source, /theme\.logoFit === "cover" \? \{ "--vendor-theme-logo-frame-padding": "0px" \} : \{\}/);
  assert.match(source, /style=\{\{ objectFit: vendor\.publicBoardTheme\.theme\.logoFit \}\}/);
  assert.match(dashboard, /themeForm\.logoFit === "cover" \? \{ "--vendor-theme-logo-frame-padding": "0px" \} : \{\}/);
  assert.match(themeUtils, /theme\.logoFit === "cover" \? \{ "--vendor-theme-logo-frame-padding": "0px" \} : \{\}/);
  assert.match(styles, /\.vendor-card-logo-frame \{[\s\S]*?padding: var\(--vendor-theme-logo-frame-padding, 0\.6rem\);/);
  assert.match(styles, /\.vendor-card-logo-frame img \{[\s\S]*?object-fit: var\(--vendor-theme-logo-fit, contain\);/);
  assert.match(styles, /\.vendor-profile-logo-frame \{[\s\S]*?padding: var\(--vendor-theme-logo-frame-padding, 1rem\);/);
});

test("login actions are mobile-first", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const loginSource = fs.readFileSync(path.join(frontendRoot, "src", "pages", "LoginPage.tsx"), "utf8");
  const socialSource = fs.readFileSync(path.join(frontendRoot, "src", "components", "SocialAuthButtons.tsx"), "utf8");
  const styles = fs.readFileSync(path.join(frontendRoot, "src", "styles.css"), "utf8");

  assert.ok((loginSource.match(/className="auth-primary-action"/g) || []).length >= 3);
  assert.match(loginSource, /<SocialAuthButtons iconOnly intent="login"/);
  assert.match(loginSource, /result\.user\.mfaRequired && !result\.user\.mfaEnabled[\s\S]*?"\/dashboard\/account"/);
  assert.match(socialSource, /className="auth-social-action"/);
  assert.match(styles, /\.finazze-auth-card \.auth-primary-action,[\s\S]*?\.finazze-auth-card \.auth-social-action \{\s+width: 100%;\s+min-height: 3\.25rem;/);
});

test("login MFA challenge focuses the authenticator code when mounted", () => {
  const source = fs.readFileSync(
    path.join(path.resolve(__dirname, ".."), "src", "pages", "LoginPage.tsx"),
    "utf8"
  );

  assert.match(source, /autoComplete="one-time-code"\s+autoFocus\s+inputMode="numeric"\s+label="Authenticator code"/);
});

test("signup forms use provider icons, helpful labels, and touch-friendly actions", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const vendorSource = fs.readFileSync(path.join(frontendRoot, "src", "pages", "RegisterVendorPage.tsx"), "utf8");
  const customerSource = fs.readFileSync(path.join(frontendRoot, "src", "pages", "RegisterCustomerPage.tsx"), "utf8");
  const socialSource = fs.readFileSync(path.join(frontendRoot, "src", "components", "SocialAuthButtons.tsx"), "utf8");
  const labelSource = fs.readFileSync(path.join(frontendRoot, "src", "components", "SignupFieldLabel.tsx"), "utf8");
  const styles = fs.readFileSync(path.join(frontendRoot, "src", "styles.css"), "utf8");

  assert.match(socialSource, /IconBrandGoogle/);
  assert.match(socialSource, /IconBrandFacebook/);
  assert.match(socialSource, /leftSection=\{<ProviderIcon/);
  assert.match(labelSource, /<Tooltip label=\{tooltip\}/);
  assert.match(labelSource, /IconInfoCircle/);
  assert.match(labelSource, /signup-label-required/);
  assert.match(vendorSource, /<SignupFieldLabel label="Business category" required/);
  assert.match(vendorSource, /withAsterisk=\{false\}/);
  assert.match(vendorSource, /<SignupFieldLabel label="Phone"/);
  assert.match(vendorSource, /className="auth-primary-action"/);
  assert.match(vendorSource, /navigate\("\/dashboard\/account", \{ replace: true \}\)/);
  assert.match(customerSource, /<SignupFieldLabel label="Phone"/);
  assert.match(customerSource, /className="auth-primary-action"/);
  assert.match(vendorSource, /className="onboarding-layout"/);
  assert.match(customerSource, /className="onboarding-layout"/);
  assert.match(styles, /\.onboarding-layout \{\s+display: grid;\s+grid-template-columns: minmax\(0, 3fr\) minmax\(18rem, 2fr\);/);
});

test("group-funded campaign descriptions use Mantine Tiptap without source-code mode", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const editorSource = fs.readFileSync(path.join(frontendRoot, "src", "components", "CampaignDescriptionEditor.tsx"), "utf8");
  const detailSource = fs.readFileSync(path.join(frontendRoot, "src", "pages", "GroupFundedCampaignPage.tsx"), "utf8");
  const bookingSource = fs.readFileSync(path.join(frontendRoot, "src", "pages", "BookingRequestPage.tsx"), "utf8");

  assert.match(editorSource, /RichTextEditor className="campaign-description-editor" editor=\{editor\} variant="subtle"/);
  assert.match(editorSource, /DEFAULT_MAX_CHARACTERS = 1000/);
  assert.match(editorSource, /RichTextEditor\.BulletList/);
  assert.doesNotMatch(editorSource, /RichTextEditor\.Code/);
  assert.match(detailSource, /<RichCampaignDescription/);
  assert.match(bookingSource, /<CampaignDescriptionEditor/);
});

test("group-funded campaign refresh preserves vendor theming after contribution updates", () => {
  const source = fs.readFileSync(
    path.join(path.resolve(__dirname, ".."), "src", "pages", "GroupFundedCampaignPage.tsx"),
    "utf8"
  );

  assert.match(source, /const updateCampaign = useCallback\(\(nextCampaign: GroupFundedCampaignResponse\["campaign"\]\)/);
  assert.match(source, /tenantSlug: currentCampaign\.tenantSlug/);
  assert.doesNotMatch(source, /setCampaign\(data\.campaign\)/);
});

test("organizers cannot edit a campaign after a contribution fills a place", () => {
  const source = fs.readFileSync(
    path.join(path.resolve(__dirname, ".."), "src", "pages", "GroupFundedCampaignPage.tsx"),
    "utf8"
  );

  assert.match(source, /const hasFilledContributions = Boolean\(contributorReservationSummary\?\.filledContributorCount\);/);
  assert.match(source, /&& !hasFilledContributions;/);
  assert.match(source, /Campaign details are locked once a contribution has been submitted\./);
});

test("vendor group-funded campaign details render rich descriptions", () => {
  const source = fs.readFileSync(
    path.join(path.resolve(__dirname, ".."), "src", "pages", "VendorDashboardPage.tsx"),
    "utf8"
  );

  assert.match(source, /import RichCampaignDescription from "\.\.\/components\/RichCampaignDescription"/);
  assert.match(source, /\bSpoiler,/);
  assert.match(source, /<Spoiler hideLabel="Show less" maxHeight=\{72\} showLabel="Show more">/);
  assert.match(source, /<RichCampaignDescription\s+className="rich-campaign-description"\s+content=\{selectedDetail\.campaign\.description\}/);
});

test("vendor booking details link group-funded bookings to their campaign", () => {
  const source = fs.readFileSync(
    path.join(path.resolve(__dirname, ".."), "src", "pages", "VendorDashboardPage.tsx"),
    "utf8"
  );

  assert.match(source, /detailBooking\.groupFundedCampaign\?\.publicToken/);
  assert.match(source, /href=\{`\/group-funded\/\$\{detailBooking\.groupFundedCampaign\.publicToken\}`\}/);
  assert.match(source, />\s+View campaign\s+<\/Button>/);
});

test("vendor booking details render campaign bundles instead of a primary-service snapshot", () => {
  const source = fs.readFileSync(
    path.join(path.resolve(__dirname, ".."), "src", "pages", "VendorDashboardPage.tsx"),
    "utf8"
  );

  assert.match(source, /const detailCampaignBundleItems = detailBooking\?\.groupFundedCampaign\?\.bundleItems \|\| \[\];/);
  assert.match(source, /\{detailCampaignBundleItems\.length \? "Campaign services" : "Bundled services"\}/);
  assert.match(source, /detailServiceItems\.map\(\(item\) =>/);
  assert.match(source, /\{detailCampaignBundleItems\.length \? "Campaign total" : "Bundle total"\}/);
  assert.match(source, /Verified through the group-funded campaign/);
  assert.match(source, /detailBooking\.notes !== "Group-funded booking approved by vendor\."/);
});

test("vendor booking details render standard service bundles", () => {
  const source = fs.readFileSync(
    path.join(path.resolve(__dirname, ".."), "src", "pages", "VendorDashboardPage.tsx"),
    "utf8"
  );

  assert.match(source, /const detailBookingBundleItems = detailBooking\?\.bundleItems \|\| \[\];/);
  assert.match(source, /const detailServiceItems = detailCampaignBundleItems\.length/);
  assert.match(source, /: detailBookingBundleItems;/);
  assert.match(source, /\{detailServiceItems\.length > 1 \? \(/);
  assert.match(source, /\{detailCampaignBundleItems\.length \? "Campaign services" : "Bundled services"\}/);
  assert.match(source, /\{detailCampaignBundleItems\.length \? "Campaign total" : "Bundle total"\}/);
});

test("vendor booking rows summarize service bundles and campaign payment context", () => {
  const source = fs.readFileSync(
    path.join(path.resolve(__dirname, ".."), "src", "pages", "VendorDashboardPage.tsx"),
    "utf8"
  );

  assert.match(source, /const bookingBundleItems = isGroupFundedBooking && booking\.groupFundedCampaign\?\.bundleItems\?\.length/);
  assert.match(source, /const displayedServiceItems = bookingBundleItems\.length/);
  assert.match(source, /const executionModeLabel = booking\.executionMode === "sequential" \? "Back-to-back" : "Together";/);
  assert.match(source, /\+\$\{additionalServiceCount\} service/);
  assert.match(source, /Campaign funded/);
  assert.match(source, /No individual proof/);
});

test("vendor booking status chips preserve their complete labels", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(frontendRoot, "src", "pages", "VendorDashboardPage.tsx"), "utf8");
  const styles = fs.readFileSync(path.join(frontendRoot, "src", "styles.css"), "utf8");

  assert.match(source, /className="booking-list-status-chips"/);
  assert.match(styles, /\.booking-list-status-chips \{\s+flex-wrap: wrap;/);
  assert.match(styles, /\.booking-list-status-chips \.mantine-Badge-root \{\s+flex: 0 0 auto;\s+max-width: none;/);
  assert.match(styles, /\.booking-list-status-chips \.mantine-Badge-label \{\s+overflow: visible;\s+text-overflow: clip;\s+white-space: nowrap;/);
});

test("vendor bookings do not apply a date range until the vendor selects one", () => {
  const source = fs.readFileSync(
    path.join(path.resolve(__dirname, ".."), "src", "pages", "VendorDashboardPage.tsx"),
    "utf8"
  );

  assert.match(
    source,
    /const \[bookingDateRange, setBookingDateRange\] = useState<\[Date \| null, Date \| null\]>\(\[null, null\]\);/
  );
  assert.doesNotMatch(source, /import \{ addDays,/);
});

test("customer group-funded booking details use the campaign funding target and collapse campaign content", () => {
  const source = fs.readFileSync(
    path.join(path.resolve(__dirname, ".."), "src", "pages", "CustomerBookingDetailPage.tsx"),
    "utf8"
  );

  assert.match(source, /\bAccordion,/);
  assert.match(source, /\bSpoiler,/);
  assert.match(source, /import RichCampaignDescription from "\.\.\/components\/RichCampaignDescription"/);
  assert.match(source, /const fundingAdjustmentCents = Math\.max\(0, Number\(groupFundedCampaign\?\.roundingAdjustmentCents \|\| 0\)\);/);
  assert.match(source, /const fundingTargetAmountCents = Number\(groupFundedCampaign\?\.targetAmountCents \|\| 0\) \+ fundingAdjustmentCents;/);
  assert.match(source, /<Spoiler hideLabel="Show less" maxHeight=\{72\} showLabel="Show more">/);
  assert.match(source, /content=\{groupFundedCampaign\.description\}/);
  assert.match(source, /formatPaymentAmount\(fundingTargetAmountCents, groupFundedCampaign\.currency\)/);
  assert.match(source, /<Accordion className="customer-booking-contributors" variant="contained">/);
  assert.match(source, /!isGroupFundedBooking \? <div className="customer-booking-payment-section">/);
  assert.match(source, /!isGroupFundedBooking && !booking\.paymentProof && proofSubmissionAllowed/);
});

test("customer booking detail hero links associated group-funded campaigns", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(frontendRoot, "src", "pages", "CustomerBookingDetailPage.tsx"), "utf8");
  const styles = fs.readFileSync(path.join(frontendRoot, "src", "styles.css"), "utf8");

  assert.match(source, /const campaignPath = groupFundedCampaign\?\.publicToken/);
  assert.match(source, /className="booking-detail-campaign-chip"/);
  assert.match(source, /className="booking-detail-campaign-chip"\s+color="gray"/);
  assert.match(source, /<Group gap="xs" justify="center" wrap="wrap">[\s\S]*?bookingTicketStatus\.toUpperCase\(\)[\s\S]*?CAMPAIGN: \{campaignTitle\}/);
  assert.match(source, /CAMPAIGN: \{campaignTitle\}/);
  assert.match(source, /className="vendor-theme-button booking-detail-campaign-action"/);
  assert.match(source, />\s+View campaign\s+<\/Button>/);
  assert.match(styles, /\.booking-detail-campaign-chip \{\s+max-width: 200px;/);
  assert.match(styles, /\.booking-detail-campaign-chip \.mantine-Badge-label \{\s+overflow: hidden;\s+text-overflow: ellipsis;/);
  assert.match(styles, /\.booking-detail-visual-action \{\s+display: flex;\s+flex-direction: column;\s+gap: 0\.75rem;/);
  assert.match(styles, /\.booking-detail-visual-card::before \{[\s\S]*?linear-gradient\(0deg, rgba\(0, 0, 0, 0\.85\) 45%, rgba\(0, 0, 0, 0\) 100%\)/);
});

test("booking detail creates organizer campaigns in a mobile-first modal", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(frontendRoot, "src", "pages", "CustomerBookingDetailPage.tsx"), "utf8");
  const form = fs.readFileSync(path.join(frontendRoot, "src", "components", "CampaignCreateForm.tsx"), "utf8");
  const deadlinePicker = fs.readFileSync(path.join(frontendRoot, "src", "components", "CampaignDeadlinePicker.tsx"), "utf8");
  const styles = fs.readFileSync(path.join(frontendRoot, "src", "styles.css"), "utf8");

  assert.match(source, /onClick=\{\(\) => setCampaignCreateModalOpen\(true\)\}/);
  assert.match(source, /className="customer-modal campaign-create-modal"/);
  assert.match(source, /<Text className="getprio-modal-heading">Create campaign<\/Text>/);
  assert.doesNotMatch(source, /fullScreen=\{isMobile\}/);
  assert.match(source, /<CampaignCreateForm/);
  assert.match(form, /customerAccountApi\.createCampaign/);
  assert.match(form, /<CampaignDescriptionEditor disabled=\{busy\} onChange=\{setDescription\} value=\{description\}\/\>/);
  assert.match(form, /<CampaignDeadlinePicker disabled=\{busy\} onChange=\{setDeadlineAt\} scheduledStartAt=\{booking\.scheduledStartAt\} value=\{deadlineAt\}\/\>/);
  assert.match(deadlinePicker, /minDate=\{bounds\.min\}/);
  assert.match(deadlinePicker, /maxDate=\{bounds\.max \|\| undefined\}/);
  assert.match(deadlinePicker, /<DatePickerInput/);
  assert.match(deadlinePicker, /resolveCampaignDeadline\(nextValue\)/);
  assert.match(deadlinePicker, /10:00 PM Asia\/Manila/);
  assert.doesNotMatch(deadlinePicker, /DateTimePicker/);
  assert.match(form, /<CampaignDescriptionEditor disabled=\{busy\} maxCharacters=\{2000\} onChange=\{setInstructions\} value=\{instructions\}\/\>/);
  assert.match(form, /<Slider aria-label="Number of contributors"/);
  assert.match(form, /CAMPAIGN BREAKDOWN/);
  assert.match(form, /Collection target/);
  assert.match(form, /<ScrollArea className="campaign-create-form__main" offsetScrollbars scrollbars="y" scrollbarSize=\{10\} type="always">/);
  assert.match(form, /\{actions\(true\)\}/);
  assert.match(styles, /\.campaign-create-form__actions \{\s+flex-direction: column-reverse;/);
  assert.match(styles, /\.campaign-create-form--modal \.campaign-create-form__cancel \{\s+display: none;/);
  assert.match(styles, /\.campaign-create-form__main \.mantine-ScrollArea-thumb \{[\s\S]*?min-height: 44px;/);
  assert.match(styles, /\.campaign-create-form__content \{\s+width: 100%;\s+min-width: 0;\s+overflow-x: hidden;/);
  assert.match(styles, /\.customer-modal\.campaign-create-modal \.mantine-Modal-content \{[\s\S]*?height: min\(88dvh, 48rem\) !important;/);
  assert.match(styles, /@media \(max-width: 48em\) \{[\s\S]*?\.customer-modal\.campaign-create-modal \.mantine-Modal-content \{[\s\S]*?height: min\(92dvh, 48rem\) !important;/);
  assert.match(styles, /@media \(min-width: 48em\) \{[\s\S]*?\.campaign-create-form__actions \{\s+flex-direction: row;/);
  assert.match(styles, /@media \(min-width: 48em\) \{[\s\S]*?\.campaign-create-form--modal \.campaign-create-form__cancel \{\s+display: inline-flex;/);
});

test("customer navigation keeps account actions in the mobile drawer", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const appSource = fs.readFileSync(path.join(frontendRoot, "src", "App.tsx"), "utf8");
  const styles = fs.readFileSync(path.join(frontendRoot, "src", "styles.css"), "utf8");

  assert.match(appSource, /<Divider label="Account" labelPosition="center" my="sm" \/>/);
  assert.match(appSource, /to="\/account\/security"/);
  assert.match(appSource, /<Button color="red" leftSection=\{<IconLogout size=\{16\} \/>\} onClick=\{handleLogout\} variant="light">/);
  assert.match(styles, /\.customer-account-hero,\s+\.customer-account-sidebar \{\s+display: none;/);
});

test("vendor settings provide an editable business profile", () => {
  const source = fs.readFileSync(
    path.join(path.resolve(__dirname, ".."), "src", "pages", "VendorDashboardPage.tsx"),
    "utf8"
  );

  assert.match(source, /<Tabs\.Tab value="contact">Business profile<\/Tabs\.Tab>/);
  assert.match(source, /const \[settingsTab, setSettingsTab\] = useState<SettingsTab>\("contact"\)/);
  assert.match(source, /value=\{settingsTab\}[\s\S]*?setSettingsTab\(\(value as SettingsTab \| null\) \|\| "contact"\)/);
  assert.doesNotMatch(source, /<Tabs defaultValue="contact"/);
  assert.match(source, /label="Business name"/);
  assert.match(source, /label="Business category"/);
  assert.doesNotMatch(source, /label="Owner name"/);
  assert.doesNotMatch(source, /label="Owner display name"/);
  assert.match(source, /label="Full name"/);
  assert.match(source, /label="Display name"/);
  assert.doesNotMatch(source, /settings\.contactEmail/);
  assert.doesNotMatch(source, /settings\.contactPhone/);
});

test("vendor queue settings show the disabled auto-resume guidance once", () => {
  const source = fs.readFileSync(
    path.join(path.resolve(__dirname, ".."), "src", "pages", "VendorDashboardPage.tsx"),
    "utf8"
  );

  assert.equal(
    (source.match(/Only applies to queues paused automatically by threshold\./g) || []).length,
    1
  );
});

test("health and wellness preset uses a matching primary button border", () => {
  const source = fs.readFileSync(
    path.join(path.resolve(__dirname, ".."), "src", "pages", "VendorDashboardPage.tsx"),
    "utf8"
  );

  assert.match(source, /wellness: \{[\s\S]*?buttonBackgroundColor: "#24B0BA",\s+buttonTextColor: "#ffffff",\s+buttonBorderColor: "#24B0BA"/);
});

test("vendor hero primary CTA keeps its border aligned with the theme background", () => {
  const styles = fs.readFileSync(
    path.join(path.resolve(__dirname, ".."), "src", "styles.css"),
    "utf8"
  );

  assert.match(styles, /\.vendor-theme-button\.booking-detail-primary-action \{\s+border-color: var\(--vendor-theme-button-bg, #ea6a1f\);/);
  assert.match(styles, /\.vendor-theme-button\.booking-detail-primary-action:hover \{\s+border-color: color-mix\(in srgb, var\(--vendor-theme-button-bg, #ea6a1f\) 86%, black\);/);
});

test("vendor group-funded discovery uses mobile-first booking controls and filters", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(frontendRoot, "src", "pages", "VendorProfilePage.tsx"), "utf8");
  const styles = fs.readFileSync(path.join(frontendRoot, "src", "styles.css"), "utf8");

  assert.match(source, /className="vendor-info-panel vendor-booking-options-panel" p=\{\{ base: "md", sm: "xl" \}\}/);
  assert.match(source, /<Stack className="vendor-campaign-filter-stack" gap="sm">/);
  assert.match(source, /<SimpleGrid cols=\{\{ base: 1, xs: 2 \}\} spacing="sm">/);
  assert.match(source, /className="vendor-group-funded-card-footer"/);
  assert.match(source, /Organized by \{campaign\.organizerDisplayName\}/);
  assert.match(source, /className="vendor-group-funded-card-vendor-link"/);
  assert.match(source, /<CampaignFundingProgress[\s\S]*?fundedAmountCents=\{campaign\.fundedAmountCents\}[\s\S]*?targetAmountCents=\{campaign\.targetAmountCents\}/);
  assert.match(source, /function SegmentedContributorMeter/);
  assert.match(source, /Array\.from\(\{ length: verified \}/);
  assert.match(source, /Array\.from\(\{ length: pending \}/);
  assert.match(source, /Array\.from\(\{ length: vacant \}/);
  assert.match(source, /strokeDasharray=\{`\$\{segmentLength\} \$\{circumference - segmentLength\}`\}/);
  assert.match(source, /pendingVerificationContributors=\{pendingVerificationContributors\}/);
  assert.match(source, /cols=\{\{ base: 1, sm: 2 \}\}/);
  assert.match(source, />\s*Bundled services\s*</);
  assert.match(source, /className="vendor-group-funded-card-action"/);
  assert.match(source, /formatRelativeDeadline\(campaign\.fundingDeadlineAt\)/);
  assert.match(styles, /@media \(max-width: 768px\) \{\s+\.vendor-booking-option-tabs-list,/);
  assert.match(styles, /\.vendor-booking-option-toolbar \{\s+flex-direction: column;/);
  assert.match(source, /className="vendor-group-funded-card-business-line"/);
  assert.match(source, /const endsNextDay = end\.getFullYear\(\) !== start\.getFullYear\(\)/);
  assert.match(source, /time\.format\(end\)\}\$\{endsNextDay \? " next day" : ""\}/);
  assert.match(source, /<IconBuildingStore aria-hidden="true" size=\{15\} \/>/);
  assert.match(source, /<IconMapPin aria-hidden="true" size=\{15\} \/>/);
  assert.match(source, /<IconCalendar aria-hidden="true" size=\{15\} \/>/);
  assert.match(source, /<Divider className="vendor-group-funded-card-divider" \/>/);
  assert.match(source, /className="vendor-group-funded-card-service-list"/);
  assert.match(styles, /\.vendor-group-funded-card-service-list \{\s+display: grid;\s+grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(styles, /\.vendor-group-funded-card-service-list \{\s+grid-template-columns: 1fr;/);
  assert.match(styles, /\.vendor-group-funded-card-action \{\s+min-height: 2\.75rem;/);
  assert.match(styles, /\.group-funded-contributor-meter--hero \{\s+flex: 0 0 auto;\s+height: 58px;\s+width: 58px;/);
  assert.doesNotMatch(source, />\s*Join this queue\s*</);
  assert.doesNotMatch(source, />\s*Book here\s*</);
  assert.match(source, /className="vendor-booking-option-tab-content"/);
  assert.match(source, /className="vendor-contact-action customer-primary-action"/);
  assert.doesNotMatch(source, /scrollAreaComponent=\{ScrollArea\.Autosize\}/);
  assert.match(styles, /\.vendor-booking-option-tab-content \{\s+display: inline-flex;\s+align-items: center;\s+gap: 0\.45rem;/);
});

test("vendor dashboard includes rounding adjustments in group-funded targets", () => {
  const source = fs.readFileSync(
    path.join(path.resolve(__dirname, ".."), "src", "pages", "VendorDashboardPage.tsx"),
    "utf8"
  );

  assert.match(source, /function getCampaignFundingTargetAmountCents\(campaign:/);
  assert.match(source, /Number\(campaign\.targetAmountCents \|\| 0\) \+ Number\(campaign\.roundingAdjustmentCents \|\| 0\)/);
  assert.match(source, /<CampaignFundingProgress[\s\S]*?fundedAmountCents=\{campaign\.fundedAmountCents\}[\s\S]*?targetAmountCents=\{fundingTargetAmountCents\}/);
  assert.match(source, /Target \{formatMoney\(selectedDetailFundingTargetAmountCents, selectedDetail\.campaign\.currency\)\}/);
});

test("vendor profile hero uses the booking-ticket information hierarchy", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(frontendRoot, "src", "pages", "VendorProfilePage.tsx"), "utf8");
  const styles = fs.readFileSync(path.join(frontendRoot, "src", "styles.css"), "utf8");

  assert.match(source, /className="vendor-hero-shell ticket-page-hero vendor-profile-ticket-hero"/);
  assert.match(source, /className="booking-detail-info-panel vendor-profile-ticket-info"/);
  assert.match(source, /className="vendor-hero-title ticket-page-title"/);
  assert.match(source, /className="booking-detail-services-card vendor-profile-location-card"/);
  assert.match(source, /className="booking-detail-visual-card vendor-profile-ticket-visual"/);
  assert.match(source, /<Title className="booking-detail-ticket-number" order=\{2\}>\{vendor\.name\}<\/Title>/);
  assert.match(source, /vendorRatingQuery\.data\?\.rating\.count \? \(/);
  assert.match(source, /rating\.average\.toFixed\(1\)\} \(\{formatRatingCount\(vendorRatingQuery\.data\.rating\.count\)\}\)/);
  assert.match(source, /fill="none"[\s\S]*?>Not yet rated<\/Text>/);
  assert.doesNotMatch(source, /heroBranchIndex|setHeroBranchIndex|window\.setInterval/);
  assert.match(source, /className="vendor-profile-branch-carousel"/);
  assert.match(source, /selectedLocation \? \([\s\S]*?className="vendor-profile-branch-carousel-slide is-active"/);
  assert.match(source, /branch\.openStatus\?\.isOpen \? "Open" : "Closed"/);
  assert.match(source, /<Text className="finazze-section-label">Branches<\/Text>/);
  assert.match(source, /vendor\.locations\.map\(\(branch\) => \{/);
  assert.match(source, /className="vendor-profile-hero-branch"/);
  assert.match(source, /to=\{selectedBookingLocationSlug \? `\/join\/\$\{vendor\.slug\}\/\$\{selectedBookingLocationSlug\}` : `\/join\/\$\{vendor\.slug\}`\}/);
  assert.doesNotMatch(source, /to=\{activeHeroBranch\?\.slug \? `\/join\//);
  assert.match(source, /queryKey: \["public-vendor-queue-status", profileSlug, selectedBookingLocationSlug\]/);
  assert.match(source, /`\/public\/tenant\/\$\{profileSlug\}\/location\/\$\{selectedBookingLocationSlug\}\/queue`/);
  assert.match(source, /const selectedQueueStatus = getQueueStateSummary\(selectedQueueStatusQuery\.data \|\| null\)/);
  assert.match(source, /className="vendor-profile-join-queue-status"[\s\S]*?\{selectedQueueStatus\.label\}/);
  assert.match(styles, /\.vendor-profile-ticket-visual \{\s+min-height: 0;/);
  assert.match(styles, /\.vendor-profile-branch-carousel-slide\.is-active \{\s+opacity: 1;/);
  assert.match(styles, /\.vendor-profile-join-queue-label \{[\s\S]*?display: inline-flex;[\s\S]*?align-items: center;/);
  assert.match(styles, /\.vendor-profile-join-queue-status \{[\s\S]*?flex: 0 0 auto;[\s\S]*?max-width: none;/);
  assert.match(styles, /\.vendor-profile-ticket-actions > \.mantine-Button-root \{\s+width: 100%;/);
});

test("public vendor profile exposes the selected location contact actions", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(frontendRoot, "src", "pages", "VendorProfilePage.tsx"), "utf8");
  const styles = fs.readFileSync(path.join(frontendRoot, "src", "styles.css"), "utf8");

  assert.match(source, /href=\{`mailto:\$\{selectedLocation\.contactEmail\}`\}/);
  assert.match(source, /href=\{`tel:\$\{selectedLocation\.contactPhone\}`\}/);
  assert.match(source, /formatPhilippineMobileNumber\(selectedLocation\.contactPhone\)/);
  assert.match(source, />Location contact</);
  assert.match(source, /Direct contact details are not available\. Use the contact form to reach this vendor\./);
  assert.doesNotMatch(source, /This is the placeholder block for contact methods and expectations\./);
  assert.match(styles, /\.vendor-contact-channel \{[\s\S]*?min-height: 44px;/);
});

test("public vendor details render only effective plan capabilities", () => {
  const source = fs.readFileSync(
    path.join(path.resolve(__dirname, ".."), "src", "pages", "VendorProfilePage.tsx"),
    "utf8"
  );

  assert.match(source, /enabled: Boolean\(vendor\?\.capabilities\.queue && profileSlug && selectedBookingLocationSlug\)/);
  assert.match(source, /if \(!vendor\?\.capabilities\.booking \|\| !selectedLocationSlug\)/);
  assert.match(source, /\{vendor\.capabilities\.queue \? \(/);
  assert.match(source, /\{vendor\.capabilities\.booking \? \(/);
  assert.match(source, /vendor\?\.capabilities\.campaigns && service\.groupFunded\?\.enabled/);
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

test("vendor profile retires the vendor-side group-funded discovery mode", () => {
  const source = fs.readFileSync(
    path.join(path.resolve(__dirname, ".."), "src", "pages", "VendorProfilePage.tsx"),
    "utf8"
  );

  assert.match(source, /const hasGroupFundedServices = false;/);
  assert.doesNotMatch(source, /\/public\/vendors\/\$\{vendor\.slug\}\/locations\/\$\{selectedLocationSlug\}\/group-funded-campaigns/);
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
  assert.match(ticket, /setSnapshot\(null\);[\s\S]*?setResponseStatus\(loadError instanceof ApiError/);
  assert.match(ticket, /if \(\[401, 403, 404\]\.includes\(responseStatus \|\| 0\)\)/);
  assert.match(ticket, /resourceName="queue ticket"/);
});

test("queue ticket details use the group-funded detail hero composition", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const ticket = fs.readFileSync(path.join(frontendRoot, "src", "pages", "JoinedQueuePage.tsx"), "utf8");
  const styles = fs.readFileSync(path.join(frontendRoot, "src", "styles.css"), "utf8");

  assert.match(ticket, /className="vendor-hero-shell ticket-page-hero booking-detail-page-hero"/);
  assert.match(ticket, /className="booking-detail-info-panel"/);
  assert.match(ticket, /<Text className="finazze-section-label">Ticket details<\/Text>/);
  assert.match(ticket, /className="booking-detail-visual-card ticket-page-ticket-visual"/);
  assert.match(ticket, /<Text size="xs">Ticket number<\/Text>/);
  assert.match(ticket, /<Text size="xs">Estimated wait<\/Text>/);
  assert.match(ticket, /apiRequest<PublicVendorProfileResponse>\(`\/public\/vendors\/\$\{tenantSlugValue\}`\)/);
  assert.match(ticket, /bookingAvailable \? \([\s\S]*?>\s*Start booking\s*</);
  assert.match(ticket, /bookingAvailable \? \([\s\S]*?>\s*Book here\s*</);
  assert.match(styles, /\.ticket-page-ticket-visual \.ticket-page-ticket-cancel-action,/);
});

test("queue ticket details show joined date metadata and themed ticket number alignment", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const source = fs.readFileSync(
    path.join(frontendRoot, "src", "pages", "JoinedQueuePage.tsx"),
    "utf8"
  );
  const styles = fs.readFileSync(path.join(frontendRoot, "src", "styles.css"), "utf8");

  assert.match(source, />Joined Date</);
  assert.match(source, /formatJoinedDate\([\s\S]*?snapshot\?\.focusTicket\?\.joinedAt/);
  assert.match(source, /ticket-page-ticket-detail-divider" orientation="vertical"/);
  assert.match(source, /className="ticket-page-vendor-summary"/);
  assert.match(source, /className="ticket-page-business-hours"/);
  assert.match(source, /ticketIsCarriedOver \? \([\s\S]*?>\s*Carried over\s*</);
  assert.match(source, /booking-detail-ticket-status ticket-page-ticket-status ticket-page-ticket-status--/);
  assert.match(source, /import "jsbarcode\/dist\/barcodes\/JsBarcode\.code128\.min\.js"/);
  assert.match(source, /window\.JsBarcode\(barcodeRef\.current, value, \{[\s\S]*?format: "CODE128"/);
  assert.match(source, /displayValue: false/);
  assert.match(source, /<Divider className="ticket-page-barcode-divider" \/>\s*<TicketBarcode value=\{snapshot\?\.focusTicket\?\.lookupCode \|\| lookupCode\} \/>/);
  assert.doesNotMatch(source, /getBusinessCategoryLabel/);
  assert.doesNotMatch(source, /className="vendor-hero-description"/);
  assert.equal((source.match(/formatHoursLabel\(locationHours\[todayIndex\]\)/g) || []).length, 1);
  const barcodeStyle = styles.match(/\.ticket-page-barcode \{([^}]*)\}/)?.[1] || "";
  assert.match(barcodeStyle, /width: 100%;/);
  assert.doesNotMatch(barcodeStyle, /(padding|border|background):/);
  assert.match(styles, /\.ticket-page-barcode svg \{[\s\S]*?width: 100%;[\s\S]*?height: 3\.5rem;/);
  assert.match(styles, /\.ticket-page-ticket-status \{[\s\S]*?text-transform: uppercase;/);
  assert.match(styles, /\.ticket-page-ticket-status--waiting \{[\s\S]*?background: #fef3c7;[\s\S]*?color: #92400e;/);
  assert.match(source, /getCustomerTicketStateSummary\([\s\S]*?customerConfirmedAt/);
  assert.match(source, /ticketIsConfirmed[\s\S]*?"confirmed"/);
  assert.match(styles, /\.ticket-page-ticket-status--confirmed/);
  assert.match(
    styles,
    /\.ticket-page-ticket-visual \.booking-detail-visual-tile \.booking-detail-ticket-number \{[\s\S]*?color: var\(--vendor-theme-button-bg[\s\S]*?text-align: left;/
  );
});

test("queue ticket notices use an opaque readable surface with hero spacing", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const source = fs.readFileSync(
    path.join(frontendRoot, "src", "pages", "JoinedQueuePage.tsx"),
    "utf8"
  );
  const styles = fs.readFileSync(path.join(frontendRoot, "src", "styles.css"), "utf8");

  assert.match(source, /className="ticket-page-notifications"/);
  assert.match(source, /className="ticket-page-status-alert ticket-page-queue-alert"/);
  assert.match(styles, /\.ticket-page-notifications \{[\s\S]*?margin-bottom: clamp\(/);
  assert.match(styles, /\.ticket-page-status-alert \{[\s\S]*?background: #fffaf3;/);
  assert.match(
    styles,
    /\.ticket-page-status-alert \.mantine-Alert-message \{[\s\S]*?font-weight: 600;/
  );
});

test("campaign pages show booking details and consistent organizer trust rating states", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(frontendRoot, "src", "pages", "CampaignControlCenterPage.tsx"), "utf8");
  const publicSource = fs.readFileSync(path.join(frontendRoot, "src", "pages", "CampaignPreviewPage.tsx"), "utf8");
  const rating = fs.readFileSync(path.join(frontendRoot, "src", "components", "CampaignOrganizerRating.tsx"), "utf8");
  const styles = fs.readFileSync(path.join(frontendRoot, "src", "styles.css"), "utf8");

  assert.match(source, /Organized by/);
  assert.match(source, /<CampaignOrganizerRating rating=\{campaign\.organizerTrustRating\}\/>/);
  assert.match(source, /src=\{campaign\.organizerAvatarUrl \|\| undefined\}/);
  assert.match(source, /src=\{item\.contributorAvatarUrl \|\| undefined\}/);
  assert.match(source, /BOOKING DETAILS/);
  assert.match(source, /x\{item\.bookingQuantity\}/);
  assert.match(source, /Preview \$\{item\.serviceName\} image/);
  assert.match(source, /booking\.locationTimezone/);
  assert.match(source, /to=\{`\/vendors\/\$\{booking\.vendorSlug\}`\}/);
  assert.match(source, /booking\.locationAddress \?/);
  assert.match(source, /event\.actorDisplayName/);
  assert.match(publicSource, /<CampaignOrganizerRating rating=\{campaign\.organizerTrustRating\}\/>/);
  assert.match(rating, /rating\?\.count \?/);
  assert.match(rating, /fill="#ffd000"/);
  assert.match(rating, /<IconStar aria-hidden="true" color="var\(--mantine-color-gray-4\)"/);
  assert.match(rating, />Not yet rated</);
  assert.match(publicSource, /src=\{campaign\.organizerAvatarUrl \|\| undefined\}/);
  assert.match(publicSource, /<Badge color="cyan">\{campaign\.status\}<\/Badge>/);
  assert.match(publicSource, /<CampaignFundingProgress[\s\S]*?fundedAmountCents=\{acceptedAmountCents\}[\s\S]*?targetAmountCents=\{fundingTargetCents\}/);
  assert.match(source, /<CampaignHeroStats/);
  assert.match(publicSource, /<CampaignHeroStats/);
  assert.match(publicSource, /deadlineAt=\{campaign\.deadlineAt\}/);
  assert.match(publicSource, /scheduledStartAt=\{campaign\.scheduledStartAt\}/);
  assert.match(publicSource, /scheduledEndAt=\{campaign\.scheduledEndAt\}/);
  assert.doesNotMatch(publicSource, /<Badge>\{campaign\.vendor\.name\}<\/Badge>/);
  assert.doesNotMatch(publicSource, /<Text size="xs">Schedule<\/Text>/);
  assert.doesNotMatch(publicSource, /campaign-hero-secondary" size="sm">\{campaign\.location\.name\}<\/Text>/);
  assert.match(styles, /@media \(hover: hover\) and \(pointer: fine\)/);
});

test("public campaign booking thumbnails open the accessible service image viewer", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(frontendRoot, "src", "pages", "CampaignPreviewPage.tsx"), "utf8");

  assert.match(source, /IconEye/);
  assert.match(source, /const \[serviceImagePreview, setServiceImagePreview\] = useState/);
  assert.match(source, /aria-label=\{`Preview \$\{item\.serviceName\} image`\}/);
  assert.match(source, /onClick=\{\(\) => setServiceImagePreview\(\{ name: item\.serviceName, imageUrl: item\.imageUrl \|\| "" \}\)\}/);
  assert.match(source, /<span aria-hidden="true"><IconEye size=\{16\}\/><\/span>/);
  assert.match(source, /className="service-image-preview-shell"/);
  assert.match(source, /alt=\{serviceImagePreview\.name\}/);
  assert.match(source, /onClose=\{\(\) => setServiceImagePreview\(null\)\}/);
});

test("customer settings upload and preview a campaign profile photo", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const account = fs.readFileSync(path.join(frontendRoot, "src", "pages", "CustomerAccountPage.tsx"), "utf8");
  const api = fs.readFileSync(path.join(frontendRoot, "src", "api", "customerAccount.ts"), "utf8");
  const app = fs.readFileSync(path.join(frontendRoot, "src", "App.tsx"), "utf8");

  assert.match(account, /accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(account, /file\.size > 5 \* 1024 \* 1024/);
  assert.match(account, /customerAccountApi\.uploadAvatar\(token, avatarFile\)/);
  assert.match(account, /src=\{avatarPreviewUrl \|\| accountUser\?\.avatarUrl \|\| undefined\}/);
  assert.match(api, /\/account\/profile\/avatar\?fileName=/);
  assert.match(api, /"Content-Type": file\.type/);
  assert.match(app, /src=\{user\?\.avatarUrl \|\| undefined\}/);
});

test("customer MFA enrollment renders a local authenticator QR with manual fallback", () => {
  const source = fs.readFileSync(
    path.join(path.resolve(__dirname, ".."), "src", "pages", "CustomerAccountPage.tsx"),
    "utf8"
  );

  assert.match(source, /import QRCode from "react-qr-code"/);
  assert.match(source, /<QRCode[\s\S]*?value=\{mfaUri\}/);
  assert.match(source, /GetPrio authenticator setup QR code/);
  assert.match(source, /Can’t scan the QR code\?/);
  assert.match(source, />\{mfaSecret\}<\/Text>/);
});

test("customer MFA confirmation immediately shows enabled and retires the setup action", () => {
  const source = fs.readFileSync(
    path.join(path.resolve(__dirname, ".."), "src", "pages", "CustomerAccountPage.tsx"),
    "utf8"
  );

  assert.match(source, /const mfaEnabled = !mfaRemoved && Boolean\(accountUser\?\.mfaEnabled \|\| mfaRecoveryCodes\.length\)/);
  assert.match(source, /invalidateQueries\(\{ queryKey: \["customer-account", token\] \}\)/);
  assert.match(source, /!mfaEnabled && !mfaSecret && !mfaRecoveryCodes\.length/);
  assert.match(source, /mfaEnabled \? "Enabled" : "Not enabled"/);
});

test("customer can remove optional MFA through a verified confirmation modal", () => {
  const source = fs.readFileSync(
    path.join(path.resolve(__dirname, ".."), "src", "pages", "CustomerAccountPage.tsx"),
    "utf8"
  );

  assert.match(source, />Remove MFA<\/Button>/);
  assert.match(source, /\/auth\/mfa\/disable/);
  assert.match(source, /password: mfaRemovalPassword/);
  assert.match(source, /code: mfaRemovalCode/);
  assert.match(source, /recoveryCode: mfaRemovalRecoveryCode/);
  assert.match(source, /I understand that removing MFA reduces my account security/);
  assert.match(source, /className="customer-modal mfa-removal-modal"/);
});

test("campaign notices use the vendor-style overlay notification stack", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(frontendRoot, "src", "pages", "CampaignControlCenterPage.tsx"), "utf8");

  assert.match(source, /<Portal>/);
  assert.match(source, /className="dashboard-notification-stack"/);
  assert.match(source, /<Notification/);
  assert.match(source, /campaign\.notices/);
  assert.match(source, /overlayNotices\.slice\(0, 3\)\.map/);
  assert.doesNotMatch(source, /campaign\.notices\?\.slice\(0, 3\)\.map\(\(notice\) => <Alert/);
});

test("campaign control center gives a joined contributor a slot and private proof viewer", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(frontendRoot, "src", "pages", "CampaignControlCenterPage.tsx"), "utf8");
  const api = fs.readFileSync(path.join(frontendRoot, "src", "api", "customerAccount.ts"), "utf8");

  assert.match(source, /Your slot is reserved/);
  assert.match(source, /Slot #\{ownContribution\.slotNumber/);
  assert.match(source, /ownContribution\.paymentProof/);
  assert.match(source, /View payment proof/);
  assert.match(source, /className="customer-modal payment-proof-modal"/);
  assert.match(source, /scrollbars="y"/);
  assert.match(source, /!isOrganizer && ownContribution/);
  assert.match(source, /ownContribution\.status === "pending_proof"/);
  assert.match(source, />Leave campaign</);
  assert.match(source, /title="Leave campaign"/);
  assert.match(api, /\/account\/campaigns\/\$\{encodeURIComponent\(campaignId\)\}\/contributions\/self/);
  assert.match(api, /method: "DELETE"/);
  assert.match(source, /\["pending_proof", "submitted", "review_overdue"\]\.includes\(item\.status\)/);
});

test("organizer campaign view summarizes funding and opens history from a modal CTA", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(frontendRoot, "src", "pages", "CampaignControlCenterPage.tsx"), "utf8");
  const styles = fs.readFileSync(path.join(frontendRoot, "src", "styles.css"), "utf8");

  assert.match(source, />Campaign summary</);
  assert.match(source, />Funding breakdown</);
  assert.match(source, />Target fund</);
  assert.match(source, />Confirmed funds</);
  assert.match(source, />Remaining to target</);
  assert.match(source, />Contribution per person</);
  assert.match(source, />Contributor slots</);
  assert.match(source, /campaign\.requiredContributors \* campaign\.contributionFeeCents/);
  assert.match(source, /Math\.max\(0, fundingTargetCents - acceptedAmountCents\)/);
  assert.match(source, /\{isOrganizer \? <Card className="campaign-funding-summary"/);
  assert.ok(
    source.indexOf('{isOrganizer && campaign.status === "draft" ? <DraftCampaignEditor') <
      source.indexOf('{isOrganizer ? <Card className="campaign-funding-summary"')
  );
  assert.match(source, /campaign\.status === "collecting" \? <Group className="campaign-summary-actions"[\s\S]*?>Unpublish<[\s\S]*?>Cancel campaign</);
  assert.doesNotMatch(source, /isOrganizer && campaign\.status === "collecting" \? <Group>/);
  assert.match(styles, /\.campaign-summary-actions/);
  assert.match(source, />View campaign history</);
  assert.match(source, /\{isOrganizer \? <Card p="lg"><Group align="center" className="campaign-history-cta"/);
  assert.match(source, /className="customer-modal campaign-history-modal"/);
  assert.match(source, /opened=\{historyModalOpen\}/);
  assert.match(source, /className="campaign-history-modal-main"/);
  assert.doesNotMatch(source, /<Title order=\{3\}>Campaign history<\/Title>\{campaign\.events\.map/);
  assert.match(styles, /\.customer-modal\.campaign-history-modal \.mantine-Modal-content/);
  assert.match(styles, /\.campaign-history-modal-main/);
});

test("an unpaid campaign slot uses a pending funding treatment instead of success", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(frontendRoot, "src", "pages", "CampaignControlCenterPage.tsx"), "utf8");
  const styles = fs.readFileSync(path.join(frontendRoot, "src", "styles.css"), "utf8");

  assert.match(source, /if \(!contribution\.paymentProof\)/);
  assert.match(source, /contribution\.status === "rejected" && !contribution\.paymentProof/);
  assert.ok(
    source.indexOf('contribution.status === "rejected" && !contribution.paymentProof') <
      source.indexOf("if (!contribution.paymentProof)")
  );
  assert.match(source, /flavor: "awaiting-proof"/);
  assert.match(source, /Submit the funding fee and payment proof to complete your contribution\./);
  assert.match(source, /ownContribution\.status === "rejected" && ownContribution\.resubmissionCount < 1/);
  assert.match(source, /campaign-participation-card--\$\{participation\.flavor\}/);
  assert.match(styles, /\.campaign-participation-card--awaiting-proof/);
  assert.match(styles, /\.campaign-participation-card--accepted/);
});

test("campaign reservations show proof deadlines and segmented contributor progress", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(frontendRoot, "src", "pages", "CampaignControlCenterPage.tsx"), "utf8");
  const preview = fs.readFileSync(path.join(frontendRoot, "src", "pages", "CampaignPreviewPage.tsx"), "utf8");
  const heroStats = fs.readFileSync(path.join(frontendRoot, "src", "components", "CampaignHeroStats.tsx"), "utf8");
  const contributorProgress = fs.readFileSync(path.join(frontendRoot, "src", "components", "CampaignContributorProgress.tsx"), "utf8");
  const sharedTypes = fs.readFileSync(path.resolve(frontendRoot, "..", "shared", "types.ts"), "utf8");
  const migration = fs.readFileSync(path.resolve(frontendRoot, "..", "database", "migrations", "20260729_add_campaign_reservation_expiration.sql"), "utf8");

  assert.match(source, /Proof due/);
  assert.match(source, /reservationExpiresAt/);
  assert.match(source, /<CampaignHeroStats/);
  assert.match(preview, /<CampaignHeroStats/);
  assert.match(heroStats, /<CampaignContributorProgress/);
  assert.match(heroStats, /cols=\{\{ base: 1, md: 3 \}\}/);
  assert.match(contributorProgress, /RingProgress/);
  assert.match(contributorProgress, /Contributors/);
  assert.match(contributorProgress, /Confirmed/);
  assert.match(contributorProgress, /Reserved/);
  assert.match(contributorProgress, /var\(--mantine-color-teal-5\)/);
  assert.match(contributorProgress, /var\(--mantine-color-blue-5\)/);
  assert.match(contributorProgress, /const SLOT_GAP_DEGREES = 5/);
  assert.match(contributorProgress, /SLOT_GAP_DEGREES \/ 360 \* 100/);
  assert.doesNotMatch(contributorProgress, /\broundCaps\b/);
  assert.match(sharedTypes, /\| "expired"/);
  assert.match(sharedTypes, /reservationExpiresAt/);
  assert.match(migration, /reservation_expires_at/);
  assert.match(migration, /reservation_attempt_count/);
});

test("contributor campaign hero uses campaign-wide aggregates instead of the viewer's contribution", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(frontendRoot, "src", "pages", "CampaignControlCenterPage.tsx"), "utf8");

  assert.match(source, /campaign\?\.acceptedContributors\s*\?\?/);
  assert.match(source, /campaign\?\.joinedContributors\s*\?\?/);
  assert.match(source, /campaign\?\.acceptedAmountCents\s*\?\?/);
  assert.doesNotMatch(source, /const filled = contributions\.filter/);
  assert.match(source, /\{reservedContributors\}/);
  assert.match(source, /\{underReviewContributors\}/);
  assert.match(source, /\{acceptedContributors\}/);
  assert.match(source, /requiredContributors=\{campaign\.requiredContributors\}/);
});

test("campaign trust ratings open from a contextual action inside a mobile-first modal", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(frontendRoot, "src", "pages", "CampaignControlCenterPage.tsx"), "utf8");

  assert.match(source, /Rate contributor/);
  assert.match(source, /Rate organizer/);
  assert.match(source, /className="customer-modal campaign-rating-modal"/);
  assert.match(source, /<FiveStarRatingInput/);
  assert.match(source, /Low-rating reason/);
  assert.doesNotMatch(source, /<Stack gap="xs"><Text size="sm" fw=\{700\}>Private trust rating/);
});

test("campaign control center refreshes authenticated campaign data from SSE change signals", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(frontendRoot, "src", "pages", "CampaignControlCenterPage.tsx"), "utf8");

  assert.match(source, /new EventSource\(/);
  assert.match(source, /\/public\/campaigns\/\$\{encodeURIComponent\(campaign\.publicToken\)\}\/stream/);
  assert.match(source, /addEventListener\("campaign-change"/);
  assert.match(source, /void load\(\)/);
  assert.match(source, /eventSource\.close\(\)/);
});

test("campaign discovery uses one broad search field and safely renders rich descriptions", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(frontendRoot, "src", "pages", "CampaignDiscoveryPage.tsx"), "utf8");
  const card = fs.readFileSync(path.join(frontendRoot, "src", "components", "CampaignSummaryCard.tsx"), "utf8");
  const api = fs.readFileSync(path.join(frontendRoot, "src", "api", "customerAccount.ts"), "utf8");

  assert.match(source, /label="Search campaigns"/);
  assert.match(source, /placeholder="Campaign title, organizer, vendor, or address"/);
  assert.match(source, /label="Booking date"/);
  assert.doesNotMatch(source, /label="Vendor slug"/);
  assert.doesNotMatch(source, /label="Branch slug"/);
  assert.doesNotMatch(source, /label="Service slug"/);
  assert.match(source, /<CampaignSummaryCard action=\{\{ label: "View campaign"/);
  assert.match(source, /descriptionClassName="rich-campaign-description campaign-list-description campaign-discovery-description"/);
  assert.match(card, /<RichCampaignDescription className=\{descriptionClassName\} content=\{campaign\.description\}\/>/);
  assert.match(source, /component="form"/);
  assert.match(source, /type="submit"/);
  assert.match(card, /className="campaign-discovery-cta"/);
  assert.match(source, /const requestId = \+\+loadRequestId\.current/);
  assert.match(source, /if \(requestId === loadRequestId\.current\) setCampaigns/);
  assert.match(source, /const search = event\.currentTarget\.value;\s*setFilters\(\(current\) => \(\{ \.\.\.current, search \}\)\)/);
  assert.match(source, /const date = event\.currentTarget\.value;\s*setFilters\(\(current\) => \(\{ \.\.\.current, date \}\)\)/);
  assert.doesNotMatch(source, /setFilters\(\([^)]*\) => \(\{[^}]*currentTarget\.value/);
  assert.match(api, /filters: \{ search\?: string; date\?: string \}/);
});

test("your campaigns reuses the discovery search and booking date filters", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(frontendRoot, "src", "pages", "CampaignControlCenterPage.tsx"), "utf8");

  assert.match(source, /className="campaign-discovery-filters"/);
  assert.match(source, /label="Search campaigns"/);
  assert.match(source, /placeholder="Campaign title, organizer, vendor, or address"/);
  assert.match(source, /label="Booking date"/);
  assert.match(source, /type="submit">Apply filters<\/Button>/);
  assert.match(source, /const filteredCampaigns = useMemo/);
  assert.match(source, /filteredCampaigns\.map\(\(item\)/);
  assert.match(source, /No campaigns match the selected filters\./);
  assert.match(source, /Confirmed bookings selected for campaigns will appear here\./);
});

test("authenticated campaign pages share the customer account sidebar layout", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const layout = fs.readFileSync(path.join(frontendRoot, "src", "components", "CustomerAccountLayout.tsx"), "utf8");
  const account = fs.readFileSync(path.join(frontendRoot, "src", "pages", "CustomerAccountPage.tsx"), "utf8");
  const app = fs.readFileSync(path.join(frontendRoot, "src", "App.tsx"), "utf8");

  assert.match(layout, /label: "Campaigns",\s*path: "\/account\/campaigns"/);
  assert.match(layout, /label: "Your campaigns", path: "\/account\/campaigns"/);
  assert.match(layout, /label: "Discover campaigns", path: "\/account\/campaigns\/discover"/);
  assert.match(layout, /<Collapse in=\{campaignsExpanded\}>/);
  assert.match(layout, /aria-expanded=\{campaignsExpanded\}/);
  assert.match(layout, /customer-account-nav-chevron--expanded/);
  assert.match(layout, /className="customer-account-layout"/);
  assert.match(layout, /className="customer-account-sidebar"/);
  assert.match(layout, /activeSection === section\.key/);
  assert.match(layout, /<div className="customer-account-content">\s*\{children\}/);
  assert.doesNotMatch(layout, /activeSection === "profile"/);
  assert.doesNotMatch(layout, /accountUser/);
  assert.doesNotMatch(layout, /<Stack className="customer-account-page" gap="lg">\s*<Card className="[^"]*customer-account-hero/);
  assert.match(account, /<CustomerAccountLayout activeSection=\{activeSection\}>/);
  assert.match(app, /<CustomerAccountLayout activeSection="campaigns">[\s\S]*?<CampaignControlCenterPage \/>/);
  assert.match(app, /<CustomerAccountLayout activeSection="campaigns">[\s\S]*?<CampaignDiscoveryPage \/>/);
  assert.match(app, /<CustomerAccountLayout activeSection="campaigns">[\s\S]*?<CampaignCreatePage \/>/);
});

test("campaign page titles use the customer account heading scale", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const account = fs.readFileSync(path.join(frontendRoot, "src", "pages", "CustomerAccountPage.tsx"), "utf8");
  const control = fs.readFileSync(path.join(frontendRoot, "src", "pages", "CampaignControlCenterPage.tsx"), "utf8");
  const discovery = fs.readFileSync(path.join(frontendRoot, "src", "pages", "CampaignDiscoveryPage.tsx"), "utf8");
  const preview = fs.readFileSync(path.join(frontendRoot, "src", "pages", "CampaignPreviewPage.tsx"), "utf8");
  const styles = fs.readFileSync(path.join(frontendRoot, "src", "styles.css"), "utf8");

  assert.match(account, /className="customer-section-header"/);
  assert.match(account, /<Title order=\{1\}>Recent queue activity<\/Title>/);
  assert.match(account, /<Title order=\{1\}>Service booking history<\/Title>/);
  assert.match(account, /<Title order=\{1\}>Account details<\/Title>/);
  assert.match(account, /<Title order=\{1\}>Browser notifications<\/Title>/);
  assert.match(account, /<Title order=\{1\}>Password and authentication<\/Title>/);
  assert.match(control, /className="customer-section-header"/);
  assert.match(control, /<Title order=\{1\}>Your campaigns<\/Title>/);
  assert.match(control, /<Title order=\{2\}>\{campaign\.title\}<\/Title>/);
  assert.match(discovery, /className="customer-section-header"/);
  assert.match(discovery, /<Title order=\{1\}>Public campaigns<\/Title>/);
  assert.match(preview, /<Title order=\{2\}>\{campaign\.title\}<\/Title>/);
  assert.doesNotMatch(preview, /<Title order=\{1\}>/);
  assert.match(styles, /\.customer-section-header h1 \{[\s\S]*?font-size: clamp\(2\.15rem, 9vw, 3\.35rem\)/);
});

test("customer campaign cards show status flavor, organizer trust, and three campaign facts", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(frontendRoot, "src", "pages", "CampaignControlCenterPage.tsx"), "utf8");
  const card = fs.readFileSync(path.join(frontendRoot, "src", "components", "CampaignSummaryCard.tsx"), "utf8");
  const styles = fs.readFileSync(path.join(frontendRoot, "src", "styles.css"), "utf8");

  assert.match(source, /<CampaignSummaryCard campaign=\{item\}/);
  assert.match(card, /collecting: \{ color: "orange", label: "Collecting" \}/);
  assert.match(card, /collected: \{ color: "teal", label: "Collected" \}/);
  assert.match(card, /cancelled: \{ color: "red", label: "Cancelled" \}/);
  assert.match(card, /Organized by/);
  assert.match(card, /organizerAvatarUrl/);
  assert.match(card, /organizerTrustRating/);
  assert.match(card, />Not yet rated</);
  assert.doesNotMatch(card, />No rating yet</);
  assert.match(card, /campaign-list-progress/);
  assert.match(card, /<CampaignFundingProgress/);
  assert.match(card, /fundedAmountCents=\{fundedAmountCents\}/);
  assert.match(card, /targetAmountCents=\{fundingTargetCents\}/);
  assert.doesNotMatch(card, /filledContributors/);
  assert.match(card, />Location</);
  assert.match(card, /\$\{campaign\.vendor\.name\} - \$\{campaign\.location\.name\}/);
  assert.match(card, />Schedule</);
  assert.match(card, /formatCampaignListDate\(campaign\.scheduledStartAt, timeZone\)/);
  assert.match(card, /formatBookingScheduleTimeRange\(campaign\.scheduledStartAt, campaign\.scheduledEndAt, timeZone\)/);
  assert.match(card, />Contributors</);
  assert.match(card, /\{confirmedContributors\}\/\{campaign\.requiredContributors\} Confirmed/);
  assert.match(card, /\{reservedContributors\} Reserved/);
  assert.doesNotMatch(card, /<Divider mt="xs"\/>/);
  assert.match(styles, /\.campaign-list-facts/);
  assert.match(styles, /\.campaign-list-fact \+ \.campaign-list-fact/);
});

test("booking schedule formatters honor the booking location timezone", () => {
  const instant = "2026-08-19T23:30:00.000Z";

  assert.equal(formatBookingScheduleDate(instant, "Asia/Manila"), "20 Aug 2026");
  assert.equal(formatBookingScheduleTimeRange(instant, "2026-08-20T00:30:00.000Z", "Asia/Manila"), "7:30 am - 8:30 am");
});

test("location slugs become immutable and new locations inherit the platform timezone", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const vendorDashboard = fs.readFileSync(path.join(frontendRoot, "src", "pages", "VendorDashboardPage.tsx"), "utf8");
  const platformDashboard = fs.readFileSync(path.resolve(frontendRoot, "..", "platform-dashboard", "src", "main.tsx"), "utf8");
  const sharedTypes = fs.readFileSync(path.resolve(frontendRoot, "..", "shared", "types.ts"), "utf8");

  assert.match(vendorDashboard, /readOnly=\{Boolean\(editingLocationSlug\)\}/);
  assert.match(vendorDashboard, /Slug cannot be changed after the location is created\./);
  assert.match(vendorDashboard, /<Select[\s\S]*?name="timezone"[\s\S]*?searchable/);
  assert.match(vendorDashboard, /timezone: platformDefaultTimezone/);
  assert.match(vendorDashboard, /setPlatformDefaultTimezone\(locationsResponse\.defaultTimezone\)/);
  assert.match(platformDashboard, /label="Default timezone"/);
  assert.match(platformDashboard, /searchable/);
  assert.match(sharedTypes, /defaultTimezone: string/);
});

test("vendor location cards show only today's timezone-resolved schedule", () => {
  const source = fs.readFileSync(
    path.join(path.resolve(__dirname, ".."), "src", "pages", "VendorDashboardPage.tsx"),
    "utf8"
  );

  assert.match(source, /Today\{locationItem\.openStatus\.today/);
  assert.match(source, /formatStoreHourRange\(locationItem\.openStatus\.today\)/);
  assert.match(source, /locationItem\.isActive && locationItem\.openStatus\.isOpen \? "Open" : "Closed"/);
  assert.doesNotMatch(source, />\{locationItem\.openStatus\.summary\}<\/Text>/);
});

test("vendor location card URLs copy to the clipboard with confirmation", () => {
  const source = fs.readFileSync(
    path.join(path.resolve(__dirname, ".."), "src", "pages", "VendorDashboardPage.tsx"),
    "utf8"
  );

  assert.match(source, /navigator\.clipboard\?\.writeText/);
  assert.match(source, /await navigator\.clipboard\.writeText\(url\)/);
  assert.match(source, /`The \$\{label\.toLowerCase\(\)\} has been copied to your clipboard\.`/);
  assert.match(source, /copyLocationUrl\("Join URL", locationItem\.joinUrl\)/);
  assert.match(source, /copyLocationUrl\("Monitor URL", locationItem\.monitorUrl\)/);
  assert.match(source, /title="Click to copy Join URL"/);
  assert.match(source, /title="Click to copy Monitor URL"/);
});

test("vendor queue public links copy to the clipboard with confirmation", () => {
  const source = fs.readFileSync(
    path.join(path.resolve(__dirname, ".."), "src", "pages", "VendorDashboardPage.tsx"),
    "utf8"
  );

  assert.match(source, /copyLocationUrl\("Join URL", queueLinks\.joinUrl\)/);
  assert.match(source, /copyLocationUrl\("QR target", queueLinks\.qrUrl\)/);
  assert.match(source, /copyLocationUrl\("Monitor URL", queueLinks\.monitorUrl\)/);
  assert.match(source, /title="Click to copy QR target"/);
});

test("vendor dashboard provides account-level MFA enrollment with a QR code", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const dashboard = fs.readFileSync(path.join(frontendRoot, "src", "pages", "VendorDashboardPage.tsx"), "utf8");
  const operations = fs.readFileSync(path.join(frontendRoot, "src", "api", "vendorDashboardOperations.ts"), "utf8");

  assert.doesNotMatch(dashboard, /section: "security", label: "Security"/);
  assert.match(dashboard, /<Tabs\.Tab value="security">Security<\/Tabs\.Tab>/);
  assert.match(dashboard, /<Tabs\.Panel pt="lg" value="security">[\s\S]*?\{renderSecurityPage\(\)\}/);
  assert.match(dashboard, /setAccountTab\("security"\)/);
  assert.match(dashboard, /navigate\("\/dashboard\/account", \{ replace: true \}\)/);
  assert.match(dashboard, /Your sign-in session remains active during setup\./);
  assert.match(dashboard, /navItems\.filter\(\(item\) => item\.section === "account"\)/);
  assert.match(dashboard, /!requiresMfaEnrollment \? <Card className="neura-card vendor-security-card"/);
  assert.match(dashboard, /Scan with your authenticator app/);
  assert.match(dashboard, /<QRCode[^>]+value=\{mfaEnrollmentUri\}/);
  assert.match(dashboard, /autoFocus[\s\S]*?label="6-digit authenticator code"/);
  assert.match(dashboard, /Verify and enable/);
  assert.match(dashboard, /mfaEnabled && mfaSecret[\s\S]*?cancelMfaEnrollment/);
  assert.match(dashboard, /mfaEnabled && !mfaSecret && !mfaRecoveryCodes\.length/);
  assert.match(dashboard, /These recovery codes are shown only once\./);
  assert.match(dashboard, /I saved these recovery codes/);
  assert.match(operations, /\/auth\/mfa\/enrollment\/start/);
  assert.match(operations, /\/auth\/mfa\/enrollment\/confirm/);
  assert.match(operations, /\/auth\/mfa\/enrollment\/cancel/);
});

test("vendor account menu separates user security from role-restricted billing", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const dashboard = fs.readFileSync(path.join(frontendRoot, "src", "pages", "VendorDashboardPage.tsx"), "utf8");
  const operations = fs.readFileSync(path.join(frontendRoot, "src", "api", "vendorDashboardOperations.ts"), "utf8");
  const bootstrap = fs.readFileSync(path.join(frontendRoot, "src", "api", "vendorDashboardBootstrap.ts"), "utf8");

  assert.match(dashboard, /section: "account", label: "Account"/);
  assert.match(dashboard, /const staffAllowedSections = new Set<DashboardSection>\(\["queue", "bookings", "clients", "history", "account"\]\)/);
  assert.match(dashboard, /const canAccessBillingTabs = isOwner \|\| isAdmin/);
  assert.match(dashboard, /canAccessBillingTabs && !requiresMfaEnrollment/);
  assert.match(dashboard, /<Tabs\.Tab value="subscription">Subscription<\/Tabs\.Tab>/);
  assert.match(dashboard, /<Tabs\.Tab value="billing">Billing<\/Tabs\.Tab>/);
  assert.match(dashboard, /<Tabs\.Tab value="profile">Profile<\/Tabs\.Tab>/);
  assert.match(dashboard, /<Tabs\.Tab value="security">Security<\/Tabs\.Tab>/);
  assert.match(dashboard, /selectedTenantRole === "staff" && \(accountTab === "subscription" \|\| accountTab === "billing"\)/);
  assert.match(dashboard, /\(isOwner \|\| isAdmin\)/);
  assert.match(dashboard, /const isFreeSubscription = subscription\?\.planSlug === "free"/);
  assert.match(dashboard, /isFreeSubscription \? \([\s\S]*?Upgrade to paid plan[\s\S]*?\) : subscription\?\.currentPeriodEnd/);
  assert.match(dashboard, /billing\.plans\.filter\(\(plan\) => !paidOnly \|\| plan\.slug !== "free"\)/);
  assert.match(dashboard, /renderPlanCards\(\{ paidOnly: paidPlanDialogOnly \}\)/);
  assert.match(dashboard, /isFreeSubscription \? \([\s\S]*?<MetricCard[\s\S]*?label="Current plan"/);
  assert.match(operations, /"\/account\/profile"/);
  assert.match(bootstrap, /\/vendor\/tenant\/\$\{tenantSlug\}\/entitlements/);
});

test("vendor navigation combines tenant role RBAC with effective plan entitlements", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const dashboard = fs.readFileSync(path.join(frontendRoot, "src", "pages", "VendorDashboardPage.tsx"), "utf8");

  assert.match(
    dashboard,
    /roleVisibleNavItems\.filter\(\(item\) =>\s*canAccessVendorSection\(item\.section, effectiveEntitlements\)\s*\)/
  );
  assert.match(dashboard, /!canAccessVendorSection\(currentSection, effectiveEntitlements\)/);
  assert.match(dashboard, /canAccessVendorSection\("services", effectiveEntitlements\)/);
  assert.match(dashboard, /canAccessVendorSection\("bookings", effectiveEntitlements\)/);
});

test("vendor queue confirms called tickets through a barcode scan", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const dashboard = fs.readFileSync(path.join(frontendRoot, "src", "pages", "VendorDashboardPage.tsx"), "utf8");
  const scanner = fs.readFileSync(path.join(frontendRoot, "src", "components", "TicketScannerModal.tsx"), "utf8");
  const queueApi = fs.readFileSync(path.join(frontendRoot, "src", "api", "vendorDashboardQueue.ts"), "utf8");

  assert.match(dashboard, /<TicketScannerModal/);
  assert.match(dashboard, />\s*Confirm ticket\s*<\/Button>/);
  assert.match(dashboard, /activeTicket\?\.customerConfirmedAt \? \(/);
  assert.match(dashboard, />\s*Serve customer\s*<\/Button>/);
  assert.doesNotMatch(dashboard, />\s*Serve current\s*<\/Button>/);
  assert.match(scanner, /BrowserMultiFormatReader/);
  assert.match(scanner, /decodeFromVideoDevice/);
  assert.match(scanner, /Manual ticket code/);
  assert.match(queueApi, /\/queue\/current\/confirm\$\{locationQuery\}/);
});

test("vendor queue adds walk-in customers from the self-service card modal", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/pages/VendorDashboardPage.tsx"), "utf8");

  assert.match(source, /Open board[\s\S]*?Add walk-in/);
  assert.match(source, /className="customer-modal walk-in-modal"/);
  assert.match(source, /opened=\{walkInDialogOpen\}/);
  assert.match(source, /<form onSubmit=\{handleCreateWalkIn\}>/);
  assert.match(source, /autoFocus[\s\S]*?name="walkInCustomerName"/);
  assert.match(source, /setWalkInDialogOpen\(false\)[\s\S]*?showSuccessNotification\("Ticket issued"/);
  assert.doesNotMatch(source, /<Card className="neura-card" padding="lg">\s*<form onSubmit=\{handleCreateWalkIn\}>/);
});

test("vendor queue workspace uses a two-thirds and one-third desktop grid", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/pages/VendorDashboardPage.tsx"), "utf8");
  const queuePage = source.match(/function renderQueuePage\(\)[\s\S]*?function renderWalkInDialog/)?.[0] || "";

  assert.match(queuePage, /<Grid gutter="md">/);
  assert.match(queuePage, /<Grid\.Col span=\{\{ base: 12, lg: 8 \}\}>/);
  assert.match(queuePage, /<Grid\.Col span=\{\{ base: 12, lg: 4 \}\}>/);
  assert.doesNotMatch(queuePage, /<SimpleGrid cols=\{\{ base: 1, lg: 2 \}\}/);
});

test("registered customers can rate a served queue visit from the ticket page", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/pages/JoinedQueuePage.tsx"), "utf8");

  assert.match(source, /snapshot\?\.focusTicket\?\.status !== "served"/);
  assert.match(source, /`\/account\/tickets\/\$\{encodeURIComponent\(lookupCode\)\}\/rating`/);
  assert.match(source, /queueRatingStatus\?\.eligible/);
  assert.match(source, />\s*Rate vendor\s*</);
  assert.match(source, /className="customer-modal queue-rating-modal"/);
  assert.match(source, /className="queue-rating-modal-shell"/);
  assert.match(source, /className="queue-rating-modal-main"/);
  assert.match(source, /className="customer-modal-actions queue-rating-modal-actions"/);
  assert.match(source, /<FiveStarRatingInput/);
  assert.match(source, /label="Optional public comment"/);
  assert.match(source, /maxLength=\{1000\}/);
  assert.match(source, />\s*Rating submitted\s*</);
});

test("vendor logout stays aligned across plan and tenant label lengths", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const dashboard = fs.readFileSync(path.join(frontendRoot, "src", "pages", "VendorDashboardPage.tsx"), "utf8");
  const styles = fs.readFileSync(path.join(frontendRoot, "src", "styles.css"), "utf8");

  assert.match(dashboard, /<Group align="flex-start" justify="space-between" gap="sm" wrap="nowrap">\s*<div className="neura-sidebar-account-copy">/);
  assert.match(styles, /\.neura-sidebar-account-copy \{\s+flex: 1 1 auto;\s+min-width: 0;/);
  assert.match(styles, /\.neura-sidebar-logout \{\s+flex: 0 0 auto;/);
});

test("vendor security supports password changes and role-aware MFA management", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const dashboard = fs.readFileSync(path.join(frontendRoot, "src", "pages", "VendorDashboardPage.tsx"), "utf8");
  const operations = fs.readFileSync(path.join(frontendRoot, "src", "api", "vendorDashboardOperations.ts"), "utf8");

  assert.match(dashboard, /<Title order=\{3\}>Change password<\/Title>/);
  assert.match(dashboard, /<Title order=\{3\}>Multi-factor authentication<\/Title>/);
  assert.match(dashboard, /name="currentPassword"/);
  assert.match(dashboard, /name="newPassword"/);
  assert.match(dashboard, /await changePassword\(passwordForm\)/);
  assert.match(dashboard, /Replace authenticator/);
  assert.match(dashboard, /!mfaRequired[\s\S]*?>Remove MFA<\/Button>/);
  assert.match(operations, /\/auth\/mfa\/step-up/);
  assert.match(operations, /\/auth\/mfa\/disable/);
});

test("landing pricing uses the server-owned four-plan tier list", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/pages/LandingPage.tsx"), "utf8");
  assert.match(source, /apiRequest<BillingOverviewResponse>\("\/billing\/plans"\)/);
  assert.match(source, /free: "\/illustrations\/generated\/pricing-economical-transparent\.png"/);
  assert.match(source, /cols=\{\{ base: 1, sm: 2, xl: 4 \}\}/);
  assert.match(source, /plan\.included\.map/);
  assert.match(source, /className="prio-price-currency"/);
  assert.match(source, /className="prio-price-amount"/);
  assert.match(source, /className="prio-price-period">\/mo/);
  assert.match(source, /monthlyPriceFormatter\.format\(plan\.price\.monthlyAmountCents \/ 100\)/);
  assert.match(source, /plan\.slug === "enterprise"[\s\S]*?Starts at \{plan\.price\.currency\}/);
  assert.match(source, /getPlanPriceDisplay\(plan\)/);
  assert.match(source, /plan\.slug === "free" \? "Start free"/);
  assert.doesNotMatch(source, /const pricingPlans = \[/);
  assert.doesNotMatch(source, /"500 tickets\/mo"/);
});

test("enterprise inquiries use protected intake and a bounded autosizing message", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(frontendRoot, "src", "pages", "LandingPage.tsx"), "utf8");
  const styles = fs.readFileSync(path.join(frontendRoot, "src", "styles.css"), "utf8");

  assert.match(source, /const enterpriseMessageMaxLength = 1000/);
  assert.match(source, /autosize[\s\S]*?maxLength=\{enterpriseMessageMaxLength\}[\s\S]*?maxRows=\{10\}[\s\S]*?minRows=\{4\}/);
  assert.match(source, /enterpriseForm\.message\.length\}\/\{enterpriseMessageMaxLength\} characters/);
  assert.match(source, /name="honeypot"/);
  assert.match(source, /VITE_TURNSTILE_SITE_KEY/);
  assert.match(source, /turnstileToken: ""/);
  assert.match(source, /Protected by anti-abuse verification and rate limiting/);
  assert.match(styles, /\.enterprise-message-input \{[\s\S]*?padding-bottom: 2\.15rem/);
  assert.match(styles, /\.enterprise-message-counter \{[\s\S]*?position: absolute/);
});

test("vendor usage cards report queue email journeys instead of legacy deliveries", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const dashboard = fs.readFileSync(path.join(frontendRoot, "src", "pages", "VendorDashboardPage.tsx"), "utf8");
  const bootstrap = fs.readFileSync(path.join(frontendRoot, "src", "api", "vendorDashboardBootstrap.ts"), "utf8");

  assert.match(dashboard, /resources\.queueEmailJourneys/);
  assert.match(dashboard, /label="Email journeys"/);
  assert.match(dashboard, /Journeys started this period/);
  assert.match(dashboard, /Journey tracking pending rollout/);
  assert.doesNotMatch(dashboard, /Legacy delivery count/);
  assert.doesNotMatch(dashboard, /label="Email deliveries"/);
  assert.match(bootstrap, /getCapacityExperience/);
  assert.match(bootstrap, /\/billing\/capabilities/);
  assert.match(bootstrap, /\/billing\/tenant\/\$\{tenantSlug\}\/capacity/);
});
