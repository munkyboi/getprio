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
  originalTickets.findCurrentCalledTicket = async () => ({ _id: 42, joinChannel: "vendor", customerConfirmedAt: null });
  originalTickets.listWaitingTickets = async () => [];
  originalTickets.listPendingCarryOverTickets = async () => [];
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
  assert.equal(result.current.joinChannel, "vendor");
  assert.equal(result.current.customerConfirmedAt, null);
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
    customerConfirmedAt: new Date("2026-06-30T00:05:00Z"),
    servicePriorityBand: "carry_over",
    carryOverCount: 1,
    createdAt: new Date("2026-06-30T00:00:00Z")
  });
  tickets.findCurrentCalledTicket = async () => null;
  tickets.listWaitingTickets = async () => [];
  tickets.listPendingCarryOverTickets = async () => [];
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
  assert.equal(result.focusTicket.isCarriedOver, true);
  assert.equal(result.focusTicket.carryOverCount, 1);
  assert.equal(result.focusTicket.servicePriorityBand, "carry_over");
  assert.equal(result.focusTicket.customerConfirmedAt.toISOString(), "2026-06-30T00:05:00.000Z");
});

test("queue snapshot overflow includes tickets saved for future carry-over", async () => {
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
  storeLocations.findLocationById = async () => null;
  storeLocations.listHoursByLocationId = async () => [];
  tickets.findTicketByTenantAndLookupCode = async () => null;
  tickets.findCurrentCalledTicket = async () => null;
  tickets.listWaitingTickets = async (_tenantId, options = {}) => options.onlyCarriedOver ? [{
    _id: 10,
    tenantId: 10,
    locationId: 1,
    ticketNumber: "VD003",
    customerName: "Activated Customer",
    status: "waiting",
    carriedOverAt: new Date("2026-08-01T01:00:00.000Z"),
    carryOverCount: 1,
    servicePriorityBand: "carry_over",
    createdAt: new Date("2026-07-31T10:00:00.000Z")
  }] : [];
  tickets.listPendingCarryOverTickets = async () => [{
    _id: 9,
    tenantId: 10,
    locationId: 1,
    lookupCode: "3912FF7E",
    ticketNumber: "VD002",
    customerName: "Alex Boyer",
    status: "pending_carry_over",
    carryOverExpiresAt: new Date("2026-08-07T17:00:06.389Z"),
    createdAt: new Date("2026-07-31T09:51:13.885Z")
  }];
  tickets.listSkippedTickets = async () => [];
  tickets.listHistoryTickets = async () => [];
  tickets.countServedToday = async () => 0;
  closures.findActiveClosure = async () => null;
  pauses.findActivePause = async () => null;
  theme.getResolvedTheme = async () => null;
  queueFeeService.getQueueFeeForTenant = async () => ({ amount: 0 });
  queueFeeService.getActiveTenantSubscription = async () => null;
  hours.getOpenStatus = async () => ({ isOpen: false, timezone: "Asia/Manila", summary: "Closed", today: null, nextOpenAt: null });

  const result = await queueSnapshotHelpers.buildQueueSnapshot(
    { _id: 10, name: "Tenant", slug: "tenant", averageServiceMinutes: 10 },
    {},
    async () => ({ emailsSentThisPeriod: 0 })
  );

  assert.equal(result.overflow.length, 2);
  assert.equal(result.overflow[0].lookupCode, undefined);
  assert.equal(result.overflow[0].ticketNumber, "VD002");
  assert.equal(result.overflow[0].status, "pending_carry_over");
  assert.equal(result.overflow[0].isCarriedOver, false);
  assert.equal(result.overflow[0].position, null);
  assert.equal(result.overflow[0].carryOverExpiresAt.toISOString(), "2026-08-07T17:00:06.389Z");
  assert.equal(result.overflow[1].ticketNumber, "VD003");
  assert.equal(result.overflow[1].status, "waiting");
  assert.equal(result.overflow[1].isCarriedOver, true);
  assert.equal(result.overflow[1].position, 1);
});
