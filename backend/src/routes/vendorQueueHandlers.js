const { assertPublicTextFieldsAllowed } = require("../services/contentModeration");

async function handleCreateTicket({
  req,
  res,
  getAuthorizedTenant,
  assertTenantPermission,
  getLocationForTenant,
  createTicket
}) {
  const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
  assertTenantPermission(req.user, tenant._id, "tenant.queue.operate");
  const location = await getLocationForTenant(tenant, req.body.locationSlug || req.query.location);
  const { customerName, customerEmail, customerPhone, notifyByEmail, notifyBySms, notes } = req.body;

  if (!customerName) {
    const error = new Error("customerName is required.");
    error.statusCode = 400;
    throw error;
  }
  assertPublicTextFieldsAllowed({ "Customer name": customerName, Notes: notes });

  const result = await createTicket({
    tenant,
    location,
    customerName,
    customerEmail,
    customerPhone,
    notifyByEmail,
    notifyBySms,
    joinChannel: "vendor",
    notes,
    actorUserId: req.user?._id,
    actorRole: "vendor"
  });

  res.status(201).json({
    ticket: {
      id: String(result.ticket._id),
      ticketNumber: result.ticket.ticketNumber,
      lookupCode: result.ticket.lookupCode,
      status: result.ticket.status
    },
    snapshot: result.snapshot
  });
}

module.exports = {
  handleCreateTicket
};
