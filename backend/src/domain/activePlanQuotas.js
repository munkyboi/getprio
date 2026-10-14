function activeEntitlements(values) {
  const entitlements = { ...values };
  delete entitlements.monthlyQueueEmailJourneys;
  delete entitlements.monthlyTransactionalEmails;
  return entitlements;
}

function activeAllowances(values) {
  return Object.fromEntries(Object.entries(values || {}).filter(([key]) => key !== 'queueEmailJourneys'));
}

module.exports = { activeAllowances, activeEntitlements };
