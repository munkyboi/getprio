const PDFDocument = require("pdfkit");
const { normalizeCounterSlug, normalizeTenantNotificationSettings } = require("./vendorRouteHelpers");

const HISTORY_RANGE_DAYS = {
  today: 0,
  week: 7,
  month: 30,
  quarter: 90,
  year: 365
};

function toCsvValue(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

async function handleUpdateSettings({ req, res, getAuthorizedTenant, assertTenantPermission, getLocationForTenant, tenantRepository, getQueueSnapshot }) {
  const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
  assertTenantPermission(req.user, tenant._id, "tenant.settings.manage");
  await getLocationForTenant(tenant, req.query.location);
  const { queuePrefix, averageServiceMinutes, notificationThreshold, autoPauseEnabled, autoPauseThreshold, autoResumeEnabled, autoResumeVacancyPercent, contactEmail, contactPhone } = req.body;
  const wantsToChangeContactDetails = typeof contactEmail === "string" || typeof contactPhone === "string";
  if (wantsToChangeContactDetails) {
    assertTenantPermission(req.user, tenant._id, "tenant.settings.manage_contact");
  }
  const normalizedAutoPauseEnabled = Boolean(autoPauseEnabled);
  const normalizedAutoPauseThreshold = normalizedAutoPauseEnabled ? Math.max(1, Number(autoPauseThreshold || 1)) : null;
  const normalizedAutoResumeEnabled = normalizedAutoPauseEnabled && Boolean(autoResumeEnabled);
  const normalizedAutoResumeVacancyPercent = normalizedAutoResumeEnabled ? Math.max(5, Math.min(50, Number(autoResumeVacancyPercent || 20))) : null;
  const updatedTenant = await tenantRepository.updateTenant(tenant._id, {
    queuePrefix: queuePrefix ? String(queuePrefix).slice(0, 4).toUpperCase() : tenant.queuePrefix,
    averageServiceMinutes: averageServiceMinutes ? Number(averageServiceMinutes) : tenant.averageServiceMinutes,
    notificationThreshold: notificationThreshold ? Number(notificationThreshold) : tenant.notificationThreshold,
    autoPauseEnabled: normalizedAutoPauseEnabled,
    autoPauseThreshold: normalizedAutoPauseThreshold,
    autoResumeEnabled: normalizedAutoResumeEnabled,
    autoResumeVacancyPercent: normalizedAutoResumeVacancyPercent,
    contactEmail: typeof contactEmail === "string" ? contactEmail : tenant.contactEmail,
    contactPhone: typeof contactPhone === "string" ? contactPhone : tenant.contactPhone
  });
  res.json({ tenant: { id: String(updatedTenant._id), name: updatedTenant.name, slug: updatedTenant.slug, queuePrefix: updatedTenant.queuePrefix, averageServiceMinutes: updatedTenant.averageServiceMinutes, notificationThreshold: updatedTenant.notificationThreshold, autoPauseEnabled: updatedTenant.autoPauseEnabled, autoPauseThreshold: updatedTenant.autoPauseThreshold, autoResumeEnabled: updatedTenant.autoResumeEnabled, autoResumeVacancyPercent: updatedTenant.autoResumeVacancyPercent, contactEmail: updatedTenant.contactEmail, contactPhone: updatedTenant.contactPhone }, snapshot: await getQueueSnapshot(updatedTenant, { location: await getLocationForTenant(updatedTenant, req.query.location) }) });
}

async function handleGetNotificationSettings({ req, res, getAuthorizedTenant, assertTenantPermission }) {
  const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
  assertTenantPermission(req.user, tenant._id, "tenant.settings.manage");
  res.json({ notificationSettings: normalizeTenantNotificationSettings(tenant.notificationSettings) });
}

async function handleUpdateNotificationSettings({ req, res, getAuthorizedTenant, assertTenantPermission, tenantRepository }) {
  const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
  assertTenantPermission(req.user, tenant._id, "tenant.settings.manage");
  const notificationSettings = normalizeTenantNotificationSettings(req.body || {});
  const updatedTenant = await tenantRepository.updateTenant(tenant._id, { notificationSettings });
  res.json({ notificationSettings: normalizeTenantNotificationSettings(updatedTenant.notificationSettings) });
}

async function handleListHistory({ req, res, getAuthorizedTenant, assertTenantPermission, getLocationForTenant, billingService, ticketRepository }) {
  const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
  assertTenantPermission(req.user, tenant._id, "tenant.reports.read");
  const location = await getLocationForTenant(tenant, req.query.location);
  const limit = Math.min(Number(req.query.limit || 20), 50);
  const entitlements = await billingService.getTenantEntitlements(tenant._id);
  const tickets = await ticketRepository.listHistoryTickets(tenant._id, { limit, historyDays: entitlements.historyDays, locationId: location?._id });
  res.json({ historyDays: entitlements.historyDays, historyLabel: entitlements.historyLabel, tickets: tickets.map((ticket) => ({ id: String(ticket._id), lookupCode: ticket.lookupCode, ticketNumber: ticket.ticketNumber, customerName: ticket.customerName, status: ticket.status, updatedAt: ticket.updatedAt, rejoinDeadlineAt: ticket.rejoinDeadlineAt || null, servicePriorityBand: ticket.servicePriorityBand || "normal" })) });
}

async function handleListClients({ req, res, getAuthorizedTenant, assertTenantPermission, getLocationForTenant, billingService, ticketRepository }) {
  const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
  assertTenantPermission(req.user, tenant._id, "tenant.reports.read");
  const location = await getLocationForTenant(tenant, req.query.location);
  const entitlements = await billingService.getTenantEntitlements(tenant._id);
  const tickets = await ticketRepository.listClientTickets(tenant._id, { limit: 500, historyDays: entitlements.historyDays, locationId: location?._id });
  const clientsByKey = new Map();
  tickets.forEach((ticket) => {
    const email = ticket.customerEmail || "";
    const phone = ticket.customerPhone || "";
    const name = ticket.customerName || "Unknown customer";
    const key = (email || phone || name).trim().toLowerCase();
    if (!key) return;
    const existing = clientsByKey.get(key);
    if (existing) {
      existing.visitCount += 1;
      existing.notifyByEmail = existing.notifyByEmail || Boolean(ticket.notifyByEmail);
      existing.notifyBySms = existing.notifyBySms || Boolean(ticket.notifyBySms);
      return;
    }
    clientsByKey.set(key, { id: key, customerName: name, customerEmail: email, customerPhone: phone, visitCount: 1, latestTicketNumber: ticket.ticketNumber, latestStatus: ticket.status, latestVisitAt: ticket.updatedAt, notifyByEmail: Boolean(ticket.notifyByEmail), notifyBySms: Boolean(ticket.notifyBySms) });
  });
  res.json({ historyDays: entitlements.historyDays, historyLabel: entitlements.historyLabel, clients: Array.from(clientsByKey.values()) });
}

async function handleListCounters({ req, res, getAuthorizedTenant, assertTenantPermission, getLocationForTenant, billingService, serviceCounterRepository }) {
  const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
  assertTenantPermission(req.user, tenant._id, "tenant.queue.read");
  const location = await getLocationForTenant(tenant, req.query.location);
  const entitlements = await billingService.getTenantEntitlements(tenant._id);
  const counters = await serviceCounterRepository.listCountersByLocationId(location._id);
  res.json({ counterLimit: entitlements.counters || 0, counters: counters.map((counter) => ({ id: counter._id, tenantId: counter.tenantId, locationId: counter.locationId, name: counter.name, slug: counter.slug, isActive: counter.isActive, assignedUserIds: counter.assignedUserIds })) });
}

async function handleUpdateCounter({ req, res, getAuthorizedTenant, assertTenantPermission, getLocationForTenant, billingService, serviceCounterRepository, getCounterForLocation }) {
  const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
  assertTenantPermission(req.user, tenant._id, "tenant.counter.manage");
  const location = await getLocationForTenant(tenant, req.query.location);
  const counter = await getCounterForLocation(location, req.params.counterSlug);
  const entitlements = await billingService.getTenantEntitlements(tenant._id);
  const counters = await serviceCounterRepository.listCountersByLocationId(location._id);
  if (req.body.isActive === true && !counter.isActive && counters.filter((item) => item.isActive).length >= Number(entitlements.counters || 0)) {
    const error = new Error("Counter limit exceeded for this subscription plan.");
    error.statusCode = 403;
    throw error;
  }
  const slug = normalizeCounterSlug(req.body.slug || req.body.name);
  const updatedCounter = await serviceCounterRepository.updateCounter(counter._id, { name: req.body.name, slug, isActive: req.body.isActive !== false });
  await serviceCounterRepository.replaceAssignments(updatedCounter._id, req.body.assignedUserIds || []);
  res.json({ counter: updatedCounter });
}

async function handleDeleteCounter({ req, res, getAuthorizedTenant, assertTenantPermission, getLocationForTenant, serviceCounterRepository, getCounterForLocation }) {
  const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
  assertTenantPermission(req.user, tenant._id, "tenant.counter.manage");
  const location = await getLocationForTenant(tenant, req.query.location);
  const counter = await getCounterForLocation(location, req.params.counterSlug);
  await serviceCounterRepository.deleteCounter(counter._id);
  res.status(204).send();
}

async function handleListStaff({ req, res, getAuthorizedTenant, assertTenantPermission, billingService, userRepository, serviceCounterRepository }) {
  const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
  assertTenantPermission(req.user, tenant._id, "tenant.staff.read");
  const entitlements = await billingService.getTenantEntitlements(tenant._id);
  const staff = await userRepository.listUsersByTenantId(tenant._id);
  const assignedCountersByUserId = await serviceCounterRepository.listAssignedCounterIdsByUserIds(staff.map((user) => user._id));
  res.json({ staffSeatLimit: entitlements.staffSeats || 0, staff: staff.map((user) => { const membership = user.tenantMemberships.find((item) => String(item.tenantId) === String(tenant._id)); return { id: user._id, name: user.name, email: user.email, phone: user.phone, role: membership?.role || "staff", isActive: membership?.isActive !== false, assignedCounterIds: assignedCountersByUserId.get(String(user._id)) || [] }; }) });
}

async function handleInviteStaff({ req, res, getAuthorizedTenant, assertTenantPermission, billingService, userRepository }) {
  const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
  assertTenantPermission(req.user, tenant._id, "tenant.staff.invite");
  const entitlements = await billingService.getTenantEntitlements(tenant._id);
  const staff = await userRepository.listUsersByTenantId(tenant._id);
  if (staff.length >= Number(entitlements.staffSeats || 0)) { const error = new Error("Staff seat limit exceeded for this subscription plan."); error.statusCode = 403; throw error; }
  const email = String(req.body.email || "").trim().toLowerCase();
  if (!email) { const error = new Error("email is required."); error.statusCode = 400; throw error; }
  const user = await userRepository.findUserByEmail(email);
  if (!user) { const error = new Error("Staff must already have a GetPrio account before being added."); error.statusCode = 404; throw error; }
  const nextRole = ["owner", "admin", "staff"].includes(req.body.role) ? req.body.role : "staff";
  const requesterMembership = req.user.tenantMemberships?.find((item) => String(item.tenantId) === String(tenant._id) && item.isActive !== false);
  const requesterRole = requesterMembership?.role || null;
  const ownerCount = staff.filter((member) => member.tenantMemberships.some((item) => String(item.tenantId) === String(tenant._id) && item.role === "owner" && item.isActive !== false)).length;
  if (requesterRole === "admin" && nextRole !== "staff") { const error = new Error("Tenant admins can only invite staff members."); error.statusCode = 403; throw error; }
  if ((nextRole === "admin" || nextRole === "owner") && requesterRole !== "owner") { const error = new Error("Only tenant owners can assign admin or owner roles."); error.statusCode = 403; throw error; }
  if (nextRole === "owner" && ownerCount >= 1) { const error = new Error("Only one tenant owner is allowed per vendor."); error.statusCode = 400; throw error; }
  await userRepository.addTenantMembership(user._id, tenant._id, nextRole);
  res.status(201).json({ userId: user._id });
}

module.exports = { handleUpdateSettings, handleGetNotificationSettings, handleUpdateNotificationSettings, handleListHistory, handleListClients, handleListCounters, handleUpdateCounter, handleDeleteCounter, handleListStaff, handleInviteStaff, toCsvValue, HISTORY_RANGE_DAYS, PDFDocument };
