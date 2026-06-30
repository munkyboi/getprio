const test = require("node:test");
const assert = require("node:assert/strict");

require("tsx/cjs");

const queueSnapshotHelpers = require("../src/services/queueSnapshotHelpers");

test("queue snapshot helpers resolve primary locations when none are specified", async () => {
  const originalRepo = require("../src/repositories/storeLocations");
  const originalTickets = require("../src/repositories/tickets");
  const originalClosures = require("../src/repositories/queueDayClosures");
  const originalPauses = require("../src/repositories/queueDayPauses");
  const originalTheme = require("../src/repositories/publicBoardThemes");
  const originalQueueFeeService = require("../src/services/queueFeeService");
  const originalHours = require("../src/services/storeHoursService");

  let primaryCalls = 0;
  let lookupCalls = 0;

  originalRepo.findPrimaryLocationByTenantId = async () => {
    primaryCalls += 1;
    return { _id: 1, tenantId: 10, slug: "main", timezone: "Asia/Manila", isPrimary: true, isActive: true };
  };
  originalRepo.findLocationByTenantAndSlug = async () => null;
  originalRepo.findLocationById = async () => null;
  originalRepo.listHoursByLocationId = async () => [];
  originalTickets.findTicketByTenantAndLookupCode = async () => {
    lookupCalls += 1;
    return null;
  };
  originalTickets.findCurrentCalledTicket = async () => null;
  originalTickets.listWaitingTickets = async () => [];
  originalTickets.listSkippedTickets = async () => [];
  originalTickets.listHistoryTickets = async () => [];
  originalTickets.countServedToday = async () => 0;
  originalClosures.findActiveClosure = async () => null;
  originalPauses.findActivePause = async () => null;
  originalTheme.getResolvedTheme = async () => null;
  originalQueueFeeService.getQueueFeeForTenant = async () => ({ amount: 0 });
  originalQueueFeeService.getActiveTenantSubscription = async () => null;
  originalHours.getOpenStatus = async () => ({ isOpen: true, timezone: "Asia/Manila", summary: "Open", today: null, nextOpenAt: null });

  const result = await queueSnapshotHelpers.buildQueueSnapshot(
    { _id: 10, name: "Tenant", slug: "tenant", averageServiceMinutes: 10 },
    {},
    async () => ({ emailsSentThisPeriod: 0 })
  );

  assert.equal(primaryCalls, 1);
  assert.equal(lookupCalls, 0);
  assert.equal(result.location.slug, "main");
});

test("queue snapshot helpers prefer a ticket location when lookup code resolves", async () => {
  const storeLocations = require("../src/repositories/storeLocations");
  const tickets = require("../src/repositories/tickets");
  const closures = require("../src/repositories/queueDayClosures");
  const pauses = require("../src/repositories/queueDayPauses");
  const theme = require("../src/repositories/publicBoardThemes");
  const queueFeeService = require("../src/services/queueFeeService");
  const hours = require("../src/services/storeHoursService");

  storeLocations.findPrimaryLocationByTenantId = async () => ({
    _id: 1,
    tenantId: 10,
    slug: "main",
    timezone: "Asia/Manila",
    isPrimary: true,
    isActive: true
  });
  storeLocations.findLocationByTenantAndSlug = async () => null;
  storeLocations.findLocationById = async (id) =>
    id === 2
      ? { _id: 2, tenantId: 10, slug: "branch", timezone: "Asia/Manila", isPrimary: false, isActive: true }
      : null;
  storeLocations.listHoursByLocationId = async () => [];
  tickets.findTicketByTenantAndLookupCode = async () => ({
    _id: 99,
    tenantId: 10,
    locationId: 2,
    dateKey: "20260630",
    lookupCode: "ABC123",
    ticketNumber: "Q001",
    customerName: "Jane",
    status: "waiting",
    createdAt: new Date("2026-06-30T00:00:00Z")
  });
  tickets.findCurrentCalledTicket = async () => null;
  tickets.listWaitingTickets = async () => [];
  tickets.listSkippedTickets = async () => [];
  tickets.listHistoryTickets = async () => [];
  tickets.countServedToday = async () => 0;
  closures.findActiveClosure = async () => null;
  pauses.findActivePause = async () => null;
  theme.getResolvedTheme = async () => null;
  queueFeeService.getQueueFeeForTenant = async () => ({ amount: 0 });
  queueFeeService.getActiveTenantSubscription = async () => null;
  hours.getOpenStatus = async () => ({ isOpen: true, timezone: "Asia/Manila", summary: "Open", today: null, nextOpenAt: null });

  const result = await queueSnapshotHelpers.buildQueueSnapshot(
    { _id: 10, name: "Tenant", slug: "tenant", averageServiceMinutes: 10 },
    { lookupCode: "abc123" },
    async () => ({ emailsSentThisPeriod: 0 })
  );

  assert.equal(result.location.slug, "branch");
  assert.equal(result.focusTicket.lookupCode, "ABC123");
  assert.equal(result.focusTicket.position, null);
});
